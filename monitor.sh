#!/bin/bash
# 实时监控脚本

clear
echo "==============================================="
echo "📊 dYdX自动交易系统 - 实时监控"
echo "==============================================="
echo ""

while true; do
  # 获取当前时间
  echo "⏰ 更新时间: $(date '+%Y-%m-%d %H:%M:%S')"
  echo ""
  
  # 守护进程状态
  if pgrep -f "auto_trader_daemon.js" > /dev/null; then
    PID=$(pgrep -f "auto_trader_daemon.js")
    UPTIME=$(ps -p $PID -o etime= | tr -d ' ')
    echo "✅ 守护进程运行中 (PID: $PID, 运行时间: $UPTIME)"
  else
    echo "❌ 守护进程未运行"
  fi
  echo ""
  
  # 账户状态（从日志提取）
  echo "💰 账户状态:"
  grep "Account: Equity=" logs/auto_trader.log | tail -1 | sed 's/.*Account: /   /'
  echo ""
  
  # 持仓P&L
  echo "📈 持仓表现:"
  grep -E "(BTC:|LINK:|DOGE:|ATOM:).*(PnL:)" logs/auto_trader.log | tail -4 | sed 's/.*INFO\] /   /'
  echo ""
  
  # 最近活动
  echo "📝 最近活动:"
  tail -5 logs/auto_trader.log | grep -v "^$" | sed 's/.*INFO\] /   /'
  echo ""
  
  echo "==============================================="
  echo "按 Ctrl+C 退出监控"
  echo ""
  
  sleep 10
  clear
done
