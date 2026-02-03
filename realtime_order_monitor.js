#!/usr/bin/env node

/**
 * 实时订单监听器 - 从现在开始捕获所有新订单
 * 完全去中心化，不依赖Indexer
 */

require('dotenv').config();

const axios = require('axios');
const { decodeTxRaw } = require('@cosmjs/proto-signing');
const path = require('path');
const fs = require('fs');

// Protobuf定义
const clobTx = require(path.join(process.cwd(), 'node_modules/@dydxprotocol/v4-client-js/build/cjs/node_modules/@dydxprotocol/v4-proto/src/codegen/dydxprotocol/clob/tx.js'));

const ADDRESS = 'dydx1crq0p3qkxtk8v5hrzplu7wgtuwt0am6lnfm4je';
const VALIDATOR_REST = 'https://dydx-ops-rest.kingnodes.com';
const FILLS_FILE = path.join(__dirname, 'data', 'realtime_fills.json');

// 市场映射
const MARKETS = {
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
 * 加载已保存的fills
 */
function loadFills() {
  try {
    if (fs.existsSync(FILLS_FILE)) {
      const data = fs.readFileSync(FILLS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('加载fills失败:', error.message);
  }
  return [];
}

/**
 * 保存fills
 */
function saveFills(fills) {
  try {
    const dir = path.dirname(FILLS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(FILLS_FILE, JSON.stringify(fills, null, 2));
  } catch (error) {
    console.error('保存fills失败:', error.message);
  }
}

/**
 * 获取最新区块高度
 */
async function getLatestHeight() {
  try {
    const res = await axios.get(`${VALIDATOR_REST}/cosmos/base/tendermint/v1beta1/blocks/latest`);
    return parseInt(res.data.block.header.height);
  } catch (error) {
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
 * 从区块提取订单
 */
function extractOrders(block, fills) {
  const txs = block.data.txs || [];
  const blockTime = block.header.time;
  const blockHeight = block.header.height;
  
  let found = 0;
  
  for (const txBase64 of txs) {
    try {
      const txBytes = Buffer.from(txBase64, 'base64');
      const tx = decodeTxRaw(txBytes);
      
      for (const msg of tx.body.messages) {
        if (msg.typeUrl === '/dydxprotocol.clob.MsgPlaceOrder') {
          try {
            const placeOrderMsg = clobTx.MsgPlaceOrder.decode(msg.value);
            const order = placeOrderMsg.order;
            
            if (!order || !order.orderId || !order.orderId.subaccountId) {
              continue;
            }
            
            const owner = order.orderId.subaccountId.owner;
            
            if (owner === ADDRESS) {
              const clobPairId = order.orderId.clobPairId;
              const market = MARKETS[clobPairId] || `PERP-${clobPairId}`;
              const ticker = market.replace('-USD', '');
              const side = order.side === 1 ? 'BUY' : 'SELL';
              
              const fill = {
                height: blockHeight,
                time: blockTime,
                ticker: ticker,
                market: market,
                side: side,
                quantums: order.quantums?.toString() || '0',
                subticks: order.subticks?.toString() || '0',
                clientId: order.orderId.clientId,
                clobPairId: clobPairId,
                type: 'ORDER',
                captured: new Date().toISOString()
              };
              
              fills.push(fill);
              found++;
              
              console.log(`\n🎉 捕获到订单！`);
              console.log(`   ${ticker} ${side}`);
              console.log(`   区块: ${blockHeight}`);
              console.log(`   时间: ${new Date(blockTime).toLocaleString('zh-CN')}`);
              console.log(`   总计: ${fills.length} 个订单\n`);
              
              // 立即保存
              saveFills(fills);
            }
          } catch (e) {
            // Protobuf解码失败
          }
        }
      }
    } catch (e) {
      // TX解码失败
    }
  }
  
  return found;
}

/**
 * 实时监听
 */
async function monitor() {
  console.log('='.repeat(60));
  console.log('🔴 实时订单监听器 - LIVE');
  console.log('='.repeat(60));
  console.log(`账户: ${ADDRESS}`);
  console.log(`存储: ${FILLS_FILE}`);
  console.log(`节点: ${VALIDATOR_REST}\n`);
  
  // 加载已有fills
  let fills = loadFills();
  console.log(`📦 已加载 ${fills.length} 个历史订单\n`);
  
  // 获取起始高度
  let lastHeight = await getLatestHeight();
  
  if (!lastHeight) {
    console.error('❌ 无法获取最新区块高度');
    return;
  }
  
  console.log(`🚀 开始监听，起始区块: ${lastHeight}`);
  console.log(`⏱️  检查间隔: 1秒\n`);
  console.log('等待新订单...\n');
  
  let checksCount = 0;
  
  // 监听循环
  while (true) {
    try {
      // 获取当前最新高度
      const currentHeight = await getLatestHeight();
      
      if (!currentHeight) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      
      // 如果有新区块
      if (currentHeight > lastHeight) {
        console.log(`📍 新区块: ${lastHeight + 1} → ${currentHeight}`);
        
        // 处理所有新区块
        for (let height = lastHeight + 1; height <= currentHeight; height++) {
          const block = await getBlock(height);
          
          if (block) {
            const found = extractOrders(block, fills);
            
            if (found === 0) {
              process.stdout.write(`   区块 ${height}: 无该账户订单\r`);
            }
          }
        }
        
        console.log(); // 换行
        lastHeight = currentHeight;
      } else {
        // 没有新区块，显示心跳
        checksCount++;
        if (checksCount % 10 === 0) {
          const now = new Date().toLocaleTimeString('zh-CN');
          console.log(`💓 [${now}] 监听中... 高度: ${currentHeight}, 已捕获: ${fills.length} 个订单`);
        }
      }
      
      // 等待1秒
      await new Promise(r => setTimeout(r, 1000));
      
    } catch (error) {
      console.error(`\n❌ 错误: ${error.message}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n\n🛑 收到退出信号，正在保存数据...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 收到终止信号，正在保存数据...');
  process.exit(0);
});

if (require.main === module) {
  monitor().catch(error => {
    console.error('监听器崩溃:', error);
    process.exit(1);
  });
}
