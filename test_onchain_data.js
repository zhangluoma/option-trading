#!/usr/bin/env node
/**
 * 测试从dYdX链上读取数据（不用Indexer）
 */

const {
  CompositeClient,
  Network,
  LocalWallet,
} = require('@dydxprotocol/v4-client-js');

require('dotenv').config();

async function testOnchainData() {
  console.log('🔍 测试从dYdX链上读取数据...\n');
  
  try {
    // 1. 初始化客户端
    const mnemonic = process.env.DYDX_MNEMONIC;
    if (!mnemonic) {
      throw new Error('DYDX_MNEMONIC not found in .env');
    }
    
    const wallet = await LocalWallet.fromMnemonic(mnemonic, 'dydx');
    const client = await CompositeClient.connect(Network.mainnet());
    
    const address = wallet.address;
    const subaccount = { address, subaccountNumber: 0 };
    
    console.log(`📍 地址: ${address}\n`);
    
    // 2. 查询子账户信息（链上）
    console.log('📊 查询子账户信息...');
    try {
      const accountInfo = await client.validatorClient.get.getSubaccount(
        address,
        0
      );
      
      console.log('✅ 链上子账户数据:');
      console.log(JSON.stringify(accountInfo, null, 2));
    } catch (e) {
      console.log('❌ 查询子账户失败:', e.message);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // 3. 查询市场价格（oracle价格）
    console.log('💰 查询BTC市场价格（链上oracle）...');
    try {
      const markets = await client.validatorClient.get.getAllMarkets();
      
      console.log('✅ 市场数据:');
      
      // 找BTC市场
      const btcMarket = markets?.market?.find(m => m.ticker === 'BTC-USD');
      if (btcMarket) {
        console.log('BTC-USD Market:');
        console.log(`  Oracle Price: ${btcMarket.oraclePrice}`);
        console.log(JSON.stringify(btcMarket, null, 2));
      }
    } catch (e) {
      console.log('❌ 查询市场失败:', e.message);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // 4. 查询最近订单
    console.log('📋 查询最近订单...');
    try {
      // 尝试查询链上订单
      const orders = await client.validatorClient.get.getSubaccountOrders(
        address,
        0
      );
      
      console.log('✅ 订单数据:');
      console.log(JSON.stringify(orders, null, 2));
    } catch (e) {
      console.log('❌ 查询订单失败:', e.message);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // 5. 查询持仓
    console.log('📈 查询持仓...');
    try {
      const positions = await client.validatorClient.get.getSubaccountPerpetualPositions(
        address,
        0
      );
      
      console.log('✅ 持仓数据:');
      console.log(JSON.stringify(positions, null, 2));
    } catch (e) {
      console.log('❌ 查询持仓失败:', e.message);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testOnchainData();
