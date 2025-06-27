"""Kalshi market data extractor."""

import asyncio
from typing import Any, Dict, List, Optional
from datetime import datetime
from decimal import Decimal

from marketfinder_etl.extractors.base import BaseExtractor, ExtractorConfig
from marketfinder_etl.models.market import RawMarketData, MarketPlatform, MarketOutcome, NormalizedMarket, MarketStatus, MarketEventType
from marketfinder_etl.core.config import settings


class KalshiExtractor(BaseExtractor):
    """Extractor for Kalshi prediction markets."""
    
    def __init__(self, config: Optional[ExtractorConfig] = None):
        super().__init__(config)
        self.platform = MarketPlatform.KALSHI
    
    def get_platform(self) -> MarketPlatform:
        """Get the platform this extractor handles."""
        return MarketPlatform.KALSHI
    
    def get_auth_headers(self) -> Dict[str, str]:
        """Get authentication headers for Kalshi API."""
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        
        # Add authentication if credentials are available
        if settings.kalshi_email and settings.kalshi_password:
            # TODO: Implement Kalshi authentication
            # For now, Kalshi doesn't require auth for market data
            pass
        
        return headers
    
    def get_base_url(self) -> str:
        """Get base URL for Kalshi API."""
        return settings.kalshi_base_url or "https://api.elections.kalshi.com/trade-api/v2"
    
    async def extract_markets(self, max_markets: Optional[int] = None) -> List[RawMarketData]:
        """Extract market data from Kalshi API."""
        self.logger.info("Starting Kalshi market extraction")
        
        try:
            # Fetch markets from the markets endpoint
            response = await self.make_request("GET", "markets")
            
            # Handle response format
            all_markets = response.get("markets", response if isinstance(response, list) else [])
            
            if not isinstance(all_markets, list):
                raise ValueError("Invalid Kalshi API response format")
            
            self.logger.info(f"Kalshi returned {len(all_markets)} total markets")
            
            # Filter for active markets
            active_markets = self._filter_active_markets(all_markets)
            self.logger.info(f"Filtered to {len(active_markets)} active Kalshi markets")
            
            # Apply limit if specified
            if max_markets and len(active_markets) > max_markets:
                active_markets = active_markets[:max_markets]
                self.logger.info(f"Limited to {max_markets} markets")
            
            # Create RawMarketData instances
            raw_markets = []
            for market in active_markets:
                try:
                    external_id = market.get("ticker") or market.get("id")
                    if not external_id:
                        self.logger.warning("Skipping market without identifier", market=market)
                        continue
                    
                    raw_market = self.create_raw_market_data(
                        external_id=external_id,
                        raw_data=market,
                        api_endpoint="markets"
                    )
                    raw_markets.append(raw_market)
                    
                except Exception as e:
                    self.logger.error(f"Failed to process market {market.get('ticker', 'unknown')}: {e}")
                    continue
            
            self.logger.info(f"Successfully extracted {len(raw_markets)} Kalshi markets")
            return raw_markets
            
        except Exception as e:
            self.logger.error(f"Failed to extract Kalshi markets: {e}")
            raise
    
    def _filter_active_markets(self, markets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Filter for active, valid markets."""
        active_markets = []
        current_time = datetime.utcnow().isoformat()
        
        for market in markets:
            try:
                # Check if market is still open
                close_time = market.get("close_time")
                if not close_time or close_time <= current_time:
                    continue
                
                # Check market status
                status = market.get("status")
                if status not in ["active", "initialized"]:
                    continue
                
                # Ensure we have a valid identifier
                if not market.get("ticker") and not market.get("id"):
                    continue
                
                # Ensure we have basic market information
                if not market.get("title"):
                    continue
                
                active_markets.append(market)
                
            except Exception as e:
                self.logger.warning(f"Error filtering market: {e}", market_id=market.get("ticker"))
                continue
        
        return active_markets
    
    def standardize_category(self, category: Optional[str]) -> str:
        """Standardize Kalshi category names."""
        if not category:
            return "Other"
        
        # Mapping of Kalshi categories to standardized names
        category_mapping = {
            "Economics": "Economics",
            "Politics": "Politics", 
            "Elections": "Politics",
            "Weather": "Weather",
            "Sports": "Sports",
            "Entertainment": "Entertainment",
            "Technology": "Technology",
            "Science": "Science",
            "Business": "Business",
            "Crypto": "Cryptocurrency",
            "Cryptocurrency": "Cryptocurrency",
        }
        
        # Clean and standardize
        clean_category = category.strip().title()
        return category_mapping.get(clean_category, "Other")
    
    def categorize_from_title(self, title: str) -> str:
        """Categorize market based on title keywords."""
        if not title:
            return "Other"
        
        title_lower = title.lower()
        
        # Keyword-based categorization
        if any(word in title_lower for word in ["election", "president", "congress", "senate", "vote", "poll"]):
            return "Politics"
        elif any(word in title_lower for word in ["bitcoin", "crypto", "ethereum", "btc", "eth"]):
            return "Cryptocurrency"
        elif any(word in title_lower for word in ["gdp", "inflation", "fed", "economy", "unemployment"]):
            return "Economics"
        elif any(word in title_lower for word in ["nfl", "nba", "mlb", "nhl", "super bowl", "world cup"]):
            return "Sports"
        elif any(word in title_lower for word in ["temperature", "weather", "hurricane", "rain"]):
            return "Weather"
        elif any(word in title_lower for word in ["movie", "oscar", "emmy", "celebrity"]):
            return "Entertainment"
        elif any(word in title_lower for word in ["stock", "company", "ipo", "earnings"]):
            return "Business"
        else:
            return "Other"
    
    def calculate_price(self, market: Dict[str, Any], outcome: str) -> Decimal:
        """Calculate price for a specific outcome."""
        try:
            if outcome.lower() == "yes":
                # Try different price fields Kalshi might use
                price = (
                    market.get("yes_ask") or
                    market.get("yes_price") or
                    market.get("last_price") or
                    0.5  # Default to 50% if no price available
                )
            else:  # "no"
                price = (
                    market.get("no_ask") or
                    market.get("no_price") or
                    (1.0 - (market.get("yes_ask") or market.get("yes_price") or 0.5))
                )
            
            # Ensure price is between 0 and 1
            price = max(0.0, min(1.0, float(price)))
            return Decimal(str(price))
            
        except (ValueError, TypeError):
            # Default to 50% if calculation fails
            return Decimal("0.5")
    
    async def extract_market_details(self, market_id: str) -> Optional[Dict[str, Any]]:
        """Extract detailed information for a specific market."""
        try:
            response = await self.make_request("GET", f"markets/{market_id}")
            return response.get("market", response)
        except Exception as e:
            self.logger.error(f"Failed to extract details for market {market_id}: {e}")
            return None
    
    def transform_to_normalized_market(self, raw_market: RawMarketData) -> NormalizedMarket:
        """Transform raw Kalshi market data to normalized format."""
        market_data = raw_market.raw_data
        
        # Extract basic information
        external_id = raw_market.external_id
        title = market_data.get("title", "Untitled Market")
        description = market_data.get("subtitle") or market_data.get("description") or title
        category = self.standardize_category(market_data.get("category")) or self.categorize_from_title(title)
        
        # Create outcomes for binary market
        yes_price = self.calculate_price(market_data, "yes")
        no_price = self.calculate_price(market_data, "no")
        
        outcomes = [
            MarketOutcome(name="Yes", price=yes_price),
            MarketOutcome(name="No", price=no_price)
        ]
        
        # Extract timing information
        end_date = datetime.fromisoformat(market_data["close_time"].replace("Z", "+00:00"))
        created_date = None
        if market_data.get("created_time"):
            created_date = datetime.fromisoformat(market_data["created_time"].replace("Z", "+00:00"))
        
        # Calculate volume and liquidity
        # Kalshi doesn't provide volume directly, use liquidity/open_interest as proxy
        liquidity = Decimal(str(market_data.get("liquidity", 0)))
        volume = liquidity / Decimal("1000")  # Scale liquidity to volume-like range
        
        return NormalizedMarket(
            platform=self.platform,
            external_id=external_id,
            title=title,
            description=description,
            category=category,
            tags=[category.lower()],
            event_type=MarketEventType.BINARY,
            outcomes=outcomes,
            created_date=created_date,
            end_date=end_date,
            volume=volume,
            liquidity=liquidity,
            status=MarketStatus.ACTIVE,
            is_active=True,
            processed_at=datetime.utcnow()
        )