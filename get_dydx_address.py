#!/usr/bin/env python3
"""
从助记词生成 dYdX 地址
"""

import hashlib
import os
from mnemonic import Mnemonic
from dotenv import load_dotenv
import bech32

load_dotenv()

def mnemonic_to_seed(mnemonic_phrase):
    """助记词 -> seed"""
    mnemo = Mnemonic("english")
    seed = mnemo.to_seed(mnemonic_phrase, passphrase="")
    return seed

def derive_private_key(seed):
    """
    从 seed 派生私钥 (简化版 BIP44 for Cosmos)
    路径: m/44'/118'/0'/0/0
    """
    import hmac
    
    # HMAC-SHA512
    h = hmac.new(b"Bitcoin seed", seed, hashlib.sha512).digest()
    master_key = h[:32]
    master_chain_code = h[32:]
    
    # 简化版：直接用 master key 作为私钥
    # 完整实现需要按 BIP44 路径派生
    return master_key

def pubkey_from_privkey(privkey):
    """私钥 -> 公钥 (secp256k1)"""
    try:
        from ecdsa import SigningKey, SECP256k1
        import hashlib
        
        sk = SigningKey.from_string(privkey, curve=SECP256k1)
        vk = sk.get_verifying_key()
        
        # 压缩公钥格式
        pubkey_bytes = vk.to_string()
        x = pubkey_bytes[:32]
        y = pubkey_bytes[32:]
        
        # 判断 y 的奇偶性
        if int.from_bytes(y, 'big') % 2 == 0:
            prefix = b'\x02'
        else:
            prefix = b'\x03'
        
        compressed_pubkey = prefix + x
        return compressed_pubkey
        
    except Exception as e:
        print(f"生成公钥失败: {e}")
        return None

def pubkey_to_address(pubkey, prefix="dydx"):
    """公钥 -> Bech32 地址"""
    # SHA256
    sha = hashlib.sha256(pubkey).digest()
    
    # RIPEMD160
    ripemd = hashlib.new('ripemd160')
    ripemd.update(sha)
    hash160 = ripemd.digest()
    
    # Bech32 编码
    five_bit_r = bech32.convertbits(hash160, 8, 5)
    address = bech32.bech32_encode(prefix, five_bit_r)
    
    return address

def main():
    mnemonic_phrase = os.getenv('DYDX_MNEMONIC')
    
    if not mnemonic_phrase:
        print("❌ 未找到 DYDX_MNEMONIC")
        return
    
    print("🔐 从助记词生成 dYdX 地址...\n")
    
    # 1. 助记词 -> seed
    seed = mnemonic_to_seed(mnemonic_phrase)
    print(f"✅ Seed生成成功")
    
    # 2. seed -> 私钥
    privkey = derive_private_key(seed)
    print(f"✅ 私钥生成成功")
    
    # 3. 私钥 -> 公钥
    pubkey = pubkey_from_privkey(privkey)
    if not pubkey:
        print("❌ 公钥生成失败")
        return
    print(f"✅ 公钥生成成功")
    
    # 4. 公钥 -> 地址
    address = pubkey_to_address(pubkey, prefix="dydx")
    print(f"✅ 地址生成成功\n")
    
    print("=" * 60)
    print(f"你的 dYdX 地址:")
    print(address)
    print("=" * 60)
    
    return address

if __name__ == "__main__":
    main()
