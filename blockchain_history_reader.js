#!/usr/bin/env node

/**
 * 从dYdX区块链直接读取交易历史
 * 通过扫描区块事件来获取订单填充记录
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 配置
const VALIDATOR_REST = 'https://dydx-ops-rest.kingnodes.com';
const ADDRESS = 'dydx1crq0p3qkxtk8v5hrzplu7wgtuwt0am6lnfm4je';
const SUBACCOUNT_NUMBER = 0;

/**
 * 从区块链扫描订单填充事件
 */
async function scanBlockchainForFills(fromHeight, toHeight, maxResults = 50) {
  console.log(`📡 扫描区块 ${fromHeight} - ${toHeight}\n`);
  
  const fills = [];
  
  try {
    for (let height = toHeight; height >= fromHeight && fills.length < maxResults; height -= 10) {
      try {
        // 查询这个高度范围的交易
        const txUrl = `${VALIDATOR_REST}/cosmos/tx/v1beta1/txs?events=tx.height=${height}&limit=100`;
        const txRes = await axios.get(txUrl, { timeout: 5000 });
        
        if (txRes.data.txs && txRes.data.txs.length > 0) {
          for (const tx of txRes.data.txs) {
            const txFills = extractFillsFromTx(tx);
            fills.push(...txFills);
          }
        }
        
        process.stdout.write(`  扫描区块 ${height}... 找到 ${fills.length} 个fills\r`);
        
      } catch (e) {
        // 跳过错误的区块
      }
    }
    
    console.log(`\n✅ 完成。共找到 ${fills.length} 个订单填充\n`);
    return fills;
    
  } catch (error) {
    console.error('扫描错误:', error.message);
    return fills;
  }
}

/**
 * 从交易中提取订单填充信息
 */
function extractFillsFromTx(tx) {
  const fills = [];
  
  try {
    const logs = tx.logs || [];
    
    for (const log of logs) {
      const events = log.events || [];
      
      for (const event of events) {
        // 查找订单填充相关事件
        if (event.type.includes('order_fill') || 
            event.type.includes('perpetual') ||
            event.type === 'message') {
          
          const attributes = {};
          
          // 解析事件属性
          if (event.attributes) {
            for (const attr of event.attributes) {
              try {
                const key = Buffer.from(attr.key, 'base64').toString();
                const value = Buffer.from(attr.value, 'base64').toString();
                attributes[key] = value;
              } catch (e) {
                // 跳过无法解析的属性
              }
            }
          }
          
          // 检查是否与我们的账户相关
          const owner = attributes.owner || attributes.address || attributes.sender;
          if (owner && owner === ADDRESS) {
            fills.push({
              height: tx.height,
              txHash: tx.txhash,
              timestamp: tx.timestamp || new Date().toISOString(),
              eventType: event.type,
              attributes
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('提取fills错误:', error.message);
  }
  
  return fills;
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
  console.log('dYdX 区块链交易历史读取器');
  console.log('='.repeat(60));
  console.log(`账户: ${ADDRESS}`);
  console.log(`Validator: ${VALIDATOR_REST}\n`);
  
  // 获取最新区块
  const latestHeight = await getLatestHeight();
  if (!latestHeight) {
    console.error('❌ 无法获取最新区块高度');
    return;
  }
  
  console.log(`最新区块: ${latestHeight}\n`);
  
  // 扫描最近1000个区块（约1小时）
  const scanBlocks = 1000;
  const fromHeight = Math.max(1, latestHeight - scanBlocks);
  
  const fills = await scanBlockchainForFills(fromHeight, latestHeight, 20);
  
  if (fills.length > 0) {
    console.log('找到的订单填充:\n');
    fills.slice(0, 10).forEach((fill, i) => {
      console.log(`${i + 1}. 区块 ${fill.height} (${fill.timestamp})`);
      console.log(`   事件: ${fill.eventType}`);
      console.log(`   属性:`, JSON.stringify(fill.attributes, null, 2).substring(0, 200));
      console.log('');
    });
    
    // 保存到文件
    const outputFile = path.join(__dirname, 'data', 'blockchain_fills.json');
    fs.writeFileSync(outputFile, JSON.stringify(fills, null, 2));
    console.log(`\n💾 已保存到: ${outputFile}`);
  } else {
    console.log('⚠️  未找到订单填充事件');
    console.log('\n说明:');
    console.log('- dYdX v4链上不直接存储历史fills');
    console.log('- Fills数据存储在Indexer数据库中');
    console.log('- 链上只能通过扫描事件日志获取（效率低）');
    console.log('- 建议继续使用本地记录或通过VPN访问Indexer');
  }
}

// 运行
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  scanBlockchainForFills,
  extractFillsFromTx,
  getLatestHeight
};
