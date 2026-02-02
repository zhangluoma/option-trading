#!/usr/bin/env python3
"""
策略优化器 - 基于实际交易结果优化参数

持续学习和改进：
1. 分析哪些币种表现最好
2. 分析哪些信号组合最准确
3. 调整权重和阈值
4. 生成优化建议
"""

import json
import sys
from pathlib import Path
from datetime import datetime
from collections import defaultdict

def load_trade_history():
    """加载交易历史"""
    history_file = Path('./data/trade_history.json')
    
    if not history_file.exists():
        return []
    
    with open(history_file) as f:
        return json.load(f)

def analyze_performance():
    """分析交易表现"""
    
    trades = load_trade_history()
    
    if not trades:
        print("⚠️  暂无交易历史，无法优化")
        return None
    
    closed_trades = [t for t in trades if t.get('status') == 'CLOSED']
    
    if not closed_trades:
        print("⚠️  暂无已平仓交易，无法优化")
        return None
    
    # 按币种统计
    by_ticker = defaultdict(lambda: {'trades': 0, 'wins': 0, 'total_pnl': 0})
    
    for trade in closed_trades:
        ticker = trade['ticker']
        by_ticker[ticker]['trades'] += 1
        if trade.get('pnl', 0) > 0:
            by_ticker[ticker]['wins'] += 1
        by_ticker[ticker]['total_pnl'] += trade.get('pnl', 0)
    
    # 计算每个币种的胜率
    ticker_stats = {}
    for ticker, stats in by_ticker.items():
        win_rate = stats['wins'] / stats['trades'] if stats['trades'] > 0 else 0
        avg_pnl = stats['total_pnl'] / stats['trades'] if stats['trades'] > 0 else 0
        
        ticker_stats[ticker] = {
            'trades': stats['trades'],
            'win_rate': win_rate,
            'avg_pnl': avg_pnl,
            'total_pnl': stats['total_pnl']
        }
    
    # 按总盈亏排序
    sorted_tickers = sorted(ticker_stats.items(), key=lambda x: x[1]['total_pnl'], reverse=True)
    
    print("📊 币种表现分析:")
    print("=" * 60)
    
    for ticker, stats in sorted_tickers:
        print(f"\n{ticker}:")
        print(f"  交易次数: {stats['trades']}")
        print(f"  胜率: {stats['win_rate']*100:.1f}%")
        print(f"  平均盈亏: ${stats['avg_pnl']:.2f}")
        print(f"  总盈亏: ${stats['total_pnl']:.2f}")
    
    # 生成优化建议
    print("\n" + "=" * 60)
    print("💡 优化建议:")
    print("=" * 60)
    
    # 找出表现最好的币种
    top_performers = [t for t, s in sorted_tickers[:3]]
    if top_performers:
        print(f"\n✅ 优先交易: {', '.join(top_performers)}")
        print("   这些币种表现最好，建议增加仓位")
    
    # 找出表现最差的币种
    bottom_performers = [t for t, s in sorted_tickers[-3:] if s['total_pnl'] < 0]
    if bottom_performers:
        print(f"\n⚠️  谨慎交易: {', '.join(bottom_performers)}")
        print("   这些币种容易亏损，建议降低仓位或暂停")
    
    # 总体胜率
    total_wins = sum(t.get('pnl', 0) > 0 for t in closed_trades)
    total_trades = len(closed_trades)
    overall_win_rate = total_wins / total_trades if total_trades > 0 else 0
    
    print(f"\n📈 总体胜率: {overall_win_rate*100:.1f}%")
    
    if overall_win_rate < 0.5:
        print("   ⚠️  胜率较低，建议:")
        print("      1. 提高信号阈值（更严格筛选）")
        print("      2. 减小仓位规模")
        print("      3. 调整止盈止损比例")
    elif overall_win_rate > 0.6:
        print("   ✅ 胜率良好，建议:")
        print("      1. 保持当前策略")
        print("      2. 可考虑增加仓位")
        print("      3. 增加交易频率")
    
    # 平均盈亏比
    winning_trades = [t for t in closed_trades if t.get('pnl', 0) > 0]
    losing_trades = [t for t in closed_trades if t.get('pnl', 0) < 0]
    
    if winning_trades and losing_trades:
        avg_win = sum(t['pnl'] for t in winning_trades) / len(winning_trades)
        avg_loss = abs(sum(t['pnl'] for t in losing_trades) / len(losing_trades))
        profit_factor = avg_win / avg_loss if avg_loss > 0 else 0
        
        print(f"\n💰 盈亏比: {profit_factor:.2f}")
        
        if profit_factor < 1.5:
            print("   ⚠️  盈亏比偏低，建议:")
            print("      1. 提高止盈目标（当前10%）")
            print("      2. 降低止损限制（当前5%）")
        elif profit_factor > 2.0:
            print("   ✅ 盈亏比优秀，继续保持")
    
    return ticker_stats

def generate_blacklist(ticker_stats, min_trades=3, min_win_rate=0.3):
    """生成黑名单（表现极差的币种）"""
    
    if not ticker_stats:
        return []
    
    blacklist = []
    
    for ticker, stats in ticker_stats.items():
        # 至少3笔交易且胜率<30%
        if stats['trades'] >= min_trades and stats['win_rate'] < min_win_rate:
            blacklist.append(ticker)
    
    return blacklist

def generate_whitelist(ticker_stats, min_trades=2, min_win_rate=0.6):
    """生成白名单（表现优秀的币种）"""
    
    if not ticker_stats:
        return []
    
    whitelist = []
    
    for ticker, stats in ticker_stats.items():
        # 至少2笔交易且胜率>60%
        if stats['trades'] >= min_trades and stats['win_rate'] > min_win_rate:
            whitelist.append(ticker)
    
    return whitelist

if __name__ == '__main__':
    print("🔍 策略优化分析\n")
    
    stats = analyze_performance()
    
    if stats:
        print("\n" + "=" * 60)
        
        blacklist = generate_blacklist(stats)
        whitelist = generate_whitelist(stats)
        
        if whitelist:
            print(f"\n🌟 白名单 (优先): {', '.join(whitelist)}")
        
        if blacklist:
            print(f"\n🚫 黑名单 (避免): {', '.join(blacklist)}")
        
        print("\n" + "=" * 60)
        print("💡 优化建议已生成，继续交易以收集更多数据")
