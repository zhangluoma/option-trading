"""
Trading Engine - 交易决策引擎

核心职责：
1. 接收融合信号
2. 检查策略条件
3. 执行风险检查
4. 下单执行
5. 记录交易
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from signals.base import SignalType, AggregatedSignal
from signals.aggregator import SignalAggregator
from trading.base_trader import BaseTrader, Order, OrderSide, OrderType, OrderResult
from risk.risk_manager import RiskManager, RiskCheck

logger = logging.getLogger(__name__)


class TradingEngine:
    """
    交易决策引擎
    
    整合信号管理、风险控制、订单执行
    """
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        
        # 核心组件
        self.signal_aggregator = None  # 需要外部注入
        self.risk_manager = None  # 需要外部注入
        self.traders = {}  # platform_name -> BaseTrader
        
        # 策略配置
        self.strategy = config.get('strategy', {})
        self.min_confidence = self.strategy.get('min_confidence', 0.75)
        self.min_strength = self.strategy.get('min_strength', 0.60)
        
        # 仓位计算
        self.base_position_size = self.strategy.get('base_position_size', 1000)
        self.sizing_method = self.strategy.get('sizing_method', 'fixed')
        
        # 平台选择规则
        self.platform_rules = self.strategy.get('platform_rules', {
            'crypto': 'dydx',
            'stock': 'ibkr',
            'option': 'ibkr'
        })
        
        # 运行状态
        self.is_running = False
        self.last_check_time = None
    
    def set_signal_aggregator(self, aggregator: SignalAggregator):
        """注入信号聚合器"""
        self.signal_aggregator = aggregator
    
    def set_risk_manager(self, risk_manager: RiskManager):
        """注入风险管理器"""
        self.risk_manager = risk_manager
    
    def register_trader(self, platform: str, trader: BaseTrader):
        """注册交易平台"""
        self.traders[platform] = trader
        logger.info(f"Registered trader: {platform} ({trader})")
    
    async def start(self):
        """启动交易引擎"""
        logger.info("Starting trading engine...")
        
        # 连接所有交易平台
        for platform, trader in self.traders.items():
            try:
                success = await trader.connect()
                if success:
                    logger.info(f"Connected to {platform}")
                else:
                    logger.error(f"Failed to connect to {platform}")
            except Exception as e:
                logger.error(f"Error connecting to {platform}: {e}")
        
        self.is_running = True
        logger.info("Trading engine started ✅")
    
    async def stop(self):
        """停止交易引擎"""
        logger.info("Stopping trading engine...")
        
        self.is_running = False
        
        # 断开所有平台连接
        for platform, trader in self.traders.items():
            try:
                await trader.disconnect()
                logger.info(f"Disconnected from {platform}")
            except Exception as e:
                logger.error(f"Error disconnecting from {platform}: {e}")
        
        logger.info("Trading engine stopped")
    
    async def process_ticker(self, ticker: str, asset_type: str = 'stock'):
        """
        处理单个标的的交易逻辑
        
        Args:
            ticker: 股票代码或加密货币
            asset_type: 'stock', 'crypto', 'option'
        """
        
        if not self.is_running:
            logger.warning("Trading engine not running")
            return
        
        try:
            # 1. 获取融合信号
            signal = self.signal_aggregator.aggregate(
                ticker=ticker,
                timeframe=self.strategy.get('timeframe', '1h')
            )
            
            logger.info(f"{ticker}: {signal}")
            
            # 2. 检查信号是否满足策略要求
            if not self._meets_strategy_criteria(signal):
                logger.debug(f"{ticker}: Signal does not meet strategy criteria")
                return
            
            # 3. 检查是否已有持仓
            platform = self._select_platform(asset_type)
            trader = self.traders.get(platform)
            
            if not trader:
                logger.error(f"No trader available for platform: {platform}")
                return
            
            existing_position = await trader.get_position(ticker)
            if existing_position:
                logger.info(f"{ticker}: Already have position, skipping")
                return
            
            # 4. 计算仓位大小
            proposed_size = self._calculate_position_size(signal)
            
            # 5. 风险检查
            risk_check = await self.risk_manager.check_trade(
                ticker=ticker,
                signal=signal,
                proposed_size=proposed_size
            )
            
            if not risk_check.approved:
                logger.warning(f"{ticker}: Risk check failed - {risk_check.reason}")
                return
            
            # 6. 执行交易
            await self._execute_trade(
                ticker=ticker,
                signal=signal,
                risk_check=risk_check,
                trader=trader
            )
            
        except Exception as e:
            logger.error(f"Error processing {ticker}: {e}", exc_info=True)
    
    def _meets_strategy_criteria(self, signal: AggregatedSignal) -> bool:
        """检查信号是否符合策略条件"""
        
        # 最低置信度
        if signal.confidence < self.min_confidence:
            logger.debug(f"Confidence {signal.confidence:.2f} < {self.min_confidence}")
            return False
        
        # 最低强度
        if signal.strength < self.min_strength:
            logger.debug(f"Strength {signal.strength:.2f} < {self.min_strength}")
            return False
        
        # 必须有明确方向
        if signal.signal_type == SignalType.NEUTRAL:
            logger.debug("Signal is NEUTRAL")
            return False
        
        return True
    
    def _calculate_position_size(self, signal: AggregatedSignal) -> float:
        """
        根据信号强度和置信度计算仓位大小
        
        支持多种sizing方法：
        - fixed: 固定大小
        - kelly: 凯利公式
        - kelly_conservative: 保守凯利（1/4）
        """
        
        base_size = self.base_position_size
        
        if self.sizing_method == 'fixed':
            return base_size
        
        elif self.sizing_method == 'kelly':
            # 凯利公式：f = (bp - q) / b
            # 简化版：f = confidence * strength
            kelly_fraction = signal.confidence * signal.strength
            return base_size * kelly_fraction
        
        elif self.sizing_method == 'kelly_conservative':
            # 保守凯利：只用1/4的推荐仓位
            kelly_fraction = signal.confidence * signal.strength * 0.25
            return base_size * kelly_fraction
        
        else:
            logger.warning(f"Unknown sizing method: {self.sizing_method}, using fixed")
            return base_size
    
    def _select_platform(self, asset_type: str) -> str:
        """根据资产类型选择交易平台"""
        return self.platform_rules.get(asset_type, 'dydx')
    
    async def _execute_trade(
        self,
        ticker: str,
        signal: AggregatedSignal,
        risk_check: RiskCheck,
        trader: BaseTrader
    ):
        """
        执行交易
        
        Args:
            ticker: 标的代码
            signal: 融合信号
            risk_check: 风险检查结果
            trader: 交易器实例
        """
        
        # 构建订单
        order = Order(
            ticker=ticker,
            side=OrderSide.BUY if signal.signal_type == SignalType.BUY else OrderSide.SELL,
            size=risk_check.approved_size,
            order_type=OrderType.MARKET,
            stop_loss=risk_check.stop_loss,
            take_profit=risk_check.take_profit,
            signal_id=None,  # TODO: 从数据库获取signal_id
            metadata={
                'signal_strength': signal.strength,
                'signal_confidence': signal.confidence,
                'final_score': signal.final_score
            }
        )
        
        logger.info(f"Placing order: {order.to_dict()}")
        
        try:
            # 提交订单
            result = await trader.place_order(order)
            
            if result.success:
                logger.info(f"✅ Order filled: {ticker} {order.side.value} {result.filled_size} @ ${result.filled_price:.2f}")
                
                # 记录交易到数据库
                await self._log_trade(signal, order, result)
                
                # 发送通知
                await self._notify_trade(ticker, signal, order, result)
            else:
                logger.error(f"❌ Order failed: {result.message}")
                
        except Exception as e:
            logger.error(f"Failed to execute trade for {ticker}: {e}", exc_info=True)
            await self._handle_execution_failure(ticker, signal, e)
    
    async def _log_trade(self, signal: AggregatedSignal, order: Order, result: OrderResult):
        """记录交易到数据库"""
        # TODO: 实现数据库记录
        logger.info(f"Logging trade to database... (TODO)")
    
    async def _notify_trade(
        self,
        ticker: str,
        signal: AggregatedSignal,
        order: Order,
        result: OrderResult
    ):
        """发送交易通知（WhatsApp）"""
        # TODO: 实现通知
        logger.info(f"Sending trade notification... (TODO)")
    
    async def _handle_execution_failure(
        self,
        ticker: str,
        signal: AggregatedSignal,
        error: Exception
    ):
        """处理执行失败"""
        logger.error(f"Trade execution failed for {ticker}: {error}")
        # TODO: 记录到数据库，发送告警


if __name__ == "__main__":
    # 简单测试
    logging.basicConfig(level=logging.INFO)
    
    config = {
        'strategy': {
            'min_confidence': 0.70,
            'min_strength': 0.50,
            'base_position_size': 1000,
            'sizing_method': 'fixed',
            'platform_rules': {
                'crypto': 'dydx',
                'stock': 'ibkr'
            }
        }
    }
    
    engine = TradingEngine(config)
    print(f"Created {engine}")
    print(f"Min confidence: {engine.min_confidence}")
    print(f"Min strength: {engine.min_strength}")
