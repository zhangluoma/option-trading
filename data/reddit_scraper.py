"""
Reddit sentiment scraper (Web Scraping Version)
Scrapes old.reddit.com without API key
Focus: r/wallstreetbets, r/options, r/stocks
"""

import re
import time
import requests
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from urllib.parse import urljoin
from .ticker_validator import validate_tickers


def extract_tickers(text):
    """Extract stock tickers from text (e.g., $AAPL, TSLA)"""
    # Match $TICKER (high confidence) or standalone uppercase 1-5 letter words
    pattern = r'\$([A-Z]{1,5})\b|(?<!\w)([A-Z]{1,5})(?=\s|$|[^A-Z])'
    matches = re.findall(pattern, text.upper())
    
    # Separate $ prefixed (high confidence) from others
    high_confidence = []
    ambiguous = []
    
    for match in matches:
        ticker = match[0] or match[1]
        if match[0]:  # Has $ prefix
            high_confidence.append(ticker)
        else:
            ambiguous.append(ticker)
    
    # Ambiguous words that are ONLY valid if prefixed with $
    AMBIGUOUS_WORDS = {
        'AS', 'PLAY', 'HERE', 'TERM', 'HELP', 'HIGH', 'NEXT', 'REAL', 
        'LOVE', 'SHOP', 'TRUE', 'COOL', 'BEST', 'SAFE', 'CAKE', 'RIDE'
    }
    
    # Filter ambiguous: only keep if in high confidence OR if length >= 3 and not in ambiguous list
    tickers = high_confidence + [t for t in ambiguous if t not in AMBIGUOUS_WORDS or len(t) >= 4]
    
    # Also exclude absolute non-tickers
    absolute_exclude = {
        'YOLO', 'DD', 'WSB', 'CEO', 'IPO', 'ATH', 'IMO', 'TLDR', 'FYI', 'USA', 
        'ATM', 'OTM', 'ITM', 'EPS', 'ETF', 'GDP', 'SEC', 'IRS', 'LLC', 'INC',
        'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER',
        'WAS', 'ONE', 'OUR', 'OUT', 'NEW', 'NOW', 'GET', 'HAS', 'HIS', 'HOW',
        'MORE', 'VS', 'AI', 'TIME', 'WHAT', 'WHEN', 'WHERE', 'WHO', 'WHY', 
        'WHICH', 'ABOUT', 'INTO', 'THAN', 'FROM', 'THEM', 'BEEN', 'HAVE', 
        'WITH', 'THIS', 'THAT', 'WILL', 'WOULD', 'THERE', 'THEIR', 'SOME', 
        'COULD', 'MAKE', 'LIKE', 'HIM', 'ANY', 'THESE', 'SO', 'OVER', 'ONLY', 
        'VERY', 'EVEN', 'BACK', 'AFTER', 'USE', 'TWO', 'MOST', 'WAY', 'WORK', 
        'FIRST', 'WELL', 'DOWN', 'SIDE', 'DOES', 'EACH', 'SUCH', 'LONG', 'OWN', 
        'MUCH', 'BEFORE', 'RIGHT', 'MEAN', 'SAME', 'TELL', 'MAX', 'MIN', 'AVG', 
        'SUM', 'DIV', 'MUL', 'ADD', 'SUB'
    }
    
    tickers = [t for t in tickers if t not in absolute_exclude and len(t) > 1]
    return tickers


def analyze_sentiment(text):
    """Simple sentiment scoring (0-1, where >0.5 = bullish)"""
    text_lower = text.lower()
    
    # Bullish keywords
    bullish = [
        'moon', 'calls', 'bullish', 'buy', 'long', 'rocket', '🚀', 
        'pump', 'gap up', 'breakout', 'to the moon', 'squeeze',
        'printing', 'tendies', 'gains', 'rally', 'rip', 'soar'
    ]
    
    bearish = [
        'puts', 'bearish', 'short', 'sell', 'crash', 'dump', 
        'gap down', 'tank', 'drill', 'drop', 'fall', 'plunge',
        'dead', 'rekt', 'loss', 'bag holding'
    ]
    
    bull_score = sum(1 for word in bullish if word in text_lower)
    bear_score = sum(1 for word in bearish if word in text_lower)
    
    total = bull_score + bear_score
    if total == 0:
        return 0.5  # Neutral
    
    return bull_score / total


def scrape_subreddit_html(subreddit, limit=200):
    """
    Scrape a subreddit's hot posts from old.reddit.com
    
    Returns: List of post dicts
    """
    
    url = f"https://old.reddit.com/r/{subreddit}/"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
    
    print(f"  → Fetching r/{subreddit}...")
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        html = response.text
        
    except Exception as e:
        print(f"     ❌ Error fetching r/{subreddit}: {e}")
        return []
    
    # Parse HTML with regex (simple but works)
    # Looking for posts in format: <div class="thing" ... data-title="..." data-score="..." ...>
    
    posts = []
    
    # Extract post data using regex
    # Pattern for titles
    title_pattern = r'<a[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)</a>'
    titles = re.findall(title_pattern, html)
    
    # Pattern for scores (upvotes)
    score_pattern = r'<div[^>]*class="[^"]*score unvoted[^"]*"[^>]*title="([0-9]+)"'
    scores = re.findall(score_pattern, html)
    
    # Pattern for comment counts
    comment_pattern = r'<a[^>]*class="[^"]*comments[^"]*"[^>]*>([0-9,]+)\s*comment'
    comments = re.findall(comment_pattern, html)
    
    # Combine (take min length to avoid misalignment)
    min_len = min(len(titles), len(scores), len(comments), limit)
    
    for i in range(min_len):
        try:
            title = titles[i].strip()
            score = int(scores[i])
            num_comments = int(comments[i].replace(',', ''))
            
            posts.append({
                'title': title,
                'score': score,
                'num_comments': num_comments,
                'subreddit': subreddit
            })
            
        except (ValueError, IndexError):
            continue
    
    print(f"     ✅ Found {len(posts)} posts")
    return posts


def scrape_reddit_sentiment(subreddits, lookback_hours=24, min_upvotes=50, asset_type='stock'):
    """
    Scrape Reddit for trending tickers with sentiment
    
    Returns: [
        {
            'ticker': 'AAPL',
            'mentions': 45,
            'sentiment': 0.75,
            'top_posts': [...],
            'buzz_score': 8.5,
            'source': 'reddit'
        },
        ...
    ]
    """
    
    print(f"[Reddit Web Scraping] Scanning {len(subreddits)} subreddits...")
    
    all_posts = []
    
    # Scrape each subreddit
    for subreddit in subreddits:
        posts = scrape_subreddit_html(subreddit, limit=100)
        all_posts.extend(posts)
        time.sleep(1)  # Rate limiting
    
    # Filter by min upvotes
    filtered_posts = [p for p in all_posts if p['score'] >= min_upvotes]
    
    print(f"  → Total posts after filter: {len(filtered_posts)}")
    
    # Extract tickers and aggregate
    ticker_data = defaultdict(lambda: {
        'mentions': 0,
        'total_sentiment': 0,
        'sentiment_count': 0,
        'top_posts': [],
        'total_score': 0
    })
    
    for post in filtered_posts:
        title = post['title']
        tickers = extract_tickers(title)
        sentiment = analyze_sentiment(title)
        
        for ticker in tickers:
            ticker_data[ticker]['mentions'] += 1
            ticker_data[ticker]['total_sentiment'] += sentiment
            ticker_data[ticker]['sentiment_count'] += 1
            ticker_data[ticker]['total_score'] += post['score']
            
            # Keep top posts
            if len(ticker_data[ticker]['top_posts']) < 3:
                ticker_data[ticker]['top_posts'].append({
                    'title': title,
                    'score': post['score'],
                    'subreddit': post['subreddit']
                })
    
    # Calculate final scores
    results = []
    
    for ticker, data in ticker_data.items():
        if data['mentions'] < 3:  # At least 3 mentions
            continue
        
        avg_sentiment = data['total_sentiment'] / data['sentiment_count']
        
        # Buzz score: mentions * avg_upvotes
        buzz_score = data['mentions'] * (data['total_score'] / data['mentions']) / 100
        
        results.append({
            'ticker': ticker,
            'asset_type': asset_type,
            'mentions': data['mentions'],
            'sentiment': round(avg_sentiment, 2),
            'buzz_score': round(buzz_score, 1),
            'top_posts': data['top_posts'],
            'source': 'reddit'
        })
    
    # Validate tickers (filter out fake ones)
    print(f"  → Validating {len(results)} tickers...")
    valid_tickers = validate_tickers([r['ticker'] for r in results])
    results = [r for r in results if r['ticker'] in valid_tickers]
    
    # Sort by buzz score
    results.sort(key=lambda x: x['buzz_score'], reverse=True)
    
    print(f"  → Final: {len(results)} valid tickers\n")
    
    return results


if __name__ == "__main__":
    # Test
    print("Testing Reddit web scraper...\n")
    
    subreddits = ['wallstreetbets', 'options']
    results = scrape_reddit_sentiment(subreddits, min_upvotes=100)
    
    print("\n" + "="*60)
    print("TOP RESULTS")
    print("="*60)
    
    for r in results[:5]:
        print(f"\n{r['ticker']}")
        print(f"  Mentions: {r['mentions']}")
        print(f"  Sentiment: {r['sentiment']} ({'bullish' if r['sentiment'] > 0.5 else 'bearish'})")
        print(f"  Buzz: {r['buzz_score']}")
        if r['top_posts']:
            print(f"  Top post: {r['top_posts'][0]['title'][:60]}...")
