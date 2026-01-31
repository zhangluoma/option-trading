"""
CoinGecko API integration
Free crypto market data
"""

from pycoingecko import CoinGeckoAPI
import time


cg = CoinGeckoAPI()


# Map common symbols to CoinGecko IDs
SYMBOL_TO_ID = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'SOL': 'solana',
    'USDT': 'tether',
    'BNB': 'binancecoin',
    'XRP': 'ripple',
    'ADA': 'cardano',
    'DOGE': 'dogecoin',
    'AVAX': 'avalanche-2',
    'LINK': 'chainlink',
    'DOT': 'polkadot',
    'MATIC': 'matic-network',
    'UNI': 'uniswap',
    'ATOM': 'cosmos',
    'LTC': 'litecoin',
    'NEAR': 'near',
    'APT': 'aptos',
    'ARB': 'arbitrum',
    'OP': 'optimism'
}


def get_coin_id(symbol):
    """Convert symbol to CoinGecko ID"""
    return SYMBOL_TO_ID.get(symbol.upper(), symbol.lower())


def get_crypto_price(symbols):
    """
    Get current price and market data for crypto symbols
    
    Args:
        symbols: List of symbols (e.g., ['BTC', 'ETH'])
    
    Returns:
        {
            'BTC': {
                'price': 45000.0,
                'market_cap': 880000000000,
                'volume_24h': 25000000000,
                'price_change_24h': 2.5,
                'source': 'coingecko'
            },
            ...
        }
    """
    
    if not symbols:
        return {}
    
    # Convert symbols to IDs
    ids = [get_coin_id(s) for s in symbols]
    
    try:
        data = cg.get_price(
            ids=','.join(ids),
            vs_currencies='usd',
            include_market_cap=True,
            include_24hr_vol=True,
            include_24hr_change=True
        )
        
        results = {}
        
        for symbol in symbols:
            coin_id = get_coin_id(symbol)
            coin_data = data.get(coin_id, {})
            
            if coin_data:
                results[symbol.upper()] = {
                    'symbol': symbol.upper(),
                    'price': coin_data.get('usd', 0),
                    'market_cap': coin_data.get('usd_market_cap', 0),
                    'volume_24h': coin_data.get('usd_24h_vol', 0),
                    'price_change_24h': coin_data.get('usd_24h_change', 0),
                    'source': 'coingecko'
                }
        
        return results
        
    except Exception as e:
        print(f"  ⚠️ CoinGecko error: {e}")
        return {}


def get_trending_crypto():
    """
    Get trending cryptocurrencies
    
    Returns: List of trending symbols
    """
    
    try:
        trending = cg.get_search_trending()
        coins = trending.get('coins', [])
        
        symbols = []
        for item in coins[:10]:  # Top 10
            coin = item.get('item', {})
            symbol = coin.get('symbol', '').upper()
            if symbol:
                symbols.append(symbol)
        
        return symbols
        
    except Exception as e:
        print(f"  ⚠️ CoinGecko trending error: {e}")
        return []


def get_fear_greed_index():
    """
    Get Crypto Fear & Greed Index
    
    Returns:
        {
            'value': 65,  # 0-100
            'classification': 'Greed',  # Fear/Neutral/Greed
            'timestamp': datetime
        }
    """
    
    # Fear & Greed Index API
    try:
        import requests
        response = requests.get('https://api.alternative.me/fng/', timeout=10)
        data = response.json()
        
        if data.get('data'):
            latest = data['data'][0]
            value = int(latest['value'])
            
            if value < 25:
                classification = 'Extreme Fear'
            elif value < 45:
                classification = 'Fear'
            elif value < 55:
                classification = 'Neutral'
            elif value < 75:
                classification = 'Greed'
            else:
                classification = 'Extreme Greed'
            
            return {
                'value': value,
                'classification': classification,
                'timestamp': latest['timestamp']
            }
    
    except Exception as e:
        print(f"  ⚠️ Fear & Greed Index error: {e}")
    
    return None


if __name__ == "__main__":
    # Test
    print("Testing CoinGecko integration...\n")
    
    symbols = ['BTC', 'ETH', 'SOL']
    prices = get_crypto_price(symbols)
    
    for symbol, data in prices.items():
        print(f"{symbol}: ${data['price']:,.2f} ({data['price_change_24h']:+.2f}%)")
    
    print("\nTrending:")
    trending = get_trending_crypto()
    print(trending)
    
    print("\nFear & Greed:")
    fg = get_fear_greed_index()
    if fg:
        print(f"{fg['value']}/100 - {fg['classification']}")
