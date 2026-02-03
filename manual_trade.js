#!/usr/bin/env node

/**
 * 手动开单测试脚本
 * 用于测试订单记录系统
 */

require('dotenv').config();

const {
  CompositeClient,
  Network,
  OrderFlags,
  Order_Side,
  Order_TimeInForce,
} = require('@dydxprotocol/v4-client-js');

const ADDRESS = 'dydx1crq0p3qkxtk8v5hrzplu7wgtuwt0am6lnfm4je';

async function manualTrade() {
  console.log('📊 手动开单测试\n');
  console.log('='.repeat(60));
  
  try {
    // 连接客户端
    console.log('🔗 连接dYdX...');
    const client = await CompositeClient.connect(Network.mainnet());
    
    // 获取ETH市场信息
    console.log('📈 获取ETH-USD市场信息...');
    const markets = client.indexerClient.markets.getPerpetualMarkets();
    const ethMarket = (await markets).markets['ETH-USD'];
    
    if (!ethMarket) {
      console.error('❌ 找不到ETH-USD市场');
      return;
    }
    
    console.log(`✅ ETH-USD市场:`);
    console.log(`   当前价格: $${ethMarket.oraclePrice}`);
    console.log(`   步长: ${ethMarket.stepSize}`);
    console.log(`   最小单: ${ethMarket.minOrderSize}`);
    
    // 下单参数
    const ticker = 'ETH';
    const side = 'LONG'; // 做多
    const size = 0.01; // 0.01个ETH
    
    console.log(`\n📝 准备下单:`);
    console.log(`   币种: ${ticker}`);
    console.log(`   方向: ${side} (做多)`);
    console.log(`   数量: ${size} ETH`);
    console.log(`   类型: 市价单 (MARKET)`);
    
    console.log('\n⏳ 正在下单...');
    
    // 使用市价单
    const result = await client.placeOrder(
      client.validatorClient.post.composer.composeMsgPlaceOrder(
        ADDRESS,
        0, // subaccount
        1, // ETH market id
        Order_Side.SIDE_BUY,
        size,
        0, // 市价单价格为0
        OrderFlags.SHORT_TERM,
        0,
        Order_TimeInForce.TIME_IN_FORCE_IOC, // Immediate or Cancel
        0,
        false
      )
    );
    
    console.log('\n✅ 下单成功！');
    console.log('订单信息:', result);
    
    console.log('\n🔍 等待5秒后检查订单状态...');
    await new Promise(r => setTimeout(r, 5000));
    
    console.log('\n📊 请查看:');
    console.log('1. UI订单历史');
    console.log('2. MySQL fills表');
    console.log('3. 持仓列表');
    
  } catch (error) {
    console.error('\n❌ 下单失败:', error.message);
    console.error(error);
  }
}

manualTrade().catch(console.error);
