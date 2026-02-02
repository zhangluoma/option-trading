#!/usr/bin/env node
/**
 * dYdX 真正的市价单 - 立即成交或取消
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
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log(`
用法: node dydx_market_order.js <market> <side> <size>

示例:
  node dydx_market_order.js ETH-USD SELL 0.01
  node dydx_market_order.js BTC-USD BUY 0.001
    `);
    process.exit(1);
  }
  
  const market = args[0];
  const sideStr = args[1].toUpperCase();
  const size = parseFloat(args[2]);
  
  if (!['BUY', 'SELL'].includes(sideStr)) {
    console.error('❌ side 必须是 BUY 或 SELL');
    process.exit(1);
  }
  
  if (isNaN(size) || size <= 0) {
    console.error('❌ size 必须是正数');
    process.exit(1);
  }
  
  const side = sideStr === 'BUY' ? OrderSide.BUY : OrderSide.SELL;
  
  console.log('🚀 dYdX 市价单（立即成交）\n');
  console.log('📝 订单参数:');
  console.log(`   市场: ${market}`);
  console.log(`   方向: ${sideStr}`);
  console.log(`   数量: ${size}`);
  console.log(`   类型: MARKET (IOC - 立即成交或取消)\n`);
  
  const config = loadEnv();
  const mnemonic = config.DYDX_MNEMONIC;
  
  if (!mnemonic) {
    console.error('❌ 未找到 DYDX_MNEMONIC');
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
    
    // 使用极端价格确保市价单立即成交
    // 买入用极高价，卖出用极低价
    const worstPrice = side === OrderSide.BUY ? 999999 : 0.01;
    
    console.log('⏳ 提交市价单到链上...');
    console.log(`   使用极端价格 $${worstPrice} 确保立即成交\n`);
    
    const orderTx = await client.placeOrder(
      subaccount,
      market,
      OrderType.LIMIT, // dYdX v4 用 LIMIT + IOC 实现市价单
      side,
      worstPrice,
      size,
      clientId,
      OrderTimeInForce.IOC, // Immediate or Cancel - 关键！
      0, // IOC 不需要 goodTilTime
      OrderExecution.DEFAULT,
      false, // postOnly=false 允许 taker
      false  // reduceOnly=false
    );
    
    console.log('✅ 市价单已提交！');
    console.log(`   交易哈希: ${orderTx.hash}`);
    console.log(`   客户端 ID: ${clientId}`);
    console.log(`\n💡 IOC 订单会立即尝试成交，未成交部分自动取消\n`);
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    if (error.message.includes('equity tier limit')) {
      console.error('\n💡 提示: 余额不足或持仓不足');
    }
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal:', error);
    process.exit(1);
  });
