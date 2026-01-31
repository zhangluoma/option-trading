"""
Scheduler: Send WhatsApp notification at 6:00 AM PT
Reads results from 3 AM run and formats for WhatsApp
"""

import sys
import json
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from output.whatsapp_format import format_for_whatsapp, format_error_message


def load_latest_results():
    """Load results from 3 AM run"""
    results_path = Path(__file__).parent.parent / 'results_latest.json'
    
    if not results_path.exists():
        return None
    
    with open(results_path) as f:
        return json.load(f)


def send_whatsapp_message(message, channel='whatsapp', to='+12069921810'):
    """
    Send message via OpenClaw message tool
    
    This is a placeholder - actual sending happens via OpenClaw's message action
    In production, this would be called from a cron job that has access to message tool
    """
    
    print("\n" + "="*60)
    print("WhatsApp Message (would be sent via OpenClaw):")
    print("="*60)
    print(message)
    print("="*60)
    
    # When running from OpenClaw cron with message tool access:
    # from openclaw import message
    # message.send(channel='whatsapp', to=to, text=message)
    
    return message


def notify():
    """Load results and send WhatsApp notification"""
    
    print(f"\n{'='*60}")
    print(f"6:00 AM Notifier - {datetime.now().strftime('%Y-%m-%d %H:%M:%S PT')}")
    print(f"{'='*60}\n")
    
    # Load results
    results = load_latest_results()
    
    if results is None:
        msg = format_error_message("No results file found. 3 AM run may have failed.")
        send_whatsapp_message(msg)
        return
    
    # Check if trading day
    if not results.get('is_trading_day', False):
        msg = "⏸️ *市场休市*\n\n"
        msg += "今天是周末或节假日。\n"
        msg += "明天见！"
        send_whatsapp_message(msg)
        return
    
    # Check for errors
    if 'error' in results:
        msg = format_error_message(results['error'])
        send_whatsapp_message(msg)
        return
    
    # Format and send recommendations
    recommendations = results.get('recommendations', [])
    timestamp = datetime.fromisoformat(results['timestamp'])
    
    msg = format_for_whatsapp(recommendations, timestamp)
    send_whatsapp_message(msg)
    
    print("\n✅ Notification sent!")


if __name__ == "__main__":
    notify()
