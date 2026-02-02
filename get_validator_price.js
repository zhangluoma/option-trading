#!/usr/bin/env node
/**
 * 从dYdX Validator REST API获取价格（不用Indexer）
 */

const https = require('https');

// dYdX v4 Validator节点REST API endpoints
const VALIDATOR_ENDPOINTS = [
  'https://dydx-ops-rpc.kingnodes.com',
  'https://dydx-mainnet-rpc.autostake.com',
  'https://dydx-rpc.lavenderfive.com',
];

// 市场ID映射
const MARKET_ID_MAP = {
  'BTC': 0,
  'ETH': 1,
  'LINK': 2,
  'MATIC': 3,
  'CRV': 4,
  'SOL': 5,
  'ADA': 6,
  'AVAX': 7,
  'FIL': 8,
  'LTC': 9,
  'DOGE': 10,
  'ATOM': 11,
  'DOT': 12,
  'UNI': 13,
};

async function queryValidatorAPI(endpoint, path) {
  return new Promise((resolve, reject) => {
    const url = `${endpoint}${path}`;
    
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    }).on('error', (e) => {
      reject(e);
    });
  });
}

async function getValidatorPrice(ticker) {
  const marketId = MARKET_ID_MAP[ticker];
  
  if (marketId === undefined) {
    throw new Error(`Market ${ticker} not found`);
  }
  
  // 查询市场参数（包含oracle价格）
  const path = `/dydxprotocol/prices/market/${marketId}`;
  
  for (const endpoint of VALIDATOR_ENDPOINTS) {
    try {
      const data = await queryValidatorAPI(endpoint, path);
      
      if (data && data.market_price) {
        // 解析价格（通常是6位小数的整数表示）
        const price = parseFloat(data.market_price.price) / 1_000_000;
        return price;
      }
    } catch (e) {
      console.error(`Failed to query ${endpoint}: ${e.message}`);
      continue; // 尝试下一个endpoint
    }
  }
  
  throw new Error(`Failed to get price from all validators`);
}

// 导出
module.exports = getValidatorPrice;

// 直接运行
if (require.main === module) {
  const ticker = process.argv[2] || 'BTC';
  
  getValidatorPrice(ticker)
    .then(price => {
      console.log(price);
    })
    .catch(err => {
      console.error(err.message);
      process.exit(1);
    });
}
