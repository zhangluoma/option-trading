#!/usr/bin/env node
/**
 * 市场扫描器 - 寻找交易机会
 * 
 * 功能：
 * 1. 扫描所有币种的价格变化
 * 2. 识别波动率突破
 * 3. 识别动量异常
 * 4. 识别成交量放大
 * 5. 生成热门机会列表
 */

const https = require('https');

// 获取多个币种的价格（Coinbase）
async function getMultiplePrices(tickers) {
  const promises = tickers.map(ticker => getPrice(ticker));
  return Promise.all(promises);
}

async function getPrice(ticker) {
  return new Promise((resolve) => {
    const url = `https://api.coinbase.com/v2/prices/${ticker}-USD/spot`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const price = parseFloat(json.data.amount);
          resolve({ ticker, price });
        } catch (e) {
          resolve({ ticker, price: null, error: e.message });
        }
      });
    }).on('error', () => resolve({ ticker, price: null }));
  });
}

// 获取24小时价格变化（Coinbase）
async function get24hChange(ticker) {
  return new Promise((resolve) => {
    // Coinbase没有直接的24h变化API，用历史数据计算
    const url = `https://api.coinbase.com/v2/prices/${ticker}-USD/historic?period=day`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const prices = json.data?.prices || [];
          
          if (prices.length < 2) {
            resolve({ ticker, change: 0, error: 'Insufficient data' });
            return;
          }
          
          const currentPrice = parseFloat(prices[0].price);
          const price24hAgo = parseFloat(prices[prices.length - 1].price);
          const change = ((currentPrice - price24hAgo) / price24hAgo) * 100;
          
          resolve({ ticker, change, currentPrice, price24hAgo });
        } catch (e) {
          resolve({ ticker, change: 0, error: e.message });
        }
      });
    }).on('error', () => resolve({ ticker, change: 0 }));
  });
}

// 扫描市场机会
async function scanMarket(tickers) {
  console.log(`🔍 Scanning ${tickers.length} markets...\n`);
  
  // 获取所有币种的24h变化
  const changes = await Promise.all(
    tickers.map(ticker => get24hChange(ticker))
  );
  
  // 排序：按绝对变化率
  const sorted = changes
    .filter(c => c.change !== undefined && !c.error)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  
  const opportunities = [];
  
  for (const item of sorted) {
    const absChange = Math.abs(item.change);
    
    // 识别机会类型
    let type = 'NORMAL';
    let score = 0;
    
    // 波动率突破：>5%变化
    if (absChange > 5) {
      type = 'BREAKOUT';
      score = 0.7 + (absChange / 20); // 最高1.0
    }
    // 中等波动：3-5%
    else if (absChange > 3) {
      type = 'MOMENTUM';
      score = 0.5 + (absChange / 20);
    }
    // 低波动：<3%
    else {
      type = 'STABLE';
      score = 0.3;
    }
    
    opportunities.push({
      ticker: item.ticker,
      type,
      score: Math.min(1.0, score),
      change_24h: item.change,
      direction: item.change > 0 ? 'UP' : 'DOWN',
      currentPrice: item.currentPrice,
    });
  }
  
  return opportunities;
}

// 找出最佳机会
function findTopOpportunities(opportunities, limit = 5) {
  return opportunities
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// 导出
module.exports = { scanMarket, findTopOpportunities };

// 测试
if (require.main === module) {
  const tickers = [
    'BTC', 'ETH', 'SOL', 'AVAX', 'DOGE',
    'MATIC', 'DOT', 'ATOM', 'LTC', 'LINK',
    'UNI', 'AAVE',
  ];
  
  (async () => {
    const opportunities = await scanMarket(tickers);
    const top = findTopOpportunities(opportunities, 5);
    
    console.log('🔥 Top 5 Opportunities:\n');
    
    top.forEach((opp, i) => {
      console.log(`${i + 1}. ${opp.ticker}`);
      console.log(`   Type: ${opp.type}`);
      console.log(`   Score: ${opp.score.toFixed(2)}`);
      console.log(`   24h Change: ${opp.change_24h.toFixed(2)}% ${opp.direction}`);
      console.log(`   Price: $${opp.currentPrice.toFixed(2)}`);
      console.log('');
    });
  })();
}
