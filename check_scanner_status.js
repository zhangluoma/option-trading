#!/usr/bin/env node

/**
 * 检查持续扫描器状态
 */

const fs = require('fs');
const path = require('path');
const { getPersist } = require('./blockchain_persist');

const REALTIME_FILLS_FILE = path.join(__dirname, 'data', 'realtime_fills.json');
const PID_FILE = path.join(__dirname, 'logs', 'scanner.pid');
const LOG_FILE = path.join(__dirname, 'logs', 'continuous_scanner.log');

console.log('🔍 持续扫描器状态\n');
console.log('='.repeat(60));

// 1. 检查进程
if (fs.existsSync(PID_FILE)) {
  const pid = fs.readFileSync(PID_FILE, 'utf8').trim();
  
  try {
    process.kill(pid, 0); // 检查进程是否存活
    console.log(`✅ 扫描器运行中 (PID: ${pid})`);
  } catch (e) {
    console.log(`❌ 扫描器已停止 (PID: ${pid} 不存在)`);
  }
} else {
  console.log('❌ 未找到扫描器进程');
}

console.log('='.repeat(60));

// 2. 扫描进度
const persist = getPersist();
const stats = persist.getStats();

console.log('\n📊 扫描进度:\n');
console.log(`  已处理区块: ${stats.totalBlocksProcessed.toLocaleString()}`);
console.log(`  找到订单: ${stats.totalFillsFound}`);
console.log(`  缓存订单: ${stats.cachedFills}`);

if (stats.firstScan) {
  const elapsed = (Date.now() - new Date(stats.firstScan)) / 1000;
  const speed = stats.totalBlocksProcessed / elapsed;
  console.log(`  扫描速度: ${speed.toFixed(1)} 区块/秒`);
  
  // 估算剩余时间（假设扫描20万区块）
  const remaining = 200000 - stats.totalBlocksProcessed;
  if (remaining > 0 && speed > 0) {
    const remainingMinutes = Math.round(remaining / speed / 60);
    console.log(`  预计剩余: ${remainingMinutes} 分钟 (扫描20万区块)`);
  }
}

if (stats.firstScan && stats.lastScan) {
  console.log(`  开始时间: ${new Date(stats.firstScan).toLocaleString('zh-CN', {timeZone: 'America/Los_Angeles'})}`);
  console.log(`  最后更新: ${new Date(stats.lastScan).toLocaleString('zh-CN', {timeZone: 'America/Los_Angeles'})}`);
}

console.log('='.repeat(60));

// 3. UI数据文件
console.log('\n📄 UI数据文件:\n');

if (fs.existsSync(REALTIME_FILLS_FILE)) {
  try {
    const data = fs.readFileSync(REALTIME_FILLS_FILE, 'utf8');
    const fills = JSON.parse(data);
    console.log(`  ✅ ${REALTIME_FILLS_FILE}`);
    console.log(`     包含 ${fills.length} 条订单`);
    
    if (fills.length > 0) {
      console.log(`\n  最近订单:`);
      fills.slice(0, 5).forEach((fill, i) => {
        const time = new Date(fill.createdAt).toLocaleString('zh-CN', {timeZone: 'America/Los_Angeles'});
        console.log(`    ${i + 1}. ${fill.ticker} ${fill.side} @ ${time}`);
      });
    }
  } catch (e) {
    console.log(`  ⚠️  文件存在但无法解析: ${e.message}`);
  }
} else {
  console.log(`  ⚠️  ${REALTIME_FILLS_FILE}`);
  console.log(`     文件不存在（尚未找到订单）`);
}

console.log('='.repeat(60));

// 4. 最新日志
console.log('\n📝 最新日志 (最后20行):\n');

if (fs.existsSync(LOG_FILE)) {
  const logLines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(l => l.trim());
  const lastLines = logLines.slice(-20);
  lastLines.forEach(line => console.log('  ' + line));
} else {
  console.log('  日志文件不存在');
}

console.log('\n' + '='.repeat(60));
console.log('\n💡 提示:');
console.log('  - 查看完整日志: tail -f logs/continuous_scanner.log');
console.log('  - 停止扫描器: kill $(cat logs/scanner.pid)');
console.log('  - 重启扫描器: node continuous_scanner.js');
console.log('  - UI会自动显示找到的订单，无需手动操作');
