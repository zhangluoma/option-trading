#!/usr/bin/env node
/**
 * dYdX 命令行下单工具
 * 用法: node dydx_order_cli.js <market> <side> <price> <size>
 * 例如: node dydx_order_cli.js ETH-USD BUY 2315.5 0.01
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

function printUsage() {
  console.log(`
📖 使用方法:

  node dydx_order_cli.js <market> <side> <price> <size> [postOnly]

参数说明:
  market   - 交易对，如: ETH-USD, BTC-USD
  side     - 方向: BUY 或 SELL
  price    - 价格，如: 2315.5
  size     - 数量，如: 0.01
  postOnly - 可选，true=Maker单（默认），false=允许Taker

示例:
  # Maker 单买入 0.01 ETH @ $2315.5
  node dydx_order_cli.js ETH-USD BUY 2315.5 0.01

  # 允许 Taker 的卖出单
  node dydx_order_cli.js BTC-USD SELL 95500 0.001 false

💡 提示:
  - Maker 单（postOnly=true）不会立即成交，等待价格到达
  - 价格需要自己从其他地方查询（因为 Indexer 被封）
  - 推荐用 TradingView 或其他网站查看实时价格
  `);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 4) {
    console.error('❌ 参数不足\n');
    printUsage();
    process.exit(1);
  }
  
  const market = args[0];
  const sideStr = args[1].toUpperCase();
  const price = parseFloat(args[2]);
  const size = parseFloat(args[3]);
  const postOnly = args[4] ? args[4].toLowerCase() === 'true' : true;
  
  // 验证参数
  if (!['BUY', 'SELL'].includes(sideStr)) {
    console.error('❌ side 必须是 BUY 或 SELL');
    process.exit(1);
  }
  
  if (isNaN(price) || price <= 0) {
    console.error('❌ price 必须是正数');
    process.exit(1);
  }
  
  if (isNaN(size) || size <= 0) {
    console.error('❌ size 必须是正数');
    process.exit(1);
  }
  
  const side = sideStr === 'BUY' ? OrderSide.BUY : OrderSide.SELL;
  
  console.log('🚀 dYdX 下单工具\n');
  console.log('📝 订单参数:');
  console.log(`   市场: ${market}`);
  console.log(`   方向: ${sideStr}`);
  console.log(`   价格: $${price}`);
  console.log(`   数量: ${size}`);
  console.log(`   类型: ${postOnly ? 'LIMIT + POST_ONLY (Maker)' : 'LIMIT (允许 Taker)'}`);
  console.log(`   预计: $${(size * price).toFixed(2)}\n`);
  
  const config = loadEnv();
  const mnemonic = config.DYDX_MNEMONIC;
  
  if (!mnemonic) {
    console.error('❌ 未找到 DYDX_MNEMONIC in .env');
    process.exit(1);
  }
  
  try {
    console.log('🔑 从助记词恢复钱包...');
    const wallet = await LocalWallet.fromMnemonic(mnemonic, 'dydx');
    console.log(`   地址: ${wallet.address}\n`);
    
    console.log('📡 连接到 dYdX Validator...');
    const network = Network.mainnet();
    const client = await CompositeClient.connect(network);
    console.log('✅ 连接成功\n');
    
    const subaccount = SubaccountInfo.forLocalWallet(wallet, 0);
    const clientId = randomInt(2147483647);
    
    console.log('⏳ 提交订单到链上...');
    
    const orderTx = await client.placeOrder(
      subaccount,
      market,
      OrderType.LIMIT,
      side,
      price,
      size,
      clientId,
      OrderTimeInForce.GTT,
      60, // 60 秒有效
      OrderExecution.DEFAULT,
      postOnly,
      false // reduceOnly
    );
    
    console.log('✅ 订单已提交到链上！');
    console.log(`   交易哈希: ${orderTx.hash}`);
    console.log(`   客户端 ID: ${clientId}`);
    console.log(`\n📌 提示: 因为 Indexer 被封锁，无法查询订单状态`);
    console.log(`   你可以在 dYdX 网站上查看（用 VPN）:`);
    console.log(`   https://trade.dydx.exchange/\n`);
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    if (error.message.includes('equity tier limit')) {
      console.error('\n💡 提示: 余额不足或账户为空');
      console.error('   请先充值 USDC 到地址: ' + (await LocalWallet.fromMnemonic(mnemonic, 'dydx')).address);
    }
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
