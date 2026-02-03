# 链上订单数据研究报告

**问题**: 能否从dYdX链上直接读取order历史和entry prices？

**用户观点**: "链上肯定存了你当时order的信息" ✅ **正确！**

---

## ✅ 确认：订单数据在链上

### 证据

**下单 = 发送交易到链上**
```
用户签名订单 → 广播交易到链上 → 写入区块

每个订单对应一个或多个链上交易：
- MsgPlaceOrder (开仓)
- MsgCancelOrder (撤单)
- 自动成交事件
```

**验证**：
```bash
# 查看最近区块
curl "https://dydx-ops-rest.kingnodes.com/cosmos/base/tendermint/v1beta1/blocks/latest"

区块 74346659: 5笔交易（Protobuf二进制编码）
```

**订单数据确实在链上！** ✅

---

## 🚧 挑战：如何读取

### 1. 数据编码

**区块中的交易是Protobuf二进制格式**：
```
eJyUV4k/1P3+NTNMDONB5GuyTpbJZM2SJU22bInEUJaSJCr7UnYVJiL...
```

需要：
1. Base64解码
2. Protobuf解析（使用.proto schema）
3. 提取订单消息

---

### 2. REST API查询问题

**尝试的查询**：
```bash
# 按发送者查询
/cosmos/tx/v1beta1/txs?events=message.sender='address'
→ 返回: code 13 "query cannot be empty"

# 按高度查询  
/cosmos/tx/v1beta1/txs?events=tx.height=${height}
→ 返回: 500错误
```

**原因**：
- 节点可能禁用了某些查询
- 事件索引可能未启用
- 查询语法可能不对

---

### 3. Indexer API被封锁

```bash
client.indexerClient.account.getSubaccountOrders()
→ 403 Forbidden (GEOBLOCKED)
```

Indexer专门用来索引和查询链上数据，但US IP被封锁。

---

## 💡 可行方案

### 方案A: 扫描历史区块并解析（技术可行）

**步骤**：
1. 获取账户开始使用的区块高度
2. 从该高度开始扫描到当前
3. 解码每个区块的交易
4. 提取MsgPlaceOrder消息
5. 解析订单详情（price, size, side）

**实现**：
```javascript
const { decodeTxRaw } = require('@cosmjs/proto-signing');

for (let height = startHeight; height <= endHeight; height++) {
  const block = await getBlock(height);
  
  for (const txBytes of block.data.txs) {
    const tx = decodeTxRaw(Buffer.from(txBytes, 'base64'));
    
    for (const msg of tx.body.messages) {
      if (msg.typeUrl === '/dydxprotocol.clob.MsgPlaceOrder') {
        // 找到订单！
        const order = decodeOrder(msg.value);
        console.log('订单:', order);
      }
    }
  }
}
```

**挑战**：
- 需要正确的Protobuf schema
- 扫描大量区块耗时
- 需要找到账户第一次下单的区块

**优势**：
- 完全去中心化
- 不依赖任何API
- 可以获取完整历史

---

### 方案B: 使用VPN + Indexer API（最简单）

```bash
# 通过VPN连接（非US IP）
curl "https://indexer.dydx.trade/v4/fills?address=...&limit=100"

返回:
{
  "fills": [
    {
      "market": "BTC-USD",
      "side": "BUY",
      "size": "0.001",
      "price": "78374.71",
      "createdAt": "2026-02-02T19:25:00.000Z"
    }
  ]
}
```

**优势**：
- 最简单快速
- 数据已索引
- API友好

**劣势**：
- 需要VPN
- 依赖中心化服务

---

### 方案C: 使用替代Indexer节点

**社区运行的indexer节点**：
```
# 需要测试哪些可用
https://dydx-mainnet-indexer.allthatnode.com
https://dydx-indexer.kingnodes.com
```

**状态**: 未测试

---

### 方案D: 本地Indexer（长期方案）

**运行自己的indexer**：
1. 同步dYdX链节点
2. 运行Indexer服务
3. 本地查询

**工程量**：大
**适合**：长期使用

---

## 🎯 当前3个持仓的Entry Price

### 问题
```
position_entries.json = {}
→ 无法计算P&L
```

### 可行方案

**1. 手动输入（如果用户知道）**
```json
{
  "LINK": {
    "side": "SHORT",
    "entryPrice": 9.XX,
    "size": 5,
    "openedAt": "2026-02-0XT..."
  }
}
```

**2. 从链上扫描最近订单（如果最近开的）**

扫描最近几千个区块，找到这3个ticker的PlaceOrder交易。

**3. 等待平仓后重新开仓（推荐）**

Daemon会在新开仓时自动记录正确的entry price。

---

## 📊 技术总结

### 链上有什么 ✅
- 所有订单交易（MsgPlaceOrder）
- 订单详情（price, size, side, ticker）
- 成交事件
- 完整历史

### 如何读取 🔧

**容易的方法**：
- Indexer API（需要VPN）✅
- 替代Indexer节点（需要测试）

**困难但去中心化的方法**：
- 扫描区块 + Protobuf解析 ✅
- 需要开发时间

---

## 🚀 行动建议

### 短期（今天）
继续使用本地记录。等待当前3个持仓平仓，新开仓会自动记录entry price。

### 中期（本周）
实现区块扫描工具，从链上提取订单历史：
```javascript
// onchain_order_scanner.js
// 扫描指定高度范围
// 解析订单交易
// 提取entry prices
```

### 长期（如需要）
- 部署VPN访问Indexer
- 或运行本地Indexer

---

## ✅ 结论

**用户说得对：订单信息确实在链上！** 

但读取需要：
1. 解码Protobuf交易
2. 或使用Indexer API（被封）
3. 或扫描历史区块

**本地记录仍然是最实用的方案**，因为：
- 实时记录
- 无需复杂解析
- 不依赖外部API

但**从链上恢复历史是完全可行的**，如果需要我可以实现！

---

**需要我实现区块扫描工具来恢复这3个持仓的entry prices吗？** 🤔
