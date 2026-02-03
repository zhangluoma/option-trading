# Indexer工作原理研究

**罗大爷的洞察**: "不然indexer怎么找到这些信息的呢你说是不是" ✅ **完全正确！**

---

## 🎯 Indexer的工作原理

### 核心流程

```
┌──────────────┐
│  dYdX Chain  │
│              │
│ 新区块产生   │
│   ↓          │
│ 包含交易     │
│   ↓          │
│ 发出事件     │
└──────┬───────┘
       │
       ↓ WebSocket订阅/轮询
┌──────────────┐
│   Indexer    │
│              │
│ 1. 监听事件  │
│ 2. 解析交易  │
│ 3. 提取数据  │
│ 4. 存储DB   │
└──────┬───────┘
       │
       ↓ REST API
┌──────────────┐
│    用户      │
│  查询历史    │
└──────────────┘
```

---

## 📊 Indexer捕获的数据

### 1. MsgPlaceOrder交易
```protobuf
message MsgPlaceOrder {
  Order order = 1;
}

message Order {
  OrderId order_id = 1;
  Side side = 2;           // BUY/SELL
  uint64 quantums = 3;      // 数量
  uint64 subticks = 4;      // 价格（编码后）
  // ...
}
```

**Indexer提取**：
- Order ID
- Side (LONG/SHORT)
- Size (数量)
- Price (价格)
- Timestamp (区块时间)
- Account (owner address)

### 2. Fill Events (成交事件)
```
事件类型: order_fill
属性:
  - maker_order_id
  - taker_order_id
  - fill_amount
  - price
  - fee
```

**Indexer存储为**：
```json
{
  "id": "...",
  "market": "BTC-USD",
  "side": "BUY",
  "size": "0.001",
  "price": "78374.71",
  "fee": "0.078",
  "createdAt": "2026-02-02T19:25:00.000Z",
  "type": "MARKET"
}
```

---

## 🔍 我的验证结果

### 链上有什么 ✅
```javascript
// ValidatorClient可以查询:
await client.validatorClient.get.getSubaccount(address, 0)

返回:
{
  perpetualPositions: [
    {
      perpetualId: 2,
      quantums: "...",        // 当前持仓量
      funding_index: "...",   // 资金费率索引
      quote_balance: "0"
    }
  ]
}
```

**注意**: 
- ✅ 有当前positions
- ❌ **没有entry_price**
- ❌ **没有历史fills**

### 链上没有什么 ❌
- 历史开仓价格
- 历史成交记录
- 历史P&L

---

## 💡 Indexer如何获取历史数据

### 方法1: 监听区块链事件流
```javascript
// Indexer运行的伪代码
async function indexerMainLoop() {
  while (true) {
    const newBlock = await subscribeToNewBlocks();
    
    for (const tx of newBlock.transactions) {
      // 解码Protobuf交易
      const decoded = decodeTx(tx);
      
      for (const msg of decoded.messages) {
        if (msg.type === 'MsgPlaceOrder') {
          // 提取订单信息
          const order = {
            market: msg.order.market,
            side: msg.order.side,
            size: decodeQuantums(msg.order.quantums),
            price: decodeSubticks(msg.order.subticks),
            owner: msg.order.orderId.subaccountId.owner,
            timestamp: newBlock.time
          };
          
          // 存储到数据库
          await db.orders.insert(order);
        }
      }
    }
    
    // 处理事件日志（fills）
    for (const event of newBlock.events) {
      if (event.type === 'order_fill') {
        // 提取成交信息
        const fill = extractFillFromEvent(event);
        await db.fills.insert(fill);
      }
    }
  }
}
```

### 方法2: 扫描历史区块
```javascript
// 初始化时，扫描历史
async function backfillHistory(fromHeight, toHeight) {
  for (let height = fromHeight; height <= toHeight; height++) {
    const block = await getBlock(height);
    // 同样的处理逻辑
  }
}
```

---

## 🚀 我可以复制Indexer的逻辑

### 方案A: 实时监听（从现在开始）

```javascript
// real_time_order_monitor.js
const { CompositeClient } = require('@dydxprotocol/v4-client-js');

async function monitorNewOrders() {
  const client = await CompositeClient.connect(Network.mainnet());
  
  let lastHeight = await client.validatorClient.get.latestBlockHeight();
  
  setInterval(async () => {
    const currentHeight = await client.validatorClient.get.latestBlockHeight();
    
    if (currentHeight > lastHeight) {
      // 处理新区块
      for (let h = lastHeight + 1; h <= currentHeight; h++) {
        await processBlock(h);
      }
      lastHeight = currentHeight;
    }
  }, 1000); // 每秒检查
}
```

**优势**：
- ✅ 从现在开始不会丢失数据
- ✅ 实时记录
- ✅ 轻量级

**局限**：
- ❌ 无法获取历史数据

---

### 方案B: 扫描历史区块

```javascript
// scan_historical_orders.js
async function scanHistoricalOrders(address, fromHeight, toHeight) {
  const orders = [];
  
  for (let height = fromHeight; height <= toHeight; height++) {
    const block = await getBlock(height);
    
    // 解析区块中的交易
    for (const txBase64 of block.data.txs) {
      const tx = decodeTxRaw(Buffer.from(txBase64, 'base64'));
      
      for (const msg of tx.body.messages) {
        if (msg.typeUrl === '/dydxprotocol.clob.MsgPlaceOrder') {
          const order = decodeOrder(msg.value);
          
          if (order.owner === address) {
            orders.push({
              height,
              price: decodePrice(order.subticks),
              size: decodeSize(order.quantums),
              side: order.side,
              market: order.market
            });
          }
        }
      }
    }
    
    if (height % 1000 === 0) {
      console.log(`Scanned ${height}/${toHeight}`);
    }
  }
  
  return orders;
}
```

**挑战**：
- 需要Protobuf解码
- 需要找到第一笔交易的区块
- 扫描大量区块耗时

---

## 🎯 当前3个持仓的解决方案

### 实际可行方案

**1. 实现实时监听 + 等待新开仓** ✅
```
今天: 实现real_time_order_monitor.js
明天: 当前持仓平仓
后天: 新开仓会被监听器捕获
```

**2. 扫描最近N个区块**
```
估计这3个持仓是最近几天开的
扫描最近10000个区块 (~2-3天)
找到这个账户的PlaceOrder交易
```

**3. 手动输入（最快）**
```
如果用户知道开仓价格
直接填入position_entries.json
```

**4. VPN + Indexer API（最简单）**
```
一次性获取所有历史fills
解析出entry prices
```

---

## 📝 Indexer的技术栈

### 官方dYdX v4 Indexer
- **语言**: TypeScript/Node.js
- **数据库**: PostgreSQL + TimescaleDB
- **事件订阅**: WebSocket
- **Protobuf解析**: @dydxprotocol/v4-proto

### 开源代码
```
https://github.com/dydxprotocol/v4-chain/tree/main/indexer
```

关键文件：
- `indexer/packages/v4-block-processor/` - 区块处理
- `indexer/packages/postgres/` - 数据库schema
- `indexer/services/roundtable/` - 后台任务

---

## ✅ 结论

**罗大爷完全正确！**

1. ✅ **订单信息确实在链上** (MsgPlaceOrder交易)
2. ✅ **Indexer从链上读取** (监听事件 + 解析交易)
3. ✅ **我们也可以这样做** (复制Indexer逻辑)

**最佳方案组合**：
- **短期**: 手动输入当前3个持仓的entry prices（如果知道）
- **中期**: 实现实时监听，从现在开始自动记录
- **长期**: 可选扫描历史区块获取完整历史

**我现在可以实现实时监听器！** 🚀

---

需要我立即实现吗？
