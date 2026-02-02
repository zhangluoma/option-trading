#!/usr/bin/env node
/**
 * 测试从链上获取价格
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
    // 方法1: 尝试通过validatorClient查询
    console.log('方法1: 查询所有市场价格...');
    
    // 查看validatorClient有哪些方法
    console.log('validatorClient methods:', Object.keys(client.validatorClient));
    console.log('validatorClient.get methods:', Object.keys(client.validatorClient.get));
    
    // 尝试查询市场数据
    const markets = await client.validatorClient.get.getAllMarketPrices();
    console.log('市场价格:', markets);
    
  } catch (error) {
    console.error('方法1失败:', error.message);
  }
  
  try {
    // 方法2: 查询单个市场
    console.log('\n方法2: 查询BTC市场参数...');
    const marketParam = await client.validatorClient.get.getMarketParam(0); // BTC通常是ID 0
    console.log('市场参数:', marketParam);
    
  } catch (error) {
    console.error('方法2失败:', error.message);
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
