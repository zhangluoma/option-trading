# Installation & Setup Guide

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd /Users/luomazhang/.openclaw/workspace/options-sentiment-engine
pip install -r requirements.txt
```

### 2. Test Manually
```bash
python test_run.py
```

This will run the full research pipeline and show you what the WhatsApp message would look like.

---

## ⏰ Automated Schedule (3 AM / 6 AM)

### Setup Cron Jobs in OpenClaw

You need to create **two cron jobs**:

#### Job 1: Run research at 3:00 AM PT
```
Schedule: 3:00 AM Pacific (every weekday)
Action: Run /Users/luomazhang/.openclaw/workspace/options-sentiment-engine/scheduler/run_at_3am.py
```

#### Job 2: Send WhatsApp at 6:00 AM PT
```
Schedule: 6:00 AM Pacific (every weekday)
Action: Run /Users/luomazhang/.openclaw/workspace/options-sentiment-engine/scheduler/notify_at_6am.py
       → Load results
       → Format for WhatsApp
       → Send via OpenClaw message tool
```

---

## 📊 Current Status

### ✅ What's Working (First Version)
- Project structure
- Configuration system (account, sentiment weights)
- Sentiment scoring logic
- Risk calculation & position sizing
- WhatsApp formatting
- Scheduler scripts

### 🚧 What Needs Real Data (Phase 2)
Currently using **mock/placeholder data** for:
- Reddit scraping (need `praw` + Reddit API key)
- Twitter monitoring (need `tweepy` + Twitter API)
- Unusual options detection (need market data provider)
- Option chain data (need `yfinance` or TDA API)

---

## 🔑 API Keys Needed (Phase 2)

To make this fully functional, you'll need:

1. **Reddit API**
   - Create app at: https://www.reddit.com/prefs/apps
   - Get: client_id, client_secret

2. **Twitter API** (optional but recommended)
   - Apply at: https://developer.twitter.com
   - Get: bearer_token

3. **Market Data** (one of):
   - yfinance (free, no key needed)
   - TD Ameritrade API (free)
   - Alpha Vantage (free tier available)

---

## 📱 WhatsApp Integration

The 6 AM notification currently prints the message.

To actually send via WhatsApp, the cron job needs access to OpenClaw's `message` tool with your WhatsApp number configured.

---

## 🧪 Testing

### Manual test (anytime):
```bash
python test_run.py
```

### Test 3 AM script:
```bash
python scheduler/run_at_3am.py
```

### Test 6 AM notification:
```bash
python scheduler/notify_at_6am.py
```

---

## 📝 Next Steps

1. **Test the structure**: Run `python test_run.py`
2. **Check config**: Review `config/*.yaml` files
3. **Add API keys**: When ready, add real scrapers
4. **Setup cron**: Configure OpenClaw cron jobs
5. **Monitor**: Check results in `results_latest.json`

---

## 🔧 Customization

### Adjust aggression level
Edit `config/account.yaml`:
- `max_risk_per_trade`: Higher = more aggressive
- `max_position_pct`: Max % per trade

### Adjust sentiment weights
Edit `config/sentiment.yaml`:
- Increase `reddit.weight` if you trust WSB more
- Increase `unusual_options.weight` for flow-based trading

---

## 🐛 Troubleshooting

**No recommendations?**
- Check `results_latest.json` for details
- Sentiment may be too weak
- Risk filters may be too strict

**Cron not running?**
- Verify OpenClaw cron is configured
- Check system timezone (should be PT)

---

## 📞 Support

Check the main README.md for architecture details.

This is **Version 1** - sentiment scoring works, but needs real data sources connected.
