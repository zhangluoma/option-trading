#!/usr/bin/env node
/**
 * 性能分析工具
 * 
 * 分析交易历史，找出：
 * 1. 最佳交易时段
 * 2. 最佳币种
 * 3. 最佳信号组合
 * 4. 止损止盈统计
 */

const fs = require('fs');
const path = require('path');

function loadTradeHistory() {
  const historyFile = './data/trade_history.json';
  
  if (!fs.existsSync(historyFile)) {
    return [];
  }
  
  return JSON.parse(fs.readFileSync(historyFile, 'utf8'));
}

function loadPerformanceStats() {
  const perfFile = './data/performance.json';
  
  if (!fs.existsSync(perfFile)) {
    return null;
  }
  
  return JSON.parse(fs.readFileSync(perfFile, 'utf8'));
}

function analyzePerformance() {
  const trades = loadTradeHistory();
  const perfStats = loadPerformanceStats();
  
  console.log('📊 性能分析报告');
  console.log('='.repeat(60));
  console.log('');
  
  if (trades.length === 0) {
    console.log('⚠️  暂无交易历史\n');
    return;
  }
  
  // 1. 基本统计
  console.log('📈 基本统计:');
  console.log(`   总交易数: ${trades.length}`);
  
  const closedTrades = trades.filter(t => t.status === 'CLOSED');
  const winningTrades = closedTrades.filter(t => t.pnl > 0);
  const losingTrades = closedTrades.filter(t => t.pnl <= 0);
  
  const totalPnl = closedTrades.reduce((sum, t) => sum + t.pnl, 0);
  const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length * 100) : 0;
  
  console.log(`   盈利交易: ${winningTrades.length}`);
  console.log(`   亏损交易: ${losingTrades.length}`);
  console.log(`   胜率: ${winRate.toFixed(1)}%`);
  console.log(`   总盈亏: $${totalPnl.toFixed(2)}`);
  console.log('');
  
  // 2. 平均盈亏
  if (winningTrades.length > 0) {
    const avgWin = winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length;
    console.log(`   平均盈利: $${avgWin.toFixed(2)}`);
  }
  
  if (losingTrades.length > 0) {
    const avgLoss = losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length;
    console.log(`   平均亏损: $${avgLoss.toFixed(2)}`);
  }
  
  if (winningTrades.length > 0 && losingTrades.length > 0) {
    const avgWin = winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length;
    const avgLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length);
    const profitFactor = avgWin / avgLoss;
    console.log(`   盈亏比: ${profitFactor.toFixed(2)}`);
  }
  console.log('');
  
  // 3. 按币种统计
  console.log('💰 币种表现:');
  const byTicker = {};
  
  closedTrades.forEach(t => {
    if (!byTicker[t.ticker]) {
      byTicker[t.ticker] = { trades: 0, pnl: 0, wins: 0 };
    }
    byTicker[t.ticker].trades++;
    byTicker[t.ticker].pnl += t.pnl;
    if (t.pnl > 0) byTicker[t.ticker].wins++;
  });
  
  Object.entries(byTicker)
    .sort((a, b) => b[1].pnl - a[1].pnl)
    .forEach(([ticker, stats]) => {
      const winRate = (stats.wins / stats.trades * 100).toFixed(1);
      console.log(`   ${ticker}: ${stats.trades}笔, $${stats.pnl.toFixed(2)}, 胜率${winRate}%`);
    });
  console.log('');
  
  // 4. 平仓原因统计
  if (perfStats && perfStats.closeReasons) {
    console.log('🚪 平仓原因:');
    Object.entries(perfStats.closeReasons)
      .sort((a, b) => b[1] - a[1])
      .forEach(([reason, count]) => {
        console.log(`   ${reason}: ${count}次`);
      });
    console.log('');
  }
  
  // 5. 持仓时长统计
  console.log('⏱️  持仓时长:');
  const holdTimes = closedTrades.map(t => {
    const opened = new Date(t.openedAt);
    const closed = new Date(t.closedAt);
    return (closed - opened) / (1000 * 60 * 60); // 小时
  });
  
  if (holdTimes.length > 0) {
    const avgHold = holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length;
    const minHold = Math.min(...holdTimes);
    const maxHold = Math.max(...holdTimes);
    
    console.log(`   平均: ${avgHold.toFixed(1)}h`);
    console.log(`   最短: ${minHold.toFixed(1)}h`);
    console.log(`   最长: ${maxHold.toFixed(1)}h`);
  }
  console.log('');
  
  // 6. 最佳/最差交易
  if (closedTrades.length > 0) {
    const bestTrade = closedTrades.reduce((best, t) => t.pnl > best.pnl ? t : best);
    const worstTrade = closedTrades.reduce((worst, t) => t.pnl < worst.pnl ? t : worst);
    
    console.log('🏆 最佳交易:');
    console.log(`   ${bestTrade.ticker} ${bestTrade.side} $${bestTrade.pnl.toFixed(2)} (${bestTrade.pnlPercent.toFixed(2)}%)`);
    console.log('');
    
    console.log('📉 最差交易:');
    console.log(`   ${worstTrade.ticker} ${worstTrade.side} $${worstTrade.pnl.toFixed(2)} (${worstTrade.pnlPercent.toFixed(2)}%)`);
    console.log('');
  }
  
  // 7. 资金增长
  console.log('💵 资金增长:');
  console.log(`   初始资金: $162.25`);
  console.log(`   当前资金: $${(162.25 + totalPnl).toFixed(2)}`);
  console.log(`   增长: ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)} (${(totalPnl / 162.25 * 100).toFixed(2)}%)`);
  console.log(`   目标: $5000.00`);
  console.log(`   进度: ${((162.25 + totalPnl) / 5000 * 100).toFixed(1)}%`);
  console.log('');
  
  console.log('='.repeat(60));
}

// 运行
if (require.main === module) {
  analyzePerformance();
}

module.exports = { analyzePerformance };
