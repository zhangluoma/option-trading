#!/usr/bin/env python3
"""
Test runner - manually trigger research to see output
Run this to test without waiting for cron
"""

from main import run_research
from output.whatsapp_format import format_for_whatsapp
from datetime import datetime


def test_full_pipeline():
    """Test the entire research pipeline"""
    
    print("\n" + "🧪 " * 20)
    print("TESTING OPTIONS SENTIMENT ENGINE")
    print("🧪 " * 20 + "\n")
    
    print("Running full research pipeline...\n")
    
    # Run research
    recommendations = run_research()
    
    print("\n" + "=" * 60)
    print("WhatsApp Preview")
    print("=" * 60 + "\n")
    
    # Format for WhatsApp
    msg = format_for_whatsapp(recommendations, datetime.now())
    print(msg)
    
    print("\n" + "=" * 60)
    print(f"✅ Test complete!")
    print(f"   Found {len(recommendations)} recommendations")
    print("=" * 60 + "\n")
    
    return recommendations


if __name__ == "__main__":
    test_full_pipeline()
