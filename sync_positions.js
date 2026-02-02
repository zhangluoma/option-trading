#!/usr/bin/env node
/**
 * 同步链上持仓到本地tracker
 * 用于修复tracker和链上数据不一致的问题
 */

const dydxData = require('./dydx_data');
const positionTracker = require('./position_tracker');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    console.log('\n🔄 开始同步链上持仓...\n');
    
    // 获取链上实际持仓
    const accountInfo = await dydxData.getAccountInfo();
    const prices = await dydxData.getAllPrices();
    
    console.log(`📊 链上持仓: ${accountInfo.positions.length}个`);
    console.log(`💰 USDC余额: $${accountInfo.usdcBalance.toFixed(2)}\n`);
    
    // 获取当前tracker记录
    const trackerPath = path.join(__dirname, 'data', 'position_entries.json');
    let trackerData = {};
    if (fs.existsSync(trackerPath)) {
      trackerData = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
      console.log(`📝 Tracker记录: ${Object.keys(trackerData).length}个\n`);
    }
    
    // 显示差异
    console.log('='.repeat(70));
    console.log('链上持仓 vs Tracker记录:');
    console.log('='.repeat(70));
    
    const onChainTickers = new Set(accountInfo.positions.map(p => p.ticker));
    const trackerTickers = new Set(Object.keys(trackerData));
    
    // 链上有但tracker没有的
    const missingInTracker = [...onChainTickers].filter(t => !trackerTickers.has(t));
    if (missingInTracker.length > 0) {
      console.log('\n⚠️  链上有但tracker缺失:');
      for (const ticker of missingInTracker) {
        const pos = accountInfo.positions.find(p => p.ticker === ticker);
        console.log(`   ${ticker} ${pos.side} ${pos.size}`);
      }
    }
    
    // Tracker有但链上没有的（已平仓）
    const closedPositions = [...trackerTickers].filter(t => !onChainTickers.has(t));
    if (closedPositions.length > 0) {
      console.log('\n⚠️  Tracker有但链上已平仓:');
      for (const ticker of closedPositions) {
        const entry = trackerData[ticker];
        console.log(`   ${ticker} ${entry.side} ${entry.size}`);
      }
    }
    
    // 两边都有但数量/方向不同的
    const conflicts = [];
    for (const ticker of [...onChainTickers].filter(t => trackerTickers.has(t))) {
      const onChain = accountInfo.positions.find(p => p.ticker === ticker);
      const tracker = trackerData[ticker];
      
      if (onChain.side !== tracker.side || Math.abs(onChain.size - tracker.size) > 0.001) {
        conflicts.push({ ticker, onChain, tracker });
      }
    }
    
    if (conflicts.length > 0) {
      console.log('\n⚠️  数据冲突:');
      for (const conflict of conflicts) {
        console.log(`   ${conflict.ticker}:`);
        console.log(`      链上: ${conflict.onChain.side} ${conflict.onChain.size}`);
        console.log(`      Tracker: ${conflict.tracker.side} ${conflict.tracker.size}`);
      }
    }
    
    // 询问是否清理
    console.log('\n' + '='.repeat(70));
    console.log('⚠️  建议操作:');
    console.log('   1. 清空tracker，让守护进程重新发现持仓');
    console.log('   2. 或者手动在dYdX UI平仓所有，重新开始');
    console.log('='.repeat(70));
    
    // 自动清理已平仓的
    if (closedPositions.length > 0) {
      console.log('\n🗑️  清理已平仓的tracker记录...');
      for (const ticker of closedPositions) {
        positionTracker.removeEntry(ticker);
        console.log(`   ✅ 已删除: ${ticker}`);
      }
    }
    
    // 为缺失的持仓创建占位符（没有entry price，需要手动设置或平仓重开）
    if (missingInTracker.length > 0) {
      console.log('\n⚠️  链上有新持仓但tracker没有记录，这些持仓的entry price未知');
      console.log('   建议: 在dYdX UI查看entry price，然后手动添加或平仓');
    }
    
    console.log('\n✅ 同步完成\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
