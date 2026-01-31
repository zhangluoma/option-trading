"""
Main research engine
Combines sentiment signals → filters → outputs recommendations
"""

import yaml
from pathlib import Path
from datetime import datetime

# Import modules
from data.reddit_scraper import scrape_reddit_sentiment
from data.unusual_options import scan_tickers_for_unusual
from data.market_data import find_best_option
from data.google_trends import get_search_trends
from data.yahoo_finance_scraper import scan_tickers_yahoo
from research.sentiment_score import combine_sentiment_signals
from research.risk_calc import apply_aggressive_filters, load_account_config


def load_sentiment_config():
    """Load sentiment configuration"""
    config_path = Path(__file__).parent / 'config' / 'sentiment.yaml'
    with open(config_path) as f:
        return yaml.safe_load(f)


def run_research():
    """
    Main research pipeline
    Returns: List of recommended options plays
    """
    
    print("=" * 60)
    print(f"Options Sentiment Engine - {datetime.now().strftime('%Y-%m-%d %H:%M PT')}")
    print("=" * 60)
    
    # Load configs
    sentiment_config = load_sentiment_config()
    account_config = load_account_config()
    
    print(f"\n[1/5] Scraping Reddit sentiment...")
    reddit_data = scrape_reddit_sentiment(
        subreddits=sentiment_config['sources']['reddit']['subreddits'],
        lookback_hours=sentiment_config['sources']['reddit']['lookback_hours'],
        min_upvotes=sentiment_config['sources']['reddit']['min_upvotes']
    )
    print(f"   → Found {len(reddit_data)} tickers")
    
    print(f"\n[2/5] Scanning unusual options activity...")
    # Get tickers from Reddit first, then scan for unusual activity
    reddit_tickers = [r['ticker'] for r in reddit_data]
    unusual_data = scan_tickers_for_unusual(
        reddit_tickers,
        min_premium=sentiment_config['sources']['unusual_options']['min_premium']
    )
    print(f"   → Found {len(unusual_data)} tickers with significant flow")
    
    print(f"\n[3/5] Scanning Google Trends & Yahoo Finance...")
    # Get trends for Reddit tickers
    reddit_tickers = [r['ticker'] for r in reddit_data]
    trends_data = get_search_trends(reddit_tickers[:20], timeframe='now 7-d')  # Increased to 20
    yahoo_data = scan_tickers_yahoo(reddit_tickers[:20])  # Increased to 20
    print(f"   → Trends: {len(trends_data)}, Yahoo: {len(yahoo_data)}")
    
    print(f"\n[4/5] Combining sentiment signals...")
    combined_signals = combine_sentiment_signals(
        reddit_data, 
        yahoo_data, 
        unusual_data,
        trends_data
    )
    print(f"   → {len(combined_signals)} high-conviction signals")
    
    print(f"\n[5/5] Applying risk filters & position sizing...")
    recommendations = apply_aggressive_filters(combined_signals, account_config)
    print(f"   → {len(recommendations)} final recommendations")
    
    print("\n" + "=" * 60)
    print("RECOMMENDATIONS")
    print("=" * 60)
    
    if not recommendations:
        print("\n❌ No trades meet criteria today.")
        print("Reasons: Low sentiment, high risk, or market conditions unfavorable.")
        return []
    
    for i, rec in enumerate(recommendations, 1):
        print(f"\n✅ #{i} - {rec['ticker']} ({rec['direction'].upper()})")
        print(f"   Structure: {rec['structure']}")
        print(f"   Sentiment: {rec['sentiment_score']} ({rec['confidence']} confidence)")
        print(f"   Position: {rec['position']['contracts']} contracts")
        print(f"   Max Loss: ${rec['position']['max_loss']:,}")
        print(f"   % of Account: {rec['position']['pct_of_account'] * 100:.1f}%")
        print(f"   Reasons:")
        for reason in rec['reasons']:
            print(f"      - {reason}")
    
    print("\n" + "=" * 60)
    
    return recommendations


if __name__ == "__main__":
    recommendations = run_research()
