#!/usr/bin/env node
/**
 * 解码链上持仓数据
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

// 将 quantums 对象转换为数字
// byte[0] 是前缀，byte[1+] 是大端序整数
function quantumsToNumber(quantums) {
  if (!quantums || Object.keys(quantums).length === 0) return 0;
  
  // 跳过 byte[0]，从 byte[1] 开始用大端序解码
  let result = 0;
  const len = Object.keys(quantums).length;
  for (let i = 1; i < len; i++) {
    result = (result * 256) + (quantums[i] || 0);
  }
  return result;
}

async function main() {
  console.log('📊 解码链上持仓\n');
  
  const config = loadEnv();
  const mnemonic = config.DYDX_MNEMONIC;
  
  const wallet = await LocalWallet.fromMnemonic(mnemonic, 'dydx');
  console.log(`📍 地址: ${wallet.address}\n`);
  
  const network = Network.mainnet();
  const client = await CompositeClient.connect(network);
  
  const subaccount = await client.validatorClient.get.getSubaccount(wallet.address, 0);
  
  console.log('💰 USDC 余额:');
  if (subaccount.subaccount.assetPositions && subaccount.subaccount.assetPositions.length > 0) {
    const usdcPosition = subaccount.subaccount.assetPositions[0];
    const quantums = quantumsToNumber(usdcPosition.quantums);
    // USDC 是 6 位小数
    const usdc = Number(quantums) / 1e6;
    console.log(`   ${usdc.toFixed(2)} USDC\n`);
  } else {
    console.log('   0 USDC\n');
  }
  
  console.log('📈 持仓:');
  if (subaccount.subaccount.perpetualPositions && subaccount.subaccount.perpetualPositions.length > 0) {
    for (const pos of subaccount.subaccount.perpetualPositions) {
      const perpetualId = pos.perpetualId;
      const quantums = quantumsToNumber(pos.quantums);
      
      // ETH-USD 是 9 位小数（需要除以 10^9）
      const size = Number(quantums) / 1e9;
      
      // 市场名称映射
      const marketNames = {
        0: 'BTC-USD',
        1: 'ETH-USD',
        2: 'SOL-USD',
        // ... 更多市场
      };
      
      const market = marketNames[perpetualId] || `Market ${perpetualId}`;
      const side = quantums > 0 ? 'LONG' : 'SHORT';
      
      console.log(`   ${market}:`);
      console.log(`     方向: ${side}`);
      console.log(`     数量: ${Math.abs(size).toFixed(4)}`);
      
      // fundingIndex 需要更复杂的解码
      const fundingIndex = quantumsToNumber(pos.fundingIndex);
      console.log(`     Funding Index: ${fundingIndex.toString()}`);
    }
  } else {
    console.log('   无持仓');
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  });
