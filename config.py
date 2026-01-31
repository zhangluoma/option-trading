"""
Config loader helper
"""

import yaml
from pathlib import Path


def load_sentiment_config():
    """Load sentiment configuration"""
    config_path = Path(__file__).parent / 'config' / 'sentiment.yaml'
    with open(config_path) as f:
        return yaml.safe_load(f)
