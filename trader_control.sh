#!/bin/bash
##
## 自动交易守护进程控制脚本
##
## 用法：
##   ./trader_control.sh start          # 启动守护进程
##   ./trader_control.sh start-dry-run  # 启动（模拟模式）
##   ./trader_control.sh stop           # 停止守护进程
##   ./trader_control.sh status         # 查看状态
##   ./trader_control.sh logs           # 查看日志
##   ./trader_control.sh positions      # 查看持仓
##

DAEMON_SCRIPT="./auto_trader_daemon.js"
PID_FILE="./data/trader.pid"
LOG_FILE="./logs/auto_trader.log"
POSITIONS_FILE="./data/active_positions.json"

function start() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p $PID > /dev/null 2>&1; then
            echo "❌ Daemon already running (PID: $PID)"
            exit 1
        else
            echo "⚠️  Stale PID file found, removing..."
            rm "$PID_FILE"
        fi
    fi
    
    echo "🚀 Starting auto trader daemon..."
    
    # 创建必要的目录
    mkdir -p logs data
    
    # 启动守护进程
    if [ "$1" == "dry-run" ]; then
        nohup node "$DAEMON_SCRIPT" --dry-run >> "$LOG_FILE" 2>&1 &
        echo "🧪 Started in DRY RUN mode"
    else
        nohup node "$DAEMON_SCRIPT" >> "$LOG_FILE" 2>&1 &
        echo "✅ Started in LIVE mode"
    fi
    
    PID=$!
    echo $PID > "$PID_FILE"
    echo "   PID: $PID"
    echo "   Log: $LOG_FILE"
    echo ""
    echo "Run './trader_control.sh status' to check status"
    echo "Run './trader_control.sh logs' to view logs"
}

function stop() {
    if [ ! -f "$PID_FILE" ]; then
        echo "❌ No PID file found. Is the daemon running?"
        exit 1
    fi
    
    PID=$(cat "$PID_FILE")
    
    if ! ps -p $PID > /dev/null 2>&1; then
        echo "⚠️  Process $PID not found"
        rm "$PID_FILE"
        exit 1
    fi
    
    echo "🛑 Stopping daemon (PID: $PID)..."
    kill -TERM $PID
    
    # 等待进程结束
    for i in {1..10}; do
        if ! ps -p $PID > /dev/null 2>&1; then
            echo "✅ Daemon stopped"
            rm "$PID_FILE"
            exit 0
        fi
        sleep 1
    done
    
    echo "⚠️  Force killing..."
    kill -9 $PID
    rm "$PID_FILE"
    echo "✅ Daemon killed"
}

function status() {
    if [ ! -f "$PID_FILE" ]; then
        echo "❌ Daemon not running"
        exit 1
    fi
    
    PID=$(cat "$PID_FILE")
    
    if ! ps -p $PID > /dev/null 2>&1; then
        echo "❌ Process not found (stale PID file)"
        rm "$PID_FILE"
        exit 1
    fi
    
    echo "✅ Daemon running"
    echo "   PID: $PID"
    echo "   Uptime: $(ps -p $PID -o etime= | tr -d ' ')"
    echo "   CPU: $(ps -p $PID -o %cpu= | tr -d ' ')%"
    echo "   Memory: $(ps -p $PID -o rss= | awk '{printf "%.1f MB", $1/1024}')"
    echo ""
    
    # 显示持仓信息
    if [ -f "$POSITIONS_FILE" ]; then
        POSITION_COUNT=$(cat "$POSITIONS_FILE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(len(data))")
        echo "📊 Active positions: $POSITION_COUNT"
    fi
    
    # 显示最后几行日志
    if [ -f "$LOG_FILE" ]; then
        echo ""
        echo "📄 Recent logs:"
        tail -5 "$LOG_FILE" | sed 's/^/   /'
    fi
}

function logs() {
    if [ ! -f "$LOG_FILE" ]; then
        echo "❌ No log file found"
        exit 1
    fi
    
    tail -f "$LOG_FILE"
}

function positions() {
    if [ ! -f "$POSITIONS_FILE" ]; then
        echo "❌ No positions file found"
        exit 1
    fi
    
    echo "📊 Active Positions:"
    echo ""
    cat "$POSITIONS_FILE" | python3 -c "
import sys, json
from datetime import datetime

data = json.load(sys.stdin)

if not data:
    print('   No active positions')
else:
    for pos in data:
        opened = datetime.fromisoformat(pos['openedAt'])
        hours_held = (datetime.now() - opened).total_seconds() / 3600
        print(f\"   {pos['ticker']:6s} {pos['side']:5s} {pos['size']:.4f} @ \${pos['entryPrice']:.2f}   Held: {hours_held:.1f}h\")
"
}

# 主逻辑
case "$1" in
    start)
        start
        ;;
    start-dry-run)
        start dry-run
        ;;
    stop)
        stop
        ;;
    status)
        status
        ;;
    logs)
        logs
        ;;
    positions)
        positions
        ;;
    restart)
        stop
        sleep 2
        start
        ;;
    *)
        echo "Usage: $0 {start|start-dry-run|stop|status|logs|positions|restart}"
        exit 1
        ;;
esac
