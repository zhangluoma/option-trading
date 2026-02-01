"""
Position Tracker - 持仓追踪和监控

实时监控所有持仓：
1. 价格更新
2. 止损止盈检查
3. 持仓时间限制
4. 自动平仓
5. PnL 计算
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from dataclasses import dataclass

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from trading.base_trader import Position, PositionSide, BaseTrader

logger = logging.getLogger(__name__)


@dataclass
class PositionAlert:
    """持仓告警"""
    position_id: str
    ticker: str
    alert_type: str  # 'stop_loss', 'take_profit', 'time_limit', 'warning'
    message: str
    timestamp: datetime
    should_close: bool


class PositionTracker:
    """
    持仓追踪器
    
    功能：
    - 实时监控所有持仓
    - 检查止损止盈触发
    - 持仓时间限制
    - 移动止损管理
    - 自动平仓执行
    """
    
    def __init__(self, check_interval_seconds: int = 60):
        """
        Args:
            check_interval_seconds: 检查间隔（秒）
        """
        self.check_interval = check_interval_seconds
        self.traders: Dict[str, BaseTrader] = {}  # platform -> trader
        
        # 运行状态
        self.is_running = False
        self.monitor_task = None
        
        # 告警历史
        self.alerts: List[PositionAlert] = []
        
        # 统计
        self.stats = {
            'total_positions_monitored': 0,
            'auto_closed_positions': 0,
            'stop_loss_triggered': 0,
            'take_profit_triggered': 0,
            'time_limit_triggered': 0
        }
    
    def register_trader(self, platform: str, trader: BaseTrader):
        """注册交易平台"""
        self.traders[platform] = trader
        logger.info(f"Registered trader for monitoring: {platform}")
    
    async def start(self):
        """启动监控"""
        if self.is_running:
            logger.warning("Position tracker already running")
            return
        
        logger.info("Starting position tracker...")
        self.is_running = True
        
        # 启动监控任务
        self.monitor_task = asyncio.create_task(self._monitor_loop())
        
        logger.info(f"✅ Position tracker started (check interval: {self.check_interval}s)")
    
    async def stop(self):
        """停止监控"""
        logger.info("Stopping position tracker...")
        self.is_running = False
        
        if self.monitor_task:
            self.monitor_task.cancel()
            try:
                await self.monitor_task
            except asyncio.CancelledError:
                pass
        
        logger.info("Position tracker stopped")
    
    async def _monitor_loop(self):
        """主监控循环"""
        logger.info("Position monitoring loop started")
        
        while self.is_running:
            try:
                await self._check_all_positions()
                await asyncio.sleep(self.check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in monitor loop: {e}", exc_info=True)
                await asyncio.sleep(self.check_interval)
    
    async def _check_all_positions(self):
        """检查所有持仓"""
        
        for platform, trader in self.traders.items():
            try:
                # 获取该平台的所有持仓
                positions = await trader.get_all_positions()
                
                if not positions:
                    continue
                
                logger.debug(f"Checking {len(positions)} positions on {platform}")
                
                for position in positions:
                    self.stats['total_positions_monitored'] += 1
                    await self._check_position(position, trader, platform)
                    
            except Exception as e:
                logger.error(f"Error checking positions on {platform}: {e}")
    
    async def _check_position(self, position: Position, trader: BaseTrader, platform: str):
        """
        检查单个持仓
        
        检查项：
        1. 更新当前价格
        2. 止损触发？
        3. 止盈触发？
        4. 持仓时间超限？
        5. 移动止损更新
        """
        
        ticker = position.ticker
        
        try:
            # 1. 更新当前价格
            current_price = await trader.get_current_price(ticker)
            position.update_price(current_price)
            
            # 2. 检查止损
            if self._should_stop_loss(position):
                alert = PositionAlert(
                    position_id=position.position_id,
                    ticker=ticker,
                    alert_type='stop_loss',
                    message=f"Stop loss triggered: {position.unrealized_pnl_pct:.2%}",
                    timestamp=datetime.now(),
                    should_close=True
                )
                self.alerts.append(alert)
                logger.warning(f"🛑 {ticker}: {alert.message}")
                
                await self._close_position(position, trader, "Stop loss")
                self.stats['stop_loss_triggered'] += 1
                return
            
            # 3. 检查止盈
            if self._should_take_profit(position):
                alert = PositionAlert(
                    position_id=position.position_id,
                    ticker=ticker,
                    alert_type='take_profit',
                    message=f"Take profit triggered: {position.unrealized_pnl_pct:.2%}",
                    timestamp=datetime.now(),
                    should_close=True
                )
                self.alerts.append(alert)
                logger.info(f"✅ {ticker}: {alert.message}")
                
                await self._close_position(position, trader, "Take profit")
                self.stats['take_profit_triggered'] += 1
                return
            
            # 4. 检查持仓时间
            if self._is_time_limit_exceeded(position):
                alert = PositionAlert(
                    position_id=position.position_id,
                    ticker=ticker,
                    alert_type='time_limit',
                    message=f"Max hold time exceeded: {self._get_hold_duration_hours(position):.1f}h",
                    timestamp=datetime.now(),
                    should_close=True
                )
                self.alerts.append(alert)
                logger.warning(f"⏰ {ticker}: {alert.message}")
                
                await self._close_position(position, trader, "Time limit")
                self.stats['time_limit_triggered'] += 1
                return
            
            # 5. 移动止损更新（TODO）
            # self._update_trailing_stop(position)
            
            # 6. 定期日志
            if self.stats['total_positions_monitored'] % 10 == 0:
                logger.debug(
                    f"{ticker}: ${position.current_price:.2f} | "
                    f"PnL: ${position.unrealized_pnl:.2f} ({position.unrealized_pnl_pct:.2%}) | "
                    f"Hold: {self._get_hold_duration_hours(position):.1f}h"
                )
            
        except Exception as e:
            logger.error(f"Error checking position {ticker}: {e}")
    
    def _should_stop_loss(self, position: Position) -> bool:
        """检查是否触发止损"""
        
        if position.stop_loss is None:
            return False
        
        if position.side == PositionSide.LONG:
            # 多头：当前价 <= 止损价
            return position.current_price <= position.stop_loss
        else:  # SHORT
            # 空头：当前价 >= 止损价
            return position.current_price >= position.stop_loss
    
    def _should_take_profit(self, position: Position) -> bool:
        """检查是否触发止盈"""
        
        if position.take_profit is None:
            return False
        
        if position.side == PositionSide.LONG:
            # 多头：当前价 >= 止盈价
            return position.current_price >= position.take_profit
        else:  # SHORT
            # 空头：当前价 <= 止盈价
            return position.current_price <= position.take_profit
    
    def _is_time_limit_exceeded(self, position: Position) -> bool:
        """检查持仓时间是否超限"""
        
        # 从metadata获取最大持仓时间
        # TODO: 实际应该从策略配置读取
        max_hold_hours = 168  # 默认7天
        
        hold_duration = datetime.now() - position.opened_at
        return hold_duration > timedelta(hours=max_hold_hours)
    
    def _get_hold_duration_hours(self, position: Position) -> float:
        """获取持仓时间（小时）"""
        duration = datetime.now() - position.opened_at
        return duration.total_seconds() / 3600
    
    async def _close_position(self, position: Position, trader: BaseTrader, reason: str):
        """
        平仓
        
        Args:
            position: 持仓对象
            trader: 交易器
            reason: 平仓原因
        """
        
        ticker = position.ticker
        
        try:
            logger.info(f"Closing position: {ticker} (reason: {reason})")
            
            result = await trader.close_position(ticker)
            
            if result.success:
                logger.info(f"✅ Position closed: {ticker} | PnL: ${position.unrealized_pnl:.2f}")
                self.stats['auto_closed_positions'] += 1
                
                # TODO: 记录到数据库
                # TODO: 发送通知
            else:
                logger.error(f"❌ Failed to close position {ticker}: {result.message}")
                
        except Exception as e:
            logger.error(f"Error closing position {ticker}: {e}", exc_info=True)
    
    def get_stats(self) -> dict:
        """获取统计信息"""
        return {
            **self.stats,
            'is_running': self.is_running,
            'check_interval': self.check_interval,
            'recent_alerts': len([a for a in self.alerts if 
                                 (datetime.now() - a.timestamp).total_seconds() < 3600])
        }
    
    def get_recent_alerts(self, hours: int = 24) -> List[PositionAlert]:
        """获取最近的告警"""
        cutoff = datetime.now() - timedelta(hours=hours)
        return [a for a in self.alerts if a.timestamp > cutoff]


if __name__ == "__main__":
    # 测试
    import asyncio
    logging.basicConfig(level=logging.INFO)
    
    from trading.dydx_trader import dYdXTrader
    from trading.base_trader import Order, OrderSide, OrderType
    
    async def test_position_tracker():
        # 创建交易器
        config = {
            'paper_mode': True,
            'initial_balance': 10000.0
        }
        trader = dYdXTrader(config)
        await trader.connect()
        
        # 下一个测试单
        order = Order(
            ticker='BTC',
            side=OrderSide.BUY,
            size=1000,
            order_type=OrderType.MARKET,
            stop_loss=90000,
            take_profit=100000
        )
        
        result = await trader.place_order(order)
        print(f"Order placed: {result.message}")
        
        # 创建追踪器
        tracker = PositionTracker(check_interval_seconds=5)
        tracker.register_trader('dydx', trader)
        
        # 启动监控
        await tracker.start()
        
        print("\nMonitoring position for 20 seconds...")
        print("(Simulating price movement...)\n")
        
        # 运行一段时间
        await asyncio.sleep(20)
        
        # 停止监控
        await tracker.stop()
        
        # 显示统计
        stats = tracker.get_stats()
        print("\nTracker Stats:")
        print(f"  Total checks: {stats['total_positions_monitored']}")
        print(f"  Auto closed: {stats['auto_closed_positions']}")
        print(f"  Stop loss: {stats['stop_loss_triggered']}")
        print(f"  Take profit: {stats['take_profit_triggered']}")
        
        # 清理
        await trader.disconnect()
    
    asyncio.run(test_position_tracker())
