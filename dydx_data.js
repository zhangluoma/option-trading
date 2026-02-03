#!/usr/bin/env node
/**
 * dYdX数据模块 - 统一的链上数据访问接口（修正版）
 * 
 * 数据来源：
 * 1. 账户余额/持仓: Validator链上查询（不会被ban）
 * 2. 市场价格: Indexer Public Market API（公开的，不需要认证）
 * 
 * 数据格式：
 * - quantums使用Go big.Int的Gob编码
 * - 第一个字节: (version << 1) | sign_bit (version=1, sign: 0=+, 1=-)
 * - 剩余bytes: 绝对值的big-endian表示
 * - USDC: atomicResolution=-6 (÷10^6)
 * - 大部分perp: atomicResolution=-6 或 -7 或更高
 */

const {
  CompositeClient,
  Network,
  LocalWallet,
} = require('@dydxprotocol/v4-client-js');
const { decodeGobBigInt, quantumsToNumber } = require('./parse_quantums');
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

let clientCache = null;
let marketConfigCache = null;
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
 * 获取市场配置（包括atomicResolution）
 */
async function getMarketConfigs() {
  if (marketConfigCache) {
    return marketConfigCache;
  }
  
  const client = await getClient();
  
  try {
    // 从Indexer获取市场配置
    const markets = await client.indexerClient.markets.getPerpetualMarkets();
    
    marketConfigCache = {};
    
    for (const [market, config] of Object.entries(markets.markets)) {
      marketConfigCache[market] = {
        atomicResolution: config.atomicResolution,
        clobPairId: config.clobPairId,
        ticker: config.ticker,
        oraclePrice: parseFloat(config.oraclePrice || '0')
      };
    }
    
    return marketConfigCache;
  } catch (error) {
    console.error('[dydx_data] Failed to fetch market configs:', error.message);
    // 返回默认配置
    return {
      'BTC-USD': { atomicResolution: -10, clobPairId: 0 },
      'ETH-USD': { atomicResolution: -9, clobPairId: 1 },
      'LINK-USD': { atomicResolution: -6, clobPairId: 2 },
      'SOL-USD': { atomicResolution: -7, clobPairId: 5 },
    };
  }
}

/**
 * 获取所有市场价格（从dYdX Indexer）
 */
async function getAllPrices() {
  const now = Date.now();
  
  // 缓存10秒
  if (now - priceCacheTime < 10000 && Object.keys(priceCache).length > 0) {
    return priceCache;
  }
  
  const client = await getClient();
  
  try {
    const markets = await client.indexerClient.markets.getPerpetualMarkets();
    
    priceCache = {};
    
    for (const [market, config] of Object.entries(markets.markets)) {
      const ticker = market.replace('-USD', ''); // 'LINK-USD' -> 'LINK'
      const price = parseFloat(config.oraclePrice || '0');
      priceCache[ticker] = price;
    }
    
    priceCacheTime = now;
    return priceCache;
    
  } catch (error) {
    console.error('[dydx_data] Failed to fetch prices:', error.message);
    return priceCache; // 返回旧缓存
  }
}

/**
 * 获取单个币种价格
 */
async function getPrice(ticker) {
  const prices = await getAllPrices();
  return prices[ticker] || 0;
}

/**
 * 获取账户信息（从Validator链上查询）
 */
async function getAccountInfo() {
  const client = await getClient();
  const wallet = await LocalWallet.fromMnemonic(process.env.DYDX_MNEMONIC, 'dydx');
  const address = wallet.address;
  
  // 查询链上数据
  const subaccountData = await client.validatorClient.get.getSubaccount(address, 0);
  const sub = subaccountData.subaccount;
  
  // 解析USDC余额
  let usdcBalance = 0;
  if (sub.assetPositions && sub.assetPositions.length > 0) {
    const assetQuantums = decodeGobBigInt(sub.assetPositions[0].quantums);
    usdcBalance = quantumsToNumber(assetQuantums, -6); // USDC是6位小数
  }
  
  // 解析持仓
  const positions = [];
  const marketConfigs = await getMarketConfigs();
  
  if (sub.perpetualPositions && sub.perpetualPositions.length > 0) {
    for (const perp of sub.perpetualPositions) {
      const perpetualId = perp.perpetualId;
      const market = PERPETUAL_ID_TO_MARKET[perpetualId];
      
      if (!market) continue;
      
      const config = marketConfigs[market];
      if (!config) continue;
      
      // 解码quantums
      const quantums = decodeGobBigInt(perp.quantums);
      const size = quantumsToNumber(quantums, config.atomicResolution);
      
      if (size === 0) continue;
      
      const ticker = market.replace('-USD', '');
      const side = size > 0 ? 'LONG' : 'SHORT';
      
      positions.push({
        ticker,
        market,
        side,
        size: Math.abs(size),
        sizeQuantums: quantums,
        perpetualId
      });
    }
  }
  
  return {
    address,
    equity: usdcBalance, // 注意：这是USDC余额，不是总资产
    usdcBalance,
    positions
  };
}

/**
 * 获取完整账户状态（包括市场价格和计算出的总资产）
 */
async function getFullAccountStatus() {
  const [accountInfo, prices] = await Promise.all([
    getAccountInfo(),
    getAllPrices()
  ]);
  
  let totalPositionValue = 0;
  
  // 计算所有持仓的市值
  for (const pos of accountInfo.positions) {
    const price = prices[pos.ticker] || 0;
    const value = (pos.side === 'LONG' ? pos.size : -pos.size) * price;
    totalPositionValue += value;
  }
  
  // 总资产 = USDC余额 + 持仓市值
  const totalEquity = accountInfo.usdcBalance + totalPositionValue;
  
  // 计算已用保证金和可用保证金
  const usedMargin = Math.abs(totalPositionValue); // 简化计算
  const availableMargin = totalEquity - usedMargin;
  
  return {
    address: accountInfo.address,
    equity: totalEquity, // 真实的总资产
    usdcBalance: accountInfo.usdcBalance,
    usedMargin,
    availableMargin,
    positions: accountInfo.positions.map(pos => ({
      ...pos,
      currentPrice: prices[pos.ticker] || 0,
      value: (pos.side === 'LONG' ? pos.size : -pos.size) * (prices[pos.ticker] || 0)
    })),
    marketPrices: prices
  };
}

// 导出
/**
 * 获取余额（便捷函数）
 */
async function getBalance() {
  const status = await getFullAccountStatus();
  return {
    equity: status.equity,
    usdcBalance: status.usdcBalance,
    usedMargin: status.usedMargin,
    availableMargin: status.availableMargin
  };
}

/**
 * 获取持仓列表（便捷函数）
 */
async function getPositions() {
  const status = await getFullAccountStatus();
  return status.positions.map(pos => ({
    market: `${pos.ticker}-USD`,
    ticker: pos.ticker,
    side: pos.side,
    size: pos.size,
    currentPrice: pos.currentPrice,
    value: pos.value,
    entryPrice: pos.entryPrice || pos.currentPrice
  }));
}

module.exports = {
  getClient,
  getPrice,
  getAllPrices,
  getAccountInfo,
  getFullAccountStatus,
  getMarketConfigs,
  getBalance,
  getPositions
};

// CLI测试
if (require.main === module) {
  (async () => {
    try {
      console.log('\n' + '='.repeat(70));
      console.log('📊 dYdX账户状态（正确解析版）');
      console.log('='.repeat(70));
      
      const status = await getFullAccountStatus();
      
      console.log('\n💰 账户信息:');
      console.log(`   地址: ${status.address}`);
      console.log(`   总资产: $${status.equity.toFixed(2)}`);
      console.log(`   USDC余额: $${status.usdcBalance.toFixed(2)}`);
      console.log(`   已用保证金: $${status.usedMargin.toFixed(2)}`);
      console.log(`   可用保证金: $${status.availableMargin.toFixed(2)}`);
      
      console.log('\n📈 持仓 (' + status.positions.length + '个):');
      for (const pos of status.positions) {
        const pnl = pos.value;
        console.log(`   ${pos.ticker} ${pos.side}:`);
        console.log(`      数量: ${pos.size.toFixed(8)}`);
        console.log(`      当前价: $${pos.currentPrice.toFixed(4)}`);
        console.log(`      价值: $${pnl.toFixed(2)}`);
      }
      
      console.log('\n' + '='.repeat(70));
      console.log('✅ 数据来源: 100% dYdX (Validator + Indexer Public API)');
      console.log('✅ 解析方法: Go big.Int Gob编码');
      console.log('='.repeat(70) + '\n');
      
    } catch (error) {
      console.error('\n❌ Error:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  })();
}
