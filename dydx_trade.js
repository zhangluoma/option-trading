#!/usr/bin/env node
/**
 * dYdX v4 交易脚本
 * 测试 maker 单开多 ETH 然后平仓
 */

const { CompositeClient, Network, OrderSide, OrderType, OrderTimeInForce } = require('@dydxprotocol/v4-client-js');
const fs = require('fs');
const path = require('path');

// 从 .env 读取配置
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const config = {};
  
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      // 移除引号
      value = value.replace(/^["']|["']$/g, '');
      config[key] = value;
    }
  });
  
  return config;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🚀 dYdX v4 交易测试\n');
  
  // 加载配置
  const config = loadEnv();
  const mnemonic = config.DYDX_MNEMONIC;
  const network = config.DYDX_NETWORK || 'mainnet';
  
  if (!mnemonic) {
    console.error('❌ 未找到 DYDX_MNEMONIC');
    process.exit(1);
  }
  
  console.log(`📡 网络: ${network}`);
  console.log(`📍 地址: dydx199t5s58t0hfvrnhpw52759alq87648923nuzws\n`);
  
  // 创建客户端
  const client = await CompositeClient.connect(
    network === 'mainnet' ? Network.mainnet() : Network.testnet()
  );
  
  console.log('✅ 连接成功\n');
  
  // 从助记词恢复钱包
  const { LocalWallet } = require('@dydxprotocol/v4-client-js');
  const wallet = await LocalWallet.fromMnemonic(mnemonic, 'dydx');
  
  const address = wallet.address;
  console.log(`🔑 钱包地址: ${address}\n`);
  
  // 子账户
  const subaccount = {
    address: address,
    subaccountNumber: 0
  };
  
  // 1. 获取账户余额
  console.log('💰 获取账户信息...');
  const accountResponse = await client.indexerClient.account.getSubaccount(
    address,
    0
  );
  
  const equity = parseFloat(accountResponse.subaccount.equity);
  const freeCollateral = parseFloat(accountResponse.subaccount.freeCollateral);
  
  console.log(`   总权益: $${equity.toFixed(2)}`);
  console.log(`   可用余额: $${freeCollateral.toFixed(2)}\n`);
  
  // 2. 获取 ETH 价格
  console.log('📊 获取 ETH-USD 价格...');
  const marketsResponse = await client.indexerClient.markets.getPerpetualMarkets();
  const ethMarket = marketsResponse.markets['ETH-USD'];
  
  const oraclePrice = parseFloat(ethMarket.oraclePrice);
  console.log(`   Oracle 价格: $${oraclePrice.toFixed(2)}`);
  
  // 获取订单簿
  const orderbookResponse = await client.indexerClient.markets.getPerpetualMarketOrderbook('ETH-USD');
  const bestBid = parseFloat(orderbookResponse.bids[0].price);
  const bestAsk = parseFloat(orderbookResponse.asks[0].price);
  
  console.log(`   买一: $${bestBid}`);
  console.log(`   卖一: $${bestAsk}\n`);
  
  // 3. 下 Maker 单开多 ETH
  const size = 0.01; // 0.01 ETH (约 $23)
  const buyPrice = bestBid - 0.1; // 比买一低 $0.1，确保是 maker 单
  
  console.log(`📝 下单: 买入 ${size} ETH @ $${buyPrice.toFixed(2)} (Maker)`);
  console.log(`   预计金额: $${(size * buyPrice).toFixed(2)}\n`);
  
  const clientId = Date.now(); // 客户端订单 ID
  const goodTilTimeInSeconds = Math.round(Date.now() / 1000) + 300; // 5分钟有效期
  
  try {
    const orderResponse = await client.placeOrder(
      subaccount,
      'ETH-USD',
      OrderType.LIMIT,
      OrderSide.BUY,
      buyPrice,
      size,
      clientId,
      OrderTimeInForce.GTT,
      goodTilTimeInSeconds,
      0, // execution
      true, // postOnly = Maker only
      false // reduceOnly
    );
    
    console.log('✅ 订单已提交');
    console.log(`   交易哈希: ${orderResponse.hash}`);
    console.log(`   客户端 ID: ${clientId}\n`);
    
    // 等待订单成交
    console.log('⏳ 等待订单成交 (最多 60 秒)...');
    
    let filled = false;
    for (let i = 0; i < 12; i++) {
      await sleep(5000); // 每 5 秒查询一次
      
      const ordersResponse = await client.indexerClient.account.getSubaccountOrders(
        address,
        0,
        { limit: 10 }
      );
      
      const order = ordersResponse.find(o => o.clientId === String(clientId));
      
      if (order) {
        console.log(`   状态: ${order.status}`);
        
        if (order.status === 'FILLED') {
          filled = true;
          console.log(`✅ 订单成交！`);
          console.log(`   成交价: $${order.price}`);
          console.log(`   成交量: ${order.size} ETH\n`);
          break;
        } else if (order.status === 'CANCELED' || order.status === 'BEST_EFFORT_CANCELED') {
          console.log('❌ 订单被取消\n');
          break;
        }
      }
    }
    
    if (!filled) {
      console.log('⚠️  订单未成交，可能价格没达到\n');
      
      // 取消订单
      console.log('📝 取消订单...');
      const cancelResponse = await client.cancelOrder(
        subaccount,
        clientId,
        0, // orderFlags
        'ETH-USD',
        goodTilTimeInSeconds
      );
      console.log(`✅ 取消成功: ${cancelResponse.hash}\n`);
      return;
    }
    
    // 4. 平仓（市价卖出）
    console.log('📝 平仓: 市价卖出 ETH\n');
    
    const sellClientId = Date.now();
    const sellGoodTil = Math.round(Date.now() / 1000) + 60;
    
    const closeResponse = await client.placeOrder(
      subaccount,
      'ETH-USD',
      OrderType.MARKET,
      OrderSide.SELL,
      bestAsk, // 市价单价格不重要
      size,
      sellClientId,
      OrderTimeInForce.IOC, // Immediate or Cancel
      sellGoodTil,
      0,
      false, // postOnly = false (允许 taker)
      false
    );
    
    console.log('✅ 平仓订单已提交');
    console.log(`   交易哈希: ${closeResponse.hash}\n`);
    
    // 等待平仓成交
    await sleep(3000);
    
    console.log('💰 最终账户状态...');
    const finalAccount = await client.indexerClient.account.getSubaccount(address, 0);
    const finalEquity = parseFloat(finalAccount.subaccount.equity);
    const pnl = finalEquity - equity;
    
    console.log(`   总权益: $${finalEquity.toFixed(2)}`);
    console.log(`   盈亏: ${pnl >= 0 ? '🟢' : '🔴'} $${pnl.toFixed(2)}\n`);
    
    console.log('✅ 测试完成！');
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    if (error.response) {
      console.error('   响应:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

main().catch(console.error);
