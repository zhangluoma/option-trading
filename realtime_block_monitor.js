#!/usr/bin/env node

/**
 * 实时区块监听器 - 从现在开始往后监听新区块
 * 
 * 功能:
 * 1. 从最新区块开始监听新区块（往后扫）
 * 2. 所有订单记录到database（realtime_fills.json）
 * 3. 记录已扫描的区块，避免重复
 * 4. 断点续传：启动时从上次停的地方继续
 * 5. 持续运行，实时捕获新交易
 */

require('dotenv').config();

const { getLatestHeight, extractOrdersFromBlock, getBlock } = require('./protobuf_block_scanner');
const { getPersist } = require('./blockchain_persist');
const fs = require('fs');
const path = require('path');

const ADDRESS = 'dydx1crq0p3qkxtk8v5hrzplu7wgtuwt0am6lnfm4je';
const REALTIME_FILLS_FILE = path.join(__dirname, 'data', 'realtime_fills.json');
const POLL_INTERVAL_MS = 1000; // 每秒检查一次新区块

/**
 * 保存订单到database
 */
function saveOrdersToDatabase(orders) {
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
        console.error('⚠️  读取database失败，将覆盖:', e.message);
      }
    }
    
    // 添加新订单（避免重复）
    const newFills = orders.map(o => ({
      ticker: o.ticker,
      market: o.market,
      side: o.side,
      quantums: o.quantums,
      subticks: o.subticks,
      createdAt: o.time,
      type: 'REALTIME', // 标记为实时捕获
      height: o.height,
      clientId: o.clientId,
      clobPairId: o.clobPairId,
      orderFlags: o.orderFlags,
      timeInForce: o.timeInForce
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
        console.log(`  💾 新订单: ${fill.ticker} ${fill.side} @ 区块 ${fill.height}`);
      }
    }
    
    // 按区块高度排序（最新在前）
    combined.sort((a, b) => b.height - a.height);
    
    // 保存
    fs.writeFileSync(REALTIME_FILLS_FILE, JSON.stringify(combined, null, 2));
    
    console.log(`✅ Database更新: 总计 ${combined.length} 条订单`);
    
  } catch (error) {
    console.error('❌ 保存到database失败:', error.message);
  }
}

/**
 * 实时监听主函数
 */
async function realtimeMonitor() {
  console.log('='.repeat(70));
  console.log('🔴 实时区块监听器 - LIVE');
  console.log('='.repeat(70));
  console.log(`📍 监听账户: ${ADDRESS}`);
  console.log(`⏱️  检查间隔: ${POLL_INTERVAL_MS}ms`);
  console.log(`💾 Database: ${REALTIME_FILLS_FILE}`);
  console.log('='.repeat(70));
  console.log();
  
  const persist = getPersist();
  const startTime = Date.now();
  let totalOrders = 0;
  let totalBlocks = 0;
  
  // 获取最新区块高度
  const latestHeight = await getLatestHeight();
  if (!latestHeight) {
    console.error('❌ 无法获取最新区块高度');
    return;
  }
  
  // 确定起始点
  let lastProcessedHeight = persist.state.lastProcessedHeight;
  
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
          // 检查是否已处理过（避免重复）
          if (persist.isBlockProcessed(height)) {
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
            
            // 显示订单详情
            orders.forEach(order => {
              const time = new Date(order.time).toLocaleString('zh-CN', {timeZone: 'America/Los_Angeles'});
              console.log(`     ${order.ticker} ${order.side} @ ${time}`);
            });
            
            // 保存到database
            saveOrdersToDatabase(orders);
          }
          
          // 标记为已处理
          persist.markBlockProcessed(height, orders.length);
          
          // 更新当前高度
          currentHeight = height;
          
          // 每10个区块保存一次进度
          if (totalBlocks % 10 === 0) {
            persist.save();
          }
        }
        
        // 保存最终进度
        persist.save();
        
        console.log(`\n✅ 已处理完所有新区块，继续监听...\n`);
        
      } else {
        // 没有新区块，静默等待
        // 每30秒打印一次心跳
        const now = Date.now();
        if (now - lastLogTime > 30000) {
          const uptime = Math.round((now - startTime) / 1000 / 60);
          console.log(`💓 监听中... (运行${uptime}分钟, 已处理${totalBlocks}区块, 找到${totalOrders}订单)`);
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
    process.exit(1);
  }
}

// 捕获Ctrl+C，保存进度后退出
process.on('SIGINT', () => {
  console.log('\n\n⚠️  收到中断信号，保存进度...');
  const persist = getPersist();
  persist.save();
  console.log('✅ 进度已保存');
  process.exit(0);
});

// 捕获未处理的异常
process.on('uncaughtException', (error) => {
  console.error('\n❌ 未捕获的异常:', error.message);
  const persist = getPersist();
  persist.save();
  console.log('✅ 进度已保存');
  process.exit(1);
});

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  realtimeMonitor,
  saveOrdersToDatabase
};
