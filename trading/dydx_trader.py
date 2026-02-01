"""
dYdX Trader - 加密货币永续合约交易器

当前版本：纸上交易（Paper Trading）
不会执行真实交易，只记录和模拟
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List
import random

from trading.base_trader import (
    BaseTrader, Order, OrderResult, Position, AccountInfo,
    OrderSide, OrderType, OrderStatus, PositionSide
)

logger = logging.getLogger(__name__)


class dYdXTrader(BaseTrader):
    """
    dYdX v4 交易器
    
    功能：
    - 永续合约交易
    - 多空双向
    - 杠杆支持（2-5x）
    
    当前模式：PAPER TRADING
    """
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        
        # 纸上交易配置
        self.paper_mode = config.get('paper_mode', True)
        self.initial_balance = config.get('initial_balance', 10000.0)
        
        # 模拟账户
        self.balance = self.initial_balance
        self.positions = {}  # ticker -> Position
        self.orders_history = []
        
        # dYdX 配置
        self.max_leverage = config.get('max_leverage', 5.0)
        self.default_leverage = config.get('default_leverage', 2.0)
        
        # 模拟价格（真实版本会从 API 获取）
        self.mock_prices = {
            'BTC': 95000.0,
            'ETH': 3200.0,
            'SOL': 180.0,
            'DOGE': 0.35
        }
    
    async def connect(self) -> bool:
        """连接到 dYdX"""
        logger.info("Connecting to dYdX (Paper Mode)...")
        
        if self.paper_mode:
            logger.info("✅ Paper trading mode - no real API connection")
            self.is_connected = True
            return True
        
        # TODO: 真实 API 连接
        # from dydx_v4_client import Client
        # self.client = Client(...)
        
        return False
    
    async def disconnect(self):
        """断开连接"""
        logger.info("Disconnecting from dYdX...")
        self.is_connected = False
    
    async def place_order(self, order: Order) -> OrderResult:
        """
        下单
        
        纸上交易：模拟市价立即成交
        """
        
        if not self.is_connected:
            return OrderResult(
                success=False,
                order_id=None,
                filled_size=0.0,
                filled_price=0.0,
                status=OrderStatus.REJECTED,
                message="Not connected",
                timestamp=datetime.now()
            )
        
        # 验证订单
        is_valid, error = self.validate_order(order)
        if not is_valid:
            return OrderResult(
                success=False,
                order_id=None,
                filled_size=0.0,
                filled_price=0.0,
                status=OrderStatus.REJECTED,
                message=error,
                timestamp=datetime.now()
            )
        
        # 获取当前价格
        current_price = await self.get_current_price(order.ticker)
        
        # 模拟滑点（0.05%）
        slippage = 0.0005
        if order.side == OrderSide.BUY:
            fill_price = current_price * (1 + slippage)
        else:
            fill_price = current_price * (1 - slippage)
        
        # 计算合约数量（加密货币通常以币数量计算）
        # 这里简化为：size(USD) / price = quantity(coins)
        quantity = order.size / fill_price
        
        # 检查余额
        required_margin = order.size / self.default_leverage
        if self.balance < required_margin:
            return OrderResult(
                success=False,
                order_id=None,
                filled_size=0.0,
                filled_price=0.0,
                status=OrderStatus.REJECTED,
                message=f"Insufficient margin: ${self.balance:.2f} < ${required_margin:.2f}",
                timestamp=datetime.now()
            )
        
        # 生成订单ID
        order_id = f"dydx_{int(datetime.now().timestamp() * 1000)}"
        
        # 扣除保证金
        self.balance -= required_margin
        
        # 创建持仓
        position = Position(
            ticker=order.ticker,
            side=PositionSide.LONG if order.side == OrderSide.BUY else PositionSide.SHORT,
            size=quantity,
            entry_price=fill_price,
            current_price=fill_price,
            stop_loss=order.stop_loss,
            take_profit=order.take_profit,
            position_id=order_id,
            signal_id=order.signal_id,
            opened_at=datetime.now(),
            last_updated=datetime.now()
        )
        
        self.positions[order.ticker] = position
        
        # 创建订单结果
        result = OrderResult(
            success=True,
            order_id=order_id,
            filled_size=quantity,
            filled_price=fill_price,
            status=OrderStatus.FILLED,
            message=f"Filled {quantity:.4f} {order.ticker} @ ${fill_price:.2f}",
            timestamp=datetime.now(),
            commission=order.size * 0.0005,  # 0.05% 手续费
            slippage=abs(fill_price - current_price)
        )
        
        self.orders_history.append(result)
        
        logger.info(f"✅ Order filled: {result.message}")
        
        return result
    
    async def cancel_order(self, order_id: str) -> bool:
        """撤单（纸上交易不需要）"""
        logger.info(f"Cancel order {order_id} (no-op in paper mode)")
        return True
    
    async def get_order_status(self, order_id: str) -> OrderStatus:
        """查询订单状态（纸上交易都是立即成交）"""
        return OrderStatus.FILLED
    
    async def get_position(self, ticker: str) -> Optional[Position]:
        """获取持仓"""
        return self.positions.get(ticker)
    
    async def get_all_positions(self) -> List[Position]:
        """获取所有持仓"""
        return list(self.positions.values())
    
    async def close_position(self, ticker: str, size: Optional[float] = None) -> OrderResult:
        """
        平仓
        
        Args:
            ticker: 标的代码
            size: 平仓数量（None = 全部）
        """
        
        position = self.positions.get(ticker)
        if not position:
            return OrderResult(
                success=False,
                order_id=None,
                filled_size=0.0,
                filled_price=0.0,
                status=OrderStatus.REJECTED,
                message=f"No position found for {ticker}",
                timestamp=datetime.now()
            )
        
        # 获取当前价格
        current_price = await self.get_current_price(ticker)
        position.update_price(current_price)
        
        # 计算盈亏
        pnl = position.unrealized_pnl
        
        # 释放保证金
        margin = (position.size * position.entry_price) / self.default_leverage
        self.balance += margin + pnl
        
        # 移除持仓
        del self.positions[ticker]
        
        logger.info(f"✅ Position closed: {ticker} PnL: ${pnl:.2f}")
        
        return OrderResult(
            success=True,
            order_id=f"close_{ticker}_{int(datetime.now().timestamp())}",
            filled_size=position.size,
            filled_price=current_price,
            status=OrderStatus.FILLED,
            message=f"Closed {ticker} position, PnL: ${pnl:.2f}",
            timestamp=datetime.now()
        )
    
    async def get_account_info(self) -> AccountInfo:
        """获取账户信息"""
        
        # 计算持仓价值和未实现盈亏
        positions_value = 0.0
        unrealized_pnl = 0.0
        
        for position in self.positions.values():
            current_price = await self.get_current_price(position.ticker)
            position.update_price(current_price)
            
            positions_value += position.current_value
            unrealized_pnl += position.unrealized_pnl
        
        # 总权益 = 余额 + 未实现盈亏
        total_equity = self.balance + unrealized_pnl
        
        return AccountInfo(
            total_equity=total_equity,
            available_cash=self.balance,
            used_margin=positions_value / self.default_leverage,
            positions_value=positions_value,
            unrealized_pnl=unrealized_pnl,
            leverage=self.default_leverage
        )
    
    async def get_current_price(self, ticker: str) -> float:
        """
        获取当前价格
        
        纸上交易：返回模拟价格 + 随机波动
        真实版本：从 dYdX API 获取
        """
        
        base_price = self.mock_prices.get(ticker, 100.0)
        
        # 添加随机波动 (-0.1% to +0.1%)
        volatility = random.uniform(-0.001, 0.001)
        current_price = base_price * (1 + volatility)
        
        return current_price
    
    def get_trading_summary(self) -> dict:
        """获取交易摘要（用于回测分析）"""
        
        total_trades = len(self.orders_history)
        filled_trades = [o for o in self.orders_history if o.status == OrderStatus.FILLED]
        
        return {
            'initial_balance': self.initial_balance,
            'current_balance': self.balance,
            'total_trades': total_trades,
            'filled_trades': len(filled_trades),
            'open_positions': len(self.positions),
            'total_commission': sum(o.commission for o in filled_trades),
            'net_pnl': self.balance - self.initial_balance
        }


if __name__ == "__main__":
    # 测试
    import asyncio
    logging.basicConfig(level=logging.INFO)
    
    async def test_dydx_trader():
        config = {
            'paper_mode': True,
            'initial_balance': 10000.0,
            'default_leverage': 2.0
        }
        
        trader = dYdXTrader(config)
        
        # 连接
        await trader.connect()
        
        # 获取账户信息
        account = await trader.get_account_info()
        print(f"\nAccount Info:")
        print(f"  Balance: ${account.total_equity:.2f}")
        print(f"  Available: ${account.available_cash:.2f}")
        
        # 下单买入 BTC
        order = Order(
            ticker='BTC',
            side=OrderSide.BUY,
            size=1000.0,  # $1000
            order_type=OrderType.MARKET,
            stop_loss=90000.0,
            take_profit=105000.0
        )
        
        result = await trader.place_order(order)
        print(f"\nOrder Result:")
        print(f"  Success: {result.success}")
        print(f"  Message: {result.message}")
        
        # 查看持仓
        position = await trader.get_position('BTC')
        if position:
            print(f"\nPosition:")
            print(f"  Size: {position.size:.4f} BTC")
            print(f"  Entry: ${position.entry_price:.2f}")
            print(f"  Current: ${position.current_price:.2f}")
            print(f"  PnL: ${position.unrealized_pnl:.2f}")
        
        # 模拟价格变化
        await asyncio.sleep(1)
        
        # 平仓
        close_result = await trader.close_position('BTC')
        print(f"\nClose Position:")
        print(f"  Message: {close_result.message}")
        
        # 交易摘要
        summary = trader.get_trading_summary()
        print(f"\nTrading Summary:")
        print(f"  Initial: ${summary['initial_balance']:.2f}")
        print(f"  Final: ${summary['current_balance']:.2f}")
        print(f"  Net PnL: ${summary['net_pnl']:.2f}")
        print(f"  Total trades: {summary['total_trades']}")
        
        await trader.disconnect()
    
    asyncio.run(test_dydx_trader())
