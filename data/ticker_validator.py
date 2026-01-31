"""
Ticker validation using yfinance
Filters out fake tickers (like "IN", "TO", "IS")
"""

import yfinance as yf
from functools import lru_cache


# Common words that look like tickers but aren't
EXCLUDE_WORDS = {
    'A', 'I', 'IN', 'IS', 'IT', 'TO', 'ON', 'AT', 'BY', 'UP', 'OR', 'GO', 'AM', 'PM',
    'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE',
    'OUR', 'OUT', 'NEW', 'NOW', 'GET', 'HAS', 'HIS', 'HOW', 'ITS', 'MAY', 'OLD', 'SEE',
    'YOLO', 'DD', 'WSB', 'CEO', 'IPO', 'ATH', 'IMO', 'TLDR', 'FYI', 'USA', 'UK', 'EU',
    'ATM', 'OTM', 'ITM', 'EPS', 'ETF', 'GDP', 'SEC', 'IRS', 'LLC', 'INC', 'FBI', 'CIA',
    'KEVIN', 'NEXT', 'JUST', 'CALL', 'CALLS', 'PUT', 'PUTS',
    # Additional common words
    'AS', 'MORE', 'HERE', 'PLAY', 'VS', 'AI', 'TERM', 'TIME', 'HELP', 'WHAT', 'WHEN',
    'WHERE', 'WHO', 'WHY', 'WHICH', 'ABOUT', 'INTO', 'THAN', 'FROM', 'THEM', 'BEEN',
    'HAVE', 'WITH', 'THIS', 'THAT', 'WILL', 'WOULD', 'THERE', 'THEIR', 'SOME', 'COULD',
    'MAKE', 'LIKE', 'HIM', 'ANY', 'THESE', 'SO', 'OVER', 'ONLY', 'VERY', 'EVEN',
    'BACK', 'AFTER', 'USE', 'TWO', 'MOST', 'WAY', 'WORK', 'FIRST', 'WELL', 'DOWN',
    'SIDE', 'DOES', 'EACH', 'SUCH', 'LONG', 'OWN', 'MUCH', 'BEFORE', 'RIGHT', 'MEAN',
    'SAME', 'TELL', 'FOLLOWING', 'DURING', 'BOTH', 'FEW', 'ONCE', 'HERE', 'BEING',
    'BETWEEN', 'SOMETHING', 'BECAUSE', 'ANOTHER', 'THROUGH', 'THOSE', 'REALLY', 'ALREADY',
    'STILL', 'TRYING', 'ACTUALLY', 'PRETTY', 'GOING', 'LOOKING', 'THING', 'THINGS',
    'MAX', 'MIN', 'AVG', 'SUM', 'DIV', 'MUL', 'ADD', 'SUB'
}


@lru_cache(maxsize=500)
def is_valid_ticker(ticker):
    """
    Check if ticker is a real stock using yfinance
    Cached to avoid repeated API calls
    
    Returns: bool
    """
    
    # Quick filters first
    if len(ticker) < 1 or len(ticker) > 5:
        return False
    
    if ticker in EXCLUDE_WORDS:
        return False
    
    # Check if starts with number
    if ticker[0].isdigit():
        return False
    
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        
        # Check if it has basic stock info
        if not info or len(info) < 5:
            return False
        
        # Must have a valid quote type
        quote_type = info.get('quoteType', '')
        if quote_type not in ['EQUITY', 'ETF']:
            return False
        
        return True
        
    except Exception:
        return False


def validate_tickers(ticker_list):
    """
    Validate a list of tickers, return only real ones
    
    Args:
        ticker_list: List of ticker strings
    
    Returns:
        List of validated tickers
    """
    
    valid = []
    
    for ticker in ticker_list:
        if is_valid_ticker(ticker):
            valid.append(ticker)
    
    return valid


if __name__ == "__main__":
    # Test
    test_tickers = ['AAPL', 'TSLA', 'IN', 'TO', 'SPY', 'FAKE123', 'MSFT', 'IS']
    
    print("Testing ticker validation...")
    for ticker in test_tickers:
        valid = is_valid_ticker(ticker)
        print(f"  {ticker}: {'✅ Valid' if valid else '❌ Invalid'}")
