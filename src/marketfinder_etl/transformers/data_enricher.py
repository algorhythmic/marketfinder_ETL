"""
Data Enricher - Enhances normalized market data with additional context

This module adds contextual information, historical data, and derived metrics
to normalized market data for improved analysis and processing.
"""

import asyncio
import hashlib
from typing import Any, Dict, List, Optional, Tuple, Union
from datetime import datetime, timedelta
from decimal import Decimal
from dataclasses import dataclass
from enum import Enum

import polars as pl
import numpy as np
from pydantic import BaseModel

from marketfinder_etl.core.logging import LoggerMixin
from marketfinder_etl.models.market import NormalizedMarket, MarketPlatform


class EnrichmentType(str, Enum):
    """Types of data enrichment."""
    HISTORICAL_CONTEXT = "historical_context"
    MARKET_SENTIMENT = "market_sentiment"
    VOLATILITY_METRICS = "volatility_metrics"
    CORRELATION_ANALYSIS = "correlation_analysis"
    TREND_ANALYSIS = "trend_analysis"
    EXTERNAL_SIGNALS = "external_signals"


@dataclass
class EnrichmentConfig:
    """Configuration for data enrichment."""
    # Historical data
    historical_lookback_days: int = 30
    min_historical_points: int = 5
    
    # Volatility calculation
    volatility_window_hours: int = 24
    volatility_calculation_method: str = "standard_deviation"
    
    # Sentiment analysis
    enable_sentiment_analysis: bool = True
    sentiment_sources: List[str] = None
    
    # Correlation analysis
    correlation_threshold: float = 0.7
    correlation_window_days: int = 7
    
    # Performance settings
    enable_caching: bool = True
    cache_duration_hours: int = 6
    parallel_processing: bool = True
    
    def __post_init__(self):
        if self.sentiment_sources is None:
            self.sentiment_sources = ["title", "description"]


class HistoricalContext(BaseModel):
    """Historical context for a market."""
    avg_price_last_week: Optional[Decimal] = None
    price_change_percentage: Optional[float] = None
    volume_trend: Optional[str] = None  # "increasing", "decreasing", "stable"
    similar_market_outcomes: List[str] = []
    historical_accuracy: Optional[float] = None


class VolatilityMetrics(BaseModel):
    """Volatility metrics for a market."""
    price_volatility: float
    volume_volatility: float
    volatility_percentile: float  # Percentile vs historical volatility
    volatility_trend: str  # "increasing", "decreasing", "stable"
    risk_score: float  # 0-1 scale


class MarketSentiment(BaseModel):
    """Market sentiment analysis."""
    sentiment_score: float  # -1 to 1 scale
    sentiment_label: str  # "positive", "negative", "neutral"
    confidence: float  # 0-1 scale
    key_phrases: List[str] = []
    sentiment_sources: List[str] = []


class TrendAnalysis(BaseModel):
    """Trend analysis for market data."""
    price_trend: str  # "bullish", "bearish", "sideways"
    trend_strength: float  # 0-1 scale
    trend_duration_hours: int
    support_level: Optional[Decimal] = None
    resistance_level: Optional[Decimal] = None
    momentum_score: float  # -1 to 1 scale


class EnrichedMarket(BaseModel):
    """Market with enrichment data."""
    market: NormalizedMarket
    historical_context: Optional[HistoricalContext] = None
    volatility_metrics: Optional[VolatilityMetrics] = None
    sentiment: Optional[MarketSentiment] = None
    trend_analysis: Optional[TrendAnalysis] = None
    correlation_score: Optional[float] = None
    enrichment_timestamp: datetime
    enrichment_version: str = "1.0"


class DataEnricher(LoggerMixin):
    """
    Data Enricher for adding contextual information to normalized markets.
    
    Enhances market data with historical context, sentiment analysis,
    volatility metrics, and trend analysis for improved decision making.
    """
    
    def __init__(self, config: Optional[EnrichmentConfig] = None):
        self.config = config or EnrichmentConfig()
        self.enrichment_cache: Dict[str, EnrichedMarket] = {}
        self.historical_data: Dict[str, List[Dict]] = {}  # Mock historical data storage
        self.enrichment_stats = {
            "total_enriched": 0,
            "cache_hits": 0,
            "enrichment_failures": 0,
            "avg_enrichment_time_ms": 0
        }
    
    async def enrich_market(self, market: NormalizedMarket) -> EnrichedMarket:
        """Enrich a single market with additional context."""
        
        start_time = datetime.utcnow()
        
        # Check cache first
        cache_key = self._generate_cache_key(market)
        if self.config.enable_caching and cache_key in self.enrichment_cache:
            cached = self.enrichment_cache[cache_key]
            cache_age = (datetime.utcnow() - cached.enrichment_timestamp).total_seconds() / 3600
            
            if cache_age < self.config.cache_duration_hours:
                self.enrichment_stats["cache_hits"] += 1
                return cached
        
        try:
            # Perform enrichment
            enriched = await self._perform_enrichment(market)
            
            # Cache result
            if self.config.enable_caching:
                self.enrichment_cache[cache_key] = enriched
            
            # Update stats
            self.enrichment_stats["total_enriched"] += 1
            processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            # Update average processing time
            current_avg = self.enrichment_stats["avg_enrichment_time_ms"]
            total_enriched = self.enrichment_stats["total_enriched"]
            self.enrichment_stats["avg_enrichment_time_ms"] = (
                (current_avg * (total_enriched - 1) + processing_time) / total_enriched
            )
            
            self.logger.debug(
                f"Market enrichment complete",
                market_id=market.external_id,
                processing_time_ms=int(processing_time)
            )
            
            return enriched
            
        except Exception as e:
            self.enrichment_stats["enrichment_failures"] += 1
            self.logger.error(f"Failed to enrich market {market.external_id}: {e}")
            
            # Return basic enriched market without additional data
            return EnrichedMarket(
                market=market,
                enrichment_timestamp=datetime.utcnow()
            )
    
    async def enrich_markets_batch(self, markets: List[NormalizedMarket]) -> List[EnrichedMarket]:
        """Enrich multiple markets in batch with optional parallel processing."""
        
        self.logger.info(f"Starting batch enrichment of {len(markets)} markets")
        
        if self.config.parallel_processing:
            # Process in parallel with semaphore for rate limiting
            semaphore = asyncio.Semaphore(10)  # Limit concurrent enrichments
            
            async def limited_enrichment(market):
                async with semaphore:
                    return await self.enrich_market(market)
            
            enriched_markets = await asyncio.gather(
                *[limited_enrichment(market) for market in markets],
                return_exceptions=True
            )
            
            # Filter out exceptions
            valid_enriched = [
                market for market in enriched_markets 
                if isinstance(market, EnrichedMarket)
            ]
        else:
            # Process sequentially
            valid_enriched = []
            for market in markets:
                enriched = await self.enrich_market(market)
                valid_enriched.append(enriched)
        
        self.logger.info(
            f"Batch enrichment complete",
            total_markets=len(markets),
            successfully_enriched=len(valid_enriched)
        )
        
        return valid_enriched
    
    async def _perform_enrichment(self, market: NormalizedMarket) -> EnrichedMarket:
        """Perform comprehensive enrichment on a market."""
        
        # Gather enrichment data in parallel
        enrichment_tasks = []
        
        # Historical context
        enrichment_tasks.append(self._get_historical_context(market))
        
        # Volatility metrics
        enrichment_tasks.append(self._calculate_volatility_metrics(market))
        
        # Sentiment analysis
        if self.config.enable_sentiment_analysis:
            enrichment_tasks.append(self._analyze_sentiment(market))
        else:
            enrichment_tasks.append(asyncio.coroutine(lambda: None)())
        
        # Trend analysis
        enrichment_tasks.append(self._analyze_trends(market))
        
        # Execute all enrichment tasks
        results = await asyncio.gather(*enrichment_tasks, return_exceptions=True)
        
        # Extract results (handle exceptions gracefully)
        historical_context = results[0] if not isinstance(results[0], Exception) else None
        volatility_metrics = results[1] if not isinstance(results[1], Exception) else None
        sentiment = results[2] if not isinstance(results[2], Exception) else None
        trend_analysis = results[3] if not isinstance(results[3], Exception) else None
        
        return EnrichedMarket(
            market=market,
            historical_context=historical_context,
            volatility_metrics=volatility_metrics,
            sentiment=sentiment,
            trend_analysis=trend_analysis,
            enrichment_timestamp=datetime.utcnow()
        )
    
    async def _get_historical_context(self, market: NormalizedMarket) -> Optional[HistoricalContext]:
        """Get historical context for the market."""
        
        # Mock implementation - in production this would query historical database
        market_key = f"{market.platform.value}_{market.external_id}"
        
        if market_key not in self.historical_data:
            # Simulate historical data
            self.historical_data[market_key] = self._generate_mock_historical_data(market)
        
        historical_points = self.historical_data[market_key]
        
        if len(historical_points) < self.config.min_historical_points:
            return None
        
        # Calculate historical metrics
        recent_prices = [Decimal(str(point["price"])) for point in historical_points[-7:]]
        avg_price_last_week = sum(recent_prices) / len(recent_prices)
        
        current_price = market.outcomes[0].price if market.outcomes else Decimal('0.5')
        price_change_percentage = float((current_price - avg_price_last_week) / avg_price_last_week * 100)
        
        # Analyze volume trend
        recent_volumes = [point["volume"] for point in historical_points[-5:]]
        if len(recent_volumes) >= 2:
            volume_trend = "increasing" if recent_volumes[-1] > recent_volumes[0] else "decreasing"
        else:
            volume_trend = "stable"
        
        return HistoricalContext(
            avg_price_last_week=avg_price_last_week,
            price_change_percentage=price_change_percentage,
            volume_trend=volume_trend,
            similar_market_outcomes=["outcome1", "outcome2"],  # Mock similar markets
            historical_accuracy=0.75  # Mock accuracy score
        )
    
    async def _calculate_volatility_metrics(self, market: NormalizedMarket) -> Optional[VolatilityMetrics]:
        """Calculate volatility metrics for the market."""
        
        # Mock implementation - in production this would use real price history
        market_key = f"{market.platform.value}_{market.external_id}"
        
        if market_key not in self.historical_data:
            self.historical_data[market_key] = self._generate_mock_historical_data(market)
        
        historical_points = self.historical_data[market_key]
        
        if len(historical_points) < 5:
            return None
        
        # Calculate price volatility
        prices = [point["price"] for point in historical_points]
        price_volatility = float(np.std(prices))
        
        # Calculate volume volatility
        volumes = [point["volume"] for point in historical_points]
        volume_volatility = float(np.std(volumes))
        
        # Mock percentile calculation
        volatility_percentile = min(0.95, price_volatility * 10)  # Normalize to 0-1
        
        # Determine trend
        recent_volatility = np.std(prices[-5:]) if len(prices) >= 5 else price_volatility
        volatility_trend = "increasing" if recent_volatility > price_volatility else "decreasing"
        
        # Calculate risk score
        risk_score = min(1.0, (price_volatility + volume_volatility) / 2)
        
        return VolatilityMetrics(
            price_volatility=price_volatility,
            volume_volatility=volume_volatility,
            volatility_percentile=volatility_percentile,
            volatility_trend=volatility_trend,
            risk_score=risk_score
        )
    
    async def _analyze_sentiment(self, market: NormalizedMarket) -> Optional[MarketSentiment]:
        """Analyze sentiment from market title and description."""
        
        # Simple sentiment analysis based on keywords
        text_to_analyze = f"{market.title} {market.description or ''}"
        
        # Positive sentiment keywords
        positive_keywords = [
            "will", "likely", "expected", "strong", "positive", "bullish", 
            "growth", "increase", "win", "success", "good", "high"
        ]
        
        # Negative sentiment keywords
        negative_keywords = [
            "unlikely", "decline", "fall", "negative", "bearish", "loss",
            "fail", "drop", "weak", "low", "poor", "crisis"
        ]
        
        text_lower = text_to_analyze.lower()
        
        positive_count = sum(1 for word in positive_keywords if word in text_lower)
        negative_count = sum(1 for word in negative_keywords if word in text_lower)
        
        # Calculate sentiment score
        total_sentiment_words = positive_count + negative_count
        if total_sentiment_words == 0:
            sentiment_score = 0.0
            sentiment_label = "neutral"
            confidence = 0.3
        else:
            sentiment_score = (positive_count - negative_count) / total_sentiment_words
            if sentiment_score > 0.2:
                sentiment_label = "positive"
            elif sentiment_score < -0.2:
                sentiment_label = "negative"
            else:
                sentiment_label = "neutral"
            
            confidence = min(0.9, total_sentiment_words / 10)  # Higher confidence with more sentiment words
        
        # Extract key phrases (mock implementation)
        key_phrases = [word for word in positive_keywords + negative_keywords if word in text_lower]
        
        return MarketSentiment(
            sentiment_score=sentiment_score,
            sentiment_label=sentiment_label,
            confidence=confidence,
            key_phrases=key_phrases[:5],  # Limit to top 5
            sentiment_sources=["title", "description"]
        )
    
    async def _analyze_trends(self, market: NormalizedMarket) -> Optional[TrendAnalysis]:
        """Analyze price and volume trends for the market."""
        
        # Mock implementation - in production this would use technical analysis
        market_key = f"{market.platform.value}_{market.external_id}"
        
        if market_key not in self.historical_data:
            self.historical_data[market_key] = self._generate_mock_historical_data(market)
        
        historical_points = self.historical_data[market_key]
        
        if len(historical_points) < 3:
            return None
        
        # Calculate price trend
        prices = [point["price"] for point in historical_points]
        price_slope = (prices[-1] - prices[0]) / len(prices)
        
        if price_slope > 0.01:
            price_trend = "bullish"
            trend_strength = min(1.0, abs(price_slope) * 10)
        elif price_slope < -0.01:
            price_trend = "bearish"
            trend_strength = min(1.0, abs(price_slope) * 10)
        else:
            price_trend = "sideways"
            trend_strength = 0.3
        
        # Calculate momentum (rate of change acceleration)
        if len(prices) >= 5:
            recent_slope = (prices[-1] - prices[-3]) / 2
            momentum_score = (recent_slope - price_slope) / (abs(price_slope) + 0.01)
            momentum_score = max(-1.0, min(1.0, momentum_score))
        else:
            momentum_score = 0.0
        
        # Calculate support/resistance levels (simplified)
        support_level = Decimal(str(min(prices)))
        resistance_level = Decimal(str(max(prices)))
        
        # Estimate trend duration
        trend_duration_hours = len(historical_points) * 24  # Assuming daily data points
        
        return TrendAnalysis(
            price_trend=price_trend,
            trend_strength=trend_strength,
            trend_duration_hours=trend_duration_hours,
            support_level=support_level,
            resistance_level=resistance_level,
            momentum_score=momentum_score
        )
    
    def _generate_mock_historical_data(self, market: NormalizedMarket) -> List[Dict]:
        """Generate mock historical data for testing."""
        
        # Generate 30 days of mock data
        base_price = float(market.outcomes[0].price if market.outcomes else 0.5)
        base_volume = float(market.volume)
        
        historical_points = []
        current_date = datetime.utcnow() - timedelta(days=30)
        
        for i in range(30):
            # Add some randomness to price and volume
            price_variation = np.random.normal(0, 0.05)  # 5% standard deviation
            volume_variation = np.random.normal(1, 0.3)  # 30% standard deviation
            
            price = max(0.01, min(0.99, base_price + price_variation))
            volume = max(0, base_volume * volume_variation)
            
            historical_points.append({
                "date": current_date + timedelta(days=i),
                "price": price,
                "volume": volume
            })
        
        return historical_points
    
    def _generate_cache_key(self, market: NormalizedMarket) -> str:
        """Generate cache key for market enrichment."""
        key_string = f"{market.platform.value}_{market.external_id}_{market.normalized_at.isoformat()}"
        return hashlib.md5(key_string.encode()).hexdigest()
    
    def get_enrichment_statistics(self) -> Dict[str, Any]:
        """Get enrichment statistics."""
        cache_hit_rate = (
            self.enrichment_stats["cache_hits"] / 
            max(1, self.enrichment_stats["total_enriched"])
        )
        
        return {
            **self.enrichment_stats,
            "cache_hit_rate": cache_hit_rate,
            "cache_size": len(self.enrichment_cache)
        }
    
    def clear_cache(self) -> None:
        """Clear enrichment cache."""
        self.enrichment_cache.clear()
        self.logger.info("Enrichment cache cleared")
    
    def get_enriched_markets_summary(self, enriched_markets: List[EnrichedMarket]) -> Dict[str, Any]:
        """Get summary statistics for enriched markets."""
        
        if not enriched_markets:
            return {"status": "no_enriched_markets"}
        
        # Sentiment distribution
        sentiment_distribution = {"positive": 0, "negative": 0, "neutral": 0}
        volatility_scores = []
        trend_distribution = {"bullish": 0, "bearish": 0, "sideways": 0}
        
        for enriched in enriched_markets:
            if enriched.sentiment:
                sentiment_distribution[enriched.sentiment.sentiment_label] += 1
            
            if enriched.volatility_metrics:
                volatility_scores.append(enriched.volatility_metrics.risk_score)
            
            if enriched.trend_analysis:
                trend_distribution[enriched.trend_analysis.price_trend] += 1
        
        # Calculate averages
        avg_volatility = sum(volatility_scores) / len(volatility_scores) if volatility_scores else 0
        
        return {
            "total_enriched_markets": len(enriched_markets),
            "sentiment_distribution": sentiment_distribution,
            "trend_distribution": trend_distribution,
            "average_volatility_score": avg_volatility,
            "enrichment_coverage": {
                "sentiment": sum(1 for e in enriched_markets if e.sentiment),
                "volatility": sum(1 for e in enriched_markets if e.volatility_metrics),
                "trends": sum(1 for e in enriched_markets if e.trend_analysis),
                "historical": sum(1 for e in enriched_markets if e.historical_context)
            }
        }