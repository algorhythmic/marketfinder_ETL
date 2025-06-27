"""Polymarket data extractor."""

import asyncio
import json
from typing import Any, Dict, List, Optional, AsyncGenerator
from datetime import datetime
from decimal import Decimal

from marketfinder_etl.extractors.base import BaseExtractor, ExtractorConfig
from marketfinder_etl.models.market import RawMarketData, MarketPlatform, MarketOutcome, NormalizedMarket, MarketStatus, MarketEventType
from marketfinder_etl.core.config import settings


class PolymarketExtractor(BaseExtractor):
    """Extractor for Polymarket prediction markets."""
    
    def __init__(self, config: Optional[ExtractorConfig] = None):
        super().__init__(config)
        self.platform = MarketPlatform.POLYMARKET
    
    def get_platform(self) -> MarketPlatform:
        """Get the platform this extractor handles."""
        return MarketPlatform.POLYMARKET
    
    def get_auth_headers(self) -> Dict[str, str]:
        """Get authentication headers for Polymarket API."""
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        
        # Add API key if available
        if settings.polymarket_api_key:
            headers["Authorization"] = f"Bearer {settings.polymarket_api_key}"
        
        return headers
    
    def get_base_url(self) -> str:
        """Get base URL for Polymarket API."""
        return settings.polymarket_base_url or "https://gamma-api.polymarket.com"
    
    async def extract_markets(self, max_markets: Optional[int] = None) -> List[RawMarketData]:
        """Extract market data from Polymarket API with pagination."""
        self.logger.info("Starting Polymarket market extraction")
        
        try:
            all_markets = []
            limit = 100
            max_batches = (max_markets // limit + 1) if max_markets else None
            batch_count = 0
            
            async for response in self.extract_paginated(
                endpoint="markets",
                page_param="offset",
                limit_param="limit",
                page_size=limit,
                max_pages=max_batches,
                params={
                    "active": "true",
                    "archived": "false", 
                    "order": "startDate",
                    "ascending": "false"
                }
            ):
                markets = self.extract_items_from_response(response)
                all_markets.extend(markets)
                batch_count += 1
                
                self.logger.debug(f"Batch {batch_count}: fetched {len(markets)} markets")
                
                # Check if we've reached the max markets limit
                if max_markets and len(all_markets) >= max_markets:
                    all_markets = all_markets[:max_markets]
                    break
            
            self.logger.info(f"Polymarket returned {len(all_markets)} total markets across {batch_count} batches")
            
            # Filter for valid binary markets
            binary_markets = self._filter_binary_markets(all_markets)
            self.logger.info(f"Filtered to {len(binary_markets)} active binary Polymarket markets")
            
            # Create RawMarketData instances
            raw_markets = []
            for market in binary_markets:
                try:
                    external_id = market.get("id") or market.get("conditionId")
                    if not external_id:
                        self.logger.warning("Skipping market without identifier", market=market)
                        continue
                    
                    raw_market = self.create_raw_market_data(
                        external_id=str(external_id),
                        raw_data=market,
                        api_endpoint="markets"
                    )
                    raw_markets.append(raw_market)
                    
                except Exception as e:
                    self.logger.error(f"Failed to process market {market.get('id', 'unknown')}: {e}")
                    continue
            
            self.logger.info(f"Successfully extracted {len(raw_markets)} Polymarket markets")
            return raw_markets
            
        except Exception as e:
            self.logger.error(f"Failed to extract Polymarket markets: {e}")
            raise
    
    def extract_items_from_response(self, response: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract markets from Polymarket API response."""
        if isinstance(response, list):
            return response
        elif isinstance(response, dict):
            return response.get("markets", response.get("data", []))
        return []
    
    def has_more_pages(self, response: Dict[str, Any], items_count: int, page_size: int) -> bool:
        """Check if there are more pages for Polymarket."""
        # If we got fewer items than page size, we're done
        return items_count == page_size
    
    def _filter_binary_markets(self, markets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Filter for valid binary markets."""
        binary_markets = []
        
        for market in markets:
            try:
                # Check required fields
                if not market.get("id") or not market.get("question"):
                    continue
                
                # Check for valid outcomes
                if not self._has_valid_binary_outcomes(market):
                    continue
                
                # Check if market has pricing data
                if not self._has_pricing_data(market):
                    continue
                
                binary_markets.append(market)
                
            except Exception as e:
                self.logger.warning(f"Error filtering market: {e}", market_id=market.get("id"))
                continue
        
        return binary_markets
    
    def _has_valid_binary_outcomes(self, market: Dict[str, Any]) -> bool:
        """Check if market has valid binary outcomes."""
        outcomes = market.get("outcomes")
        
        if not outcomes:
            return False
        
        # Parse outcomes if they're a JSON string
        if isinstance(outcomes, str):
            try:
                outcomes = json.loads(outcomes)
            except (json.JSONDecodeError, TypeError):
                return False
        
        # Check if outcomes is a list with at least 2 items
        if not isinstance(outcomes, list) or len(outcomes) < 2:
            return False
        
        # Check for Yes/No pattern
        outcome_names = [str(o).lower() for o in outcomes if o]
        has_yes_no = any(name in ["yes", "true", "1"] for name in outcome_names)
        
        return has_yes_no or len(outcomes) == 2
    
    def _has_pricing_data(self, market: Dict[str, Any]) -> bool:
        """Check if market has pricing data available."""
        return (
            market.get("lastTradePrice") is not None or
            (market.get("bestBid") is not None and market.get("bestAsk") is not None)
        )
    
    def standardize_category(self, category: Optional[str]) -> str:
        """Standardize Polymarket category names."""
        if not category:
            return "Other"
        
        # Mapping of Polymarket categories to standardized names
        category_mapping = {
            "Politics": "Politics",
            "Crypto": "Cryptocurrency", 
            "Economics": "Economics",
            "Sports": "Sports",
            "Pop Culture": "Entertainment",
            "Business": "Business",
            "Science": "Science",
            "Technology": "Technology",
            "Gaming": "Entertainment",
            "Other": "Other",
        }
        
        # Clean and standardize
        clean_category = category.strip()
        return category_mapping.get(clean_category, "Other")
    
    def categorize_from_question(self, question: str) -> str:
        """Categorize market based on question keywords."""
        if not question:
            return "Other"
        
        question_lower = question.lower()
        
        # Keyword-based categorization
        if any(word in question_lower for word in ["election", "president", "congress", "trump", "biden", "vote"]):
            return "Politics"
        elif any(word in question_lower for word in ["bitcoin", "crypto", "ethereum", "btc", "eth", "coin"]):
            return "Cryptocurrency"
        elif any(word in question_lower for word in ["fed", "inflation", "gdp", "economy", "market", "stock"]):
            return "Economics"
        elif any(word in question_lower for word in ["nfl", "nba", "mlb", "super bowl", "championship", "game"]):
            return "Sports"
        elif any(word in question_lower for word in ["movie", "celebrity", "award", "music", "tv"]):
            return "Entertainment"
        elif any(word in question_lower for word in ["company", "ipo", "earnings", "revenue"]):
            return "Business"
        else:
            return "Other"
    
    def calculate_prices(self, market: Dict[str, Any]) -> tuple[Decimal, Decimal]:
        """Calculate Yes and No prices for the market."""
        try:
            # Try lastTradePrice first
            if market.get("lastTradePrice") is not None:
                yes_price = float(market["lastTradePrice"])
                no_price = 1.0 - yes_price
            
            # Fall back to bid/ask midpoint
            elif market.get("bestBid") is not None and market.get("bestAsk") is not None:
                bid = float(market["bestBid"])
                ask = float(market["bestAsk"])
                yes_price = (bid + ask) / 2.0
                no_price = 1.0 - yes_price
            
            else:
                # Default to 50/50 if no pricing data
                yes_price = 0.5
                no_price = 0.5
            
            # Ensure prices are valid
            yes_price = max(0.0, min(1.0, yes_price))
            no_price = max(0.0, min(1.0, no_price))
            
            return Decimal(str(yes_price)), Decimal(str(no_price))
            
        except (ValueError, TypeError):
            # Default to 50/50 if calculation fails
            return Decimal("0.5"), Decimal("0.5")
    
    def parse_outcomes(self, market: Dict[str, Any]) -> List[str]:
        """Parse and return outcome names."""
        outcomes = market.get("outcomes", [])
        
        if isinstance(outcomes, str):
            try:
                outcomes = json.loads(outcomes)
            except (json.JSONDecodeError, TypeError):
                return ["Yes", "No"]  # Default binary outcomes
        
        if isinstance(outcomes, list) and len(outcomes) >= 2:
            return [str(outcome) for outcome in outcomes[:2]]
        
        return ["Yes", "No"]  # Default binary outcomes
    
    async def extract_market_details(self, market_id: str) -> Optional[Dict[str, Any]]:
        """Extract detailed information for a specific market."""
        try:
            response = await self.make_request("GET", f"markets/{market_id}")
            return response
        except Exception as e:
            self.logger.error(f"Failed to extract details for market {market_id}: {e}")
            return None
    
    def transform_to_normalized_market(self, raw_market: RawMarketData) -> NormalizedMarket:
        """Transform raw Polymarket data to normalized format."""
        market_data = raw_market.raw_data
        
        # Extract basic information
        external_id = raw_market.external_id
        question = market_data.get("question", "Untitled Market")
        description = market_data.get("description") or question
        category = self.standardize_category(market_data.get("category")) or self.categorize_from_question(question)
        
        # Calculate prices
        yes_price, no_price = self.calculate_prices(market_data)
        
        # Parse outcomes or use defaults
        outcome_names = self.parse_outcomes(market_data)
        outcomes = [
            MarketOutcome(name=outcome_names[0], price=yes_price),
            MarketOutcome(name=outcome_names[1] if len(outcome_names) > 1 else "No", price=no_price)
        ]
        
        # Extract timing information
        end_date = None
        if market_data.get("endDate"):
            try:
                end_date = datetime.fromisoformat(market_data["endDate"].replace("Z", "+00:00"))
            except ValueError:
                # If date parsing fails, set a default end date
                end_date = datetime.utcnow().replace(year=datetime.utcnow().year + 1)
        else:
            # Default to 1 year from now if no end date
            end_date = datetime.utcnow().replace(year=datetime.utcnow().year + 1)
        
        created_date = None
        if market_data.get("startDate"):
            try:
                created_date = datetime.fromisoformat(market_data["startDate"].replace("Z", "+00:00"))
            except ValueError:
                pass
        
        # Extract volume and liquidity
        volume = Decimal(str(market_data.get("volume", 0)))
        liquidity = Decimal(str(market_data.get("liquidity", 0)))
        
        # Use tags from market data
        tags = market_data.get("tags", [category.lower()])
        if isinstance(tags, str):
            tags = [tags]
        
        return NormalizedMarket(
            platform=self.platform,
            external_id=external_id,
            title=question,
            description=description,
            category=category,
            tags=tags,
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