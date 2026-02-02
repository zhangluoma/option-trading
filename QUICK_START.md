# 🚀 快速启动指南 - 自动交易系统

## 1️⃣ 前置检查

```bash
# 1. 确认 .env 配置
cat .env | grep DYDX_MNEMONIC

# 2. 测试系统组件
node test_auto_trader.js
```

## 2️⃣ 首次启动（模拟模式）

```bash
# 启动模拟模式（不真实下单）
./trader_control.sh start-dry-run

# 查看日志
./trader_control.sh logs
```

按 `Ctrl+C` 停止查看日志（守护进程继续运行）

## 3️⃣ 监控运行

```bash
# 查看守护进程状态
./trader_control.sh status

# 查看活跃持仓
./trader_control.sh positions

# 实时日志
./trader_control.sh logs
```

## 4️⃣ 启动实盘模式

**⚠️  确认已测试并理解系统行为后再启动实盘！**

```bash
# 停止模拟模式
./trader_control.sh stop

# 启动实盘模式
./trader_control.sh start

# 确认运行
./trader_control.sh status
```

## 5️⃣ 日常操作

```bash
# 停止交易
./trader_control.sh stop

# 重启
./trader_control.sh restart

# 查看最近日志
tail -100 logs/auto_trader.log
```

## 📊 预期行为

### 正常运行时

- 每 **10 分钟**检查一次信号
- 日志中显示：
  ```
  💓 Heartbeat
  🔍 Checking for trading opportunities...
  Account: Equity=$XXX, Available=$XXX
  Found X valid signals
  ```

### 检测到信号时

- 日志显示交易详情：
  ```
  📊 Executing trade for BTC
     Signal: BUY, Strength: 0.75, Confidence: 0.80
     Current price: $43250.50
     Position size: 0.001 BTC (~$43.25)
     ✅ Order submitted: ABC123...
  ```

### 持仓到期时

- 自动平仓：
  ```
  ⏰ BTC reached hold duration, closing...
  📊 Closing position: BTC
     PnL: 🟢 $5.23 (12.10%)
     ✅ Position closed: DEF456...
  ```

## ⚠️  常见问题

### 没有信号？

- 检查 sentiment 数据库是否有数据
- 降低信号阈值（编辑 `CONFIG` 中的 `MIN_SIGNAL_STRENGTH`）

### Geoblocking 错误？

- 正常现象（US IP）
- 系统会使用本地跟踪继续运行
- 订单提交不受影响

### 守护进程停止？

```bash
# 查看最后的日志
tail -50 logs/auto_trader.log

# 重启
./trader_control.sh start
```

## 📞 需要帮助？

详细文档：`AUTO_TRADER_README.md`
