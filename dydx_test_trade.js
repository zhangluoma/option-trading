#!/usr/bin/env node
/**
 * dYdX v4 交易测试 - 正确版本
 * 基于官方示例代码
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
      value = value.replace(/^["']|["']$/g, '');
      config[key] = value;
    }
  });
  
  return config;
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🚀 dYdX v4 交易测试（官方 API）\n');
  
  // 加载配置
  const config = loadEnv();
  const mnemonic = config.DYDX_MNEMONIC;
  
  if (!mnemonic) {
    console.error('❌ 未找到 DYDX_MNEMONIC');
    process.exit(1);
  }
  
  // 1. 创建钱包
  console.log('🔑 从助记词恢复钱包...');
  const wallet = await LocalWallet.fromMnemonic(mnemonic, 'dydx');
  console.log(`   地址: ${wallet.address}\n`);
  
  // 2. 连接客户端
  console.log('📡 连接到 dYdX 主网...');
  const network = Network.mainnet();
  const client = await CompositeClient.connect(network);
  console.log('✅ 连接成功\n');
  
  // 3. 子账户
  const subaccount = SubaccountInfo.forLocalWallet(wallet, 0);
  
  // 4. 获取账户信息
  console.log('💰 获取账户信息...');
  try {
    const accountResponse = await client.indexerClient.account.getSubaccount(
      wallet.address,
      0
    );
    
    const equity = parseFloat(accountResponse.subaccount.equity);
    const freeCollateral = parseFloat(accountResponse.subaccount.freeCollateral);
    
    console.log(`   总权益: $${equity.toFixed(2)}`);
    console.log(`   可用余额: $${freeCollateral.toFixed(2)}\n`);
    
    if (freeCollateral < 20) {
      console.error('❌ 余额不足 ($20 minimum)');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ 获取账户失败:', error.message);
    process.exit(1);
  }
  
  // 5. 获取 ETH 价格
  console.log('📊 获取 ETH-USD 价格...');
  try {
    const orderbookResponse = await client.indexerClient.markets.getPerpetualMarketOrderbook('ETH-USD');
    const bestBid = parseFloat(orderbookResponse.bids[0].price);
    const bestAsk = parseFloat(orderbookResponse.asks[0].price);
    
    console.log(`   买一: $${bestBid}`);
    console.log(`   卖一: $${bestAsk}\n`);
    
    // 6. 下 Maker 单开多 ETH
    const size = 0.01; // 0.01 ETH
    const buyPrice = bestBid - 0.1; // 比买一低 $0.1，确保是 maker
    
    console.log(`📝 下 Maker 单:`);
    console.log(`   市场: ETH-USD`);
    console.log(`   方向: 买入 (LONG)`);
    console.log(`   数量: ${size} ETH`);
    console.log(`   价格: $${buyPrice.toFixed(2)}`);
    console.log(`   类型: LIMIT + POST_ONLY (Maker)`);
    console.log(`   预计: $${(size * buyPrice).toFixed(2)}\n`);
    
    const clientId = randomInt(2147483647); // Max int32
    
    console.log('⏳ 提交订单...');
    const orderTx = await client.placeOrder(
      subaccount,
      'ETH-USD',
      OrderType.LIMIT,
      OrderSide.BUY,
      buyPrice,
      size,
      clientId,
      OrderTimeInForce.GTT, // Good Till Time
      60, // 60 秒有效期
      OrderExecution.DEFAULT,
      true, // postOnly = Maker only
      false // reduceOnly
    );
    
    console.log('✅ 订单已提交');
    console.log(`   交易哈希: ${orderTx.hash}`);
    console.log(`   客户端 ID: ${clientId}\n`);
    
    // 7. 等待订单成交
    console.log('⏳ 等待订单成交（最多 60 秒）...');
    
    let filled = false;
    let filledPrice = 0;
    
    for (let i = 0; i < 12; i++) {
      await sleep(5000);
      
      try {
        const ordersResponse = await client.indexerClient.account.getSubaccountOrders(
          wallet.address,
          0,
          { limit: 20 }
        );
        
        const order = ordersResponse.find(o => parseInt(o.clientId) === clientId);
        
        if (order) {
          const status = order.status;
          process.stdout.write(`   [${i+1}/12] 状态: ${status}...\r`);
          
          if (status === 'FILLED') {
            filled = true;
            filledPrice = parseFloat(order.price);
            console.log(`\n✅ 订单已成交！`);
            console.log(`   成交价: $${filledPrice.toFixed(2)}`);
            console.log(`   成交量: ${order.size} ETH\n`);
            break;
          } else if (status === 'CANCELED' || status === 'BEST_EFFORT_CANCELED') {
            console.log(`\n❌ 订单已取消\n`);
            return;
          }
        }
      } catch (error) {
        // 查询错误，继续等待
      }
    }
    
    if (!filled) {
      console.log(`\n⚠️  订单未成交（价格可能没达到）\n`);
      console.log('📝 取消订单...');
      
      try {
        const height = await client.validatorClient.get.latestBlockHeight();
        const cancelTx = await client.cancelOrder(
          subaccount,
          clientId,
          0, // orderFlags
          1, // clobPairId for ETH-USD
          height + 10 // goodTilBlock
        );
        console.log(`✅ 取消成功: ${cancelTx.hash}\n`);
      } catch (error) {
        console.log(`⚠️  取消失败: ${error.message}\n`);
      }
      
      return;
    }
    
    // 8. 平仓（市价卖出）
    console.log('📝 平仓: 市价卖出 ETH...');
    
    const sellClientId = randomInt(2147483647);
    
    const closeTx = await client.placeOrder(
      subaccount,
      'ETH-USD',
      OrderType.MARKET,
      OrderSide.SELL,
      bestAsk, // 市价单价格不重要
      size,
      sellClientId,
      OrderTimeInForce.IOC, // Immediate or Cancel
      0,
      OrderExecution.DEFAULT,
      false, // postOnly = false (允许 taker)
      false
    );
    
    console.log('✅ 平仓订单已提交');
    console.log(`   交易哈希: ${closeTx.hash}\n`);
    
    // 等待平仓完成
    await sleep(5000);
    
    // 9. 最终结果
    console.log('💰 最终账户状态...');
    const finalAccount = await client.indexerClient.account.getSubaccount(
      wallet.address,
      0
    );
    
    const finalEquity = parseFloat(finalAccount.subaccount.equity);
    const pnl = finalEquity - equity;
    
    console.log(`   总权益: $${finalEquity.toFixed(2)}`);
    console.log(`   盈亏: ${pnl >= 0 ? '🟢' : '🔴'} $${pnl.toFixed(4)}\n`);
    
    console.log('✅ 测试完成！\n');
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    if (error.stack) {
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
