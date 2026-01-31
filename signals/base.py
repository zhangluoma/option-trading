"""
Base classes for signal sources
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from datetime import datetime
from enum import Enum
from typing import Dict, Any, Optional


class SignalType(Enum):
    """信号类型"""
    BUY = "BUY"
    SELL = "SELL"
    NEUTRAL = "NEUTRAL"
    CLOSE = "CLOSE"


@dataclass
class Signal:
    """标准化信号对象"""
    ticker: str
    asset_type: str  # 'stock', 'crypto', 'option'
    signal_type: SignalType
    strength: float  # 0-1, 信号强度
    confidence: float  # 0-1, 信号置信度
    timeframe: str  # '1h', '4h', '1d', 'swing'
    source: str  # 'sentiment', 'technical', 'fundamental', etc.
    metadata: Dict[str, Any]  # 额外信息
    timestamp: datetime
    weight: float = 1.0  # 用于信号融合时的权重
    
    def score(self) -> float:
        """
        综合得分 = strength * confidence
        
        Returns:
            0-1 之间的得分
        """
        return self.strength * self.confidence
    
    def to_dict(self) -> dict:
        """序列化为字典"""
        data = asdict(self)
        data['signal_type'] = self.signal_type.value
        data['timestamp'] = self.timestamp.isoformat()
        return data
    
    @classmethod
    def from_dict(cls, data: dict) -> 'Signal':
        """从字典反序列化"""
        data = data.copy()
        data['signal_type'] = SignalType(data['signal_type'])
        data['timestamp'] = datetime.fromisoformat(data['timestamp'])
        return cls(**data)
    
    def __repr__(self) -> str:
        return (
            f"Signal({self.ticker} {self.signal_type.value} "
            f"strength={self.strength:.2f} confidence={self.confidence:.2f} "
            f"source={self.source})"
        )


@dataclass
class AggregatedSignal:
    """融合后的信号"""
    ticker: str
    asset_type: str
    signal_type: SignalType
    strength: float  # 0-1
    confidence: float  # 0-1
    timeframe: str
    contributing_signals: list  # List[Signal]
    final_score: float
    timestamp: datetime
    
    @classmethod
    def neutral(cls, ticker: str = "", asset_type: str = "") -> 'AggregatedSignal':
        """创建一个中性信号"""
        return cls(
            ticker=ticker,
            asset_type=asset_type,
            signal_type=SignalType.NEUTRAL,
            strength=0.0,
            confidence=0.5,
            timeframe='',
            contributing_signals=[],
            final_score=0.5,
            timestamp=datetime.now()
        )
    
    def __repr__(self) -> str:
        return (
            f"AggregatedSignal({self.ticker} {self.signal_type.value} "
            f"score={self.final_score:.2f} confidence={self.confidence:.2f} "
            f"from {len(self.contributing_signals)} signals)"
        )


class BaseSignal(ABC):
    """所有信号源的基类"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.name = self.__class__.__name__
    
    @abstractmethod
    def get_signal(self, ticker: str, timeframe: str = '1h') -> Signal:
        """
        获取指定标的的信号
        
        Args:
            ticker: 股票代码或加密货币符号
            timeframe: 时间框架 ('1h', '4h', '1d', etc.)
        
        Returns:
            Signal 对象
        """
        pass
    
    @abstractmethod
    def validate(self) -> bool:
        """
        验证信号源是否可用
        
        Returns:
            True 如果信号源正常工作
        """
        pass
    
    @abstractmethod
    def get_health(self) -> dict:
        """
        返回信号源健康状态
        
        Returns:
            {
                'status': 'healthy' | 'degraded' | 'down',
                'last_update': datetime,
                'error_count': int,
                'details': str
            }
        """
        pass
    
    def __repr__(self) -> str:
        return f"{self.name}()"
