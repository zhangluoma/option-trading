#!/bin/bash
##
## 实时监控持仓 - 每30秒刷新一次
##

while true; do
  clear
  
  echo "============================================"
  echo "🚀 实时持仓监控"
  echo "📅 $(date '+%Y-%m-%d %H:%M:%S')"
  echo "============================================"
  echo ""
  
  # 守护进程状态
  if [ -f "./data/trader.pid" ]; then
    PID=$(cat "./data/trader.pid")
    if ps -p $PID > /dev/null 2>&1; then
      UPTIME=$(ps -p $PID -o etime= | tr -d ' ')
      echo "✅ 守护进程运行中 (PID: $PID, 运行: $UPTIME)"
    else
      echo "❌ 守护进程未运行"
    fi
  else
    echo "❌ 守护进程未运行"
  fi
  echo ""
  
  # 资金状态
  python3 << 'EOF'
import json
from datetime import datetime
import sys

try:
  # 读取持仓
  with open('./data/active_positions.json') as f:
    positions = json.load(f)
  
  initial_equity = 162.25
  total_invested = sum(p['size'] * p['entryPrice'] for p in positions)
  utilization = (total_invested / initial_equity * 100) if initial_equity > 0 else 0
  
  print(f"💰 资金状态:")
  print(f"   初始: ${initial_equity:.2f}")
  print(f"   投入: ${total_invested:.2f}")
  print(f"   可用: ${initial_equity - total_invested:.2f}")
  print(f"   利用率: {utilization:.1f}%")
  print(f"   目标: $5000.00 ({initial_equity/5000*100:.1f}%)")
  print("")
  
  # 持仓详情
  print(f"📊 活跃持仓 ({len(positions)}个):")
  print("")
  
  if not positions:
    print("   无持仓")
  else:
    for pos in positions:
      ticker = pos['ticker']
      side = pos['side']
      size = pos['size']
      entry = pos['entryPrice']
      value = size * entry
      
      # 计算持仓时间
      opened = datetime.fromisoformat(pos['openedAt'])
      hours = (datetime.now() - opened).total_seconds() / 3600
      
      # 获取当前价格（简化版，用开仓价）
      current_price = entry
      max_pnl = pos.get('maxPnlPercent', 0)
      
      print(f"   {ticker:6s} {side:5s}")
      print(f"      数量: {size:.4f}")
      print(f"      开仓: ${entry:.4f}")
      print(f"      价值: ${value:.2f}")
      print(f"      时间: {hours:.1f}h")
      if max_pnl > 0:
        print(f"      最高: +{max_pnl:.2f}%")
      print("")

except Exception as e:
  print(f"Error: {e}")
  import traceback
  traceback.print_exc()
EOF
  
  # 最近活动
  echo "📜 最近活动 (3条):"
  if [ -f "./logs/auto_trader.log" ]; then
    tail -50 ./logs/auto_trader.log | grep -E "Order submitted|Position closed|Stop|Profit" | tail -3 | while read line; do
      echo "   $line" | cut -c 1-100
    done
  fi
  echo ""
  
  echo "============================================"
  echo "⏰ 下次刷新: 30秒后 (Ctrl+C 退出)"
  echo "============================================"
  
  sleep 30
done
