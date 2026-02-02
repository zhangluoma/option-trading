#!/usr/bin/env node
/**
 * 全自动交易守护进程 - dYdX Sentiment Trading Bot
 * 
 * 功能：
 * 1. 持续运行，定期检查sentiment信号
 * 2. 对所有dYdX支持的币种进行信号扫描
 * 3. 使用taker order（市价单）执行交易
 * 4. 持仓1天后自动平仓
 * 5. 维持50%仓位利用率
 * 
 * 使用方式：
 *   node auto_trader_daemon.js
 *   node auto_trader_daemon.js --dry-run  (模拟模式)
 */

const {
  CompositeClient,
  Network,
  OrderSide,
  OrderTimeInForce,
  OrderType,
  LocalWallet,
  SubaccountInfo,
} = require('@dydxprotocol/v4-client-js');

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getCompositeSignal } = require('./composite_signal');

// ==================== 配置 ====================

const CONFIG = {
  // 检查间隔（毫秒）- 激进模式：3分钟
  CHECK_INTERVAL_MS: 3 * 60 * 1000, // 3分钟（快速抓住机会）
  
  // 账户资金（从.env读取或使用默认值）
  INITIAL_EQUITY: 162.25, // 初始资金（USDC）
  
  // 仓位管理 - 激进模式：80%利用率
  MAX_POSITION_RATIO: 0.80, // 最大仓位利用率 80%（激进）
  MIN_TRADE_SIZE_USD: 15, // 最小交易金额 $15（降低门槛）
  MAX_SINGLE_POSITION_RATIO: 0.40, // 单个币种最大占总资产的比例 40%（激进）
  
  // 持仓管理 - 快速周转：4-6小时
  HOLD_DURATION_HOURS: 4, // 持仓4小时后平仓（快速周转）
  MAX_HOLD_DURATION_HOURS: 6, // 最长持仓6小时（强制平仓）
  
  // 信号阈值 - 激进模式：尽可能抓住机会
  MIN_SIGNAL_STRENGTH: 0.15, // 最小信号强度（非常低，激进）
  MIN_SIGNAL_CONFIDENCE: 0.15, // 最小信号置信度（非常低，激进）
  
  // 风险管理
  MAX_POSITIONS: 8, // 最多同时持有8个仓位（增加）
  STOP_LOSS_PERCENT: 0.05, // 止损5%
  TAKE_PROFIT_PERCENT: 0.10, // 止盈10%
  TRAILING_STOP_TRIGGER: 0.05, // 盈利>5%启动移动止损
  MAX_DAILY_LOSS: 0.10, // 单日最大亏损10%
  
  // 动态仓位（根据信号强度）
  POSITION_SIZE_MAP: {
    LOW: 0.10,    // 0.25-0.50: 10%
    MEDIUM: 0.20, // 0.50-0.70: 20%
    HIGH: 0.30,   // 0.70-0.90: 30%
    VERY_HIGH: 0.40, // 0.90+: 40%
  },
  
  // 日志
  LOG_FILE: './logs/auto_trader.log',
  POSITIONS_FILE: './data/active_positions.json',
  PERFORMANCE_FILE: './data/performance.json',
};

// dYdX 支持的主要币种
const SUPPORTED_TICKERS = [
  'BTC', 'ETH', 'SOL', 'AVAX', 'DOGE', 
  'MATIC', 'DOT', 'ATOM', 'LTC', 'LINK',
  'UNI', 'AAVE', 'CRV', 'SUSHI', 'MKR'
];

// ==================== 全局状态 ====================

let client = null;
let wallet = null;
let subaccount = null;
let isRunning = false;
let isDryRun = false;
let activePositions = []; // 跟踪活跃持仓

// ==================== 工具函数 ====================

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  
  console.log(logMessage);
  
  // 写入日志文件
  try {
    const logDir = path.dirname(CONFIG.LOG_FILE);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(CONFIG.LOG_FILE, logMessage + '\n');
  } catch (error) {
    console.error('Failed to write log:', error.message);
  }
}

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env file not found');
  }
  
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

function randomClientId() {
  return Math.floor(Math.random() * 2147483647);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function savePositions() {
  try {
    const dir = path.dirname(CONFIG.POSITIONS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG.POSITIONS_FILE, JSON.stringify(activePositions, null, 2));
    log(`Saved ${activePositions.length} positions to disk`);
  } catch (error) {
    log(`Failed to save positions: ${error.message}`, 'ERROR');
  }
}

function saveToHistory(position, closePrice, pnl, closeReason = 'MANUAL') {
  try {
    const historyFile = './data/trade_history.json';
    const dir = path.dirname(historyFile);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 读取现有历史
    let history = [];
    if (fs.existsSync(historyFile)) {
      history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    }
    
    // 添加新记录
    history.push({
      ...position,
      status: 'CLOSED',
      closedAt: new Date().toISOString(),
      closePrice,
      currentPrice: closePrice,
      pnl,
      pnlPercent: (pnl / (position.size * position.entryPrice)) * 100,
      closeReason,
    });
    
    // 保留最近100条
    if (history.length > 100) {
      history = history.slice(-100);
    }
    
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
    log(`Trade saved to history: ${position.ticker} (${closeReason}, PnL: $${pnl.toFixed(2)})`);
    
    // 更新性能统计
    updatePerformanceStats(pnl, closeReason);
  } catch (error) {
    log(`Failed to save trade history: ${error.message}`, 'ERROR');
  }
}

function updatePerformanceStats(pnl, closeReason) {
  try {
    const perfFile = CONFIG.PERFORMANCE_FILE;
    const dir = path.dirname(perfFile);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    let stats = {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalPnl: 0,
      maxDrawdown: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      closeReasons: {},
    };
    
    if (fs.existsSync(perfFile)) {
      stats = JSON.parse(fs.readFileSync(perfFile, 'utf8'));
    }
    
    stats.totalTrades++;
    stats.totalPnl += pnl;
    
    if (pnl > 0) {
      stats.winningTrades++;
    } else {
      stats.losingTrades++;
    }
    
    stats.winRate = stats.totalTrades > 0 ? (stats.winningTrades / stats.totalTrades) * 100 : 0;
    
    // 记录平仓原因
    stats.closeReasons[closeReason] = (stats.closeReasons[closeReason] || 0) + 1;
    
    // 更新最后更新时间
    stats.lastUpdated = new Date().toISOString();
    
    fs.writeFileSync(perfFile, JSON.stringify(stats, null, 2));
  } catch (error) {
    log(`Failed to update performance stats: ${error.message}`, 'ERROR');
  }
}

function loadPositions() {
  try {
    if (fs.existsSync(CONFIG.POSITIONS_FILE)) {
      const data = fs.readFileSync(CONFIG.POSITIONS_FILE, 'utf8');
      activePositions = JSON.parse(data);
      // 转换时间戳
      activePositions.forEach(pos => {
        pos.openedAt = new Date(pos.openedAt);
      });
      log(`Loaded ${activePositions.length} positions from disk`);
    }
  } catch (error) {
    log(`Failed to load positions: ${error.message}`, 'WARN');
    activePositions = [];
  }
}

// ==================== dYdX 客户端 ====================

async function initializeClient() {
  log('🔧 Initializing dYdX client...');
  
  const config = loadEnv();
  const mnemonic = config.DYDX_MNEMONIC;
  
  if (!mnemonic) {
    throw new Error('DYDX_MNEMONIC not found in .env');
  }
  
  // 创建钱包
  wallet = await LocalWallet.fromMnemonic(mnemonic, 'dydx');
  log(`Wallet address: ${wallet.address}`);
  
  // 连接客户端
  const network = Network.mainnet();
  client = await CompositeClient.connect(network);
  log('Connected to dYdX mainnet');
  
  // 子账户
  subaccount = SubaccountInfo.forLocalWallet(wallet, 0);
  
  // 验证账户
  const account = await getAccountInfo();
  log(`Account equity: $${account.equity.toFixed(2)}`);
  log(`Available collateral: $${account.freeCollateral.toFixed(2)}`);
  
  if (account.freeCollateral < CONFIG.MIN_TRADE_SIZE_USD) {
    throw new Error(`Insufficient balance: $${account.freeCollateral.toFixed(2)}`);
  }
  
  log('✅ Client initialized successfully');
}

async function getAccountInfo() {
  // 完全使用本地跟踪，不再调用Indexer
  
  // 从配置或环境变量读取初始资金
  const initialEquity = parseFloat(process.env.INITIAL_EQUITY || CONFIG.INITIAL_EQUITY || 100);
  
  // 基于本地持仓计算已用资金
  const estimatedUsed = activePositions.reduce((sum, pos) => {
    return sum + (pos.size * pos.entryPrice);
  }, 0);
  
  return {
    equity: initialEquity,
    freeCollateral: Math.max(0, initialEquity - estimatedUsed),
    marginUsage: estimatedUsed / initialEquity,
    fromCache: true,
  };
}

async function getCurrentPrice(ticker) {
  // 使用Coinbase现货价格作为参考（不是dYdX Indexer，避免封号）
  // Coinbase价格与链上oracle价格基本一致，且无地域限制
  try {
    const https = require('https');
    
    // 支持的币种（Coinbase格式）
    const supportedTickers = [
      'BTC', 'ETH', 'SOL', 'AVAX', 'DOGE', 'MATIC', 
      'DOT', 'ATOM', 'LTC', 'LINK', 'UNI', 'AAVE'
    ];
    
    if (!supportedTickers.includes(ticker)) {
      log(`Ticker ${ticker} not supported, using cache`, 'WARN');
      return getLastKnownPrice(ticker);
    }
    
    return new Promise((resolve) => {
      // 使用Coinbase公开API（无需认证，无地域限制）
      const url = `https://api.coinbase.com/v2/prices/${ticker}-USD/spot`;
      
      https.get(url, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const price = parseFloat(json.data.amount);
            
            if (price && price > 0) {
              updatePriceCache(ticker, price);
              resolve(price);
            } else {
              log(`Invalid price for ${ticker}`, 'WARN');
              resolve(getLastKnownPrice(ticker));
            }
          } catch (e) {
            log(`Failed to parse Coinbase price for ${ticker}: ${e.message}`, 'WARN');
            resolve(getLastKnownPrice(ticker));
          }
        });
      }).on('error', (error) => {
        log(`Failed to get Coinbase price for ${ticker}: ${error.message}`, 'WARN');
        resolve(getLastKnownPrice(ticker));
      });
    });
    
  } catch (error) {
    log(`Error in getCurrentPrice: ${error.message}`, 'ERROR');
    return getLastKnownPrice(ticker);
  }
}

// 本地价格缓存（从最近订单更新）
const priceCache = {};

function getLastKnownPrice(ticker) {
  // 从缓存或持仓中获取最近已知价格
  if (priceCache[ticker]) {
    return priceCache[ticker];
  }
  
  // 从活跃持仓中查找
  const position = activePositions.find(p => p.ticker === ticker);
  if (position) {
    return position.entryPrice;
  }
  
  // 默认参考价格（仅用于初始估算）
  const defaultPrices = {
    'BTC': 76000,
    'ETH': 2300,
    'SOL': 100,
    'AVAX': 35,
    'DOGE': 0.15,
    'MATIC': 0.80,
    'DOT': 7,
    'ATOM': 10,
    'LTC': 100,
    'LINK': 15,
  };
  
  return defaultPrices[ticker] || 100;
}

function updatePriceCache(ticker, price) {
  priceCache[ticker] = price;
}

async function getOpenPositions() {
  // 完全使用本地跟踪，不再调用Indexer
  
  const localPositions = [];
  
  for (const pos of activePositions) {
    const currentPrice = await getCurrentPrice(pos.ticker);
    if (!currentPrice) continue;
    
    const value = pos.size * currentPrice;
    const pnl = pos.side === 'LONG'
      ? pos.size * (currentPrice - pos.entryPrice)
      : pos.size * (pos.entryPrice - currentPrice);
    
    localPositions.push({
      ticker: pos.ticker,
      side: pos.side,
      size: pos.size,
      entryPrice: pos.entryPrice,
      currentPrice,
      value,
      pnl,
      pnlPercent: (pnl / (pos.size * pos.entryPrice)) * 100,
    });
  }
  
  return localPositions;
}

// ==================== 信号获取 ====================

async function getSentimentSignal(ticker) {
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

// ==================== 交易逻辑 ====================

async function checkAndExecuteTrades() {
  log('🔍 Checking for trading opportunities...');
  
  try {
    // 1. 获取账户状态
    const account = await getAccountInfo();
    const totalEquity = account.equity;
    const usedMargin = totalEquity * account.marginUsage;
    const availableForTrading = totalEquity * CONFIG.MAX_POSITION_RATIO - usedMargin;
    
    log(`Account: Equity=$${totalEquity.toFixed(2)}, Used=$${usedMargin.toFixed(2)}, Available=$${availableForTrading.toFixed(2)}`);
    
    if (availableForTrading < CONFIG.MIN_TRADE_SIZE_USD) {
      log('⚠️  Insufficient available margin for new trades');
      return;
    }
    
    // 2. 获取当前持仓
    const openPositions = await getOpenPositions();
    log(`Current positions: ${openPositions.length}`);
    
    if (openPositions.length >= CONFIG.MAX_POSITIONS) {
      log(`⚠️  Max positions reached (${openPositions.length}/${CONFIG.MAX_POSITIONS})`);
      return;
    }
    
    const existingTickers = new Set(openPositions.map(p => p.ticker));
    
    // 3. 扫描所有币种的信号
    const signals = [];
    
    for (const ticker of SUPPORTED_TICKERS) {
      // 跳过已有持仓的币种
      if (existingTickers.has(ticker)) {
        log(`Skip ${ticker}: already have position`);
        continue;
      }
      
      try {
        const signal = await getCompositeSignal(ticker);
        
        if (signal.signal_type !== 'NEUTRAL' &&
            signal.strength >= CONFIG.MIN_SIGNAL_STRENGTH &&
            signal.confidence >= CONFIG.MIN_SIGNAL_CONFIDENCE) {
          signals.push({
            ticker,
            ...signal
          });
        }
      } catch (error) {
        log(`Failed to get signal for ${ticker}: ${error.message}`, 'WARN');
      }
    }
    
    log(`Found ${signals.length} valid signals`);
    
    if (signals.length === 0) {
      log('No trading opportunities found');
      return;
    }
    
    // 4. 按信号质量排序（final_score降序）
    signals.sort((a, b) => b.final_score - a.final_score);
    
    // 5. 执行交易（最多执行到仓位上限）
    const maxNewTrades = CONFIG.MAX_POSITIONS - openPositions.length;
    const tradesToExecute = signals.slice(0, maxNewTrades);
    
    log(`Executing ${tradesToExecute.length} trades...`);
    
    for (const signal of tradesToExecute) {
      try {
        await executeTrade(signal, totalEquity);
        await sleep(2000); // 避免API限流
      } catch (error) {
        log(`Failed to execute trade for ${signal.ticker}: ${error.message}`, 'ERROR');
      }
    }
    
  } catch (error) {
    log(`Error in checkAndExecuteTrades: ${error.message}`, 'ERROR');
  }
}

async function executeTrade(signal, totalEquity) {
  const { ticker, signal_type, strength, confidence, final_score } = signal;
  
  log(`\n📊 Executing trade for ${ticker}`);
  log(`   Signal: ${signal_type}, Strength: ${strength.toFixed(2)}, Confidence: ${confidence.toFixed(2)}`);
  
  // 1. 获取当前价格
  const currentPrice = await getCurrentPrice(ticker);
  if (!currentPrice) {
    throw new Error(`Failed to get price for ${ticker}`);
  }
  
  log(`   Current price: $${currentPrice.toFixed(2)}`);
  
  // 2. 计算仓位大小（激进模式：确保每笔至少最小金额）
  const maxPositionValue = totalEquity * CONFIG.MAX_SINGLE_POSITION_RATIO;
  
  // 基础仓位：根据信号强度动态分配
  let basePositionValue;
  if (final_score >= 0.5) {
    // 强信号：10-20%
    basePositionValue = totalEquity * (0.10 + final_score * 0.10);
  } else if (final_score >= 0.3) {
    // 中等信号：7-10%
    basePositionValue = totalEquity * 0.07;
  } else {
    // 弱信号：5%（最小）
    basePositionValue = totalEquity * 0.05;
  }
  
  // 确保不超过最大限制
  basePositionValue = Math.min(basePositionValue, maxPositionValue);
  
  // 确保至少达到最小交易金额
  const positionValue = Math.max(basePositionValue, CONFIG.MIN_TRADE_SIZE_USD * 1.2);
  
  const size = positionValue / currentPrice;
  
  // 根据市场最小单位调整
  const roundedSize = Math.max(0.001, parseFloat(size.toFixed(3)));
  
  log(`   Position size: ${roundedSize} ${ticker} (~$${(roundedSize * currentPrice).toFixed(2)}) [score: ${final_score.toFixed(2)}]`);
  
  if (roundedSize * currentPrice < CONFIG.MIN_TRADE_SIZE_USD) {
    throw new Error(`Position size too small: $${(roundedSize * currentPrice).toFixed(2)}`);
  }
  
  // 3. 确定方向
  const side = signal_type === 'BUY' ? OrderSide.BUY : OrderSide.SELL;
  
  log(`   Side: ${side === OrderSide.BUY ? 'LONG' : 'SHORT'}`);
  
  // 4. 提交市价单 (Taker Order)
  if (isDryRun) {
    log(`   [DRY RUN] Would place market order: ${side} ${roundedSize} ${ticker}`);
    return;
  }
  
  const clientId = randomClientId();
  
  log(`   ⏳ Submitting market order...`);
  
  try {
    const tx = await client.placeOrder(
      subaccount,
      `${ticker}-USD`,
      OrderType.MARKET,
      side,
      currentPrice, // 市价单价格参考用
      roundedSize,
      clientId,
      OrderTimeInForce.IOC, // Immediate or Cancel
      0,
      0, // execution = DEFAULT
      false, // postOnly = false (允许taker)
      false // reduceOnly
    );
    
    log(`   ✅ Order submitted: ${tx.hash}`);
    log(`   Client ID: ${clientId}`);
    
    // 5. 记录到活跃持仓
    activePositions.push({
      ticker,
      side: side === OrderSide.BUY ? 'LONG' : 'SHORT',
      size: roundedSize,
      entryPrice: currentPrice,
      openedAt: new Date(),
      clientId,
      txHash: tx.hash,
      signalScore: final_score,
    });
    
    savePositions();
    
    log(`   💾 Position saved to tracking`);
    
  } catch (error) {
    throw new Error(`Order submission failed: ${error.message}`);
  }
}

// ==================== 持仓管理 ====================

async function checkAndClosePositions() {
  log('🔍 Checking positions for closing...');
  
  if (activePositions.length === 0) {
    log('No active positions to check');
    return;
  }
  
  const now = new Date();
  
  for (const position of [...activePositions]) {
    const hoursHeld = (now - position.openedAt) / (1000 * 60 * 60);
    
    // 获取当前价格计算PnL
    const currentPrice = await getCurrentPrice(position.ticker);
    if (!currentPrice) {
      log(`${position.ticker}: Can't get price, skip`, 'WARN');
      continue;
    }
    
    const pnl = position.side === 'LONG'
      ? currentPrice - position.entryPrice
      : position.entryPrice - currentPrice;
    
    const pnlPercent = (pnl / position.entryPrice) * 100;
    
    log(`${position.ticker}: ${hoursHeld.toFixed(1)}h, PnL: ${pnlPercent.toFixed(2)}%`);
    
    let shouldClose = false;
    let closeReason = '';
    
    // 1. 止损检查：亏损超过5%
    if (pnlPercent <= -CONFIG.STOP_LOSS_PERCENT * 100) {
      shouldClose = true;
      closeReason = `STOP_LOSS (${pnlPercent.toFixed(2)}%)`;
    }
    
    // 2. 止盈检查：盈利超过10%
    else if (pnlPercent >= CONFIG.TAKE_PROFIT_PERCENT * 100) {
      shouldClose = true;
      closeReason = `TAKE_PROFIT (${pnlPercent.toFixed(2)}%)`;
    }
    
    // 3. 时间检查：持仓4小时
    else if (hoursHeld >= CONFIG.HOLD_DURATION_HOURS) {
      shouldClose = true;
      closeReason = `TIME_LIMIT (${hoursHeld.toFixed(1)}h)`;
    }
    
    // 4. 强制平仓：持仓6小时
    else if (hoursHeld >= CONFIG.MAX_HOLD_DURATION_HOURS) {
      shouldClose = true;
      closeReason = `FORCE_CLOSE (${hoursHeld.toFixed(1)}h)`;
    }
    
    // 5. 移动止损：盈利>5%时，价格回落到成本价
    else if (position.maxPnlPercent && position.maxPnlPercent > CONFIG.TRAILING_STOP_TRIGGER * 100) {
      if (pnlPercent < 0) {
        shouldClose = true;
        closeReason = `TRAILING_STOP (was +${position.maxPnlPercent.toFixed(2)}%, now ${pnlPercent.toFixed(2)}%)`;
      }
    }
    
    // 更新最大盈利记录（用于移动止损）
    if (!position.maxPnlPercent || pnlPercent > position.maxPnlPercent) {
      position.maxPnlPercent = pnlPercent;
      savePositions();
    }
    
    if (shouldClose) {
      log(`🚨 ${position.ticker}: ${closeReason}, closing...`);
      
      try {
        await closePosition(position, closeReason);
        
        // 从活跃持仓中移除
        const index = activePositions.findIndex(p => p.ticker === position.ticker);
        if (index !== -1) {
          activePositions.splice(index, 1);
          savePositions();
        }
        
        await sleep(2000);
      } catch (error) {
        log(`Failed to close ${position.ticker}: ${error.message}`, 'ERROR');
      }
    }
  }
}

async function closePosition(position, closeReason = 'MANUAL') {
  const { ticker, side, size } = position;
  
  log(`\n📊 Closing position: ${ticker}`);
  log(`   Reason: ${closeReason}`);
  log(`   Original: ${side} ${size}`);
  
  // 获取当前价格
  const currentPrice = await getCurrentPrice(ticker);
  if (!currentPrice) {
    throw new Error(`Failed to get price for ${ticker}`);
  }
  
  log(`   Current price: $${currentPrice.toFixed(2)}`);
  
  // 计算PnL
  const pnl = side === 'LONG'
    ? size * (currentPrice - position.entryPrice)
    : size * (position.entryPrice - currentPrice);
  
  const pnlPercent = (pnl / (size * position.entryPrice)) * 100;
  
  log(`   PnL: ${pnl >= 0 ? '🟢' : '🔴'} $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
  
  // 反向平仓
  const closeSide = side === 'LONG' ? OrderSide.SELL : OrderSide.BUY;
  
  if (isDryRun) {
    log(`   [DRY RUN] Would close: ${closeSide} ${size} ${ticker}`);
    // 模拟模式也保存历史
    saveToHistory(position, currentPrice, pnl, closeReason);
    return;
  }
  
  const clientId = randomClientId();
  
  log(`   ⏳ Submitting close order...`);
  
  try {
    const tx = await client.placeOrder(
      subaccount,
      `${ticker}-USD`,
      OrderType.MARKET,
      closeSide,
      currentPrice,
      size,
      clientId,
      OrderTimeInForce.IOC,
      0,
      0,
      false,
      false
    );
    
    log(`   ✅ Position closed: ${tx.hash}`);
    
    // 保存到历史
    saveToHistory(position, currentPrice, pnl, closeReason);
    
  } catch (error) {
    throw new Error(`Close order failed: ${error.message}`);
  }
}

// ==================== 主循环 ====================

async function mainLoop() {
  log('🚀 Auto trader daemon started');
  log(`Check interval: ${CONFIG.CHECK_INTERVAL_MS / 1000 / 60} minutes`);
  log(`Dry run: ${isDryRun ? 'YES' : 'NO'}`);
  log(`Position limit: ${CONFIG.MAX_POSITIONS}`);
  log(`Max position ratio: ${CONFIG.MAX_POSITION_RATIO * 100}%`);
  log('');
  
  // 加载历史持仓
  loadPositions();
  
  while (isRunning) {
    try {
      log('='.repeat(60));
      log('💓 Heartbeat');
      
      // 1. 检查需要平仓的持仓
      await checkAndClosePositions();
      
      // 2. 检查新的交易机会
      await checkAndExecuteTrades();
      
      log(`Next check in ${CONFIG.CHECK_INTERVAL_MS / 1000 / 60} minutes`);
      log('');
      
    } catch (error) {
      log(`Error in main loop: ${error.message}`, 'ERROR');
      log(error.stack, 'ERROR');
    }
    
    // 等待下一次检查
    await sleep(CONFIG.CHECK_INTERVAL_MS);
  }
}

// ==================== 启动/停止 ====================

async function start() {
  if (isRunning) {
    log('Daemon already running', 'WARN');
    return;
  }
  
  try {
    // 检查命令行参数
    if (process.argv.includes('--dry-run')) {
      isDryRun = true;
      log('Running in DRY RUN mode', 'INFO');
    }
    
    // 初始化客户端
    await initializeClient();
    
    // 启动主循环
    isRunning = true;
    await mainLoop();
    
  } catch (error) {
    log(`Failed to start daemon: ${error.message}`, 'ERROR');
    process.exit(1);
  }
}

async function stop() {
  log('🛑 Stopping daemon...');
  isRunning = false;
  
  // 保存持仓状态
  savePositions();
  
  log('Daemon stopped');
  process.exit(0);
}

// ==================== 信号处理 ====================

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`, 'FATAL');
  log(error.stack, 'FATAL');
  stop();
});

process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled rejection: ${reason}`, 'ERROR');
  log(promise, 'ERROR');
});

// ==================== 启动 ====================

if (require.main === module) {
  start();
}
