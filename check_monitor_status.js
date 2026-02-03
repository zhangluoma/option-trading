#!/usr/bin/env node

/**
 * 检查实时监听器状态
 */

const fs = require('fs');
const path = require('path');
const { getPersist } = require('./blockchain_persist');

const REALTIME_FILLS_FILE = path.join(__dirname, 'data', 'realtime_fills.json');
const PID_FILE = path.join(__dirname, 'logs', 'monitor.pid');
const LOG_FILE = path.join(__dirname, 'logs', 'realtime_monitor.log');

console.log('🔴 实时监听器状态\n');
console.log('='.repeat(60));

// 1. 检查进程
if (fs.existsSync(PID_FILE)) {
  const pid = fs.readFileSync(PID_FILE, 'utf8').trim();
  
  try {
    process.kill(pid, 0); // 检查进程是否存活
    console.log(`✅ 监听器运行中 (PID: ${pid})`);
  } catch (e) {
    console.log(`❌ 监听器已停止 (PID: ${pid} 不存在)`);
  }
} else {
  console.log('❌ 未找到监听器进程');
}

console.log('='.repeat(60));

// 2. 监听进度
const persist = getPersist();
const stats = persist.getStats();

console.log('\n📊 监听进度:\n');
console.log(`  最后处理区块: ${stats.lastProcessedHeight.toLocaleString()}`);
console.log(`  已处理区块: ${stats.totalBlocksProcessed.toLocaleString()}`);
console.log(`  找到订单: ${stats.totalFillsFound}`);
console.log(`  Database订单: ${stats.cachedFills}`);

if (stats.firstScan && stats.lastScan) {
  const elapsed = (Date.now() - new Date(stats.firstScan)) / 1000 / 60;
  console.log(`  运行时长: ${Math.round(elapsed)} 分钟`);
  console.log(`  开始时间: ${new Date(stats.firstScan).toLocaleString('zh-CN', {timeZone: 'America/Los_Angeles'})}`);
  console.log(`  最后更新: ${new Date(stats.lastScan).toLocaleString('zh-CN', {timeZone: 'America/Los_Angeles'})}`);
}

console.log('='.repeat(60));

// 3. Database状态
console.log('\n💾 Database (realtime_fills.json):\n');

if (fs.existsSync(REALTIME_FILLS_FILE)) {
  try {
    const data = fs.readFileSync(REALTIME_FILLS_FILE, 'utf8');
    const fills = JSON.parse(data);
    console.log(`  ✅ 包含 ${fills.length} 条订单记录`);
    
    if (fills.length > 0) {
      console.log(`\n  最近订单 (前5条):`);
      fills.slice(0, 5).forEach((fill, i) => {
        const time = new Date(fill.createdAt).toLocaleString('zh-CN', {timeZone: 'America/Los_Angeles'});
        console.log(`    ${i + 1}. ${fill.ticker} ${fill.side} @ ${time} (区块 ${fill.height})`);
      });
      
      // 按ticker统计
      const byTicker = {};
      fills.forEach(f => {
        byTicker[f.ticker] = (byTicker[f.ticker] || 0) + 1;
      });
      
      console.log(`\n  按币种统计:`);
      Object.entries(byTicker).sort((a, b) => b[1] - a[1]).forEach(([ticker, count]) => {
        console.log(`    ${ticker}: ${count} 笔`);
      });
    }
  } catch (e) {
    console.log(`  ⚠️  文件存在但无法解析: ${e.message}`);
  }
} else {
  console.log(`  ⚠️  文件不存在（尚未捕获到订单）`);
}

console.log('='.repeat(60));

// 4. 最新日志
console.log('\n📝 最新日志 (最后15行):\n');

if (fs.existsSync(LOG_FILE)) {
  const logLines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(l => l.trim());
  const lastLines = logLines.slice(-15);
  lastLines.forEach(line => console.log('  ' + line));
} else {
  console.log('  日志文件不存在');
}

console.log('\n' + '='.repeat(60));
console.log('\n💡 使用说明:');
console.log('  - 监听器自动捕获新区块的订单');
console.log('  - 所有订单记录到 realtime_fills.json');
console.log('  - UI会自动显示database中的订单');
console.log('  - 断点续传：重启后自动从上次停的地方继续');
console.log('  - 查看实时日志: tail -f logs/realtime_monitor.log');
console.log('  - 停止监听器: kill $(cat logs/monitor.pid)');
