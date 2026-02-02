#!/usr/bin/env node
/**
 * 自动交易系统测试脚本
 * 
 * 测试各个组件是否正常工作（不真实下单）
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Testing Auto Trader System\n');

// Test 1: 信号获取
console.log('Test 1: Signal Retrieval');
console.log('='.repeat(50));

const testTickers = ['BTC', 'ETH', 'SOL'];
let testsPassed = 0;
let testsFailed = 0;

async function testSignalRetrieval() {
  for (const ticker of testTickers) {
    try {
      const signal = await getSignal(ticker);
      console.log(`✅ ${ticker}: signal_type=${signal.signal_type}, strength=${signal.strength.toFixed(2)}, confidence=${signal.confidence.toFixed(2)}`);
      testsPassed++;
    } catch (error) {
      console.log(`❌ ${ticker}: ${error.message}`);
      testsFailed++;
    }
  }
}

function getSignal(ticker) {
  return new Promise((resolve, reject) => {
    const python = spawn('python3', [
      path.join(__dirname, 'get_signal.py'),
      ticker
    ]);
    
    let output = '';
    let error = '';
    
    python.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python script failed: ${error}`));
        return;
      }
      
      try {
        const signal = JSON.parse(output);
        resolve(signal);
      } catch (e) {
        reject(new Error(`Failed to parse signal: ${e.message}`));
      }
    });
  });
}

// Test 2: dYdX 连接
async function testDydxConnection() {
  console.log('\nTest 2: dYdX Connection');
  console.log('='.repeat(50));
  
  const {
    CompositeClient,
    Network,
    LocalWallet,
  } = require('@dydxprotocol/v4-client-js');
  
  const fs = require('fs');
  
  try {
    // 加载 .env
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
    
    const mnemonic = config.DYDX_MNEMONIC;
    
    if (!mnemonic) {
      throw new Error('DYDX_MNEMONIC not found in .env');
    }
    
    // 创建钱包
    const wallet = await LocalWallet.fromMnemonic(mnemonic, 'dydx');
    console.log(`✅ Wallet address: ${wallet.address}`);
    testsPassed++;
    
    // 连接客户端
    const network = Network.mainnet();
    const client = await CompositeClient.connect(network);
    console.log('✅ Connected to dYdX mainnet');
    testsPassed++;
    
    // 获取账户信息
    const response = await client.indexerClient.account.getSubaccount(
      wallet.address,
      0
    );
    
    const equity = parseFloat(response.subaccount.equity);
    const freeCollateral = parseFloat(response.subaccount.freeCollateral);
    
    console.log(`✅ Account equity: $${equity.toFixed(2)}`);
    console.log(`✅ Free collateral: $${freeCollateral.toFixed(2)}`);
    testsPassed++;
    
    if (freeCollateral < 20) {
      console.log('⚠️  Warning: Balance less than $20');
    }
    
  } catch (error) {
    console.log(`❌ dYdX connection failed: ${error.message}`);
    testsFailed++;
  }
}

// Test 3: 文件系统
async function testFileSystem() {
  console.log('\nTest 3: File System');
  console.log('='.repeat(50));
  
  const fs = require('fs');
  
  const requiredDirs = ['logs', 'data'];
  
  for (const dir of requiredDirs) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✅ Created directory: ${dir}`);
      } else {
        console.log(`✅ Directory exists: ${dir}`);
      }
      testsPassed++;
    } catch (error) {
      console.log(`❌ Failed to create ${dir}: ${error.message}`);
      testsFailed++;
    }
  }
  
  // 测试日志写入
  try {
    const testLog = path.join('logs', 'test.log');
    fs.writeFileSync(testLog, 'Test log entry\n');
    console.log('✅ Log file writable');
    testsPassed++;
  } catch (error) {
    console.log(`❌ Log file not writable: ${error.message}`);
    testsFailed++;
  }
  
  // 测试持仓文件
  try {
    const testPositions = path.join('data', 'test_positions.json');
    fs.writeFileSync(testPositions, JSON.stringify([{ test: true }]));
    console.log('✅ Data file writable');
    testsPassed++;
  } catch (error) {
    console.log(`❌ Data file not writable: ${error.message}`);
    testsFailed++;
  }
}

// Run all tests
(async () => {
  try {
    await testSignalRetrieval();
    await testDydxConnection();
    await testFileSystem();
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 Test Results');
    console.log('='.repeat(50));
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(`📈 Success Rate: ${(testsPassed / (testsPassed + testsFailed) * 100).toFixed(1)}%`);
    
    if (testsFailed === 0) {
      console.log('\n🎉 All tests passed! System ready.');
      console.log('\nNext steps:');
      console.log('  1. Make sure sentiment database has data');
      console.log('  2. Run: ./trader_control.sh start-dry-run');
      console.log('  3. Monitor: ./trader_control.sh logs');
      console.log('  4. When confident, run: ./trader_control.sh start');
    } else {
      console.log('\n⚠️  Some tests failed. Please fix issues before running.');
    }
    
    process.exit(testsFailed === 0 ? 0 : 1);
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
})();
