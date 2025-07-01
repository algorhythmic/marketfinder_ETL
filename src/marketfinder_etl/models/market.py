"""Market data models for prediction markets."""

from typing import Any, Dict, List, Optional, Union
from datetime import datetime
from enum import Enum
from decimal import Decimal

from pydantic import Field, validator, root_validator

from marketfinder_etl.models.base import BaseModel, TimestampedModel, MetadataModel


class MarketPlatform(str, Enum):
    """Supported prediction market platforms."""
    KALSHI = "kalshi"
    POLYMARKET = "polymarket"


class MarketStatus(str, Enum):
    """Market status values."""
    ACTIVE = "active"
    CLOSED = "closed"
    SETTLED = "settled"
    SUSPENDED = "suspended"


class MarketEventType(str, Enum):
    """Types of market events."""
    BINARY = "binary"
    CATEGORICAL = "categorical" 
    SCALAR = "scalar"


class MarketOutcome(BaseModel):
    """Individual market outcome/option."""
    
    name: str = Field(..., description="Outcome name (e.g., 'Yes', 'No')")
    price: Decimal = Field(..., description="Current price (0.0-1.0)")
    volume: Optional[Decimal] = Field(None, description="Volume traded on this outcome")
    shares_outstanding: Optional[int] = Field(None, description="Number of shares outstanding")
    
    @validator("price")
    def validate_price(cls, v: Decimal) -> Decimal:
        """Validate price is between 0 and 1."""
        if not (0 <= v <= 1):
            raise ValueError("Price must be between 0 and 1")
        return v


class RawMarketData(BaseModel):
    """Raw market data from external APIs."""
    
    platform: MarketPlatform = Field(..., description="Source platform")
    external_id: str = Field(..., description="External market ID")
    raw_data: Dict[str, Any] = Field(..., description="Raw API response data")
    extracted_at: datetime = Field(default_factory=datetime.utcnow, description="Extraction timestamp")
    api_endpoint: Optional[str] = Field(None, description="API endpoint used")


class NormalizedMarket(MetadataModel):
    """Normalized market data across platforms."""
    
    # Platform info
    platform: MarketPlatform = Field(..., description="Source platform")
    external_id: str = Field(..., description="External platform market ID")
    
    # Market content
    title: str = Field(..., description="Market title/question")
    description: Optional[str] = Field(None, description="Detailed market description")
    category: str = Field(..., description="Market category")
    tags: List[str] = Field(default_factory=list, description="Market tags")
    
    # Market structure
    event_type: MarketEventType = Field(..., description="Type of market event")
    outcomes: List[MarketOutcome] = Field(..., description="Available outcomes")
    
    # Timing
    created_date: Optional[datetime] = Field(None, description="Market creation date")
    end_date: datetime = Field(..., description="Market end/close date")
    resolution_date: Optional[datetime] = Field(None, description="Resolution date")
    
    # Market metrics
    volume: Decimal = Field(default=Decimal("0"), description="Total volume traded")
    liquidity: Decimal = Field(default=Decimal("0"), description="Available liquidity")
    open_interest: Optional[Decimal] = Field(None, description="Open interest")
    
    # Status
    status: MarketStatus = Field(default=MarketStatus.ACTIVE, description="Market status")
    is_active: bool = Field(True, description="Whether market is actively trading")
    
    # Processing info
    processed_at: datetime = Field(default_factory=datetime.utcnow, description="Processing timestamp")
    semantic_bucket: Optional[str] = Field(None, description="Semantic bucket assignment")
    bucket_confidence: Optional[float] = Field(None, description="Bucket assignment confidence")
    
    @validator("outcomes")
    def validate_outcomes(cls, v: List[MarketOutcome]) -> List[MarketOutcome]:
        """Validate outcomes list."""
        if not v:
            raise ValueError("Market must have at least one outcome")
        return v
    
    @validator("end_date")
    def validate_end_date(cls, v: datetime) -> datetime:
        """Validate end date is in the future for active markets."""
        # Note: This validation might be too strict for historical data
        return v
    
    @root_validator(skip_on_failure=True)
    def validate_binary_market(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        """Validate binary market structure."""
        event_type = values.get("event_type")
        outcomes = values.get("outcomes", [])
        
        if event_type == MarketEventType.BINARY and len(outcomes) != 2:
            raise ValueError("Binary markets must have exactly 2 outcomes")
        
        return values
    
    @property
    def yes_price(self) -> Optional[Decimal]:
        """Get 'Yes' price for binary markets."""
        if self.event_type == MarketEventType.BINARY:
            for outcome in self.outcomes:
                if outcome.name.lower() in ["yes", "true", "1"]:
                    return outcome.price
        return None
    
    @property
    def no_price(self) -> Optional[Decimal]:
        """Get 'No' price for binary markets."""
        if self.event_type == MarketEventType.BINARY:
            for outcome in self.outcomes:
                if outcome.name.lower() in ["no", "false", "0"]:
                    return outcome.price
        return None
    
    @property
    def implied_probability(self) -> Optional[Decimal]:
        """Get implied probability for binary markets."""
        yes_price = self.yes_price
        return yes_price if yes_price is not None else None
    
    def is_similar_to(self, other: "NormalizedMarket", threshold: float = 0.7) -> bool:
        """Check if this market is similar to another market."""
        # Basic similarity check - can be enhanced with ML
        if self.platform == other.platform:
            return False
        
        if self.category != other.category:
            return False
        
        # Simple text similarity (can be improved)
        title_words_self = set(self.title.lower().split())
        title_words_other = set(other.title.lower().split())
        
        if not title_words_self or not title_words_other:
            return False
        
        jaccard_similarity = len(title_words_self & title_words_other) / len(title_words_self | title_words_other)
        return jaccard_similarity >= threshold


class Market(NormalizedMarket):
    """Complete market model with additional computed fields."""
    
    # Computed fields
    arbitrage_potential: Optional[Decimal] = Field(None, description="Potential arbitrage opportunity")
    risk_score: Optional[float] = Field(None, description="Risk assessment score")
    quality_score: Optional[float] = Field(None, description="Data quality score")
    
    # Related markets
    similar_markets: List[str] = Field(default_factory=list, description="IDs of similar markets")
    competitor_markets: List[str] = Field(default_factory=list, description="Cross-platform competitors")
    
    def calculate_quality_score(self) -> float:
        """Calculate data quality score based on available information."""
        score = 0.0
        max_score = 100.0
        
        # Title quality (0-20 points)
        if self.title and len(self.title) > 10:
            score += 20
        elif self.title:
            score += 10
        
        # Description quality (0-15 points)
        if self.description and len(self.description) > 50:
            score += 15
        elif self.description:
            score += 8
        
        # Volume data (0-20 points)
        if self.volume > 1000:
            score += 20
        elif self.volume > 100:
            score += 15
        elif self.volume > 0:
            score += 10
        
        # Timing data (0-15 points)
        if self.created_date and self.end_date:
            score += 15
        elif self.end_date:
            score += 10
        
        # Market structure (0-20 points)
        if self.outcomes and len(self.outcomes) >= 2:
            score += 15
            # Valid prices
            valid_prices = all(0 <= outcome.price <= 1 for outcome in self.outcomes)
            if valid_prices:
                score += 5
        
        # Category and tags (0-10 points)
        if self.category:
            score += 5
        if self.tags:
            score += 5
        
        self.quality_score = score / max_score
        return self.quality_score