# Interactive Brokers 设置指南

## 📋 前置条件

### 1. IBKR 账户
- 注册：https://www.interactivebrokers.com
- 需要：身份验证、银行账户
- 审批时间：1-3天

### 2. 下载 TWS 或 IB Gateway

#### 选项 A：TWS (Trader Workstation) - 推荐新手
- 完整的交易界面
- 图表和分析工具
- 下载：https://www.interactivebrokers.com/en/trading/tws.php

#### 选项 B：IB Gateway - 推荐自动化
- 轻量级，只有 API
- 无图形界面
- 更稳定，适合长期运行
- 下载：https://www.interactivebrokers.com/en/trading/ibgateway-stable.php

### 3. Python 包
```bash
pip install ib_insync
```

---

## 🧪 纸上交易设置（推荐先做）

### 1. 启动 TWS/Gateway（纸上交易模式）

**TWS:**
1. 打开 TWS
2. 登录界面选择 "Paper Trading"
3. 用户名：你的账号 + "paper"（例如：user123paper）
4. 密码：和真实账户相同

**IB Gateway:**
1. 打开 IB Gateway
2. 选择 "IB API"
3. 勾选 "Use Paper Trading Account"
4. 登录

### 2. 启用 API 连接

**重要！必须完成这一步**

1. 菜单：`File` → `Global Configuration` → `API` → `Settings`
2. 勾选：
   - ✅ Enable ActiveX and Socket Clients
   - ✅ Allow connections from localhost only（安全）
   - ✅ Read-Only API（如果只想测试查询）
3. 端口设置：
   - Paper Trading: `7497`
   - Live Trading: `7496`
4. 点击 `OK` 并重启 TWS/Gateway

### 3. 测试连接
```bash
cd options-sentiment-engine
python3 trading/ibkr_trader.py
```

**预期输出：**
```
Connecting to IBKR...
✅ Connected to IBKR (Paper Trading)
Total Equity: $1,000,000.00
Available Cash: $1,000,000.00
AAPL: $175.23
✅ Test completed
```

---

## 🎯 纸上交易测试流程

### 测试 1：查询账户
```python
from trading.ibkr_trader import IBKRTrader

config = {
    'host': '127.0.0.1',
    'port': 7497,  # Paper
    'client_id': 1,
    'paper_mode': True
}

trader = IBKRTrader(config)
await trader.connect()

# 查询账户
account = await trader.get_account_info()
print(f"Cash: ${account.available_cash:,.2f}")

# 查询价格
price = await trader.get_current_price('AAPL')
print(f"AAPL: ${price:.2f}")
```

### 测试 2：下单买股票
```python
from trading.base_trader import Order, OrderSide, OrderType

# 买 10 股 AAPL
order = Order(
    ticker='AAPL',
    side=OrderSide.BUY,
    size=10,
    order_type=OrderType.MARKET
)

result = await trader.place_order(order)
print(f"Order: {result.message}")
```

### 测试 3：期权交易
```python
# 期权格式：TICKER_YYYYMMDD_C/P_STRIKE
# 例如：AAPL 2026年3月20日 到期，行权价 150 的 Call

order = Order(
    ticker='AAPL_20260320_C_150',
    side=OrderSide.BUY,
    size=1,  # 1 张合约 = 100 股
    order_type=OrderType.MARKET
)

result = await trader.place_order(order)
```

### 测试 4：查询持仓
```python
positions = await trader.get_all_positions()
for pos in positions:
    print(f"{pos.ticker}: {pos.size} @ ${pos.entry_price:.2f}")
```

### 测试 5：平仓
```python
result = await trader.close_position('AAPL')
print(f"Closed: {result.message}")
```

---

## 💰 真实交易（Live Trading）

### ⚠️ 警告
- 先在纸上交易测试至少 1 周
- 确认所有功能正常
- 从小额开始（$1000-2000）
- 理解所有风险

### 1. 启动 TWS/Gateway（真实模式）

**不要勾选 Paper Trading！**

登录后会连接到你的真实账户。

### 2. 修改配置
```yaml
ibkr:
  mode: live  # ⚠️ 真实交易
  host: "127.0.0.1"
  port: 7496  # Live port
  client_id: 1
```

### 3. 风险控制
```yaml
risk:
  # 更保守的限制
  max_risk_per_trade: 300
  max_open_positions: 3
  max_total_exposure: 0.30  # 只用 30%
```

### 4. 启动系统
```bash
python3 main_trading_live.py
```

---

## 🔧 故障排查

### 问题 1：无法连接
```
Error: Not connected to IBKR
```

**解决：**
1. 确认 TWS/Gateway 正在运行
2. 检查 API 设置是否启用
3. 确认端口号正确（Paper: 7497, Live: 7496）
4. 防火墙是否阻止连接
5. 重启 TWS/Gateway

### 问题 2：API 未启用
```
Error: Socket connection refused
```

**解决：**
1. TWS: File → Global Configuration → API → Settings
2. 勾选 "Enable ActiveX and Socket Clients"
3. 重启 TWS

### 问题 3：订单被拒绝
```
Error: Order rejected
```

**解决：**
- 检查市场是否开放（美股：9:30-16:00 ET）
- 确认余额充足
- 检查股票代码是否正确
- 查看 TWS 的订单日志

### 问题 4：价格数据延迟
```
No price data for AAPL
```

**解决：**
- 订阅市场数据（可能需要额外费用）
- 或使用延迟数据（免费，延迟 15 分钟）

---

## 📊 支持的交易类型

### ✅ 已支持
- 股票市价单
- 股票限价单
- 期权市价单
- 持仓查询
- 账户查询
- 实时价格

### 🚧 计划支持
- 止损单
- 条件单
- 期权策略（spread, straddle）
- 期货

---

## 💡 最佳实践

### 1. 市场时间
```python
# 只在开盘时间交易
# 美股：9:30 AM - 4:00 PM ET（美东时间）
# 盘前：4:00 AM - 9:30 AM ET
# 盘后：4:00 PM - 8:00 PM ET
```

### 2. 流动性
```python
# 选择流动性好的股票
# - 日成交量 > 100万股
# - Spread < 0.1%
```

### 3. 期权选择
```python
# 选择流动期权合约
# - Open Interest > 1000
# - Bid-Ask Spread < 10%
# - 到期日：30-60 天（最佳流动性）
# - Delta：0.3-0.5（中等虚值）
```

### 4. 订单类型
```python
# 市价单：快速成交，但可能滑点
# 限价单：控制价格，但可能不成交

# 推荐：
# - 流动性好的股票 → 市价单
# - 流动性差的期权 → 限价单
```

---

## 🔐 安全提示

1. **不要在生产环境运行未经测试的代码**
2. **始终使用止损**
3. **限制单笔交易风险**
4. **定期检查持仓**
5. **保持 TWS/Gateway 更新**

---

## 📞 IBKR 支持

- 客服：https://www.interactivebrokers.com/en/support.php
- API 文档：https://interactivebrokers.github.io/tws-api/
- ib_insync 文档：https://ib-insync.readthedocs.io/

---

## ✅ 检查清单

开始前确认：

- [ ] IBKR 账户已开通
- [ ] TWS/Gateway 已安装
- [ ] API 连接已启用
- [ ] 端口配置正确
- [ ] 已在纸上交易测试
- [ ] 理解订单类型
- [ ] 设置了风险限制
- [ ] 知道如何紧急平仓

**准备好了？开始交易！** 🚀
