#!/usr/bin/env node

/**
 * Protobuf区块扫描器 - 直接解析交易
 * 不依赖block_results API
 * 完全去中心化方案
 */

require('dotenv').config();

const axios = require('axios');
const { decodeTxRaw } = require('@cosmjs/proto-signing');
const { getPersist } = require('./blockchain_persist');

// 使用v4-client-js内部已编译的Protobuf定义（绝对路径）
const path = require('path');
const clobTx = require(path.join(process.cwd(), 'node_modules/@dydxprotocol/v4-client-js/build/cjs/node_modules/@dydxprotocol/v4-proto/src/codegen/dydxprotocol/clob/tx.js'));
const clobOrder = require(path.join(process.cwd(), 'node_modules/@dydxprotocol/v4-client-js/build/cjs/node_modules/@dydxprotocol/v4-proto/src/codegen/dydxprotocol/clob/order.js'));

const ADDRESS = 'dydx1crq0p3qkxtk8v5hrzplu7wgtuwt0am6lnfm4je';
const VALIDATOR_REST = 'https://dydx-ops-rest.kingnodes.com';

// 市场ID映射
const PERPETUAL_MARKETS = {
  0: 'BTC-USD', 1: 'ETH-USD', 2: 'LINK-USD', 3: 'MATIC-USD',
  4: 'CRV-USD', 5: 'SOL-USD', 6: 'ADA-USD', 7: 'AVAX-USD',
  8: 'FIL-USD', 9: 'LTC-USD', 10: 'DOGE-USD', 11: 'ATOM-USD',
  12: 'DOT-USD', 13: 'UNI-USD', 14: 'BCH-USD', 15: 'TRX-USD',
  16: 'NEAR-USD', 17: 'MKR-USD', 18: 'XLM-USD', 19: 'ETC-USD',
  20: 'COMP-USD', 21: 'WLD-USD', 22: 'APE-USD', 23: 'APT-USD',
  24: 'ARB-USD', 25: 'BLUR-USD', 26: 'LDO-USD', 27: 'OP-USD',
  28: 'PEPE-USD', 29: 'SEI-USD', 30: 'SHIB-USD', 31: 'SUI-USD',
  32: 'XRP-USD'
};

/**
 * 获取最新区块高度
 */
async function getLatestHeight() {
  try {
    const res = await axios.get(`${VALIDATOR_REST}/cosmos/base/tendermint/v1beta1/blocks/latest`);
    return parseInt(res.data.block.header.height);
  } catch (error) {
    console.error('获取最新区块失败:', error.message);
    return null;
  }
}

/**
 * 获取区块
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
 * 从区块中提取订单（使用Protobuf）
 */
function extractOrdersFromBlock(block) {
  const orders = [];
  const txs = block.data.txs || [];
  const blockTime = block.header.time;
  const blockHeight = block.header.height;
  
  for (const txBase64 of txs) {
    try {
      // 解码交易
      const txBytes = Buffer.from(txBase64, 'base64');
      const tx = decodeTxRaw(txBytes);
      
      // 遍历消息
      for (const msg of tx.body.messages) {
        // 检查是否是PlaceOrder消息
        if (msg.typeUrl === '/dydxprotocol.clob.MsgPlaceOrder') {
          try {
            // 使用dYdX的Protobuf解码
            const placeOrderMsg = clobTx.MsgPlaceOrder.decode(msg.value);
            const order = placeOrderMsg.order;
            
            if (!order || !order.orderId || !order.orderId.subaccountId) {
              continue;
            }
            
            const owner = order.orderId.subaccountId.owner;
            
            // 检查是否是我们的地址
            if (owner === ADDRESS) {
              // 获取市场信息
              const clobPairId = order.orderId.clobPairId;
              const market = PERPETUAL_MARKETS[clobPairId] || `PERP-${clobPairId}`;
              const ticker = market.replace('-USD', '');
              
              // 提取订单信息
              const side = order.side === 1 ? 'BUY' : 'SELL';
              const quantums = order.quantums?.toString() || '0';
              const subticks = order.subticks?.toString() || '0';
              
              orders.push({
                height: blockHeight,
                time: blockTime,
                ticker: ticker,
                market: market,
                side: side,
                quantums: quantums,
                subticks: subticks,
                clientId: order.orderId.clientId,
                orderFlags: order.orderFlags,
                clobPairId: clobPairId,
                goodTilBlock: order.goodTilBlock?.toString(),
                goodTilBlockTime: order.goodTilBlockTime,
                timeInForce: order.timeInForce,
                reduceOnly: order.reduceOnly
              });
              
              console.log(`✅ 找到订单: ${ticker} ${side} @ 区块 ${blockHeight}`);
            }
          } catch (e) {
            // Protobuf解码失败，跳过
            if (e.message && !e.message.includes('index out of range')) {
              console.log(`   解码失败: ${e.message.substring(0, 50)}`);
            }
          }
        }
      }
    } catch (e) {
      // 交易解码失败，跳过
    }
  }
  
  return orders;
}

/**
 * 扫描区块（带持久化）
 */
async function scanBlocks(fromHeight, toHeight, delayMs = 500) {
  console.log(`🔍 扫描区块 ${fromHeight} - ${toHeight}...`);
  console.log(`⏱️  延迟: ${delayMs}ms/区块\n`);
  
  const persist = getPersist();
  const allOrders = [];
  let scannedBlocks = 0;
  let blocksWithOrders = 0;
  let skippedBlocks = 0;
  
  for (let height = toHeight; height >= fromHeight && allOrders.length < 100; height--) {
    // 跳过已处理的区块
    if (persist.isBlockProcessed(height)) {
      skippedBlocks++;
      continue;
    }
    
    const block = await getBlock(height);
    
    if (!block) {
      await new Promise(r => setTimeout(r, delayMs * 2));
      continue;
    }
    
    scannedBlocks++;
    
    const orders = extractOrdersFromBlock(block);
    
    if (orders.length > 0) {
      blocksWithOrders++;
      allOrders.push(...orders);
      
      // 保存到persist
      persist.addFills(orders.map(o => ({
        height: o.height,
        ticker: o.ticker,
        side: o.side,
        clientId: o.clientId,
        createdAt: o.time,
        type: 'ORDER'
      })));
    }
    
    // 标记已处理
    persist.markBlockProcessed(height, orders.length);
    
    // 每50个区块保存一次
    if (scannedBlocks % 50 === 0) {
      persist.save();
      console.log(`💾 已保存进度: ${scannedBlocks} 区块, ${allOrders.length} 订单`);
    }
    
    if (height % 10 === 0) {
      process.stdout.write(`  已扫描: ${scannedBlocks} 区块 (跳过${skippedBlocks}), ${allOrders.length} 订单...\r`);
    }
    
    // 延迟避免请求过快
    await new Promise(r => setTimeout(r, delayMs));
  }
  
  console.log(`\n\n扫描完成:`);
  console.log(`  扫描区块: ${scannedBlocks}`);
  console.log(`  跳过区块: ${skippedBlocks} (已处理)`);
  console.log(`  有订单: ${blocksWithOrders}`);
  console.log(`  找到订单: ${allOrders.length}\n`);
  
  // 最终保存
  persist.save();
  
  return allOrders;
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Protobuf区块扫描器 - 直接解析交易');
  console.log('='.repeat(60));
  console.log(`账户: ${ADDRESS}\n`);
  
  // 加载持久化状态
  const persist = getPersist();
  const stats = persist.getStats();
  
  console.log('📊 当前进度:');
  console.log(`  已处理到区块: ${stats.lastProcessedHeight}`);
  console.log(`  总共处理: ${stats.totalBlocksProcessed} 区块`);
  console.log(`  找到订单: ${stats.totalFillsFound} 条`);
  console.log(`  缓存数据: ${stats.cachedFills} 条\n`);
  
  const latestHeight = await getLatestHeight();
  
  if (!latestHeight) {
    console.error('❌ 无法获取最新区块高度');
    return;
  }
  
  console.log(`最新区块: ${latestHeight}\n`);
  
  // 使用persist layer确定扫描范围
  const { fromHeight, toHeight } = persist.getScanRange(latestHeight, 5000);
  
  console.log(`📍 扫描范围: ${fromHeight} → ${toHeight} (${toHeight - fromHeight + 1} 区块)\n`);
  
  const orders = await scanBlocks(fromHeight, toHeight, 500);
  
  if (orders.length > 0) {
    console.log('找到的订单:\n');
    
    orders.forEach((order, i) => {
      console.log(`${i + 1}. ${order.ticker} ${order.side}`);
      console.log(`   区块: ${order.height}`);
      console.log(`   时间: ${new Date(order.time).toLocaleString('zh-CN')}`);
      console.log(`   ClientId: ${order.clientId}`);
      console.log();
    });
    
    // 保存结果
    const fs = require('fs');
    const path = require('path');
    const outputFile = path.join(__dirname, 'data', 'protobuf_orders.json');
    
    fs.writeFileSync(outputFile, JSON.stringify(orders, null, 2));
    console.log(`💾 已保存到: ${outputFile}\n`);
  } else {
    console.log('⚠️  未找到订单\n');
    console.log('可能原因:');
    console.log('1. 扫描的区块范围内没有该账户的订单');
    console.log('2. 需要扫描更多历史区块');
    console.log('3. 订单可能已经被处理\n');
  }
  
  // 显示缓存的数据
  const cachedFills = persist.getFills(25);
  if (cachedFills.length > 0) {
    console.log(`📦 缓存中的数据（最近${cachedFills.length}条）:\n`);
    
    cachedFills.forEach((fill, i) => {
      console.log(`${i + 1}. ${fill.ticker || 'N/A'} ${fill.side || ''} @ 区块 ${fill.height}`);
    });
  }
}

module.exports = {
  scanBlocks,
  getLatestHeight,
  getBlock,
  extractOrdersFromBlock
};

if (require.main === module) {
  main().catch(console.error);
}
