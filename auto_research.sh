#!/bin/bash
# 自动运行 research 并保存结果
# 用于系统 cron 或 launchd

cd /Users/luomazhang/.openclaw/workspace/options-sentiment-engine

# 运行 research
python3 scheduler/run_at_3am.py >> logs/research.log 2>&1

echo "Research completed at $(date)" >> logs/research.log
