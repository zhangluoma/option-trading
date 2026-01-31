"""
Database manager for sentiment tracking
"""

import sqlite3
import hashlib
from datetime import datetime
from pathlib import Path


DB_PATH = Path(__file__).parent / 'sentiment.db'


def get_connection():
    """Get database connection"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_database():
    """Initialize database with schema"""
    schema_path = Path(__file__).parent / 'schema.sql'
    
    with open(schema_path) as f:
        schema = f.read()
    
    conn = get_connection()
    conn.executescript(schema)
    conn.commit()
    conn.close()
    
    print("Database initialized ✅")


def content_hash(text):
    """Generate hash for content deduplication"""
    return hashlib.md5(text.lower().encode()).hexdigest()


def is_post_seen(post_id, source):
    """Check if post already processed"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute(
        "SELECT 1 FROM posts WHERE post_id = ? AND source = ?",
        (post_id, source)
    )
    
    exists = cursor.fetchone() is not None
    conn.close()
    
    return exists


def save_post(post_data):
    """
    Save a post to database
    
    Args:
        post_data: {
            'post_id': str,
            'source': str,
            'ticker': str,
            'title': str,
            'content': str,
            'url': str,
            'author': str,
            'score': int,
            'created_at': datetime,
            'sentiment_score': float
        }
    """
    
    if is_post_seen(post_data['post_id'], post_data['source']):
        return False  # Already exists
    
    conn = get_connection()
    cursor = conn.cursor()
    
    # Generate content hash
    text = f"{post_data.get('title', '')}{post_data.get('content', '')}"
    chash = content_hash(text)
    
    cursor.execute("""
        INSERT INTO posts (
            post_id, source, ticker, title, content, url, author, score,
            created_at, first_seen_at, content_hash, sentiment_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        post_data['post_id'],
        post_data['source'],
        post_data['ticker'],
        post_data.get('title', ''),
        post_data.get('content', ''),
        post_data.get('url', ''),
        post_data.get('author', ''),
        post_data.get('score', 0),
        post_data['created_at'],
        datetime.now(),
        chash,
        post_data.get('sentiment_score', 0.5)
    ))
    
    conn.commit()
    conn.close()
    
    return True  # New post saved


def get_tickers_by_type(asset_type='stock'):
    """Get list of tickers filtered by asset type"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT ticker, last_updated, total_mentions, avg_sentiment
        FROM tickers
        WHERE asset_type = ?
        ORDER BY last_updated DESC
    """, (asset_type,))
    
    rows = cursor.fetchall()
    conn.close()
    
    return [dict(row) for row in rows]


def save_snapshot(snapshot_data):
    """
    Save hourly sentiment snapshot
    
    Args:
        snapshot_data: {
            'ticker': str,
            'snapshot_time': datetime,
            'reddit_sentiment': float,
            'reddit_mentions': int,
            'yahoo_sentiment': float,
            'yahoo_mentions': int,
            'trends_interest': int,
            'unusual_flow': int,
            'combined_sentiment': float,
            'total_mentions': int,
            'new_posts_this_hour': int
        }
    """
    
    conn = get_connection()
    cursor = conn.cursor()
    
    # Get previous snapshots for trend calculation
    cursor.execute("""
        SELECT combined_sentiment
        FROM sentiment_snapshots
        WHERE ticker = ?
        ORDER BY snapshot_time DESC
        LIMIT 2 OFFSET 0
    """, (snapshot_data['ticker'],))
    
    prev_snapshots = cursor.fetchall()
    
    sentiment_change_1h = None
    sentiment_change_24h = None
    
    if len(prev_snapshots) >= 1:
        sentiment_change_1h = snapshot_data['combined_sentiment'] - prev_snapshots[0][0]
    
    # Get 24h ago snapshot
    cursor.execute("""
        SELECT combined_sentiment
        FROM sentiment_snapshots
        WHERE ticker = ?
        AND snapshot_time <= datetime('now', '-24 hours')
        ORDER BY snapshot_time DESC
        LIMIT 1
    """, (snapshot_data['ticker'],))
    
    day_ago = cursor.fetchone()
    if day_ago:
        sentiment_change_24h = snapshot_data['combined_sentiment'] - day_ago[0]
    
    # Detect mention spike (3x average)
    cursor.execute("""
        SELECT AVG(total_mentions)
        FROM sentiment_snapshots
        WHERE ticker = ?
        AND snapshot_time >= datetime('now', '-7 days')
    """, (snapshot_data['ticker'],))
    
    avg_mentions_result = cursor.fetchone()
    avg_mentions = avg_mentions_result[0] if avg_mentions_result[0] else 0
    
    mention_spike = 1 if snapshot_data['total_mentions'] > avg_mentions * 3 else 0
    
    # Insert snapshot
    cursor.execute("""
        INSERT OR REPLACE INTO sentiment_snapshots (
            asset_type, ticker, snapshot_time,
            reddit_sentiment, reddit_mentions,
            yahoo_sentiment, yahoo_mentions,
            trends_interest, unusual_flow,
            combined_sentiment, total_mentions, new_posts_this_hour,
            sentiment_change_1h, sentiment_change_24h, mention_spike
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        snapshot_data.get('asset_type', 'stock'),
        snapshot_data['ticker'],
        snapshot_data['snapshot_time'],
        snapshot_data.get('reddit_sentiment', 0),
        snapshot_data.get('reddit_mentions', 0),
        snapshot_data.get('yahoo_sentiment', 0),
        snapshot_data.get('yahoo_mentions', 0),
        snapshot_data.get('trends_interest', 0),
        snapshot_data.get('unusual_flow', 0),
        snapshot_data['combined_sentiment'],
        snapshot_data['total_mentions'],
        snapshot_data.get('new_posts_this_hour', 0),
        sentiment_change_1h,
        sentiment_change_24h,
        mention_spike
    ))
    
    # Update ticker metadata
    cursor.execute("""
        INSERT INTO tickers (ticker, asset_type, first_seen, last_updated, total_mentions, avg_sentiment)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(ticker) DO UPDATE SET
            last_updated = excluded.last_updated,
            total_mentions = total_mentions + excluded.total_mentions,
            avg_sentiment = (avg_sentiment + excluded.avg_sentiment) / 2
    """, (
        snapshot_data['ticker'],
        snapshot_data.get('asset_type', 'stock'),
        datetime.now(),
        datetime.now(),
        snapshot_data['total_mentions'],
        snapshot_data['combined_sentiment']
    ))
    
    conn.commit()
    conn.close()


def get_ticker_history(ticker, hours=168):
    """
    Get sentiment history for a ticker
    
    Args:
        ticker: Stock symbol
        hours: Lookback period (default 7 days = 168 hours)
    
    Returns: List of snapshots
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT *
        FROM sentiment_snapshots
        WHERE ticker = ?
        AND snapshot_time >= datetime('now', '-' || ? || ' hours')
        ORDER BY snapshot_time ASC
    """, (ticker, hours))
    
    rows = cursor.fetchall()
    conn.close()
    
    return [dict(row) for row in rows]


def get_all_tickers():
    """Get list of all tracked tickers"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT ticker, last_updated, total_mentions, avg_sentiment
        FROM tickers
        ORDER BY last_updated DESC
    """)
    
    rows = cursor.fetchall()
    conn.close()
    
    return [dict(row) for row in rows]


if __name__ == "__main__":
    # Initialize database
    init_database()
    print("Database ready!")
