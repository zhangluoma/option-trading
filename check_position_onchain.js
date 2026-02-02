#!/usr/bin/env node
/**
 * 直接从链上查询持仓（不用 Indexer）
 */

const { CompositeClient, Network, LocalWallet } = require('@dydxprotocol/v4-client-js');
const fs = require('fs');

function loadEnv() {
  const envPath = require('path').join(__dirname, '.env');
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

async function main() {
  console.log('🔍 查询链上持仓（绕过 Indexer）\n');
  
  const config = loadEnv();
  const mnemonic = config.DYDX_MNEMONIC;
  
  if (!mnemonic) {
    console.error('❌ 未找到 DYDX_MNEMONIC');
    process.exit(1);
  }
  
  try {
    const wallet = await LocalWallet.fromMnemonic(mnemonic, 'dydx');
    console.log(`📍 地址: ${wallet.address}\n`);
    
    console.log('📡 连接到 Validator...');
    const network = Network.mainnet();
    const client = await CompositeClient.connect(network);
    console.log('✅ 连接成功\n');
    
    // 尝试用 ValidatorClient 查询
    console.log('🔍 查询账户状态...');
    
    try {
      const account = await client.validatorClient.get.getAccount(wallet.address);
      console.log('账户信息:', JSON.stringify(account, null, 2));
    } catch (e) {
      console.log('⚠️  无法通过 ValidatorClient 查询:', e.message);
    }
    
    // 尝试查询 subaccount
    try {
      console.log('\n🔍 查询子账户...');
      const subaccount = await client.validatorClient.get.getSubaccount(wallet.address, 0);
      console.log('子账户信息:', JSON.stringify(subaccount, null, 2));
    } catch (e) {
      console.log('⚠️  无法查询子账户:', e.message);
    }
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal:', error);
    process.exit(1);
  });
