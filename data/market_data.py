"""
Market data fetcher using yfinance
Gets stock prices, option chains, IV, etc.
"""

import yfinance as yf
from datetime import datetime, timedelta


def get_stock_price(ticker):
    """Get current stock price and basic info"""
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        
        return {
            'ticker': ticker,
            'price': info.get('currentPrice', info.get('regularMarketPrice', 0)),
            'volume': info.get('volume', 0),
            'market_cap': info.get('marketCap', 0)
        }
    except Exception as e:
        print(f"  ⚠️ Error fetching {ticker}: {e}")
        return None


def get_option_chain(ticker):
    """
    Get option chain for a ticker
    Returns calls and puts with strikes, premiums, OI, IV
    """
    try:
        stock = yf.Ticker(ticker)
        
        # Get available expiration dates
        expirations = stock.options
        
        if not expirations:
            return None
        
        # Get near-term expiration (within 7-30 days)
        today = datetime.now()
        target_expirations = []
        
        for exp_str in expirations:
            exp_date = datetime.strptime(exp_str, '%Y-%m-%d')
            days_to_exp = (exp_date - today).days
            
            if 7 <= days_to_exp <= 30:
                target_expirations.append(exp_str)
        
        if not target_expirations:
            # Fallback to first available
            target_expirations = [expirations[0]]
        
        # Get option chain for first valid expiration
        exp = target_expirations[0]
        opt = stock.option_chain(exp)
        
        calls = opt.calls.to_dict('records')
        puts = opt.puts.to_dict('records')
        
        return {
            'ticker': ticker,
            'expiration': exp,
            'calls': calls[:10],  # Top 10 strikes
            'puts': puts[:10],
            'days_to_expiration': (datetime.strptime(exp, '%Y-%m-%d') - today).days
        }
        
    except Exception as e:
        print(f"  ⚠️ Error fetching options for {ticker}: {e}")
        return None


def find_best_option(ticker, direction='call', dte_range=(7, 30)):
    """
    Find the best option contract for a ticker
    
    Args:
        ticker: Stock symbol
        direction: 'call' or 'put'
        dte_range: Tuple of (min_days, max_days) to expiration
    
    Returns:
        {
            'ticker': 'AAPL',
            'type': 'call',
            'strike': 185.0,
            'premium': 3.50,
            'expiration': '2026-02-20',
            'delta': 0.52,
            'open_interest': 5000,
            'volume': 1200
        }
    """
    
    chain = get_option_chain(ticker)
    
    if not chain:
        return None
    
    # Get current stock price
    stock_info = get_stock_price(ticker)
    if not stock_info:
        return None
    
    current_price = stock_info['price']
    
    # Select calls or puts
    options = chain['calls'] if direction == 'call' else chain['puts']
    
    if not options:
        return None
    
    # Find ATM or slightly OTM option
    best_option = None
    min_distance = float('inf')
    
    for opt in options:
        strike = opt.get('strike', 0)
        
        if direction == 'call':
            # Slightly OTM for calls
            target = current_price * 1.02
        else:
            # Slightly OTM for puts
            target = current_price * 0.98
        
        distance = abs(strike - target)
        
        # Must have decent liquidity
        oi = opt.get('openInterest', 0)
        volume = opt.get('volume', 0)
        
        if oi < 50:  # Minimum OI
            continue
        
        if distance < min_distance:
            min_distance = distance
            best_option = opt
    
    if not best_option:
        return None
    
    return {
        'ticker': ticker,
        'type': direction,
        'strike': best_option.get('strike'),
        'premium': (best_option.get('ask', 0) + best_option.get('bid', 0)) / 2,
        'bid': best_option.get('bid', 0),
        'ask': best_option.get('ask', 0),
        'expiration': chain['expiration'],
        'dte': chain['days_to_expiration'],
        'open_interest': best_option.get('openInterest', 0),
        'volume': best_option.get('volume', 0),
        'implied_volatility': best_option.get('impliedVolatility', 0)
    }


if __name__ == "__main__":
    # Test
    print("Testing market data fetcher...\n")
    
    ticker = 'AAPL'
    
    print(f"1. Stock price for {ticker}:")
    price_info = get_stock_price(ticker)
    print(f"   ${price_info['price']:.2f}\n")
    
    print(f"2. Best call option for {ticker}:")
    call_option = find_best_option(ticker, 'call')
    if call_option:
        print(f"   Strike: ${call_option['strike']}")
        print(f"   Premium: ${call_option['premium']:.2f}")
        print(f"   Expiration: {call_option['expiration']}")
        print(f"   OI: {call_option['open_interest']}")
