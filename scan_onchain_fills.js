#!/usr/bin/env node

/**
 * 从链上扫描fills - 使用正确的dYdX Protobuf解析
 * 完全不依赖Indexer
 */

require('dotenv').config();

const axios = require('axios');
const { decodeTxRaw } = require('@cosmjs/proto-signing');
const { MsgPlaceOrder } = require('@dydxprotocol/v4-proto/src/codegen/dydxprotocol/clob/tx');
const { Order } = require('@dydxprotocol/v4-proto/src/codegen/dydxprotocol/clob/order');

const ADDRESS = 'dydx1crq0p3qkxtk8v5hrzplu7wgtuwt0am6lnfm4je';
const VALIDATOR_REST = 'https://dydx-ops-rest.kingnodes.com';

// Perpetual ID映射
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
 * 从区块中提取订单
 */
function extractOrdersFromBlock(block) {
  const orders = [];
  const txs = block.data.txs || [];
  const blockTime = block.header.time;
  const blockHeight = block.header.height;
  
  for (const txBase64 of txs) {
    try {
      const txBytes = Buffer.from(txBase64, 'base64');
      const tx = decodeTxRaw(txBytes);
      
      for (const msg of tx.body.messages) {
        // 检查是否是PlaceOrder消息
        if (msg.typeUrl === '/dydxprotocol.clob.MsgPlaceOrder') {
          try {
            // 使用dYdX的Protobuf解码
            const placeOrderMsg = MsgPlaceOrder.decode(msg.value);
            const order = placeOrderMsg.order;
            
            // 检查是否是我们的地址
            if (order && order.orderId && 
                order.orderId.subaccountId && 
                order.orderId.subaccountId.owner === ADDRESS) {
              
              // 解析订单信息
              const perpetualId = order.orderId.subaccountId.perpetualId || 
                                order.orderId.clobPairId;
              const market = PERPETUAL_MARKETS[perpetualId] || `PERP-${perpetualId}`;
              const ticker = market.replace('-USD', '');
              
              // 解析价格（subticks需要转换）
              // quantums是订单数量
              // 注意: 这些值需要根据market配置进行缩放
              
              orders.push({
                height: blockHeight,
                time: blockTime,
                ticker: ticker,
                market: market,
                side: order.side === 1 ? 'BUY' : 'SELL',
                quantums: order.quantums?.toString() || '0',
                subticks: order.subticks?.toString() || '0',
                clientId: order.orderId.clientId,
                orderFlags: order.orderFlags,
                timeInForce: order.timeInForce,
                reduceOnly: order.reduceOnly,
                txHash: Buffer.from(txBytes).toString('hex').substring(0, 64)
              });
              
              console.log(`✅ 找到订单: ${ticker} ${order.side === 1 ? 'BUY' : 'SELL'} @ 区块 ${blockHeight}`);
            }
          } catch (e) {
            // 解码失败，跳过
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
 * 扫描区块范围
 */
async function scanBlocks(fromHeight, toHeight, maxOrders = 50) {
  console.log(`🔍 扫描区块 ${fromHeight} - ${toHeight}...\n`);
  
  const allOrders = [];
  let scannedBlocks = 0;
  let blocksWithTxs = 0;
  
  for (let height = toHeight; height >= fromHeight && allOrders.length < maxOrders; height--) {
    const block = await getBlock(height);
    
    if (!block) continue;
    
    scannedBlocks++;
    
    if (block.data.txs && block.data.txs.length > 0) {
      blocksWithTxs++;
      
      const orders = extractOrdersFromBlock(block);
      allOrders.push(...orders);
    }
    
    if (height % 100 === 0) {
      process.stdout.write(`  已扫描: ${scannedBlocks} 区块, ${blocksWithTxs} 有交易, ${allOrders.length} 订单...\r`);
    }
  }
  
  console.log(`\n\n扫描完成:`);
  console.log(`  区块数: ${scannedBlocks}`);
  console.log(`  有交易: ${blocksWithTxs}`);
  console.log(`  找到订单: ${allOrders.length}\n`);
  
  return allOrders;
}

/**
 * 将订单转换为fills格式
 */
function ordersToFills(orders) {
  // 注意: Order不等于Fill
  // Order是下单记录，Fill是成交记录
  // 理想情况下需要从事件日志中提取实际的fills
  
  return orders.map(order => ({
    ticker: order.ticker,
    market: order.market,
    side: order.side,
    // 这里需要实际的成交价格和数量
    // 暂时使用order的值作为近似
    size: 0, // 需要从quantums转换
    price: 0, // 需要从subticks转换
    createdAt: order.time,
    type: 'ORDER', // 标记这是order而非fill
    height: order.height,
    clientId: order.clientId
  }));
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60));
  console.log('从链上扫描订单 - 使用dYdX Protobuf');
  console.log('='.repeat(60));
  console.log(`账户: ${ADDRESS}\n`);
  
  const latestHeight = await getLatestHeight();
  
  if (!latestHeight) {
    console.error('❌ 无法获取最新区块高度');
    return;
  }
  
  console.log(`最新区块: ${latestHeight}\n`);
  
  // 扫描最近5000个区块（约8-10小时）
  const scanRange = 5000;
  const fromHeight = Math.max(1, latestHeight - scanRange);
  
  const orders = await scanBlocks(fromHeight, latestHeight, 50);
  
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
    const outputFile = path.join(__dirname, 'data', 'onchain_orders.json');
    
    fs.writeFileSync(outputFile, JSON.stringify(orders, null, 2));
    console.log(`\n💾 已保存到: ${outputFile}\n`);
    
    console.log('📊 下一步:');
    console.log('需要从区块事件中提取实际的fills（成交记录）');
    console.log('当前提取的是orders（下单记录）\n');
  } else {
    console.log('❌ 未找到订单\n');
    console.log('可能原因:');
    console.log('1. 扫描的区块范围内没有该账户的订单');
    console.log('2. 需要扫描更多区块');
    console.log('3. 订单可能已经被处理\n');
  }
}

module.exports = {
  scanBlocks,
  getLatestHeight,
  extractOrdersFromBlock
};

if (require.main === module) {
  main().catch(console.error);
}
