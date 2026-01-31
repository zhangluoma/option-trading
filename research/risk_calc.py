"""
Risk calculator for aggressive options trading
Ensures we don't blow up the account
"""

import yaml
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from data.market_data import find_best_option


def load_account_config():
    """Load account configuration"""
    config_path = Path(__file__).parent.parent / 'config' / 'account.yaml'
    with open(config_path) as f:
        return yaml.safe_load(f)


def calculate_position_size(capital, risk_per_trade, option_price, direction='long'):
    """
    Calculate how many contracts to buy
    
    Args:
        capital: Total account size
        risk_per_trade: Max $ risk
        option_price: Price per contract
        direction: 'long' or 'spread'
    
    Returns:
        {
            'contracts': 3,
            'total_cost': 900,
            'max_loss': 900,
            'pct_of_account': 0.129
        }
    """
    
    if direction == 'long':
        # For long calls/puts, max loss = premium paid
        max_contracts_by_risk = int(risk_per_trade / (option_price * 100))
        max_contracts_by_capital = int((capital * 0.15) / (option_price * 100))  # Max 15%
        
        contracts = min(max_contracts_by_risk, max_contracts_by_capital)
        contracts = max(1, contracts)  # At least 1
        
        total_cost = contracts * option_price * 100
        max_loss = total_cost
        
    elif direction == 'spread':
        # For spreads, max loss = width - premium received
        # Simplified: assume max loss ~= premium paid
        max_contracts = int(risk_per_trade / (option_price * 100))
        contracts = max(1, max_contracts)
        
        total_cost = contracts * option_price * 100
        max_loss = total_cost
    
    else:
        raise ValueError(f"Unknown direction: {direction}")
    
    pct_of_account = total_cost / capital
    
    return {
        'contracts': contracts,
        'total_cost': int(total_cost),
        'max_loss': int(max_loss),
        'pct_of_account': round(pct_of_account, 3)
    }


def check_risk_limits(current_positions, new_position, config):
    """
    Check if new position violates risk limits
    
    Returns: (allowed: bool, reason: str)
    """
    
    max_open_trades = config['max_open_trades']
    max_risk = config['max_risk_per_trade']
    capital = config['capital']
    
    # Check max open trades
    if len(current_positions) >= max_open_trades:
        return False, f"Max open trades reached ({max_open_trades})"
    
    # Check max risk per trade
    if new_position['max_loss'] > max_risk:
        return False, f"Exceeds max risk (${max_risk})"
    
    # Check total exposure
    total_exposure = sum(p.get('max_loss', 0) for p in current_positions)
    total_exposure += new_position['max_loss']
    
    if total_exposure > capital * 0.5:  # Max 50% total exposure
        return False, "Total exposure too high (>50%)"
    
    return True, "OK"


def apply_aggressive_filters(sentiment_signals, config):
    """
    Filter sentiment signals for aggressive but controlled trading
    Gets real option prices and calculates position sizing
    
    Returns: Filtered list with position sizing
    """
    
    results = []
    
    for signal in sentiment_signals:
        # Aggressive mode: accept medium+ confidence
        if signal['confidence'] in ['high', 'medium']:
            
            # Determine option type based on direction
            if signal['direction'] == 'bullish':
                structure = 'long_call'
                option_type = 'call'
            elif signal['direction'] == 'bearish':
                structure = 'long_put'
                option_type = 'put'
            else:
                continue  # Skip neutral
            
            # Get real option data
            option_data = find_best_option(signal['ticker'], option_type)
            
            if not option_data or option_data['premium'] <= 0:
                print(f"  ⚠️ No valid options for {signal['ticker']}")
                continue
            
            # Calculate position size
            position = calculate_position_size(
                capital=config['capital'],
                risk_per_trade=config['max_risk_per_trade'],
                option_price=option_data['premium'],
                direction='long'
            )
            
            # Add option details
            position['strike'] = option_data['strike']
            position['expiration'] = option_data['expiration']
            position['dte'] = option_data['dte']
            position['premium'] = option_data['premium']
            
            results.append({
                'ticker': signal['ticker'],
                'direction': signal['direction'],
                'structure': structure,
                'sentiment_score': signal['overall_score'],
                'confidence': signal['confidence'],
                'reasons': signal['reasons'],
                'position': position
            })
    
    # Sort by sentiment score strength
    results.sort(key=lambda x: abs(x['sentiment_score'] - 0.5), reverse=True)
    
    # Return top 5
    return results[:5]


if __name__ == "__main__":
    # Test
    config = load_account_config()
    
    pos = calculate_position_size(7000, 500, 3.50, 'long')
    print(f"Position size: {pos}")
    
    allowed, reason = check_risk_limits([], pos, config)
    print(f"Allowed: {allowed}, Reason: {reason}")
