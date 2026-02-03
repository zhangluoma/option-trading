#!/usr/bin/env node

/**
 * 从dYdX链上获取fills（成交记录）
 * 
 * 策略：
 * 1. 优先使用Indexer API（如果可用）
 * 2. 备选：扫描最近区块的事件
 * 3. 最后：使用daemon本地记录
 */

require('dotenv').config();

const {
  CompositeClient,
  Network,
} = require('@dydxprotocol/v4-client-js');

const ADDRESS = 'dydx1crq0p3qkxtk8v5hrzplu7wgtuwt0am6lnfm4je';

/**
 * 方法1: 尝试Indexer API
 */
async function fetchFillsFromIndexer(limit = 100) {
  try {
    const client = await CompositeClient.connect(Network.mainnet());
    
    const fills = await client.indexerClient.account.getSubaccountFills(
      ADDRESS,
      0,
      undefined, // all markets
      limit
    );
    
    return fills.fills || [];
  } catch (error) {
    if (error.response?.status === 403) {
      console.log('⚠️  Indexer API被封锁（403）');
    } else {
      console.error('Indexer查询失败:', error.message);
    }
    return null;
  }
}

/**
 * 方法2: 从本地daemon记录读取
 */
function fetchFillsFromLocal() {
  const fs = require('fs');
  const path = require('path');
  
  const historyFile = path.join(__dirname, 'data', 'trade_history.json');
  
  if (!fs.existsSync(historyFile)) {
    return [];
  }
  
  try {
    const history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    
    // 转换为fills格式
    const fills = [];
    
    for (const trade of history) {
      // 开仓fill
      fills.push({
        ticker: trade.ticker,
        side: trade.side === 'LONG' ? 'BUY' : 'SELL',
        size: trade.size,
        price: trade.entryPrice,
        createdAt: trade.openedAt,
        type: 'OPEN'
      });
      
      // 平仓fill
      if (trade.status === 'CLOSED' && trade.closePrice) {
        fills.push({
          ticker: trade.ticker,
          side: trade.side === 'LONG' ? 'SELL' : 'BUY', // 反向
          size: trade.size,
          price: trade.closePrice,
          createdAt: trade.closedAt,
          type: 'CLOSE'
        });
      }
    }
    
    // 按时间排序
    fills.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    
    return fills;
  } catch (error) {
    console.error('读取本地记录失败:', error.message);
    return [];
  }
}

/**
 * 从实时监听器读取fills（链上数据）
 */
function fetchFillsFromRealtimeMonitor() {
  const fs = require('fs');
  const path = require('path');
  
  try {
    const realtimeFile = path.join(__dirname, 'data', 'realtime_fills.json');
    
    if (fs.existsSync(realtimeFile)) {
      const data = fs.readFileSync(realtimeFile, 'utf8');
      const fills = JSON.parse(data);
      
      // 转换为标准格式
      return fills.map(f => ({
        ticker: f.ticker,
        market: f.market,
        side: f.side,
        size: 0, // TODO: 从quantums转换
        price: 0, // TODO: 从subticks转换
        createdAt: f.time,
        type: 'ONCHAIN', // 标记为链上数据
        height: f.height,
        clientId: f.clientId
      }));
    }
  } catch (error) {
    console.error('读取实时监听器数据失败:', error.message);
  }
  
  return [];
}

/**
 * 获取fills（优先链上，不依赖本地）
 */
async function getFills(limit = 100) {
  console.log('📊 获取交易fills...\n');
  
  // 优先1: 实时监听器捕获的数据（真正的链上！）
  console.log('1. 检查实时监听器数据（链上）...');
  const realtimeFills = fetchFillsFromRealtimeMonitor();
  
  if (realtimeFills.length > 0) {
    console.log(`✅ 从实时监听器获取${realtimeFills.length}条记录（链上）\n`);
    return realtimeFills.slice(-limit);
  }
  
  console.log('   实时监听器数据: 0条（监听器刚启动，等待捕获）\n');
  
  // 优先2: 尝试Indexer API（链上数据）
  console.log('2. 尝试Indexer API（链上）...');
  const indexerFills = await fetchFillsFromIndexer(limit);
  
  if (indexerFills && indexerFills.length > 0) {
    console.log(`✅ 从Indexer获取${indexerFills.length}条记录（链上）\n`);
    return indexerFills;
  }
  
  console.log('   Indexer不可用（geoblocked）\n');
  
  // Fallback: 临时显示本地daemon记录（明确标注）
  console.log('3. Fallback: 使用本地daemon记录（临时显示，明确标注）...');
  const localFills = fetchFillsFromLocal();
  
  if (localFills.length > 0) {
    console.log(`⚠️  显示${localFills.length}条本地记录（daemon记录，非链上）\n`);
    console.log('   说明: 链上扫描需要70,000+区块（10+小时）');
    console.log('   临时显示本地记录，等实时监听器捕获新订单\n');
    
    // 标记为本地数据
    return localFills.slice(-limit).map(f => ({
      ...f,
      type: 'LOCAL', // 明确标记为本地记录
      source: 'daemon' // 来源标记
    }));
  }
  
  console.log('❌ 无可用数据源\n');
  return [];
}

/**
 * 测试
 */
async function main() {
  console.log('='.repeat(60));
  console.log('链上Fills获取测试');
  console.log('='.repeat(60));
  console.log();
  
  const fills = await getFills(25);
  
  if (fills.length === 0) {
    console.log('未找到任何fills记录');
    console.log('\n建议:');
    console.log('1. 使用VPN访问Indexer API');
    console.log('2. 确保daemon已记录交易历史');
    console.log('3. 等待新的交易产生');
    return;
  }
  
  console.log(`找到 ${fills.length} 条fills:\n`);
  
  fills.slice(0, 10).forEach((fill, i) => {
    console.log(`${i + 1}. ${fill.ticker || fill.market} ${fill.side}`);
    console.log(`   Size: ${fill.size}, Price: $${fill.price}`);
    console.log(`   Time: ${new Date(fill.createdAt).toLocaleString('zh-CN')}`);
    console.log();
  });
  
  // 按ticker分组统计
  const byTicker = {};
  fills.forEach(f => {
    const ticker = f.ticker || (f.market && f.market.replace('-USD', ''));
    if (!byTicker[ticker]) {
      byTicker[ticker] = [];
    }
    byTicker[ticker].push(f);
  });
  
  console.log('按币种统计:');
  Object.entries(byTicker).forEach(([ticker, fills]) => {
    console.log(`  ${ticker}: ${fills.length}条fills`);
  });
}

module.exports = {
  getFills,
  fetchFillsFromIndexer,
  fetchFillsFromLocal
};

if (require.main === module) {
  main().catch(console.error);
}
