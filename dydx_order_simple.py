#!/usr/bin/env python3
"""
dYdX v4 轻量下单工具
不需要完整 SDK，直接用 REST API
"""

import asyncio
import aiohttp
import hashlib
import hmac
import time
import os
from dotenv import load_dotenv
from mnemonic import Mnemonic
from ecdsa import SigningKey, SECP256k1
import json
import base64

load_dotenv()

def mnemonic_to_privkey(mnemonic_phrase):
    """助记词 -> 私钥"""
    mnemo = Mnemonic("english")
    seed = mnemo.to_seed(mnemonic_phrase, passphrase="")
    
    # HMAC-SHA512
    h = hmac.new(b"Bitcoin seed", seed, hashlib.sha512).digest()
    master_key = h[:32]
    return master_key

def sign_message(privkey_bytes, message):
    """用私钥签名消息"""
    sk = SigningKey.from_string(privkey_bytes, curve=SECP256k1)
    sig = sk.sign_digest(message, sigencode=lambda r, s, order: r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))
    return sig

async def place_order_limit(address, market, side, size, price, post_only=True):
    """
    下限价单
    
    Args:
        address: dYdX 地址
        market: 市场（如 ETH-USD）
        side: BUY 或 SELL
        size: 数量
        price: 价格
        post_only: Maker 单（True）或允许 Taker（False）
    """
    
    indexer_url = "https://indexer.dydx.trade/v4"
    
    # 获取账户信息（需要 subaccount number）
    async with aiohttp.ClientSession() as session:
        # 1. 获取市场信息
        market_url = f"{indexer_url}/perpetualMarkets"
        async with session.get(market_url) as resp:
            if resp.status != 200:
                print(f"❌ 获取市场信息失败: {resp.status}")
                return None
            
            markets_data = await resp.json()
            market_info = markets_data['markets'].get(market)
            
            if not market_info:
                print(f"❌ 市场 {market} 不存在")
                return None
            
            print(f"✅ 市场信息:")
            print(f"   步长: {market_info['stepSize']}")
            print(f"   Tick: {market_info['tickSize']}")
        
        # 2. 获取账户 nonce
        account_url = f"{indexer_url}/addresses/{address}"
        async with session.get(account_url) as resp:
            if resp.status != 200:
                print(f"❌ 获取账户失败: {resp.status}")
                return None
            
            account_data = await resp.json()
            subaccount = account_data['subaccounts'][0]
            subaccount_number = subaccount['subaccountNumber']
            
            print(f"✅ 子账户: {subaccount_number}")
        
        # 3. 构造订单
        client_id = int(time.time() * 1000)  # 客户端订单 ID
        good_til_time = int(time.time() + 300)  # 5分钟有效期
        
        order_payload = {
            "market": market,
            "side": side,
            "type": "LIMIT",
            "timeInForce": "GTT",  # Good Till Time
            "size": str(size),
            "price": str(price),
            "postOnly": post_only,
            "reduceOnly": False,
            "clientId": str(client_id),
            "goodTilTime": good_til_time,
            "subaccountNumber": subaccount_number,
        }
        
        print(f"\n📝 订单:")
        print(f"   {side} {size} {market} @ ${price}")
        print(f"   Maker only: {post_only}")
        
        # 注意：dYdX v4 需要链上签名，这里只是构造订单格式
        # 真实下单需要用钱包签名交易并广播到链上
        
        print("\n⚠️  警告: 简化版本只能构造订单格式")
        print("   真实下单需要:")
        print("   1. 用私钥签名交易")
        print("   2. 广播到 dYdX Chain")
        print("   3. 建议用官方 SDK 或钱包")
        
        return order_payload

async def main():
    mnemonic = os.getenv('DYDX_MNEMONIC')
    address = "dydx199t5s58t0hfvrnhpw52759alq87648923nuzws"
    
    # ETH 市场信息
    market = "ETH-USD"
    
    # 获取当前价格
    indexer_url = "https://indexer.dydx.trade/v4"
    async with aiohttp.ClientSession() as session:
        orderbook_url = f"{indexer_url}/orderbooks/perpetualMarket/{market}"
        async with session.get(orderbook_url) as resp:
            data = await resp.json()
            best_bid = float(data['bids'][0]['price'])
            best_ask = float(data['asks'][0]['price'])
            mid_price = (best_bid + best_ask) / 2
            
            print(f"📊 {market} 当前价格:")
            print(f"   买一: ${best_bid}")
            print(f"   卖一: ${best_ask}")
            print(f"   中间价: ${mid_price:.2f}\n")
    
    # 做多 ETH：买入 0.01 ETH（约 $23）
    # Maker 单：挂在买一下方，等待成交
    buy_price = best_bid - 0.1  # 比买一低 $0.1
    size = 0.01  # 0.01 ETH
    
    order = await place_order_limit(
        address=address,
        market=market,
        side="BUY",
        size=size,
        price=buy_price,
        post_only=True  # Maker only
    )
    
    if order:
        print(f"\n✅ 订单构造成功（但未提交）")
        print(json.dumps(order, indent=2))

if __name__ == "__main__":
    asyncio.run(main())
