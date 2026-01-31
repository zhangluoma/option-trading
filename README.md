# Options Sentiment Engine

**Sentiment-driven options research system**

Automated daily research that combines:
- 📱 Reddit sentiment (r/wallstreetbets, r/options)
- 🐦 Twitter buzz & trending tickers
- 💰 Unusual options activity (big money flow)
- 📊 Technical + fundamental filters

Then delivers **actionable recommendations** to WhatsApp every morning.

---

## 🎯 Specifications

- **Account**: $7,000
- **Style**: Aggressive (but with hard risk limits)
- **Focus**: Sentiment-first (情绪面优先)
- **Schedule**: 
  - 3:00 AM PT: Run deep research
  - 6:00 AM PT: Send results to WhatsApp

---

## 📁 Project Structure

```
options-sentiment-engine/
├── config/
│   ├── account.yaml         # $7k, risk limits, aggression level
│   └── sentiment.yaml       # Source weights (Reddit 40%, Unusual 35%, Twitter 25%)
├── data/
│   ├── reddit_scraper.py    # WSB + options subreddits
│   ├── unusual_options.py   # Big premium flow detector
│   └── twitter_monitor.py   # (TODO: Phase 2)
├── research/
│   ├── sentiment_score.py   # Combines all signals into weighted score
│   └── risk_calc.py         # Position sizing + risk management
├── scheduler/
│   ├── run_at_3am.py        # Morning research runner
│   └── notify_at_6am.py     # WhatsApp sender
├── output/
│   └── whatsapp_format.py   # Mobile-friendly message formatter
├── main.py                  # Core research pipeline
└── test_run.py              # Manual test runner
```

---

## ✅ Status: First Version Complete

### What Works Now
- ✅ Full project structure
- ✅ Sentiment scoring logic (multi-source weighted)
- ✅ Risk calculation (aggressive but controlled)
- ✅ Position sizing (contracts, max loss, % of account)
- ✅ WhatsApp formatting (mobile-optimized)
- ✅ Scheduler framework (3am/6am ready)
- ✅ Weekend/holiday detection

### What Needs Phase 2 (Real Data)
- 🚧 Reddit API connection (currently mock)
- 🚧 Unusual options scanner (need data provider)
- 🚧 Twitter scraper (optional)
- 🚧 Real option chain pricing

---

## 🚀 Quick Start

See **[INSTALL.md](INSTALL.md)** for full setup instructions.

**Quick test:**
```bash
cd /Users/luomazhang/.openclaw/workspace/options-sentiment-engine
python test_run.py
```

This runs the full pipeline with mock data to show you the output format.

---

## 🧠 How It Works

1. **3:00 AM PT** - System wakes up
   - Checks if trading day (skip weekends)
   - Scrapes Reddit for trending tickers + sentiment
   - Scans for unusual options activity (big money flow)
   - Checks Twitter for buzz (Phase 2)
   
2. **Sentiment Scoring**
   - Combines signals with weights: Reddit 40%, Unusual 35%, Twitter 25%
   - Filters by confidence (high/medium only)
   - Determines direction (bullish → calls, bearish → puts)

3. **Risk Management**
   - Max $500 risk per trade
   - Max 4 open positions
   - Max 15% of account per trade
   - Total exposure capped at 50%

4. **6:00 AM PT** - Results delivered
   - Loads recommendations from 3 AM run
   - Formats for WhatsApp (concise, mobile-friendly)
   - Sends to your phone

---

## 📊 Example Output

```
📊 Options Sentiment Report
🕐 2026-01-31 06:00 PT
━━━━━━━━━━━━━━━━━━━━

✅ 2 个推荐

🟢 1. $AAPL - BUY CALLS
🔥 信心: HIGH
💯 情绪分数: 0.82
📦 建议买入: 3 张
💸 最大亏损: $1,050
📊 占比: 15.0%
📌 原因:
   • Reddit: 85 mentions
   • Unusual: $1,200,000 call flow

━━━━━━━━━━━━━━━━━━━━
⚠️ 总风险: $1,890
💰 账户: $7,000

⏰ 记得设置止损！
```

---

## 🔧 Configuration

### Adjust Aggression
`config/account.yaml`:
```yaml
max_risk_per_trade: 500  # Increase for more risk
max_position_pct: 0.15   # Max % per trade
```

### Tune Sentiment Weights
`config/sentiment.yaml`:
```yaml
sources:
  reddit:
    weight: 0.40  # Trust Reddit more/less
  unusual_options:
    weight: 0.35  # Flow-based priority
```

---

## 🔑 Phase 2: Add Real Data

To move from mock to live:

1. **Reddit**: Add `praw` + API credentials
2. **Market data**: Add `yfinance` or TD Ameritrade API
3. **Unusual options**: Subscribe to flow data (Market Chameleon, etc.)

See [INSTALL.md](INSTALL.md) for details.

---

## 💡 Philosophy

**Sentiment-first, risk-managed, mobile-native**

- Don't fight the crowd, ride it (with limits)
- Emotion drives short-term moves
- Big money flow = institutional signal
- Always know max loss before entry

---

## 📞 Next Steps

1. **Test it**: `python test_run.py`
2. **Review configs**: Check `config/*.yaml`
3. **Setup cron**: Configure 3am/6am jobs in OpenClaw
4. **Monitor**: Check `results_latest.json` daily
5. **Phase 2**: Add real data sources when ready

---

**Version**: 1.0 (Sentiment logic complete, data sources pending)  
**Location**: `/Users/luomazhang/.openclaw/workspace/options-sentiment-engine/`
