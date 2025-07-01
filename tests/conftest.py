"""Shared pytest fixtures for MarketFinder ETL tests."""

from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path
from typing import Generator

import pytest


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def temp_dir() -> Generator[Path, None, None]:
    """Create a temporary directory for test artifacts."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        yield Path(tmp_dir)


@pytest.fixture
def test_env() -> Generator[dict[str, str], None, None]:
    """Set up test environment variables."""
    original_env = dict(os.environ)
    
    test_env_vars = {
        "ENVIRONMENT": "test",
        "DEBUG": "true",
        "DATABASE_URL": "duckdb:///tmp/test_marketfinder.db",
        "CACHE_TTL": "300",
        "MAX_MARKETS": "1000",
        "BATCH_SIZE": "100",
        "ENABLE_LLM": "false",  # Disable LLM for tests unless explicitly needed
    }
    
    os.environ.update(test_env_vars)
    
    yield test_env_vars
    
    # Restore original environment
    os.environ.clear()
    os.environ.update(original_env)


@pytest.fixture
def mock_api_keys() -> dict[str, str]:
    """Provide mock API keys for testing."""
    return {
        "KALSHI_API_KEY": "test_kalshi_key_12345",
        "POLYMARKET_API_KEY": "test_polymarket_key_12345", 
        "OPENAI_API_KEY": "test_openai_key_12345",
        "ANTHROPIC_API_KEY": "test_anthropic_key_12345",
    }


@pytest.fixture
def sample_market_data() -> dict[str, any]:
    """Provide sample market data for testing."""
    return {
        "platform": "test",
        "market_id": "test_123",
        "title": "Test Market",
        "category": "test",
        "close_time": "2024-12-31T23:59:59Z",
        "yes_price": 0.5,
        "no_price": 0.5,
        "volume_24h": 1000.0,
        "open_interest": 5000.0,
        "liquidity": 10000.0,
        "status": "open"
    }