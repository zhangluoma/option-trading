#!/usr/bin/env node

/**
 * 检查实时监听器状态
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FILLS_FILE = path.join(__dirname, 'data', 'realtime_fills.json');
const LOG_FILE = path.join(__dirname, 'logs', 'realtime_monitor.log');

console.log('🔍 实时监听器状态检查\n');
console.log('='.repeat(60));

// 检查进程
try {
  const processes = execSync('ps aux | grep "realtime_order_monitor" | grep -v grep').toString();
  
  if (processes) {
    console.log('\n✅ 监听器运行中:');
    const lines = processes.trim().split('\n');
    lines.forEach(line => {
      const parts = line.split(/\s+/);
      const pid = parts[1];
      const cpu = parts[2];
      const mem = parts[3];
      console.log(`   PID: ${pid}, CPU: ${cpu}%, MEM: ${mem}%`);
    });
  } else {
    console.log('\n❌ 监听器未运行');
  }
} catch (e) {
  console.log('\n❌ 监听器未运行');
}

// 检查捕获的订单
try {
  if (fs.existsSync(FILLS_FILE)) {
    const data = fs.readFileSync(FILLS_FILE, 'utf8');
    const fills = JSON.parse(data);
    
    console.log(`\n📦 已捕获订单: ${fills.length} 个`);
    
    if (fills.length > 0) {
      console.log('\n最近的订单:');
      fills.slice(-5).forEach((fill, i) => {
        console.log(`\n${i + 1}. ${fill.ticker} ${fill.side}`);
        console.log(`   区块: ${fill.height}`);
        console.log(`   时间: ${new Date(fill.time).toLocaleString('zh-CN')}`);
      });
    } else {
      console.log('   还没有捕获到订单');
      console.log('   等待daemon下新订单...');
    }
  } else {
    console.log('\n📦 已捕获订单: 0 个');
    console.log('   等待daemon下新订单...');
  }
} catch (e) {
  console.log(`\n❌ 无法读取订单: ${e.message}`);
}

// 显示日志尾部
console.log('\n📋 最近日志（最后10行）:');
console.log('='.repeat(60));

try {
  if (fs.existsSync(LOG_FILE)) {
    const log = execSync(`tail -10 ${LOG_FILE}`).toString();
    console.log(log);
  } else {
    console.log('日志文件不存在');
  }
} catch (e) {
  console.log('无法读取日志');
}

console.log('='.repeat(60));
console.log('\n💡 说明:');
console.log('   监听器会自动捕获daemon的新订单');
console.log('   每次daemon开仓/平仓都会被记录');
console.log('   数据保存在: data/realtime_fills.json');
console.log('\n   预计2-4小时后，当前3个持仓会平仓重开');
console.log('   新的开仓会被完整捕获，UI会显示准确的P&L！\n');
