"""
dYdX Trader - 加密货币永续合约交易器

真实 API 版本 - 连接 dYdX v4 链
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List
from decimal import Decimal

from trading.base_trader import (
    BaseTrader, Order, OrderResult, Position, AccountInfo,
    OrderSide, OrderType, OrderStatus, PositionSide
)

logger = logging.getLogger(__name__)


class dYdXTrader(BaseTrader):
    """
    dYdX v4 交易器 - 真实 API 版本
    
    功能：
    - 永续合约交易
    - 多空双向
    - 实时订单簿
    - WebSocket 行情推送
    """
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        
        # dYdX 配置
        self.network = config.get('network', 'mainnet')  # mainnet | testnet
        self.mnemonic = config.get('mnemonic')  # 助记词
        self.address = config.get('address')  # dYdX 地址
        
        # API 端点
        if self.network == 'mainnet':
            self.indexer_url = 'https://indexer.dydx.trade/v4'
            self.websocket_url = 'wss://indexer.dydx.trade/v4/ws'
            self.validator_url = 'https://dydx-ops-rpc.kingnodes.com'  # 公共 RPC
        else:  # testnet
            self.indexer_url = 'https://indexer.v4testnet.dydx.exchange/v4'
            self.websocket_url = 'wss://indexer.v4testnet.dydx.exchange/v4/ws'
            self.validator_url = 'https://dydx-testnet-rpc.kingnodes.com'
        
        # SDK 客户端（延迟初始化）
        self.client = None
        self.subaccount_number = config.get('subaccount_number', 0)
        
        # 持仓缓存
        self.positions_cache = {}
        self.last_position_update = None
        
        # WebSocket 连接
        self.ws_connected = False
        self.ws_handlers = {}
        
        # 交易配置
        self.max_leverage = config.get('max_leverage', 5.0)
        self.default_leverage = config.get('default_leverage', 2.0)
        
    async def connect(self) -> bool:
        """连接到 dYdX v4"""
        try:
            logger.info(f"Connecting to dYdX v4 ({self.network})...")
            
            # 导入 dYdX SDK
            from v4_client_py import CompositeClient, NodeClient
            from v4_client_py.clients.constants import Network
            
            # 选择网络
            if self.network == 'mainnet':
                network = Network.MAINNET
            else:
                network = Network.TESTNET
            
            # 创建客户端
            self.client = CompositeClient(
                network=network,
                node_url=self.validator_url,
            )
            
            # 使用助记词恢复钱包
            if self.mnemonic:
                from v4_client_py.chain.aerial.wallet import LocalWallet
                self.wallet = LocalWallet.from_mnemonic(
                    self.mnemonic,
                    prefix="dydx"
                )
                logger.info(f"Wallet address: {self.wallet.address()}")
            elif self.address:
                logger.warning("Only address provided, can read but not trade")
            else:
                raise ValueError("Need mnemonic or address")
            
            # 验证连接
            account = await self.get_account_info()
            logger.info(f"✅ Connected to dYdX v4")
            logger.info(f"   Balance: ${account.total_equity:.2f}")
            logger.info(f"   Available: ${account.available_cash:.2f}")
            
            self.is_connected = True
            
            # 启动 WebSocket（可选）
            # await self._start_websocket()
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to connect to dYdX: {e}")
            return False
    
    async def disconnect(self):
        """断开连接"""
        logger.info("Disconnecting from dYdX...")
        
        # 关闭 WebSocket
        if self.ws_connected:
            await self._stop_websocket()
        
        self.is_connected = False
        self.client = None
    
    async def place_order(self, order: Order) -> OrderResult:
        """
        下单
        
        Args:
            order: 订单对象
            
        Returns:
            OrderResult: 订单结果
        """
        
        if not self.is_connected or not self.wallet:
            return OrderResult(
                success=False,
                order_id=None,
                filled_size=0.0,
                filled_price=0.0,
                status=OrderStatus.REJECTED,
                message="Not connected or no wallet",
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
        
        try:
            from v4_client_py.clients.dydx_subaccount import Subaccount
            from v4_client_py.clients.constants import OrderSide as DydxSide, OrderType as DydxType
            
            # 获取市场信息
            market_info = await self._get_market_info(order.ticker)
            if not market_info:
                return OrderResult(
                    success=False,
                    order_id=None,
                    filled_size=0.0,
                    filled_price=0.0,
                    status=OrderStatus.REJECTED,
                    message=f"Market {order.ticker} not found",
                    timestamp=datetime.now()
                )
            
            # 获取当前价格
            current_price = await self.get_current_price(order.ticker)
            
            # 计算数量（size 是 USD 金额，需要转换为币数量）
            quantity = order.size / current_price
            
            # 根据市场精度调整
            step_size = float(market_info.get('stepSize', 0.001))
            quantity = round(quantity / step_size) * step_size
            
            # 准备订单参数
            subaccount = Subaccount(self.wallet, self.subaccount_number)
            
            # 转换订单方向
            side = DydxSide.BUY if order.side == OrderSide.BUY else DydxSide.SELL
            
            # 转换订单类型
            if order.order_type == OrderType.MARKET:
                order_type = DydxType.MARKET
                price = None  # 市价单不需要价格
            elif order.order_type == OrderType.LIMIT:
                order_type = DydxType.LIMIT
                price = order.limit_price or current_price
            else:
                order_type = DydxType.STOP_LIMIT
                price = order.stop_price
            
            # 提交订单
            logger.info(f"Placing order: {side} {quantity} {order.ticker} @ {price or 'MARKET'}")
            
            tx = self.client.place_order(
                subaccount=subaccount,
                market=order.ticker + "-USD",  # dYdX 格式：BTC-USD
                side=side,
                type=order_type,
                size=quantity,
                price=price,
                time_in_force="IOC" if order.order_type == OrderType.MARKET else "GTT",
                reduce_only=False,
                post_only=False,
                good_til_time=int((datetime.now().timestamp() + 60) * 1000),  # 1分钟有效
            )
            
            # 解析结果
            if tx and hasattr(tx, 'tx_hash'):
                order_id = tx.tx_hash
                
                # 等待订单成交（市价单通常立即成交）
                await asyncio.sleep(1)
                
                # 查询订单状态
                order_status = await self._get_order_status(order_id)
                
                if order_status:
                    filled_size = float(order_status.get('size', 0))
                    filled_price = float(order_status.get('price', 0))
                    status = self._parse_order_status(order_status.get('status'))
                    
                    logger.info(f"✅ Order filled: {filled_size} @ ${filled_price}")
                    
                    return OrderResult(
                        success=True,
                        order_id=order_id,
                        filled_size=filled_size,
                        filled_price=filled_price,
                        status=status,
                        message=f"Filled {filled_size:.4f} {order.ticker} @ ${filled_price:.2f}",
                        timestamp=datetime.now(),
                        commission=filled_size * filled_price * 0.0005,  # 0.05% taker fee
                    )
                else:
                    return OrderResult(
                        success=True,
                        order_id=order_id,
                        filled_size=0.0,
                        filled_price=0.0,
                        status=OrderStatus.PENDING,
                        message="Order submitted, status unknown",
                        timestamp=datetime.now()
                    )
            else:
                return OrderResult(
                    success=False,
                    order_id=None,
                    filled_size=0.0,
                    filled_price=0.0,
                    status=OrderStatus.REJECTED,
                    message="Transaction failed",
                    timestamp=datetime.now()
                )
            
        except Exception as e:
            logger.error(f"Failed to place order: {e}")
            return OrderResult(
                success=False,
                order_id=None,
                filled_size=0.0,
                filled_price=0.0,
                status=OrderStatus.REJECTED,
                message=str(e),
                timestamp=datetime.now()
            )
    
    async def cancel_order(self, order_id: str) -> bool:
        """撤单"""
        try:
            from v4_client_py.clients.dydx_subaccount import Subaccount
            
            subaccount = Subaccount(self.wallet, self.subaccount_number)
            
            tx = self.client.cancel_order(
                subaccount=subaccount,
                client_id=order_id,
                order_flags=0,
                clobpair_id=0,  # 需要从订单信息中获取
                good_til_time=int((datetime.now().timestamp() + 60) * 1000),
            )
            
            if tx and hasattr(tx, 'tx_hash'):
                logger.info(f"✅ Order cancelled: {order_id}")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Failed to cancel order: {e}")
            return False
    
    async def get_order_status(self, order_id: str) -> OrderStatus:
        """查询订单状态"""
        order_info = await self._get_order_status(order_id)
        if order_info:
            return self._parse_order_status(order_info.get('status'))
        return OrderStatus.UNKNOWN
    
    async def get_position(self, ticker: str) -> Optional[Position]:
        """获取持仓"""
        positions = await self.get_all_positions()
        
        for pos in positions:
            if pos.ticker == ticker:
                return pos
        
        return None
    
    async def get_all_positions(self) -> List[Position]:
        """获取所有持仓"""
        try:
            if not self.wallet:
                return []
            
            # 调用 Indexer API 获取持仓
            import aiohttp
            
            url = f"{self.indexer_url}/addresses/{self.wallet.address()}/subaccounts/{self.subaccount_number}/perpetualPositions"
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        positions = []
                        
                        for pos_data in data.get('positions', []):
                            market = pos_data.get('market', '')
                            ticker = market.replace('-USD', '')
                            
                            size = float(pos_data.get('size', 0))
                            if size == 0:
                                continue
                            
                            entry_price = float(pos_data.get('entryPrice', 0))
                            current_price = await self.get_current_price(ticker)
                            
                            # 判断多空
                            side = PositionSide.LONG if size > 0 else PositionSide.SHORT
                            
                            # 计算未实现盈亏
                            if side == PositionSide.LONG:
                                unrealized_pnl = abs(size) * (current_price - entry_price)
                            else:
                                unrealized_pnl = abs(size) * (entry_price - current_price)
                            
                            position = Position(
                                ticker=ticker,
                                side=side,
                                size=abs(size),
                                entry_price=entry_price,
                                current_price=current_price,
                                unrealized_pnl=unrealized_pnl,
                                position_id=pos_data.get('id', ''),
                                opened_at=datetime.fromisoformat(pos_data.get('createdAt', datetime.now().isoformat())),
                                last_updated=datetime.now()
                            )
                            
                            positions.append(position)
                        
                        self.positions_cache = {p.ticker: p for p in positions}
                        self.last_position_update = datetime.now()
                        
                        return positions
            
            return []
            
        except Exception as e:
            logger.error(f"Failed to get positions: {e}")
            return []
    
    async def close_position(self, ticker: str, size: Optional[float] = None) -> OrderResult:
        """平仓"""
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
        
        # 平仓 = 反向开单
        close_side = OrderSide.SELL if position.side == PositionSide.LONG else OrderSide.BUY
        close_size = size or position.size
        
        # 创建平仓订单
        close_order = Order(
            ticker=ticker,
            side=close_side,
            size=close_size * position.current_price,  # 转换为 USD
            order_type=OrderType.MARKET,
            signal_id=f"close_{position.position_id}"
        )
        
        return await self.place_order(close_order)
    
    async def get_account_info(self) -> AccountInfo:
        """获取账户信息"""
        try:
            if not self.wallet:
                return AccountInfo(
                    total_equity=0.0,
                    available_cash=0.0,
                    used_margin=0.0,
                    positions_value=0.0,
                    unrealized_pnl=0.0,
                    leverage=self.default_leverage
                )
            
            import aiohttp
            
            url = f"{self.indexer_url}/addresses/{self.wallet.address()}/subaccounts/{self.subaccount_number}"
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        subaccount = data.get('subaccount', {})
                        
                        equity = float(subaccount.get('equity', 0))
                        free_collateral = float(subaccount.get('freeCollateral', 0))
                        margin_enabled = float(subaccount.get('marginEnabled', 0))
                        
                        # 获取持仓
                        positions = await self.get_all_positions()
                        unrealized_pnl = sum(p.unrealized_pnl for p in positions)
                        positions_value = sum(p.current_value for p in positions)
                        
                        return AccountInfo(
                            total_equity=equity,
                            available_cash=free_collateral,
                            used_margin=equity - free_collateral,
                            positions_value=positions_value,
                            unrealized_pnl=unrealized_pnl,
                            leverage=self.default_leverage
                        )
            
            return AccountInfo(
                total_equity=0.0,
                available_cash=0.0,
                used_margin=0.0,
                positions_value=0.0,
                unrealized_pnl=0.0,
                leverage=self.default_leverage
            )
            
        except Exception as e:
            logger.error(f"Failed to get account info: {e}")
            return AccountInfo(
                total_equity=0.0,
                available_cash=0.0,
                used_margin=0.0,
                positions_value=0.0,
                unrealized_pnl=0.0,
                leverage=self.default_leverage
            )
    
    async def get_current_price(self, ticker: str) -> float:
        """获取当前价格（从订单簿）"""
        try:
            import aiohttp
            
            market = f"{ticker}-USD"
            url = f"{self.indexer_url}/orderbooks/perpetualMarket/{market}"
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        
                        # 取买一和卖一的中间价
                        asks = data.get('asks', [])
                        bids = data.get('bids', [])
                        
                        if asks and bids:
                            best_ask = float(asks[0].get('price', 0))
                            best_bid = float(bids[0].get('price', 0))
                            mid_price = (best_ask + best_bid) / 2
                            return mid_price
            
            logger.warning(f"Failed to get price for {ticker}, using fallback")
            return 0.0
            
        except Exception as e:
            logger.error(f"Failed to get current price: {e}")
            return 0.0
    
    # === Private Methods ===
    
    async def _get_market_info(self, ticker: str) -> Optional[Dict]:
        """获取市场信息"""
        try:
            import aiohttp
            
            url = f"{self.indexer_url}/perpetualMarkets"
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        markets = data.get('markets', {})
                        
                        market_key = f"{ticker}-USD"
                        return markets.get(market_key)
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to get market info: {e}")
            return None
    
    async def _get_order_status(self, order_id: str) -> Optional[Dict]:
        """查询订单详情"""
        try:
            import aiohttp
            
            if not self.wallet:
                return None
            
            url = f"{self.indexer_url}/addresses/{self.wallet.address()}/subaccounts/{self.subaccount_number}/orders/{order_id}"
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return data.get('order')
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to get order status: {e}")
            return None
    
    def _parse_order_status(self, status_str: str) -> OrderStatus:
        """解析订单状态"""
        status_map = {
            'OPEN': OrderStatus.PENDING,
            'FILLED': OrderStatus.FILLED,
            'CANCELED': OrderStatus.CANCELED,
            'BEST_EFFORT_CANCELED': OrderStatus.CANCELED,
            'PARTIALLY_FILLED': OrderStatus.PARTIAL_FILLED,
        }
        return status_map.get(status_str, OrderStatus.UNKNOWN)


if __name__ == "__main__":
    # 测试
    import asyncio
    logging.basicConfig(level=logging.INFO)
    
    async def test_dydx_trader():
        config = {
            'network': 'testnet',  # 测试网
            'mnemonic': 'your mnemonic here',  # 替换为你的助记词
            'subaccount_number': 0,
            'default_leverage': 2.0
        }
        
        trader = dYdXTrader(config)
        
        # 连接
        if not await trader.connect():
            print("Failed to connect")
            return
        
        # 获取账户信息
        account = await trader.get_account_info()
        print(f"\n📊 Account Info:")
        print(f"   Total Equity: ${account.total_equity:.2f}")
        print(f"   Available: ${account.available_cash:.2f}")
        print(f"   Unrealized PnL: ${account.unrealized_pnl:.2f}")
        
        # 获取 BTC 价格
        btc_price = await trader.get_current_price('BTC')
        print(f"\n💰 BTC Price: ${btc_price:.2f}")
        
        # 查看持仓
        positions = await trader.get_all_positions()
        if positions:
            print(f"\n📈 Positions:")
            for pos in positions:
                print(f"   {pos.ticker}: {pos.side.value} {pos.size:.4f} @ ${pos.entry_price:.2f}")
                print(f"      Current: ${pos.current_price:.2f} | PnL: ${pos.unrealized_pnl:.2f}")
        else:
            print("\n📈 No open positions")
        
        await trader.disconnect()
    
    asyncio.run(test_dydx_trader())
