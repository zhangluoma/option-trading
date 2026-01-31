"""
Yahoo Finance comments scraper
Scrapes community sentiment from Yahoo Finance
"""

import requests
import re
from datetime import datetime


def analyze_text_sentiment(text):
    """Simple sentiment analysis on text"""
    text_lower = text.lower()
    
    bullish_words = [
        'buy', 'bullish', 'long', 'calls', 'moon', 'rocket', '🚀',
        'up', 'gain', 'profit', 'strong', 'great', 'good', 'love',
        'breakout', 'rally', 'surge', 'soar'
    ]
    
    bearish_words = [
        'sell', 'bearish', 'short', 'puts', 'crash', 'dump', 'tank',
        'down', 'loss', 'weak', 'bad', 'terrible', 'avoid',
        'drop', 'fall', 'plunge', 'collapse'
    ]
    
    bull_count = sum(1 for word in bullish_words if word in text_lower)
    bear_count = sum(1 for word in bearish_words if word in text_lower)
    
    total = bull_count + bear_count
    
    if total == 0:
        return 0.5
    
    return bull_count / total


def get_yahoo_news_sentiment(ticker):
    """
    Get Yahoo Finance news headlines for sentiment
    
    Returns:
        {
            'ticker': 'AAPL',
            'headlines': 10,
            'sentiment': 0.65,
            'top_headlines': [...],
            'source': 'yahoo_finance'
        }
    """
    
    # Yahoo Finance news endpoint
    url = f"https://query1.finance.yahoo.com/v1/finance/search"
    params = {
        'q': ticker,
        'quotesCount': 0,
        'newsCount': 10,
        'enableFuzzyQuery': False
    }
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
    
    try:
        response = requests.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        
    except Exception as e:
        print(f"  ⚠️ Yahoo Finance error for {ticker}: {e}")
        return None
    
    news_items = data.get('news', [])
    
    if not news_items:
        return None
    
    sentiments = []
    top_headlines = []
    
    for item in news_items:
        title = item.get('title', '')
        
        if not title:
            continue
        
        sentiment = analyze_text_sentiment(title)
        sentiments.append(sentiment)
        
        if len(top_headlines) < 5:
            top_headlines.append({
                'title': title,
                'sentiment': round(sentiment, 2),
                'publisher': item.get('publisher', 'unknown'),
                'link': item.get('link', '')
            })
    
    if not sentiments:
        return None
    
    avg_sentiment = sum(sentiments) / len(sentiments)
    
    return {
        'ticker': ticker,
        'headlines': len(sentiments),
        'sentiment': round(avg_sentiment, 2),
        'top_headlines': top_headlines,
        'source': 'yahoo_finance'
    }


def scan_tickers_yahoo(ticker_list):
    """
    Scan multiple tickers on Yahoo Finance
    
    Returns: List of sentiment results
    """
    
    print(f"[Yahoo Finance] Scanning {len(ticker_list)} tickers...")
    
    results = []
    
    for ticker in ticker_list:
        result = get_yahoo_news_sentiment(ticker)
        
        if result:
            results.append(result)
        
        import time
        time.sleep(0.5)  # Rate limiting
    
    print(f"  → Found {len(results)} tickers with Yahoo Finance news\n")
    
    return results


if __name__ == "__main__":
    # Test
    print("Testing Yahoo Finance scraper...\n")
    
    tickers = ['AAPL', 'TSLA', 'MSFT']
    results = scan_tickers_yahoo(tickers)
    
    for r in results:
        print(f"\n{r['ticker']}")
        print(f"  Headlines: {r['headlines']}")
        print(f"  Sentiment: {r['sentiment']} ({'bullish' if r['sentiment'] > 0.5 else 'bearish'})")
        if r['top_headlines']:
            print(f"  Top headline: {r['top_headlines'][0]['title'][:60]}...")
