#!/usr/bin/env node
const https = require('https');

async function getPrice(ticker) {
  const coinMap = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'SOL': 'solana',
  };
  
  const coinId = coinMap[ticker];
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`;
  
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const price = json[coinId]?.usd;
          console.log(`${ticker}: $${price || 'N/A'}`);
          resolve(price);
        } catch (e) {
          console.error(`Error parsing ${ticker}:`, e.message);
          resolve(null);
        }
      });
    }).on('error', (e) => {
      console.error(`Error fetching ${ticker}:`, e.message);
      resolve(null);
    });
  });
}

(async () => {
  console.log('Testing CoinGecko API...\n');
  await getPrice('BTC');
  await new Promise(r => setTimeout(r, 1000));
  await getPrice('ETH');
  await new Promise(r => setTimeout(r, 1000));
  await getPrice('SOL');
})();
