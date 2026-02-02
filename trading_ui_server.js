#!/usr/bin/env node
/**
 * dYdX 交易 UI 服务器
 * 提供 Web 界面进行手动交易
 */

const express = require('express');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

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
    const fs = require('fs');
    const path = require('path');
    
    // 读取活跃持仓
    const positionsFile = path.join(__dirname, 'data', 'active_positions.json');
    const historyFile = path.join(__dirname, 'data', 'trade_history.json');
    
    let trades = [];
    
    // 读取活跃持仓
    if (fs.existsSync(positionsFile)) {
      const activeData = JSON.parse(fs.readFileSync(positionsFile, 'utf8'));
      
      // 为每个活跃持仓获取当前价格并计算盈亏
      for (const pos of activeData) {
        try {
          // 从Coinbase获取实时价格
          let currentPrice = pos.entryPrice;
          
          try {
            const { stdout } = await execPromise(`node get_current_price.js ${pos.ticker}`, {
              cwd: __dirname,
              timeout: 5000
            });
            const price = parseFloat(stdout.trim());
            if (!isNaN(price) && price > 0) {
              currentPrice = price;
            }
          } catch (e) {
            // 获取价格失败，使用开仓价
            console.error(`Failed to get price for ${pos.ticker}:`, e.message);
          }
          
          const pnl = pos.side === 'LONG'
            ? pos.size * (currentPrice - pos.entryPrice)
            : pos.size * (pos.entryPrice - currentPrice);
          
          trades.push({
            ...pos,
            status: 'OPEN',
            currentPrice,
            pnl,
            pnlPercent: (pnl / (pos.size * pos.entryPrice)) * 100
          });
        } catch (error) {
          console.error(`Failed to process position ${pos.ticker}:`, error);
        }
      }
    }
    
    // 读取历史记录（已平仓）
    if (fs.existsSync(historyFile)) {
      const historyData = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
      trades = [...trades, ...historyData];
    }
    
    // 按时间倒序排序
    trades.sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));
    
    // 限制返回最近50条
    trades = trades.slice(0, 50);
    
    res.json({ success: true, trades, count: trades.length });
  } catch (error) {
    console.error('Failed to get trade history:', error);
    res.json({ success: false, error: error.message, trades: [] });
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
