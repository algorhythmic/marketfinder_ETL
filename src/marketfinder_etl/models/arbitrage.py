"""Arbitrage detection and analysis models."""

from typing import Any, Dict, List, Optional, Union
from datetime import datetime
from enum import Enum
from decimal import Decimal

from pydantic import Field, validator

from marketfinder_etl.models.base import BaseModel, TimestampedModel, MetadataModel
from marketfinder_etl.models.market import MarketPlatform


class ConfidenceLevel(str, Enum):
    """Confidence levels for predictions and evaluations."""
    HIGH = "high"      # >= 0.8
    MEDIUM = "medium"  # 0.6-0.8  
    LOW = "low"        # < 0.6


class ArbitrageStatus(str, Enum):
    """Status of arbitrage opportunities."""
    ACTIVE = "active"
    EXPIRED = "expired"
    EXECUTED = "executed"
    INVALID = "invalid"


class ArbitrageStrategy(str, Enum):
    """Basic arbitrage execution strategies between Kalshi and Polymarket."""

    LONG_KALSHI_SHORT_POLY = "long_kalshi_short_polymarket"
    LONG_POLY_SHORT_KALSHI = "long_polymarket_short_kalshi"
    LONG_BOTH_MARKETS = "long_both_markets"
    SHORT_BOTH_MARKETS = "short_both_markets"


class MarketSimilarity(TimestampedModel):
    """Similarity assessment between two markets."""
    
    market1_id: str = Field(..., description="First market external ID")
    market2_id: str = Field(..., description="Second market external ID")
    platform1: MarketPlatform = Field(..., description="First market platform")
    platform2: MarketPlatform = Field(..., description="Second market platform")
    
    # Similarity metrics
    confidence: float = Field(..., description="Overall similarity confidence (0-1)")
    text_similarity: float = Field(..., description="Text similarity score (0-1)")
    category_match: bool = Field(..., description="Whether categories match")
    semantic_similarity: Optional[float] = Field(None, description="Semantic embedding similarity")
    
    # Analysis details
    reasoning: str = Field(..., description="Explanation of similarity assessment")
    keywords_overlap: List[str] = Field(default_factory=list, description="Overlapping keywords")
    analysis_method: str = Field("llm", description="Method used for analysis")
    
    # Metadata
    analyzed_at: datetime = Field(default_factory=datetime.utcnow, description="Analysis timestamp")
    analyzer_version: str = Field("1.0", description="Version of analysis engine")
    
    @validator("confidence", "text_similarity", "semantic_similarity")
    def validate_score(cls, v: Optional[float]) -> Optional[float]:
        """Validate scores are between 0 and 1."""
        if v is not None and not (0 <= v <= 1):
            raise ValueError("Score must be between 0 and 1")
        return v
    
    @property
    def confidence_level(self) -> ConfidenceLevel:
        """Get confidence level enum."""
        if self.confidence >= 0.8:
            return ConfidenceLevel.HIGH
        elif self.confidence >= 0.6:
            return ConfidenceLevel.MEDIUM
        else:
            return ConfidenceLevel.LOW


class MLFeatures(BaseModel):
    """Feature set for ML-based arbitrage scoring."""
    
    # Text similarity features
    jaccard_similarity: float = Field(..., description="Jaccard similarity of titles")
    cosine_similarity: float = Field(..., description="Cosine similarity of embeddings") 
    keyword_overlap_count: int = Field(..., description="Number of overlapping keywords")
    
    # Market features
    price_difference: Decimal = Field(..., description="Absolute price difference")
    volume_ratio: float = Field(..., description="Ratio of smaller to larger volume")
    category_match: bool = Field(..., description="Whether categories match exactly")
    
    # Temporal features
    close_time_difference_hours: float = Field(..., description="Hours between close times")
    both_closing_soon: bool = Field(..., description="Whether both close within 24h")
    
    # Platform features
    kalshi_liquidity_score: float = Field(..., description="Kalshi market liquidity score")
    polymarket_liquidity_score: float = Field(..., description="Polymarket market liquidity score")
    
    # Historical features  
    bucket_historical_success_rate: float = Field(..., description="Historical success rate for this bucket")
    similar_pair_confidence: float = Field(..., description="Confidence from similar pairs")


class MLPrediction(TimestampedModel):
    """ML model prediction for arbitrage worthiness."""
    
    # Market pair reference
    market1_id: str = Field(..., description="First market external ID")
    market2_id: str = Field(..., description="Second market external ID")
    pair_id: str = Field(..., description="Unique pair identifier")
    
    # Prediction results
    llm_worthiness_score: float = Field(..., description="Predicted LLM evaluation success (0-1)")
    confidence_prediction: float = Field(..., description="Predicted confidence if LLM evaluated")
    probability_threshold: float = Field(0.3, description="Threshold for LLM evaluation")
    
    # Model info
    model_version: str = Field(..., description="ML model version used")
    features: MLFeatures = Field(..., description="Feature values used")
    explanation: str = Field(..., description="Model prediction explanation")
    
    # Performance tracking
    actual_llm_score: Optional[float] = Field(None, description="Actual LLM score (for training)")
    prediction_accuracy: Optional[float] = Field(None, description="Prediction accuracy")
    
    @validator("llm_worthiness_score", "confidence_prediction")
    def validate_prediction_scores(cls, v: float) -> float:
        """Validate prediction scores are between 0 and 1."""
        if not (0 <= v <= 1):
            raise ValueError("Prediction score must be between 0 and 1")
        return v
    
    def should_evaluate_with_llm(self) -> bool:
        """Determine if this pair should be evaluated with LLM."""
        return self.llm_worthiness_score >= self.probability_threshold


class LLMEvaluation(TimestampedModel):
    """LLM evaluation of market similarity."""
    
    # Market pair reference
    market1_id: str = Field(..., description="First market external ID")
    market2_id: str = Field(..., description="Second market external ID")
    pair_id: str = Field(..., description="Unique pair identifier")
    
    # Market data used in evaluation
    market1_title: str = Field(..., description="First market title")
    market2_title: str = Field(..., description="Second market title")
    market1_description: Optional[str] = Field(None, description="First market description")
    market2_description: Optional[str] = Field(None, description="Second market description")
    
    # LLM results
    similarity_score: float = Field(..., description="LLM similarity assessment (0-1)")
    confidence: float = Field(..., description="LLM confidence in assessment (0-1)")
    reasoning: str = Field(..., description="LLM reasoning for the assessment")
    key_similarities: List[str] = Field(default_factory=list, description="Key similarity points")
    key_differences: List[str] = Field(default_factory=list, description="Key difference points")
    
    # LLM metadata
    llm_provider: str = Field(..., description="LLM provider used (openai, anthropic, etc.)")
    model_name: str = Field(..., description="Specific model used")
    prompt_version: str = Field("1.0", description="Prompt template version")
    tokens_used: Optional[int] = Field(None, description="Tokens consumed")
    cost_usd: Optional[Decimal] = Field(None, description="Cost in USD")
    
    # Processing metadata
    processed_at: datetime = Field(default_factory=datetime.utcnow, description="Processing timestamp")
    processing_time_ms: Optional[int] = Field(None, description="Processing time in milliseconds")
    
    @validator("similarity_score", "confidence")
    def validate_llm_scores(cls, v: float) -> float:
        """Validate LLM scores are between 0 and 1."""
        if not (0 <= v <= 1):
            raise ValueError("LLM score must be between 0 and 1")
        return v
    
    @property
    def confidence_level(self) -> ConfidenceLevel:
        """Get confidence level enum."""
        if self.confidence >= 0.8:
            return ConfidenceLevel.HIGH
        elif self.confidence >= 0.6:
            return ConfidenceLevel.MEDIUM
        else:
            return ConfidenceLevel.LOW


class ArbitrageOpportunity(TimestampedModel):
    """Detected arbitrage opportunity between markets."""
    
    # Market references
    buy_market_id: str = Field(..., description="Market to buy (external ID)")
    sell_market_id: str = Field(..., description="Market to sell (external ID)")
    buy_platform: MarketPlatform = Field(..., description="Platform to buy from")
    sell_platform: MarketPlatform = Field(..., description="Platform to sell on")
    
    # Market details
    buy_market_title: str = Field(..., description="Buy market title")
    sell_market_title: str = Field(..., description="Sell market title")
    buy_market_url: Optional[str] = Field(None, description="Buy market URL")
    sell_market_url: Optional[str] = Field(None, description="Sell market URL")
    
    # Arbitrage metrics
    buy_price: Decimal = Field(..., description="Price to buy at")
    sell_price: Decimal = Field(..., description="Price to sell at")
    profit_margin: Decimal = Field(..., description="Profit margin (sell - buy)")
    profit_percentage: Decimal = Field(..., description="Profit percentage")
    
    # Risk assessment
    confidence: float = Field(..., description="Confidence in opportunity (0-1)")
    risk_score: float = Field(..., description="Risk assessment score (0-1)")
    volume_score: float = Field(..., description="Volume/liquidity score (0-1)")
    
    # Timing
    detected_at: datetime = Field(default_factory=datetime.utcnow, description="Detection timestamp")
    expires_at: Optional[datetime] = Field(None, description="Opportunity expiration")
    status: ArbitrageStatus = Field(default=ArbitrageStatus.ACTIVE, description="Opportunity status")
    
    # Analysis metadata
    similarity_id: Optional[str] = Field(None, description="Reference to similarity analysis")
    llm_evaluation_id: Optional[str] = Field(None, description="Reference to LLM evaluation")
    reasoning: str = Field(..., description="Explanation of arbitrage opportunity")
    
    @validator("profit_margin")
    def validate_profit_margin(cls, v: Decimal) -> Decimal:
        """Validate profit margin is positive."""
        if v <= 0:
            raise ValueError("Profit margin must be positive")
        return v
    
    @validator("confidence", "risk_score", "volume_score")
    def validate_scores(cls, v: float) -> float:
        """Validate scores are between 0 and 1."""
        if not (0 <= v <= 1):
            raise ValueError("Score must be between 0 and 1")
        return v
    
    @property
    def confidence_level(self) -> ConfidenceLevel:
        """Get confidence level enum."""
        if self.confidence >= 0.8:
            return ConfidenceLevel.HIGH
        elif self.confidence >= 0.6:
            return ConfidenceLevel.MEDIUM
        else:
            return ConfidenceLevel.LOW
    
    @property
    def is_high_value(self) -> bool:
        """Check if this is a high-value opportunity."""
        return (
            self.profit_percentage >= Decimal("0.05") and  # >= 5% profit
            self.confidence >= 0.7 and
            self.volume_score >= 0.6
        )
    
    def calculate_potential_profit(self, investment_amount: Decimal) -> Decimal:
        """Calculate potential profit for a given investment amount."""
        return investment_amount * self.profit_percentage
    
    def is_still_valid(self) -> bool:
        """Check if opportunity is still valid based on timing."""
        if self.status != ArbitrageStatus.ACTIVE:
            return False
        
        if self.expires_at and datetime.utcnow() > self.expires_at:
            return False
        
        return True