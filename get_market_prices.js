#!/usr/bin/env node
/**
 * 从dYdX链上获取所有市场价格
 */

const {
  CompositeClient,
  Network,
} = require('@dydxprotocol/v4-client-js');

require('dotenv').config();

async function getMarketPrices() {
  try {
    const client = await CompositeClient.connect(Network.mainnet());
    
    // 使用Indexer client的public方法（不需要认证）
    // 注意：这个是公开API，不会ban
    const markets = await client.indexerClient.markets.getPerpetualMarkets();
    
    const prices = {};
    
    if (markets && markets.markets) {
      for (const [market, data] of Object.entries(markets.markets)) {
        const ticker = market.replace('-USD', '');
        const oraclePrice = parseFloat(data.oraclePrice);
        prices[ticker] = oraclePrice;
      }
    }
    
    return prices;
    
  } catch (error) {
    console.error('Failed to get market prices:', error.message);
    return null;
  }
}

// 导出
module.exports = getMarketPrices;

// 直接运行
if (require.main === module) {
  getMarketPrices()
    .then(prices => {
      if (prices) {
        console.log('\n📊 dYdX市场价格 (链上Oracle):\n');
        
        const mainTickers = ['BTC', 'ETH', 'SOL', 'LINK', 'AVAX', 'DOGE', 'ATOM', 'DOT'];
        
        for (const ticker of mainTickers) {
          if (prices[ticker]) {
            console.log(`${ticker.padEnd(6)} $${prices[ticker].toLocaleString()}`);
          }
        }
        
        console.log('\n✅ 来源: dYdX Indexer Public API (不需要认证)');
      } else {
        console.error('Failed to get prices');
        process.exit(1);
      }
    })
    .catch(err => {
      console.error(err.message);
      process.exit(1);
    });
}
