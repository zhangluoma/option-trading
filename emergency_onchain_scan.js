#!/usr/bin/env node

/**
 * 紧急链上扫描 - 快速从链上获取该账户的历史订单
 * 扫描今天的所有区块
 */

require('dotenv').config();

const axios = require('axios');
const { decodeTxRaw } = require('@cosmjs/proto-signing');
const path = require('path');
const fs = require('fs');

const clobTx = require(path.join(process.cwd(), 'node_modules/@dydxprotocol/v4-client-js/build/cjs/node_modules/@dydxprotocol/v4-proto/src/codegen/dydxprotocol/clob/tx.js'));

const ADDRESS = 'dydx1crq0p3qkxtk8v5hrzplu7wgtuwt0am6lnfm4je';
const VALIDATOR_REST = 'https://dydx-ops-rest.kingnodes.com';

const MARKETS = {
  0: 'BTC-USD', 1: 'ETH-USD', 2: 'LINK-USD', 10: 'DOGE-USD', 11: 'ATOM-USD',
  7: 'AVAX-USD', 12: 'DOT-USD'
};

async function getLatestHeight() {
  const res = await axios.get(`${VALIDATOR_REST}/cosmos/base/tendermint/v1beta1/blocks/latest`);
  return parseInt(res.data.block.header.height);
}

async function getBlock(height) {
  try {
    const res = await axios.get(`${VALIDATOR_REST}/cosmos/base/tendermint/v1beta1/blocks/${height}`, { timeout: 2000 });
    return res.data.block;
  } catch (e) {
    return null;
  }
}

function extractOrders(block) {
  const orders = [];
  const txs = block.data.txs || [];
  
  for (const txBase64 of txs) {
    try {
      const txBytes = Buffer.from(txBase64, 'base64');
      const tx = decodeTxRaw(txBytes);
      
      for (const msg of tx.body.messages) {
        if (msg.typeUrl === '/dydxprotocol.clob.MsgPlaceOrder') {
          try {
            const placeOrderMsg = clobTx.MsgPlaceOrder.decode(msg.value);
            const order = placeOrderMsg.order;
            
            if (order?.orderId?.subaccountId?.owner === ADDRESS) {
              const clobPairId = order.orderId.clobPairId;
              const market = MARKETS[clobPairId] || `PERP-${clobPairId}`;
              
              orders.push({
                height: block.header.height,
                time: block.header.time,
                ticker: market.replace('-USD', ''),
                market: market,
                side: order.side === 1 ? 'BUY' : 'SELL',
                clientId: order.orderId.clientId,
                type: 'ONCHAIN'
              });
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }
  
  return orders;
}

async function quickScan() {
  console.log('🚀 紧急链上扫描 - 快速获取历史订单\n');
  
  const latest = await getLatestHeight();
  console.log(`最新区块: ${latest}\n`);
  
  // 扫描最近5000个区块（约1.4小时）
  const scanSize = 5000;
  const fromHeight = latest - scanSize;
  
  console.log(`扫描范围: ${fromHeight} → ${latest} (${scanSize}区块)\n`);
  console.log('快速扫描（无延迟）...\n');
  
  const allOrders = [];
  let scanned = 0;
  
  for (let h = latest; h >= fromHeight; h--) {
    const block = await getBlock(h);
    if (block) {
      const orders = extractOrders(block);
      if (orders.length > 0) {
        allOrders.push(...orders);
        console.log(`✅ 区块 ${h}: 找到 ${orders.length} 个订单`);
      }
      scanned++;
      
      if (scanned % 100 === 0) {
        process.stdout.write(`  已扫描: ${scanned}/${scanSize}, 找到: ${allOrders.length} 订单\r`);
      }
    }
  }
  
  console.log(`\n\n扫描完成: 找到 ${allOrders.length} 个订单\n`);
  
  if (allOrders.length > 0) {
    // 保存到realtime_fills.json
    const outputFile = path.join(__dirname, 'data', 'realtime_fills.json');
    fs.writeFileSync(outputFile, JSON.stringify(allOrders, null, 2));
    
    console.log(`💾 已保存到: ${outputFile}\n`);
    
    allOrders.forEach((o, i) => {
      console.log(`${i + 1}. ${o.ticker} ${o.side}`);
      console.log(`   区块: ${o.height}`);
      console.log(`   时间: ${new Date(o.time).toLocaleString('zh-CN')}`);
      console.log();
    });
    
    console.log('✅ UI现在可以从链上读取这些订单了！');
  } else {
    console.log('⚠️  没找到订单，可能需要扫描更大范围');
  }
}

quickScan().catch(console.error);
