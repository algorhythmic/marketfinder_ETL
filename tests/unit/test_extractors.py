"""Unit tests for data extractors (Kalshi, Polymarket)."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

# Skip if imports fail (dependencies not available)
pytest.importorskip("marketfinder_etl.extractors.kalshi")
pytest.importorskip("marketfinder_etl.extractors.polymarket")


@pytest.mark.unit
@pytest.mark.asyncio
async def test_kalshi_extractor_initialization() -> None:
    """Test Kalshi extractor initializes correctly."""
    from marketfinder_etl.extractors.kalshi import KalshiExtractor
    
    extractor = KalshiExtractor()
    
    assert extractor is not None
    assert hasattr(extractor, 'fetch_markets')
    assert hasattr(extractor, 'normalize_market')


@pytest.mark.unit
@pytest.mark.asyncio
async def test_polymarket_extractor_initialization() -> None:
    """Test Polymarket extractor initializes correctly."""
    from marketfinder_etl.extractors.polymarket import PolymarketExtractor
    
    extractor = PolymarketExtractor()
    
    assert extractor is not None
    assert hasattr(extractor, 'fetch_markets')
    assert hasattr(extractor, 'normalize_market')


@pytest.mark.unit
@pytest.mark.asyncio
async def test_kalshi_market_normalization() -> None:
    """Test Kalshi market data normalization."""
    from marketfinder_etl.extractors.kalshi import KalshiExtractor
    from marketfinder_etl.models.market import NormalizedMarket
    
    extractor = KalshiExtractor()
    
    # Mock Kalshi market data
    raw_kalshi_data = {
        "id": "KALSHI123",
        "title": "Will candidate X win?",
        "category": "politics",
        "close_time": "2024-12-31T23:59:59Z",
        "last_price": 0.65,
        "volume": 10000,
        "open_interest": 5000,
        "status": "open"
    }
    
    # Test normalization
    normalized = extractor.normalize_market(raw_kalshi_data)
    
    assert isinstance(normalized, NormalizedMarket)
    assert normalized.platform == "kalshi"
    assert normalized.market_id == "KALSHI123"
    assert normalized.title == "Will candidate X win?"
    assert normalized.yes_price == 0.65
    assert normalized.no_price == 0.35  # Should be 1 - yes_price


@pytest.mark.unit
@pytest.mark.asyncio
async def test_polymarket_market_normalization() -> None:
    """Test Polymarket market data normalization."""
    from marketfinder_etl.extractors.polymarket import PolymarketExtractor
    from marketfinder_etl.models.market import NormalizedMarket
    
    extractor = PolymarketExtractor()
    
    # Mock Polymarket data
    raw_polymarket_data = {
        "id": "POLY456", 
        "question": "Will candidate Y win?",
        "category": "politics",
        "end_date": "2024-12-31T23:59:59Z",
        "outcome_prices": [0.45, 0.55],  # [No, Yes]
        "volume_24hr": 25000,
        "liquidity": 50000,
        "active": True
    }
    
    # Test normalization
    normalized = extractor.normalize_market(raw_polymarket_data)
    
    assert isinstance(normalized, NormalizedMarket)
    assert normalized.platform == "polymarket"
    assert normalized.market_id == "POLY456"
    assert normalized.title == "Will candidate Y win?"
    assert normalized.yes_price == 0.55
    assert normalized.no_price == 0.45


@pytest.mark.unit
@pytest.mark.asyncio
async def test_extractor_error_handling() -> None:
    """Test extractors handle malformed data gracefully."""
    from marketfinder_etl.extractors.kalshi import KalshiExtractor
    from marketfinder_etl.extractors.polymarket import PolymarketExtractor
    
    kalshi_extractor = KalshiExtractor()
    polymarket_extractor = PolymarketExtractor()
    
    # Test with empty data
    with pytest.raises((ValueError, KeyError, TypeError)):
        kalshi_extractor.normalize_market({})
        
    with pytest.raises((ValueError, KeyError, TypeError)):
        polymarket_extractor.normalize_market({})
    
    # Test with malformed data
    bad_data = {"invalid": "data", "missing": "required_fields"}
    
    with pytest.raises((ValueError, KeyError, TypeError)):
        kalshi_extractor.normalize_market(bad_data)
        
    with pytest.raises((ValueError, KeyError, TypeError)):
        polymarket_extractor.normalize_market(bad_data)


@pytest.mark.unit
@pytest.mark.asyncio 
async def test_fetch_markets_with_mock() -> None:
    """Test market fetching with mocked HTTP responses."""
    from marketfinder_etl.extractors.kalshi import KalshiExtractor
    
    extractor = KalshiExtractor()
    
    # Mock the HTTP client response
    mock_response_data = {
        "markets": [
            {
                "id": "TEST123",
                "title": "Test Market",
                "category": "test",
                "close_time": "2024-12-31T23:59:59Z",
                "last_price": 0.5,
                "volume": 1000,
                "open_interest": 500,
                "status": "open"
            }
        ]
    }
    
    with patch.object(extractor, '_make_api_request', new_callable=AsyncMock) as mock_request:
        mock_request.return_value = mock_response_data
        
        markets = await extractor.fetch_markets(limit=10)
        
        assert len(markets) == 1
        assert markets[0].market_id == "TEST123"
        assert markets[0].platform == "kalshi"
        mock_request.assert_called_once()


@pytest.mark.unit
def test_extractor_configuration() -> None:
    """Test extractor configuration and settings."""
    from marketfinder_etl.extractors.kalshi import KalshiExtractor
    from marketfinder_etl.extractors.polymarket import PolymarketExtractor
    
    # Test default configuration
    kalshi = KalshiExtractor()
    polymarket = PolymarketExtractor()
    
    assert hasattr(kalshi, 'config')
    assert hasattr(polymarket, 'config')
    
    # Test that extractors have proper base URLs or endpoints configured
    assert hasattr(kalshi, 'base_url') or hasattr(kalshi, 'api_endpoint')
    assert hasattr(polymarket, 'base_url') or hasattr(polymarket, 'api_endpoint')