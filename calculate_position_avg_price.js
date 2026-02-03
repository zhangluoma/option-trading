#!/usr/bin/env node

/**
 * 从交易历史计算持仓均价
 * 
 * 算法：
 * 1. 从链上获取所有fills（成交记录）
 * 2. 按时间顺序处理
 * 3. 使用加权平均法计算持仓成本
 * 
 * 例子：
 * - Fill 1: BUY 10 BTC @ $50000
 * - Fill 2: SELL 2 BTC @ $51000
 * - Fill 3: SELL 3 BTC @ $52000
 * - 当前持仓: 5 BTC
 * - 持仓均价: (10*50000 - 2*50000 - 3*50000) / 5 = $50000
 */

/**
 * 计算持仓均价
 * @param {Array} fills - 所有成交记录，按时间升序
 * @param {string} ticker - 币种
 * @param {number} currentSize - 当前持仓量（正=LONG，负=SHORT）
 */
function calculateAvgEntryPrice(fills, ticker, currentSize) {
  // 过滤该币种的fills
  const tickerFills = fills
    .filter(f => f.ticker === ticker)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  
  if (tickerFills.length === 0) {
    return null;
  }
  
  // 模拟持仓变化 - 使用FIFO法
  let position = 0; // 当前持仓量
  let avgPrice = 0;  // 当前持仓均价
  
  for (const fill of tickerFills) {
    const fillSize = fill.size;
    const fillPrice = fill.price;
    const side = fill.side;
    
    if (position === 0) {
      // 从零开仓
      position = side === 'BUY' ? fillSize : -fillSize;
      avgPrice = fillPrice;
    } else if (
      (position > 0 && side === 'BUY') || 
      (position < 0 && side === 'SELL')
    ) {
      // 同向加仓 - 加权平均
      const oldCost = Math.abs(position) * avgPrice;
      const newCost = fillSize * fillPrice;
      const newPosition = position + (side === 'BUY' ? fillSize : -fillSize);
      avgPrice = (oldCost + newCost) / Math.abs(newPosition);
      position = newPosition;
    } else {
      // 反向减仓或反转
      const reduceSize = fillSize;
      
      if (Math.abs(position) > reduceSize) {
        // 部分平仓 - 均价不变
        position = position + (side === 'BUY' ? reduceSize : -reduceSize);
        // avgPrice保持不变
      } else if (Math.abs(position) === reduceSize) {
        // 完全平仓
        position = 0;
        avgPrice = 0;
      } else {
        // 完全平仓后反向开仓
        const remainingSize = reduceSize - Math.abs(position);
        position = side === 'BUY' ? remainingSize : -remainingSize;
        avgPrice = fillPrice;
      }
    }
  }
  
  const costBasis = position * avgPrice;
  
  // 验证最终持仓
  if (Math.abs(position - currentSize) > 0.001) {
    console.warn(`警告: 计算的持仓(${position})与实际持仓(${currentSize})不符`);
    console.warn('可能缺少部分交易记录');
  }
  
  // 返回结果
  if (Math.abs(position) < 0.001) {
    return null;
  }
  
  return {
    ticker,
    currentSize: position,
    avgEntryPrice: avgPrice,
    totalCost: Math.abs(costBasis),
    fillCount: tickerFills.length
  };
}

/**
 * 示例演示
 */
function demo() {
  console.log('='.repeat(60));
  console.log('持仓均价计算演示');
  console.log('='.repeat(60));
  
  // 模拟交易记录
  const fills = [
    {
      ticker: 'BTC',
      side: 'BUY',
      size: 10,
      price: 50000,
      createdAt: '2026-02-01T10:00:00Z'
    },
    {
      ticker: 'BTC',
      side: 'SELL',
      size: 2,
      price: 51000,
      createdAt: '2026-02-01T11:00:00Z'
    },
    {
      ticker: 'BTC',
      side: 'SELL',
      size: 3,
      price: 52000,
      createdAt: '2026-02-01T12:00:00Z'
    }
  ];
  
  console.log('\n交易历史:');
  fills.forEach((f, i) => {
    console.log(`${i + 1}. ${f.side} ${f.size} ${f.ticker} @ $${f.price}`);
  });
  
  const currentSize = 5; // 10 - 2 - 3 = 5
  
  const result = calculateAvgEntryPrice(fills, 'BTC', currentSize);
  
  console.log('\n计算结果:');
  console.log(`当前持仓: ${result.currentSize} BTC`);
  console.log(`持仓均价: $${result.avgEntryPrice.toFixed(2)}`);
  console.log(`总成本: $${result.totalCost.toFixed(2)}`);
  console.log(`成交数: ${result.fillCount}笔`);
  
  console.log('\n验证:');
  const expectedCost = 10 * 50000 - 2 * 50000 - 3 * 50000; // 剩余5个的成本
  const expectedAvg = expectedCost / 5;
  console.log(`预期均价: $${expectedAvg.toFixed(2)}`);
  console.log(`计算准确: ${Math.abs(result.avgEntryPrice - expectedAvg) < 0.01 ? '✅' : '❌'}`);
}

// 导出函数
module.exports = {
  calculateAvgEntryPrice
};

// 命令行运行演示
if (require.main === module) {
  demo();
}
