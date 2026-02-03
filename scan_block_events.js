#!/usr/bin/env node

/**
 * 从区块事件日志提取fills
 * 完全去中心化，不需要Protobuf解析
 */

require('dotenv').config();

const axios = require('axios');

const ADDRESS = 'dydx1crq0p3qkxtk8v5hrzplu7wgtuwt0am6lnfm4je';
const VALIDATOR_REST = 'https://dydx-ops-rest.kingnodes.com';

/**
 * 获取区块结果（包含事件）
 */
async function getBlockResults(height) {
  try {
    const res = await axios.get(
      `${VALIDATOR_REST}/cosmos/base/tendermint/v1beta1/block_results/${height}`,
      { timeout: 3000 }
    );
    return res.data;
  } catch (error) {
    return null;
  }
}

/**
 * 从事件中提取fills
 */
function extractFillsFromEvents(blockResults, height) {
  const fills = [];
  
  // 检查begin_block_events
  const beginEvents = blockResults.begin_block_events || [];
  const fillEvents = beginEvents.filter(e => 
    e.type === 'order_fill' || 
    e.type.includes('fill') ||
    e.type.includes('match')
  );
  
  for (const event of fillEvents) {
    try {
      const fill = parseEventAttributes(event, height);
      
      if (fill && (fill.maker === ADDRESS || fill.taker === ADDRESS)) {
        fills.push(fill);
      }
    } catch (e) {
      // 解析失败
    }
  }
  
  // 检查end_block_events
  const endEvents = blockResults.end_block_events || [];
  const endFillEvents = endEvents.filter(e => 
    e.type === 'order_fill' || 
    e.type.includes('fill') ||
    e.type.includes('match')
  );
  
  for (const event of endFillEvents) {
    try {
      const fill = parseEventAttributes(event, height);
      
      if (fill && (fill.maker === ADDRESS || fill.taker === ADDRESS)) {
        fills.push(fill);
      }
    } catch (e) {
      // 解析失败
    }
  }
  
  // 检查交易结果事件
  const txsResults = blockResults.txs_results || [];
  for (const txResult of txsResults) {
    const events = txResult.events || [];
    
    for (const event of events) {
      if (event.type === 'order_fill' || event.type.includes('fill')) {
        try {
          const fill = parseEventAttributes(event, height);
          
          if (fill && (fill.maker === ADDRESS || fill.taker === ADDRESS)) {
            fills.push(fill);
          }
        } catch (e) {
          // 解析失败
        }
      }
    }
  }
  
  return fills;
}

/**
 * 解析事件属性
 */
function parseEventAttributes(event, height) {
  const attrs = {};
  
  if (event.attributes) {
    for (const attr of event.attributes) {
      try {
        const key = Buffer.from(attr.key, 'base64').toString('utf8');
        const value = Buffer.from(attr.value, 'base64').toString('utf8');
        attrs[key] = value;
      } catch (e) {
        // 跳过无法解析的属性
      }
    }
  }
  
  return {
    height,
    type: event.type,
    maker: attrs.maker || attrs.maker_address,
    taker: attrs.taker || attrs.taker_address,
    market: attrs.market || attrs.pair,
    price: attrs.price,
    size: attrs.size || attrs.amount,
    fee: attrs.fee,
    ...attrs
  };
}

/**
 * Sleep函数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 扫描区块事件（带rate limit处理）
 */
async function scanBlockEvents(fromHeight, toHeight, delayMs = 200) {
  console.log(`🔍 扫描区块事件 ${fromHeight} - ${toHeight}...`);
  console.log(`⏱️  Rate limit保护: ${delayMs}ms延迟\n`);
  
  const allFills = [];
  let scannedBlocks = 0;
  let blocksWithFills = 0;
  let rateLimitErrors = 0;
  
  for (let height = toHeight; height >= fromHeight && allFills.length < 50; height--) {
    try {
      const blockResults = await getBlockResults(height);
      
      if (!blockResults) {
        rateLimitErrors++;
        
        if (rateLimitErrors > 3) {
          console.log(`\n⚠️  连续${rateLimitErrors}次失败，增加延迟到${delayMs * 2}ms`);
          delayMs *= 2;
          rateLimitErrors = 0;
        }
        
        await sleep(delayMs * 2);
        continue;
      }
      
      rateLimitErrors = 0; // 重置错误计数
      scannedBlocks++;
      
      const fills = extractFillsFromEvents(blockResults, height);
      
      if (fills.length > 0) {
        blocksWithFills++;
        allFills.push(...fills);
        
        console.log(`✅ 区块 ${height}: 找到 ${fills.length} 个fills`);
        fills.forEach(f => {
          console.log(`   ${f.type} - ${f.market || 'N/A'}`);
        });
      }
      
      if (height % 10 === 0) {
        process.stdout.write(`  已扫描: ${scannedBlocks} 区块, ${allFills.length} fills...\r`);
      }
      
      // Rate limit保护：每次请求后延迟
      await sleep(delayMs);
      
    } catch (e) {
      // 跳过错误的区块
      await sleep(delayMs);
    }
  }
  
  console.log(`\n\n扫描完成:`);
  console.log(`  区块数: ${scannedBlocks}`);
  console.log(`  有fills的区块: ${blocksWithFills}`);
  console.log(`  找到fills: ${allFills.length}\n`);
  
  return allFills;
}

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
 * 主函数
 */
async function main() {
  console.log('='.repeat(60));
  console.log('从区块事件日志提取Fills - 完全去中心化');
  console.log('='.repeat(60));
  console.log(`账户: ${ADDRESS}\n`);
  
  const latestHeight = await getLatestHeight();
  
  if (!latestHeight) {
    console.error('❌ 无法获取最新区块高度');
    return;
  }
  
  console.log(`最新区块: ${latestHeight}\n`);
  
  // 扫描最近5000个区块（约8-10小时）
  // 用200ms延迟避免rate limit
  const scanRange = 5000;
  const fromHeight = Math.max(1, latestHeight - scanRange);
  
  const fills = await scanBlockEvents(fromHeight, latestHeight, 200);
  
  if (fills.length > 0) {
    console.log('找到的Fills:\n');
    
    fills.slice(0, 20).forEach((fill, i) => {
      console.log(`${i + 1}. ${fill.type}`);
      console.log(`   区块: ${fill.height}`);
      console.log(`   Market: ${fill.market || 'N/A'}`);
      console.log(`   Price: ${fill.price || 'N/A'}`);
      console.log(`   Size: ${fill.size || 'N/A'}`);
      console.log();
    });
    
    // 保存结果
    const fs = require('fs');
    const path = require('path');
    const outputFile = path.join(__dirname, 'data', 'onchain_fills_events.json');
    
    fs.writeFileSync(outputFile, JSON.stringify(fills, null, 2));
    console.log(`\n💾 已保存到: ${outputFile}\n`);
  } else {
    console.log('⚠️  未找到该账户的fills\n');
    console.log('可能原因:');
    console.log('1. 扫描的区块范围内没有fills');
    console.log('2. 事件格式与预期不符');
    console.log('3. 需要扫描更多区块\n');
  }
}

module.exports = {
  scanBlockEvents,
  getBlockResults,
  extractFillsFromEvents
};

if (require.main === module) {
  main().catch(console.error);
}
