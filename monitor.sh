#!/bin/bash
##
## 实时监控脚本 - 显示系统运行状态
##

clear

echo "========================================"
echo "🚀 自动交易系统监控"
echo "📅 $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"
echo ""

# 守护进程状态
if [ -f "./data/trader.pid" ]; then
  PID=$(cat "./data/trader.pid")
  if ps -p $PID > /dev/null 2>&1; then
    UPTIME=$(ps -p $PID -o etime= | tr -d ' ')
    echo "✅ 守护进程运行中"
    echo "   PID: $PID"
    echo "   运行时间: $UPTIME"
  else
    echo "❌ 守护进程未运行"
  fi
else
  echo "❌ 守护进程未运行"
fi
echo ""

# 活跃持仓
echo "📊 活跃持仓:"
if [ -f "./data/active_positions.json" ]; then
  python3 << 'EOF'
import json
from datetime import datetime

try:
  with open('./data/active_positions.json') as f:
    positions = json.load(f)
  
  if not positions:
    print("   无持仓")
  else:
    for pos in positions:
      opened = datetime.fromisoformat(pos['openedAt'])
      hours = (datetime.now() - opened).total_seconds() / 3600
      print(f"   {pos['ticker']:6s} {pos['side']:5s} {pos['size']:.4f} @ ${pos['entryPrice']:.2f}  ({hours:.1f}h)")
except:
  print("   读取失败")
EOF
else
  echo "   无数据文件"
fi
echo ""

# 性能统计
echo "📈 性能统计:"
if [ -f "./data/performance.json" ]; then
  python3 << 'EOF'
import json

try:
  with open('./data/performance.json') as f:
    stats = json.load(f)
  
  total_pnl = stats.get('totalPnl', 0)
  total_trades = stats.get('totalTrades', 0)
  win_rate = stats.get('winRate', 0)
  
  print(f"   总交易: {total_trades}")
  print(f"   胜率: {win_rate:.1f}%")
  print(f"   总盈亏: ${total_pnl:.2f}")
  print(f"   当前资金: ${162.25 + total_pnl:.2f}")
except:
  print("   读取失败")
EOF
else
  echo "   总交易: 0"
  echo "   胜率: 0%"
  echo "   总盈亏: $0.00"
  echo "   当前资金: $162.25"
fi
echo ""

# 最近日志
echo "📜 最近日志 (最后5条):"
if [ -f "./logs/auto_trader.log" ]; then
  tail -10 ./logs/auto_trader.log | grep -E "\[INFO\]|\[ERROR\]|\[WARN\]" | tail -5 | while read line; do
    echo "   $line" | cut -c 1-100
  done
else
  echo "   无日志文件"
fi
echo ""

echo "========================================"
echo "按 Ctrl+C 退出"
echo "========================================"
