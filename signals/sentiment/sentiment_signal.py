"""
Sentiment Signal Source

将情绪分析数据转换为标准化交易信号
"""

import sys
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Any

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from signals.base import BaseSignal, Signal, SignalType
from database.db_manager import get_connection


class SentimentSignal(BaseSignal):
    """
    基于情绪分析的信号源
    
    数据来源：
    - Reddit mentions and sentiment
    - Unusual options flow
    - Google Trends
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        
        # 信号阈值（从配置中读取）
        self.thresholds = self.config.get('thresholds', {
            'strong_bullish': 0.75,
            'bullish': 0.60,
            'neutral': 0.50,
            'bearish': 0.40,
            'strong_bearish': 0.25
        })
        
        # 最小mentions要求
        self.min_mentions = self.config.get('min_mentions', 50)
        
        # 数据新鲜度要求（小时）
        self.max_data_age_hours = self.config.get('max_data_age_hours', 2)
    
    def get_signal(self, ticker: str, timeframe: str = '1h') -> Signal:
        """
        从数据库读取最新情绪数据，生成信号
        
        Args:
            ticker: 股票代码或加密货币
            timeframe: 时间框架（当前情绪信号为小时级别）
        
        Returns:
            Signal 对象
        """
        
        # 从数据库获取最新情绪快照
        conn = get_connection()
        cursor = conn.cursor()
        
        # 查询最近的情绪数据
        cutoff_time = datetime.now() - timedelta(hours=self.max_data_age_hours)
        
        cursor.execute("""
            SELECT 
                combined_sentiment,
                total_mentions,
                reddit_sentiment,
                reddit_mentions,
                unusual_flow,
                trends_interest,
                sentiment_change_24h,
                mention_spike,
                snapshot_time
            FROM sentiment_snapshots
            WHERE ticker = ? 
              AND snapshot_time > ?
            ORDER BY snapshot_time DESC
            LIMIT 1
        """, (ticker, cutoff_time))
        
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            # 没有数据，返回中性信号
            return Signal(
                ticker=ticker,
                asset_type='unknown',
                signal_type=SignalType.NEUTRAL,
                strength=0.0,
                confidence=0.0,
                timeframe=timeframe,
                source='sentiment',
                metadata={'reason': 'no_data'},
                timestamp=datetime.now()
            )
        
        # 解析数据
        sentiment_score = row[0]
        total_mentions = row[1]
        reddit_sentiment = row[2]
        reddit_mentions = row[3]
        unusual_flow = row[4] or 0
        trends_interest = row[5] or 0
        sentiment_change_24h = row[6]
        mention_spike = row[7]
        snapshot_time = datetime.fromisoformat(row[8])
        
        # 判断信号类型和强度
        signal_type, strength = self._calculate_signal_type_and_strength(
            sentiment_score,
            total_mentions,
            sentiment_change_24h
        )
        
        # 计算置信度
        confidence = self._calculate_confidence(
            total_mentions=total_mentions,
            reddit_mentions=reddit_mentions,
            unusual_flow=unusual_flow,
            data_age_hours=(datetime.now() - snapshot_time).total_seconds() / 3600,
            mention_spike=mention_spike
        )
        
        # 构建metadata
        metadata = {
            'sentiment_score': sentiment_score,
            'total_mentions': total_mentions,
            'reddit_sentiment': reddit_sentiment,
            'reddit_mentions': reddit_mentions,
            'unusual_flow': unusual_flow,
            'trends_interest': trends_interest,
            'sentiment_change_24h': sentiment_change_24h,
            'mention_spike': bool(mention_spike),
            'data_age_hours': round((datetime.now() - snapshot_time).total_seconds() / 3600, 2)
        }
        
        return Signal(
            ticker=ticker,
            asset_type=self._detect_asset_type(ticker),
            signal_type=signal_type,
            strength=strength,
            confidence=confidence,
            timeframe=timeframe,
            source='sentiment',
            metadata=metadata,
            timestamp=datetime.now()
        )
    
    def _calculate_signal_type_and_strength(
        self,
        sentiment_score: float,
        mentions: int,
        change_24h: float
    ) -> tuple:
        """
        根据情绪分数和变化计算信号类型和强度
        
        Returns:
            (SignalType, strength)
        """
        
        # Mentions不足，降低信号可靠性
        if mentions < self.min_mentions:
            return SignalType.NEUTRAL, 0.0
        
        # 判断信号方向
        if sentiment_score >= self.thresholds['strong_bullish']:
            signal_type = SignalType.BUY
            # 强度 = 超出阈值的程度
            strength = min(1.0, (sentiment_score - self.thresholds['strong_bullish']) / (1.0 - self.thresholds['strong_bullish']))
            strength = max(0.7, strength)  # 强看涨至少0.7
            
        elif sentiment_score >= self.thresholds['bullish']:
            signal_type = SignalType.BUY
            strength = 0.5 + (sentiment_score - self.thresholds['bullish']) / (self.thresholds['strong_bullish'] - self.thresholds['bullish']) * 0.2
            
        elif sentiment_score <= self.thresholds['strong_bearish']:
            signal_type = SignalType.SELL
            strength = min(1.0, (self.thresholds['strong_bearish'] - sentiment_score) / self.thresholds['strong_bearish'])
            strength = max(0.7, strength)
            
        elif sentiment_score <= self.thresholds['bearish']:
            signal_type = SignalType.SELL
            strength = 0.5 + (self.thresholds['bearish'] - sentiment_score) / (self.thresholds['bearish'] - self.thresholds['strong_bearish']) * 0.2
            
        else:
            signal_type = SignalType.NEUTRAL
            strength = 0.0
        
        # 如果情绪变化剧烈，增强信号强度
        if change_24h and abs(change_24h) > 0.2:
            if (change_24h > 0 and signal_type == SignalType.BUY) or \
               (change_24h < 0 and signal_type == SignalType.SELL):
                strength = min(1.0, strength * 1.2)
        
        return signal_type, strength
    
    def _calculate_confidence(
        self,
        total_mentions: int,
        reddit_mentions: int,
        unusual_flow: float,
        data_age_hours: float,
        mention_spike: bool
    ) -> float:
        """
        计算信号置信度
        
        因素：
        - Mentions数量（越多越可信）
        - 数据源多样性（Reddit + Unusual Flow + Trends）
        - 数据新鲜度（越新越好）
        - Mention Spike（突然爆发 = 高关注）
        """
        
        confidence = 0.0
        
        # 1. Mentions贡献（最高0.4）
        if total_mentions >= 200:
            confidence += 0.4
        elif total_mentions >= 100:
            confidence += 0.3
        elif total_mentions >= 50:
            confidence += 0.2
        else:
            confidence += 0.1
        
        # 2. 多数据源贡献（最高0.3）
        sources_count = 0
        if reddit_mentions > 10:
            sources_count += 1
        if unusual_flow > 0:
            sources_count += 1
        
        confidence += sources_count * 0.15
        
        # 3. 数据新鲜度（最高0.2）
        if data_age_hours < 1:
            confidence += 0.2
        elif data_age_hours < 2:
            confidence += 0.1
        
        # 4. Mention Spike 奖励（0.1）
        if mention_spike:
            confidence += 0.1
        
        return min(1.0, confidence)
    
    def _detect_asset_type(self, ticker: str) -> str:
        """简单检测资产类型"""
        crypto_tickers = {
            'BTC', 'ETH', 'SOL', 'DOGE', 'ADA', 'DOT', 'AVAX', 'MATIC',
            'ATOM', 'LTC', 'LINK', 'UNI', 'AAVE', 'CRV', 'SUSHI', 'MKR',
            'COMP', 'SNX', 'YFI', 'BAL', 'ZRX', 'ENJ', 'MANA', 'SAND'
        }
        if ticker.upper() in crypto_tickers:
            return 'crypto'
        return 'stock'
    
    def validate(self) -> bool:
        """验证数据库连接是否正常"""
        try:
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM sentiment_snapshots")
            count = cursor.fetchone()[0]
            conn.close()
            return count > 0
        except Exception as e:
            print(f"Sentiment signal validation failed: {e}")
            return False
    
    def get_health(self) -> dict:
        """返回信号源健康状态"""
        try:
            conn = get_connection()
            cursor = conn.cursor()
            
            # 检查最近的数据
            cursor.execute("""
                SELECT MAX(snapshot_time), COUNT(*)
                FROM sentiment_snapshots
                WHERE snapshot_time > datetime('now', '-2 hours')
            """)
            
            row = cursor.fetchone()
            last_update_str, recent_count = row
            conn.close()
            
            if not last_update_str:
                return {
                    'status': 'down',
                    'last_update': None,
                    'error_count': 0,
                    'details': 'No recent data found'
                }
            
            last_update = datetime.fromisoformat(last_update_str)
            data_age_hours = (datetime.now() - last_update).total_seconds() / 3600
            
            if data_age_hours > 2:
                status = 'degraded'
                details = f'Data is {data_age_hours:.1f} hours old'
            else:
                status = 'healthy'
                details = f'{recent_count} tickers updated in last 2h'
            
            return {
                'status': status,
                'last_update': last_update,
                'error_count': 0,
                'details': details
            }
            
        except Exception as e:
            return {
                'status': 'down',
                'last_update': None,
                'error_count': 1,
                'details': str(e)
            }


if __name__ == "__main__":
    # 测试
    signal_source = SentimentSignal()
    
    print("Validating sentiment signal source...")
    if signal_source.validate():
        print("✅ Validation passed")
    else:
        print("❌ Validation failed")
    
    print("\nHealth check:")
    health = signal_source.get_health()
    print(f"  Status: {health['status']}")
    print(f"  Details: {health['details']}")
    
    # 测试获取信号
    test_tickers = ['BTC', 'GOLD', 'AAPL']
    print("\nTest signals:")
    for ticker in test_tickers:
        signal = signal_source.get_signal(ticker)
        print(f"  {signal}")
