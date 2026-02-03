#!/usr/bin/env node

/**
 * 迁移networth历史数据从JSON到MySQL
 */

const fs = require('fs');
const path = require('path');
const db = require('./database/db');

async function migrate() {
  console.log('📦 迁移净值历史数据\n');
  
  const jsonFile = path.join(__dirname, 'data', 'networth_history.json');
  
  if (!fs.existsSync(jsonFile)) {
    console.log('❌ 未找到networth_history.json');
    return;
  }
  
  await db.initDatabase();
  
  const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  const records = data.records || [];
  
  console.log(`找到 ${records.length} 条记录\n`);
  
  let migrated = 0;
  
  for (const record of records) {
    try {
      // 检查是否已存在
      const pool = db.getPool();
      const [existing] = await pool.query(
        'SELECT 1 FROM networth_history WHERE timestamp = ? LIMIT 1',
        [record.timestamp]
      );
      
      if (existing.length > 0) {
        continue; // 跳过重复
      }
      
      // 转换ISO时间为MySQL datetime格式
      const mysqlTimestamp = new Date(record.timestamp).toISOString().slice(0, 19).replace('T', ' ');
      
      await pool.query(
        `INSERT INTO networth_history 
          (timestamp, equity, usdc_balance, used_margin, available_margin, position_count)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
          mysqlTimestamp,
          record.netWorth,
          record.usdcBalance || 0,
          record.usedMargin || 0,
          record.availableMargin || 0,
          record.positionCount || 0
        ]
      );
      
      migrated++;
      
      if (migrated % 10 === 0) {
        process.stdout.write(`  已迁移: ${migrated}/${records.length}\r`);
      }
    } catch (error) {
      console.error(`\n⚠️  迁移失败:`, record, error.message);
    }
  }
  
  console.log(`\n\n✅ 迁移完成: ${migrated} 条记录`);
  
  // 验证
  const history = await db.getNetworthHistory(168); // 7天
  console.log(`\n📊 数据库中现有: ${history.length} 条记录`);
  
  if (history.length > 0) {
    const latest = history[history.length - 1];
    console.log(`   最新: $${latest.netWorth.toFixed(2)} @ ${new Date(latest.timestamp).toLocaleString('zh-CN')}`);
  }
  
  await db.closeDatabase();
}

migrate().catch(console.error);
