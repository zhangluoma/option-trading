#!/usr/bin/env node
/**
 * dYdX数据获取模块 - 所有数据来自dYdX
 * 
 * 数据来源：
 * 1. 账户/持仓 - Validator节点（链上）
 * 2. 价格 - Indexer Public Market API（公开的，无需认证）
 */

const {
  CompositeClient,
  Network,
  LocalWallet,
} = require('@dydxprotocol/v4-client-js');

require('dotenv').config();

// 市场ID映射
const PERPETUAL_ID_TO_MARKET = {
  0: 'BTC-USD', 1: 'ETH-USD', 2: 'LINK-USD', 3: 'MATIC-USD',
  4: 'CRV-USD', 5: 'SOL-USD', 6: 'ADA-USD', 7: 'AVAX-USD',
  8: 'FIL-USD', 9: 'LTC-USD', 10: 'DOGE-USD', 11: 'ATOM-USD',
  12: 'DOT-USD', 13: 'UNI-USD', 14: 'BCH-USD', 15: 'TRX-USD',
  16: 'NEAR-USD', 17: 'MKR-USD', 18: 'XLM-USD', 19: 'ETC-USD',
  20: 'COMP-USD', 21: 'WLD-USD', 22: 'APE-USD', 23: 'APT-USD',
  24: 'ARB-USD', 25: 'BLUR-USD', 26: 'LDO-USD', 27: 'OP-USD',
  28: 'PEPE-USD', 29: 'SEI-USD', 30: 'SHIB-USD', 31: 'SUI-USD',
  32: 'XRP-USD',
};

// Quantum exponent映射
const QUANTUM_EXPONENT = {
  'BTC-USD': -10, 'ETH-USD': -9, 'SOL-USD': -7, 'LINK-USD': -7,
  'AVAX-USD': -7, 'DOGE-USD': -5, 'ATOM-USD': -7, 'DOT-USD': -7,
  'MATIC-USD': -6, 'UNI-USD': -7, 'AAVE-USD': -8, 'LTC-USD': -8,
};

// BigInt辅助函数
function bigIntFromBytes(bytes) {
  if (!bytes || typeof bytes !== 'object') return 0n;
  
  let value = 0n;
  const keys = Object.keys(bytes).sort((a, b) => Number(a) - Number(b));
  
  for (const key of keys) {
    value = value << 8n;
    value = value | BigInt(bytes[key]);
  }
  
  return value;
}

let clientCache = null;
let priceCache = {};
let priceCacheTime = 0;

/**
 * 获取dYdX客户端
 */
async function getClient() {
  if (!clientCache) {
    clientCache = await CompositeClient.connect(Network.mainnet());
  }
  return clientCache;
}

/**
 * 获取钱包和地址
 */
async function getWallet() {
  const mnemonic = process.env.DYDX_MNEMONIC;
  if (!mnemonic) {
    throw new Error('DYDX_MNEMONIC not found in .env');
  }
  
  const wallet = await LocalWallet.fromMnemonic(mnemonic, 'dydx');
  return {
    wallet,
    address: wallet.address,
    subaccount: { address: wallet.address, subaccountNumber: 0 }
  };
}

/**
 * 获取账户信息（链上）
 */
async function getAccountInfo() {
  const client = await getClient();
  const { address } = await getWallet();
  
  const subaccountData = await client.validatorClient.get.getSubaccount(address, 0);
  
  if (!subaccountData?.subaccount) {
    throw new Error('Subaccount not found');
  }
  
  const sub = subaccountData.subaccount;
  
  // 解析USDC余额
  let usdcBalance = 0;
  if (sub.assetPositions && sub.assetPositions.length > 0) {
    const asset = sub.assetPositions[0];
    const quantums = bigIntFromBytes(asset.quantums);
    usdcBalance = Number(quantums) / 1_000_000; // 6位小数
  }
  
  // 解析持仓
  const positions = [];
  if (sub.perpetualPositions && sub.perpetualPositions.length > 0) {
    for (const pos of sub.perpetualPositions) {
      const perpetualId = pos.perpetualId;
      const market = PERPETUAL_ID_TO_MARKET[perpetualId] || `Unknown-${perpetualId}`;
      const ticker = market.split('-')[0];
      
      const quantums = bigIntFromBytes(pos.quantums);
      const exponent = QUANTUM_EXPONENT[market] || -9;
      const size = Number(quantums) / Math.pow(10, Math.abs(exponent));
      
      if (size !== 0) {
        positions.push({
          market,
          ticker,
          perpetualId,
          size: Math.abs(size),
          side: size > 0 ? 'LONG' : 'SHORT',
          quantums: quantums.toString(),
        });
      }
    }
  }
  
  return {
    equity: usdcBalance,
    freeCollateral: usdcBalance, // 简化版
    positions,
  };
}

/**
 * 获取所有市场价格（dYdX Indexer Public API）
 */
async function getAllPrices() {
  // 缓存30秒
  const now = Date.now();
  if (now - priceCacheTime < 30000 && Object.keys(priceCache).length > 0) {
    return priceCache;
  }
  
  try {
    const client = await getClient();
    
    // 使用公开的市场API（不需要认证）
    const markets = await client.indexerClient.markets.getPerpetualMarkets();
    
    const prices = {};
    
    if (markets && markets.markets) {
      for (const [market, data] of Object.entries(markets.markets)) {
        const ticker = market.replace('-USD', '');
        prices[ticker] = parseFloat(data.oraclePrice);
      }
    }
    
    priceCache = prices;
    priceCacheTime = now;
    
    return prices;
    
  } catch (error) {
    console.error('Failed to get prices from dYdX:', error.message);
    
    // 返回缓存的价格（如果有）
    if (Object.keys(priceCache).length > 0) {
      console.log('Using cached prices');
      return priceCache;
    }
    
    throw error;
  }
}

/**
 * 获取单个币种价格
 */
async function getPrice(ticker) {
  const prices = await getAllPrices();
  
  if (!prices[ticker]) {
    throw new Error(`Price for ${ticker} not found`);
  }
  
  return prices[ticker];
}

/**
 * 获取完整的账户状态（包含价格）
 */
async function getFullAccountStatus() {
  const accountInfo = await getAccountInfo();
  const prices = await getAllPrices();
  
  // 计算持仓价值和盈亏
  const positionsWithPnL = [];
  let totalPositionValue = 0;
  
  for (const pos of accountInfo.positions) {
    const currentPrice = prices[pos.ticker];
    
    if (!currentPrice) {
      console.warn(`Price not found for ${pos.ticker}`);
      continue;
    }
    
    const positionValue = pos.size * currentPrice;
    totalPositionValue += positionValue;
    
    positionsWithPnL.push({
      ...pos,
      currentPrice,
      positionValue,
    });
  }
  
  const totalEquity = accountInfo.equity;
  const usedMargin = totalPositionValue;
  const availableMargin = totalEquity - usedMargin;
  
  return {
    equity: totalEquity,
    usedMargin,
    availableMargin,
    positions: positionsWithPnL,
    marketPrices: prices,
  };
}

module.exports = {
  getClient,
  getWallet,
  getAccountInfo,
  getAllPrices,
  getPrice,
  getFullAccountStatus,
};

// 测试
if (require.main === module) {
  (async () => {
    console.log('\n🔍 测试dYdX数据获取...\n');
    
    try {
      const status = await getFullAccountStatus();
      
      console.log('='.repeat(70));
      console.log('📊 账户状态 (来自dYdX链上)');
      console.log('='.repeat(70));
      console.log(`\n💰 资产: $${status.equity.toFixed(2)}`);
      console.log(`📈 已用保证金: $${status.usedMargin.toFixed(2)}`);
      console.log(`💵 可用保证金: $${status.availableMargin.toFixed(2)}`);
      
      console.log(`\n📊 持仓 (${status.positions.length}个):\n`);
      
      for (const pos of status.positions) {
        console.log(`${pos.ticker}:`);
        console.log(`  方向: ${pos.side}`);
        console.log(`  数量: ${pos.size.toFixed(8)}`);
        console.log(`  当前价: $${pos.currentPrice.toFixed(4)}`);
        console.log(`  价值: $${pos.positionValue.toFixed(2)}`);
        console.log('');
      }
      
      console.log('='.repeat(70));
      console.log('✅ 所有数据来自dYdX');
      console.log('='.repeat(70));
      
    } catch (error) {
      console.error('Error:', error.message);
    }
  })();
}
