"""
Database schema migration
Adds asset_type column to existing tables
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / 'sentiment.db'


def migrate():
    """Add asset_type column to existing tables"""
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    print("🔄 Migrating database schema...")
    print()
    
    # Check if columns already exist
    try:
        # Add asset_type to posts
        try:
            cursor.execute("ALTER TABLE posts ADD COLUMN asset_type TEXT DEFAULT 'stock'")
            print("✅ Added asset_type to posts")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e):
                print("⏭️  posts.asset_type already exists")
            else:
                raise
        
        # Add asset_type to tickers
        try:
            cursor.execute("ALTER TABLE tickers ADD COLUMN asset_type TEXT DEFAULT 'stock'")
            print("✅ Added asset_type to tickers")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e):
                print("⏭️  tickers.asset_type already exists")
            else:
                raise
        
        # Add asset_type to sentiment_snapshots
        try:
            cursor.execute("ALTER TABLE sentiment_snapshots ADD COLUMN asset_type TEXT DEFAULT 'stock'")
            print("✅ Added asset_type to sentiment_snapshots")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e):
                print("⏭️  sentiment_snapshots.asset_type already exists")
            else:
                raise
        
        conn.commit()
        print()
        print("✅ Migration complete!")
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        conn.rollback()
        raise
    
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
