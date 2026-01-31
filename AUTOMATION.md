# 自动化配置指南

## 方案选择

你有两个选择来实现每天自动运行：

### 方案 A：系统 Cron（推荐，真正自动化）
使用 macOS 的 crontab 或 launchd，完全自动执行。

### 方案 B：OpenClaw Cron（已配置，需要手动触发）
使用 OpenClaw 内置 cron，每天提醒你执行。

---

## 方案 A：系统 Cron（推荐）

### 1. 设置执行权限
```bash
chmod +x /Users/luomazhang/.openclaw/workspace/options-sentiment-engine/auto_research.sh
```

### 2. 创建日志目录
```bash
mkdir -p /Users/luomazhang/.openclaw/workspace/options-sentiment-engine/logs
```

### 3. 编辑 crontab
```bash
crontab -e
```

### 4. 添加以下两行
```cron
# 每天早上 3:00 AM PT 运行 research
0 3 * * 1-5 /Users/luomazhang/.openclaw/workspace/options-sentiment-engine/auto_research.sh

# 每天早上 6:00 AM PT 你需要登录 OpenClaw 查看结果
# （WhatsApp 发送需要 OpenClaw message 工具，暂时手动）
```

**注意**：crontab 使用系统时区，确保你的 Mac 设置为 Pacific Time。

---

## 方案 B：OpenClaw Cron（已配置）

我已经创建了两个 OpenClaw cron jobs：

### Job 1: `options_research_3am`
- **时间**：每天早上 3:00 AM PT（工作日）
- **作用**：提醒你运行 research
- **下次运行**：自动计算

### Job 2: `options_notify_6am`
- **时间**：每天早上 6:00 AM PT（工作日）
- **作用**：提醒你查看并发送结果
- **下次运行**：自动计算

### 查看 cron 状态
在 OpenClaw 里说：
```
查看 cron 任务
```

### 如何使用
每天早上 3:00 和 6:00，OpenClaw 会给你发提醒消息。

**3:00 AM 提醒时**，你回复：
```
运行 research
```

**6:00 AM 提醒时**，我会自动读取结果并发给你。

---

## 完全自动化（高级）

如果你想完全无需干预，需要：

### 1. 使用系统 cron（方案 A）
```bash
# 3am 运行 research
0 3 * * 1-5 cd /Users/luomazhang/.openclaw/workspace/options-sentiment-engine && python3 scheduler/run_at_3am.py

# 6am 发送结果（需要配置 OpenClaw message 工具访问）
0 6 * * 1-5 cd /Users/luomazhang/.openclaw/workspace/options-sentiment-engine && python3 scheduler/notify_at_6am.py
```

### 2. 配置 WhatsApp 自动发送
修改 `scheduler/notify_at_6am.py` 中的 `send_whatsapp_message` 函数，使其真正调用 OpenClaw API。

---

## 监控和日志

### 查看最近运行
```bash
cat /Users/luomazhang/.openclaw/workspace/options-sentiment-engine/results_latest.json
```

### 查看运行日志
```bash
tail -50 /Users/luomazhang/.openclaw/workspace/options-sentiment-engine/logs/research.log
```

---

## 故障排查

### Cron 没有运行？
- 检查系统时间和时区
- 确认 crontab 权限
- 查看系统日志：`grep CRON /var/log/system.log`

### 结果文件为空？
- 可能不是交易日（周末/节假日会跳过）
- 查看 `results_latest.json` 里的 `is_trading_day`

---

## 当前状态

✅ **OpenClaw Cron 已配置**
- 每天 3:00 AM 和 6:00 AM 会收到提醒
- 需要手动回复执行

❌ **系统 Cron 未配置**  
- 需要你手动设置 crontab
- 配置后完全自动化

---

## 推荐配置

对于你的需求（每天 3am 跑，6am 告诉你结果），我建议：

1. **3am**：使用系统 cron 自动运行 research
2. **6am**：使用 OpenClaw cron 提醒，我读取结果并发 WhatsApp

这样结合最可靠。
