#!/usr/bin/env node
/**
 * dYdX 交易 UI 服务器
 * 提供 Web 界面进行手动交易
 */

const express = require('express');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// dYdX数据模块（链上数据）
const dydxData = require('./dydx_data');

// 持仓追踪器（记录开仓信息）
const positionTracker = require('./position_tracker');

const app = express();
const PORT = 3456;

// 解析 JSON body
app.use(express.json());
app.use(express.static(__dirname));

// 获取持仓
app.get('/api/position', async (req, res) => {
  try {
    const { stdout } = await execPromise('node decode_position.js', { cwd: __dirname });
    
    // 解析输出
    const lines = stdout.split('\n');
    const usdcMatch = stdout.match(/USDC 余额:\s+([\d.]+)/);
    const ethMatch = stdout.match(/数量:\s+([\d.]+)/);
    const sideMatch = stdout.match(/方向:\s+(\w+)/);
    
    const position = {
      usdc: usdcMatch ? parseFloat(usdcMatch[1]) : 0,
      eth: ethMatch ? parseFloat(ethMatch[1]) : 0,
      side: sideMatch ? sideMatch[1] : null,
      raw: stdout
    };
    
    res.json({ success: true, position });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 下市价单
app.post('/api/market-order', async (req, res) => {
  try {
    const { market, side, size } = req.body;
    
    if (!market || !side || !size) {
      return res.status(400).json({ success: false, error: '缺少参数' });
    }
    
    console.log(`市价单: ${side} ${size} ${market}`);
    
    const { stdout, stderr } = await execPromise(
      `node dydx_market_order.js ${market} ${side} ${size}`,
      { cwd: __dirname, timeout: 30000 }
    );
    
    // 提取交易哈希
    const hashMatch = stdout.match(/交易哈希:\s+(.+)/);
    const clientIdMatch = stdout.match(/客户端 ID:\s+(\d+)/);
    
    res.json({
      success: true,
      hash: hashMatch ? hashMatch[1] : null,
      clientId: clientIdMatch ? clientIdMatch[1] : null,
      output: stdout
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stderr: error.stderr
    });
  }
});

// 下限价单
app.post('/api/limit-order', async (req, res) => {
  try {
    const { market, side, price, size, postOnly } = req.body;
    
    if (!market || !side || !price || !size) {
      return res.status(400).json({ success: false, error: '缺少参数' });
    }
    
    const postOnlyStr = postOnly !== false ? 'true' : 'false';
    
    console.log(`限价单: ${side} ${size} ${market} @ $${price} (postOnly: ${postOnlyStr})`);
    
    const { stdout, stderr } = await execPromise(
      `node dydx_order_cli.js ${market} ${side} ${price} ${size} ${postOnlyStr}`,
      { cwd: __dirname, timeout: 30000 }
    );
    
    const hashMatch = stdout.match(/交易哈希:\s+(.+)/);
    const clientIdMatch = stdout.match(/客户端 ID:\s+(\d+)/);
    
    res.json({
      success: true,
      hash: hashMatch ? hashMatch[1] : null,
      clientId: clientIdMatch ? clientIdMatch[1] : null,
      output: stdout
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stderr: error.stderr
    });
  }
});

// 获取交易历史
app.get('/api/trade-history', async (req, res) => {
  try {
    // ✅ 从dYdX链上获取真实持仓和价格
    const status = await dydxData.getFullAccountStatus();
    
    // ✅ 合并链上持仓和本地开仓记录
    const mergedPositions = positionTracker.mergePositions(status.positions);
    
    // 转换BigInt为Number（JSON序列化需要）
    let trades = mergedPositions.map(pos => {
      const cleaned = { ...pos, status: 'OPEN', onchain: true };
      // 删除BigInt字段
      delete cleaned.sizeQuantums;
      return cleaned;
    });
    
    // 读取历史记录（已平仓 - 从本地文件读取）
    const fs = require('fs');
    const path = require('path');
    const historyFile = path.join(__dirname, 'data', 'trade_history.json');
    
    if (fs.existsSync(historyFile)) {
      const historyData = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
      trades = [...trades, ...historyData];
    }
    
    // 按时间倒序排序
    trades.sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));
    
    // 限制返回最近50条
    trades = trades.slice(0, 50);
    
    res.json({ 
      success: true, 
      trades, 
      count: trades.length,
      equity: status.equity,
      usedMargin: status.usedMargin,
      availableMargin: status.availableMargin,
      onchain: true 
    });
  } catch (error) {
    console.error('Failed to get trade history:', error);
    res.json({ success: false, error: error.message, trades: [] });
  }
});

// Net Worth历史数据API
app.get('/api/networth-history', (req, res) => {
  try {
    const networthTracker = require('./networth_tracker');
    const hours = parseInt(req.query.hours) || 24;
    const history = networthTracker.getRecentHours(hours);
    const stats = networthTracker.getStats();
    
    res.json({
      success: true,
      history,
      stats,
      count: history.length
    });
  } catch (error) {
    console.error('Failed to get networth history:', error);
    res.json({ success: false, error: error.message, history: [] });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 dYdX 交易 UI 已启动

📡 本地访问: http://127.0.0.1:${PORT}/trading_ui.html
📡 远程访问: http://<your-ip>:${PORT}/trading_ui.html

⚠️  监听所有网络接口 (0.0.0.0)
  `);
});
