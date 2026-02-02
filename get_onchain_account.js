#!/usr/bin/env node
/**
 * 从dYdX链上读取账户数据（不用Indexer）
 */

const {
  CompositeClient,
  Network,
  LocalWallet,
} = require('@dydxprotocol/v4-client-js');

require('dotenv').config();

// 市场ID映射（从dYdX链上查询得到）
const PERPETUAL_ID_MAP = {
  0: 'BTC-USD',
  1: 'ETH-USD',
  2: 'LINK-USD',
  3: 'MATIC-USD',
  4: 'CRV-USD',
  5: 'SOL-USD',
  6: 'ADA-USD',
  7: 'AVAX-USD',
  8: 'FIL-USD',
  9: 'LTC-USD',
  10: 'DOGE-USD',
  11: 'ATOM-USD',
  12: 'DOT-USD',
  13: 'UNI-USD',
  14: 'BCH-USD',
  15: 'TRX-USD',
  16: 'NEAR-USD',
  17: 'MKR-USD',
  18: 'XLM-USD',
  19: 'ETC-USD',
  20: 'COMP-USD',
  21: 'WLD-USD',
  22: 'APE-USD',
  23: 'APT-USD',
  24: 'ARB-USD',
  25: 'BLUR-USD',
  26: 'LDO-USD',
  27: 'OP-USD',
  28: 'PEPE-USD',
  29: 'SEI-USD',
  30: 'SHIB-USD',
  31: 'SUI-USD',
  32: 'XRP-USD',
};

// quantumConversionExponent映射
const QUANTUM_EXPONENT_MAP = {
  'BTC-USD': -10,
  'ETH-USD': -9,
  'SOL-USD': -7,
  'LINK-USD': -7,
  'AVAX-USD': -7,
  'DOGE-USD': -5,
  'ATOM-USD': -7,
  'DOT-USD': -7,
};

function bigIntFromBytes(bytes) {
  // 从字节数组重构BigInt
  if (!bytes || typeof bytes !== 'object') return 0n;
  
  let value = 0n;
  const keys = Object.keys(bytes).sort((a, b) => Number(a) - Number(b));
  
  for (const key of keys) {
    value = value << 8n;
    value = value | BigInt(bytes[key]);
  }
  
  return value;
}

async function getOnchainAccount() {
  try {
    const mnemonic = process.env.DYDX_MNEMONIC;
    const wallet = await LocalWallet.fromMnemonic(mnemonic, 'dydx');
    const client = await CompositeClient.connect(Network.mainnet());
    
    const address = wallet.address;
    
    console.log('\n' + '='.repeat(70));
    console.log('📊 dYdX链上账户数据');
    console.log('='.repeat(70));
    console.log(`\n地址: ${address}\n`);
    
    // 查询子账户
    const subaccountData = await client.validatorClient.get.getSubaccount(
      address,
      0
    );
    
    if (!subaccountData?.subaccount) {
      console.log('❌ 未找到子账户数据');
      return;
    }
    
    const sub = subaccountData.subaccount;
    
    // 1. 解析USDC余额
    console.log('💰 USDC余额:');
    console.log('-'.repeat(70));
    
    if (sub.assetPositions && sub.assetPositions.length > 0) {
      for (const asset of sub.assetPositions) {
        const assetId = asset.assetId;
        const quantums = bigIntFromBytes(asset.quantums);
        
        // USDC使用6位小数
        const balance = Number(quantums) / 1_000_000;
        
        if (assetId === 0) {
          console.log(`USDC (Asset ${assetId}): $${balance.toFixed(6)}`);
        }
      }
    } else {
      console.log('无USDC余额');
    }
    
    // 2. 解析持仓
    console.log('\n📈 永续合约持仓:');
    console.log('-'.repeat(70));
    
    if (sub.perpetualPositions && sub.perpetualPositions.length > 0) {
      for (const pos of sub.perpetualPositions) {
        const perpetualId = pos.perpetualId;
        const quantums = bigIntFromBytes(pos.quantums);
        const market = PERPETUAL_ID_MAP[perpetualId] || `Unknown-${perpetualId}`;
        
        // 获取exponent
        const ticker = market.split('-')[0];
        const exponent = QUANTUM_EXPONENT_MAP[market] || -9;
        
        // 转换为实际大小
        const size = Number(quantums) / Math.pow(10, Math.abs(exponent));
        const side = size > 0 ? 'LONG' : 'SHORT';
        const absSize = Math.abs(size);
        
        console.log(`\n${market}:`);
        console.log(`  方向: ${side}`);
        console.log(`  数量: ${absSize.toFixed(8)}`);
        console.log(`  Perpetual ID: ${perpetualId}`);
        console.log(`  原始 quantums: ${quantums.toString()}`);
      }
    } else {
      console.log('无持仓');
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ 数据来源: dYdX链上（Validator节点）');
    console.log('✅ 无需Indexer API');
    console.log('='.repeat(70) + '\n');
    
    return {
      address,
      usdc: sub.assetPositions?.[0] ? Number(bigIntFromBytes(sub.assetPositions[0].quantums)) / 1_000_000 : 0,
      positions: sub.perpetualPositions || []
    };
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// 导出
module.exports = getOnchainAccount;

// 直接运行
if (require.main === module) {
  getOnchainAccount()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
