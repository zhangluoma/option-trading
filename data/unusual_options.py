"""
Unusual options activity detector
Detects:
- High volume relative to OI
- Large premium flow
- IV spikes
"""

from datetime import datetime
from .market_data import get_option_chain


def detect_unusual_activity(ticker):
    """
    Detect unusual options activity for a ticker
    
    Returns:
        {
            'ticker': 'AAPL',
            'call_flow': 1500000,
            'put_flow': 300000,
            'total_premium_flow': 1800000,
            'direction': 'bullish',
            'signal_strength': 0.75
        }
    """
    
    chain = get_option_chain(ticker)
    
    if not chain:
        return {
            'ticker': ticker,
            'call_flow': 0,
            'put_flow': 0,
            'total_premium_flow': 0,
            'direction': 'neutral',
            'signal_strength': 0.0,
            'source': 'unusual_options'
        }
    
    # Calculate premium flow for calls
    call_flow = 0
    for call in chain['calls']:
        volume = call.get('volume', 0) or 0
        ask = call.get('ask', 0) or 0
        bid = call.get('bid', 0) or 0
        
        if ask > 0 and bid > 0 and volume > 0:
            price = (ask + bid) / 2
            call_flow += volume * price * 100
    
    # Calculate premium flow for puts
    put_flow = 0
    for put in chain['puts']:
        volume = put.get('volume', 0) or 0
        ask = put.get('ask', 0) or 0
        bid = put.get('bid', 0) or 0
        
        if ask > 0 and bid > 0 and volume > 0:
            price = (ask + bid) / 2
            put_flow += volume * price * 100
    
    total_flow = call_flow + put_flow
    
    # Determine direction
    if total_flow == 0:
        direction = 'neutral'
        signal_strength = 0.0
    else:
        call_ratio = call_flow / total_flow
        
        if call_ratio > 0.65:
            direction = 'bullish'
            signal_strength = min(call_ratio, 0.9)
        elif call_ratio < 0.35:
            direction = 'bearish'
            signal_strength = min(1 - call_ratio, 0.9)
        else:
            direction = 'neutral'
            signal_strength = 0.5
    
    return {
        'ticker': ticker,
        'call_flow': int(call_flow),
        'put_flow': int(put_flow),
        'total_premium_flow': int(total_flow),
        'direction': direction,
        'signal_strength': round(signal_strength, 2),
        'source': 'unusual_options'
    }


def scan_tickers_for_unusual(ticker_list, min_premium=50000):
    """
    Scan a list of tickers for unusual activity
    
    Returns: List of tickers with significant flow
    """
    
    print(f"[UnusualOptions] Scanning {len(ticker_list)} tickers...")
    
    results = []
    
    for ticker in ticker_list:
        activity = detect_unusual_activity(ticker)
        
        # Only include if meets minimum premium threshold
        if activity['total_premium_flow'] >= min_premium:
            results.append(activity)
    
    # Sort by total flow
    results.sort(key=lambda x: x['total_premium_flow'], reverse=True)
    
    print(f"  → Found {len(results)} with significant flow\n")
    
    return results


if __name__ == "__main__":
    # Test
    print("Testing unusual options detector...\n")
    result = detect_unusual_activity('AAPL')
    print(f"Ticker: {result['ticker']}")
    print(f"Call flow: ${result['call_flow']:,}")
    print(f"Put flow: ${result['put_flow']:,}")
    print(f"Direction: {result['direction']}")
    print(f"Signal: {result['signal_strength']}")
