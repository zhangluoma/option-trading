#!/usr/bin/env node
/**
 * 从dYdX链上查询持仓和余额
 */

const {
  CompositeClient,
  Network,
  LocalWallet,
} = require('@dydxprotocol/v4-client-js');

require('dotenv').config();

async function queryOnchainData() {
  try {
    const mnemonic = process.env.DYDX_MNEMONIC;
    const wallet = await LocalWallet.fromMnemonic(mnemonic, 'dydx');
    const client = await CompositeClient.connect(Network.mainnet());
    
    const address = wallet.address;
    
    console.log('\n🔍 查询链上数据...\n');
    console.log(`地址: ${address}\n`);
    
    // 使用QueryClient查询子账户
    const queryClient = client.validatorClient.get.stargateQueryClient;
    
    // 查询子账户（包含余额和持仓）
    const subaccountQuery = {
      subaccountId: {
        owner: address,
        number: 0
      }
    };
    
    // 使用Cosmos SDK标准查询
    const accountPath = `/dydxprotocol.subaccounts.Query/Subaccount`;
    const accountData = await queryClient.queryAbci(accountPath, subaccountQuery);
    
    console.log('子账户数据:');
    console.log(JSON.stringify(accountData, null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
    
    // 尝试另一种方法
    console.log('\n尝试直接查询...\n');
    
    try {
      const mnemonic = process.env.DYDX_MNEMONIC;
      const wallet = await LocalWallet.fromMnemonic(mnemonic, 'dydx');
      const client = await CompositeClient.connect(Network.mainnet());
      
      const address = wallet.address;
      
      // 使用account方法
      const account = await client.validatorClient.get.getAccountBalances(address);
      
      console.log('账户余额:');
      console.log(JSON.stringify(account, null, 2));
      
    } catch (e2) {
      console.error('Second attempt failed:', e2.message);
      
      // 最后尝试：使用validator的post方法查询
      console.log('\n尝试使用validator post查询...\n');
      
      const mnemonic = process.env.DYDX_MNEMONIC;
      const wallet = await LocalWallet.fromMnemonic(mnemonic, 'dydx');
      const client = await CompositeClient.connect(Network.mainnet());
      
      const address = wallet.address;
      
      // 查询子账户（这个方法在之前成功了）
      const subaccount = await client.validatorClient.get.getSubaccount(
        address,
        0
      );
      
      console.log('✅ 子账户数据（成功）:');
      console.log(JSON.stringify(subaccount, null, 2));
      
      // 解析数据
      if (subaccount?.subaccount) {
        const sub = subaccount.subaccount;
        
        console.log('\n📊 解析后的数据:\n');
        
        // USDC余额
        if (sub.assetPositions && sub.assetPositions.length > 0) {
          const usdcPosition = sub.assetPositions[0];
          const quantums = usdcPosition.quantums;
          
          // quantums是BigInt，需要转换
          let quantumValue = 0n;
          if (quantums && typeof quantums === 'object') {
            // 从对象重构BigInt
            const keys = Object.keys(quantums).sort((a, b) => Number(a) - Number(b));
            for (const key of keys) {
              quantumValue = quantumValue << 8n;
              quantumValue = quantumValue | BigInt(quantums[key]);
            }
          }
          
          // dYdX使用6位小数
          const usdc = Number(quantumValue) / 1000000;
          
          console.log(`💰 USDC余额: $${usdc.toFixed(2)}`);
        }
        
        // 持仓
        if (sub.perpetualPositions && sub.perpetualPositions.length > 0) {
          console.log('\n📈 永续合约持仓:\n');
          
          for (const pos of sub.perpetualPositions) {
            const perpetualId = pos.perpetualId;
            const quantums = pos.quantums;
            
            // 重构BigInt
            let quantumValue = 0n;
            if (quantums && typeof quantums === 'object') {
              const keys = Object.keys(quantums).sort((a, b) => Number(a) - Number(b));
              for (const key of keys) {
                quantumValue = quantumValue << 8n;
                quantumValue = quantumValue | BigInt(quantums[key]);
              }
            }
            
            // 转换为实际大小（需要知道市场的quantumConversionExponent）
            // 对于BTC-USD, exponent通常是-10
            const size = Number(quantumValue) / Math.pow(10, 10);
            
            console.log(`  永续合约ID: ${perpetualId}`);
            console.log(`  数量: ${size.toFixed(8)}`);
            console.log(`  原始quantums: ${quantumValue.toString()}`);
            console.log('');
          }
        }
      }
    }
  }
}

queryOnchainData();
