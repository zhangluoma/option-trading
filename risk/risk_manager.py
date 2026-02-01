"""
Risk Manager - 风险管理器

事前风险检查，确保每笔交易符合风险限制
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from signals.base import AggregatedSignal, SignalType

logger = logging.getLogger(__name__)


@dataclass
class RiskCheck:
    """风险检查结果"""
    approved: bool
    approved_size: float
    stop_loss: Optional[float]
    take_profit: Optional[float]
    max_loss: float
    reason: str
    
    @classmethod
    def rejected(cls, reason: str) -> 'RiskCheck':
        """创建一个拒绝的风险检查结果"""
        return cls(
            approved=False,
            approved_size=0.0,
            stop_loss=None,
            take_profit=None,
            max_loss=0.0,
            reason=reason
        )
    
    @classmethod
    def approved_trade(
        cls,
        size: float,
        stop_loss: float,
        take_profit: float,
        max_loss: float
    ) -> 'RiskCheck':
        """创建一个批准的风险检查结果"""
        return cls(
            approved=True,
            approved_size=size,
            stop_loss=stop_loss,
            take_profit=take_profit,
            max_loss=max_loss,
            reason="All checks passed"
        )


class RiskManager:
    """
    风险管理器
    
    执行多层风险检查：
    1. 账户余额检查
    2. 持仓数量限制
    3. 单笔风险限制
    4. 总敞口限制
    5. 重复持仓检查
    6. 交易时间检查
    """
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        
        # 资金管理
        self.max_open_positions = config.get('max_open_positions', 4)
        self.max_risk_per_trade = config.get('max_risk_per_trade', 500)
        self.max_loss_per_trade_pct = config.get('max_loss_per_trade_pct', 0.10)
        self.max_total_exposure_pct = config.get('max_total_exposure_pct', 0.50)
        
        # 止损止盈
        self.max_stop_loss_pct = config.get('max_stop_loss_pct', 0.12)
        self.min_stop_loss_pct = config.get('min_stop_loss_pct', 0.05)
        self.risk_reward_ratio = config.get('risk_reward_ratio', 3.0)
        
        # 持仓管理
        self.max_hold_time_hours = config.get('max_hold_time_hours', 168)  # 7 days
        
        # 账户保护
        self.daily_loss_limit = config.get('daily_loss_limit', 1000)
        self.weekly_loss_limit = config.get('weekly_loss_limit', 2000)
        
        # 需要注入的依赖
        self.position_tracker = None  # 将来注入
        self.account_info_provider = None  # 将来注入
    
    async def check_trade(
        self,
        ticker: str,
        signal: AggregatedSignal,
        proposed_size: float
    ) -> RiskCheck:
        """
        交易前风险检查
        
        Args:
            ticker: 标的代码
            signal: 融合信号
            proposed_size: 建议仓位大小（美元）
        
        Returns:
            RiskCheck 对象
        """
        
        # 获取账户信息（目前使用模拟数据）
        account = await self._get_account_summary()
        
        # 1. 余额检查
        if account['available_cash'] < proposed_size:
            return RiskCheck.rejected(
                f"Insufficient cash: ${account['available_cash']:.0f} < ${proposed_size:.0f}"
            )
        
        # 2. 持仓数量检查
        if account['num_positions'] >= self.max_open_positions:
            return RiskCheck.rejected(
                f"Max positions reached: {account['num_positions']}/{self.max_open_positions}"
            )
        
        # 3. 单笔风险检查
        max_loss = proposed_size * self.max_loss_per_trade_pct
        if max_loss > self.max_risk_per_trade:
            return RiskCheck.rejected(
                f"Risk ${max_loss:.0f} exceeds limit ${self.max_risk_per_trade}"
            )
        
        # 4. 总敞口检查
        total_exposure = account['total_position_value'] + proposed_size
        max_exposure = account['total_equity'] * self.max_total_exposure_pct
        
        if total_exposure > max_exposure:
            return RiskCheck.rejected(
                f"Total exposure ${total_exposure:.0f} exceeds ${max_exposure:.0f}"
            )
        
        # 5. 重复持仓检查
        if ticker in account['open_tickers']:
            return RiskCheck.rejected(f"Already holding {ticker}")
        
        # 6. 交易时间检查（TODO: 实现真实检查）
        # if not self._is_trading_hours(ticker):
        #     return RiskCheck.rejected("Outside trading hours")
        
        # 7. 每日亏损限制检查
        if account['daily_pnl'] < -self.daily_loss_limit:
            return RiskCheck.rejected(
                f"Daily loss limit reached: ${account['daily_pnl']:.0f}"
            )
        
        # 计算止损止盈
        current_price = 100.0  # TODO: 获取真实价格
        stop_loss = self._calculate_stop_loss(signal, current_price)
        take_profit = self._calculate_take_profit(signal, current_price, stop_loss)
        
        # 批准交易
        return RiskCheck.approved_trade(
            size=proposed_size,
            stop_loss=stop_loss,
            take_profit=take_profit,
            max_loss=max_loss
        )
    
    def _calculate_stop_loss(self, signal: AggregatedSignal, current_price: float) -> float:
        """
        计算止损价格
        
        策略：
        - 根据信号强度动态调整止损距离
        - 强信号 = 更宽的止损（给更多空间）
        - 弱信号 = 更紧的止损（快速退出）
        """
        
        # 基础止损百分比（根据信号强度调整）
        base_stop_pct = self.min_stop_loss_pct
        
        # 信号越强，止损可以放宽一点
        adjusted_stop_pct = base_stop_pct + (self.max_stop_loss_pct - base_stop_pct) * (1 - signal.strength)
        
        # 确保在限制范围内
        stop_pct = max(self.min_stop_loss_pct, min(adjusted_stop_pct, self.max_stop_loss_pct))
        
        logger.debug(f"Stop loss: {stop_pct:.1%} for signal strength {signal.strength:.2f}")
        
        if signal.signal_type == SignalType.BUY:
            return current_price * (1 - stop_pct)
        else:  # SELL
            return current_price * (1 + stop_pct)
    
    def _calculate_take_profit(
        self,
        signal: AggregatedSignal,
        current_price: float,
        stop_loss: float
    ) -> float:
        """
        计算止盈价格
        
        策略：风险回报比（默认 3:1）
        """
        
        risk = abs(current_price - stop_loss)
        reward = risk * self.risk_reward_ratio
        
        if signal.signal_type == SignalType.BUY:
            return current_price + reward
        else:  # SELL
            return current_price - reward
    
    async def _get_account_summary(self) -> dict:
        """
        获取账户摘要
        
        TODO: 从 position_tracker 获取真实数据
        目前返回模拟数据
        """
        
        # 模拟账户数据
        return {
            'total_equity': 7000.0,
            'available_cash': 6000.0,
            'total_position_value': 1000.0,
            'unrealized_pnl': 50.0,
            'num_positions': 1,
            'open_tickers': ['GOLD'],
            'daily_pnl': -100.0
        }
    
    def _is_trading_hours(self, ticker: str) -> bool:
        """
        检查是否在交易时间内
        
        TODO: 实现真实检查
        - 美股：9:30-16:00 ET
        - 加密货币：24/7
        """
        return True


if __name__ == "__main__":
    # 测试
    import asyncio
    logging.basicConfig(level=logging.DEBUG)
    
    config = {
        'max_open_positions': 4,
        'max_risk_per_trade': 500,
        'max_loss_per_trade_pct': 0.10,
        'max_total_exposure_pct': 0.50,
        'risk_reward_ratio': 3.0
    }
    
    risk_manager = RiskManager(config)
    
    # 模拟信号
    from signals.base import Signal, SignalType
    
    signal = AggregatedSignal(
        ticker='AAPL',
        asset_type='stock',
        signal_type=SignalType.BUY,
        strength=0.80,
        confidence=0.75,
        timeframe='1h',
        contributing_signals=[],
        final_score=0.77,
        timestamp=datetime.now()
    )
    
    async def test():
        result = await risk_manager.check_trade('AAPL', signal, 1000)
        print(f"\nRisk check result:")
        print(f"  Approved: {result.approved}")
        print(f"  Reason: {result.reason}")
        if result.approved:
            print(f"  Size: ${result.approved_size:.0f}")
            print(f"  Stop Loss: ${result.stop_loss:.2f}")
            print(f"  Take Profit: ${result.take_profit:.2f}")
            print(f"  Max Loss: ${result.max_loss:.2f}")
    
    asyncio.run(test())
