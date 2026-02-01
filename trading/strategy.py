"""
Trading Strategy Manager

支持多种交易策略，每种策略有独立的：
- 信号要求
- 持仓时间
- 止损止盈规则
- 仓位大小
"""

from dataclasses import dataclass
from typing import Dict, Any, Optional
from enum import Enum


class StrategyType(Enum):
    """策略类型"""
    SENTIMENT_SHORT = "sentiment_short"      # 情绪短线（2-3天）
    SENTIMENT_SWING = "sentiment_swing"      # 情绪波段（5-7天）
    TECHNICAL_TREND = "technical_trend"      # 技术趋势（10-20天）
    FUNDAMENTAL = "fundamental"              # 基本面（30-90天）
    HIGH_FREQUENCY = "high_frequency"        # 高频（分钟-小时）


@dataclass
class TradingStrategy:
    """
    交易策略配置
    
    每个策略定义自己的规则和参数
    """
    
    # 必需字段（无默认值）
    name: str
    strategy_type: StrategyType
    min_confidence: float
    min_strength: float
    required_signal_sources: list
    max_hold_hours: int
    base_position_size: float
    stop_loss_pct: float
    take_profit_pct: float
    
    # 可选字段（有默认值）
    min_hold_hours: int = 1
    sizing_method: str = "fixed"
    use_trailing_stop: bool = False
    trailing_stop_activation: float = 0.15
    max_trades_per_day: int = 3
    min_signal_gap_hours: int = 4
    allowed_asset_types: list = None
    
    def __post_init__(self):
        if self.allowed_asset_types is None:
            self.allowed_asset_types = ['stock', 'crypto', 'option']
    
    def to_dict(self) -> dict:
        return {
            'name': self.name,
            'strategy_type': self.strategy_type.value,
            'min_confidence': self.min_confidence,
            'min_strength': self.min_strength,
            'max_hold_hours': self.max_hold_hours,
            'base_position_size': self.base_position_size,
            'stop_loss_pct': self.stop_loss_pct,
            'take_profit_pct': self.take_profit_pct
        }


class StrategyManager:
    """
    策略管理器
    
    管理多个交易策略，根据信号类型选择合适的策略
    """
    
    def __init__(self):
        self.strategies: Dict[str, TradingStrategy] = {}
        self.active_strategy = None
        
        # 注册默认策略
        self._register_default_strategies()
    
    def _register_default_strategies(self):
        """注册默认策略"""
        
        # ========== 策略 1: 情绪短线 ==========
        # 特点：快进快出，跟随热点
        sentiment_short = TradingStrategy(
            name="sentiment_short",
            strategy_type=StrategyType.SENTIMENT_SHORT,
            
            # 高要求：只做最明确的机会
            min_confidence=0.80,
            min_strength=0.70,
            required_signal_sources=['sentiment'],
            
            # 短持仓：48-72小时
            max_hold_hours=72,   # 3 days
            min_hold_hours=12,   # 至少持有12小时
            
            # 中等仓位
            base_position_size=800,
            sizing_method='fixed',
            
            # 紧止损，快止盈
            stop_loss_pct=0.08,      # -8%
            take_profit_pct=0.20,    # +20% (2.5:1 盈亏比)
            use_trailing_stop=True,
            trailing_stop_activation=0.12,  # 盈利12%后启动
            
            # 严格频率控制
            max_trades_per_day=2,
            min_signal_gap_hours=6,  # 6小时内不重复交易
            
            # 主要做加密货币（波动大，适合短线）
            allowed_asset_types=['crypto']
        )
        self.register_strategy(sentiment_short)
        
        # ========== 策略 2: 情绪波段 ==========
        # 特点：稍长周期，捕捉趋势
        sentiment_swing = TradingStrategy(
            name="sentiment_swing",
            strategy_type=StrategyType.SENTIMENT_SWING,
            
            # 中等要求
            min_confidence=0.75,
            min_strength=0.60,
            required_signal_sources=['sentiment'],
            
            # 中期持仓：5-7天
            max_hold_hours=168,  # 7 days
            min_hold_hours=24,
            
            # 较大仓位
            base_position_size=1200,
            sizing_method='kelly_conservative',
            
            # 宽止损，高止盈
            stop_loss_pct=0.12,     # -12%
            take_profit_pct=0.35,   # +35% (3:1 盈亏比)
            use_trailing_stop=True,
            
            # 中等频率
            max_trades_per_day=2,
            min_signal_gap_hours=12,
            
            # 股票和加密都可以
            allowed_asset_types=['stock', 'crypto']
        )
        self.register_strategy(sentiment_swing)
        
        # ========== 策略 3: 技术趋势（未来）==========
        technical_trend = TradingStrategy(
            name="technical_trend",
            strategy_type=StrategyType.TECHNICAL_TREND,
            
            min_confidence=0.70,
            min_strength=0.60,
            required_signal_sources=['technical', 'sentiment'],  # 需要两个信号
            
            # 长期持仓：10-20天
            max_hold_hours=480,  # 20 days
            min_hold_hours=48,
            
            base_position_size=1500,
            sizing_method='dynamic',
            
            stop_loss_pct=0.15,
            take_profit_pct=0.50,
            use_trailing_stop=True,
            
            max_trades_per_day=1,
            min_signal_gap_hours=24,
            
            allowed_asset_types=['stock', 'crypto']
        )
        self.register_strategy(technical_trend)
    
    def register_strategy(self, strategy: TradingStrategy):
        """注册策略"""
        self.strategies[strategy.name] = strategy
    
    def get_strategy(self, name: str) -> Optional[TradingStrategy]:
        """获取策略"""
        return self.strategies.get(name)
    
    def select_strategy(self, signal_sources: list, asset_type: str) -> Optional[TradingStrategy]:
        """
        根据信号来源和资产类型选择合适的策略
        
        Args:
            signal_sources: 信号来源列表 ['sentiment', 'technical', ...]
            asset_type: 资产类型 'stock', 'crypto', 'option'
        
        Returns:
            最匹配的策略，如果没有返回 None
        """
        
        candidates = []
        
        for strategy in self.strategies.values():
            # 检查资产类型
            if asset_type not in strategy.allowed_asset_types:
                continue
            
            # 检查信号源要求
            has_required = all(src in signal_sources for src in strategy.required_signal_sources)
            if not has_required:
                continue
            
            candidates.append(strategy)
        
        if not candidates:
            return None
        
        # 优先选择专门针对当前信号组合的策略
        # 简单实现：选第一个匹配的
        # TODO: 更复杂的选择逻辑
        return candidates[0]
    
    def get_active_strategies(self) -> list:
        """获取所有激活的策略"""
        return list(self.strategies.values())
    
    def get_strategy_summary(self) -> dict:
        """获取策略摘要"""
        return {
            'total_strategies': len(self.strategies),
            'strategies': {
                name: {
                    'type': s.strategy_type.value,
                    'max_hold_hours': s.max_hold_hours,
                    'base_size': s.base_position_size,
                    'min_confidence': s.min_confidence
                }
                for name, s in self.strategies.items()
            }
        }


if __name__ == "__main__":
    # 测试
    manager = StrategyManager()
    
    print("Available Strategies:")
    print("="*70)
    
    for name, strategy in manager.strategies.items():
        print(f"\n{strategy.name.upper()}")
        print(f"  Type: {strategy.strategy_type.value}")
        print(f"  Confidence: ≥{strategy.min_confidence:.0%}")
        print(f"  Hold Time: {strategy.min_hold_hours}h - {strategy.max_hold_hours}h")
        print(f"  Position Size: ${strategy.base_position_size}")
        print(f"  Stop Loss: {strategy.stop_loss_pct:.0%}")
        print(f"  Take Profit: {strategy.take_profit_pct:.0%}")
        print(f"  Asset Types: {', '.join(strategy.allowed_asset_types)}")
    
    print("\n" + "="*70)
    
    # 测试策略选择
    print("\nStrategy Selection Test:")
    
    test_cases = [
        (['sentiment'], 'crypto'),
        (['sentiment'], 'stock'),
        (['technical', 'sentiment'], 'stock')
    ]
    
    for sources, asset_type in test_cases:
        strategy = manager.select_strategy(sources, asset_type)
        if strategy:
            print(f"  {sources} + {asset_type} → {strategy.name}")
        else:
            print(f"  {sources} + {asset_type} → No matching strategy")
