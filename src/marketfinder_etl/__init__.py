"""
MarketFinder ETL - Modern Python data engineering pipeline for prediction market arbitrage detection.

This package provides a comprehensive ETL pipeline that:
1. Extracts market data from Kalshi and Polymarket APIs
2. Applies semantic bucketing and hierarchical filtering  
3. Uses ML-enhanced scoring for arbitrage opportunity detection
4. Orchestrates workflows with Apache Airflow
5. Processes data with high-performance tools (Polars, DuckDB)
"""

__version__ = "0.1.0"
__author__ = "MarketFinder Team"
__email__ = "team@marketfinder.dev"

# Core modules
from marketfinder_etl.core.config import Settings
from marketfinder_etl.core.logging import get_logger

# Make key components available at package level
__all__ = [
    "Settings",
    "get_logger",
    "__version__",
    "__author__",
    "__email__",
]