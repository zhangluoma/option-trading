#!/usr/bin/env node
/**
 * 测试从链上获取价格 - 方法2
 */

const {
  CompositeClient,
  Network,
  LocalWallet,
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

async function testOnchainPrice() {
  console.log('🔍 测试从链上获取价格\n');
  
  const config = loadEnv();
  const mnemonic = config.DYDX_MNEMONIC;
  
  // 创建钱包
  const wallet = await LocalWallet.fromMnemonic(mnemonic, 'dydx');
  console.log(`钱包地址: ${wallet.address}\n`);
  
  // 连接客户端
  const network = Network.mainnet();
  const client = await CompositeClient.connect(network);
  console.log('已连接到 dYdX 主网\n');
  
  try {
    // 使用stargateQueryClient直接查询
    console.log('使用 stargateQueryClient 查询价格...\n');
    
    const queryClient = client.validatorClient.get.stargateQueryClient;
    console.log('queryClient:', queryClient);
    
    // 尝试查询prices模块
    // dYdX v4使用protobuf查询
    // 路径应该是 /dydxprotocol.prices.Query/MarketPrice
    
    const request = {
      id: 0, // BTC market ID
    };
    
    const response = await queryClient.queryUnverified(
      '/dydxprotocol.prices.Query/MarketPrice',
      request
    );
    
    console.log('价格响应:', response);
    
  } catch (error) {
    console.error('查询失败:', error.message);
    console.error('错误详情:', error);
  }
  
  try {
    // 尝试查询所有价格
    console.log('\n查询所有市场价格...\n');
    
    const queryClient = client.validatorClient.get.stargateQueryClient;
    
    const response = await queryClient.queryUnverified(
      '/dydxprotocol.prices.Query/AllMarketPrices',
      {}
    );
    
    console.log('所有价格:', response);
    
  } catch (error) {
    console.error('查询失败:', error.message);
  }
}

testOnchainPrice()
  .then(() => {
    console.log('\n✅ 测试完成');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  });
