"""
Interactive Brokers Trader

支持：
- 股票现货交易
- 期权交易（Calls/Puts）
- 实时行情
- 持仓管理

依赖：ib_insync
安装：pip install ib_insync
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List

try:
    from ib_insync import IB, Stock, Option, MarketOrder, LimitOrder, util
    IBKR_AVAILABLE = True
except ImportError:
    IBKR_AVAILABLE = False
    logging.warning("ib_insync not installed. Install with: pip install ib_insync")

from trading.base_trader import (
    BaseTrader, Order, OrderResult, Position, AccountInfo,
    OrderSide, OrderType, OrderStatus, PositionSide
)

logger = logging.getLogger(__name__)


class IBKRTrader(BaseTrader):
    """
    Interactive Brokers 交易器
    
    功能：
    - 股票交易
    - 期权交易
    - 实时价格
    - 账户查询
    
    模式：
    - paper: 纸上交易（模拟）
    - live: 真实交易（需要 TWS/Gateway）
    """
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        
        if not IBKR_AVAILABLE:
            raise ImportError("ib_insync not installed")
        
        # 连接配置
        self.host = config.get('host', '127.0.0.1')
        self.port = config.get('port', 7497)  # Paper: 7497, Live: 7496
        self.client_id = config.get('client_id', 1)
        
        # 模式
        self.paper_mode = config.get('paper_mode', True)
        
        # IBKR 客户端
        self.ib = IB()
        
        # 持仓缓存
        self.positions_cache = {}
        
        # 账户信息
        self.account_id = config.get('account_id', '')
        
        # 交易配置
        self.exchange = config.get('exchange', 'SMART')  # 智能路由
        self.currency = config.get('currency', 'USD')
        
        logger.info(f"IBKR Trader initialized (paper={self.paper_mode}, port={self.port})")
    
    async def connect(self) -> bool:
        """
        连接到 Interactive Brokers
        
        需要：
        - TWS (Trader Workstation) 或 IB Gateway 运行中
        - API 连接已启用
        - 端口配置正确
        """
        
        try:
            logger.info(f"Connecting to IBKR at {self.host}:{self.port}...")
            
            # 连接
            self.ib.connect(
                host=self.host,
                port=self.port,
                clientId=self.client_id,
                readonly=False  # 需要交易权限
            )
            
            # 等待连接稳定
            await asyncio.sleep(1)
            
            if self.ib.isConnected():
                self.is_connected = True
                
                # 获取账户ID（如果没配置）
                if not self.account_id:
                    accounts = self.ib.managedAccounts()
                    if accounts:
                        self.account_id = accounts[0]
                        logger.info(f"Using account: {self.account_id}")
                
                mode = "Paper Trading" if self.paper_mode else "Live Trading"
                logger.info(f"✅ Connected to IBKR ({mode})")
                return True
            else:
                logger.error("Failed to connect to IBKR")
                return False
                
        except Exception as e:
            logger.error(f"IBKR connection error: {e}")
            logger.error("Make sure TWS/Gateway is running and API is enabled")
            self.is_connected = False
            return False
    
    async def disconnect(self):
        """断开连接"""
        if self.ib.isConnected():
            logger.info("Disconnecting from IBKR...")
            self.ib.disconnect()
            self.is_connected = False
            logger.info("Disconnected")
    
    async def place_order(self, order: Order) -> OrderResult:
        """
        下单
        
        支持：
        - 股票市价单
        - 期权市价单
        - 限价单（TODO）
        """
        
        if not self.is_connected:
            return OrderResult(
                success=False,
                order_id=None,
                filled_size=0.0,
                filled_price=0.0,
                status=OrderStatus.REJECTED,
                message="Not connected to IBKR",
                timestamp=datetime.now()
            )
        
        try:
            # 创建合约
            contract = self._create_contract(order.ticker)
            
            # 限定合约（获取完整信息）
            qualified = self.ib.qualifyContracts(contract)
            if not qualified:
                return OrderResult(
                    success=False,
                    order_id=None,
                    filled_size=0.0,
                    filled_price=0.0,
                    status=OrderStatus.REJECTED,
                    message=f"Contract not found: {order.ticker}",
                    timestamp=datetime.now()
                )
            
            contract = qualified[0]
            
            # 创建订单对象
            if order.order_type == OrderType.MARKET:
                ib_order = MarketOrder(
                    action='BUY' if order.side == OrderSide.BUY else 'SELL',
                    totalQuantity=int(order.size)
                )
            elif order.order_type == OrderType.LIMIT:
                ib_order = LimitOrder(
                    action='BUY' if order.side == OrderSide.BUY else 'SELL',
                    totalQuantity=int(order.size),
                    lmtPrice=order.price
                )
            else:
                return OrderResult(
                    success=False,
                    order_id=None,
                    filled_size=0.0,
                    filled_price=0.0,
                    status=OrderStatus.REJECTED,
                    message=f"Unsupported order type: {order.order_type}",
                    timestamp=datetime.now()
                )
            
            # 提交订单
            logger.info(f"Submitting order: {order.side.value} {order.size} {order.ticker}")
            trade = self.ib.placeOrder(contract, ib_order)
            
            # 等待成交
            timeout = 30  # 30秒超时
            start_time = datetime.now()
            
            while not trade.isDone():
                await asyncio.sleep(0.1)
                self.ib.sleep(0.1)  # 处理事件
                
                if (datetime.now() - start_time).total_seconds() > timeout:
                    return OrderResult(
                        success=False,
                        order_id=str(trade.order.orderId),
                        filled_size=0.0,
                        filled_price=0.0,
                        status=OrderStatus.REJECTED,
                        message="Order timeout",
                        timestamp=datetime.now()
                    )
            
            # 检查结果
            if trade.orderStatus.status == 'Filled':
                filled_qty = trade.orderStatus.filled
                avg_price = trade.orderStatus.avgFillPrice
                
                logger.info(f"✅ Order filled: {filled_qty} @ ${avg_price:.2f}")
                
                return OrderResult(
                    success=True,
                    order_id=str(trade.order.orderId),
                    filled_size=filled_qty,
                    filled_price=avg_price,
                    status=OrderStatus.FILLED,
                    message=f"Filled {filled_qty} @ ${avg_price:.2f}",
                    timestamp=datetime.now(),
                    commission=trade.orderStatus.commission or 0.0
                )
            else:
                return OrderResult(
                    success=False,
                    order_id=str(trade.order.orderId),
                    filled_size=0.0,
                    filled_price=0.0,
                    status=OrderStatus.REJECTED,
                    message=f"Order status: {trade.orderStatus.status}",
                    timestamp=datetime.now()
                )
                
        except Exception as e:
            logger.error(f"Error placing order: {e}", exc_info=True)
            return OrderResult(
                success=False,
                order_id=None,
                filled_size=0.0,
                filled_price=0.0,
                status=OrderStatus.REJECTED,
                message=str(e),
                timestamp=datetime.now()
            )
    
    def _create_contract(self, ticker: str):
        """
        创建合约对象
        
        支持：
        - 股票：AAPL
        - 期权：AAPL_20260320_C_150 (格式：TICKER_YYYYMMDD_C/P_STRIKE)
        """
        
        if '_' in ticker:
            # 期权合约
            parts = ticker.split('_')
            if len(parts) != 4:
                raise ValueError(f"Invalid option ticker format: {ticker}")
            
            symbol, expiry, right, strike = parts
            
            return Option(
                symbol=symbol,
                lastTradeDateOrContractMonth=expiry,
                strike=float(strike),
                right=right,  # 'C' or 'P'
                exchange=self.exchange,
                currency=self.currency
            )
        else:
            # 股票合约
            return Stock(
                symbol=ticker,
                exchange=self.exchange,
                currency=self.currency
            )
    
    async def cancel_order(self, order_id: str) -> bool:
        """撤单"""
        try:
            # 查找订单
            trades = self.ib.trades()
            for trade in trades:
                if str(trade.order.orderId) == order_id:
                    self.ib.cancelOrder(trade.order)
                    logger.info(f"Order {order_id} cancelled")
                    return True
            
            logger.warning(f"Order {order_id} not found")
            return False
            
        except Exception as e:
            logger.error(f"Error cancelling order: {e}")
            return False
    
    async def get_order_status(self, order_id: str) -> OrderStatus:
        """查询订单状态"""
        try:
            trades = self.ib.trades()
            for trade in trades:
                if str(trade.order.orderId) == order_id:
                    status_map = {
                        'PendingSubmit': OrderStatus.PENDING,
                        'PreSubmitted': OrderStatus.PENDING,
                        'Submitted': OrderStatus.PENDING,
                        'Filled': OrderStatus.FILLED,
                        'Cancelled': OrderStatus.CANCELLED,
                        'Inactive': OrderStatus.CANCELLED
                    }
                    return status_map.get(trade.orderStatus.status, OrderStatus.REJECTED)
            
            return OrderStatus.REJECTED
            
        except Exception as e:
            logger.error(f"Error getting order status: {e}")
            return OrderStatus.REJECTED
    
    async def get_position(self, ticker: str) -> Optional[Position]:
        """获取持仓"""
        try:
            positions = self.ib.positions(account=self.account_id)
            
            for pos in positions:
                if pos.contract.symbol == ticker:
                    current_price = await self.get_current_price(ticker)
                    
                    return Position(
                        ticker=ticker,
                        side=PositionSide.LONG if pos.position > 0 else PositionSide.SHORT,
                        size=abs(pos.position),
                        entry_price=pos.avgCost,
                        current_price=current_price,
                        position_id=f"ibkr_{ticker}",
                        opened_at=datetime.now(),  # IBKR 不提供开仓时间
                        last_updated=datetime.now()
                    )
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting position: {e}")
            return None
    
    async def get_all_positions(self) -> List[Position]:
        """获取所有持仓"""
        try:
            positions = self.ib.positions(account=self.account_id)
            result = []
            
            for pos in positions:
                ticker = pos.contract.symbol
                current_price = await self.get_current_price(ticker)
                
                result.append(Position(
                    ticker=ticker,
                    side=PositionSide.LONG if pos.position > 0 else PositionSide.SHORT,
                    size=abs(pos.position),
                    entry_price=pos.avgCost,
                    current_price=current_price,
                    position_id=f"ibkr_{ticker}",
                    opened_at=datetime.now(),
                    last_updated=datetime.now()
                ))
            
            return result
            
        except Exception as e:
            logger.error(f"Error getting all positions: {e}")
            return []
    
    async def close_position(self, ticker: str, size: Optional[float] = None) -> OrderResult:
        """平仓"""
        try:
            position = await self.get_position(ticker)
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
            
            # 反向订单
            close_side = OrderSide.SELL if position.side == PositionSide.LONG else OrderSide.BUY
            close_size = size if size else position.size
            
            close_order = Order(
                ticker=ticker,
                side=close_side,
                size=close_size,
                order_type=OrderType.MARKET
            )
            
            return await self.place_order(close_order)
            
        except Exception as e:
            logger.error(f"Error closing position: {e}")
            return OrderResult(
                success=False,
                order_id=None,
                filled_size=0.0,
                filled_price=0.0,
                status=OrderStatus.REJECTED,
                message=str(e),
                timestamp=datetime.now()
            )
    
    async def get_account_info(self) -> AccountInfo:
        """获取账户信息"""
        try:
            # 获取账户摘要
            account_values = self.ib.accountValues(account=self.account_id)
            
            values = {}
            for av in account_values:
                values[av.tag] = float(av.value)
            
            total_equity = values.get('NetLiquidation', 0.0)
            available_cash = values.get('AvailableFunds', 0.0)
            
            # 计算持仓价值
            positions_value = 0.0
            for pos in self.ib.positions(account=self.account_id):
                positions_value += abs(pos.position * pos.avgCost)
            
            return AccountInfo(
                total_equity=total_equity,
                available_cash=available_cash,
                used_margin=total_equity - available_cash,
                positions_value=positions_value,
                unrealized_pnl=values.get('UnrealizedPnL', 0.0),
                leverage=1.0  # 股票通常无杠杆
            )
            
        except Exception as e:
            logger.error(f"Error getting account info: {e}")
            return AccountInfo(
                total_equity=0.0,
                available_cash=0.0,
                used_margin=0.0,
                positions_value=0.0,
                unrealized_pnl=0.0
            )
    
    async def get_current_price(self, ticker: str) -> float:
        """获取当前价格"""
        try:
            contract = self._create_contract(ticker)
            qualified = self.ib.qualifyContracts(contract)
            
            if not qualified:
                logger.warning(f"Contract not found: {ticker}")
                return 0.0
            
            contract = qualified[0]
            
            # 请求实时行情
            ticker_data = self.ib.reqMktData(contract)
            
            # 等待数据
            for _ in range(10):  # 最多等待1秒
                await asyncio.sleep(0.1)
                if ticker_data.last > 0:
                    price = ticker_data.last
                    self.ib.cancelMktData(contract)
                    return price
            
            # 如果没有实时价，尝试 close price
            if ticker_data.close > 0:
                self.ib.cancelMktData(contract)
                return ticker_data.close
            
            logger.warning(f"No price data for {ticker}")
            return 0.0
            
        except Exception as e:
            logger.error(f"Error getting price for {ticker}: {e}")
            return 0.0


if __name__ == "__main__":
    # 测试
    import asyncio
    logging.basicConfig(level=logging.INFO)
    
    async def test_ibkr():
        print("Testing IBKR Trader")
        print("="*70)
        print()
        print("⚠️  This requires:")
        print("  1. TWS or IB Gateway running")
        print("  2. API connections enabled")
        print("  3. Paper trading account")
        print()
        
        config = {
            'host': '127.0.0.1',
            'port': 7497,  # Paper trading port
            'client_id': 1,
            'paper_mode': True
        }
        
        trader = IBKRTrader(config)
        
        # 连接
        print("Connecting to IBKR...")
        connected = await trader.connect()
        
        if not connected:
            print("❌ Connection failed")
            print("\nTroubleshooting:")
            print("1. Make sure TWS/Gateway is running")
            print("2. Enable API: File -> Global Configuration -> API -> Settings")
            print("3. Check port number (Paper: 7497, Live: 7496)")
            return
        
        # 获取账户信息
        print("\nGetting account info...")
        account = await trader.get_account_info()
        print(f"  Total Equity: ${account.total_equity:,.2f}")
        print(f"  Available Cash: ${account.available_cash:,.2f}")
        print(f"  Positions Value: ${account.positions_value:,.2f}")
        
        # 获取价格
        print("\nGetting market data...")
        price = await trader.get_current_price('AAPL')
        print(f"  AAPL: ${price:.2f}")
        
        # 断开
        await trader.disconnect()
        print("\n✅ Test completed")
    
    try:
        asyncio.run(test_ibkr())
    except KeyboardInterrupt:
        print("\nTest interrupted")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
