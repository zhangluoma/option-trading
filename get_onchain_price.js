#!/usr/bin/env node
/**
 * 从dYdX链上获取Oracle价格（不用Indexer）
 */

const {
  CompositeClient,
  Network,
} = require('@dydxprotocol/v4-client-js');

// 市场ticker到ID的映射
const MARKET_ID_MAP = {
  'BTC-USD': 0,
  'ETH-USD': 1,
  'LINK-USD': 2,
  'MATIC-USD': 3,
  'CRV-USD': 4,
  'SOL-USD': 5,
  'ADA-USD': 6,
  'AVAX-USD': 7,
  'FIL-USD': 8,
  'LTC-USD': 9,
  'DOGE-USD': 10,
  'ATOM-USD': 11,
  'DOT-USD': 12,
  'UNI-USD': 13,
};

async function getOnchainPrice(ticker) {
  try {
    const client = await CompositeClient.connect(Network.mainnet());
    
    const market = `${ticker}-USD`;
    const marketId = MARKET_ID_MAP[market];
    
    if (marketId === undefined) {
      throw new Error(`Market ${market} not found`);
    }
    
    // 查询市场参数（包含oracle价格）
    const marketData = await client.validatorClient.get.getPerpetualMarket(marketId);
    
    if (!marketData?.market) {
      throw new Error(`No market data for ${market}`);
    }
    
    // 解析oracle价格
    // oraclePrice是10的-6次方表示（6位小数）
    const oraclePrice = marketData.market.oraclePrice;
    
    // 价格可能是字符串或BigInt
    let price;
    if (typeof oraclePrice === 'string') {
      price = parseInt(oraclePrice) / 1_000_000;
    } else if (typeof oraclePrice === 'bigint') {
      price = Number(oraclePrice) / 1_000_000;
    } else {
      price = oraclePrice;
    }
    
    return price;
    
  } catch (error) {
    console.error(`Failed to get price for ${ticker}:`, error.message);
    return null;
  }
}

// 导出
module.exports = getOnchainPrice;

// 直接运行
if (require.main === module) {
  const ticker = process.argv[2] || 'BTC';
  
  getOnchainPrice(ticker)
    .then(price => {
      if (price) {
        console.log(price);
      } else {
        console.error('Failed to get price');
        process.exit(1);
      }
    })
    .catch(err => {
      console.error(err.message);
      process.exit(1);
    });
}
