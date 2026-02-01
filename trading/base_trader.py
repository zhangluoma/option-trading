"""
Base Trader Interface

所有交易执行器的抽象基类
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Dict, Any, Optional, List


class OrderSide(Enum):
    """订单方向"""
    BUY = "BUY"
    SELL = "SELL"


class OrderType(Enum):
    """订单类型"""
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    STOP_LOSS = "STOP_LOSS"
    TAKE_PROFIT = "TAKE_PROFIT"


class OrderStatus(Enum):
    """订单状态"""
    PENDING = "PENDING"
    FILLED = "FILLED"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"


class PositionSide(Enum):
    """持仓方向"""
    LONG = "LONG"
    SHORT = "SHORT"


@dataclass
class Order:
    """订单对象"""
    ticker: str
    side: OrderSide
    size: float  # 数量
    order_type: OrderType
    price: Optional[float] = None  # LIMIT 订单需要
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    time_in_force: str = "GTC"  # GTC, IOC, FOK
    
    # 元数据
    signal_id: Optional[int] = None
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}
    
    def to_dict(self) -> dict:
        return {
            'ticker': self.ticker,
            'side': self.side.value,
            'size': self.size,
            'order_type': self.order_type.value,
            'price': self.price,
            'stop_loss': self.stop_loss,
            'take_profit': self.take_profit,
            'time_in_force': self.time_in_force,
            'signal_id': self.signal_id,
            'metadata': self.metadata
        }


@dataclass
class OrderResult:
    """订单执行结果"""
    success: bool
    order_id: Optional[str]
    filled_size: float
    filled_price: float
    status: OrderStatus
    message: str
    timestamp: datetime
    
    # 费用
    commission: float = 0.0
    slippage: float = 0.0
    
    def to_dict(self) -> dict:
        return {
            'success': self.success,
            'order_id': self.order_id,
            'filled_size': self.filled_size,
            'filled_price': self.filled_price,
            'status': self.status.value,
            'message': self.message,
            'timestamp': self.timestamp.isoformat(),
            'commission': self.commission,
            'slippage': self.slippage
        }


@dataclass
class Position:
    """持仓对象"""
    ticker: str
    side: PositionSide
    size: float
    entry_price: float
    current_price: float
    
    # 风控
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    
    # 时间
    opened_at: datetime = None
    last_updated: datetime = None
    
    # 元数据
    position_id: Optional[str] = None
    signal_id: Optional[int] = None
    
    def __post_init__(self):
        if self.opened_at is None:
            self.opened_at = datetime.now()
        if self.last_updated is None:
            self.last_updated = datetime.now()
    
    @property
    def current_value(self) -> float:
        """当前持仓价值"""
        return self.size * self.current_price
    
    @property
    def unrealized_pnl(self) -> float:
        """未实现盈亏"""
        if self.side == PositionSide.LONG:
            return (self.current_price - self.entry_price) * self.size
        else:  # SHORT
            return (self.entry_price - self.current_price) * self.size
    
    @property
    def unrealized_pnl_pct(self) -> float:
        """未实现盈亏百分比"""
        if self.side == PositionSide.LONG:
            return (self.current_price - self.entry_price) / self.entry_price
        else:
            return (self.entry_price - self.current_price) / self.entry_price
    
    def update_price(self, new_price: float):
        """更新当前价格"""
        self.current_price = new_price
        self.last_updated = datetime.now()
    
    def to_dict(self) -> dict:
        return {
            'ticker': self.ticker,
            'side': self.side.value,
            'size': self.size,
            'entry_price': self.entry_price,
            'current_price': self.current_price,
            'current_value': self.current_value,
            'unrealized_pnl': self.unrealized_pnl,
            'unrealized_pnl_pct': self.unrealized_pnl_pct,
            'stop_loss': self.stop_loss,
            'take_profit': self.take_profit,
            'opened_at': self.opened_at.isoformat(),
            'last_updated': self.last_updated.isoformat(),
            'position_id': self.position_id,
            'signal_id': self.signal_id
        }


@dataclass
class AccountInfo:
    """账户信息"""
    total_equity: float  # 总权益
    available_cash: float  # 可用现金
    used_margin: float  # 已用保证金
    positions_value: float  # 持仓价值
    unrealized_pnl: float  # 未实现盈亏
    
    # 可选字段
    leverage: float = 1.0
    maintenance_margin: float = 0.0
    
    def to_dict(self) -> dict:
        return {
            'total_equity': self.total_equity,
            'available_cash': self.available_cash,
            'used_margin': self.used_margin,
            'positions_value': self.positions_value,
            'unrealized_pnl': self.unrealized_pnl,
            'leverage': self.leverage,
            'maintenance_margin': self.maintenance_margin
        }


class BaseTrader(ABC):
    """交易执行器基类"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.name = self.__class__.__name__
        self.is_connected = False
    
    @abstractmethod
    async def connect(self) -> bool:
        """
        连接到交易平台
        
        Returns:
            True if connected successfully
        """
        pass
    
    @abstractmethod
    async def disconnect(self):
        """断开连接"""
        pass
    
    @abstractmethod
    async def place_order(self, order: Order) -> OrderResult:
        """
        下单
        
        Args:
            order: Order 对象
        
        Returns:
            OrderResult 包含订单执行结果
        """
        pass
    
    @abstractmethod
    async def cancel_order(self, order_id: str) -> bool:
        """
        撤单
        
        Args:
            order_id: 订单ID
        
        Returns:
            True if cancelled successfully
        """
        pass
    
    @abstractmethod
    async def get_order_status(self, order_id: str) -> OrderStatus:
        """
        查询订单状态
        
        Args:
            order_id: 订单ID
        
        Returns:
            OrderStatus
        """
        pass
    
    @abstractmethod
    async def get_position(self, ticker: str) -> Optional[Position]:
        """
        获取持仓
        
        Args:
            ticker: 标的代码
        
        Returns:
            Position 对象，如果没有持仓返回 None
        """
        pass
    
    @abstractmethod
    async def get_all_positions(self) -> List[Position]:
        """
        获取所有持仓
        
        Returns:
            Position 列表
        """
        pass
    
    @abstractmethod
    async def close_position(self, ticker: str, size: Optional[float] = None) -> OrderResult:
        """
        平仓
        
        Args:
            ticker: 标的代码
            size: 平仓数量，None表示全部平仓
        
        Returns:
            OrderResult
        """
        pass
    
    @abstractmethod
    async def get_account_info(self) -> AccountInfo:
        """
        获取账户信息
        
        Returns:
            AccountInfo 对象
        """
        pass
    
    @abstractmethod
    async def get_current_price(self, ticker: str) -> float:
        """
        获取当前价格
        
        Args:
            ticker: 标的代码
        
        Returns:
            当前价格
        """
        pass
    
    def validate_order(self, order: Order) -> tuple[bool, str]:
        """
        验证订单是否合法
        
        Returns:
            (is_valid, error_message)
        """
        
        # 基础验证
        if order.size <= 0:
            return False, "Order size must be positive"
        
        if order.order_type == OrderType.LIMIT and order.price is None:
            return False, "LIMIT order requires price"
        
        return True, ""
    
    def __repr__(self) -> str:
        status = "connected" if self.is_connected else "disconnected"
        return f"{self.name}({status})"
