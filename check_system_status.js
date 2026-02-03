#!/usr/bin/env node

/**
 * 完整系统状态检查
 */

const db = require('./database/db');
const fs = require('fs');
const path = require('path');

async function checkSystem() {
  console.log('='.repeat(70));
  console.log('🔍 系统状态检查');
  console.log('='.repeat(70));
  console.log();
  
  // 1. MySQL状态
  console.log('💾 MySQL数据库:');
  try {
    await db.initDatabase();
    console.log('   ✅ 连接成功');
    
    const state = await db.getScannerState();
    const fills = await db.getRecentFills(100);
    const trades = await db.getAllTrades(100);
    
    console.log(`   最后处理区块: ${state.last_processed_height.toLocaleString()}`);
    console.log(`   已处理区块: ${state.total_blocks_processed.toLocaleString()}`);
    console.log(`   订单记录: ${fills.length} 条`);
    console.log(`   交易记录: ${trades.length} 条`);
    
    if (fills.length > 0) {
      console.log('\n   最近订单:');
      fills.slice(0, 3).forEach((f, i) => {
        const time = new Date(f.createdAt).toLocaleString('zh-CN', {timeZone: 'America/Los_Angeles'});
        console.log(`   ${i + 1}. ${f.ticker} ${f.side} - ${f.size} @ $${f.price} (${time})`);
      });
    }
    
    await db.closeDatabase();
  } catch (error) {
    console.log('   ❌ 连接失败:', error.message);
  }
  
  console.log('\n' + '='.repeat(70));
  
  // 2. 实时监听器
  console.log('\n🔴 实时区块监听器:');
  const monitorPidFile = path.join(__dirname, 'logs', 'monitor_mysql.pid');
  if (fs.existsSync(monitorPidFile)) {
    const pid = fs.readFileSync(monitorPidFile, 'utf8').trim();
    try {
      process.kill(pid, 0);
      console.log(`   ✅ 运行中 (PID: ${pid})`);
      
      const logFile = path.join(__dirname, 'logs', 'realtime_monitor_mysql.log');
      if (fs.existsSync(logFile)) {
        const logs = fs.readFileSync(logFile, 'utf8').split('\n').filter(l => l.trim());
        const lastLines = logs.slice(-5);
        console.log('\n   最近日志:');
        lastLines.forEach(line => console.log('   ' + line));
      }
    } catch (e) {
      console.log(`   ❌ 未运行 (PID ${pid} 不存在)`);
    }
  } else {
    console.log('   ❌ 未找到进程文件');
  }
  
  console.log('\n' + '='.repeat(70));
  
  // 3. UI Server
  console.log('\n🖥️  UI Server:');
  const uiPidFile = path.join(__dirname, 'logs', 'ui_server_mysql.pid');
  if (fs.existsSync(uiPidFile)) {
    const pid = fs.readFileSync(uiPidFile, 'utf8').trim();
    try {
      process.kill(pid, 0);
      console.log(`   ✅ 运行中 (PID: ${pid})`);
      console.log('   📡 URL: http://localhost:3456');
      
      // 测试API
      const http = require('http');
      http.get('http://localhost:3456/api/fills?limit=1', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            console.log(`   📊 API响应: ${json.success ? '✅ 正常' : '❌ 错误'}`);
            console.log(`   💾 订单数据: ${json.count || 0} 条`);
          } catch (e) {
            console.log('   ⚠️  API响应解析失败');
          }
        });
      }).on('error', () => {
        console.log('   ❌ API无法访问');
      });
      
    } catch (e) {
      console.log(`   ❌ 未运行 (PID ${pid} 不存在)`);
    }
  } else {
    console.log('   ❌ 未找到进程文件');
  }
  
  console.log('\n' + '='.repeat(70));
  
  // 4. Daemon
  console.log('\n⚙️  Auto Trader Daemon:');
  const { execSync } = require('child_process');
  try {
    const ps = execSync('ps aux | grep "auto_trader_daemon.js" | grep -v grep', {encoding: 'utf8'});
    if (ps.trim()) {
      const pid = ps.trim().split(/\s+/)[1];
      console.log(`   ✅ 运行中 (PID: ${pid})`);
    } else {
      console.log('   ❌ 未运行');
    }
  } catch (e) {
    console.log('   ❌ 未运行');
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('\n💡 提示:');
  console.log('   - 查看监听器日志: tail -f logs/realtime_monitor_mysql.log');
  console.log('   - 查看UI日志: tail -f logs/ui_server_mysql.log');
  console.log('   - 访问UI: http://localhost:3456');
  console.log('   - 清空测试数据: mysql -u root dydx_trading -e "DELETE FROM fills WHERE source=\'REALTIME\' AND height < 74300000"');
  console.log();
}

checkSystem().catch(console.error);
