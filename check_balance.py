#!/usr/bin/env python3
"""
快速检查 dYdX 余额
不需要 SDK，直接用 HTTP API
"""

import asyncio
import aiohttp
import os
from dotenv import load_dotenv

load_dotenv()

# 从助记词生成地址（简化版）
async def get_address_from_mnemonic(mnemonic):
    """从助记词获取 dYdX 地址"""
    try:
        from v4_client_py.chain.aerial.wallet import LocalWallet
        wallet = LocalWallet.from_mnemonic(mnemonic, prefix="dydx")
        return wallet.address()
    except Exception as e:
        print(f"无法从助记词生成地址: {e}")
        return None

async def check_balance(address):
    """检查 dYdX 主网余额"""
    
    indexer_url = "https://indexer.dydx.trade/v4"
    
    async with aiohttp.ClientSession() as session:
        # 获取账户信息
        url = f"{indexer_url}/addresses/{address}/subaccounts/0"
        
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    subaccount = data.get('subaccount', {})
                    
                    equity = float(subaccount.get('equity', 0))
                    free_collateral = float(subaccount.get('freeCollateral', 0))
                    
                    print("=" * 60)
                    print(f"dYdX 主网账户: {address[:10]}...{address[-8:]}")
                    print("=" * 60)
                    print(f"💰 总权益 (Total Equity): ${equity:.2f}")
                    print(f"💵 可用余额 (Available): ${free_collateral:.2f}")
                    print(f"🔒 已用保证金: ${equity - free_collateral:.2f}")
                    print("=" * 60)
                    
                    return equity
                elif resp.status == 404:
                    print(f"❌ 账户不存在或没有活动")
                    print(f"   地址: {address}")
                    print(f"   确认你的助记词对应的是 dYdX 主网地址")
                    return None
                else:
                    print(f"❌ API 错误: {resp.status}")
                    text = await resp.text()
                    print(f"   响应: {text[:200]}")
                    return None
                    
        except asyncio.TimeoutError:
            print("❌ 连接超时，请检查网络")
            return None
        except Exception as e:
            print(f"❌ 错误: {e}")
            return None

async def main():
    mnemonic = os.getenv('DYDX_MNEMONIC')
    
    if not mnemonic:
        print("❌ 未找到 DYDX_MNEMONIC")
        print("请在 .env 文件中设置")
        return
    
    print("🔍 从助记词生成地址...")
    address = await get_address_from_mnemonic(mnemonic)
    
    if not address:
        # 如果生成失败，尝试直接用硬编码的地址（临时）
        # dYdX 地址通常以 dydx1 开头
        print("\n⚠️  无法自动生成地址")
        print("请手动提供你的 dYdX 地址 (dydx1...)")
        print("或者安装完整的依赖: pip install v4-client-py")
        
        # 临时：让用户输入地址
        # address = input("输入你的 dYdX 地址: ").strip()
        return
    
    print(f"✅ 地址: {address}\n")
    
    await check_balance(address)

if __name__ == "__main__":
    asyncio.run(main())
