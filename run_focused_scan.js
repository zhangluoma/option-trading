#!/usr/bin/env node

/**
 * 聚焦扫描 - 扫描特定区块范围找到该账户的交易
 */

require('dotenv').config();

const { scanBlocks, getLatestHeight } = require('./protobuf_block_scanner');
const { getPersist } = require('./blockchain_persist');

async function main() {
  console.log('🎯 聚焦扫描 - 查找账户交易\n');
  console.log('='.repeat(60));
  
  const latestHeight = await getLatestHeight();
  
  if (!latestHeight) {
    console.error('❌ 无法获取最新区块');
    return;
  }
  
  console.log(`\n最新区块: ${latestHeight}`);
  
  // 策略：从最近往前扫描，分批扫描，找到订单就停止
  const batchSize = 2000; // 每批2000个区块
  const maxBatches = 20; // 最多20批（40000区块，约11小时）
  
  let foundOrders = false;
  
  for (let batch = 0; batch < maxBatches && !foundOrders; batch++) {
    const toHeight = latestHeight - (batch * batchSize);
    const fromHeight = toHeight - batchSize + 1;
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`批次 ${batch + 1}/${maxBatches}`);
    console.log(`扫描: ${fromHeight} → ${toHeight} (${batchSize} 区块)`);
    console.log('='.repeat(60));
    
    const orders = await scanBlocks(fromHeight, toHeight, 300); // 300ms延迟
    
    if (orders.length > 0) {
      console.log(`\n🎉 找到 ${orders.length} 个订单！`);
      foundOrders = true;
      
      // 显示订单
      orders.forEach((order, i) => {
        console.log(`\n${i + 1}. ${order.ticker} ${order.side}`);
        console.log(`   区块: ${order.height}`);
        console.log(`   时间: ${new Date(order.time).toLocaleString('zh-CN')}`);
      });
      
      console.log(`\n✅ 扫描完成！已找到账户的交易。`);
      break;
    } else {
      console.log(`\n⚠️  这批没有找到订单，继续下一批...`);
    }
    
    // 暂停2秒再继续
    await new Promise(r => setTimeout(r, 2000));
  }
  
  if (!foundOrders) {
    console.log(`\n❌ 扫描了 ${maxBatches * batchSize} 个区块都没找到订单`);
    console.log(`   这个账户可能在更早之前交易过`);
    console.log(`   或者需要扫描更大的范围`);
  }
  
  // 显示persist状态
  const persist = getPersist();
  const stats = persist.getStats();
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 扫描统计');
  console.log('='.repeat(60));
  console.log(`  处理区块: ${stats.totalBlocksProcessed}`);
  console.log(`  找到订单: ${stats.totalFillsFound}`);
  console.log(`  缓存数据: ${stats.cachedFills}`);
}

main().catch(console.error);
