#!/usr/bin/env python3
"""
生成测试信号 - 模拟真实市场情况

基于实际价格变化生成sentiment信号
"""

import sys
from pathlib import Path
from datetime import datetime
import random

sys.path.insert(0, str(Path(__file__).parent))

from database.db_manager import get_connection


def generate_realistic_signals():
    """生成基于市场情况的realistic信号"""
    
    conn = get_connection()
    cursor = conn.cursor()
    
    now = datetime.now().isoformat()
    
    # 基于市场扫描结果生成信号
    signals = [
        {
            'ticker': 'ETH',
            'combined_sentiment': 0.45,  # 下跌5% -> 偏空但可能反弹
            'total_mentions': 200,
            'reddit_sentiment': 0.42,
            'reddit_mentions': 150,
            'unusual_flow': 0,
            'trends_interest': 80,
            'sentiment_change_24h': -0.15,  # 情绪转空
            'mention_spike': 1  # 讨论增加
        },
        {
            'ticker': 'LINK',
            'combined_sentiment': 0.40,  # 下跌4% -> 偏空
            'total_mentions': 90,
            'reddit_sentiment': 0.38,
            'reddit_mentions': 60,
            'unusual_flow': 0,
            'trends_interest': 55,
            'sentiment_change_24h': -0.12,
            'mention_spike': 0
        },
        {
            'ticker': 'SOL',
            'combined_sentiment': 0.55,  # 轻微下跌 -> 中性偏多
            'total_mentions': 180,
            'reddit_sentiment': 0.58,
            'reddit_mentions': 120,
            'unusual_flow': 0,
            'trends_interest': 70,
            'sentiment_change_24h': 0.05,
            'mention_spike': 0
        },
        {
            'ticker': 'AVAX',
            'combined_sentiment': 0.68,  # 稳定 -> 偏多
            'total_mentions': 100,
            'reddit_sentiment': 0.65,
            'reddit_mentions': 70,
            'unusual_flow': 0,
            'trends_interest': 60,
            'sentiment_change_24h': 0.10,
            'mention_spike': 0
        },
        {
            'ticker': 'DOGE',
            'combined_sentiment': 0.72,  # 社区币 -> 多头
            'total_mentions': 250,
            'reddit_sentiment': 0.75,
            'reddit_mentions': 200,
            'unusual_flow': 0,
            'trends_interest': 90,
            'sentiment_change_24h': 0.08,
            'mention_spike': 1
        },
        {
            'ticker': 'MATIC',
            'combined_sentiment': 0.38,  # 下跌3.6% -> 空头
            'total_mentions': 80,
            'reddit_sentiment': 0.35,
            'reddit_mentions': 50,
            'unusual_flow': 0,
            'trends_interest': 45,
            'sentiment_change_24h': -0.18,
            'mention_spike': 0
        },
        {
            'ticker': 'DOT',
            'combined_sentiment': 0.60,  # 稳定 -> 偏多
            'total_mentions': 95,
            'reddit_sentiment': 0.58,
            'reddit_mentions': 65,
            'unusual_flow': 0,
            'trends_interest': 50,
            'sentiment_change_24h': 0.02,
            'mention_spike': 0
        },
        {
            'ticker': 'ATOM',
            'combined_sentiment': 0.66,  # 偏多
            'total_mentions': 110,
            'reddit_sentiment': 0.64,
            'reddit_mentions': 75,
            'unusual_flow': 0,
            'trends_interest': 58,
            'sentiment_change_24h': 0.12,
            'mention_spike': 0
        },
    ]
    
    for signal in signals:
        cursor.execute("""
            INSERT OR REPLACE INTO sentiment_snapshots (
                ticker,
                combined_sentiment,
                total_mentions,
                reddit_sentiment,
                reddit_mentions,
                unusual_flow,
                trends_interest,
                sentiment_change_24h,
                mention_spike,
                snapshot_time
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            signal['ticker'],
            signal['combined_sentiment'],
            signal['total_mentions'],
            signal['reddit_sentiment'],
            signal['reddit_mentions'],
            signal['unusual_flow'],
            signal['trends_interest'],
            signal['sentiment_change_24h'],
            signal['mention_spike'],
            now
        ))
    
    conn.commit()
    conn.close()
    
    print(f"✅ 已生成 {len(signals)} 个realistic信号:")
    for signal in signals:
        direction = "BULLISH" if signal['combined_sentiment'] > 0.55 else ("BEARISH" if signal['combined_sentiment'] < 0.45 else "NEUTRAL")
        print(f"   {signal['ticker']:6s} {direction:8s} sentiment={signal['combined_sentiment']:.2f}, mentions={signal['total_mentions']}")


if __name__ == '__main__':
    generate_realistic_signals()
