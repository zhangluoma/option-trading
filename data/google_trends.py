"""
Google Trends analyzer
Measures search interest over time
"""

from pytrends.request import TrendReq
import time


def get_search_trends(ticker_list, timeframe='now 7-d'):
    """
    Get Google search trends for tickers
    
    Args:
        ticker_list: List of tickers
        timeframe: 'now 1-H', 'now 1-d', 'now 7-d', 'today 1-m', 'today 3-m'
    
    Returns:
        {
            'AAPL': {
                'current_interest': 75,
                'peak_interest': 100,
                'trend': 'rising',  # rising/falling/stable
                'source': 'google_trends'
            },
            ...
        }
    """
    
    print(f"[Google Trends] Fetching search interest for {len(ticker_list)} tickers...")
    
    try:
        pytrends = TrendReq(hl='en-US', tz=360)
        
        # Google Trends allows max 5 keywords at a time
        results = {}
        
        for i in range(0, len(ticker_list), 5):
            batch = ticker_list[i:i+5]
            
            try:
                pytrends.build_payload(batch, timeframe=timeframe)
                interest_over_time = pytrends.interest_over_time()
                
                if interest_over_time.empty:
                    continue
                
                for ticker in batch:
                    if ticker not in interest_over_time.columns:
                        continue
                    
                    values = interest_over_time[ticker]
                    
                    current = values.iloc[-1]
                    peak = values.max()
                    mean = values.mean()
                    
                    # Determine trend
                    recent_avg = values.tail(3).mean()
                    older_avg = values.head(len(values) - 3).mean()
                    
                    if recent_avg > older_avg * 1.2:
                        trend = 'rising'
                    elif recent_avg < older_avg * 0.8:
                        trend = 'falling'
                    else:
                        trend = 'stable'
                    
                    results[ticker] = {
                        'ticker': ticker,
                        'current_interest': int(current),
                        'peak_interest': int(peak),
                        'avg_interest': round(mean, 1),
                        'trend': trend,
                        'buzz_score': round((current / (mean + 1)) * 10, 1),  # Spike factor
                        'source': 'google_trends'
                    }
                
                time.sleep(1)  # Rate limiting
                
            except Exception as e:
                print(f"  ⚠️ Error fetching batch {batch}: {e}")
                continue
        
        print(f"  → Got trends for {len(results)} tickers\n")
        
        return results
        
    except Exception as e:
        print(f"  ❌ Google Trends error: {e}\n")
        return {}


def filter_trending_tickers(trends_dict, min_interest=20, trend_type='rising'):
    """
    Filter for tickers with significant search interest
    
    Args:
        trends_dict: Output from get_search_trends()
        min_interest: Minimum current interest
        trend_type: 'rising', 'falling', or None (all)
    
    Returns: List of tickers meeting criteria
    """
    
    filtered = []
    
    for ticker, data in trends_dict.items():
        if data['current_interest'] < min_interest:
            continue
        
        if trend_type and data['trend'] != trend_type:
            continue
        
        filtered.append(data)
    
    # Sort by buzz score (spike factor)
    filtered.sort(key=lambda x: x['buzz_score'], reverse=True)
    
    return filtered


if __name__ == "__main__":
    # Test
    print("Testing Google Trends analyzer...\n")
    
    tickers = ['AAPL', 'TSLA', 'NVDA', 'SPY', 'MSFT']
    trends = get_search_trends(tickers, timeframe='now 7-d')
    
    print("\n" + "="*60)
    print("RESULTS")
    print("="*60)
    
    for ticker, data in trends.items():
        print(f"\n{ticker}")
        print(f"  Current interest: {data['current_interest']}")
        print(f"  Peak: {data['peak_interest']}")
        print(f"  Trend: {data['trend']}")
        print(f"  Buzz score: {data['buzz_score']}")
