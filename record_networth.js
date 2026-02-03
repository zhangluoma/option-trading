#!/usr/bin/env node

/**
 * 记录当前净值到MySQL
 * 可以通过cron每小时运行一次
 */

require('dotenv').config();

const db = require('./database/db');
const dydx = require('./dydx_data_cached');

async function recordNetworth() {
  try {
    console.log('📊 记录净值...');
    
    await db.initDatabase();
    
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
    
    console.log(`✅ 记录成功: $${status.equity.toFixed(2)} (${status.positions.length}个持仓)`);
    
    await db.closeDatabase();
    
  } catch (error) {
    console.error('❌ 记录失败:', error.message);
    process.exit(1);
  }
}

recordNetworth().catch(console.error);
