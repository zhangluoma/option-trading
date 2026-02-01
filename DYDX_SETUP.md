# dYdX v4 API 交易设置

## 🔧 需要什么才能开始测试

### 1. 安装 dYdX Python SDK

```bash
pip install v4-client-py
```

### 2. 准备测试账户

#### 选项 A：测试网（推荐新手）
- 免费测试，不会损失真金白银
- 获取测试代币：https://v4.testnet.dydx.exchange/
- 使用测试网配置（见下方）

#### 选项 B：主网（真实交易）
- 需要真实资金
- 使用主网配置
- ⚠️ **小心操作，会损失真金白银**

### 3. 创建钱包

你需要一个 **助记词（mnemonic）** 来控制钱包：

```python
# 生成新钱包（仅测试用）
from v4_client_py.chain.aerial.wallet import LocalWallet

wallet = LocalWallet.generate_mnemonic()
print(f"Mnemonic: {wallet.mnemonic()}")
print(f"Address: {wallet.address()}")

# 保存好助记词！丢失无法恢复
```

**或者** 使用现有的 Cosmos 兼容钱包：
- Keplr
- Leap Wallet
- Cosmostation

导出助记词并保存到配置中。

### 4. 配置文件

创建 `config/dydx_config.yaml`：

```yaml
# dYdX v4 配置
dydx:
  # 网络选择
  network: testnet  # mainnet | testnet
  
  # 钱包配置（⚠️ 敏感信息，不要提交到 git）
  mnemonic: "your twelve or twenty four word mnemonic phrase here"
  
  # 子账户（默认 0）
  subaccount_number: 0
  
  # 交易配置
  default_leverage: 2.0
  max_leverage: 5.0
  
  # 自定义 RPC（可选）
  # validator_url: "https://your-rpc-node.com"
  # indexer_url: "https://your-indexer.com/v4"
```

**🔒 安全提示：**
- 不要将 mnemonic 提交到 git
- 使用环境变量或 `.env` 文件
- 测试时用测试网，主网用独立的交易钱包

### 5. 环境变量（推荐）

更安全的做法，使用 `.env` 文件：

```bash
# .env
DYDX_NETWORK=testnet
DYDX_MNEMONIC="your mnemonic here"
DYDX_SUBACCOUNT=0
```

然后在代码中加载：

```python
import os
from dotenv import load_dotenv

load_dotenv()

config = {
    'network': os.getenv('DYDX_NETWORK', 'testnet'),
    'mnemonic': os.getenv('DYDX_MNEMONIC'),
    'subaccount_number': int(os.getenv('DYDX_SUBACCOUNT', 0)),
    'default_leverage': 2.0
}
```

### 6. 测试连接

```bash
cd options-sentiment-engine
python trading/dydx_trader.py
```

如果成功，你会看到：

```
✅ Connected to dYdX v4
   Balance: $1000.00
   Available: $1000.00

💰 BTC Price: $95123.45

📈 No open positions
```

---

## 📋 测试清单

- [ ] 安装 `v4-client-py`
- [ ] 生成或导入助记词
- [ ] 配置 `config/dydx_config.yaml` 或 `.env`
- [ ] 如果用测试网，去水龙头领取测试代币
- [ ] 运行 `python trading/dydx_trader.py` 测试连接
- [ ] 确认能获取账户余额
- [ ] 确认能获取 BTC 价格
- [ ] 小额测试下单（测试网）

---

## 🚀 开始交易

连接成功后，可以运行完整的交易引擎：

```bash
python main_trading_demo.py --config config/dydx_config.yaml
```

---

## 🆘 常见问题

### Q: 测试网代币怎么领？
A: 访问 https://v4.testnet.dydx.exchange/，连接钱包，点击 "Faucet"

### Q: 主网需要什么代币？
A: USDC（作为抵押品）和少量 DYDX（用于 gas）

### Q: API 有速率限制吗？
A: 有，但正常交易不会触发。高频策略需要自己运行节点。

### Q: 可以同时开多个持仓吗？
A: 可以，每个市场（BTC-USD, ETH-USD）都是独立的持仓。

### Q: 手续费多少？
A: Maker: 0.02% | Taker: 0.05%（主网，根据交易量有折扣）

---

## 📚 参考资料

- dYdX v4 文档: https://docs.dydx.exchange/
- Python SDK: https://github.com/dydxprotocol/v4-clients/tree/main/v4-client-py
- API 文档: https://docs.dydx.exchange/developers/indexer/indexer_api
- 测试网: https://v4.testnet.dydx.exchange/
- 主网: https://trade.dydx.exchange/
