#!/usr/bin/env node
/**
 * 趋势跟踪系统 - 识别加密货币趋势
 * 
 * 使用：
 * - 简单移动平均线（SMA）
 * - 价格动量
 * - 波动率突破
 */

const https = require('https');

// 获取历史价格数据（从Coinbase）
async function getHistoricalPrices(ticker, hours = 24) {
  return new Promise((resolve) => {
    const url = `https://api.coinbase.com/v2/prices/${ticker}-USD/historic?period=hour`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const prices = json.data?.prices || [];
          
          // 转换为数字数组（最近24小时）
          const priceList = prices
            .slice(0, hours)
            .map(p => parseFloat(p.price))
            .reverse();
          
          resolve(priceList);
        } catch (e) {
          console.error(`Failed to parse ${ticker} history:`, e.message);
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

// 计算简单移动平均线
function calculateSMA(prices, period) {
  if (prices.length < period) return null;
  
  const slice = prices.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / period;
}

// 计算价格动量
function calculateMomentum(prices, period = 4) {
  if (prices.length < period) return 0;
  
  const currentPrice = prices[prices.length - 1];
  const pastPrice = prices[prices.length - period];
  
  return ((currentPrice - pastPrice) / pastPrice) * 100;
}

// 计算波动率
function calculateVolatility(prices, period = 24) {
  if (prices.length < period) return 0;
  
  const slice = prices.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  
  const variance = slice.reduce((sum, price) => {
    return sum + Math.pow(price - mean, 2);
  }, 0) / period;
  
  return Math.sqrt(variance);
}

// 主函数：分析趋势
async function analyzeTrend(ticker) {
  const prices = await getHistoricalPrices(ticker, 24);
  
  if (prices.length < 12) {
    return {
      ticker,
      trend: 'UNKNOWN',
      strength: 0,
      confidence: 0,
      reason: 'Insufficient data',
    };
  }
  
  const currentPrice = prices[prices.length - 1];
  
  // 计算指标
  const sma_4h = calculateSMA(prices, 4);
  const sma_12h = calculateSMA(prices, 12);
  const sma_24h = calculateSMA(prices, 24);
  const momentum_4h = calculateMomentum(prices, 4);
  const momentum_12h = calculateMomentum(prices, 12);
  const volatility = calculateVolatility(prices, 24);
  
  // 趋势判断
  let trend = 'NEUTRAL';
  let strength = 0;
  let signals = [];
  
  // 1. 移动平均线排列
  if (sma_4h && sma_12h && sma_24h) {
    if (sma_4h > sma_12h && sma_12h > sma_24h) {
      signals.push({ type: 'MA_BULLISH', weight: 0.3 });
    } else if (sma_4h < sma_12h && sma_12h < sma_24h) {
      signals.push({ type: 'MA_BEARISH', weight: -0.3 });
    }
  }
  
  // 2. 价格相对SMA
  if (sma_12h) {
    const deviation = ((currentPrice - sma_12h) / sma_12h) * 100;
    if (deviation > 2) {
      signals.push({ type: 'PRICE_ABOVE_SMA', weight: 0.2 });
    } else if (deviation < -2) {
      signals.push({ type: 'PRICE_BELOW_SMA', weight: -0.2 });
    }
  }
  
  // 3. 动量
  if (momentum_4h > 2) {
    signals.push({ type: 'MOMENTUM_POSITIVE', weight: 0.25 });
  } else if (momentum_4h < -2) {
    signals.push({ type: 'MOMENTUM_NEGATIVE', weight: -0.25 });
  }
  
  if (momentum_12h > 5) {
    signals.push({ type: 'STRONG_MOMENTUM', weight: 0.15 });
  } else if (momentum_12h < -5) {
    signals.push({ type: 'STRONG_DECLINE', weight: -0.15 });
  }
  
  // 4. 波动率突破
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const volatilityRatio = volatility / avgPrice;
  
  if (volatilityRatio > 0.02) {
    // 高波动率：趋势可能反转，降低信号强度
    signals.push({ type: 'HIGH_VOLATILITY', weight: -0.1 });
  }
  
  // 计算总强度
  strength = signals.reduce((sum, sig) => sum + sig.weight, 0);
  
  // 判断趋势方向
  if (strength > 0.3) {
    trend = 'BULLISH';
  } else if (strength < -0.3) {
    trend = 'BEARISH';
  } else {
    trend = 'NEUTRAL';
  }
  
  // 置信度（基于信号一致性）
  const bullishSignals = signals.filter(s => s.weight > 0).length;
  const bearishSignals = signals.filter(s => s.weight < 0).length;
  const totalSignals = signals.length;
  
  let confidence = 0;
  if (totalSignals > 0) {
    const consistency = Math.max(bullishSignals, bearishSignals) / totalSignals;
    confidence = consistency * Math.abs(strength);
  }
  
  return {
    ticker,
    trend,
    strength: Math.abs(strength),
    confidence: Math.min(1.0, confidence),
    momentum_4h,
    momentum_12h,
    volatility_ratio: volatilityRatio,
    signals: signals.map(s => s.type),
    timestamp: new Date().toISOString(),
  };
}

// 导出
module.exports = { analyzeTrend };

// 测试
if (require.main === module) {
  (async () => {
    console.log('🔍 Testing trend tracker...\n');
    
    const tickers = ['BTC', 'ETH', 'SOL'];
    
    for (const ticker of tickers) {
      const trend = await analyzeTrend(ticker);
      console.log(`${ticker}:`);
      console.log(`  Trend: ${trend.trend}`);
      console.log(`  Strength: ${trend.strength.toFixed(2)}`);
      console.log(`  Confidence: ${trend.confidence.toFixed(2)}`);
      console.log(`  Momentum (4h): ${trend.momentum_4h.toFixed(2)}%`);
      console.log(`  Signals: ${trend.signals.join(', ')}`);
      console.log('');
      
      await new Promise(r => setTimeout(r, 1000));
    }
  })();
}
