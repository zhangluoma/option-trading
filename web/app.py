"""
Web UI for sentiment visualization
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from flask import Flask, render_template, jsonify, request
from database.db_manager import get_ticker_history, get_all_tickers, get_tickers_by_type, get_ticker_posts

app = Flask(__name__)


@app.route('/')
def index():
    """Main dashboard"""
    return render_template('index.html')


@app.route('/api/tickers')
def api_tickers():
    """Get list of all tickers, optionally filtered by type"""
    asset_type = request.args.get('type', None)
    
    if asset_type:
        tickers = get_tickers_by_type(asset_type)
    else:
        tickers = get_all_tickers()
    
    return jsonify(tickers)


@app.route('/api/sentiment/<ticker>')
def api_sentiment(ticker):
    """Get sentiment history for a ticker"""
    hours = 168  # 7 days
    history = get_ticker_history(ticker, hours)
    return jsonify(history)


@app.route('/api/posts/<ticker>')
def api_posts(ticker):
    """Get posts for a ticker"""
    limit = int(request.args.get('limit', 20))
    posts = get_ticker_posts(ticker, limit)
    return jsonify(posts)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
