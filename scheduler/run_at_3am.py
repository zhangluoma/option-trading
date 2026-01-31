"""
Scheduler: Run research at 3:00 AM PT
Stores results for 6 AM notification
"""

import sys
import json
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from main import run_research


def is_trading_day():
    """Check if today is a trading day (Mon-Fri, not holiday)"""
    today = datetime.now()
    
    # Check if weekend
    if today.weekday() >= 5:  # Saturday = 5, Sunday = 6
        return False
    
    # TODO: Check market holidays
    # For now, just check weekday
    
    return True


def run_and_save():
    """Run research and save results to file"""
    
    print(f"\n{'='*60}")
    print(f"3:00 AM Scheduler - {datetime.now().strftime('%Y-%m-%d %H:%M:%S PT')}")
    print(f"{'='*60}\n")
    
    # Check if trading day
    if not is_trading_day():
        print("⏸️  Not a trading day (weekend/holiday)")
        print("Skipping research.")
        
        # Save empty results
        results_path = Path(__file__).parent.parent / 'results_latest.json'
        with open(results_path, 'w') as f:
            json.dump({
                'timestamp': datetime.now().isoformat(),
                'is_trading_day': False,
                'recommendations': []
            }, f, indent=2)
        
        return
    
    print("✅ Trading day confirmed. Running research...\n")
    
    try:
        # Run the research
        recommendations = run_research()
        
        # Save results
        results_path = Path(__file__).parent.parent / 'results_latest.json'
        with open(results_path, 'w') as f:
            json.dump({
                'timestamp': datetime.now().isoformat(),
                'is_trading_day': True,
                'recommendations': recommendations
            }, f, indent=2)
        
        print(f"\n✅ Results saved to: {results_path}")
        print(f"📤 Will be sent at 6:00 AM PT")
        
    except Exception as e:
        print(f"\n❌ Error during research: {e}")
        
        # Save error state
        results_path = Path(__file__).parent.parent / 'results_latest.json'
        with open(results_path, 'w') as f:
            json.dump({
                'timestamp': datetime.now().isoformat(),
                'is_trading_day': True,
                'error': str(e),
                'recommendations': []
            }, f, indent=2)


if __name__ == "__main__":
    run_and_save()
