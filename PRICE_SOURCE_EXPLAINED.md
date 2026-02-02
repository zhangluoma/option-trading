# 📊 价格来源说明

## 数据流程图

```
                                    Coinbase API
                                         ↓
                    ┌────────────────────┴────────────────────┐
                    ↓                                         ↓
           【开仓时获取价格】                          【UI实时显示价格】
                    ↓                                         ↓
          auto_trader_daemon.js                    trading_ui_server.js
          getCurrentPrice()                        /api/trade-history
                    ↓                                         ↓
          记录到 entryPrice                        调用 get_current_price.js
                    ↓                                         ↓
          active_positions.json                    计算实时盈亏
                    ↓                                         ↓
          【持仓记录】                              【前端UI显示】
```

---

## 1️⃣ 开仓价（Entry Price）

### 来源
**Coinbase Spot API**
```
https://api.coinbase.com/v2/prices/{TICKER}-USD/spot
```

### 获取时机
在**执行交易前**（下单之前）获取当前市场价格

### 代码位置
`auto_trader_daemon.js` → `executeTrade()` 函数：

```javascript
// 1. 获取当前价格
const currentPrice = await getCurrentPrice(ticker);

// 2. 计算仓位大小
const size = positionValue / currentPrice;

// 3. 下单到dYdX
await client.placeOrder(subaccount, market, ...);

// 4. 记录到持仓
activePositions.push({
  ticker,
  entryPrice: currentPrice,  // ← 这里保存开仓价
  size: roundedSize,
  openedAt: new Date(),
  ...
});
```

### 保存位置
`data/active_positions.json`

```json
{
  "ticker": "BTC",
  "side": "LONG",
  "size": 0.001,
  "entryPrice": 76836,  // ← 开仓时记录的价格
  "openedAt": "2026-02-02T09:00:04.809Z"
}
```

---

## 2️⃣ 实时价格（Current Price）

### 来源
**同样是 Coinbase Spot API**（每次UI刷新时重新获取）

```
https://api.coinbase.com/v2/prices/{TICKER}-USD/spot
```

### 获取时机
- **UI刷新时**（每30秒自动刷新）
- **用户手动点击刷新按钮时**

### 代码位置
`trading_ui_server.js` → `/api/trade-history` 端点：

```javascript
// 为每个活跃持仓获取当前价格
for (const pos of activeData) {
  // 调用 get_current_price.js 获取实时价格
  const { stdout } = await execPromise(
    `node get_current_price.js ${pos.ticker}`
  );
  const currentPrice = parseFloat(stdout.trim());
  
  // 计算盈亏
  const pnl = pos.side === 'LONG'
    ? pos.size * (currentPrice - pos.entryPrice)
    : pos.size * (pos.entryPrice - currentPrice);
  
  // 返回给前端
  trades.push({
    ...pos,
    currentPrice,  // ← 实时价格
    pnl,
    pnlPercent: (pnl / (pos.size * pos.entryPrice)) * 100
  });
}
```

### 工具脚本
`get_current_price.js` - 快速价格查询工具：

```javascript
const https = require('https');

function getPrice(ticker) {
  const url = `https://api.coinbase.com/v2/prices/${ticker}-USD/spot`;
  
  https.get(url, (res) => {
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      const json = JSON.parse(data);
      const price = parseFloat(json.data.amount);
      console.log(price);
    });
  });
}
```

### 使用方式
```bash
# 命令行查询
node get_current_price.js BTC
# 输出: 77479.055

node get_current_price.js ETH
# 输出: 2277.295
```

---

## 3️⃣ 为什么用Coinbase API？

### ✅ 优点

1. **无需认证**
   - 公开API，不需要API key
   - 无需账号注册

2. **无地域限制**
   - 不像dYdX Indexer会封禁美国IP
   - 全球可访问

3. **数据准确**
   - Coinbase是主流交易所，价格权威
   - 与dYdX链上oracle价格基本一致

4. **免费无限制**
   - 无速率限制（合理使用范围内）
   - 不收费

5. **稳定可靠**
   - Coinbase基础设施成熟
   - 99.9%可用性

### ❌ 为什么不用dYdX Indexer？

**dYdX Indexer API有严重限制**：

```javascript
// ❌ 被封禁的API
https://indexer.dydx.trade/v4/...

// 问题：
// 1. 美国IP访问会被ban
// 2. 可能导致账户被封
// 3. 需要翻墙才能使用
// 4. 不稳定、不可靠
```

**我们的解决方案**：
- ✅ 只用Validator API下单（必须的，安全的）
- ✅ 用Coinbase API查价格（公开的，无风险）
- ✅ 本地文件跟踪持仓（不依赖Indexer）

---

## 4️⃣ 价格更新频率

| 位置 | 更新频率 | 说明 |
|-----|---------|------|
| **开仓时** | 交易前实时获取 | 确保下单价格准确 |
| **UI显示** | 30秒自动刷新 | 显示实时盈亏 |
| **守护进程检查** | 3分钟 | 检查止损/止盈 |
| **手动刷新** | 点击按钮 | 立即更新 |

---

## 5️⃣ 盈亏计算

### 做多（LONG）
```javascript
PnL = size × (currentPrice - entryPrice)
PnL% = (currentPrice - entryPrice) / entryPrice × 100%

例子：
BTC LONG 0.001 @ $76,836
当前价格: $77,480
PnL = 0.001 × (77,480 - 76,836) = $0.644
PnL% = (77,480 - 76,836) / 76,836 × 100% = 0.84%
```

### 做空（SHORT）
```javascript
PnL = size × (entryPrice - currentPrice)
PnL% = (entryPrice - currentPrice) / entryPrice × 100%

例子：
LINK SHORT 5.103 @ $9.539
当前价格: $9.535
PnL = 5.103 × (9.539 - 9.535) = $0.020
PnL% = (9.539 - 9.535) / 9.539 × 100% = 0.04%
```

---

## 6️⃣ 数据验证

### 测试实时价格
```bash
cd options-sentiment-engine

# 测试BTC价格
node get_current_price.js BTC

# 测试ETH价格
node get_current_price.js ETH

# 测试多个币种
for ticker in BTC ETH SOL DOGE; do
  echo -n "$ticker: $"
  node get_current_price.js $ticker
done
```

### 查看持仓数据
```bash
# 查看原始持仓数据
cat data/active_positions.json

# 查看格式化数据
cat data/active_positions.json | python3 -m json.tool
```

### 测试API端点
```bash
# 测试交易历史API（包含实时价格）
curl http://127.0.0.1:3456/api/trade-history | python3 -m json.tool
```

---

## 7️⃣ 错误处理

### 价格获取失败时
如果Coinbase API不可用：

1. **回退到缓存价格**
   ```javascript
   if (!price || price <= 0) {
     log(`Failed to get price, using last known`, 'WARN');
     return getLastKnownPrice(ticker);
   }
   ```

2. **使用开仓价**（UI端）
   ```javascript
   try {
     currentPrice = await getPrice(ticker);
   } catch (e) {
     currentPrice = pos.entryPrice;  // 回退到开仓价
   }
   ```

3. **记录错误日志**
   ```javascript
   console.error(`Failed to get price for ${ticker}:`, e.message);
   ```

---

## 8️⃣ 总结

| 项目 | 来源 | 更新频率 | 用途 |
|-----|------|---------|------|
| **开仓价** | Coinbase API | 交易时一次 | 记录成本价 |
| **实时价格** | Coinbase API | 30秒/手动 | 计算盈亏 |
| **历史价格** | 本地缓存 | - | 回退方案 |

### 关键特点
- ✅ 完全不依赖dYdX Indexer
- ✅ 无地域限制、无封号风险
- ✅ 实时准确、免费稳定
- ✅ 自动回退、容错处理

---

**更新时间**: 2026-02-02  
**当前状态**: ✅ 正常运行  
**API状态**: ✅ Coinbase API可用
