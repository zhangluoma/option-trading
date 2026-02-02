#!/usr/bin/env node
/**
 * 复合信号生成器
 * 
 * 结合多个信号源：
 * 1. Sentiment信号（from database）
 * 2. Trend信号（from trend_tracker）
 * 3. 生成最终交易信号
 */

const { spawn } = require('child_process');
const { analyzeTrend } = require('./trend_tracker');
const path = require('path');

// 获取sentiment信号（调用Python脚本）
async function getSentimentSignal(ticker) {
  return new Promise((resolve, reject) => {
    const python = spawn('python3', [
      path.join(__dirname, 'get_signal.py'),
      ticker
    ]);
    
    let output = '';
    let error = '';
    
    python.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python script failed: ${error}`));
        return;
      }
      
      try {
        const signal = JSON.parse(output);
        resolve(signal);
      } catch (e) {
        reject(new Error(`Failed to parse signal: ${e.message}`));
      }
    });
  });
}

// 生成复合信号
async function getCompositeSignal(ticker) {
  try {
    // 并行获取两个信号
    const [sentimentSignal, trendSignal] = await Promise.all([
      getSentimentSignal(ticker).catch(e => ({
        signal_type: 'NEUTRAL',
        strength: 0,
        confidence: 0,
        error: e.message,
      })),
      analyzeTrend(ticker).catch(e => ({
        trend: 'NEUTRAL',
        strength: 0,
        confidence: 0,
        error: e.message,
      })),
    ]);
    
    // 信号映射
    const sentimentDirection = sentimentSignal.signal_type; // 'BUY', 'SELL', 'NEUTRAL'
    const trendDirection = trendSignal.trend; // 'BULLISH', 'BEARISH', 'NEUTRAL'
    
    // 转换trend为统一格式
    let trendSignalType = 'NEUTRAL';
    if (trendDirection === 'BULLISH') trendSignalType = 'BUY';
    if (trendDirection === 'BEARISH') trendSignalType = 'SELL';
    
    // 权重配置
    const SENTIMENT_WEIGHT = 0.6; // Sentiment权重60%
    const TREND_WEIGHT = 0.4;     // Trend权重40%
    
    // 计算加权分数
    let compositeScore = 0;
    let compositeDirection = 'NEUTRAL';
    
    // Sentiment贡献
    if (sentimentDirection === 'BUY') {
      compositeScore += sentimentSignal.strength * sentimentSignal.confidence * SENTIMENT_WEIGHT;
    } else if (sentimentDirection === 'SELL') {
      compositeScore -= sentimentSignal.strength * sentimentSignal.confidence * SENTIMENT_WEIGHT;
    }
    
    // Trend贡献
    if (trendSignalType === 'BUY') {
      compositeScore += trendSignal.strength * trendSignal.confidence * TREND_WEIGHT;
    } else if (trendSignalType === 'SELL') {
      compositeScore -= trendSignal.strength * trendSignal.confidence * TREND_WEIGHT;
    }
    
    // 判断最终方向
    if (compositeScore > 0.15) {
      compositeDirection = 'BUY';
    } else if (compositeScore < -0.15) {
      compositeDirection = 'SELL';
    } else {
      compositeDirection = 'NEUTRAL';
    }
    
    // 计算最终强度和置信度
    const finalStrength = Math.abs(compositeScore);
    
    // 置信度：两个信号方向一致时更高
    let finalConfidence = 0.5;
    if (sentimentDirection === trendSignalType && sentimentDirection !== 'NEUTRAL') {
      // 方向一致：高置信度
      finalConfidence = 0.7 + (finalStrength * 0.3);
    } else if (sentimentDirection === 'NEUTRAL' || trendSignalType === 'NEUTRAL') {
      // 一个信号中性：中等置信度
      finalConfidence = 0.5 + (finalStrength * 0.2);
    } else {
      // 方向相反：低置信度
      finalConfidence = 0.3 + (finalStrength * 0.1);
    }
    
    return {
      ticker,
      signal_type: compositeDirection,
      strength: Math.min(1.0, finalStrength),
      confidence: Math.min(1.0, finalConfidence),
      final_score: Math.min(1.0, finalStrength * finalConfidence),
      components: {
        sentiment: {
          direction: sentimentDirection,
          strength: sentimentSignal.strength,
          confidence: sentimentSignal.confidence,
          weight: SENTIMENT_WEIGHT,
        },
        trend: {
          direction: trendDirection,
          strength: trendSignal.strength,
          confidence: trendSignal.confidence,
          weight: TREND_WEIGHT,
          momentum_4h: trendSignal.momentum_4h,
        },
      },
      timestamp: new Date().toISOString(),
    };
    
  } catch (error) {
    return {
      ticker,
      signal_type: 'NEUTRAL',
      strength: 0,
      confidence: 0,
      final_score: 0,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

// 导出
module.exports = { getCompositeSignal };

// 测试
if (require.main === module) {
  (async () => {
    console.log('🎯 Testing composite signal generator...\n');
    
    const tickers = ['BTC', 'ETH', 'SOL'];
    
    for (const ticker of tickers) {
      const signal = await getCompositeSignal(ticker);
      
      console.log(`${ticker}:`);
      console.log(`  Signal: ${signal.signal_type}`);
      console.log(`  Strength: ${signal.strength.toFixed(2)}`);
      console.log(`  Confidence: ${signal.confidence.toFixed(2)}`);
      console.log(`  Final Score: ${signal.final_score.toFixed(2)}`);
      
      if (signal.components) {
        console.log(`  Components:`);
        console.log(`    - Sentiment: ${signal.components.sentiment.direction} (${signal.components.sentiment.strength.toFixed(2)})`);
        console.log(`    - Trend: ${signal.components.trend.direction} (${signal.components.trend.strength.toFixed(2)})`);
      }
      
      console.log('');
      
      await new Promise(r => setTimeout(r, 1000));
    }
  })();
}
