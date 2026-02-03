#!/usr/bin/env node

/**
 * MySQL数据库访问层
 * 替代所有JSON文件存储
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// 数据库配置
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: 'dydx_trading',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00'
};

let pool = null;

/**
 * 初始化数据库连接池
 */
async function initDatabase() {
  try {
    // 创建连接池
    pool = mysql.createPool(DB_CONFIG);
    
    // 测试连接
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    
    console.log('✅ 数据库连接成功');
    return true;
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message);
    
    // 如果数据库不存在，尝试创建
    if (error.code === 'ER_BAD_DB_ERROR') {
      console.log('📦 数据库不存在，正在创建...');
      await createDatabase();
      return initDatabase(); // 递归重试
    }
    
    return false;
  }
}

/**
 * 创建数据库（首次运行）
 */
async function createDatabase() {
  try {
    // 不指定database，只连接MySQL
    const tempPool = mysql.createPool({
      ...DB_CONFIG,
      database: undefined
    });
    
    const conn = await tempPool.getConnection();
    
    // 创建数据库
    await conn.query('CREATE DATABASE IF NOT EXISTS dydx_trading DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    console.log('✅ 数据库创建成功');
    
    conn.release();
    await tempPool.end();
    
    // 执行schema.sql
    await executeSchema();
    
  } catch (error) {
    console.error('❌ 创建数据库失败:', error.message);
    throw error;
  }
}

/**
 * 执行schema.sql创建表结构
 */
async function executeSchema() {
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // 分割SQL语句（简单处理，忽略注释和空行）
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));
    
    const conn = await pool.getConnection();
    
    for (const statement of statements) {
      if (statement.toUpperCase().includes('CREATE') || 
          statement.toUpperCase().includes('INSERT') ||
          statement.toUpperCase().includes('VIEW')) {
        try {
          await conn.query(statement);
        } catch (err) {
          // 忽略已存在的错误
          if (!err.message.includes('already exists')) {
            console.error('执行SQL失败:', statement.substring(0, 50) + '...', err.message);
          }
        }
      }
    }
    
    conn.release();
    console.log('✅ 数据库表结构创建完成');
    
  } catch (error) {
    console.error('❌ 执行schema失败:', error.message);
    throw error;
  }
}

/**
 * 获取数据库连接
 */
function getPool() {
  if (!pool) {
    throw new Error('数据库未初始化，请先调用 initDatabase()');
  }
  return pool;
}

/**
 * ========================================
 * Scanned Blocks API
 * ========================================
 */

/**
 * 检查区块是否已扫描
 */
async function isBlockScanned(height) {
  const [rows] = await pool.query(
    'SELECT 1 FROM scanned_blocks WHERE height = ? LIMIT 1',
    [height]
  );
  return rows.length > 0;
}

/**
 * 标记区块为已扫描
 */
async function markBlockScanned(height, orderCount = 0) {
  await pool.query(
    'INSERT INTO scanned_blocks (height, has_orders, order_count) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE order_count = ?',
    [height, orderCount > 0, orderCount, orderCount]
  );
  
  // 更新扫描器状态
  await pool.query(
    `UPDATE scanner_state SET 
      last_processed_height = GREATEST(last_processed_height, ?),
      total_blocks_processed = total_blocks_processed + 1,
      total_fills_found = total_fills_found + ?,
      last_scan_at = NOW(),
      first_scan_at = COALESCE(first_scan_at, NOW())
    WHERE id = 1`,
    [height, orderCount]
  );
}

/**
 * ========================================
 * Fills API
 * ========================================
 */

/**
 * 保存订单/成交记录
 */
async function saveFill(fill) {
  try {
    await pool.query(
      `INSERT INTO fills 
        (height, block_time, ticker, market, side, quantums, subticks, 
         size, price, client_id, clob_pair_id, order_flags, time_in_force, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        size = VALUES(size),
        price = VALUES(price)`,
      [
        fill.height,
        fill.time || new Date(),
        fill.ticker,
        fill.market,
        fill.side,
        fill.quantums,
        fill.subticks,
        fill.size || null,
        fill.price || null,
        fill.clientId,
        fill.clobPairId,
        fill.orderFlags || 0,
        fill.timeInForce || 0,
        fill.source || 'REALTIME'
      ]
    );
    return true;
  } catch (error) {
    console.error('❌ 保存fill失败:', error.message);
    return false;
  }
}

/**
 * 批量保存订单
 */
async function saveFills(fills) {
  if (fills.length === 0) return 0;
  
  let saved = 0;
  for (const fill of fills) {
    if (await saveFill(fill)) {
      saved++;
    }
  }
  return saved;
}

/**
 * 获取最近的成交记录
 */
async function getRecentFills(limit = 100) {
  const [rows] = await pool.query(
    `SELECT 
      ticker, market, side, size, price, 
      block_time as createdAt, height, client_id as clientId,
      source, quantums, subticks
    FROM fills
    ORDER BY height DESC, id DESC
    LIMIT ?`,
    [limit]
  );
  return rows;
}

/**
 * 按ticker获取成交记录
 */
async function getFillsByTicker(ticker, limit = 50) {
  const [rows] = await pool.query(
    `SELECT * FROM fills
    WHERE ticker = ?
    ORDER BY height DESC, id DESC
    LIMIT ?`,
    [ticker, limit]
  );
  return rows;
}

/**
 * ========================================
 * Trades API
 * ========================================
 */

/**
 * 保存交易记录
 */
async function saveTrade(trade) {
  const [result] = await pool.query(
    `INSERT INTO trades 
      (ticker, side, size, entry_price, close_price, current_price,
       opened_at, closed_at, client_id, status, close_reason,
       pnl, pnl_percent, max_pnl_percent, signal_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      close_price = VALUES(close_price),
      current_price = VALUES(current_price),
      closed_at = VALUES(closed_at),
      status = VALUES(status),
      close_reason = VALUES(close_reason),
      pnl = VALUES(pnl),
      pnl_percent = VALUES(pnl_percent),
      max_pnl_percent = VALUES(max_pnl_percent)`,
    [
      trade.ticker,
      trade.side,
      trade.size,
      trade.entryPrice,
      trade.closePrice || null,
      trade.currentPrice || null,
      trade.openedAt,
      trade.closedAt || null,
      trade.clientId,
      trade.status,
      trade.closeReason || null,
      trade.pnl || null,
      trade.pnlPercent || null,
      trade.maxPnlPercent || null,
      trade.signalScore || null
    ]
  );
  return result.insertId;
}

/**
 * 获取活跃交易
 */
async function getActiveTrades() {
  const [rows] = await pool.query(
    `SELECT * FROM active_positions ORDER BY opened_at DESC`
  );
  return rows;
}

/**
 * 获取所有交易历史
 */
async function getAllTrades(limit = 100) {
  const [rows] = await pool.query(
    `SELECT * FROM trades ORDER BY opened_at DESC LIMIT ?`,
    [limit]
  );
  return rows;
}

/**
 * ========================================
 * Networth History API
 * ========================================
 */

/**
 * 记录净值
 */
async function recordNetworth(equity, usdcBalance, usedMargin, availableMargin, positionCount = 0) {
  await pool.query(
    `INSERT INTO networth_history 
      (timestamp, equity, usdc_balance, used_margin, available_margin, position_count)
    VALUES (NOW(), ?, ?, ?, ?, ?)`,
    [equity, usdcBalance, usedMargin, availableMargin, positionCount]
  );
}

/**
 * 获取最近N小时的净值历史
 */
async function getNetworthHistory(hours = 24) {
  const [rows] = await pool.query(
    `SELECT 
      timestamp,
      equity as netWorth,
      usdc_balance as usdcBalance,
      used_margin as usedMargin,
      available_margin as availableMargin,
      position_count as positionCount
    FROM networth_history
    WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? HOUR)
    ORDER BY timestamp ASC`,
    [hours]
  );
  return rows;
}

/**
 * 获取最新净值记录
 */
async function getLatestNetworth() {
  const [rows] = await pool.query(
    `SELECT * FROM networth_history
    ORDER BY timestamp DESC
    LIMIT 1`
  );
  return rows[0] || null;
}

/**
 * ========================================
 * Scanner State API
 * ========================================
 */

/**
 * 获取扫描器状态
 */
async function getScannerState() {
  const [rows] = await pool.query('SELECT * FROM scanner_state WHERE id = 1');
  return rows[0] || {
    last_processed_height: 0,
    total_blocks_processed: 0,
    total_fills_found: 0
  };
}

/**
 * 重置扫描器状态
 */
async function resetScannerState() {
  await pool.query(
    `UPDATE scanner_state SET 
      last_processed_height = 0,
      total_blocks_processed = 0,
      total_fills_found = 0,
      first_scan_at = NULL,
      last_scan_at = NULL
    WHERE id = 1`
  );
}

/**
 * ========================================
 * 关闭连接
 * ========================================
 */
async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✅ 数据库连接已关闭');
  }
}

module.exports = {
  // 初始化
  initDatabase,
  createDatabase,
  executeSchema,
  getPool,
  closeDatabase,
  
  // Blocks
  isBlockScanned,
  markBlockScanned,
  
  // Fills
  saveFill,
  saveFills,
  getRecentFills,
  getFillsByTicker,
  
  // Trades
  saveTrade,
  getActiveTrades,
  getAllTrades,
  
  // Networth
  recordNetworth,
  getNetworthHistory,
  getLatestNetworth,
  
  // Scanner State
  getScannerState,
  resetScannerState
};
