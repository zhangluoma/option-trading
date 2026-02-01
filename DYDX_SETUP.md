# dYdX 真实交易设置指南

## 📋 前置条件

### 1. 安装依赖
```bash
pip install dydx-v4-client
pip install eth-account
pip install python-dotenv  # 可选：用于环境变量
```

### 2. 获取以太坊私钥

#### 选项 A：使用现有 MetaMask 钱包
1. 打开 MetaMask
2. 点击右上角三个点 → Settings
3. Security & Privacy → Show Private Key
4. 输入密码，复制私钥（0x开头）

#### 选项 B：创建新钱包（推荐用于交易）
```python
from eth_account import Account

# 创建新账户
account = Account.create()

print(f"地址: {account.address}")
print(f"私钥: {account.key.hex()}")

# ⚠️ 保存好私钥！丢失无法找回！
```

---

## 🧪 测试网测试（推荐先做）

### 1. 配置测试网
```bash
cd options-sentiment-engine
cp config/credentials.yaml.template config/credentials.yaml
```

编辑 `config/credentials.yaml`：
```yaml
dydx:
  mode: live  # 使用真实API，但连接测试网
  network: testnet
  private_key: "0x你的私钥"
```

### 2. 领取测试币
1. 访问：https://v4.testnet.dydx.exchange
2. 连接钱包（用上面的地址）
3. 点击 "Faucet" 领取测试 USDC
4. 等待几分钟到账

### 3. 测试交易
```bash
python3 test_dydx_real.py
```

如果成功：
- 能查询余额
- 能下单（小额测试）
- 能查看持仓
- 能平仓

---

## 💰 真实交易（Mainnet）

### ⚠️ 警告
- 从小额开始（$100-500）
- 先纸上交易1周
- 确认策略有效
- 理解所有风险

### 1. 准备资金

#### 购买 USDC
- 在 Coinbase/Binance 购买 USDC
- dYdX v4 只支持 USDC

#### 转账到 dYdX
1. 访问：https://trade.dydx.exchange
2. 连接钱包（用你的私钥对应的地址）
3. Deposit → 从交易所转 USDC
4. 等待确认（通常几分钟）

### 2. 配置主网
```yaml
dydx:
  mode: live
  network: mainnet  # ⚠️ 真实交易！
  private_key: "0x你的私钥"
  
  trading:
    default_leverage: 2.0  # 保守起见
    max_leverage: 3.0      # 限制最大杠杆
```

### 3. 启动交易系统
```bash
# 先测试连接
python3 scripts/test_dydx_connection.py

# 启动主程序
python3 main_trading_live.py
```

---

## 🔐 安全最佳实践

### 1. 私钥管理
```bash
# 方法 A：环境变量（推荐）
export DYDX_PRIVATE_KEY="0x你的私钥"

# 方法 B：加密文件
# 用 GPG 加密 credentials.yaml
gpg -c config/credentials.yaml
# 运行时解密
gpg -d config/credentials.yaml.gpg > config/credentials.yaml
```

### 2. 访问控制
```bash
# 限制文件权限
chmod 600 config/credentials.yaml

# 只有你能读
ls -la config/credentials.yaml
# 应该显示: -rw-------
```

### 3. 多签钱包（高级）
- 用 Gnosis Safe 管理资金
- 需要多个签名才能交易
- 更安全但更复杂

---

## 📊 监控和告警

### 1. 实时监控
```bash
# 查看持仓
python3 scripts/monitor_positions.py

# 查看账户
python3 scripts/check_account.py
```

### 2. WhatsApp 通知
已自动集成，交易时会发通知：
- 开仓/平仓
- 止损触发
- 账户告警

### 3. 日志
```bash
# 查看交易日志
tail -f logs/trading.log

# 搜索错误
grep ERROR logs/trading.log
```

---

## 🚨 风险管理

### 账户级限制
```yaml
risk:
  max_risk_per_trade: 500      # 单笔最大 $500
  max_open_positions: 4        # 最多 4 个持仓
  max_total_exposure: 0.50     # 总敞口 ≤ 50%
  daily_loss_limit: 1000       # 单日最大亏损 $1000
  
  # 紧急停止
  emergency_stop:
    enabled: true
    drawdown_threshold: 0.20   # 回撤 20% 自动停止
```

### 手动干预
```python
# 如果需要紧急平仓所有持仓
python3 scripts/emergency_close_all.py
```

---

## 🔧 故障排查

### 问题 1：连接失败
```
Error: Failed to connect to dYdX
```

**解决：**
- 检查网络连接
- 确认 private_key 格式正确（0x开头）
- 查看 API endpoints 是否正确

### 问题 2：余额不足
```
Error: Insufficient margin
```

**解决：**
- 确认 USDC 已到账
- 降低仓位大小
- 减少杠杆倍数

### 问题 3：订单被拒绝
```
Error: Order rejected
```

**解决：**
- 检查市场是否开放
- 确认订单大小符合最小值
- 查看是否超过持仓限制

---

## 📞 获取帮助

### 官方资源
- 文档：https://docs.dydx.exchange
- Discord：https://discord.gg/dydx
- GitHub：https://github.com/dydxprotocol

### 社区
- Reddit: r/dydxprotocol
- Twitter: @dYdX

---

## ✅ 检查清单

开始真实交易前，确认：

- [ ] 已在测试网成功交易
- [ ] 理解杠杆风险
- [ ] 设置了止损
- [ ] 配置了告警
- [ ] 只用可以承受亏损的资金
- [ ] 私钥已安全保存（多个备份）
- [ ] credentials.yaml 在 .gitignore 中
- [ ] 已测试紧急平仓脚本
- [ ] 知道如何手动干预

**如果任何一项不确定，先不要用真金白银！**

---

最后提醒：
- 从小额开始（$100-200）
- 观察1-2周
- 逐步增加资金
- 永远不要 all-in

祝交易顺利！🚀
