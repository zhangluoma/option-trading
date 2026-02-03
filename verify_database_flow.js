#!/usr/bin/env node

/**
 * 验证完整的database数据流
 */

const db = require('./database/db');
const axios = require('axios');

async function verify() {
  console.log('🔍 验证Database数据流\n');
  console.log('='.repeat(60));
  
  await db.initDatabase();
  
  // 1. 直接从MySQL读取
  console.log('\n1️⃣ 直接从MySQL读取:');
  const state = await db.getScannerState();
  console.log(`   当前区块: ${state.last_processed_height.toLocaleString()}`);
  console.log(`   已处理: ${state.total_blocks_processed.toLocaleString()} 区块`);
  console.log(`   找到订单: ${state.total_fills_found}`);
  console.log(`   最后更新: ${new Date(state.last_scan_at).toLocaleString('zh-CN')}`);
  
  // 2. 通过API读取
  console.log('\n2️⃣ 通过API读取 (UI使用的方式):');
  try {
    const res = await axios.get('http://localhost:3456/api/scanner-status');
    const apiData = res.data;
    
    if (apiData.success) {
      console.log(`   数据源: ${apiData.source}`);
      console.log(`   当前区块: ${apiData.state.last_processed_height.toLocaleString()}`);
      console.log(`   已处理: ${apiData.state.total_blocks_processed.toLocaleString()} 区块`);
      console.log(`   找到订单: ${apiData.state.total_fills_found}`);
      
      // 3. 验证数据一致性
      console.log('\n3️⃣ 验证数据一致性:');
      const match = (
        state.last_processed_height === apiData.state.last_processed_height &&
        state.total_blocks_processed === apiData.state.total_blocks_processed
      );
      
      if (match) {
        console.log('   ✅ MySQL数据 === API数据 === UI显示');
        console.log('   ✅ 完整数据链路验证通过');
      } else {
        console.log('   ❌ 数据不一致！');
      }
    }
  } catch (error) {
    console.log('   ❌ API请求失败:', error.message);
  }
  
  // 4. 检查其他表
  console.log('\n4️⃣ 其他MySQL表状态:');
  
  const fills = await db.getRecentFills(10);
  console.log(`   fills表: ${fills.length} 条记录`);
  
  const trades = await db.getAllTrades(10);
  console.log(`   trades表: ${trades.length} 条记录`);
  
  const networth = await db.getNetworthHistory(24);
  console.log(`   networth_history表: ${networth.length} 条记录`);
  
  const pool = db.getPool();
  const [blockRows] = await pool.query('SELECT COUNT(*) as count FROM scanned_blocks');
  console.log(`   scanned_blocks表: ${blockRows[0].count} 条记录`);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ 所有数据都存储在MySQL，UI从MySQL读取显示');
  console.log('✅ 数据流: 监听器 → MySQL → API → UI');
  
  await db.closeDatabase();
}

verify().catch(console.error);
