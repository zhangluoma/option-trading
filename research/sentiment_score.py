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


def combine_sentiment_signals(reddit_data, twitter_data, unusual_data):
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
        'reddit': config['sources']['reddit']['weight'],
        'twitter': config['sources']['twitter']['weight'],
        'unusual_options': config['sources']['unusual_options']['weight']
    }
    
    # Aggregate by ticker
    ticker_signals = {}
    
    # Process Reddit data
    for item in reddit_data:
        ticker = item['ticker']
        if ticker not in ticker_signals:
            ticker_signals[ticker] = {'reddit': 0, 'twitter': 0, 'unusual': 0, 'reasons': []}
        
        ticker_signals[ticker]['reddit'] = item['sentiment']
        if item['mentions'] > 20:
            ticker_signals[ticker]['reasons'].append(f"Reddit: {item['mentions']} mentions")
    
    # Process Twitter data
    for item in twitter_data:
        ticker = item['ticker']
        if ticker not in ticker_signals:
            ticker_signals[ticker] = {'reddit': 0, 'twitter': 0, 'unusual': 0, 'reasons': []}
        
        ticker_signals[ticker]['twitter'] = item['sentiment']
        if item.get('mentions', 0) > 10:
            ticker_signals[ticker]['reasons'].append(f"Twitter: trending")
    
    # Process Unusual Options
    for item in unusual_data:
        ticker = item['ticker']
        if ticker not in ticker_signals:
            ticker_signals[ticker] = {'reddit': 0, 'twitter': 0, 'unusual': 0, 'reasons': []}
        
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
            signals['twitter'] * weights['twitter'] +
            signals['unusual'] * weights['unusual_options']
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
        
        # Only include if above minimum threshold
        if weighted_score >= min_score or weighted_score <= (1 - min_score):
            results.append({
                'ticker': ticker,
                'overall_score': round(weighted_score, 2),
                'direction': direction,
                'confidence': confidence,
                'breakdown': {
                    'reddit': round(signals['reddit'], 2),
                    'twitter': round(signals['twitter'], 2),
                    'unusual': round(signals['unusual'], 2)
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
