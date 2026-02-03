#!/usr/bin/env node

/**
 * 修复持仓开仓价格
 * 问题：position_entries.json丢失，导致UI显示entry=current
 */

const positionTracker = require('./position_tracker');
const dydxData = require('./dydx_data');

async function main() {
  console.log('='.repeat(60));
  console.log('修复持仓开仓价格');
  console.log('='.repeat(60));
  
  // 获取当前链上持仓
  const status = await dydxData.getFullAccountStatus();
  
  console.log(`\n当前持仓: ${status.positions.length}个\n`);
  
  status.positions.forEach(pos => {
    console.log(`${pos.ticker} ${pos.side}:`);
    console.log(`  数量: ${pos.size}`);
    console.log(`  当前价: $${pos.currentPrice.toFixed(4)}`);
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('⚠️  问题诊断:');
  console.log('='.repeat(60));
  console.log('position_entries.json 为空 → 无法计算P&L');
  console.log('原因: daemon重启或文件丢失');
  console.log('');
  console.log('区块链不存储历史开仓价格！');
  console.log('只能从Indexer或本地记录获取。');
  
  console.log('\n' + '='.repeat(60));
  console.log('💡 解决方案:');
  console.log('='.repeat(60));
  
  console.log('\n1. 使用当前价格作为临时entry (不准确)');
  console.log('2. 从Indexer获取fills (需要VPN)');
  console.log('3. 手动输入entry prices (需要用户提供)');
  console.log('4. 平仓当前持仓，等待新开仓 (自动记录)');
  
  console.log('\n推荐: 方案4 - daemon会在新开仓时自动记录正确的entry price');
  
  console.log('\n' + '='.repeat(60));
  console.log('📝 临时解决方案（使用当前价）:');
  console.log('='.repeat(60));
  
  // 临时方案：使用当前价格记录
  const useCurrentPrices = process.argv.includes('--use-current');
  
  if (useCurrentPrices) {
    console.log('\n⚠️  使用当前价格作为entry（仅用于显示，P&L=0）\n');
    
    for (const pos of status.positions) {
      positionTracker.recordEntry(
        pos.ticker,
        pos.side,
        pos.size,
        pos.currentPrice,
        999000 + Math.floor(Math.random() * 1000) // 临时clientId
      );
      console.log(`✅ 记录: ${pos.ticker} ${pos.side} @ $${pos.currentPrice.toFixed(4)}`);
    }
    
    console.log('\n✅ 已更新position_entries.json');
    console.log('⚠️  注意: 这只是临时方案，P&L仍然为0');
    console.log('建议: 等待daemon平仓并开新仓，会自动记录正确价格');
  } else {
    console.log('\n运行 `node fix_entry_prices.js --use-current` 使用当前价');
    console.log('或提供正确的entry prices手动修复');
  }
}

main().catch(console.error);
