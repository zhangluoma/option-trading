#!/usr/bin/env node

/**
 * 实时区块监听器 - MySQL版本
 * 从现在开始往后监听新区块，所有数据保存到MySQL
 */

require('dotenv').config();

const { getLatestHeight, extractOrdersFromBlock, getBlock } = require('./protobuf_block_scanner');
const db = require('./database/db');

const ADDRESS = 'dydx1crq0p3qkxtk8v5hrzplu7wgtuwt0am6lnfm4je';
const POLL_INTERVAL_MS = 1000; // 每秒检查一次新区块

/**
 * 实时监听主函数
 */
async function realtimeMonitor() {
  console.log('='.repeat(70));
  console.log('🔴 实时区块监听器 - MySQL版本');
  console.log('='.repeat(70));
  console.log(`📍 监听账户: ${ADDRESS}`);
  console.log(`⏱️  检查间隔: ${POLL_INTERVAL_MS}ms`);
  console.log(`💾 存储: MySQL数据库`);
  console.log('='.repeat(70));
  console.log();
  
  // 初始化数据库
  console.log('🔧 连接MySQL...');
  const dbReady = await db.initDatabase();
  if (!dbReady) {
    console.error('❌ 数据库初始化失败，退出');
    process.exit(1);
  }
  
  const startTime = Date.now();
  let totalOrders = 0;
  let totalBlocks = 0;
  
  // 获取最新区块高度
  const latestHeight = await getLatestHeight();
  if (!latestHeight) {
    console.error('❌ 无法获取最新区块高度');
    return;
  }
  
  // 获取扫描器状态
  const state = await db.getScannerState();
  let lastProcessedHeight = state.last_processed_height;
  
  if (lastProcessedHeight === 0 || lastProcessedHeight < latestHeight - 10) {
    // 第一次启动，或者间隔太久，从最新区块开始
    lastProcessedHeight = latestHeight;
    console.log(`📍 首次启动，从最新区块开始: ${latestHeight.toLocaleString()}`);
  } else {
    // 断点续传
    console.log(`📍 续传模式，上次处理到: ${lastProcessedHeight.toLocaleString()}`);
    console.log(`   最新区块: ${latestHeight.toLocaleString()}`);
    console.log(`   需要补扫: ${latestHeight - lastProcessedHeight} 个区块`);
  }
  
  console.log();
  console.log('🔴 开始监听...\n');
  
  let currentHeight = lastProcessedHeight;
  let lastLogTime = Date.now();
  
  // 持续监听
  while (true) {
    try {
      // 获取最新区块高度
      const latestHeight = await getLatestHeight();
      
      if (!latestHeight) {
        console.error('⚠️  无法获取最新区块，5秒后重试...');
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      
      // 如果有新区块
      if (latestHeight > currentHeight) {
        const newBlocks = latestHeight - currentHeight;
        
        console.log(`\n🆕 发现 ${newBlocks} 个新区块 (${currentHeight + 1} → ${latestHeight})`);
        
        // 处理每个新区块
        for (let height = currentHeight + 1; height <= latestHeight; height++) {
          // 检查是否已处理过
          if (await db.isBlockScanned(height)) {
            console.log(`  ⏭️  跳过区块 ${height.toLocaleString()} (已处理)`);
            continue;
          }
          
          const block = await getBlock(height);
          
          if (!block) {
            console.log(`  ⚠️  无法获取区块 ${height.toLocaleString()}，跳过`);
            continue;
          }
          
          totalBlocks++;
          
          // 提取订单
          const orders = extractOrdersFromBlock(block);
          
          if (orders.length > 0) {
            totalOrders += orders.length;
            
            console.log(`\n  🎉 区块 ${height.toLocaleString()} 找到 ${orders.length} 个订单！`);
            
            // 保存到数据库
            for (const order of orders) {
              const time = new Date(order.time).toLocaleString('zh-CN', {timeZone: 'America/Los_Angeles'});
              console.log(`     ${order.ticker} ${order.side} @ ${time}`);
              
              await db.saveFill({
                height: order.height,
                time: order.time,
                ticker: order.ticker,
                market: order.market,
                side: order.side,
                quantums: order.quantums,
                subticks: order.subticks,
                clientId: order.clientId,
                clobPairId: order.clobPairId,
                orderFlags: order.orderFlags,
                timeInForce: order.timeInForce,
                source: 'REALTIME'
              });
            }
            
            console.log(`  💾 已保存到MySQL数据库`);
          }
          
          // 标记为已处理
          await db.markBlockScanned(height, orders.length);
          
          // 更新当前高度
          currentHeight = height;
        }
        
        console.log(`\n✅ 已处理完所有新区块，继续监听...\n`);
        
      } else {
        // 没有新区块，静默等待
        // 每30秒打印一次心跳
        const now = Date.now();
        if (now - lastLogTime > 30000) {
          const uptime = Math.round((now - startTime) / 1000 / 60);
          const state = await db.getScannerState();
          console.log(`💓 监听中... (运行${uptime}分钟, 已处理${state.total_blocks_processed}区块, 找到${state.total_fills_found}订单)`);
          lastLogTime = now;
        }
      }
      
      // 等待下一次检查
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      
    } catch (error) {
      console.error('\n❌ 监听出错:', error.message);
      console.log('   5秒后继续...\n');
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    await realtimeMonitor();
  } catch (error) {
    console.error('\n❌ 监听器崩溃:', error.message);
    console.error(error.stack);
    await db.closeDatabase();
    process.exit(1);
  }
}

// 捕获Ctrl+C，保存进度后退出
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  收到中断信号，关闭数据库连接...');
  await db.closeDatabase();
  console.log('✅ 已退出');
  process.exit(0);
});

// 捕获未处理的异常
process.on('uncaughtException', async (error) => {
  console.error('\n❌ 未捕获的异常:', error.message);
  await db.closeDatabase();
  process.exit(1);
});

if (require.main === module) {
  main().catch(async (error) => {
    console.error('Fatal error:', error);
    await db.closeDatabase();
    process.exit(1);
  });
}

module.exports = {
  realtimeMonitor
};
