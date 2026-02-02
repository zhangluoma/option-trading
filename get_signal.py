#!/usr/bin/env python3
"""
获取sentiment信号 - 供自动交易守护进程调用

用法：
    python get_signal.py BTC
    python get_signal.py ETH

输出JSON格式信号
"""

import sys
import json
from pathlib import Path

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent))

from signals.sentiment.sentiment_signal import SentimentSignal


def get_signal(ticker: str) -> dict:
    """获取指定ticker的sentiment信号"""
    
    # 创建信号源
    signal_source = SentimentSignal({
        'min_mentions': 30,  # 降低阈值以支持更多币种
        'max_data_age_hours': 3,  # 允许3小时内的数据
    })
    
    # 获取信号
    signal = signal_source.get_signal(ticker, timeframe='1h')
    
    # 转换为JSON可序列化的dict
    return {
        'ticker': signal.ticker,
        'asset_type': signal.asset_type,
        'signal_type': signal.signal_type.value,  # 'BUY', 'SELL', 'NEUTRAL'
        'strength': float(signal.strength),
        'confidence': float(signal.confidence),
        'timeframe': signal.timeframe,
        'source': signal.source,
        'final_score': float(signal.strength * signal.confidence),
        'metadata': signal.metadata,
        'timestamp': signal.timestamp.isoformat()
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            'error': 'Usage: python get_signal.py <TICKER>'
        }), file=sys.stderr)
        sys.exit(1)
    
    ticker = sys.argv[1].upper()
    
    try:
        signal = get_signal(ticker)
        print(json.dumps(signal, indent=2))
        sys.exit(0)
        
    except Exception as e:
        print(json.dumps({
            'error': str(e),
            'ticker': ticker
        }), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
