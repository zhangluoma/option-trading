#!/usr/bin/env node
/**
 * dYdX 直接下单 - 绕过 Indexer
 * 不查询账户，直接提交订单到链上
 */

const {
  CompositeClient,
  Network,
  OrderExecution,
  OrderSide,
  OrderTimeInForce,
  OrderType,
  LocalWallet,
  SubaccountInfo,
} = require('@dydxprotocol/v4-client-js');

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const config = {};
  
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      value = value.replace(/^["']|["']$/g, '');
      config[key] = value;
    }
  });
  
  return config;
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

async function main() {
  console.log('🚀 dYdX 直接下单（绕过 Indexer）\n');
  
  const config = loadEnv();
  const mnemonic = config.DYDX_MNEMONIC;
  
  if (!mnemonic) {
    console.error('❌ 未找到 DYDX_MNEMONIC');
    process.exit(1);
  }
  
  // 手动设置参数（不查询 Indexer）
  const market = 'ETH-USD';
  const price = 2314.9; // 手动指定价格
  const size = 0.01;     // 0.01 ETH
  
  console.log('📝 订单参数:');
  console.log(`   市场: ${market}`);
  console.log(`   价格: $${price}`);
  console.log(`   数量: ${size} ETH`);
  console.log(`   类型: LIMIT + POST_ONLY (Maker)`);
  console.log(`   预计: $${(size * price).toFixed(2)}\n`);
  
  try {
    // 恢复钱包
    console.log('🔑 从助记词恢复钱包...');
    const wallet = await LocalWallet.fromMnemonic(mnemonic, 'dydx');
    console.log(`   地址: ${wallet.address}\n`);
    
    // 连接客户端（只用 Validator，不用 Indexer）
    console.log('📡 连接到 dYdX Validator...');
    const network = Network.mainnet();
    const client = await CompositeClient.connect(network);
    console.log('✅ 连接成功\n');
    
    // 子账户
    const subaccount = SubaccountInfo.forLocalWallet(wallet, 0);
    
    // 生成订单 ID
    const clientId = randomInt(2147483647);
    
    console.log('⏳ 提交订单到链上...');
    
    // 直接提交订单（不查询 Indexer）
    const orderTx = await client.placeOrder(
      subaccount,
      market,
      OrderType.LIMIT,
      OrderSide.BUY,
      price,
      size,
      clientId,
      OrderTimeInForce.GTT,
      60, // 60 秒有效
      OrderExecution.DEFAULT,
      true, // postOnly = Maker
      false
    );
    
    console.log('✅ 订单已提交到链上！');
    console.log(`   交易哈希: ${orderTx.hash}`);
    console.log(`   客户端 ID: ${clientId}`);
    console.log(`\n📌 提示: 因为 Indexer 被封锁，无法查询订单状态`);
    console.log(`   你可以在 dYdX 网站上查看（用 VPN）:`);
    console.log(`   https://trade.dydx.exchange/\n`);
    
    console.log('✅ 测试完成！');
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    if (error.stack) {
      console.error('\n详细错误:');
      console.error(error.stack);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
