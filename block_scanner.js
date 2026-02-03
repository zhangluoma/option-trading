#!/usr/bin/env node

/**
 * 区块扫描器 - 直接从链上读取fills
 * 不依赖Indexer，完全去中心化
 */

require('dotenv').config();

const axios = require('axios');
const { decodeTxRaw } = require('@cosmjs/proto-signing');

const ADDRESS = 'dydx1crq0p3qkxtk8v5hrzplu7wgtuwt0am6lnfm4je';
const VALIDATOR_REST = 'https://dydx-ops-rest.kingnodes.com';

// 市场ID映射
const PERPETUAL_ID_TO_TICKER = {
  0: 'BTC', 1: 'ETH', 2: 'LINK', 3: 'MATIC', 4: 'CRV',
  5: 'SOL', 6: 'ADA', 7: 'AVAX', 8: 'FIL', 9: 'LTC',
  10: 'DOGE', 11: 'ATOM', 12: 'DOT', 13: 'UNI', 14: 'BCH',
  15: 'TRX', 16: 'NEAR', 17: 'MKR', 18: 'XLM', 19: 'ETC',
  20: 'COMP', 21: 'WLD', 22: 'APE', 23: 'APT', 24: 'ARB',
  25: 'BLUR', 26: 'LDO', 27: 'OP', 28: 'PEPE', 29: 'SEI',
  30: 'SHIB', 31: 'SUI', 32: 'XRP'
};

/**
 * 获取最新区块高度
 */
async function getLatestHeight() {
  try {
    const res = await axios.get(`${VALIDATOR_REST}/cosmos/base/tendermint/v1beta1/blocks/latest`, {
      timeout: 5000
    });
    return parseInt(res.data.block.header.height);
  } catch (error) {
    console.error('获取最新区块失败:', error.message);
    return null;
  }
}

/**
 * 获取指定高度的区块
 */
async function getBlock(height) {
  try {
    const res = await axios.get(
      `${VALIDATOR_REST}/cosmos/base/tendermint/v1beta1/blocks/${height}`,
      { timeout: 3000 }
    );
    return res.data.block;
  } catch (error) {
    return null;
  }
}

/**
 * 解析区块中的交易
 */
function parseTransactions(block) {
  const txs = block.data.txs || [];
  const parsed = [];
  
  for (const txBase64 of txs) {
    try {
      const txBytes = Buffer.from(txBase64, 'base64');
      const tx = decodeTxRaw(txBytes);
      parsed.push(tx);
    } catch (e) {
      // 跳过无法解析的交易
    }
  }
  
  return parsed;
}

/**
 * 从交易中提取订单信息
 */
function extractOrdersFromTx(tx, blockHeight, blockTime) {
  const orders = [];
  
  for (const msg of tx.body.messages) {
    // 查找PlaceOrder消息
    if (msg.typeUrl && msg.typeUrl.includes('MsgPlaceOrder')) {
      try {
        // 尝试解析order数据
        // 注意: 这需要正确的Protobuf schema
        const order = parseOrderMessage(msg.value);
        
        if (order && order.owner === ADDRESS) {
          orders.push({
            height: blockHeight,
            time: blockTime,
            ...order
          });
        }
      } catch (e) {
        // 无法解析的消息
      }
    }
  }
  
  return orders;
}

/**
 * 解析Order消息（简化版）
 */
function parseOrderMessage(msgBytes) {
  // 注意: 这是简化版解析
  // 完整解析需要dYdX的Protobuf定义
  
  try {
    // 尝试查找地址特征
    const msgStr = msgBytes.toString('hex');
    
    // 如果包含我们的地址（去掉dydx前缀后的hex）
    // dydx1crq0p3qkxtk8v5hrzplu7wgtuwt0am6lnfm4je
    // 这是简化判断
    
    return null; // 需要完整Protobuf定义
  } catch (e) {
    return null;
  }
}

/**
 * 从事件日志提取fills信息
 */
async function extractFillsFromEvents(fromHeight, toHeight) {
  console.log(`🔍 扫描区块 ${fromHeight} - ${toHeight}...\n`);
  
  const fills = [];
  let scannedBlocks = 0;
  let blocksWithTxs = 0;
  
  for (let height = toHeight; height >= fromHeight && fills.length < 100; height--) {
    try {
      const block = await getBlock(height);
      
      if (!block) continue;
      
      scannedBlocks++;
      
      const txs = block.data.txs || [];
      
      if (txs.length > 0) {
        blocksWithTxs++;
        
        // 解析交易
        const parsedTxs = parseTransactions(block);
        
        for (const tx of parsedTxs) {
          const orders = extractOrdersFromTx(tx, height, block.header.time);
          
          if (orders.length > 0) {
            fills.push(...orders);
            console.log(`✅ 区块 ${height}: 找到 ${orders.length} 个订单`);
          }
        }
      }
      
      if (height % 100 === 0) {
        process.stdout.write(`  已扫描 ${scannedBlocks} 个区块，${blocksWithTxs} 个有交易...\r`);
      }
      
    } catch (error) {
      // 跳过错误的区块
    }
  }
  
  console.log(`\n\n扫描完成:`);
  console.log(`  扫描区块: ${scannedBlocks}`);
  console.log(`  有交易的区块: ${blocksWithTxs}`);
  console.log(`  找到订单: ${fills.length}\n`);
  
  return fills;
}

/**
 * 使用RPC订阅实时区块（备选方案）
 */
async function subscribeToBlocks() {
  console.log('📡 实时监听新区块...\n');
  console.log('⚠️  WebSocket订阅需要额外实现\n');
  
  // 轮询方式
  let lastHeight = await getLatestHeight();
  
  setInterval(async () => {
    const currentHeight = await getLatestHeight();
    
    if (currentHeight && currentHeight > lastHeight) {
      console.log(`\n新区块: ${lastHeight + 1} - ${currentHeight}`);
      
      const fills = await extractFillsFromEvents(lastHeight + 1, currentHeight);
      
      if (fills.length > 0) {
        console.log(`✅ 找到 ${fills.length} 个新订单`);
      }
      
      lastHeight = currentHeight;
    }
  }, 5000); // 每5秒检查一次
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60));
  console.log('dYdX 区块扫描器 - 直接从链上读取');
  console.log('='.repeat(60));
  console.log(`账户: ${ADDRESS}`);
  console.log(`节点: ${VALIDATOR_REST}\n`);
  
  const latestHeight = await getLatestHeight();
  
  if (!latestHeight) {
    console.error('❌ 无法获取最新区块高度');
    return;
  }
  
  console.log(`最新区块: ${latestHeight}\n`);
  
  // 扫描最近1000个区块（约1小时）
  const scanBlocks = 1000;
  const fromHeight = Math.max(1, latestHeight - scanBlocks);
  
  console.log('⚠️  当前限制:');
  console.log('区块中的交易是Protobuf编码');
  console.log('需要dYdX v4的Protobuf定义才能完全解析');
  console.log('正在尝试提取可识别的信息...\n');
  
  const fills = await extractFillsFromEvents(fromHeight, latestHeight);
  
  if (fills.length > 0) {
    console.log('找到的订单:');
    fills.forEach((fill, i) => {
      console.log(`${i + 1}. 区块 ${fill.height}`);
      console.log(`   时间: ${fill.time}`);
    });
  } else {
    console.log('❌ 未找到订单\n');
    console.log('原因:');
    console.log('1. 需要完整的Protobuf解析');
    console.log('2. 交易消息是二进制编码');
    console.log('3. 需要dYdX v4的.proto文件\n');
    
    console.log('解决方案:');
    console.log('1. 集成dYdX v4 Protobuf定义');
    console.log('2. 使用dYdX SDK的解析工具');
    console.log('3. 参考官方Indexer实现\n');
  }
}

module.exports = {
  getLatestHeight,
  getBlock,
  extractFillsFromEvents,
  subscribeToBlocks
};

if (require.main === module) {
  main().catch(console.error);
}
