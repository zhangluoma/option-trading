"""
Hourly sentiment tracker
Runs continuously, saves to database
"""

import sys
from pathlib import Path
from datetime import datetime, timedelta

# Add parent dir to path
sys.path.insert(0, str(Path(__file__).parent))

from data.reddit_scraper import scrape_reddit_sentiment
from data.yahoo_finance_scraper import scan_tickers_yahoo
from data.google_trends import get_search_trends
from data.unusual_options import scan_tickers_for_unusual
from database.db_manager import save_post, save_snapshot, init_database
from config import load_sentiment_config


def process_reddit_data(reddit_data):
    """Process Reddit posts and save to database"""
    new_posts_count = 0
    
    for item in reddit_data:
        ticker = item['ticker']
        
        # Save each top post
        for post in item.get('top_posts', []):
            post_data = {
                'post_id': f"reddit_{post.get('subreddit', 'unknown')}_{post['score']}_{ticker}",  # Simplified ID
                'source': 'reddit',
                'ticker': ticker,
                'title': post.get('title', ''),
                'content': '',
                'url': '',
                'author': '',
                'score': post.get('score', 0),
                'created_at': datetime.now(),  # Reddit scraper doesn't return exact time
                'sentiment_score': item['sentiment']
            }
            
            if save_post(post_data):
                new_posts_count += 1
    
    return new_posts_count


def run_hourly_collection():
    """Run one iteration of data collection"""
    
    print("\n" + "="*60)
    print(f"Hourly Sentiment Collection - {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("="*60)
    
    # Initialize database if needed
    try:
        init_database()
    except:
        pass  # Already initialized
    
    # Load config
    config = load_sentiment_config()
    
    # Step 1: Scrape Reddit
    print("\n[1/4] Scraping Reddit...")
    reddit_data = scrape_reddit_sentiment(
        subreddits=config['sources']['reddit']['subreddits'],
        lookback_hours=1,  # Only last hour
        min_upvotes=config['sources']['reddit']['min_upvotes']
    )
    
    new_reddit_posts = process_reddit_data(reddit_data)
    print(f"   → {len(reddit_data)} tickers, {new_reddit_posts} new posts")
    
    # Step 2: Get trends and yahoo for top tickers
    reddit_tickers = [r['ticker'] for r in reddit_data][:15]
    
    print("\n[2/4] Fetching Google Trends...")
    trends_data = get_search_trends(reddit_tickers, timeframe='now 1-d')
    print(f"   → {len(trends_data)} tickers")
    
    print("\n[3/4] Fetching Yahoo Finance...")
    yahoo_data = scan_tickers_yahoo(reddit_tickers)
    print(f"   → {len(yahoo_data)} tickers")
    
    print("\n[4/4] Scanning unusual options...")
    unusual_data = scan_tickers_for_unusual(reddit_tickers)
    print(f"   → {len(unusual_data)} tickers with flow")
    
    # Step 3: Aggregate and save snapshots
    print("\n[5/5] Saving hourly snapshots...")
    
    # Create lookup dicts
    yahoo_dict = {item['ticker']: item for item in yahoo_data}
    trends_dict = trends_data
    unusual_dict = {item['ticker']: item for item in unusual_data}
    
    snapshot_time = datetime.now().replace(minute=0, second=0, microsecond=0)
    snapshots_saved = 0
    
    for reddit_item in reddit_data:
        ticker = reddit_item['ticker']
        
        # Get data from other sources
        yahoo_item = yahoo_dict.get(ticker, {})
        trends_item = trends_dict.get(ticker, {})
        unusual_item = unusual_dict.get(ticker, {})
        
        # Calculate combined sentiment (weighted average)
        weights = {
            'reddit': 0.35,
            'yahoo': 0.15,
            'unusual': 0.35,
            'trends': 0.15
        }
        
        reddit_sent = reddit_item.get('sentiment', 0.5)
        yahoo_sent = yahoo_item.get('sentiment', 0.5)
        
        # Convert unusual flow to sentiment (bullish flow = higher sentiment)
        unusual_sent = 0.5
        if unusual_item:
            if unusual_item.get('direction') == 'bullish':
                unusual_sent = min(unusual_item.get('signal_strength', 0.5) + 0.3, 1.0)
            elif unusual_item.get('direction') == 'bearish':
                unusual_sent = max(0.5 - unusual_item.get('signal_strength', 0), 0)
        
        # Trends interest as sentiment proxy
        trends_sent = 0.5
        if trends_item:
            interest = trends_item.get('current_interest', 0)
            trends_sent = min(interest / 50, 1.0)
        
        combined = (
            reddit_sent * weights['reddit'] +
            yahoo_sent * weights['yahoo'] +
            unusual_sent * weights['unusual'] +
            trends_sent * weights['trends']
        )
        
        snapshot_data = {
            'ticker': ticker,
            'snapshot_time': snapshot_time,
            'reddit_sentiment': reddit_sent,
            'reddit_mentions': reddit_item.get('mentions', 0),
            'yahoo_sentiment': yahoo_sent,
            'yahoo_mentions': yahoo_item.get('headlines', 0),
            'trends_interest': trends_item.get('current_interest', 0) if trends_item else 0,
            'unusual_flow': unusual_item.get('total_premium_flow', 0) if unusual_item else 0,
            'combined_sentiment': round(combined, 3),
            'total_mentions': reddit_item.get('mentions', 0) + yahoo_item.get('headlines', 0),
            'new_posts_this_hour': new_reddit_posts
        }
        
        save_snapshot(snapshot_data)
        snapshots_saved += 1
    
    print(f"   → Saved {snapshots_saved} snapshots")
    print("\n✅ Hourly collection complete!\n")


if __name__ == "__main__":
    # Run once
    run_hourly_collection()
