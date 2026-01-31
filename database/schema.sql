-- Posts tracking table (for deduplication)
CREATE TABLE IF NOT EXISTS posts (
    post_id TEXT PRIMARY KEY,
    source TEXT NOT NULL,  -- 'reddit', 'yahoo', 'stocktwits'
    asset_type TEXT DEFAULT 'stock',  -- 'stock' or 'crypto'
    ticker TEXT NOT NULL,
    title TEXT,
    content TEXT,
    url TEXT,
    author TEXT,
    score INTEGER,  -- upvotes/likes
    created_at DATETIME NOT NULL,
    first_seen_at DATETIME NOT NULL,
    content_hash TEXT NOT NULL,
    sentiment_score REAL
);

CREATE INDEX IF NOT EXISTS idx_posts_ticker ON posts(ticker);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);

-- Hourly sentiment snapshots
CREATE TABLE IF NOT EXISTS sentiment_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_type TEXT DEFAULT 'stock',  -- 'stock' or 'crypto'
    ticker TEXT NOT NULL,
    snapshot_time DATETIME NOT NULL,
    
    -- Data source breakdowns
    reddit_sentiment REAL DEFAULT 0,
    reddit_mentions INTEGER DEFAULT 0,
    yahoo_sentiment REAL DEFAULT 0,
    yahoo_mentions INTEGER DEFAULT 0,
    trends_interest INTEGER DEFAULT 0,
    unusual_flow INTEGER DEFAULT 0,
    
    -- Combined metrics
    combined_sentiment REAL NOT NULL,
    total_mentions INTEGER NOT NULL,
    new_posts_this_hour INTEGER DEFAULT 0,
    
    -- Trend indicators
    sentiment_change_1h REAL,
    sentiment_change_24h REAL,
    mention_spike BOOLEAN DEFAULT 0,
    
    UNIQUE(ticker, snapshot_time)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_ticker_time ON sentiment_snapshots(ticker, snapshot_time);

-- Ticker metadata
CREATE TABLE IF NOT EXISTS tickers (
    ticker TEXT PRIMARY KEY,
    asset_type TEXT DEFAULT 'stock',  -- 'stock' or 'crypto'
    first_seen DATETIME NOT NULL,
    last_updated DATETIME NOT NULL,
    total_mentions INTEGER DEFAULT 0,
    avg_sentiment REAL DEFAULT 0.5
);
