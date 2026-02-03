#!/usr/bin/env node

/**
 * Net Worth历史记录跟踪器
 * 每小时记录一次账户净值
 */

const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, 'data', 'networth_history.json');

class NetWorthTracker {
  constructor() {
    this.ensureDataFile();
  }

  ensureDataFile() {
    const dir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    if (!fs.existsSync(HISTORY_FILE)) {
      fs.writeFileSync(HISTORY_FILE, JSON.stringify({ records: [] }, null, 2));
    }
  }

  /**
   * 记录Net Worth
   * @param {number} netWorth - 净值
   * @param {number} usedMargin - 已用保证金
   * @param {number} availableMargin - 可用保证金
   * @param {number} usdcBalance - USDC余额
   * @param {number} positionCount - 持仓数量
   */
  record(netWorth, usedMargin, availableMargin, usdcBalance, positionCount) {
    try {
      const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
      
      const record = {
        timestamp: new Date().toISOString(),
        netWorth: parseFloat(netWorth.toFixed(2)),
        usedMargin: parseFloat(usedMargin.toFixed(2)),
        availableMargin: parseFloat(availableMargin.toFixed(2)),
        usdcBalance: parseFloat(usdcBalance.toFixed(2)),
        positionCount: positionCount || 0
      };
      
      data.records.push(record);
      
      // 保留最近7天的数据（24*7=168小时）
      const maxRecords = 168;
      if (data.records.length > maxRecords) {
        data.records = data.records.slice(-maxRecords);
      }
      
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
      
      return record;
    } catch (error) {
      console.error('Failed to record net worth:', error);
      return null;
    }
  }

  /**
   * 获取所有历史记录
   * @param {number} limit - 限制返回条数
   */
  getHistory(limit = null) {
    try {
      const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
      
      if (limit && limit > 0) {
        return data.records.slice(-limit);
      }
      
      return data.records;
    } catch (error) {
      console.error('Failed to read net worth history:', error);
      return [];
    }
  }

  /**
   * 获取最近N小时的记录
   * @param {number} hours - 小时数
   */
  getRecentHours(hours = 24) {
    try {
      const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
      const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
      
      return data.records.filter(r => new Date(r.timestamp) >= cutoffTime);
    } catch (error) {
      console.error('Failed to read recent net worth:', error);
      return [];
    }
  }

  /**
   * 获取最新记录
   */
  getLatest() {
    try {
      const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
      return data.records.length > 0 ? data.records[data.records.length - 1] : null;
    } catch (error) {
      console.error('Failed to read latest net worth:', error);
      return null;
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    try {
      const records = this.getHistory();
      
      if (records.length === 0) {
        return null;
      }
      
      const netWorths = records.map(r => r.netWorth);
      const latest = records[records.length - 1];
      const first = records[0];
      
      const max = Math.max(...netWorths);
      const min = Math.min(...netWorths);
      const change = latest.netWorth - first.netWorth;
      const changePercent = first.netWorth > 0 
        ? ((change / first.netWorth) * 100).toFixed(2)
        : 0;
      
      return {
        latest: latest.netWorth,
        first: first.netWorth,
        max,
        min,
        change,
        changePercent: parseFloat(changePercent),
        recordCount: records.length,
        firstTimestamp: first.timestamp,
        latestTimestamp: latest.timestamp
      };
    } catch (error) {
      console.error('Failed to calculate stats:', error);
      return null;
    }
  }
}

// 导出单例
const tracker = new NetWorthTracker();
module.exports = tracker;

// CLI测试
if (require.main === module) {
  const dydxData = require('./dydx_data');
  
  (async () => {
    console.log('📊 Net Worth Tracker测试\n');
    
    // 获取当前数据
    const status = await dydxData.getFullAccountStatus();
    
    console.log('当前账户状态:');
    console.log(`  Net Worth: $${status.equity.toFixed(2)}`);
    console.log(`  USDC: $${status.usdcBalance.toFixed(2)}`);
    console.log(`  持仓: ${status.positions.length}个\n`);
    
    // 记录
    const record = tracker.record(
      status.equity,
      status.usedMargin,
      status.availableMargin,
      status.usdcBalance,
      status.positions.length
    );
    
    console.log('✅ 已记录:', record);
    
    // 获取历史
    const history = tracker.getHistory();
    console.log(`\n📈 历史记录: ${history.length}条`);
    
    if (history.length > 0) {
      console.log('最新5条:');
      history.slice(-5).forEach(r => {
        const time = new Date(r.timestamp).toLocaleString('zh-CN');
        console.log(`  ${time}: $${r.netWorth} (${r.positionCount}持仓)`);
      });
    }
    
    // 统计
    const stats = tracker.getStats();
    if (stats) {
      console.log('\n📊 统计信息:');
      console.log(`  最新: $${stats.latest}`);
      console.log(`  最高: $${stats.max}`);
      console.log(`  最低: $${stats.min}`);
      console.log(`  变化: ${stats.change >= 0 ? '+' : ''}$${stats.change.toFixed(2)} (${stats.changePercent >= 0 ? '+' : ''}${stats.changePercent}%)`);
      console.log(`  记录数: ${stats.recordCount}`);
    }
  })();
}
