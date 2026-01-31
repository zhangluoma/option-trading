# 自动交易系统架构设计

## 🏗️ 三大核心系统

### 1. 信号管理系统 (Signal Management System)
管理和融合多种输入信号

### 2. 自动交易系统 (Auto Trading System)
根据融合信号执行交易决策

### 3. 仓位管理和风险控制系统 (Position & Risk Management System)
监控持仓，控制风险，执行止损止盈

---

## 📡 系统 1：信号管理系统

### 设计理念
- **可扩展**：轻松添加新信号源
- **标准化**：统一的信号接口
- **可配置**：每个信号源独立配置权重和参数
- **可追溯**：所有信号历史可查

### 信号源类型

#### 当前实现
- ✅ **情绪信号** (Sentiment Signal)
  - Reddit 讨论热度和情绪
  - Twitter/X 趋势
  - Google Trends
  - Unusual options flow

#### 未来扩展
- 📊 **技术面信号** (Technical Signal)
  - RSI, MACD, 布林带
  - 成交量分析
  - 价格形态识别
  
- 💰 **基本面信号** (Fundamental Signal)
  - 财报数据
  - 宏观经济指标
  - 行业新闻情绪
  
- ⚡ **高频信号** (High-Frequency Signal)
  - 订单流失衡
  - 大单监控
  - 市场微观结构
  
- 🔗 **链上信号** (On-Chain Signal) [加密货币]
  - 巨鲸钱包活动
  - 交易所流入流出
  - DeFi TVL 变化

### 信号标准接口

```python
class BaseSignal(ABC):
    """所有信号源的基类"""
    
    @abstractmethod
    def get_signal(self, ticker: str, timeframe: str) -> Signal:
        """
        返回标准化信号对象
        
        Returns:
            Signal(
                ticker: str,
                signal_type: SignalType,  # BUY, SELL, NEUTRAL
                strength: float,  # 0-1, 信号强度
                confidence: float,  # 0-1, 信号置信度
                timeframe: str,  # '1h', '4h', '1d'
                metadata: dict,  # 额外信息
                timestamp: datetime
            )
        """
        pass
    
    @abstractmethod
    def validate(self) -> bool:
        """验证信号源是否可用"""
        pass
    
    @abstractmethod
    def get_health(self) -> dict:
        """返回信号源健康状态"""
        pass
```

### 信号数据模型

```python
@dataclass
class Signal:
    ticker: str
    asset_type: str  # 'stock', 'crypto', 'option'
    signal_type: SignalType  # BUY, SELL, NEUTRAL, CLOSE
    strength: float  # 0-1, 信号强度
    confidence: float  # 0-1, 信号置信度
    timeframe: str  # '1h', '4h', '1d', 'swing'
    source: str  # 'sentiment', 'technical', 'fundamental', etc.
    metadata: dict  # 信号来源的详细信息
    timestamp: datetime
    
    def to_dict(self) -> dict:
        """序列化为字典"""
        pass
    
    def score(self) -> float:
        """综合得分 = strength * confidence"""
        return self.strength * self.confidence
```

### 信号融合引擎

```python
class SignalAggregator:
    """信号融合引擎"""
    
    def __init__(self, config: dict):
        self.signal_sources = {}  # source_name -> SignalSource
        self.weights = config['weights']  # source_name -> weight
        self.conflict_resolution = config['conflict_resolution']
        
    def register_source(self, name: str, source: BaseSignal):
        """注册新的信号源"""
        self.signal_sources[name] = source
    
    def aggregate(self, ticker: str, timeframe: str) -> AggregatedSignal:
        """
        融合多个信号源，生成最终交易信号
        
        融合策略：
        1. 加权平均（简单但有效）
        2. 投票机制（多数决）
        3. 优先级（高置信度优先）
        4. 机器学习（训练融合模型）
        """
        
        signals = []
        for name, source in self.signal_sources.items():
            try:
                signal = source.get_signal(ticker, timeframe)
                signal.weight = self.weights.get(name, 1.0)
                signals.append(signal)
            except Exception as e:
                logger.error(f"Signal source {name} failed: {e}")
        
        return self._resolve(signals)
    
    def _resolve(self, signals: List[Signal]) -> AggregatedSignal:
        """冲突解决和信号融合"""
        
        if not signals:
            return AggregatedSignal.neutral()
        
        # 按权重加权平均
        weighted_score = sum(s.score() * s.weight for s in signals)
        total_weight = sum(s.weight for s in signals)
        
        final_score = weighted_score / total_weight if total_weight > 0 else 0.5
        
        # 判断方向
        if final_score > 0.65:
            signal_type = SignalType.BUY
        elif final_score < 0.35:
            signal_type = SignalType.SELL
        else:
            signal_type = SignalType.NEUTRAL
        
        # 计算整体置信度（信号一致性）
        consistency = self._calculate_consistency(signals)
        
        return AggregatedSignal(
            ticker=ticker,
            signal_type=signal_type,
            strength=abs(final_score - 0.5) * 2,  # 归一化到 0-1
            confidence=consistency,
            contributing_signals=signals,
            timestamp=datetime.now()
        )
    
    def _calculate_consistency(self, signals: List[Signal]) -> float:
        """计算信号一致性（置信度）"""
        if len(signals) <= 1:
            return signals[0].confidence if signals else 0.5
        
        # 方差越小，一致性越高
        scores = [s.score() for s in signals]
        variance = np.var(scores)
        consistency = max(0, 1 - variance * 2)  # 简化公式
        
        return consistency
```

### 信号配置文件

```yaml
# config/signals.yaml

signals:
  enabled:
    - sentiment
    - technical
    # - fundamental  # Coming soon
    # - high_frequency  # Coming soon
  
  weights:
    sentiment: 0.50      # 情绪权重 50%
    technical: 0.30      # 技术面 30%
    fundamental: 0.20    # 基本面 20%
  
  # 各信号源配置
  sentiment:
    enabled: true
    sources:
      reddit:
        enabled: true
        weight: 0.40
        min_mentions: 50
      unusual_options:
        enabled: true
        weight: 0.35
      google_trends:
        enabled: true
        weight: 0.25
    
    # 信号阈值
    thresholds:
      strong_bullish: 0.75
      bullish: 0.60
      neutral_high: 0.55
      neutral_low: 0.45
      bearish: 0.40
      strong_bearish: 0.25
  
  technical:
    enabled: true
    indicators:
      - rsi
      - macd
      - volume_spike
    lookback_periods:
      - 1h
      - 4h
      - 1d
  
  conflict_resolution: 'weighted_average'  # 'weighted_average', 'majority_vote', 'priority'
  
  # 信号刷新频率
  refresh_interval:
    sentiment: 3600      # 1 hour
    technical: 300       # 5 minutes
    fundamental: 86400   # 1 day
```

### 信号数据库

```sql
-- 原始信号表
CREATE TABLE signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    asset_type TEXT,
    signal_type TEXT,  -- 'BUY', 'SELL', 'NEUTRAL', 'CLOSE'
    strength REAL,  -- 0-1
    confidence REAL,  -- 0-1
    timeframe TEXT,
    source TEXT,  -- 'sentiment', 'technical', etc.
    metadata JSON,  -- 详细信息
    timestamp DATETIME,
    
    INDEX idx_ticker_time (ticker, timestamp),
    INDEX idx_source (source)
);

-- 融合信号表
CREATE TABLE aggregated_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    signal_type TEXT,
    strength REAL,
    confidence REAL,
    timeframe TEXT,
    contributing_signals JSON,  -- 参与融合的信号列表
    final_score REAL,
    timestamp DATETIME,
    executed BOOLEAN DEFAULT 0,
    
    INDEX idx_ticker_time (ticker, timestamp)
);

-- 信号性能表（用于回测和优化）
CREATE TABLE signal_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signal_id INTEGER,
    ticker TEXT,
    source TEXT,
    signal_type TEXT,
    entry_price REAL,
    exit_price REAL,
    pnl REAL,
    accuracy BOOLEAN,  -- 信号方向是否正确
    signal_timestamp DATETIME,
    evaluation_timestamp DATETIME,
    
    FOREIGN KEY(signal_id) REFERENCES signals(id)
);
```

---

## 🤖 系统 2：自动交易系统

### 设计理念
- **信号驱动**：完全基于信号管理系统的输出
- **策略可配置**：不同策略对应不同信号组合
- **平台无关**：统一接口支持多交易平台
- **容错设计**：网络故障、API 限流自动重试

### 交易决策引擎

```python
class TradingEngine:
    """交易决策引擎"""
    
    def __init__(self, config: dict):
        self.signal_aggregator = SignalAggregator(config['signals'])
        self.risk_manager = RiskManager(config['risk'])
        self.traders = {}  # platform -> Trader instance
        self.strategy = config['strategy']
    
    async def process_ticker(self, ticker: str):
        """处理单个标的的交易逻辑"""
        
        # 1. 获取融合信号
        signal = self.signal_aggregator.aggregate(
            ticker=ticker,
            timeframe=self.strategy['timeframe']
        )
        
        # 2. 检查信号是否满足策略要求
        if not self._meets_strategy_criteria(signal):
            logger.info(f"{ticker}: Signal does not meet criteria")
            return
        
        # 3. 风险检查
        risk_check = self.risk_manager.check_trade(
            ticker=ticker,
            signal=signal,
            proposed_size=self._calculate_position_size(signal)
        )
        
        if not risk_check.approved:
            logger.warning(f"{ticker}: Risk check failed - {risk_check.reason}")
            return
        
        # 4. 执行交易
        await self._execute_trade(
            ticker=ticker,
            signal=signal,
            risk_params=risk_check
        )
    
    def _meets_strategy_criteria(self, signal: AggregatedSignal) -> bool:
        """检查信号是否符合策略条件"""
        
        # 最低置信度
        if signal.confidence < self.strategy['min_confidence']:
            return False
        
        # 最低强度
        if signal.strength < self.strategy['min_strength']:
            return False
        
        # 必须有明确方向
        if signal.signal_type == SignalType.NEUTRAL:
            return False
        
        return True
    
    def _calculate_position_size(self, signal: AggregatedSignal) -> float:
        """根据信号强度和置信度计算仓位大小"""
        
        base_size = self.strategy['base_position_size']
        
        # 凯利公式变体
        kelly_fraction = signal.confidence * signal.strength
        
        # 保守调整（只用凯利公式建议的 1/4）
        adjusted_fraction = kelly_fraction * 0.25
        
        return base_size * adjusted_fraction
    
    async def _execute_trade(self, ticker: str, signal: AggregatedSignal, risk_params: RiskCheck):
        """执行交易"""
        
        # 选择交易平台
        platform = self._select_platform(ticker)
        trader = self.traders[platform]
        
        # 构建订单
        order = Order(
            ticker=ticker,
            side='BUY' if signal.signal_type == SignalType.BUY else 'SELL',
            size=risk_params.approved_size,
            order_type='MARKET',
            stop_loss=risk_params.stop_loss,
            take_profit=risk_params.take_profit
        )
        
        # 提交订单
        try:
            result = await trader.place_order(order)
            
            # 记录交易
            await self._log_trade(signal, order, result)
            
            # 发送通知
            await self._notify_trade(ticker, signal, result)
            
        except Exception as e:
            logger.error(f"Failed to execute trade for {ticker}: {e}")
            await self._handle_execution_failure(ticker, signal, e)
```

### 交易策略配置

```yaml
# config/trading_strategy.yaml

strategy:
  name: "sentiment_driven_v1"
  
  # 信号要求
  min_confidence: 0.75
  min_strength: 0.60
  
  # 仓位配置
  base_position_size: 1000  # $1000
  max_position_size: 2000   # $2000
  sizing_method: 'kelly_conservative'  # 'fixed', 'kelly', 'kelly_conservative'
  
  # 时间框架
  timeframe: '4h'
  
  # 持仓时间
  max_hold_time_hours: 168  # 7 days
  
  # 止损止盈
  stop_loss_pct: 0.10      # -10%
  take_profit_pct: 0.30    # +30%
  trailing_stop: true
  
  # 执行条件
  min_liquidity: 1000000   # 最小日成交量
  avoid_earnings: true     # 避开财报日
  
  # 平台选择
  platform_rules:
    crypto: 'dydx'
    stock: 'ibkr'
    option: 'ibkr'
```

### 交易执行器基类

```python
class BaseTrader(ABC):
    """交易执行器基类"""
    
    @abstractmethod
    async def place_order(self, order: Order) -> OrderResult:
        """下单"""
        pass
    
    @abstractmethod
    async def cancel_order(self, order_id: str) -> bool:
        """撤单"""
        pass
    
    @abstractmethod
    async def get_position(self, ticker: str) -> Position:
        """获取持仓"""
        pass
    
    @abstractmethod
    async def close_position(self, ticker: str) -> OrderResult:
        """平仓"""
        pass
    
    @abstractmethod
    async def get_account_info(self) -> AccountInfo:
        """获取账户信息"""
        pass
```

---

## 🛡️ 系统 3：仓位管理和风险控制系统

### 设计理念
- **预防为主**：事前风险检查，阻止危险交易
- **实时监控**：持续追踪持仓和市场变化
- **自动执行**：止损止盈自动触发，无需人工干预
- **分层保护**：账户级 → 策略级 → 单笔交易级

### 风险管理器

```python
class RiskManager:
    """风险管理器"""
    
    def __init__(self, config: dict):
        self.config = config
        self.position_tracker = PositionTracker()
    
    def check_trade(self, ticker: str, signal: AggregatedSignal, proposed_size: float) -> RiskCheck:
        """
        交易前风险检查
        
        检查项：
        1. 账户余额是否充足
        2. 是否超过最大持仓数
        3. 单笔风险是否超限
        4. 总敞口是否超限
        5. 该标的是否已有持仓
        6. 是否在交易时间
        """
        
        # 获取当前账户状态
        account = self.position_tracker.get_account_summary()
        
        # 1. 余额检查
        if account.available_cash < proposed_size:
            return RiskCheck.rejected("Insufficient cash")
        
        # 2. 持仓数量检查
        if len(account.open_positions) >= self.config['max_open_positions']:
            return RiskCheck.rejected("Max positions reached")
        
        # 3. 单笔风险检查
        max_loss = proposed_size * self.config['max_loss_per_trade_pct']
        if max_loss > self.config['max_risk_per_trade']:
            return RiskCheck.rejected(f"Risk ${max_loss:.0f} exceeds ${self.config['max_risk_per_trade']}")
        
        # 4. 总敞口检查
        total_exposure = account.total_position_value + proposed_size
        if total_exposure > account.total_equity * self.config['max_total_exposure_pct']:
            return RiskCheck.rejected("Total exposure limit exceeded")
        
        # 5. 重复持仓检查
        if ticker in account.open_positions:
            return RiskCheck.rejected(f"Already holding {ticker}")
        
        # 6. 交易时间检查
        if not self._is_trading_hours(ticker):
            return RiskCheck.rejected("Outside trading hours")
        
        # 计算止损止盈
        stop_loss = self._calculate_stop_loss(signal, proposed_size)
        take_profit = self._calculate_take_profit(signal, proposed_size)
        
        # 批准交易
        return RiskCheck(
            approved=True,
            approved_size=proposed_size,
            stop_loss=stop_loss,
            take_profit=take_profit,
            max_loss=max_loss,
            reason="All checks passed"
        )
    
    def _calculate_stop_loss(self, signal: AggregatedSignal, size: float) -> float:
        """计算止损价格"""
        
        # 根据波动率调整止损距离
        volatility = self._get_volatility(signal.ticker)
        
        # ATR-based stop loss
        atr_multiplier = 2.0
        stop_distance = volatility * atr_multiplier
        
        # 限制在配置范围内
        max_stop_pct = self.config['max_stop_loss_pct']
        stop_distance = min(stop_distance, max_stop_pct)
        
        # TODO: 获取当前价格
        current_price = 100  # placeholder
        
        if signal.signal_type == SignalType.BUY:
            return current_price * (1 - stop_distance)
        else:
            return current_price * (1 + stop_distance)
    
    def _calculate_take_profit(self, signal: AggregatedSignal, size: float) -> float:
        """计算止盈价格"""
        
        # 风险回报比
        risk_reward_ratio = self.config['risk_reward_ratio']
        
        # TODO: 获取当前价格和止损价格
        current_price = 100
        stop_loss = 90
        
        risk = abs(current_price - stop_loss)
        reward = risk * risk_reward_ratio
        
        if signal.signal_type == SignalType.BUY:
            return current_price + reward
        else:
            return current_price - reward
```

### 持仓追踪器

```python
class PositionTracker:
    """持仓追踪器"""
    
    def __init__(self):
        self.positions = {}  # ticker -> Position
        self.db = TradesDatabase()
    
    async def monitor_positions(self):
        """持续监控所有持仓"""
        
        while True:
            for ticker, position in self.positions.items():
                try:
                    # 更新当前价格
                    current_price = await self._get_current_price(ticker)
                    position.update_price(current_price)
                    
                    # 检查止损止盈
                    if self._should_close_position(position):
                        await self._close_position(position)
                    
                    # 检查持仓时间
                    if self._is_expired(position):
                        await self._close_position(position, reason="Time limit reached")
                    
                    # 更新数据库
                    await self.db.update_position(position)
                    
                except Exception as e:
                    logger.error(f"Error monitoring {ticker}: {e}")
            
            await asyncio.sleep(60)  # 每分钟检查一次
    
    def _should_close_position(self, position: Position) -> bool:
        """判断是否应该平仓"""
        
        # 止损触发
        if position.side == 'LONG' and position.current_price <= position.stop_loss:
            return True
        if position.side == 'SHORT' and position.current_price >= position.stop_loss:
            return True
        
        # 止盈触发
        if position.side == 'LONG' and position.current_price >= position.take_profit:
            return True
        if position.side == 'SHORT' and position.current_price <= position.take_profit:
            return True
        
        return False
    
    def _is_expired(self, position: Position) -> bool:
        """检查持仓是否超时"""
        max_hold_time = timedelta(hours=168)  # 7 days
        return datetime.now() - position.opened_at > max_hold_time
    
    def get_account_summary(self) -> AccountSummary:
        """获取账户摘要"""
        
        total_value = sum(p.current_value for p in self.positions.values())
        total_pnl = sum(p.unrealized_pnl for p in self.positions.values())
        
        return AccountSummary(
            total_equity=self._get_total_equity(),
            available_cash=self._get_available_cash(),
            total_position_value=total_value,
            unrealized_pnl=total_pnl,
            open_positions=self.positions,
            num_positions=len(self.positions)
        )
```

### 风险配置

```yaml
# config/risk.yaml

risk:
  # 资金管理
  max_open_positions: 4
  max_risk_per_trade: 500       # $500
  max_loss_per_trade_pct: 0.10  # 10%
  max_total_exposure_pct: 0.50  # 50% of account
  
  # 止损止盈
  max_stop_loss_pct: 0.12       # 最大 12%
  min_stop_loss_pct: 0.05       # 最小 5%
  risk_reward_ratio: 3.0        # 3:1 盈亏比
  
  # 持仓管理
  max_hold_time_hours: 168      # 7 days
  trailing_stop_activation: 0.15  # 盈利 15% 后启用移动止损
  trailing_stop_distance: 0.05    # 移动止损距离 5%
  
  # 账户保护
  daily_loss_limit: 1000        # 单日最大亏损 $1000
  weekly_loss_limit: 2000       # 单周最大亏损 $2000
  drawdown_threshold: 0.20      # 回撤 20% 暂停交易
  
  # 杠杆控制
  max_leverage:
    crypto: 5.0
    stock: 1.0
    option: 1.0  # 期权本身已有杠杆
```

---

## 🔄 系统集成流程

```
┌─────────────────────────────────────────────────────────────┐
│                   信号管理系统                                │
├─────────────────────────────────────────────────────────────┤
│  情绪信号 → ┐                                                │
│  技术信号 → ├→ 信号融合引擎 → 融合信号                        │
│  基本面信号 → ┘                                              │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                   自动交易系统                                │
├─────────────────────────────────────────────────────────────┤
│  融合信号 → 策略检查 → 风险检查 → 订单执行 → 持仓记录         │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                仓位管理和风险控制系统                          │
├─────────────────────────────────────────────────────────────┤
│  持仓监控 → 价格追踪 → 止损止盈 → 自动平仓 → 风险报告         │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 重构后的项目结构

```
options-sentiment-engine/
├── signals/                      # 信号管理系统
│   ├── __init__.py
│   ├── base.py                   # BaseSignal 基类
│   ├── aggregator.py             # 信号融合引擎
│   ├── sentiment/                # 情绪信号模块
│   │   ├── __init__.py
│   │   ├── sentiment_signal.py   # 情绪信号实现
│   │   ├── reddit_analyzer.py
│   │   ├── unusual_options.py
│   │   └── trends_analyzer.py
│   ├── technical/                # 技术信号模块（未来）
│   │   └── __init__.py
│   └── fundamental/              # 基本面信号模块（未来）
│       └── __init__.py
│
├── trading/                      # 自动交易系统
│   ├── __init__.py
│   ├── engine.py                 # 交易决策引擎
│   ├── base_trader.py            # Trader 基类
│   ├── dydx_trader.py            # dYdX 实现
│   ├── ibkr_trader.py            # IBKR 实现
│   └── order.py                  # 订单模型
│
├── risk/                         # 风险控制系统
│   ├── __init__.py
│   ├── risk_manager.py           # 风险管理器
│   ├── position_tracker.py       # 持仓追踪器
│   └── portfolio.py              # 组合管理
│
├── database/
│   ├── signals_schema.sql        # 信号表
│   ├── trades_schema.sql         # 交易表
│   ├── signals_manager.py
│   └── trades_manager.py
│
├── config/
│   ├── signals.yaml              # 信号配置
│   ├── trading_strategy.yaml    # 交易策略
│   ├── risk.yaml                 # 风险配置
│   └── credentials.yaml          # API 密钥
│
├── data/                         # 数据采集（保留）
│   ├── reddit_scraper.py
│   ├── unusual_options.py
│   └── ...
│
├── web/                          # Web UI
│   └── ...
│
├── main_signal_collector.py     # 信号收集主程序
├── main_trading_engine.py       # 交易引擎主程序
└── main_risk_monitor.py         # 风险监控主程序
```

---

## 🔧 重构步骤

### Phase 1: 信号系统重构（本周）
1. ✅ 创建 `signals/` 模块
2. ✅ 实现 `BaseSignal` 接口
3. ✅ 重构现有情绪分析为 `SentimentSignal`
4. ✅ 实现 `SignalAggregator`
5. ✅ 创建信号数据库表
6. ✅ 更新 `hourly_runner_v2.py` 使用新架构

### Phase 2: 交易系统实现（下周）
1. 实现 `TradingEngine`
2. 实现 `dYdXTrader`
3. 实现 `IBKRTrader`
4. 集成信号系统
5. 纸上交易测试

### Phase 3: 风险系统实现（第三周）
1. 实现 `RiskManager`
2. 实现 `PositionTracker`
3. 实时监控和自动平仓
4. 回测和性能分析

---

**下一步**：开始重构现有代码，把情绪分析改造成信号系统的一部分。

需要我立即开始吗？
