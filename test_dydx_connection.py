#!/usr/bin/env python3
"""
dYdX 连接测试脚本

使用方法：
1. 复制 .env.example 为 .env
2. 填入你的助记词
3. 运行: python test_dydx_connection.py
"""

import asyncio
import logging
import os
from dotenv import load_dotenv

from trading.dydx_trader import dYdXTrader

# 加载环境变量
load_dotenv()

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


async def test_connection():
    """测试 dYdX 连接"""
    
    print("=" * 60)
    print("dYdX v4 连接测试")
    print("=" * 60)
    
    # 从环境变量加载配置
    config = {
        'network': os.getenv('DYDX_NETWORK', 'testnet'),
        'mnemonic': os.getenv('DYDX_MNEMONIC'),
        'subaccount_number': int(os.getenv('DYDX_SUBACCOUNT', 0)),
        'default_leverage': float(os.getenv('DYDX_DEFAULT_LEVERAGE', 2.0)),
    }
    
    # 检查必需配置
    if not config['mnemonic']:
        print("\n❌ 错误：未找到 DYDX_MNEMONIC")
        print("请在 .env 文件中设置你的助记词")
        print("\n示例：")
        print("DYDX_MNEMONIC=\"word1 word2 word3 ... word12\"")
        return
    
    print(f"\n📡 网络: {config['network']}")
    print(f"💼 子账户: {config['subaccount_number']}")
    print(f"⚡ 杠杆: {config['default_leverage']}x")
    
    # 创建交易器
    trader = dYdXTrader(config)
    
    try:
        # 1. 连接测试
        print("\n🔌 测试 1/5: 连接到 dYdX...")
        if not await trader.connect():
            print("❌ 连接失败")
            return
        print("✅ 连接成功")
        
        # 2. 账户信息
        print("\n💰 测试 2/5: 获取账户信息...")
        account = await trader.get_account_info()
        print(f"   总权益: ${account.total_equity:.2f}")
        print(f"   可用余额: ${account.available_cash:.2f}")
        print(f"   已用保证金: ${account.used_margin:.2f}")
        print(f"   未实现盈亏: ${account.unrealized_pnl:.2f}")
        
        if account.total_equity == 0:
            print("\n⚠️  警告：账户余额为 0")
            if config['network'] == 'testnet':
                print("   去测试网水龙头领取代币：https://v4.testnet.dydx.exchange/")
        
        # 3. 获取市场价格
        print("\n📊 测试 3/5: 获取市场价格...")
        markets = ['BTC', 'ETH', 'SOL']
        for market in markets:
            try:
                price = await trader.get_current_price(market)
                if price > 0:
                    print(f"   {market}: ${price:.2f}")
                else:
                    print(f"   {market}: ⚠️ 无法获取价格")
            except Exception as e:
                print(f"   {market}: ❌ {e}")
        
        # 4. 持仓查询
        print("\n📈 测试 4/5: 查询持仓...")
        positions = await trader.get_all_positions()
        if positions:
            print(f"   找到 {len(positions)} 个持仓:")
            for pos in positions:
                pnl_emoji = "🟢" if pos.unrealized_pnl > 0 else "🔴"
                print(f"   {pnl_emoji} {pos.ticker}: {pos.side.value} {pos.size:.4f}")
                print(f"      入场: ${pos.entry_price:.2f} | 当前: ${pos.current_price:.2f}")
                print(f"      盈亏: ${pos.unrealized_pnl:.2f} ({pos.pnl_percentage:.2f}%)")
        else:
            print("   ✅ 没有持仓")
        
        # 5. API 速率测试
        print("\n⚡ 测试 5/5: API 响应速度...")
        import time
        start = time.time()
        await trader.get_current_price('BTC')
        latency = (time.time() - start) * 1000
        print(f"   延迟: {latency:.0f}ms")
        
        if latency < 200:
            print("   ✅ 响应快")
        elif latency < 500:
            print("   ⚠️  响应一般")
        else:
            print("   ❌ 响应慢，考虑使用更近的节点")
        
        # 总结
        print("\n" + "=" * 60)
        print("✅ 所有测试完成！")
        print("=" * 60)
        
        if account.total_equity > 0:
            print("\n🚀 你现在可以开始交易了！")
            print("\n下一步:")
            print("1. 小额测试下单（建议 $10-$50）")
            print("2. 验证止损止盈功能")
            print("3. 运行完整的交易引擎:")
            print("   python main_trading_demo.py")
        else:
            if config['network'] == 'testnet':
                print("\n📝 下一步:")
                print("1. 去测试网领取代币:")
                print("   https://v4.testnet.dydx.exchange/")
                print("2. 再次运行此脚本验证余额")
                print("3. 开始测试交易")
            else:
                print("\n⚠️  主网账户余额为 0")
                print("请充值 USDC 到你的 dYdX 地址")
    
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # 断开连接
        await trader.disconnect()
        print("\n👋 已断开连接")


if __name__ == "__main__":
    asyncio.run(test_connection())
