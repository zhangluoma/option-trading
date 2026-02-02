#!/bin/bash
##
## 综合Dashboard - 一键查看所有信息
##

clear

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  🚀 $160 → $5000 挑战 - 实时Dashboard                    ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "📅 $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo ""

# 1. 守护进程状态
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🤖 守护进程状态"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f "./data/trader.pid" ]; then
  PID=$(cat "./data/trader.pid")
  if ps -p $PID > /dev/null 2>&1; then
    UPTIME=$(ps -p $PID -o etime= | tr -d ' ')
    CPU=$(ps -p $PID -o %cpu= | tr -d ' ')
    MEM=$(ps -p $PID -o rss= | awk '{printf "%.1f MB", $1/1024}')
    echo "✅ 运行中"
    echo "   PID: $PID"
    echo "   运行时间: $UPTIME"
    echo "   CPU: ${CPU}%"
    echo "   内存: $MEM"
  else
    echo "❌ 未运行 (请执行: ./trader_control.sh start)"
  fi
else
  echo "❌ 未运行 (请执行: ./trader_control.sh start)"
fi
echo ""

# 2. 资金和进度
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💰 资金状况"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

python3 << 'PYEOF'
import json
from pathlib import Path

try:
  # 读取持仓
  positions_file = Path('./data/active_positions.json')
  history_file = Path('./data/trade_history.json')
  
  positions = []
  if positions_file.exists():
    with open(positions_file) as f:
      positions = json.load(f)
  
  history = []
  if history_file.exists():
    with open(history_file) as f:
      history = json.load(f)
  
  initial = 162.25
  invested = sum(p['size'] * p['entryPrice'] for p in positions)
  
  # 计算已实现盈亏
  closed_trades = [t for t in history if t.get('status') == 'CLOSED']
  realized_pnl = sum(t.get('pnl', 0) for t in closed_trades)
  
  current_equity = initial + realized_pnl
  progress = (current_equity / 5000) * 100
  
  print(f"起始资金:   ${initial:.2f}")
  print(f"已实现盈亏: ${realized_pnl:+.2f}")
  print(f"当前资金:   ${current_equity:.2f}")
  print(f"已投入:     ${invested:.2f}")
  print(f"可用余额:   ${current_equity - invested:.2f}")
  print(f"")
  print(f"目标:       $5000.00")
  print(f"进度:       {progress:.1f}%")
  print(f"距离目标:   ${5000 - current_equity:.2f}")
  
  # 进度条
  bar_width = 40
  filled = int(bar_width * progress / 100)
  bar = '█' * filled + '░' * (bar_width - filled)
  print(f"[{bar}] {progress:.1f}%")
  
except Exception as e:
  print(f"Error: {e}")
PYEOF

echo ""

# 3. 持仓详情
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 活跃持仓"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

python3 << 'PYEOF'
import json
from datetime import datetime
from pathlib import Path

try:
  positions_file = Path('./data/active_positions.json')
  
  if not positions_file.exists():
    print("无持仓")
  else:
    with open(positions_file) as f:
      positions = json.load(f)
    
    if not positions:
      print("无持仓")
    else:
      for i, pos in enumerate(positions, 1):
        ticker = pos['ticker']
        side = pos['side']
        size = pos['size']
        entry = pos['entryPrice']
        value = size * entry
        
        opened = datetime.fromisoformat(pos['openedAt'])
        hours = (datetime.now() - opened).total_seconds() / 3600
        
        max_pnl = pos.get('maxPnlPercent', 0)
        
        print(f"{i}. {ticker} {side}")
        print(f"   数量: {size:.4f} @ ${entry:.4f} = ${value:.2f}")
        print(f"   时间: {hours:.1f}h / 4h")
        if max_pnl > 0:
          print(f"   最高: +{max_pnl:.2f}%")
        print("")
except Exception as e:
  print(f"Error: {e}")
PYEOF

# 4. 交易统计
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📈 交易统计"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

python3 << 'PYEOF'
import json
from pathlib import Path

try:
  history_file = Path('./data/trade_history.json')
  
  if not history_file.exists() or not history_file.stat().st_size:
    print("总交易: 0")
    print("胜率: N/A")
    print("总盈亏: $0.00")
  else:
    with open(history_file) as f:
      history = json.load(f)
    
    closed = [t for t in history if t.get('status') == 'CLOSED']
    
    if not closed:
      print("总交易: 0")
      print("胜率: N/A")
      print("总盈亏: $0.00")
    else:
      wins = sum(1 for t in closed if t.get('pnl', 0) > 0)
      total = len(closed)
      win_rate = (wins / total * 100) if total > 0 else 0
      total_pnl = sum(t.get('pnl', 0) for t in closed)
      
      print(f"总交易: {total}")
      print(f"盈利: {wins} | 亏损: {total - wins}")
      print(f"胜率: {win_rate:.1f}%")
      print(f"总盈亏: ${total_pnl:+.2f}")
      
      if wins > 0:
        avg_win = sum(t['pnl'] for t in closed if t['pnl'] > 0) / wins
        print(f"平均盈利: ${avg_win:.2f}")
      
      if total - wins > 0:
        avg_loss = sum(t['pnl'] for t in closed if t['pnl'] < 0) / (total - wins)
        print(f"平均亏损: ${avg_loss:.2f}")

except Exception as e:
  print(f"Error: {e}")
PYEOF

echo ""

# 5. 最近活动
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📜 最近活动 (5条)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f "./logs/auto_trader.log" ]; then
  tail -100 ./logs/auto_trader.log | \
    grep -E "\[INFO\].*Order submitted|\[INFO\].*Position closed|\[ERROR\]" | \
    tail -5 | \
    while read line; do
      TIME=$(echo "$line" | grep -o '\[.*Z\]' | sed 's/\[//;s/\]//')
      MSG=$(echo "$line" | sed 's/.*\[INFO\] *//' | sed 's/.*\[ERROR\] *//')
      echo "• $MSG"
    done
else
  echo "无日志文件"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 Web UI: http://192.168.88.23:3456/trading_ui_enhanced.html"
echo "📊 GitHub: https://github.com/zhangluoma/option-trading"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
