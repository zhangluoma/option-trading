#!/usr/bin/env node

/**
 * 区块链扫描持久化层
 * 
 * 功能:
 * 1. 记录已处理的区块高度
 * 2. 缓存提取的fills
 * 3. 支持断点续传
 * 4. 避免重复处理
 */

const fs = require('fs');
const path = require('path');

const PERSIST_FILE = path.join(__dirname, 'data', 'blockchain_scan_state.json');

/**
 * 持久化状态结构
 */
class BlockchainPersist {
  constructor() {
    this.state = {
      lastProcessedHeight: 0,
      processedBlocks: [], // 保留最近1000个区块记录
      fills: [], // 缓存的fills
      stats: {
        totalBlocksProcessed: 0,
        totalFillsFound: 0,
        firstScan: null,
        lastScan: null
      }
    };
    
    this.load();
  }
  
  /**
   * 从文件加载状态
   */
  load() {
    try {
      if (fs.existsSync(PERSIST_FILE)) {
        const data = fs.readFileSync(PERSIST_FILE, 'utf8');
        this.state = JSON.parse(data);
        console.log(`📂 加载持久化状态: 已处理到区块 ${this.state.lastProcessedHeight}`);
        console.log(`   总共: ${this.state.stats.totalBlocksProcessed} 区块, ${this.state.stats.totalFillsFound} fills`);
      } else {
        console.log('📂 创建新的持久化状态');
        this.save();
      }
    } catch (error) {
      console.error('❌ 加载持久化状态失败:', error.message);
      console.log('   使用新的状态');
    }
  }
  
  /**
   * 保存状态到文件
   */
  save() {
    try {
      const dir = path.dirname(PERSIST_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(PERSIST_FILE, JSON.stringify(this.state, null, 2));
    } catch (error) {
      console.error('❌ 保存持久化状态失败:', error.message);
    }
  }
  
  /**
   * 检查区块是否已处理
   */
  isBlockProcessed(height) {
    return height <= this.state.lastProcessedHeight;
  }
  
  /**
   * 标记区块为已处理
   */
  markBlockProcessed(height, fillsCount = 0) {
    // 更新最后处理的区块高度
    if (height > this.state.lastProcessedHeight) {
      this.state.lastProcessedHeight = height;
    }
    
    // 记录区块处理信息
    this.state.processedBlocks.push({
      height,
      fillsCount,
      processedAt: new Date().toISOString()
    });
    
    // 只保留最近1000个区块记录
    if (this.state.processedBlocks.length > 1000) {
      this.state.processedBlocks = this.state.processedBlocks.slice(-1000);
    }
    
    // 更新统计
    this.state.stats.totalBlocksProcessed++;
    this.state.stats.totalFillsFound += fillsCount;
    this.state.stats.lastScan = new Date().toISOString();
    
    if (!this.state.stats.firstScan) {
      this.state.stats.firstScan = new Date().toISOString();
    }
  }
  
  /**
   * 添加fills到缓存
   */
  addFills(fills) {
    for (const fill of fills) {
      // 避免重复添加（检查height + clientId）
      const exists = this.state.fills.some(f => 
        f.height === fill.height && 
        f.clientId === fill.clientId
      );
      
      if (!exists) {
        this.state.fills.push(fill);
      }
    }
    
    // 按区块高度排序
    this.state.fills.sort((a, b) => b.height - a.height);
    
    // 只保留最近1000个fills
    if (this.state.fills.length > 1000) {
      this.state.fills = this.state.fills.slice(0, 1000);
    }
  }
  
  /**
   * 获取缓存的fills
   */
  getFills(limit = 100) {
    return this.state.fills.slice(0, limit);
  }
  
  /**
   * 获取需要扫描的区块范围
   * 
   * @param {number} latestHeight - 最新区块高度
   * @param {number} maxBlocks - 最大扫描区块数
   * @returns {{fromHeight, toHeight}} 需要扫描的范围
   */
  getScanRange(latestHeight, maxBlocks = 5000) {
    let fromHeight;
    
    if (this.state.lastProcessedHeight === 0) {
      // 第一次扫描
      fromHeight = Math.max(1, latestHeight - maxBlocks);
    } else {
      // 断点续传：从上次处理的下一个区块开始
      fromHeight = this.state.lastProcessedHeight + 1;
      
      // 限制单次扫描的区块数
      if (latestHeight - fromHeight > maxBlocks) {
        fromHeight = latestHeight - maxBlocks;
      }
    }
    
    return {
      fromHeight,
      toHeight: latestHeight
    };
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.state.stats,
      lastProcessedHeight: this.state.lastProcessedHeight,
      cachedFills: this.state.fills.length,
      recentBlocks: this.state.processedBlocks.length
    };
  }
  
  /**
   * 清空缓存但保留进度
   */
  clearCache() {
    this.state.fills = [];
    this.save();
    console.log('🗑️  已清空fills缓存');
  }
  
  /**
   * 完全重置（慎用）
   */
  reset() {
    this.state = {
      lastProcessedHeight: 0,
      processedBlocks: [],
      fills: [],
      stats: {
        totalBlocksProcessed: 0,
        totalFillsFound: 0,
        firstScan: null,
        lastScan: null
      }
    };
    this.save();
    console.log('♻️  已重置所有状态');
  }
}

/**
 * 单例模式
 */
let instance = null;

function getPersist() {
  if (!instance) {
    instance = new BlockchainPersist();
  }
  return instance;
}

module.exports = {
  getPersist,
  BlockchainPersist
};

// 测试代码
if (require.main === module) {
  const persist = getPersist();
  
  console.log('\n当前状态:');
  console.log(JSON.stringify(persist.getStats(), null, 2));
  
  console.log('\n缓存的fills:');
  const fills = persist.getFills(10);
  console.log(`共 ${persist.state.fills.length} 条，显示最近 ${fills.length} 条`);
  
  fills.forEach((fill, i) => {
    console.log(`${i + 1}. 区块 ${fill.height} - ${fill.ticker || 'N/A'} ${fill.side || ''}`);
  });
}
