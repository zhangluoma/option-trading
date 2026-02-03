# dYdX Indexer源码研究报告

**研究时间**: 2026-02-02 19:15 PST  
**源码**: https://github.com/dydxprotocol/v4-chain/tree/main/indexer  
**目标**: 学习官方Indexer如何从链上提取fills

---

## 🎯 核心发现

### 1. **Indexer架构** ✅

```
dYdX Chain → Tendermint Events → Indexer → PostgreSQL
```

**关键组件**:
- `ender` service: 处理区块事件
- `v4-proto-parser`: Protobuf解析工具
- `postgres`: 数据存储
- `kafka`: 事件流

---

## 📊 事件处理流程

### A. 区块处理器 (`block-processor.ts`)

```typescript
class BlockProcessor {
  // 1. 接收区块
  block: IndexerTendermintBlock;
  
  // 2. 分组事件
  groupEvents(): GroupedEvents {
    transactionEvents: [],  // 交易事件
    blockEvents: []         // 区块事件
  }
  
  // 3. 验证和组织
  validateAndOrganizeEvents()
  
  // 4. 处理事件
  processEvents(): KafkaPublisher
}
```

**关键**: 他们从`IndexerTendermintBlock`中提取`IndexerTendermintEvent`

---

### B. 事件类型 (`DydxIndexerSubtypes`)

```typescript
{
  ORDER_FILL: 订单成交
  SUBACCOUNT_UPDATE: 账户更新
  TRANSFER: 转账
  STATEFUL_ORDER: 长期订单
  DELEVERAGING: 去杠杆
  FUNDING: 资金费
  ...
}
```

**我们需要的**: `ORDER_FILL` 事件

---

### C. Order Fill处理器 (`order-handler.ts`)

```typescript
export class OrderHandler {
  eventType: string = 'OrderFillEvent';
  
  // 提取的数据
  interface OrderFillWithLiquidity {
    makerOrder?: IndexerOrder,
    order?: IndexerOrder,
    fillAmount: Long,          // 成交数量
    makerFee: Long,           // Maker手续费
    takerFee: Long,           // Taker手续费
    totalFilledMaker: Long,   // Maker总成交
    totalFilledTaker: Long,   // Taker总成交
    liquidity: Liquidity,     // MAKER或TAKER
  }
}
```

**关键字段**:
- `makerOrder` / `order`: 订单信息
- `fillAmount`: 实际成交数量
- `totalFilledMaker/Taker`: 累计成交

---

## 🔑 关键数据结构

### 1. IndexerOrder

```typescript
interface IndexerOrder {
  orderId: IndexerOrderId;
  side: Side;              // BUY/SELL
  quantums: Long;          // 数量（原始单位）
  subticks: Long;          // 价格（原始单位）
  goodTilBlock?: Long;
  goodTilBlockTime?: Long;
  timeInForce: TimeInForce;
  reduceOnly: boolean;
  clientMetadata: number;
  orderFlags: number;
}
```

### 2. IndexerOrderId

```typescript
interface IndexerOrderId {
  subaccountId: IndexerSubaccountId;
  clientId: number;
  orderFlags: number;
  clobPairId: number;  // 市场ID
}
```

### 3. IndexerSubaccountId

```typescript
interface IndexerSubaccountId {
  owner: string;         // dydx1...地址
  number: number;        // 子账户编号（通常是0）
}
```

---

## 🛠️ 我们如何应用

### 方案1: 使用Protobuf解析（复杂但完整）

```javascript
// 从区块events中提取
const { IndexerTendermintBlock } = require('@dydxprotocol/v4-protos');

// 解析区块
const block = IndexerTendermintBlock.decode(blockBytes);

// 遍历事件
for (const event of block.events) {
  if (event.subtype === 'order_fill') {
    // 解析OrderFillEvent
    const fillEvent = OrderFillEvent.decode(event.dataBytes);
    
    // 提取信息
    const fill = {
      ticker: getTicker(fillEvent.order.orderId.clobPairId),
      side: fillEvent.order.side === 1 ? 'BUY' : 'SELL',
      size: convertQuantums(fillEvent.fillAmount),
      price: convertSubticks(fillEvent.order.subticks),
      owner: fillEvent.order.orderId.subaccountId.owner
    };
  }
}
```

---

### 方案2: 读取事件属性（简单但可能不完整）

```javascript
// 从block_results读取事件
const blockResults = await getBlockResults(height);

// 查找order_fill事件
for (const event of blockResults.txs_results[i].events) {
  if (event.type === 'order_fill') {
    // 事件属性已经是key-value格式
    const attrs = parseAttributes(event.attributes);
    
    const fill = {
      ticker: attrs.market,
      side: attrs.side,
      size: attrs.size,
      price: attrs.price,
      owner: attrs.owner
    };
  }
}
```

**问题**: 事件属性的格式可能与Protobuf不同

---

## 📋 Indexer的Persist Layer

### PostgreSQL Schema

```sql
-- fills表
CREATE TABLE fills (
  id UUID PRIMARY KEY,
  subaccount_id UUID,
  order_id UUID,
  market VARCHAR,
  side VARCHAR,
  size DECIMAL,
  price DECIMAL,
  fee DECIMAL,
  liquidity VARCHAR,  -- MAKER/TAKER
  created_at TIMESTAMP,
  event_id bytea,
  transaction_hash VARCHAR,
  ...
);

-- 索引
CREATE INDEX fills_subaccount_idx ON fills(subaccount_id);
CREATE INDEX fills_created_at_idx ON fills(created_at DESC);
```

**我们的简化版**:
```json
{
  "lastProcessedHeight": 74351954,
  "fills": [
    {
      "height": 74351954,
      "ticker": "DOGE",
      "side": "SELL",
      "size": 100,
      "price": 0.107,
      "owner": "dydx1...",
      "createdAt": "2026-02-02T18:43:00Z"
    }
  ]
}
```

---

## 🚀 实施建议

### Phase 1: 事件日志方法（快速）✅

```javascript
// 当前进行中
1. 读取block_results
2. 查找order_fill事件
3. 解析attributes
4. 保存到blockchain_persist
```

**优势**: 
- 不需要Protobuf解析
- 快速实现
- 事件已解码

**劣势**:
- 可能不完整
- 依赖事件格式

---

### Phase 2: Protobuf方法（完整）⏳

```javascript
// 导入官方proto定义
const { 
  IndexerTendermintBlock,
  OrderFillEventV1
} = require('@dydxprotocol/v4-protos');

// 完整解析
1. 从Tendermint读取区块
2. 使用Protobuf解码
3. 提取OrderFillEvent
4. 获取完整订单信息
```

**优势**:
- 完整的数据
- 与官方Indexer一致
- 可靠性高

**劣势**:
- 需要处理TypeScript编译
- 实现复杂

---

## 💾 Persist Layer设计

### 罗大爷的建议
> "应该要有个persist layer去cache已经process过的block"

**✅ 完全正确！**

### 实现要点

```javascript
class BlockchainPersist {
  state: {
    lastProcessedHeight: number,  // 最后处理的区块
    processedBlocks: [],          // 最近1000个区块
    fills: [],                    // 缓存的fills
    stats: {}                     // 统计信息
  }
  
  // 检查区块是否已处理
  isBlockProcessed(height)
  
  // 标记区块已处理
  markBlockProcessed(height, fillsCount)
  
  // 添加fills到缓存
  addFills(fills)
  
  // 断点续传
  getScanRange(latestHeight, maxBlocks)
}
```

**优势**:
1. ✅ 避免重复扫描
2. ✅ 支持断点续传
3. ✅ 快速查询历史fills
4. ✅ 进度可见

---

## 📊 数据转换公式

### Quantums → Size

```javascript
// 不同市场有不同的量化单位
const QUANTUM_CONVERSION = {
  'BTC-USD': 0.00001,    // 1 quantum = 0.00001 BTC
  'ETH-USD': 0.0001,     // 1 quantum = 0.0001 ETH
  'DOGE-USD': 1,         // 1 quantum = 1 DOGE
  ...
};

function convertQuantums(quantums, market) {
  const conversion = QUANTUM_CONVERSION[market];
  return quantums * conversion;
}
```

### Subticks → Price

```javascript
// subticks需要根据市场的价格精度转换
const SUBTICKS_PER_TICK = {
  'BTC-USD': 100,
  'ETH-USD': 100,
  'DOGE-USD': 10000,
  ...
};

function convertSubticks(subticks, market) {
  const tickSize = SUBTICKS_PER_TICK[market];
  return subticks / tickSize;
}
```

---

## 🎯 下一步行动

### 1. 完成当前扫描 ✅
- scan_block_events.js正在运行
- 测试事件日志方法是否可行

### 2. 集成Persist Layer ✅
- blockchain_persist.js已创建
- 添加到扫描器中
- 实现断点续传

### 3. 优化性能
```javascript
// 批量处理
- 一次获取多个区块
- 并行解析
- 批量写入persist

// Rate limit处理
- 智能延迟
- 多节点轮换
- 失败重试
```

### 4. 如果事件方法不行
```javascript
// 实现Protobuf方法
1. 编译@dydxprotocol/v4-proto
2. 或使用v4-client-js的内部工具
3. 完整解析OrderFillEvent
```

---

## 📝 总结

### 学到的关键点

1. **Indexer使用Protobuf解析** ✅
   - `IndexerTendermintBlock`
   - `OrderFillEventV1`
   - 完整的订单信息

2. **需要Persist Layer** ✅
   - 避免重复处理
   - 支持断点续传
   - 已实现blockchain_persist.js

3. **两种方法可选** ✅
   - 事件日志: 快速但可能不完整
   - Protobuf: 完整但实现复杂

4. **数据转换很重要** ✅
   - quantums → size
   - subticks → price
   - 每个市场不同

---

**状态**: 研究完成，继续实施！ 💪

**下一步**: 等待扫描结果，然后集成persist layer
