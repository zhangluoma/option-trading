#!/usr/bin/env node

/**
 * 检查区块扫描进度
 */

const { getPersist } = require('./blockchain_persist');

const persist = getPersist();
const stats = persist.getStats();

console.log('\n📊 区块扫描进度\n');
console.log('='.repeat(50));

if (stats.firstScan) {
  console.log(`\n🕒 首次扫描: ${new Date(stats.firstScan).toLocaleString('zh-CN')}`);
}

if (stats.lastScan) {
  console.log(`🕒 最后扫描: ${new Date(stats.lastScan).toLocaleString('zh-CN')}`);
}

console.log(`\n📍 最后处理区块: ${stats.lastProcessedHeight}`);
console.log(`📦 总处理区块: ${stats.totalBlocksProcessed}`);
console.log(`✅ 总找到fills: ${stats.totalFillsFound}`);
console.log(`💾 缓存fills: ${stats.cachedFills}`);

console.log('\n' + '='.repeat(50));

if (stats.cachedFills > 0) {
  console.log('\n📋 最近的fills:\n');
  
  const fills = persist.getFills(10);
  
  fills.forEach((fill, i) => {
    console.log(`${i + 1}. 区块 ${fill.height}`);
    console.log(`   类型: ${fill.type || 'N/A'}`);
    console.log(`   市场: ${fill.market || 'N/A'}`);
    console.log(`   价格: ${fill.price || 'N/A'}`);
    console.log(`   数量: ${fill.size || 'N/A'}`);
    console.log();
  });
} else {
  console.log('\n⚠️  还没有找到fills\n');
  
  if (stats.totalBlocksProcessed > 0) {
    console.log(`已扫描 ${stats.totalBlocksProcessed} 个区块，但未找到该账户的交易`);
    console.log('继续扫描更多历史区块...\n');
  } else {
    console.log('扫描尚未开始或刚开始\n');
  }
}
