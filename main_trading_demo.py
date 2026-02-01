"""
Complete Trading System Demo

展示三大系统如何协同工作：
1. Signal Management System
2. Auto Trading System  
3. Risk Management System
"""

import asyncio
import logging
import sys
from pathlib import Path
from datetime import datetime

# 添加路径
sys.path.insert(0, str(Path(__file__).parent))

from signals.sentiment.sentiment_signal import SentimentSignal
from signals.aggregator import SignalAggregator
from trading.engine import TradingEngine
from trading.dydx_trader import dYdXTrader
from risk.risk_manager import RiskManager

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


async def main():
    """完整系统演示"""
    
    print("="*70)
    print("🚀 Auto Trading System Demo")
    print("="*70)
    print()
    
    # ==================== 1. 初始化信号管理系统 ====================
    print("📡 Step 1: Initializing Signal Management System...")
    
    # 信号配置
    signal_config = {
        'weights': {
            'sentiment': 1.0  # 目前只有情绪信号
        },
        'conflict_resolution': 'weighted_average'
    }
    
    # 创建信号聚合器
    aggregator = SignalAggregator(signal_config)
    
    # 注册情绪信号源
    sentiment_config = {
        'thresholds': {
            'strong_bullish': 0.75,
            'bullish': 0.60,
            'neutral': 0.50,
            'bearish': 0.40,
            'strong_bearish': 0.25
        },
        'min_mentions': 20  # 降低阈值以便测试
    }
    sentiment_signal = SentimentSignal(sentiment_config)
    aggregator.register_source('sentiment', sentiment_signal, weight=1.0)
    
    # 健康检查
    health = aggregator.get_health()
    print(f"  Signal System Status: {health['overall_status']}")
    for source, status in health['sources'].items():
        print(f"    - {source}: {status['status']} - {status['details']}")
    print()
    
    # ==================== 2. 初始化风险管理系统 ====================
    print("🛡️  Step 2: Initializing Risk Management System...")
    
    risk_config = {
        'max_open_positions': 4,
        'max_risk_per_trade': 500,
        'max_loss_per_trade_pct': 0.10,
        'max_total_exposure_pct': 0.50,
        'max_stop_loss_pct': 0.12,
        'min_stop_loss_pct': 0.05,
        'risk_reward_ratio': 3.0
    }
    
    risk_manager = RiskManager(risk_config)
    print(f"  Max positions: {risk_manager.max_open_positions}")
    print(f"  Max risk per trade: ${risk_manager.max_risk_per_trade}")
    print(f"  Risk/Reward ratio: {risk_manager.risk_reward_ratio}:1")
    print()
    
    # ==================== 3. 初始化交易系统 ====================
    print("🤖 Step 3: Initializing Auto Trading System...")
    
    # 交易策略配置
    strategy_config = {
        'strategy': {
            'min_confidence': 0.60,  # 降低阈值以便测试
            'min_strength': 0.50,
            'base_position_size': 1000,
            'sizing_method': 'fixed',
            'timeframe': '1h',
            'platform_rules': {
                'crypto': 'dydx',
                'stock': 'ibkr'
            }
        }
    }
    
    engine = TradingEngine(strategy_config)
    
    # 注入依赖
    engine.set_signal_aggregator(aggregator)
    engine.set_risk_manager(risk_manager)
    
    # 创建 dYdX 交易器（纸上交易）
    dydx_config = {
        'paper_mode': True,
        'initial_balance': 10000.0,
        'default_leverage': 2.0
    }
    dydx_trader = dYdXTrader(dydx_config)
    engine.register_trader('dydx', dydx_trader)
    
    # 启动引擎
    await engine.start()
    print(f"  Trading Engine: Started")
    print(f"  Min confidence: {engine.min_confidence}")
    print(f"  Min strength: {engine.min_strength}")
    print()
    
    # ==================== 4. 处理交易信号 ====================
    print("💹 Step 4: Processing Trading Signals...")
    print()
    
    # 测试标的
    test_tickers = [
        ('GOLD', 'stock'),
        ('BTC', 'crypto'),
        ('ETH', 'crypto')
    ]
    
    for ticker, asset_type in test_tickers:
        print(f"\n{'─'*70}")
        print(f"Processing: {ticker} ({asset_type})")
        print('─'*70)
        
        try:
            # 获取信号
            signal = aggregator.aggregate(ticker, timeframe='1h')
            print(f"\n📊 Signal: {signal}")
            
            if signal.contributing_signals:
                for sig in signal.contributing_signals:
                    print(f"  Source: {sig.source}")
                    print(f"    - Type: {sig.signal_type.value}")
                    print(f"    - Strength: {sig.strength:.2f}")
                    print(f"    - Confidence: {sig.confidence:.2f}")
                    if sig.metadata:
                        print(f"    - Mentions: {sig.metadata.get('total_mentions', 'N/A')}")
                        print(f"    - Sentiment: {sig.metadata.get('sentiment_score', 'N/A')}")
            
            # 处理交易
            await engine.process_ticker(ticker, asset_type)
            
        except Exception as e:
            logger.error(f"Error processing {ticker}: {e}", exc_info=True)
        
        await asyncio.sleep(0.5)
    
    # ==================== 5. 显示结果 ====================
    print(f"\n{'='*70}")
    print("📈 Trading Summary")
    print('='*70)
    
    # 账户信息
    account = await dydx_trader.get_account_info()
    print(f"\n💰 Account Status:")
    print(f"  Total Equity: ${account.total_equity:.2f}")
    print(f"  Available Cash: ${account.available_cash:.2f}")
    print(f"  Positions Value: ${account.positions_value:.2f}")
    print(f"  Unrealized PnL: ${account.unrealized_pnl:.2f}")
    
    # 持仓
    positions = await dydx_trader.get_all_positions()
    if positions:
        print(f"\n📊 Open Positions ({len(positions)}):")
        for pos in positions:
            print(f"\n  {pos.ticker} {pos.side.value}")
            print(f"    Size: {pos.size:.4f}")
            print(f"    Entry: ${pos.entry_price:.2f}")
            print(f"    Current: ${pos.current_price:.2f}")
            print(f"    PnL: ${pos.unrealized_pnl:.2f} ({pos.unrealized_pnl_pct:.2%})")
            print(f"    Stop Loss: ${pos.stop_loss:.2f}")
            print(f"    Take Profit: ${pos.take_profit:.2f}")
    else:
        print(f"\n📊 No open positions")
    
    # 交易历史
    summary = dydx_trader.get_trading_summary()
    print(f"\n📜 Trading History:")
    print(f"  Total Trades: {summary['total_trades']}")
    print(f"  Filled: {summary['filled_trades']}")
    print(f"  Total Commission: ${summary['total_commission']:.2f}")
    print(f"  Net PnL: ${summary['net_pnl']:.2f}")
    
    # ==================== 6. 关闭系统 ====================
    print(f"\n{'='*70}")
    print("🛑 Shutting down...")
    await engine.stop()
    print("✅ Demo completed")
    print('='*70)


if __name__ == "__main__":
    asyncio.run(main())
