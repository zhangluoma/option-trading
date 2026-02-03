#!/usr/bin/env node

/**
 * 净值自动记录守护进程
 * 每小时记录一次净值到MySQL
 */

require('dotenv').config();

const db = require('./database/db');
const dydx = require('./dydx_data_cached');

const INTERVAL_MS = 60 * 60 * 1000; // 1小时

let lastRecordTime = 0;

async function recordNetworth() {
  try {
    const now = Date.now();
    
    // 避免重复记录（至少间隔55分钟）
    if (now - lastRecordTime < 55 * 60 * 1000) {
      return;
    }
    
    console.log(`[${new Date().toLocaleString()}] 📊 记录净值...`);
    
    // 获取账户状态
    const status = await dydx.getFullAccountStatus();
    
    // 记录到数据库
    await db.recordNetworth(
      status.equity,
      status.usdcBalance,
      status.usedMargin,
      status.availableMargin,
      status.positions.length
    );
    
    lastRecordTime = now;
    
    console.log(`✅ 记录成功: $${status.equity.toFixed(2)} (${status.positions.length}个持仓)`);
    
  } catch (error) {
    console.error(`❌ 记录失败: ${error.message}`);
    
    // 429错误时使用缓存数据
    if (error.message.includes('429')) {
      console.log('⚠️  API限流，等待下次重试');
    }
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('📊 净值自动记录守护进程');
  console.log('='.repeat(60));
  console.log(`⏱️  记录间隔: 每小时`);
  console.log(`💾 存储: MySQL数据库`);
  console.log('='.repeat(60));
  console.log();
  
  // 初始化数据库
  await db.initDatabase();
  
  // 立即记录一次
  await recordNetworth();
  
  // 定时记录
  setInterval(async () => {
    await recordNetworth();
  }, INTERVAL_MS);
  
  console.log('\n🔄 守护进程运行中...\n');
}

// 捕获退出信号
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  收到退出信号...');
  await db.closeDatabase();
  console.log('✅ 已退出');
  process.exit(0);
});

// 捕获未处理异常
process.on('uncaughtException', async (error) => {
  console.error('\n❌ 未捕获异常:', error.message);
  await db.closeDatabase();
  process.exit(1);
});

main().catch(async (error) => {
  console.error('Fatal error:', error);
  await db.closeDatabase();
  process.exit(1);
});
