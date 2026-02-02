#!/usr/bin/env python3
"""
插入测试sentiment信号数据
用于测试自动交易系统
"""

import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))

from database.db_manager import get_connection


def insert_test_signals():
    """插入测试信号"""
    
    conn = get_connection()
    cursor = conn.cursor()
    
    now = datetime.now().isoformat()
    
    # 测试信号数据 (满足降低后的阈值: strength>=0.3, confidence>=0.3)
    test_signals = [
        {
            'ticker': 'BTC',
            'combined_sentiment': 0.65,  # 偏多
            'total_mentions': 150,
            'reddit_sentiment': 0.62,
            'reddit_mentions': 100,
            'unusual_flow': 0,
            'trends_interest': 75,
            'sentiment_change_24h': 0.15,
            'mention_spike': 1
        },
        {
            'ticker': 'ETH',
            'combined_sentiment': 0.58,  # 偏多
            'total_mentions': 120,
            'reddit_sentiment': 0.55,
            'reddit_mentions': 80,
            'unusual_flow': 0,
            'trends_interest': 65,
            'sentiment_change_24h': 0.10,
            'mention_spike': 0
        },
        {
            'ticker': 'SOL',
            'combined_sentiment': 0.35,  # 略偏空
            'total_mentions': 80,
            'reddit_sentiment': 0.38,
            'reddit_mentions': 60,
            'unusual_flow': 0,
            'trends_interest': 50,
            'sentiment_change_24h': -0.12,
            'mention_spike': 0
        },
    ]
    
    for signal in test_signals:
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
    
    print(f"✅ 已插入 {len(test_signals)} 个测试信号:")
    for signal in test_signals:
        print(f"   {signal['ticker']}: sentiment={signal['combined_sentiment']:.2f}, mentions={signal['total_mentions']}")


if __name__ == '__main__':
    insert_test_signals()
