#!/usr/bin/env node
/**
 * 性能分析工具 - 分析交易历史和信号质量
 */

const fs = require('fs');
const path = require('path');

console.log('\n📊 交易系统性能分析\n');
console.log('='.repeat(70));

// 读取交易历史
const historyFile = path.join(__dirname, 'data', 'trade_history.json');
let trades = [];

if (fs.existsSync(historyFile)) {
  try {
    trades = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    console.log(`\n✅ 已加载 ${trades.length} 条交易记录\n`);
  } catch (e) {
    console.error('❌ 读取交易历史失败:', e.message);
    process.exit(1);
  }
} else {
  console.log('\n⚠️  没有找到交易历史文件\n');
  process.exit(0);
}

// 过滤已平仓交易
const closedTrades = trades.filter(t => t.status === 'CLOSED' && t.pnl != null);

if (closedTrades.length === 0) {
  console.log('⚠️  暂无已平仓交易，等待更多数据...\n');
  process.exit(0);
}

console.log(`📈 已平仓交易: ${closedTrades.length} 笔\n`);

// 统计分析
let totalPnl = 0;
let winTrades = 0;
let lossTrades = 0;
let totalWinPnl = 0;
let totalLossPnl = 0;
const pnlByTicker = {};
const pnlBySide = { LONG: 0, SHORT: 0 };
const countBySide = { LONG: 0, SHORT: 0 };

closedTrades.forEach(trade => {
  const pnl = trade.pnl || 0;
  totalPnl += pnl;
  
  if (pnl > 0) {
    winTrades++;
    totalWinPnl += pnl;
  } else if (pnl < 0) {
    lossTrades++;
    totalLossPnl += pnl;
  }
  
  // 按币种统计
  if (!pnlByTicker[trade.ticker]) {
    pnlByTicker[trade.ticker] = { pnl: 0, count: 0 };
  }
  pnlByTicker[trade.ticker].pnl += pnl;
  pnlByTicker[trade.ticker].count++;
  
  // 按方向统计
  pnlBySide[trade.side] += pnl;
  countBySide[trade.side]++;
});

// 输出统计结果
console.log('💰 总体表现');
console.log('-'.repeat(70));
console.log(`总盈亏: $${totalPnl.toFixed(2)}`);
console.log(`胜率: ${((winTrades / closedTrades.length) * 100).toFixed(1)}% (${winTrades}胜/${lossTrades}负)`);
console.log(`平均盈利: $${(totalWinPnl / (winTrades || 1)).toFixed(2)}`);
console.log(`平均亏损: $${(totalLossPnl / (lossTrades || 1)).toFixed(2)}`);
console.log(`盈亏比: ${(totalWinPnl / Math.abs(totalLossPnl || 1)).toFixed(2)}`);
console.log('');

// 按币种统计
console.log('📊 按币种统计');
console.log('-'.repeat(70));
Object.keys(pnlByTicker)
  .sort((a, b) => pnlByTicker[b].pnl - pnlByTicker[a].pnl)
  .forEach(ticker => {
    const { pnl, count } = pnlByTicker[ticker];
    const avgPnl = pnl / count;
    const icon = pnl > 0 ? '✅' : '❌';
    console.log(`${icon} ${ticker.padEnd(6)}: $${pnl.toFixed(2).padStart(8)} (${count}笔, 均$${avgPnl.toFixed(2)})`);
  });
console.log('');

// 按方向统计
console.log('🎯 按方向统计');
console.log('-'.repeat(70));
['LONG', 'SHORT'].forEach(side => {
  const pnl = pnlBySide[side];
  const count = countBySide[side];
  const avgPnl = count > 0 ? pnl / count : 0;
  const icon = pnl > 0 ? '✅' : '❌';
  console.log(`${icon} ${side.padEnd(6)}: $${pnl.toFixed(2).padStart(8)} (${count}笔, 均$${avgPnl.toFixed(2)})`);
});
console.log('');

// 最近5笔交易
console.log('📝 最近5笔交易');
console.log('-'.repeat(70));
closedTrades.slice(-5).reverse().forEach((trade, i) => {
  const pnl = trade.pnl || 0;
  const pnlPercent = trade.pnlPercent || 0;
  const icon = pnl > 0 ? '✅' : '❌';
  const reason = trade.closeReason || 'UNKNOWN';
  console.log(`${icon} ${trade.ticker} ${trade.side}: $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%) - ${reason}`);
});
console.log('');

// 建议
console.log('💡 优化建议');
console.log('-'.repeat(70));

if (winTrades / closedTrades.length < 0.4) {
  console.log('⚠️  胜率偏低（<40%），建议：');
  console.log('   - 提高信号阈值');
  console.log('   - 改进趋势过滤');
  console.log('   - 检查止损/止盈设置');
}

if (Math.abs(totalWinPnl) < Math.abs(totalLossPnl)) {
  console.log('⚠️  盈亏比不足1.0，建议：');
  console.log('   - 扩大止盈目标');
  console.log('   - 收紧止损范围');
  console.log('   - 使用移动止损');
}

// 找出表现最差的币种
const worstTicker = Object.keys(pnlByTicker)
  .sort((a, b) => pnlByTicker[a].pnl - pnlByTicker[b].pnl)[0];

if (worstTicker && pnlByTicker[worstTicker].pnl < -10) {
  console.log(`⚠️  ${worstTicker} 表现最差（$${pnlByTicker[worstTicker].pnl.toFixed(2)}），建议：`);
  console.log(`   - 暂时禁用 ${worstTicker} 交易`);
  console.log(`   - 检查 ${worstTicker} 的信号质量`);
}

console.log('');
console.log('='.repeat(70));
console.log('');
