# 自动交易模块设计

**目标**：基于情绪分析引擎的信号，自动执行交易

## 🎯 交易平台

### 1. dYdX (加密货币)
- **交易类型**：永续合约（Perpetuals）
- **优势**：去中心化、高杠杆、低费用
- **API**：dYdX v4 Python SDK
- **资产**：BTC, ETH, SOL, DOGE, etc.

### 2. Interactive Brokers (期权 + 股票)
- **交易类型**：
  - 股票现货
  - 期权（Calls/Puts）
- **优势**：低佣金、流动性好、专业交易工具
- **API**：ib_insync (IBKR TWS API wrapper)
- **资产**：美股 + 期权

---

## 📁 项目结构

```
options-sentiment-engine/
├── trading/
│   ├── __init__.py
│   ├── base_trader.py          # 交易器基类
│   ├── dydx_trader.py          # dYdX 交易器
│   ├── ibkr_trader.py          # Interactive Brokers 交易器
│   ├── risk_manager.py         # 风险管理
│   ├── position_tracker.py     # 持仓跟踪
│   └── order_executor.py       # 订单执行逻辑
├── config/
│   ├── trading.yaml            # 交易配置
│   └── credentials.yaml        # API 密钥 (GITIGNORE!)
├── database/
│   ├── trades_schema.sql       # 交易记录表
│   └── trades_manager.py       # 交易数据库管理
└── trading_runner.py           # 交易主程序
```

---

## 🔄 交易流程

### 阶段 1：信号生成
```
情绪引擎 (hourly_runner_v2.py)
    ↓
生成情绪快照 (sentiment_snapshots)
    ↓
识别高置信度信号
    ↓
写入 trading_signals 表
```

**信号条件**：
- 情绪 > 0.75 且 mentions > 50 → **BUY 信号**
- 情绪 < 0.25 且 mentions > 50 → **SELL 信号**
- 情绪突变 (24h change > ±0.2) → **趋势反转信号**

### 阶段 2：风险检查
```python
RiskManager.check_trade():
    - 账户余额是否充足？
    - 是否超过最大持仓数？
    - 该资产是否已有持仓？
    - 单笔风险是否 < $500？
    - 总风险是否 < 50% 账户？
```

### 阶段 3：订单执行
```python
if signal == "BUY" and risk_ok:
    # dYdX: Open long position
    # IBKR: Buy calls or stock
    
    OrderExecutor.execute():
        - 计算仓位大小
        - 设置止损/止盈
        - 提交订单
        - 记录到数据库
```

### 阶段 4：持仓管理
```python
PositionTracker.monitor():
    - 实时更新持仓盈亏
    - 检查止损/止盈触发
    - 自动平仓（如果需要）
    - 更新数据库状态
```

---

## 💾 数据库设计

### trading_signals 表
```sql
CREATE TABLE trading_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    asset_type TEXT,  -- 'stock' or 'crypto'
    signal_type TEXT,  -- 'BUY', 'SELL', 'CLOSE'
    confidence REAL,  -- 0-1
    sentiment_score REAL,
    mentions INTEGER,
    reason TEXT,  -- 信号生成原因
    created_at DATETIME,
    executed BOOLEAN DEFAULT 0,
    executed_at DATETIME
);
```

### trades 表
```sql
CREATE TABLE trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exchange TEXT,  -- 'dydx' or 'ibkr'
    ticker TEXT NOT NULL,
    asset_type TEXT,
    trade_type TEXT,  -- 'BUY', 'SELL'
    instrument_type TEXT,  -- 'STOCK', 'CALL', 'PUT', 'PERP'
    quantity REAL,
    entry_price REAL,
    exit_price REAL,
    stop_loss REAL,
    take_profit REAL,
    pnl REAL,
    status TEXT,  -- 'OPEN', 'CLOSED', 'CANCELLED'
    opened_at DATETIME,
    closed_at DATETIME,
    signal_id INTEGER,
    FOREIGN KEY(signal_id) REFERENCES trading_signals(id)
);
```

### positions 表 (实时持仓)
```sql
CREATE TABLE positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exchange TEXT,
    ticker TEXT NOT NULL,
    instrument_type TEXT,
    quantity REAL,
    entry_price REAL,
    current_price REAL,
    unrealized_pnl REAL,
    stop_loss REAL,
    take_profit REAL,
    opened_at DATETIME,
    last_updated DATETIME
);
```

---

## 🛡️ 风险管理规则

### 全局限制
```yaml
max_risk_per_trade: 500  # 单笔最大风险 $500
max_position_pct: 0.15   # 单个持仓 ≤ 15% 账户
max_open_positions: 4    # 最多同时持有 4 个仓位
max_total_exposure: 0.50 # 总敞口 ≤ 50% 账户
min_confidence: 0.75     # 最低信号置信度
```

### 单笔交易规则
```python
- 止损：-10% 或固定金额 ($500)
- 止盈：+30% 或 3:1 盈亏比
- 持仓时间：最长 7 天（自动平仓）
- 加密货币杠杆：2-5x
- 期权：只买入（不卖出裸期权）
```

### dYdX 专用规则
```python
- 最小订单：$50
- 杠杆倍数：2x-5x（根据波动率动态调整）
- 永续合约资金费率监控（避免高费率）
```

### IBKR 专用规则
```python
- 期权：只交易流动性好的合约（OI > 1000）
- 到期日：30-60 天 DTE (days to expiration)
- Delta：0.3-0.5（中等虚值）
- 最大期权溢价：单张 $500
```

---

## 🔑 API 集成

### dYdX v4 SDK
```python
from dydx_v4_client import Client

client = Client(
    network='mainnet',
    private_key=DYDX_PRIVATE_KEY
)

# 下单
client.place_order(
    market='BTC-USD',
    side='BUY',
    type='MARKET',
    size=0.01,  # BTC
    reduce_only=False
)
```

### Interactive Brokers (ib_insync)
```python
from ib_insync import IB, Stock, Option, MarketOrder

ib = IB()
ib.connect('127.0.0.1', 7497, clientId=1)

# 买股票
stock = Stock('AAPL', 'SMART', 'USD')
order = MarketOrder('BUY', 10)
trade = ib.placeOrder(stock, order)

# 买期权
option = Option('AAPL', '20260320', 150, 'C', 'SMART')
ib.qualifyContracts(option)
order = MarketOrder('BUY', 1)
trade = ib.placeOrder(option, order)
```

---

## 🎮 交易模式

### 模式 A：保守模式 (推荐启动)
- 只交易高置信度信号（confidence > 0.8）
- 单笔风险 $300
- 最多 2 个持仓
- 止损 -8%

### 模式 B：激进模式
- 接受中等置信度（confidence > 0.7）
- 单笔风险 $500
- 最多 4 个持仓
- 止损 -12%

### 模式 C：纸上交易（测试模式）
- 所有交易都只记录，不实际执行
- 用于验证策略有效性
- 累积 30 天数据后评估

---

## 📊 监控和通知

### 交易通知（WhatsApp）
```
🚀 新交易开启
━━━━━━━━━━━━━━
📌 AAPL Call $150
💰 买入 2 张
💵 花费: $1,200
🎯 目标: +30%
🛡️ 止损: -10%
📊 信号置信度: 85%

原因: 情绪从 0.45 → 0.82，Reddit mentions +300%
```

### 持仓更新（每日）
```
📊 持仓报告
━━━━━━━━━━━━━━
🟢 BTC-USD LONG +$450 (+15%)
🟡 TSLA Put $220 -$80 (-8%)

💰 总盈亏: +$370
📈 胜率: 66% (4/6)
```

---

## 🧪 测试和回测

### 回测框架
```python
Backtester:
    - 加载历史情绪数据
    - 模拟信号生成
    - 模拟订单执行
    - 计算夏普比率、最大回撤
    - 输出性能报告
```

### 测试步骤
1. **纸上交易 30 天** → 验证信号质量
2. **小额真实交易 7 天** → 测试 API 稳定性
3. **正常交易** → 全面启动

---

## ⚡ 启动流程

### 第一阶段：基础设施（本周）
- [ ] 设置 dYdX 账户 + API
- [ ] 设置 IBKR 账户 + TWS
- [ ] 实现 base_trader.py
- [ ] 实现 risk_manager.py
- [ ] 创建 trades 数据库表

### 第二阶段：交易器（下周）
- [ ] 实现 dydx_trader.py
- [ ] 实现 ibkr_trader.py
- [ ] 信号生成逻辑
- [ ] 纸上交易测试

### 第三阶段：自动化（第三周）
- [ ] 持仓监控和自动止损
- [ ] WhatsApp 通知集成
- [ ] 定时任务（每小时检查信号）
- [ ] 仪表盘（交易历史可视化）

### 第四阶段：优化（持续）
- [ ] 回测历史数据
- [ ] 调整风险参数
- [ ] 机器学习信号优化
- [ ] 多策略组合

---

## 💡 核心优势

1. **情绪驱动** → 比纯技术分析更快捕捉市场情绪
2. **多平台** → 加密货币 + 传统市场双管齐下
3. **风险可控** → 严格的资金管理和止损
4. **全自动化** → 无需盯盘，系统自动执行
5. **透明可审计** → 所有交易记录在数据库

---

## 🚨 风险提示

1. **市场风险**：情绪反转可能很快
2. **API 风险**：交易所宕机、API 限流
3. **滑点风险**：实际成交价可能偏离预期
4. **黑天鹅**：极端行情可能触发连环止损

**建议**：
- 从小额开始（账户总额 $7k → 先用 $2k 测试）
- 纸上交易至少 2 周
- 密切监控前 20 笔交易
- 随时可以手动暂停系统

---

## 📅 时间线

| 日期 | 里程碑 |
|------|--------|
| 2026-02-01 | 完成设计文档 ✅ |
| 2026-02-03 | dYdX API 集成完成 |
| 2026-02-05 | IBKR API 集成完成 |
| 2026-02-07 | 纸上交易启动 |
| 2026-02-14 | 回测分析完成 |
| 2026-02-17 | 小额真实交易 |
| 2026-02-21 | 全面自动化启动 |

---

**当前状态**：✅ 设计完成，等待你的反馈

需要调整哪部分吗？
