#!/usr/bin/env node

/**
 * 持续区块扫描器 - 自动往前扫描直到找到所有历史订单
 * 
 * 功能:
 * 1. 从最新区块往前扫描
 * 2. 自动断点续传
 * 3. 找到的订单实时写入realtime_fills.json供UI显示
 * 4. 持续运行直到扫完目标范围或找到足够订单
 */

require('dotenv').config();

const { scanBlocks, getLatestHeight } = require('./protobuf_block_scanner');
const { getPersist } = require('./blockchain_persist');
const fs = require('fs');
const path = require('path');

const ADDRESS = 'dydx1crq0p3qkxtk8v5hrzplu7wgtuwt0am6lnfm4je';
const REALTIME_FILLS_FILE = path.join(__dirname, 'data', 'realtime_fills.json');

// 配置
const BATCH_SIZE = 2000; // 每批扫描的区块数
const DELAY_MS = 300; // 每个区块的延迟(ms)
const BATCH_PAUSE_MS = 3000; // 批次之间的暂停(ms)
const MAX_BLOCKS_TOTAL = 200000; // 最多扫描20万区块（约56小时历史）

/**
 * 保存订单到realtime_fills.json
 */
function saveOrdersToRealtimeFills(orders) {
  if (orders.length === 0) return;
  
  try {
    // 确保data目录存在
    const dir = path.dirname(REALTIME_FILLS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 读取现有数据
    let existingFills = [];
    if (fs.existsSync(REALTIME_FILLS_FILE)) {
      try {
        const data = fs.readFileSync(REALTIME_FILLS_FILE, 'utf8');
        existingFills = JSON.parse(data);
      } catch (e) {
        console.error('⚠️  读取realtime_fills.json失败，将覆盖:', e.message);
      }
    }
    
    // 合并新订单（避免重复）
    const newFills = orders.map(o => ({
      ticker: o.ticker,
      market: o.market,
      side: o.side,
      size: o.quantums, // 保留原始quantums
      price: o.subticks, // 保留原始subticks
      createdAt: o.time,
      type: 'HISTORICAL_SCAN', // 标记为历史扫描获得
      height: o.height,
      clientId: o.clientId,
      clobPairId: o.clobPairId
    }));
    
    // 去重（基于height + clientId）
    const combined = [...existingFills];
    for (const fill of newFills) {
      const exists = combined.some(f => 
        f.height === fill.height && 
        f.clientId === fill.clientId
      );
      if (!exists) {
        combined.push(fill);
      }
    }
    
    // 按区块高度排序
    combined.sort((a, b) => b.height - a.height);
    
    // 保存
    fs.writeFileSync(REALTIME_FILLS_FILE, JSON.stringify(combined, null, 2));
    
    console.log(`💾 已更新 realtime_fills.json: 新增${newFills.length}条, 总计${combined.length}条`);
    console.log(`   文件: ${REALTIME_FILLS_FILE}`);
    
  } catch (error) {
    console.error('❌ 保存到realtime_fills.json失败:', error.message);
  }
}

/**
 * 持续扫描主函数
 */
async function continuousScan() {
  console.log('='.repeat(70));
  console.log('🔄 持续区块扫描器');
  console.log('='.repeat(70));
  console.log(`📍 目标账户: ${ADDRESS}`);
  console.log(`📦 批次大小: ${BATCH_SIZE} 区块/批`);
  console.log(`⏱️  区块延迟: ${DELAY_MS}ms`);
  console.log(`⏸️  批次暂停: ${BATCH_PAUSE_MS}ms`);
  console.log(`📊 扫描上限: ${MAX_BLOCKS_TOTAL.toLocaleString()} 区块`);
  console.log('='.repeat(70));
  console.log();
  
  const persist = getPersist();
  const startTime = Date.now();
  let totalOrders = 0;
  let totalScanned = 0;
  let batchCount = 0;
  
  // 获取初始最新区块
  const latestHeight = await getLatestHeight();
  if (!latestHeight) {
    console.error('❌ 无法获取最新区块高度');
    return;
  }
  
  console.log(`📍 最新区块: ${latestHeight.toLocaleString()}`);
  
  // 确定起始扫描点
  let currentHeight = persist.state.lastProcessedHeight || latestHeight;
  if (currentHeight === 0) {
    currentHeight = latestHeight;
  }
  
  console.log(`🔍 起始扫描: ${currentHeight.toLocaleString()}`);
  console.log();
  
  // 持续扫描
  while (totalScanned < MAX_BLOCKS_TOTAL) {
    batchCount++;
    
    const toHeight = currentHeight;
    const fromHeight = Math.max(1, toHeight - BATCH_SIZE + 1);
    const batchBlocks = toHeight - fromHeight + 1;
    
    console.log('='.repeat(70));
    console.log(`📦 批次 ${batchCount} (总进度: ${totalScanned.toLocaleString()}/${MAX_BLOCKS_TOTAL.toLocaleString()} 区块)`);
    console.log(`   范围: ${fromHeight.toLocaleString()} → ${toHeight.toLocaleString()} (${batchBlocks} 区块)`);
    console.log('='.repeat(70));
    
    const batchStartTime = Date.now();
    
    // 扫描这一批
    const orders = await scanBlocks(fromHeight, toHeight, DELAY_MS);
    
    const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(1);
    
    totalScanned += batchBlocks;
    
    if (orders.length > 0) {
      totalOrders += orders.length;
      
      console.log(`\n🎉 找到 ${orders.length} 个订单！`);
      
      // 显示订单
      orders.forEach((order, i) => {
        console.log(`   ${i + 1}. ${order.ticker} ${order.side} @ 区块 ${order.height.toLocaleString()}`);
        console.log(`      时间: ${new Date(order.time).toLocaleString('zh-CN', {timeZone: 'America/Los_Angeles'})}`);
      });
      
      // 保存到realtime_fills.json
      saveOrdersToRealtimeFills(orders);
      
      console.log(`\n✅ 已写入UI数据源，刷新UI即可看到！`);
    } else {
      console.log(`\n   未找到订单，继续往前扫描...`);
    }
    
    // 显示统计
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    const avgSpeed = (totalScanned / (Date.now() - startTime) * 1000).toFixed(1);
    
    console.log(`\n📊 累计统计:`);
    console.log(`   已扫描: ${totalScanned.toLocaleString()} 区块`);
    console.log(`   找到订单: ${totalOrders} 条`);
    console.log(`   耗时: ${totalDuration}秒 (${batchDuration}秒/批)`);
    console.log(`   速度: ${avgSpeed} 区块/秒`);
    
    // 估算剩余时间
    const remainingBlocks = MAX_BLOCKS_TOTAL - totalScanned;
    const estimatedSeconds = remainingBlocks / parseFloat(avgSpeed);
    const estimatedMinutes = Math.round(estimatedSeconds / 60);
    
    if (remainingBlocks > 0) {
      console.log(`   预计剩余: ${estimatedMinutes} 分钟`);
    }
    
    // 移动到下一批
    currentHeight = fromHeight - 1;
    
    // 如果已经扫到最早的区块
    if (currentHeight <= 1) {
      console.log(`\n✅ 已扫描到创世区块！`);
      break;
    }
    
    // 批次之间暂停
    if (totalScanned < MAX_BLOCKS_TOTAL) {
      console.log(`\n⏸️  暂停 ${BATCH_PAUSE_MS}ms 后继续...\n`);
      await new Promise(r => setTimeout(r, BATCH_PAUSE_MS));
    }
  }
  
  // 最终统计
  console.log('\n' + '='.repeat(70));
  console.log('🏁 扫描完成！');
  console.log('='.repeat(70));
  console.log(`📊 总扫描: ${totalScanned.toLocaleString()} 区块`);
  console.log(`🎯 找到订单: ${totalOrders} 条`);
  console.log(`⏱️  总耗时: ${((Date.now() - startTime) / 60000).toFixed(1)} 分钟`);
  
  if (totalOrders > 0) {
    console.log(`\n✅ 所有订单已写入: ${REALTIME_FILLS_FILE}`);
    console.log(`   刷新UI即可查看完整交易历史！`);
  } else {
    console.log(`\n⚠️  在扫描范围内未找到该账户的订单`);
    console.log(`   可能需要扫描更早的区块，或账户尚未有交易`);
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    await continuousScan();
  } catch (error) {
    console.error('\n❌ 扫描出错:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 捕获Ctrl+C，保存进度后退出
process.on('SIGINT', () => {
  console.log('\n\n⚠️  收到中断信号，保存进度...');
  const persist = getPersist();
  persist.save();
  console.log('✅ 进度已保存，可随时继续');
  process.exit(0);
});

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  continuousScan,
  saveOrdersToRealtimeFills
};
