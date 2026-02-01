# 🚀 快速开始 - dYdX 交易

## 5 分钟设置指南

### 步骤 1: 安装依赖

```bash
cd options-sentiment-engine
pip install -r requirements.txt
```

关键依赖：
- `v4-client-py`: dYdX v4 官方 Python SDK
- `aiohttp`: 异步 HTTP 请求
- `python-dotenv`: 环境变量管理

### 步骤 2: 配置钱包

#### 方式 A：生成新钱包（测试用）

```bash
python -c "from v4_client_py.chain.aerial.wallet import LocalWallet; w = LocalWallet.generate_mnemonic(); print(f'Mnemonic: {w.mnemonic()}\nAddress: {w.address()}')"
```

保存输出的助记词和地址！

#### 方式 B：使用现有钱包

如果你已有 Keplr/Leap 钱包，导出助记词。

### 步骤 3: 创建配置文件

```bash
cp .env.example .env
```

编辑 `.env`：

```bash
DYDX_NETWORK=testnet
DYDX_MNEMONIC="your twelve word mnemonic here"
DYDX_SUBACCOUNT=0
DYDX_DEFAULT_LEVERAGE=2
```

### 步骤 4: 领取测试代币（仅测试网）

1. 访问 https://v4.testnet.dydx.exchange/
2. 连接你的钱包（使用上面的助记词）
3. 点击 "Faucet" 领取测试 USDC

### 步骤 5: 测试连接

```bash
python test_dydx_connection.py
```

你应该看到：

```
✅ 连接成功
💰 账户信息
   总权益: $1000.00
   可用余额: $1000.00
📊 市场价格
   BTC: $95123.45
   ETH: $3210.67
✅ 所有测试完成！
```

---

## 🎯 下一步

### 测试小额交易

创建 `test_trade.py`：

```python
import asyncio
from trading.dydx_trader import dYdXTrader, Order, OrderSide, OrderType
import os
from dotenv import load_dotenv

load_dotenv()

async def main():
    config = {
        'network': os.getenv('DYDX_NETWORK'),
        'mnemonic': os.getenv('DYDX_MNEMONIC'),
        'subaccount_number': 0,
        'default_leverage': 2.0
    }
    
    trader = dYdXTrader(config)
    await trader.connect()
    
    # 小额做多 BTC（$50）
    order = Order(
        ticker='BTC',
        side=OrderSide.BUY,
        size=50.0,  # $50
        order_type=OrderType.MARKET,
        stop_loss=None,  # 先不设止损
        take_profit=None
    )
    
    result = await trader.place_order(order)
    print(f"Order result: {result.message}")
    
    # 查看持仓
    position = await trader.get_position('BTC')
    if position:
        print(f"Position: {position.size:.4f} BTC @ ${position.entry_price:.2f}")
    
    await trader.disconnect()

asyncio.run(main())
```

运行：

```bash
python test_trade.py
```

### 运行完整交易引擎

```bash
python main_trading_demo.py
```

---

## 📋 检查清单

- [ ] 安装了所有依赖 (`pip install -r requirements.txt`)
- [ ] 创建了 `.env` 并填入助记词
- [ ] 测试网已领取代币（或主网已充值）
- [ ] 运行 `test_dydx_connection.py` 成功
- [ ] 小额测试交易成功
- [ ] 理解了止损止盈机制

---

## ⚠️ 风险提示

### 测试网
- ✅ 免费，不会损失真钱
- ✅ 用于学习和测试策略
- ❌ 不代表主网的真实表现

### 主网
- ⚠️ 真实资金，有损失风险
- ⚠️ 从小额开始（$10-$50）
- ⚠️ 必须设置止损
- ⚠️ 不要用你输不起的钱

---

## 🆘 常见问题

### Q: 测试连接失败？
A: 检查：
1. 网络连接
2. 助记词格式（12 或 24 个单词，空格分隔）
3. 防火墙设置

### Q: 余额显示为 0？
A: 测试网需要手动领取代币，主网需要充值 USDC

### Q: 下单失败？
A: 检查：
1. 余额是否足够
2. 市场是否存在（BTC-USD, ETH-USD 等）
3. 订单大小是否符合最小要求

### Q: 需要 VPN 吗？
A: 使用 API 不需要 VPN（即使在美国）

---

## 📚 更多资源

- [DYDX_SETUP.md](./DYDX_SETUP.md) - 详细设置指南
- [dYdX 官方文档](https://docs.dydx.exchange/)
- [Python SDK 文档](https://github.com/dydxprotocol/v4-clients/tree/main/v4-client-py)
- [API 参考](https://docs.dydx.exchange/developers/indexer/indexer_api)
