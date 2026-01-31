# 使用说明

## 快速开始

### 1. 手动测试
```bash
cd /Users/luomazhang/.openclaw/workspace/options-sentiment-engine
python3 test_run.py
```

这会：
- 抓取 Reddit (r/wallstreetbets, r/options)
- 分析情绪
- 获取真实期权数据
- 计算仓位
- 显示 WhatsApp 格式输出

---

## 自动运行（每天 3am + 6am）

### 配置 OpenClaw Cron Jobs

需要创建两个定时任务：

#### Job 1: 每天早上 3:00 AM PT 运行 research
```bash
# 在 OpenClaw 中配置 cron job
Schedule: 每天 3:00 AM Pacific
Command: cd /Users/luomazhang/.openclaw/workspace/options-sentiment-engine && python3 scheduler/run_at_3am.py
```

#### Job 2: 每天早上 6:00 AM PT 发送 WhatsApp
```bash
# 在 OpenClaw 中配置 cron job  
Schedule: 每天 6:00 AM Pacific
Command: cd /Users/luomazhang/.openclaw/workspace/options-sentiment-engine && python3 scheduler/notify_at_6am.py
```

**注意**：6am 的通知脚本需要访问 OpenClaw 的 `message` 工具才能真正发送 WhatsApp。

---

## 调整配置

### 改变激进程度
编辑 `config/account.yaml`:
```yaml
max_risk_per_trade: 500  # 增大=更激进
max_open_trades: 4       # 同时持仓数量
max_position_pct: 0.15   # 单笔最大占比
```

### 调整情绪权重
编辑 `config/sentiment.yaml`:
```yaml
sources:
  reddit:
    weight: 0.40  # Reddit 权重
  unusual_options:
    weight: 0.35  # 期权流权重
```

---

## 查看结果

每次运行后，结果保存在：
```
results_latest.json
```

包含：
- 时间戳
- 是否交易日
- 推荐列表
- 或错误信息

---

## 故障排查

### 没有推荐？
- 检查 `results_latest.json`
- 可能是：情绪不明确、风险过高、没有合适的期权

### Reddit 抓取失败？
- 检查网络连接
- old.reddit.com 可能临时限流（等1分钟重试）

### 期权数据错误？
- yfinance 有时会返回 NaN
- 代码已处理，会跳过无效数据

---

## 当前状态

- ✅ Reddit 网页抓取（无需 API key）
- ✅ Ticker 验证（过滤假股票）
- ✅ 真实期权数据（yfinance）
- ✅ 风控 + 仓位计算
- ✅ WhatsApp 格式化
- ⏰ Cron 需要手动配置

---

## 代码位置

```
/Users/luomazhang/.openclaw/workspace/options-sentiment-engine/
```

随时可以：
- 查看代码
- 修改配置
- git commit 你的改动
