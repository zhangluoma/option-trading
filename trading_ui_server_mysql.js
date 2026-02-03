#!/usr/bin/env node

/**
 * Trading UI Server - MySQL版本
 * 从MySQL数据库读取所有数据
 */

require('dotenv').config();

const express = require('express');
const path = require('path');
const db = require('./database/db');
const dydx = require('./dydx_data_cached'); // 使用带缓存版本

const app = express();
const PORT = process.env.UI_PORT || 3456;

// 初始化数据库
let dbReady = false;
db.initDatabase().then(ready => {
  dbReady = ready;
  if (ready) {
    console.log('✅ MySQL数据库已连接');
  } else {
    console.error('❌ MySQL数据库连接失败');
  }
});

app.use(express.json());

/**
 * 主页 - 必须在静态文件之前定义
 */
app.get('/', (req, res) => {
  const fs = require('fs');
  const filePath = path.join(__dirname, 'trading_ui_enhanced.html');
  
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    res.type('html').send(html);
  } catch (error) {
    console.error('读取HTML失败:', error.message);
    res.status(500).send('Error loading page');
  }
});

// 静态文件 - 根目录（路由之后）
app.use(express.static(__dirname));

/**
 * API: 获取账户余额
 */
app.get('/api/balance', async (req, res) => {
  try {
    const balance = await dydx.getBalance();
    res.json({ success: true, balance });
  } catch (error) {
    res.json({ success: false, error: error.message, balance: null });
  }
});

/**
 * API: 获取仓位
 */
app.get('/api/positions', async (req, res) => {
  try {
    const positions = await dydx.getPositions();
    res.json({ success: true, positions });
  } catch (error) {
    res.json({ success: false, error: error.message, positions: [] });
  }
});

/**
 * API: 获取Fills（从MySQL）
 */
app.get('/api/fills', async (req, res) => {
  try {
    if (!dbReady) {
      return res.json({ success: false, error: 'Database not ready', fills: [] });
    }
    
    const limit = parseInt(req.query.limit) || 50;
    const fills = await db.getRecentFills(limit);
    
    res.json({
      success: true,
      fills,
      count: fills.length,
      source: 'MySQL'
    });
  } catch (error) {
    console.error('Failed to get fills:', error);
    res.json({ success: false, error: error.message, fills: [] });
  }
});

/**
 * API: 获取持仓（带均价）
 */
app.get('/api/positions-with-avg', async (req, res) => {
  try {
    if (!dbReady) {
      return res.json({ success: false, error: 'Database not ready', positions: [] });
    }
    
    // 从链上获取当前持仓
    const positions = await dydx.getPositions();
    
    // 对每个持仓，从MySQL获取fills计算均价
    const positionsWithAvg = [];
    
    for (const pos of positions) {
      const ticker = pos.market.replace('-USD', '');
      
      // 获取这个ticker的所有fills
      const fills = await db.getFillsByTicker(ticker, 100);
      
      // 计算均价（FIFO）
      let avgPrice = null;
      let totalCost = 0;
      let totalSize = 0;
      
      if (fills.length > 0) {
        // 简化计算：取所有同方向fills的加权平均
        const sameSideFills = fills.filter(f => {
          const isBuy = f.side === 'BUY';
          const isPosLong = parseFloat(pos.size) > 0;
          return isBuy === isPosLong;
        });
        
        for (const fill of sameSideFills) {
          if (fill.price && fill.size) {
            totalCost += fill.price * fill.size;
            totalSize += fill.size;
          }
        }
        
        if (totalSize > 0) {
          avgPrice = totalCost / totalSize;
        }
      }
      
      positionsWithAvg.push({
        ...pos,
        avgEntryPrice: avgPrice,
        fillCount: fills.length
      });
    }
    
    res.json({
      success: true,
      positions: positionsWithAvg,
      source: 'MySQL'
    });
  } catch (error) {
    console.error('Failed to get positions with avg:', error);
    res.json({ success: false, error: error.message, positions: [] });
  }
});

/**
 * API: 交易历史（从MySQL）
 */
app.get('/api/trades', async (req, res) => {
  try {
    if (!dbReady) {
      return res.json({ success: false, error: 'Database not ready', trades: [] });
    }
    
    const limit = parseInt(req.query.limit) || 100;
    const trades = await db.getAllTrades(limit);
    
    res.json({
      success: true,
      trades,
      count: trades.length,
      source: 'MySQL'
    });
  } catch (error) {
    console.error('Failed to get trades:', error);
    res.json({ success: false, error: error.message, trades: [] });
  }
});

/**
 * API: 扫描器状态（从MySQL）
 */
app.get('/api/scanner-status', async (req, res) => {
  try {
    if (!dbReady) {
      return res.json({ success: false, error: 'Database not ready' });
    }
    
    const state = await db.getScannerState();
    
    res.json({
      success: true,
      state,
      source: 'MySQL'
    });
  } catch (error) {
    console.error('Failed to get scanner status:', error);
    res.json({ success: false, error: error.message });
  }
});

/**
 * API: 净值历史（从MySQL）
 */
app.get('/api/networth-history', async (req, res) => {
  try {
    if (!dbReady) {
      return res.json({ success: false, error: 'Database not ready', history: [] });
    }
    
    const hours = parseInt(req.query.hours) || 24;
    const history = await db.getNetworthHistory(hours);
    
    // 计算统计
    const stats = {
      recordCount: history.length,
      latestEquity: history.length > 0 ? history[history.length - 1].netWorth : 0,
      oldestEquity: history.length > 0 ? history[0].netWorth : 0,
      change: 0,
      changePercent: 0
    };
    
    if (history.length > 1) {
      stats.change = stats.latestEquity - stats.oldestEquity;
      stats.changePercent = (stats.change / stats.oldestEquity) * 100;
    }
    
    res.json({
      success: true,
      history,
      stats,
      count: history.length,
      source: 'MySQL'
    });
  } catch (error) {
    console.error('Failed to get networth history:', error);
    res.json({ success: false, error: error.message, history: [] });
  }
});

/**
 * 启动服务器
 */
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🖥️  Trading UI Server (MySQL版本)');
  console.log('='.repeat(60));
  console.log(`📡 服务器运行在: http://localhost:${PORT}`);
  console.log(`💾 数据源: MySQL数据库`);
  console.log(`📊 API端点:`);
  console.log(`   /api/balance`);
  console.log(`   /api/positions`);
  console.log(`   /api/fills`);
  console.log(`   /api/positions-with-avg`);
  console.log(`   /api/trades`);
  console.log(`   /api/networth-history`);
  console.log(`   /api/scanner-status`);
  console.log('='.repeat(60));
});

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n⚠️  关闭服务器...');
  await db.closeDatabase();
  process.exit(0);
});
