#!/usr/bin/env node

/**
 * dYdX数据访问层 - 带缓存版本
 * 减少API调用频率，避免429限流
 */

const dydx = require('./dydx_data');

// 缓存配置
const CACHE_TTL_MS = 3000; // 3秒缓存

// 缓存对象
const cache = {
  positions: { data: null, timestamp: 0 },
  balance: { data: null, timestamp: 0 },
  fullStatus: { data: null, timestamp: 0 }
};

/**
 * 检查缓存是否有效
 */
function isCacheValid(cacheEntry) {
  if (!cacheEntry.data) return false;
  const age = Date.now() - cacheEntry.timestamp;
  return age < CACHE_TTL_MS;
}

/**
 * 获取持仓（带缓存）
 */
async function getPositions() {
  if (isCacheValid(cache.positions)) {
    return cache.positions.data;
  }
  
  try {
    const positions = await dydx.getPositions();
    cache.positions = {
      data: positions,
      timestamp: Date.now()
    };
    return positions;
  } catch (error) {
    // 如果请求失败但有旧缓存，返回旧缓存
    if (cache.positions.data) {
      console.warn('⚠️  API请求失败，使用旧缓存:', error.message);
      return cache.positions.data;
    }
    throw error;
  }
}

/**
 * 获取余额（带缓存）
 */
async function getBalance() {
  if (isCacheValid(cache.balance)) {
    return cache.balance.data;
  }
  
  try {
    const balance = await dydx.getBalance();
    cache.balance = {
      data: balance,
      timestamp: Date.now()
    };
    return balance;
  } catch (error) {
    if (cache.balance.data) {
      console.warn('⚠️  API请求失败，使用旧缓存:', error.message);
      return cache.balance.data;
    }
    throw error;
  }
}

/**
 * 获取完整状态（带缓存）
 */
async function getFullAccountStatus() {
  if (isCacheValid(cache.fullStatus)) {
    return cache.fullStatus.data;
  }
  
  try {
    const status = await dydx.getFullAccountStatus();
    cache.fullStatus = {
      data: status,
      timestamp: Date.now()
    };
    return status;
  } catch (error) {
    if (cache.fullStatus.data) {
      console.warn('⚠️  API请求失败，使用旧缓存:', error.message);
      return cache.fullStatus.data;
    }
    throw error;
  }
}

/**
 * 清空缓存
 */
function clearCache() {
  cache.positions = { data: null, timestamp: 0 };
  cache.balance = { data: null, timestamp: 0 };
  cache.fullStatus = { data: null, timestamp: 0 };
}

module.exports = {
  getPositions,
  getBalance,
  getFullAccountStatus,
  clearCache,
  
  // 透传其他函数
  getClient: dydx.getClient,
  getPrice: dydx.getPrice,
  getAllPrices: dydx.getAllPrices,
  getAccountInfo: dydx.getAccountInfo,
  getMarketConfigs: dydx.getMarketConfigs
};
