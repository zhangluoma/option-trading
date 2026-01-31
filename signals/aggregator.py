"""
Signal Aggregator - 信号融合引擎

将多个信号源的输出融合成一个统一的交易信号
"""

import numpy as np
from typing import List, Dict, Any
from datetime import datetime
import logging

from signals.base import BaseSignal, Signal, SignalType, AggregatedSignal

logger = logging.getLogger(__name__)


class SignalAggregator:
    """
    信号融合引擎
    
    支持多种融合策略：
    - weighted_average: 加权平均
    - majority_vote: 投票机制
    - priority: 优先级（高置信度优先）
    """
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.signal_sources = {}  # name -> BaseSignal instance
        self.weights = config.get('weights', {})
        self.conflict_resolution = config.get('conflict_resolution', 'weighted_average')
    
    def register_source(self, name: str, source: BaseSignal, weight: float = 1.0):
        """
        注册新的信号源
        
        Args:
            name: 信号源名称（如 'sentiment', 'technical'）
            source: BaseSignal 实例
            weight: 权重（默认1.0）
        """
        self.signal_sources[name] = source
        if name not in self.weights:
            self.weights[name] = weight
        
        logger.info(f"Registered signal source: {name} (weight={self.weights[name]})")
    
    def aggregate(self, ticker: str, timeframe: str = '1h') -> AggregatedSignal:
        """
        融合多个信号源，生成最终交易信号
        
        Args:
            ticker: 股票代码或加密货币
            timeframe: 时间框架
        
        Returns:
            AggregatedSignal 对象
        """
        
        signals = []
        
        # 从所有已注册的信号源获取信号
        for name, source in self.signal_sources.items():
            try:
                signal = source.get_signal(ticker, timeframe)
                signal.weight = self.weights.get(name, 1.0)
                signals.append(signal)
                logger.debug(f"Got signal from {name}: {signal}")
            except Exception as e:
                logger.error(f"Signal source {name} failed for {ticker}: {e}")
        
        if not signals:
            logger.warning(f"No signals available for {ticker}")
            return AggregatedSignal.neutral(ticker=ticker)
        
        # 根据配置的策略进行融合
        if self.conflict_resolution == 'weighted_average':
            return self._weighted_average(signals, ticker, timeframe)
        elif self.conflict_resolution == 'majority_vote':
            return self._majority_vote(signals, ticker, timeframe)
        elif self.conflict_resolution == 'priority':
            return self._priority(signals, ticker, timeframe)
        else:
            raise ValueError(f"Unknown conflict resolution: {self.conflict_resolution}")
    
    def _weighted_average(
        self,
        signals: List[Signal],
        ticker: str,
        timeframe: str
    ) -> AggregatedSignal:
        """
        加权平均融合策略
        
        每个信号的贡献 = score * weight
        最终得分 = Σ(score * weight) / Σ(weight)
        """
        
        # 计算加权得分
        weighted_scores = []
        total_weight = 0.0
        
        for signal in signals:
            # 将信号转换为数值：BUY=1, SELL=0, NEUTRAL=0.5
            if signal.signal_type == SignalType.BUY:
                base_score = 0.5 + signal.strength * 0.5  # 0.5-1.0
            elif signal.signal_type == SignalType.SELL:
                base_score = 0.5 - signal.strength * 0.5  # 0.0-0.5
            else:
                base_score = 0.5
            
            # 乘以置信度
            score = base_score * signal.confidence
            
            weighted_scores.append(score * signal.weight)
            total_weight += signal.weight
        
        # 计算最终得分
        if total_weight == 0:
            final_score = 0.5
        else:
            final_score = sum(weighted_scores) / total_weight
        
        # 判断信号方向
        if final_score >= 0.65:
            signal_type = SignalType.BUY
            strength = (final_score - 0.5) * 2  # 归一化到 0-1
        elif final_score <= 0.35:
            signal_type = SignalType.SELL
            strength = (0.5 - final_score) * 2  # 归一化到 0-1
        else:
            signal_type = SignalType.NEUTRAL
            strength = 0.0
        
        # 计算整体置信度（信号一致性）
        confidence = self._calculate_consistency(signals)
        
        # 获取资产类型（从第一个信号）
        asset_type = signals[0].asset_type if signals else 'unknown'
        
        return AggregatedSignal(
            ticker=ticker,
            asset_type=asset_type,
            signal_type=signal_type,
            strength=strength,
            confidence=confidence,
            timeframe=timeframe,
            contributing_signals=signals,
            final_score=final_score,
            timestamp=datetime.now()
        )
    
    def _majority_vote(
        self,
        signals: List[Signal],
        ticker: str,
        timeframe: str
    ) -> AggregatedSignal:
        """
        投票机制融合策略
        
        多数决：最多的信号类型获胜
        """
        
        # 统计投票
        votes = {
            SignalType.BUY: 0,
            SignalType.SELL: 0,
            SignalType.NEUTRAL: 0
        }
        
        for signal in signals:
            # 权重作为投票数
            votes[signal.signal_type] += signal.weight
        
        # 找出获胜者
        winner = max(votes, key=votes.get)
        
        # 计算强度（获胜比例）
        total_votes = sum(votes.values())
        strength = votes[winner] / total_votes if total_votes > 0 else 0.0
        
        # 置信度 = 一致性
        confidence = self._calculate_consistency(signals)
        
        asset_type = signals[0].asset_type if signals else 'unknown'
        
        return AggregatedSignal(
            ticker=ticker,
            asset_type=asset_type,
            signal_type=winner,
            strength=strength,
            confidence=confidence,
            timeframe=timeframe,
            contributing_signals=signals,
            final_score=strength,
            timestamp=datetime.now()
        )
    
    def _priority(
        self,
        signals: List[Signal],
        ticker: str,
        timeframe: str
    ) -> AggregatedSignal:
        """
        优先级融合策略
        
        选择置信度最高的信号
        """
        
        # 按置信度排序
        sorted_signals = sorted(signals, key=lambda s: s.confidence, reverse=True)
        top_signal = sorted_signals[0]
        
        asset_type = top_signal.asset_type
        
        return AggregatedSignal(
            ticker=ticker,
            asset_type=asset_type,
            signal_type=top_signal.signal_type,
            strength=top_signal.strength,
            confidence=top_signal.confidence,
            timeframe=timeframe,
            contributing_signals=signals,
            final_score=top_signal.score(),
            timestamp=datetime.now()
        )
    
    def _calculate_consistency(self, signals: List[Signal]) -> float:
        """
        计算信号一致性（作为整体置信度）
        
        一致性越高 = 所有信号方向一致 = 置信度越高
        """
        
        if len(signals) <= 1:
            return signals[0].confidence if signals else 0.5
        
        # 将信号转换为数值
        scores = []
        for signal in signals:
            if signal.signal_type == SignalType.BUY:
                scores.append(0.5 + signal.strength * 0.5)
            elif signal.signal_type == SignalType.SELL:
                scores.append(0.5 - signal.strength * 0.5)
            else:
                scores.append(0.5)
        
        # 计算方差（越小越一致）
        variance = np.var(scores)
        
        # 将方差转换为一致性分数（0-1）
        # 方差为0 = 完全一致 = 1.0
        # 方差大 = 不一致 = 接近0
        consistency = max(0, 1 - variance * 4)  # 经验公式
        
        # 结合平均置信度
        avg_confidence = np.mean([s.confidence for s in signals])
        
        # 最终置信度 = 一致性 * 平均置信度
        return consistency * avg_confidence
    
    def get_health(self) -> Dict[str, Any]:
        """返回所有信号源的健康状态"""
        
        health_status = {}
        
        for name, source in self.signal_sources.items():
            try:
                health = source.get_health()
                health_status[name] = health
            except Exception as e:
                health_status[name] = {
                    'status': 'error',
                    'details': str(e)
                }
        
        # 整体状态
        all_healthy = all(h['status'] == 'healthy' for h in health_status.values())
        any_down = any(h['status'] == 'down' for h in health_status.values())
        
        overall_status = 'healthy' if all_healthy else ('down' if any_down else 'degraded')
        
        return {
            'overall_status': overall_status,
            'sources': health_status,
            'num_sources': len(self.signal_sources),
            'timestamp': datetime.now().isoformat()
        }


if __name__ == "__main__":
    # 测试
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent))
    
    from signals.sentiment.sentiment_signal import SentimentSignal
    
    # 配置
    config = {
        'weights': {
            'sentiment': 1.0
        },
        'conflict_resolution': 'weighted_average'
    }
    
    # 创建融合器
    aggregator = SignalAggregator(config)
    
    # 注册情绪信号源
    sentiment_signal = SentimentSignal()
    aggregator.register_source('sentiment', sentiment_signal)
    
    # 测试融合
    print("Testing signal aggregation...")
    test_tickers = ['GOLD']
    
    for ticker in test_tickers:
        agg_signal = aggregator.aggregate(ticker)
        print(f"\n{agg_signal}")
        print(f"  Metadata from contributing signals:")
        for sig in agg_signal.contributing_signals:
            print(f"    - {sig.source}: {sig.metadata}")
    
    # 健康检查
    print("\nHealth check:")
    health = aggregator.get_health()
    print(f"  Overall: {health['overall_status']}")
    for source, status in health['sources'].items():
        print(f"  - {source}: {status['status']} - {status['details']}")
