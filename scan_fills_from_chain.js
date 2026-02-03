#!/usr/bin/env node

/**
 * 从dYdX链上扫描fills（成交记录）
 * 不依赖本地存储，直接从区块链读取
 */

require('dotenv').config();

const axios = require('axios');
const {
  CompositeClient,
  Network,
} = require('@dydxprotocol/v4-client-js');

const ADDRESS = 'dydx1crq0p3qkxtk8v5hrzplu7wgtuwt0am6lnfm4je';
const VALIDATOR_REST = 'https://dydx-ops-rest.kingnodes.com';

// 市场ID到ticker的映射
const PERPETUAL_ID_TO_TICKER = {
  0: 'BTC',
  1: 'ETH',
  2: 'LINK',
  3: 'MATIC',
  4: 'CRV',
  5: 'SOL',
  6: 'ADA',
  7: 'AVAX',
  8: 'FIL',
  9: 'LTC',
  10: 'DOGE',
  11: 'ATOM',
  12: 'DOT',
  13: 'UNI',
  14: 'BCH',
  15: 'TRX',
  16: 'NEAR',
  17: 'MKR',
  18: 'XLM',
  19: 'ETC',
  20: 'COMP',
  21: 'WLD',
  22: 'APE',
  23: 'APT',
  24: 'ARB',
  25: 'BLUR',
  26: 'LDO',
  27: 'OP',
  28: 'PEPE',
  29: 'SEI',
  30: 'SHIB',
  31: 'SUI',
  32: 'XRP',
};

/**
 * 从subaccount状态推断最近的fills
 * 通过比较当前持仓和历史区块的持仓变化
 */
async function inferFillsFromPositionChanges(limit = 50) {
  console.log('🔍 从链上推断fills（通过持仓变化）...\n');
  
  try {
    const client = await CompositeClient.connect(Network.mainnet());
    
    // 获取当前持仓
    const currentSubaccount = await client.validatorClient.get.getSubaccount(ADDRESS, 0);
    const currentPositions = {};
    
    currentSubaccount.subaccount.perpetualPositions.forEach(pos => {
      const perpetualId = pos.perpetualId;
      const quantums = parseBigInt(pos.quantums);
      currentPositions[perpetualId] = quantums;
    });
    
    console.log('当前持仓:');
    Object.entries(currentPositions).forEach(([id, q]) => {
      const ticker = PERPETUAL_ID_TO_TICKER[id] || `ID${id}`;
      console.log(`  ${ticker}: ${q}`);
    });
    
    console.log('\n⚠️  链上只存储当前状态，无法直接查询历史fills');
    console.log('需要扫描历史区块或使用Indexer\n');
    
    return [];
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    return [];
  }
}

/**
 * 解析BigInt quantums
 */
function parseBigInt(quantumsObj) {
  if (!quantumsObj) return 0;
  
  // quantums是一个对象，需要转换
  if (typeof quantumsObj === 'object') {
    // 尝试解析为数字数组
    const bytes = [];
    for (let i = 0; i < 10; i++) {
      if (quantumsObj[i] !== undefined) {
        bytes.push(quantumsObj[i]);
      } else {
        break;
      }
    }
    
    // 简单转换（可能不准确，需要完整的Gob解析）
    let value = 0;
    for (let i = bytes.length - 1; i >= 0; i--) {
      value = value * 256 + bytes[i];
    }
    
    return value;
  }
  
  return parseInt(quantumsObj);
}

/**
 * 使用Indexer API获取fills（如果可用）
 */
async function getFillsFromIndexer(limit = 25) {
  console.log('🔍 尝试从Indexer获取fills...\n');
  
  try {
    const client = await CompositeClient.connect(Network.mainnet());
    
    const fills = await client.indexerClient.account.getSubaccountFills(
      ADDRESS,
      0,
      undefined,
      limit
    );
    
    if (fills && fills.fills && fills.fills.length > 0) {
      console.log(`✅ 成功从Indexer获取 ${fills.fills.length} 条fills\n`);
      
      return fills.fills.map(f => ({
        id: f.id,
        ticker: f.market ? f.market.replace('-USD', '') : '',
        market: f.market,
        side: f.side,
        size: parseFloat(f.size),
        price: parseFloat(f.price),
        fee: parseFloat(f.fee),
        type: f.type,
        createdAt: f.createdAt,
        liquidity: f.liquidity
      }));
    }
    
    return [];
    
  } catch (error) {
    if (error.response?.status === 403) {
      console.log('⚠️  Indexer API被geoblocked (403)\n');
    } else {
      console.error('❌ Indexer错误:', error.message, '\n');
    }
    return null;
  }
}

/**
 * 主函数 - 智能选择数据源
 */
async function scanFills(limit = 25) {
  console.log('='.repeat(60));
  console.log('从链上扫描Fills');
  console.log('='.repeat(60));
  console.log();
  
  // 方法1: 尝试Indexer
  const indexerFills = await getFillsFromIndexer(limit);
  
  if (indexerFills && indexerFills.length > 0) {
    return indexerFills;
  }
  
  // 方法2: 从持仓变化推断（受限）
  console.log('📋 Indexer不可用，尝试其他方法...\n');
  
  const inferredFills = await inferFillsFromPositionChanges(limit);
  
  if (inferredFills.length === 0) {
    console.log('💡 建议:');
    console.log('1. 使用VPN访问Indexer API');
    console.log('2. 运行本地Indexer节点');
    console.log('3. 等待开发区块扫描器（需要Protobuf解析）\n');
  }
  
  return inferredFills;
}

/**
 * 测试运行
 */
async function main() {
  const fills = await scanFills(25);
  
  if (fills.length > 0) {
    console.log('='.repeat(60));
    console.log(`找到 ${fills.length} 条Fills`);
    console.log('='.repeat(60));
    console.log();
    
    fills.slice(0, 10).forEach((fill, i) => {
      console.log(`${i + 1}. ${fill.ticker} ${fill.side}`);
      console.log(`   Size: ${fill.size}, Price: $${fill.price}`);
      console.log(`   Fee: $${fill.fee}, Type: ${fill.type}`);
      console.log(`   Time: ${new Date(fill.createdAt).toLocaleString('zh-CN')}`);
      console.log();
    });
    
    // 保存到临时文件（仅用于查看，不作为数据源）
    const fs = require('fs');
    const path = require('path');
    const outputFile = path.join(__dirname, 'data', 'chain_fills.json');
    
    fs.writeFileSync(outputFile, JSON.stringify(fills, null, 2));
    console.log(`💾 已保存到: ${outputFile} (仅供参考)\n`);
  } else {
    console.log('未找到fills。请使用VPN访问Indexer或等待区块扫描器开发。');
  }
}

module.exports = {
  scanFills,
  getFillsFromIndexer
};

if (require.main === module) {
  main().catch(console.error);
}
