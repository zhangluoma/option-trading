# 🤖 全自动 dYdX 情绪交易系统

基于 sentiment 信号的全自动加密货币永续合约交易机器人。

## ⚡️ 特性

- **持续运行**：守护进程模式，无需 cron job
- **智能信号**：基于 Reddit、Unusual Flow、Google Trends 的情绪分析
- **自动执行**：检测到信号自动下单（Taker Order / 市价单）
- **自动平仓**：持仓 24 小时后自动平仓
- **仓位管理**：维持 50% 最大仓位利用率
- **风险控制**：单币种最大 10% 仓位，最多同时持有 5 个币种

## 📋 系统要求

- Node.js v16+
- Python 3.8+
- dYdX v4 账户（已充值 USDC）
- Sentiment 数据库（sentiment_snapshots 表）

## 🚀 快速开始

### 1. 配置环境

确保 `.env` 文件包含：

```bash
DYDX_MNEMONIC="your 24-word mnemonic here"
```

### 2. 启动守护进程

```bash
# 实盘模式（真实交易）
./trader_control.sh start

# 模拟模式（不下单，仅日志）
./trader_control.sh start-dry-run
```

### 3. 查看状态

```bash
# 查看守护进程状态
./trader_control.sh status

# 实时查看日志
./trader_control.sh logs

# 查看活跃持仓
./trader_control.sh positions
```

### 4. 停止守护进程

```bash
./trader_control.sh stop
```

## 📊 交易逻辑

### 信号检测（每 10 分钟）

1. 扫描所有 dYdX 支持的币种（BTC, ETH, SOL, AVAX, DOGE, etc.）
2. 从 sentiment 数据库获取最新信号
3. 筛选满足条件的信号：
   - **信号强度** ≥ 0.60
   - **信号置信度** ≥ 0.70
   - **信号类型**：BUY 或 SELL（非 NEUTRAL）

### 仓位管理

- **最大仓位利用率**：50%
- **单币种最大仓位**：总资产的 10%
- **最多同时持仓**：5 个币种
- **最小交易金额**：$20

### 订单执行

- **订单类型**：Market Order（Taker，立即成交）
- **方向**：根据信号（BUY = 做多，SELL = 做空）
- **仓位大小**：基础 5% * 信号质量分数

### 平仓策略

- **持仓时间**：24 小时
- **平仓方式**：市价单反向平仓
- **自动检测**：每次循环检查持仓时间

## 🛠️ 配置参数

编辑 `auto_trader_daemon.js` 中的 `CONFIG` 对象：

```javascript
const CONFIG = {
  // 检查间隔（毫秒）
  CHECK_INTERVAL_MS: 10 * 60 * 1000, // 10分钟
  
  // 仓位管理
  MAX_POSITION_RATIO: 0.50, // 最大仓位利用率 50%
  MIN_TRADE_SIZE_USD: 20, // 最小交易金额 $20
  MAX_SINGLE_POSITION_RATIO: 0.10, // 单币种最大 10%
  
  // 持仓管理
  HOLD_DURATION_HOURS: 24, // 持仓24小时
  
  // 信号阈值
  MIN_SIGNAL_STRENGTH: 0.60, // 最小信号强度
  MIN_SIGNAL_CONFIDENCE: 0.70, // 最小信号置信度
  
  // 风险管理
  MAX_POSITIONS: 5, // 最多5个仓位
};
```

## 📁 文件结构

```
options-sentiment-engine/
├── auto_trader_daemon.js      # 主守护进程
├── get_signal.py              # 信号获取脚本
├── trader_control.sh          # 控制脚本
│
├── logs/
│   └── auto_trader.log        # 运行日志
│
├── data/
│   ├── trader.pid             # 进程 PID
│   └── active_positions.json  # 活跃持仓
│
└── .env                       # 环境变量
```

## 📝 日志示例

```
[2026-02-01T20:00:00.000Z] [INFO] 🔍 Checking for trading opportunities...
[2026-02-01T20:00:01.234Z] [INFO] Account: Equity=$162.25, Used=$0.00, Available=$81.12
[2026-02-01T20:00:02.456Z] [INFO] Current positions: 0
[2026-02-01T20:00:05.678Z] [INFO] Found 3 valid signals
[2026-02-01T20:00:06.789Z] [INFO] Executing 3 trades...
[2026-02-01T20:00:07.890Z] [INFO] 
📊 Executing trade for BTC
[2026-02-01T20:00:07.891Z] [INFO]    Signal: BUY, Strength: 0.75, Confidence: 0.80
[2026-02-01T20:00:08.123Z] [INFO]    Current price: $43250.50
[2026-02-01T20:00:08.124Z] [INFO]    Position size: 0.001 BTC (~$43.25)
[2026-02-01T20:00:08.125Z] [INFO]    Side: LONG
[2026-02-01T20:00:09.234Z] [INFO]    ✅ Order submitted: ABC123DEF456...
[2026-02-01T20:00:09.235Z] [INFO]    💾 Position saved to tracking
```

## 🔧 故障排查

### 守护进程无法启动

```bash
# 查看日志
./trader_control.sh logs

# 常见原因：
# 1. .env 文件缺失或助记词错误
# 2. 账户余额不足（< $20）
# 3. Node.js 版本过低
```

### 没有交易信号

```bash
# 检查 sentiment 数据库
python3 get_signal.py BTC

# 可能原因：
# 1. sentiment_snapshots 表为空或过期
# 2. 信号强度/置信度不足
# 3. 数据更新频率过低
```

### 持仓未自动平仓

```bash
# 检查持仓状态
./trader_control.sh positions

# 可能原因：
# 1. 守护进程已停止
# 2. 持仓未满 24 小时
# 3. active_positions.json 文件损坏
```

## ⚠️  风险提示

1. **资金风险**：加密货币价格波动大，可能造成损失
2. **API 风险**：网络问题可能导致订单失败
3. **信号风险**：Sentiment 信号并非 100% 准确
4. **测试建议**：先用 `--dry-run` 模式测试，小额资金开始

## 🔄 升级更新

```bash
# 停止守护进程
./trader_control.sh stop

# 更新代码
git pull

# 重新安装依赖（如有更新）
npm install

# 重启
./trader_control.sh start
```

## 📞 支持

遇到问题？

1. 查看日志：`./trader_control.sh logs`
2. 检查状态：`./trader_control.sh status`
3. 联系开发者

## 📜 许可证

Private - Not for redistribution
