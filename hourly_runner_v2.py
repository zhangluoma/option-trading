"""
Enhanced hourly sentiment tracker
Supports both stocks and cryptocurrencies
"""

import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))

from data.reddit_scraper import scrape_reddit_sentiment
from data.yahoo_finance_scraper import scan_tickers_yahoo
from data.google_trends import get_search_trends
from data.unusual_options import scan_tickers_for_unusual
from data.coingecko_data import get_crypto_price, get_fear_greed_index
from database.db_manager import save_post, save_snapshot, init_database
from config import load_sentiment_config


def process_reddit_data(reddit_data, asset_type='stock'):
    """Process Reddit posts and save to database"""
    new_posts_count = 0
    
    for item in reddit_data:
        ticker = item['ticker']
        
        for post in item.get('top_posts', []):
            post_data = {
                'post_id': f"reddit_{post.get('subreddit', 'unknown')}_{post['score']}_{ticker}_{int(datetime.now().timestamp())}",
                'source': 'reddit',
                'asset_type': asset_type,
                'ticker': ticker,
                'title': post.get('title', ''),
                'content': '',
                'url': '',
                'author': '',
                'score': post.get('score', 0),
                'created_at': datetime.now(),
                'sentiment_score': item['sentiment']
            }
            
            if save_post(post_data):
                new_posts_count += 1
    
    return new_posts_count


def run_hourly_collection():
    """Run one iteration of data collection for both stocks and crypto"""
    
    print("\n" + "="*60)
    print(f"Hourly Sentiment Collection - {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("="*60)
    
    try:
        init_database()
    except:
        pass
    
    config = load_sentiment_config()
    snapshot_time = datetime.now().replace(minute=0, second=0, microsecond=0)
    
    # ============== STOCKS ==============
    print("\n" + "🏦 " * 20)
    print("STOCKS")
    print("🏦 " * 20)
    
    print("\n[1/4] Scraping Reddit (stocks)...")
    stock_reddit = scrape_reddit_sentiment(
        subreddits=config['sources']['reddit']['stock_subreddits'],
        lookback_hours=1,
        min_upvotes=config['sources']['reddit']['min_upvotes'],
        asset_type='stock'
    )
    new_stock_posts = process_reddit_data(stock_reddit, 'stock')
    print(f"   → {len(stock_reddit)} tickers, {new_stock_posts} new posts")
    
    # Continue with stocks data...
    stock_tickers = [r['ticker'] for r in stock_reddit][:15]
    
    print("\n[2/4] Fetching trends & Yahoo (stocks)...")
    stock_trends = get_search_trends(stock_tickers, timeframe='now 1-d')
    stock_yahoo = scan_tickers_yahoo(stock_tickers)
    print(f"   → Trends: {len(stock_trends)}, Yahoo: {len(stock_yahoo)}")
    
    print("\n[3/4] Scanning unusual options...")
    unusual_data = scan_tickers_for_unusual(stock_tickers)
    print(f"   → {len(unusual_data)} with flow")
    
    # Save stock snapshots
    print("\n[4/4] Saving stock snapshots...")
    save_snapshots(stock_reddit, stock_trends, stock_yahoo, unusual_data, snapshot_time, 'stock')
    
    # ============== CRYPTO ==============
    print("\n" + "₿ " * 20)
    print("CRYPTOCURRENCIES")
    print("₿ " * 20)
    
    print("\n[1/3] Scraping Reddit (crypto)...")
    crypto_reddit = scrape_reddit_sentiment(
        subreddits=config['sources']['reddit']['crypto_subreddits'],
        lookback_hours=1,
        min_upvotes=config['sources']['reddit']['min_upvotes'],
        asset_type='crypto'
    )
    new_crypto_posts = process_reddit_data(crypto_reddit, 'crypto')
    print(f"   → {len(crypto_reddit)} coins, {new_crypto_posts} new posts")
    
    print("\n[2/3] Fetching CoinGecko data...")
    crypto_symbols = [r['ticker'] for r in crypto_reddit][:20]
    crypto_prices = get_crypto_price(crypto_symbols)
    print(f"   → Prices for {len(crypto_prices)} coins")
    
    print("\n[3/3] Fear & Greed Index...")
    fear_greed = get_fear_greed_index()
    if fear_greed:
        print(f"   → {fear_greed['value']}/100 - {fear_greed['classification']}")
    
    # Save crypto snapshots
    print("\n[4/3] Saving crypto snapshots...")
    save_crypto_snapshots(crypto_reddit, crypto_prices, fear_greed, snapshot_time)
    
    print("\n✅ Hourly collection complete!\n")


def save_snapshots(reddit_data, trends_dict, yahoo_data, unusual_data, snapshot_time, asset_type):
    """Save snapshots for stocks"""
    yahoo_dict = {item['ticker']: item for item in yahoo_data}
    unusual_dict = {item['ticker']: item for item in unusual_data}
    
    count = 0
    for item in reddit_data:
        ticker = item['ticker']
        yahoo_item = yahoo_dict.get(ticker, {})
        trends_item = trends_dict.get(ticker, {})
        unusual_item = unusual_dict.get(ticker, {})
        
        # Calculate combined sentiment
        weights = {'reddit': 0.35, 'yahoo': 0.15, 'unusual': 0.35, 'trends': 0.15}
        
        reddit_sent = item.get('sentiment', 0.5)
        yahoo_sent = yahoo_item.get('sentiment', 0.5)
        
        unusual_sent = 0.5
        if unusual_item:
            if unusual_item.get('direction') == 'bullish':
                unusual_sent = min(unusual_item.get('signal_strength', 0.5) + 0.3, 1.0)
            elif unusual_item.get('direction') == 'bearish':
                unusual_sent = max(0.5 - unusual_item.get('signal_strength', 0), 0)
        
        trends_sent = 0.5
        if trends_item:
            trends_sent = min(trends_item.get('current_interest', 0) / 50, 1.0)
        
        combined = (
            reddit_sent * weights['reddit'] +
            yahoo_sent * weights['yahoo'] +
            unusual_sent * weights['unusual'] +
            trends_sent * weights['trends']
        )
        
        snapshot_data = {
            'asset_type': asset_type,
            'ticker': ticker,
            'snapshot_time': snapshot_time,
            'reddit_sentiment': reddit_sent,
            'reddit_mentions': item.get('mentions', 0),
            'yahoo_sentiment': yahoo_sent,
            'yahoo_mentions': yahoo_item.get('headlines', 0),
            'trends_interest': trends_item.get('current_interest', 0) if trends_item else 0,
            'unusual_flow': unusual_item.get('total_premium_flow', 0) if unusual_item else 0,
            'combined_sentiment': round(combined, 3),
            'total_mentions': item.get('mentions', 0) + yahoo_item.get('headlines', 0),
            'new_posts_this_hour': 0
        }
        
        save_snapshot(snapshot_data)
        count += 1
    
    print(f"   → Saved {count} snapshots")


def save_crypto_snapshots(crypto_reddit, crypto_prices, fear_greed, snapshot_time):
    """Save snapshots for cryptocurrencies"""
    count = 0
    
    for item in crypto_reddit:
        symbol = item['ticker']
        price_data = crypto_prices.get(symbol, {})
        
        reddit_sent = item.get('sentiment', 0.5)
        
        # Use price change as additional sentiment signal
        price_change = price_data.get('price_change_24h', 0)
        price_sent = 0.5
        if price_change > 5:
            price_sent = 0.7
        elif price_change > 10:
            price_sent = 0.85
        elif price_change < -5:
            price_sent = 0.3
        elif price_change < -10:
            price_sent = 0.15
        
        # Fear & Greed Index as market-wide sentiment
        fg_sent = 0.5
        if fear_greed:
            fg_sent = fear_greed['value'] / 100
        
        # Combined crypto sentiment
        combined = (
            reddit_sent * 0.5 +
            price_sent * 0.3 +
            fg_sent * 0.2
        )
        
        snapshot_data = {
            'asset_type': 'crypto',
            'ticker': symbol,
            'snapshot_time': snapshot_time,
            'reddit_sentiment': reddit_sent,
            'reddit_mentions': item.get('mentions', 0),
            'yahoo_sentiment': price_sent,  # Use as price sentiment proxy
            'yahoo_mentions': 0,
            'trends_interest': fear_greed['value'] if fear_greed else 50,
            'unusual_flow': int(price_data.get('volume_24h', 0)),
            'combined_sentiment': round(combined, 3),
            'total_mentions': item.get('mentions', 0),
            'new_posts_this_hour': 0
        }
        
        save_snapshot(snapshot_data)
        count += 1
    
    print(f"   → Saved {count} snapshots")


if __name__ == "__main__":
    run_hourly_collection()
