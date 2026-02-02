#!/usr/bin/env node
/**
 * 持仓追踪器 - 记录开仓信息
 * 
 * 为什么需要：
 * - dYdX链上只保存当前持仓状态
 * - 不保存开仓价格、开仓时间等历史信息
 * - 我们需要本地记录这些信息来计算盈亏
 */

const fs = require('fs');
const path = require('path');

const TRACKER_FILE = './data/position_entries.json';

/**
 * 记录开仓信息
 */
function recordEntry(ticker, side, size, entryPrice, clientId) {
  let entries = {};
  
  // 读取现有记录
  if (fs.existsSync(TRACKER_FILE)) {
    try {
      entries = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
    } catch (e) {
      console.error('Failed to read entries:', e.message);
    }
  }
  
  // 记录新开仓
  const key = ticker;
  entries[key] = {
    ticker,
    side,
    size,
    entryPrice,
    openedAt: new Date().toISOString(),
    clientId,
  };
  
  // 保存
  fs.writeFileSync(TRACKER_FILE, JSON.stringify(entries, null, 2));
  
  console.log(`✅ Recorded entry for ${ticker}: ${side} ${size} @ $${entryPrice}`);
}

/**
 * 获取开仓信息
 */
function getEntry(ticker) {
  if (!fs.existsSync(TRACKER_FILE)) {
    return null;
  }
  
  try {
    const entries = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
    return entries[ticker] || null;
  } catch (e) {
    console.error('Failed to read entries:', e.message);
    return null;
  }
}

/**
 * 获取所有开仓信息
 */
function getAllEntries() {
  if (!fs.existsSync(TRACKER_FILE)) {
    return {};
  }
  
  try {
    return JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
  } catch (e) {
    console.error('Failed to read entries:', e.message);
    return {};
  }
}

/**
 * 删除开仓记录（平仓后）
 */
function removeEntry(ticker) {
  if (!fs.existsSync(TRACKER_FILE)) {
    return;
  }
  
  try {
    const entries = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
    delete entries[ticker];
    fs.writeFileSync(TRACKER_FILE, JSON.stringify(entries, null, 2));
    console.log(`✅ Removed entry for ${ticker}`);
  } catch (e) {
    console.error('Failed to remove entry:', e.message);
  }
}

/**
 * 更新最大盈利记录（用于移动止损）
 */
function updateMaxPnl(ticker, pnlPercent) {
  if (!fs.existsSync(TRACKER_FILE)) {
    return;
  }
  
  try {
    const entries = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
    if (entries[ticker]) {
      entries[ticker].maxPnlPercent = pnlPercent;
      fs.writeFileSync(TRACKER_FILE, JSON.stringify(entries, null, 2));
    }
  } catch (e) {
    console.error('Failed to update max PnL:', e.message);
  }
}

/**
 * 合并链上持仓和开仓记录
 */
function mergePositions(onchainPositions) {
  const entries = getAllEntries();
  const merged = [];
  
  for (const pos of onchainPositions) {
    const entry = entries[pos.ticker];
    
    if (entry) {
      // 有开仓记录，可以计算盈亏
      const currentPrice = pos.currentPrice;
      const entryPrice = entry.entryPrice;
      
      const pnl = pos.side === 'LONG'
        ? pos.size * (currentPrice - entryPrice)
        : pos.size * (entryPrice - currentPrice);
      
      const pnlPercent = (pnl / (pos.size * entryPrice)) * 100;
      
      merged.push({
        ...pos,
        entryPrice,
        openedAt: new Date(entry.openedAt),
        clientId: entry.clientId,
        maxPnlPercent: entry.maxPnlPercent || null,
        pnl,
        pnlPercent,
      });
    } else {
      // 没有开仓记录，无法计算盈亏
      merged.push({
        ...pos,
        entryPrice: pos.currentPrice, // 使用当前价作为参考
        openedAt: new Date().toISOString(),
        pnl: 0,
        pnlPercent: 0,
        warning: 'No entry record found',
      });
    }
  }
  
  return merged;
}

module.exports = {
  recordEntry,
  getEntry,
  getAllEntries,
  removeEntry,
  updateMaxPnl,
  mergePositions,
};

// 测试
if (require.main === module) {
  console.log('\n🔍 测试持仓追踪器...\n');
  
  // 测试记录
  recordEntry('BTC', 'LONG', 0.001, 76836, 123456);
  recordEntry('ETH', 'LONG', 0.1, 2300, 123457);
  
  // 测试读取
  console.log('\n所有记录:');
  console.log(JSON.stringify(getAllEntries(), null, 2));
  
  // 测试获取单个
  console.log('\nBTC记录:');
  console.log(getEntry('BTC'));
  
  // 测试删除
  removeEntry('ETH');
  
  console.log('\n删除ETH后:');
  console.log(JSON.stringify(getAllEntries(), null, 2));
}
