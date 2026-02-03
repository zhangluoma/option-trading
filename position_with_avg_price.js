#!/usr/bin/env node

/**
 * 整合功能：从链上fills计算持仓均价
 */

const { getFills } = require('./onchain_fills_fetcher');
const { calculateAvgEntryPrice } = require('./calculate_position_avg_price');
const dydxData = require('./dydx_data');

async function getPositionsWithAvgPrice() {
  console.log('📊 获取持仓并计算均价...\n');
  
  // 1. 获取当前链上持仓
  const status = await dydxData.getFullAccountStatus();
  const currentPositions = status.positions;
  
  console.log(`当前持仓: ${currentPositions.length}个\n`);
  
  // 2. 获取所有fills
  const fills = await getFills(100);
  
  if (fills.length === 0) {
    console.log('❌ 无fills数据，无法计算均价');
    return [];
  }
  
  console.log(`Fills记录: ${fills.length}条\n`);
  
  // 3. 标准化fills格式
  const normalizedFills = fills.map(f => ({
    ticker: f.ticker || (f.market && f.market.replace('-USD', '')),
    side: f.side,
    size: parseFloat(f.size),
    price: parseFloat(f.price),
    createdAt: f.createdAt
  }));
  
  // 4. 为每个持仓计算均价
  const positionsWithAvg = [];
  
  for (const pos of currentPositions) {
    const ticker = pos.ticker;
    const currentSize = pos.side === 'LONG' ? pos.size : -pos.size;
    
    // 计算均价
    const result = calculateAvgEntryPrice(normalizedFills, ticker, currentSize);
    
    if (result) {
      positionsWithAvg.push({
        ticker: pos.ticker,
        side: pos.side,
        size: pos.size,
        currentPrice: pos.currentPrice,
        avgEntryPrice: result.avgEntryPrice,
        pnl: calculatePnl(pos, result.avgEntryPrice),
        pnlPercent: calculatePnlPercent(pos, result.avgEntryPrice),
        fillCount: result.fillCount
      });
    } else {
      // 没有fills记录，使用当前价
      positionsWithAvg.push({
        ticker: pos.ticker,
        side: pos.side,
        size: pos.size,
        currentPrice: pos.currentPrice,
        avgEntryPrice: pos.currentPrice,
        pnl: 0,
        pnlPercent: 0,
        fillCount: 0,
        warning: '无fills记录'
      });
    }
  }
  
  return positionsWithAvg;
}

function calculatePnl(position, avgEntryPrice) {
  const size = position.size;
  const current = position.currentPrice;
  const entry = avgEntryPrice;
  
  if (position.side === 'LONG') {
    return size * (current - entry);
  } else {
    return size * (entry - current);
  }
}

function calculatePnlPercent(position, avgEntryPrice) {
  const pnl = calculatePnl(position, avgEntryPrice);
  const costBasis = position.size * avgEntryPrice;
  
  return (pnl / costBasis) * 100;
}

async function main() {
  console.log('='.repeat(60));
  console.log('持仓均价完整计算');
  console.log('='.repeat(60));
  console.log();
  
  const positions = await getPositionsWithAvgPrice();
  
  if (positions.length === 0) {
    console.log('当前无持仓');
    return;
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('持仓详情（包含均价和P&L）');
  console.log('='.repeat(60));
  console.log();
  
  positions.forEach((pos, i) => {
    console.log(`${i + 1}. ${pos.ticker} ${pos.side}`);
    console.log(`   数量: ${pos.size}`);
    console.log(`   开仓均价: $${pos.avgEntryPrice.toFixed(4)}`);
    console.log(`   当前价格: $${pos.currentPrice.toFixed(4)}`);
    console.log(`   P&L: ${pos.pnl >= 0 ? '+' : ''}$${pos.pnl.toFixed(2)} (${pos.pnlPercent >= 0 ? '+' : ''}${pos.pnlPercent.toFixed(2)}%)`);
    console.log(`   Fills数: ${pos.fillCount}笔`);
    if (pos.warning) {
      console.log(`   ⚠️  ${pos.warning}`);
    }
    console.log();
  });
  
  // 总P&L
  const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);
  console.log('总未实现P&L: ' + (totalPnl >= 0 ? '+' : '') + `$${totalPnl.toFixed(2)}`);
}

module.exports = {
  getPositionsWithAvgPrice
};

if (require.main === module) {
  main().catch(console.error);
}
