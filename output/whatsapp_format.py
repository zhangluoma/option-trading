"""
WhatsApp message formatter
Formats recommendations for mobile reading
"""

from datetime import datetime


def format_for_whatsapp(recommendations, timestamp=None):
    """
    Format recommendations for WhatsApp
    Mobile-friendly, concise, actionable
    
    Returns: String message ready to send
    """
    
    if timestamp is None:
        timestamp = datetime.now()
    
    # Header
    msg = f"📊 *Options Sentiment Report*\n"
    msg += f"🕐 {timestamp.strftime('%Y-%m-%d %H:%M PT')}\n"
    msg += f"━━━━━━━━━━━━━━━━━━━━\n\n"
    
    if not recommendations:
        msg += "❌ *No trades today*\n\n"
        msg += "市场情绪不明确或风险过高。\n"
        msg += "今天保持观望。"
        return msg
    
    msg += f"✅ *{len(recommendations)} 个推荐*\n\n"
    
    for i, rec in enumerate(recommendations, 1):
        # Emoji based on direction
        if rec['direction'] == 'bullish':
            emoji = '🟢'
            action = 'BUY CALLS'
        else:
            emoji = '🔴'
            action = 'BUY PUTS'
        
        msg += f"{emoji} *{i}. ${rec['ticker']}* - {action}\n"
        
        # Confidence indicator
        if rec['confidence'] == 'high':
            conf_emoji = '🔥'
        else:
            conf_emoji = '⚡'
        
        msg += f"{conf_emoji} 信心: {rec['confidence'].upper()}\n"
        msg += f"💯 情绪分数: {rec['sentiment_score']}\n"
        
        # Option details
        pos = rec['position']
        msg += f"📋 行权价: ${pos['strike']}\n"
        msg += f"💵 权利金: ${pos['premium']:.2f}\n"
        msg += f"📆 到期: {pos['expiration']} ({pos['dte']}天)\n"
        msg += f"📦 建议买入: {pos['contracts']} 张\n"
        msg += f"💸 最大亏损: ${pos['max_loss']:,}\n"
        msg += f"📊 占比: {pos['pct_of_account'] * 100:.1f}%\n"
        
        # Reasons (condensed)
        if rec['reasons']:
            msg += f"📌 原因:\n"
            for reason in rec['reasons'][:2]:  # Max 2 reasons for mobile
                msg += f"   • {reason}\n"
        
        msg += "\n"
    
    # Footer
    msg += f"━━━━━━━━━━━━━━━━━━━━\n"
    msg += f"⚠️ 总风险: $"
    total_risk = sum(r['position']['max_loss'] for r in recommendations)
    msg += f"{total_risk:,}\n"
    msg += f"💰 账户: $7,000\n\n"
    
    msg += "⏰ 记得设置止损！"
    
    return msg


def format_error_message(error_msg):
    """Format error/issue message"""
    
    msg = f"⚠️ *系统问题*\n\n"
    msg += f"今天的 research 遇到问题:\n"
    msg += f"{error_msg}\n\n"
    msg += f"请检查系统日志。"
    
    return msg


if __name__ == "__main__":
    # Test with mock data
    mock_recs = [
        {
            'ticker': 'AAPL',
            'direction': 'bullish',
            'structure': 'long_call',
            'sentiment_score': 0.82,
            'confidence': 'high',
            'position': {
                'contracts': 3,
                'max_loss': 1050,
                'pct_of_account': 0.15
            },
            'reasons': [
                'Reddit: 85 mentions',
                'Unusual: $1,200,000 call flow'
            ]
        }
    ]
    
    msg = format_for_whatsapp(mock_recs)
    print(msg)
