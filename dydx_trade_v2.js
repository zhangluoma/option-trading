#!/usr/bin/env node
/**
 * dYdX v4 交易脚本 v2
 * 简化版：直接用 IndexerClient 查询 + ValidatorClient 下单
 */

const { IndexerClient, ValidatorClient, Network, LocalWallet } = require('@dydxprotocol/v4-client-js');
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

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🚀 dYdX v4 交易测试 v2\n');
  
  // 加载配置
  const config = loadEnv();
  const mnemonic = config.DYDX_MNEMONIC;
  
  if (!mnemonic) {
    console.error('❌ 未找到 DYDX_MNEMONIC');
    process.exit(1);
  }
  
  console.log(`📡 网络: mainnet\n`);
  
  // 创建 Indexer 客户端（查询用）
  const indexerConfig = Network.mainnet().indexerConfig;
  const indexerClient = new IndexerClient(indexerConfig);
  
  console.log('✅ Indexer 客户端创建成功\n');
  
  // 从助记词恢复钱包
  console.log('🔑 从助记词恢复钱包...');
  const wallet = await LocalWallet.fromMnemonic(mnemonic, 'dydx');
  const address = wallet.address;
  
  console.log(`   地址: ${address}\n`);
  
  // 1. 获取账户余额
  console.log('💰 获取账户信息...');
  const accountResponse = await indexerClient.account.getSubaccount(address, 0);
  
  const equity = parseFloat(accountResponse.subaccount.equity);
  const freeCollateral = parseFloat(accountResponse.subaccount.freeCollateral);
  
  console.log(`   总权益: $${equity.toFixed(2)}`);
  console.log(`   可用余额: $${freeCollateral.toFixed(2)}\n`);
  
  if (freeCollateral < 20) {
    console.error('❌ 余额不足，至少需要 $20');
    process.exit(1);
  }
  
  // 2. 获取 ETH 价格
  console.log('📊 获取 ETH-USD 价格...');
  const marketsResponse = await indexerClient.markets.getPerpetualMarkets();
  const ethMarket = marketsResponse.markets['ETH-USD'];
  
  const oraclePrice = parseFloat(ethMarket.oraclePrice);
  console.log(`   Oracle 价格: $${oraclePrice.toFixed(2)}`);
  
  // 获取订单簿
  const orderbookResponse = await indexerClient.markets.getPerpetualMarketOrderbook('ETH-USD');
  const bestBid = parseFloat(orderbookResponse.bids[0].price);
  const bestAsk = parseFloat(orderbookResponse.asks[0].price);
  
  console.log(`   买一: $${bestBid}`);
  console.log(`   卖一: $${bestAsk}\n`);
  
  // 3. 创建 Validator 客户端（下单用）
  console.log('🔗 连接 Validator...');
  const validatorConfig = Network.mainnet().validatorConfig;
  const validatorClient = await ValidatorClient.connect(validatorConfig);
  
  console.log('✅ Validator 连接成功\n');
  
  // 4. 下 Maker 单开多 ETH
  const size = 0.01; // 0.01 ETH
  const buyPrice = Math.round((bestBid - 0.1) * 10) / 10; // 比买一低 $0.1，四舍五入到 0.1
  
  console.log(`📝 准备下单:`);
  console.log(`   市场: ETH-USD`);
  console.log(`   方向: 买入 (LONG)`);
  console.log(`   数量: ${size} ETH`);
  console.log(`   价格: $${buyPrice.toFixed(1)} (Maker)`);
  console.log(`   预计金额: $${(size * buyPrice).toFixed(2)}\n`);
  
  const clientId = Date.now();
  const goodTilBlock = await validatorClient.get.latestBlockHeight() + 100; // 100 块之后过期
  
  try {
    console.log('⚠️  实际下单功能需要完整的 SDK 支持');
    console.log('   当前版本只能查询，无法下单');
    console.log('\n💡 建议:');
    console.log('   1. 使用 Python SDK (如果能修好)');
    console.log('   2. 使用 TypeScript 完整项目');
    console.log('   3. 或者先手动在 CLI 测试\n');
    
    // 以下是伪代码，实际需要正确的 API
    /*
    const tx = await validatorClient.post.placeOrder(
      wallet,
      {
        clientId,
        orderFlags: 0,
        clobPairId: 1, // ETH-USD
        side: 'BUY',
        quantums: size * 1e10, // 转换为最小单位
        subticks: buyPrice * 1e6,
        goodTilBlock,
        timeInForce: 'POST_ONLY',
      },
      0 // broadcast mode
    );
    */
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
  }
}

main().catch(console.error);
