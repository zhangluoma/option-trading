"""
StockTwits API scraper
Free API, stock-focused social sentiment
"""

import requests
import time
from collections import defaultdict


def get_stocktwits_sentiment(ticker):
    """
    Get StockTwits sentiment for a ticker
    
    Returns:
        {
            'ticker': 'AAPL',
            'messages': 30,
            'bullish_count': 20,
            'bearish_count': 10,
            'sentiment': 0.67,  # bullish ratio
            'top_messages': [...],
            'source': 'stocktwits'
        }
    """
    
    url = f"https://api.stocktwits.com/api/2/streams/symbol/{ticker}.json"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        
    except Exception as e:
        print(f"  ⚠️ StockTwits error for {ticker}: {e}")
        return None
    
    if 'messages' not in data:
        return None
    
    messages = data['messages']
    
    if not messages:
        return None
    
    # Count sentiment
    bullish = 0
    bearish = 0
    neutral = 0
    
    top_messages = []
    
    for msg in messages:
        # Get sentiment entity if available
        entities = msg.get('entities', {})
        sentiment_entity = entities.get('sentiment')
        
        if sentiment_entity:
            if sentiment_entity.get('basic') == 'Bullish':
                bullish += 1
            elif sentiment_entity.get('basic') == 'Bearish':
                bearish += 1
        else:
            neutral += 1
        
        # Save top messages
        if len(top_messages) < 3:
            top_messages.append({
                'body': msg.get('body', '')[:200],
                'created_at': msg.get('created_at'),
                'user': msg.get('user', {}).get('username', 'unknown')
            })
    
    total_with_sentiment = bullish + bearish
    
    if total_with_sentiment == 0:
        sentiment_score = 0.5  # Neutral
    else:
        sentiment_score = bullish / total_with_sentiment
    
    return {
        'ticker': ticker,
        'messages': len(messages),
        'bullish_count': bullish,
        'bearish_count': bearish,
        'neutral_count': neutral,
        'sentiment': round(sentiment_score, 2),
        'top_messages': top_messages,
        'source': 'stocktwits'
    }


def scan_tickers_stocktwits(ticker_list):
    """
    Scan multiple tickers on StockTwits
    
    Returns: List of sentiment results
    """
    
    print(f"[StockTwits] Scanning {len(ticker_list)} tickers...")
    
    results = []
    
    for ticker in ticker_list:
        result = get_stocktwits_sentiment(ticker)
        
        if result and result['messages'] > 5:  # At least 5 messages
            results.append(result)
        
        time.sleep(0.5)  # Rate limiting
    
    print(f"  → Found {len(results)} tickers with StockTwits activity\n")
    
    return results


if __name__ == "__main__":
    # Test
    print("Testing StockTwits scraper...\n")
    
    tickers = ['AAPL', 'TSLA', 'SPY']
    results = scan_tickers_stocktwits(tickers)
    
    for r in results:
        print(f"\n{r['ticker']}")
        print(f"  Messages: {r['messages']}")
        print(f"  Bullish: {r['bullish_count']}, Bearish: {r['bearish_count']}")
        print(f"  Sentiment: {r['sentiment']} ({'bullish' if r['sentiment'] > 0.5 else 'bearish'})")
