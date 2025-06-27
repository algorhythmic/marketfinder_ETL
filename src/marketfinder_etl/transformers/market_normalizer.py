"""
Market Data Normalizer - Transforms raw market data into standardized format

This module handles the transformation of platform-specific market data
into a unified NormalizedMarket format for consistent processing.
"""

import re
import json
from typing import Any, Dict, List, Optional, Tuple, Union
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from dataclasses import dataclass
from enum import Enum

import polars as pl
from pydantic import BaseModel, validator

from marketfinder_etl.core.logging import LoggerMixin
from marketfinder_etl.models.market import (
    NormalizedMarket, MarketPlatform, MarketEventType, MarketOutcome, MarketStatus
)
from marketfinder_etl.models.raw_data import RawMarketData


class NormalizationRule(str, Enum):
    """Types of normalization rules."""
    TITLE_CLEANUP = "title_cleanup"
    CATEGORY_MAPPING = "category_mapping"
    PRICE_CONVERSION = "price_conversion"
    DATE_STANDARDIZATION = "date_standardization"
    OUTCOME_MAPPING = "outcome_mapping"


@dataclass
class CategoryMapping:
    """Mapping configuration for market categories."""
    platform_category: str
    normalized_category: str
    confidence: float
    keywords: List[str] = None
    
    def __post_init__(self):
        if self.keywords is None:
            self.keywords = []


@dataclass
class NormalizationConfig:
    """Configuration for market data normalization."""
    # Text cleaning
    remove_unicode: bool = True
    normalize_whitespace: bool = True
    max_title_length: int = 200
    max_description_length: int = 1000
    
    # Price normalization
    default_currency: str = "USD"
    price_decimal_places: int = 4
    min_valid_price: float = 0.0001
    max_valid_price: float = 0.9999
    
    # Date handling
    default_timezone: str = "UTC"
    min_future_date_days: int = 1
    max_future_date_days: int = 1095  # ~3 years
    
    # Category mapping
    enable_category_inference: bool = True
    category_confidence_threshold: float = 0.7
    
    # Volume normalization
    min_volume_threshold: float = 0.0
    volume_decimal_places: int = 2


class MarketNormalizer(LoggerMixin):
    """
    Market Data Normalizer for converting platform-specific data to standard format.
    
    Handles normalization of market data from Kalshi, Polymarket, and other platforms
    into a unified NormalizedMarket format with consistent schemas and validation.
    """
    
    def __init__(self, config: Optional[NormalizationConfig] = None):
        self.config = config or NormalizationConfig()
        self.category_mappings = self._load_category_mappings()
        self.normalization_stats = {
            "total_processed": 0,
            "successful_normalizations": 0,
            "failed_normalizations": 0,
            "category_mappings_applied": 0,
            "price_corrections": 0,
            "date_corrections": 0
        }
    
    def _load_category_mappings(self) -> Dict[str, List[CategoryMapping]]:
        """Load category mapping configurations."""
        
        # Kalshi category mappings
        kalshi_mappings = [
            CategoryMapping("Politics", "Politics", 1.0, ["election", "vote", "politician"]),
            CategoryMapping("Economics", "Economics", 1.0, ["fed", "inflation", "gdp", "unemployment"]),
            CategoryMapping("Sports", "Sports", 1.0, ["nfl", "nba", "mlb", "nhl", "soccer"]),
            CategoryMapping("Finance", "Economics", 0.9, ["stock", "market", "trading"]),
            CategoryMapping("Technology", "Technology", 1.0, ["tech", "ai", "crypto", "bitcoin"]),
            CategoryMapping("Weather", "Weather", 1.0, ["hurricane", "temperature", "storm"]),
            CategoryMapping("Entertainment", "Entertainment", 1.0, ["movie", "oscar", "celebrity"]),
            CategoryMapping("Science", "Science", 1.0, ["space", "nasa", "research"]),
        ]
        
        # Polymarket category mappings
        polymarket_mappings = [
            CategoryMapping("Politics", "Politics", 1.0, ["election", "trump", "biden"]),
            CategoryMapping("Crypto", "Technology", 0.9, ["bitcoin", "ethereum", "crypto"]),
            CategoryMapping("Sports", "Sports", 1.0, ["super bowl", "world cup", "olympics"]),
            CategoryMapping("Business", "Economics", 0.8, ["earnings", "ipo", "stock"]),
            CategoryMapping("Pop Culture", "Entertainment", 0.9, ["celebrity", "awards", "music"]),
            CategoryMapping("Science & Tech", "Technology", 1.0, ["ai", "space", "innovation"]),
            CategoryMapping("Miscellaneous", "Other", 0.5, []),
        ]
        
        return {
            MarketPlatform.KALSHI.value: kalshi_mappings,
            MarketPlatform.POLYMARKET.value: polymarket_mappings
        }
    
    async def normalize_market_data(self, raw_data: RawMarketData) -> Optional[NormalizedMarket]:
        """Normalize raw market data into standardized format."""
        
        self.normalization_stats["total_processed"] += 1
        
        try:
            # Determine platform-specific normalization
            if raw_data.platform == MarketPlatform.KALSHI:
                normalized = await self._normalize_kalshi_market(raw_data)
            elif raw_data.platform == MarketPlatform.POLYMARKET:
                normalized = await self._normalize_polymarket_market(raw_data)
            else:
                self.logger.warning(f"Unsupported platform: {raw_data.platform}")
                return None
            
            if normalized:
                self.normalization_stats["successful_normalizations"] += 1
                self.logger.debug(f"Successfully normalized market {normalized.external_id}")
                return normalized
            else:
                self.normalization_stats["failed_normalizations"] += 1
                return None
                
        except Exception as e:
            self.normalization_stats["failed_normalizations"] += 1
            self.logger.error(f"Failed to normalize market data: {e}")
            return None
    
    async def _normalize_kalshi_market(self, raw_data: RawMarketData) -> Optional[NormalizedMarket]:
        """Normalize Kalshi market data."""
        
        data = raw_data.raw_data
        
        # Extract basic fields
        external_id = data.get("id", data.get("ticker", ""))
        title = self._normalize_title(data.get("title", ""))
        description = self._normalize_description(data.get("subtitle", ""))
        
        # Extract category
        category = self._normalize_category(
            data.get("category", ""), 
            MarketPlatform.KALSHI,
            title
        )
        
        # Extract dates
        created_date = self._parse_date(data.get("open_time"))
        end_date = self._parse_date(data.get("close_time"))
        
        # Extract outcomes
        outcomes = self._extract_kalshi_outcomes(data)
        
        # Extract volume and liquidity
        volume = self._normalize_volume(data.get("volume", 0))
        liquidity = self._calculate_liquidity(outcomes, volume)
        
        # Determine event type
        event_type = self._infer_event_type(title, category)
        
        # Determine status
        status = self._determine_kalshi_status(data)
        
        return NormalizedMarket(
            external_id=external_id,
            platform=MarketPlatform.KALSHI,
            title=title,
            description=description,
            category=category,
            outcomes=outcomes,
            event_type=event_type,
            status=status,
            volume=volume,
            liquidity=liquidity,
            created_date=created_date,
            end_date=end_date,
            normalized_at=datetime.utcnow()
        )
    
    async def _normalize_polymarket_market(self, raw_data: RawMarketData) -> Optional[NormalizedMarket]:
        """Normalize Polymarket market data."""
        
        data = raw_data.raw_data
        
        # Extract basic fields
        external_id = data.get("id", data.get("conditionId", ""))
        title = self._normalize_title(data.get("question", data.get("title", "")))
        description = self._normalize_description(data.get("description", ""))
        
        # Extract category
        category = self._normalize_category(
            data.get("category", ""), 
            MarketPlatform.POLYMARKET,
            title
        )
        
        # Extract dates
        created_date = self._parse_date(data.get("createdAt"))
        end_date = self._parse_date(data.get("endDate", data.get("resolutionDate")))
        
        # Extract outcomes
        outcomes = self._extract_polymarket_outcomes(data)
        
        # Extract volume and liquidity
        volume = self._normalize_volume(data.get("volume", data.get("volumeUSD", 0)))
        liquidity = self._calculate_liquidity(outcomes, volume)
        
        # Determine event type
        event_type = self._infer_event_type(title, category)
        
        # Determine status
        status = self._determine_polymarket_status(data)
        
        return NormalizedMarket(
            external_id=external_id,
            platform=MarketPlatform.POLYMARKET,
            title=title,
            description=description,
            category=category,
            outcomes=outcomes,
            event_type=event_type,
            status=status,
            volume=volume,
            liquidity=liquidity,
            created_date=created_date,
            end_date=end_date,
            normalized_at=datetime.utcnow()
        )
    
    def _normalize_title(self, title: str) -> str:
        """Normalize market title."""
        if not title:
            return ""
        
        # Remove extra whitespace
        if self.config.normalize_whitespace:
            title = re.sub(r'\s+', ' ', title.strip())
        
        # Remove unicode characters if configured
        if self.config.remove_unicode:
            title = title.encode('ascii', 'ignore').decode('ascii')
        
        # Truncate if too long
        if len(title) > self.config.max_title_length:
            title = title[:self.config.max_title_length].rsplit(' ', 1)[0] + "..."
        
        return title
    
    def _normalize_description(self, description: str) -> str:
        """Normalize market description."""
        if not description:
            return ""
        
        # Remove extra whitespace
        if self.config.normalize_whitespace:
            description = re.sub(r'\s+', ' ', description.strip())
        
        # Remove unicode characters if configured
        if self.config.remove_unicode:
            description = description.encode('ascii', 'ignore').decode('ascii')
        
        # Truncate if too long
        if len(description) > self.config.max_description_length:
            description = description[:self.config.max_description_length].rsplit(' ', 1)[0] + "..."
        
        return description
    
    def _normalize_category(self, platform_category: str, platform: MarketPlatform, title: str) -> str:
        """Normalize market category using mapping rules."""
        
        if not platform_category:
            platform_category = "Other"
        
        # Get platform-specific mappings
        mappings = self.category_mappings.get(platform.value, [])
        
        # Direct category mapping
        for mapping in mappings:
            if mapping.platform_category.lower() == platform_category.lower():
                if mapping.confidence >= self.config.category_confidence_threshold:
                    self.normalization_stats["category_mappings_applied"] += 1
                    return mapping.normalized_category
        
        # Keyword-based inference if enabled
        if self.config.enable_category_inference:
            title_lower = title.lower()
            
            for mapping in mappings:
                if mapping.keywords:
                    keyword_matches = sum(1 for kw in mapping.keywords if kw.lower() in title_lower)
                    keyword_confidence = keyword_matches / len(mapping.keywords)
                    
                    if keyword_confidence >= self.config.category_confidence_threshold:
                        self.normalization_stats["category_mappings_applied"] += 1
                        return mapping.normalized_category
        
        # Return original category if no mapping found
        return platform_category
    
    def _parse_date(self, date_input: Union[str, int, datetime, None]) -> Optional[datetime]:
        """Parse and normalize date input."""
        
        if not date_input:
            return None
        
        try:
            # Handle different input types
            if isinstance(date_input, datetime):
                parsed_date = date_input
            elif isinstance(date_input, int):
                # Assume Unix timestamp
                parsed_date = datetime.fromtimestamp(date_input, tz=timezone.utc)
            elif isinstance(date_input, str):
                # Try common date formats
                for fmt in [
                    "%Y-%m-%dT%H:%M:%S.%fZ",
                    "%Y-%m-%dT%H:%M:%SZ", 
                    "%Y-%m-%d %H:%M:%S",
                    "%Y-%m-%d",
                    "%m/%d/%Y",
                    "%d/%m/%Y"
                ]:
                    try:
                        parsed_date = datetime.strptime(date_input, fmt)
                        if parsed_date.tzinfo is None:
                            parsed_date = parsed_date.replace(tzinfo=timezone.utc)
                        break
                    except ValueError:
                        continue
                else:
                    self.logger.warning(f"Could not parse date: {date_input}")
                    return None
            else:
                return None
            
            # Convert to UTC
            if parsed_date.tzinfo != timezone.utc:
                parsed_date = parsed_date.astimezone(timezone.utc)
            
            # Validate date range
            now = datetime.now(timezone.utc)
            min_date = now - timedelta(days=365)  # 1 year ago
            max_date = now + timedelta(days=self.config.max_future_date_days)
            
            if parsed_date < min_date or parsed_date > max_date:
                self.logger.warning(f"Date outside valid range: {parsed_date}")
                self.normalization_stats["date_corrections"] += 1
                return None
            
            return parsed_date.replace(tzinfo=None)  # Store as naive UTC
            
        except Exception as e:
            self.logger.warning(f"Date parsing error: {e}")
            return None
    
    def _extract_kalshi_outcomes(self, data: Dict[str, Any]) -> List[MarketOutcome]:
        """Extract outcomes from Kalshi market data."""
        outcomes = []
        
        # Kalshi typically has Yes/No outcomes
        yes_price = self._normalize_price(data.get("yes_bid", data.get("yes_ask", 0.5)))
        no_price = Decimal('1.0') - yes_price
        
        outcomes.append(MarketOutcome(
            name="Yes",
            price=yes_price,
            volume=self._normalize_volume(data.get("yes_volume", 0)),
            probability=float(yes_price)
        ))
        
        outcomes.append(MarketOutcome(
            name="No", 
            price=no_price,
            volume=self._normalize_volume(data.get("no_volume", 0)),
            probability=float(no_price)
        ))
        
        return outcomes
    
    def _extract_polymarket_outcomes(self, data: Dict[str, Any]) -> List[MarketOutcome]:
        """Extract outcomes from Polymarket market data."""
        outcomes = []
        
        # Handle different Polymarket data structures
        if "outcomes" in data:
            # New format with explicit outcomes
            for outcome_data in data["outcomes"]:
                price = self._normalize_price(outcome_data.get("price", 0.5))
                outcomes.append(MarketOutcome(
                    name=outcome_data.get("name", "Unknown"),
                    price=price,
                    volume=self._normalize_volume(outcome_data.get("volume", 0)),
                    probability=float(price)
                ))
        else:
            # Legacy format - assume binary
            yes_price = self._normalize_price(data.get("price", 0.5))
            no_price = Decimal('1.0') - yes_price
            
            outcomes.append(MarketOutcome(
                name="Yes",
                price=yes_price,
                volume=self._normalize_volume(data.get("volume", 0)),
                probability=float(yes_price)
            ))
            
            outcomes.append(MarketOutcome(
                name="No",
                price=no_price,
                volume=self._normalize_volume(0),  # No volume data for No outcome
                probability=float(no_price)
            ))
        
        return outcomes
    
    def _normalize_price(self, price_input: Union[str, int, float, Decimal]) -> Decimal:
        """Normalize price to Decimal format."""
        
        try:
            if isinstance(price_input, str):
                # Remove currency symbols and whitespace
                price_str = re.sub(r'[^\d\.]', '', price_input)
                price = Decimal(price_str)
            else:
                price = Decimal(str(price_input))
            
            # Validate price range
            if price < Decimal(str(self.config.min_valid_price)):
                self.normalization_stats["price_corrections"] += 1
                return Decimal(str(self.config.min_valid_price))
            elif price > Decimal(str(self.config.max_valid_price)):
                self.normalization_stats["price_corrections"] += 1
                return Decimal(str(self.config.max_valid_price))
            
            # Round to specified decimal places
            return price.quantize(Decimal('0.' + '0' * self.config.price_decimal_places))
            
        except (InvalidOperation, ValueError) as e:
            self.logger.warning(f"Price normalization error: {e}")
            self.normalization_stats["price_corrections"] += 1
            return Decimal('0.5')  # Default to 50%
    
    def _normalize_volume(self, volume_input: Union[str, int, float, Decimal]) -> Decimal:
        """Normalize volume to Decimal format."""
        
        try:
            if isinstance(volume_input, str):
                # Remove currency symbols and whitespace
                volume_str = re.sub(r'[^\d\.]', '', volume_input)
                volume = Decimal(volume_str)
            else:
                volume = Decimal(str(volume_input))
            
            # Ensure non-negative
            if volume < Decimal(str(self.config.min_volume_threshold)):
                return Decimal('0')
            
            # Round to specified decimal places
            return volume.quantize(Decimal('0.' + '0' * self.config.volume_decimal_places))
            
        except (InvalidOperation, ValueError) as e:
            self.logger.warning(f"Volume normalization error: {e}")
            return Decimal('0')
    
    def _calculate_liquidity(self, outcomes: List[MarketOutcome], volume: Decimal) -> Decimal:
        """Calculate market liquidity score."""
        
        if not outcomes:
            return Decimal('0')
        
        # Simple liquidity calculation based on volume and price spread
        total_volume = sum(outcome.volume for outcome in outcomes)
        avg_volume = total_volume / len(outcomes) if outcomes else Decimal('0')
        
        # Price spread (lower spread = higher liquidity)
        if len(outcomes) >= 2:
            prices = [outcome.price for outcome in outcomes]
            price_spread = max(prices) - min(prices)
            spread_factor = max(Decimal('0.1'), Decimal('1.0') - price_spread)
        else:
            spread_factor = Decimal('0.5')
        
        # Combine volume and spread factors
        liquidity = (avg_volume * spread_factor).quantize(Decimal('0.01'))
        return min(liquidity, volume)  # Liquidity cannot exceed total volume
    
    def _infer_event_type(self, title: str, category: str) -> MarketEventType:
        """Infer event type from title and category."""
        
        title_lower = title.lower()
        category_lower = category.lower()
        
        # Political events
        if any(word in title_lower for word in ["election", "vote", "president", "senate", "congress"]):
            return MarketEventType.POLITICAL
        
        # Economic events
        if any(word in title_lower for word in ["fed", "rate", "inflation", "gdp", "unemployment"]):
            return MarketEventType.ECONOMIC
        
        # Sports events
        if any(word in title_lower for word in ["super bowl", "championship", "playoffs", "world cup"]):
            return MarketEventType.SPORTS
        
        # Technology events
        if any(word in title_lower for word in ["bitcoin", "crypto", "ai", "tech", "ipo"]):
            return MarketEventType.TECHNOLOGY
        
        # Weather events
        if any(word in title_lower for word in ["hurricane", "storm", "temperature", "weather"]):
            return MarketEventType.WEATHER
        
        # Category-based inference
        if "politics" in category_lower:
            return MarketEventType.POLITICAL
        elif "economics" in category_lower:
            return MarketEventType.ECONOMIC
        elif "sports" in category_lower:
            return MarketEventType.SPORTS
        elif "technology" in category_lower:
            return MarketEventType.TECHNOLOGY
        elif "weather" in category_lower:
            return MarketEventType.WEATHER
        
        return MarketEventType.OTHER
    
    def _determine_kalshi_status(self, data: Dict[str, Any]) -> MarketStatus:
        """Determine market status from Kalshi data."""
        
        status = data.get("status", "").lower()
        
        if status in ["open", "active"]:
            return MarketStatus.ACTIVE
        elif status in ["closed", "settled"]:
            return MarketStatus.CLOSED
        elif status in ["suspended", "halted"]:
            return MarketStatus.SUSPENDED
        else:
            # Infer from dates
            close_time = self._parse_date(data.get("close_time"))
            if close_time and close_time < datetime.utcnow():
                return MarketStatus.CLOSED
            else:
                return MarketStatus.ACTIVE
    
    def _determine_polymarket_status(self, data: Dict[str, Any]) -> MarketStatus:
        """Determine market status from Polymarket data."""
        
        # Check explicit status fields
        if data.get("closed", False):
            return MarketStatus.CLOSED
        elif data.get("active", True):
            return MarketStatus.ACTIVE
        
        # Infer from end date
        end_date = self._parse_date(data.get("endDate"))
        if end_date and end_date < datetime.utcnow():
            return MarketStatus.CLOSED
        
        return MarketStatus.ACTIVE
    
    def get_normalization_statistics(self) -> Dict[str, Any]:
        """Get normalization statistics."""
        total = self.normalization_stats["total_processed"]
        success_rate = (
            self.normalization_stats["successful_normalizations"] / total 
            if total > 0 else 0
        )
        
        return {
            **self.normalization_stats,
            "success_rate": success_rate,
            "failure_rate": 1 - success_rate
        }
    
    def reset_statistics(self) -> None:
        """Reset normalization statistics."""
        self.normalization_stats = {
            "total_processed": 0,
            "successful_normalizations": 0,
            "failed_normalizations": 0,
            "category_mappings_applied": 0,
            "price_corrections": 0,
            "date_corrections": 0
        }