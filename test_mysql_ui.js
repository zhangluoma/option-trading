#!/usr/bin/env node

/**
 * 测试MySQL UI显示 - 插入测试订单
 */

const db = require('./database/db');

async function test() {
  console.log('🧪 测试MySQL UI显示\n');
  
  await db.initDatabase();
  
  // 插入一笔测试订单
  const testFill = {
    height: 74388000,
    time: new Date(),
    ticker: 'BTC',
    market: 'BTC-USD',
    side: 'BUY',
    quantums: '100000',
    subticks: '77000000000',
    size: 0.001,
    price: 77000,
    clientId: 12345678,
    clobPairId: 0,
    source: 'REALTIME'
  };
  
  console.log('📝 插入测试订单...');
  await db.saveFill(testFill);
  console.log('✅ 已插入: BTC BUY 0.001 @ $77000');
  
  // 查询验证
  console.log('\n📊 从数据库读取...');
  const fills = await db.getRecentFills(10);
  console.log(`找到 ${fills.length} 条记录\n`);
  
  if (fills.length > 0) {
    console.log('记录详情:');
    fills.forEach((f, i) => {
      console.log(`${i + 1}. ${f.ticker} ${f.side} - Size: ${f.size}, Price: ${f.price}`);
      console.log(`   时间: ${new Date(f.createdAt).toLocaleString('zh-CN')}`);
      console.log(`   区块: ${f.height}`);
    });
  }
  
  console.log('\n✅ 测试完成！');
  console.log('💡 现在访问 http://localhost:3456 应该能看到这笔订单');
  console.log('💡 如果要删除测试数据: mysql -u root dydx_trading -e "DELETE FROM fills WHERE ticker = \'BTC\';"');
  
  await db.closeDatabase();
}

test().catch(console.error);
