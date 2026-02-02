/**
 * 系统优化模块
 * 基于历史数据分析的优化策略
 */

// 币种评分系统（基于历史表现）
const TICKER_SCORES = {
  // 优秀表现
  BTC: 1.2,   // $31.36收益，2笔交易，表现最佳
  ATOM: 1.15, // $22.45收益，2笔交易，表现优异
  
  // 正常表现
  DOGE: 1.0,  // $8.05收益，2笔交易
  DOT: 1.0,   // $0.99收益，1笔交易
  AVAX: 0.95, // $0.90收益，2笔交易，收益偏低
  
  // 谨慎对待
  LINK: 0.7,  // -$1.50亏损，1笔交易，唯一亏损币种
  
  // 其他币种默认
  DEFAULT: 1.0,
};

// 获取币种评分
function getTickerScore(ticker) {
  return TICKER_SCORES[ticker] || TICKER_SCORES.DEFAULT;
}

// 方向相关配置
const DIRECTION_CONFIG = {
  LONG: {
    minSignal: 0.12,        // LONG表现优异，降低阈值
    minConfidence: 0.12,
    positionMultiplier: 1.2, // LONG加仓20%
    description: '做多策略（表现优异）',
  },
  SHORT: {
    minSignal: 0.20,        // SHORT表现较差，提高阈值
    minConfidence: 0.20,
    positionMultiplier: 0.8, // SHORT减仓20%
    requireTrendConfirmation: true, // 需要趋势确认
    description: '做空策略（谨慎对待）',
  },
};

// 获取方向配置
function getDirectionConfig(direction) {
  return DIRECTION_CONFIG[direction] || DIRECTION_CONFIG.LONG;
}

// 信号质量评估
function evaluateSignalQuality(ticker, direction, signal, trendStrength) {
  let adjustedSignal = signal;
  let reasons = [];
  
  // 1. 应用币种评分
  const tickerScore = getTickerScore(ticker);
  adjustedSignal *= tickerScore;
  
  if (tickerScore > 1.0) {
    reasons.push(`${ticker}历史表现优异(+${((tickerScore - 1) * 100).toFixed(0)}%)`);
  } else if (tickerScore < 1.0) {
    reasons.push(`${ticker}历史表现较差(${((tickerScore - 1) * 100).toFixed(0)}%)`);
  }
  
  // 2. 应用方向偏好
  const dirConfig = getDirectionConfig(direction);
  
  if (direction === 'LONG') {
    adjustedSignal *= 1.1; // LONG额外加成10%
    reasons.push('LONG策略加成(+10%)');
  } else if (direction === 'SHORT') {
    adjustedSignal *= 0.9; // SHORT额外减成10%
    reasons.push('SHORT策略减成(-10%)');
  }
  
  // 3. 趋势强度过滤
  if (trendStrength && trendStrength < 0.3) {
    adjustedSignal *= 0.7;
    reasons.push(`趋势较弱(${(trendStrength * 100).toFixed(0)}%, -30%)`);
  } else if (trendStrength && trendStrength > 0.7) {
    adjustedSignal *= 1.2;
    reasons.push(`趋势强劲(${(trendStrength * 100).toFixed(0)}%, +20%)`);
  }
  
  // 4. 检查是否满足方向阈值
  const meetsThreshold = adjustedSignal >= dirConfig.minSignal;
  
  return {
    originalSignal: signal,
    adjustedSignal,
    tickerScore,
    direction,
    meetsThreshold,
    reasons,
    config: dirConfig,
  };
}

// 动态仓位大小
function calculatePositionSize(baseSize, signal, ticker, direction) {
  let positionSize = baseSize;
  
  // 1. 根据信号强度
  if (signal > 0.9) {
    positionSize *= 1.3; // 超强信号，加仓30%
  } else if (signal > 0.7) {
    positionSize *= 1.15; // 强信号，加仓15%
  } else if (signal < 0.3) {
    positionSize *= 0.8; // 弱信号，减仓20%
  }
  
  // 2. 应用币种评分
  const tickerScore = getTickerScore(ticker);
  positionSize *= tickerScore;
  
  // 3. 应用方向乘数
  const dirConfig = getDirectionConfig(direction);
  positionSize *= dirConfig.positionMultiplier;
  
  return positionSize;
}

// 动态止盈/止损
function getDynamicStopLevels(volatility) {
  // 基础值
  let stopLoss = 0.03;      // 3%
  let takeProfit = 0.10;     // 10%
  let trailingTrigger = 0.05; // 5%
  
  // 根据波动率调整
  if (volatility > 0.05) {
    // 高波动：扩大止盈，保持止损
    takeProfit = 0.15;
    trailingTrigger = 0.08;
  } else if (volatility < 0.02) {
    // 低波动：收紧止盈和止损
    takeProfit = 0.08;
    stopLoss = 0.025;
    trailingTrigger = 0.04;
  }
  
  return { stopLoss, takeProfit, trailingTrigger };
}

// 风险状态检查
function checkRiskStatus(currentEquity, peakEquity, dailyPnl) {
  const drawdown = (peakEquity - currentEquity) / peakEquity;
  const dailyLossPercent = -dailyPnl / peakEquity;
  
  let riskLevel = 'NORMAL';
  let adjustments = {};
  
  // 回撤检查
  if (drawdown > 0.10) {
    riskLevel = 'HIGH';
    adjustments.minSignal = 1.8;      // 信号阈值提高80%
    adjustments.maxPositions = 0.5;   // 仓位数减半
    adjustments.positionSize = 0.6;   // 单仓减40%
  } else if (drawdown > 0.05) {
    riskLevel = 'ELEVATED';
    adjustments.minSignal = 1.5;      // 信号阈值提高50%
    adjustments.maxPositions = 0.7;   // 仓位数减30%
    adjustments.positionSize = 0.7;   // 单仓减30%
  }
  
  // 日亏损检查
  if (dailyLossPercent > 0.05) {
    riskLevel = 'CRITICAL';
    adjustments.minSignal = 2.0;      // 信号阈值翻倍
    adjustments.maxPositions = 0.3;   // 仓位数减70%
    adjustments.positionSize = 0.5;   // 单仓减半
  }
  
  return {
    riskLevel,
    drawdown,
    dailyLossPercent,
    adjustments,
    shouldPause: riskLevel === 'CRITICAL',
  };
}

module.exports = {
  TICKER_SCORES,
  DIRECTION_CONFIG,
  getTickerScore,
  getDirectionConfig,
  evaluateSignalQuality,
  calculatePositionSize,
  getDynamicStopLevels,
  checkRiskStatus,
};
