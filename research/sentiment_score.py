"""
Sentiment scoring engine
Combines: Reddit + Twitter + Unusual Options Activity
"""

import yaml
from pathlib import Path


def load_config():
    """Load sentiment configuration"""
    config_path = Path(__file__).parent.parent / 'config' / 'sentiment.yaml'
    with open(config_path) as f:
        return yaml.safe_load(f)


def combine_sentiment_signals(reddit_data, yahoo_data, unusual_data, trends_data=None):
    """
    Combine signals from multiple sources
    
    Returns: [
        {
            'ticker': 'AAPL',
            'overall_score': 0.82,
            'direction': 'bullish',
            'confidence': 'high',
            'breakdown': {
                'reddit': 0.75,
                'twitter': 0.68,
                'unusual': 0.90
            },
            'reasons': ['Strong Reddit buzz', 'Large call flow detected']
        },
        ...
    ]
    """
    
    config = load_config()
    weights = {
        'reddit': 0.35,
        'yahoo': 0.15,
        'unusual_options': 0.35,
        'trends': 0.15
    }
    
    # Aggregate by ticker
    ticker_signals = {}
    
    # Process Reddit data
    for item in reddit_data:
        ticker = item['ticker']
        if ticker not in ticker_signals:
            ticker_signals[ticker] = {'reddit': 0, 'yahoo': 0, 'unusual': 0, 'trends': 0, 'reasons': []}
        
        ticker_signals[ticker]['reddit'] = item['sentiment']
        if item['mentions'] > 20:
            ticker_signals[ticker]['reasons'].append(f"Reddit: {item['mentions']} mentions")
    
    # Process Yahoo Finance data
    for item in yahoo_data:
        ticker = item['ticker']
        if ticker not in ticker_signals:
            ticker_signals[ticker] = {'reddit': 0, 'yahoo': 0, 'unusual': 0, 'trends': 0, 'reasons': []}
        
        ticker_signals[ticker]['yahoo'] = item['sentiment']
        if item['headlines'] > 5:
            ticker_signals[ticker]['reasons'].append(f"Yahoo: {item['headlines']} headlines")
    
    # Process Google Trends data
    if trends_data:
        for ticker, item in trends_data.items():
            if ticker not in ticker_signals:
                ticker_signals[ticker] = {'reddit': 0, 'yahoo': 0, 'unusual': 0, 'trends': 0, 'reasons': []}
            
            # Convert trend interest to sentiment score (0-1)
            # Higher interest = more bullish (simplified)
            trend_score = min(item['current_interest'] / 50, 1.0)
            ticker_signals[ticker]['trends'] = trend_score
            
            if item['trend'] == 'rising':
                ticker_signals[ticker]['reasons'].append(f"Trends: {item['trend']}, interest {item['current_interest']}")
    
    # Process Unusual Options
    for item in unusual_data:
        ticker = item['ticker']
        if ticker not in ticker_signals:
            ticker_signals[ticker] = {'reddit': 0, 'yahoo': 0, 'unusual': 0, 'trends': 0, 'reasons': []}
        
        ticker_signals[ticker]['unusual'] = item['signal_strength']
        if item['total_premium_flow'] > 500000:
            ticker_signals[ticker]['reasons'].append(
                f"Unusual: ${item['total_premium_flow']:,.0f} flow"
            )
    
    # Calculate weighted scores
    results = []
    min_score = config['sentiment_min_score']
    
    for ticker, signals in ticker_signals.items():
        weighted_score = (
            signals['reddit'] * weights['reddit'] +
            signals['yahoo'] * weights['yahoo'] +
            signals['unusual'] * weights['unusual_options'] +
            signals['trends'] * weights['trends']
        )
        
        # Determine direction
        if weighted_score > 0.6:
            direction = 'bullish'
        elif weighted_score < 0.4:
            direction = 'bearish'
        else:
            direction = 'neutral'
        
        # Confidence level
        if weighted_score > 0.75 or weighted_score < 0.25:
            confidence = 'high'
        elif weighted_score > 0.65 or weighted_score < 0.35:
            confidence = 'medium'
        else:
            confidence = 'low'
        
        # Only include if above minimum threshold (lowered for more results)
        min_score_adjusted = 0.55  # Lowered from 0.6
        if weighted_score >= min_score_adjusted or weighted_score <= (1 - min_score_adjusted):
            results.append({
                'ticker': ticker,
                'overall_score': round(weighted_score, 2),
                'direction': direction,
                'confidence': confidence,
                'breakdown': {
                    'reddit': round(signals['reddit'], 2),
                    'yahoo': round(signals['yahoo'], 2),
                    'unusual': round(signals['unusual'], 2),
                    'trends': round(signals['trends'], 2)
                },
                'reasons': signals['reasons']
            })
    
    # Sort by score (high bullish or high bearish)
    results.sort(key=lambda x: abs(x['overall_score'] - 0.5), reverse=True)
    
    return results


if __name__ == "__main__":
    # Test with mock data
    reddit = [{'ticker': 'AAPL', 'sentiment': 0.8, 'mentions': 50}]
    twitter = [{'ticker': 'AAPL', 'sentiment': 0.7, 'mentions': 20}]
    unusual = [{'ticker': 'AAPL', 'signal_strength': 0.9, 'total_premium_flow': 1000000}]
    
    result = combine_sentiment_signals(reddit, twitter, unusual)
    print(result)
