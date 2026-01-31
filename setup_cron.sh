#!/bin/bash
# Setup cron for hourly sentiment collection

# Create cron entry
CRON_CMD="0 * * * * cd /Users/luomazhang/.openclaw/workspace/options-sentiment-engine && /usr/local/bin/python3 hourly_runner.py >> /tmp/sentiment_hourly.log 2>&1"

# Add to crontab
(crontab -l 2>/dev/null || true; echo "$CRON_CMD") | crontab -

echo "✅ Cron job added!"
echo "Will run every hour at :00"
echo ""
echo "Check with: crontab -l"
echo "View logs: tail -f /tmp/sentiment_hourly.log"
