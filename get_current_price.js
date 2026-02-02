#!/usr/bin/env node
/**
 * 快速获取当前价格（Coinbase API）
 * Usage: node get_current_price.js BTC
 */

const https = require('https');

const ticker = process.argv[2] || 'BTC';

function getPrice(ticker) {
  return new Promise((resolve, reject) => {
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
          resolve(price);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', (e) => {
      reject(e);
    });
  });
}

// 直接运行
if (require.main === module) {
  getPrice(ticker)
    .then(price => {
      console.log(price);
      process.exit(0);
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}

module.exports = getPrice;
