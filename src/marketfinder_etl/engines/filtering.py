"""
Hierarchical Filtering Engine - Layer 2 of Multi-Layer Comparison Architecture

This engine applies multi-stage filtering to eliminate non-viable pairs,
reducing the comparison space from 500K to ~50K pairs (90% reduction).
"""

import asyncio
import math
from typing import Any, Dict, List, Optional, Set, Tuple
from datetime import datetime, timedelta
from decimal import Decimal
from dataclasses import dataclass
from enum import Enum

import polars as pl
from pydantic import BaseModel

from marketfinder_etl.core.logging import LoggerMixin
from marketfinder_etl.models.market import NormalizedMarket, MarketPlatform
from marketfinder_etl.models.pipeline import BucketPair


class FilterStage(str, Enum):
    """Hierarchical filtering stages."""
    BASIC_COMPATIBILITY = "basic_compatibility"
    TEXT_SIMILARITY = "text_similarity"
    LIQUIDITY_FILTERING = "liquidity_filtering"
    TIME_WINDOW_ALIGNMENT = "time_window_alignment"
    ARBITRAGE_POTENTIAL = "arbitrage_potential"


@dataclass
class FilterConfig:
    """Configuration for filtering parameters."""
    # Basic compatibility filters
    min_volume_threshold: float = 100.0
    min_price_range: float = 0.05  # 5%
    max_price_range: float = 0.95  # 95%
    min_arbitrage_potential: float = 0.02  # 2%
    
    # Text similarity filters
    min_text_similarity: float = 0.3
    title_weight: float = 0.7
    description_weight: float = 0.3
    
    # Liquidity filters
    min_liquidity_score: float = 0.1
    volume_ratio_threshold: float = 0.1  # Smaller volume must be at least 10% of larger
    
    # Time window filters
    max_time_difference_days: int = 30
    both_closing_soon_hours: int = 24
    
    # Performance settings
    enable_parallel_processing: bool = True
    batch_size: int = 1000


class MarketPair(BaseModel):
    """A pair of markets for comparison."""
    kalshi_id: str
    polymarket_id: str
    kalshi_title: str
    polymarket_title: str
    kalshi_price: Decimal
    polymarket_price: Decimal
    kalshi_volume: Decimal
    polymarket_volume: Decimal
    kalshi_category: str
    polymarket_category: str
    kalshi_close_time: datetime
    polymarket_close_time: datetime
    bucket_name: str
    
    # Computed fields
    price_difference: Optional[Decimal] = None
    text_similarity: Optional[float] = None
    liquidity_score: Optional[float] = None
    time_alignment_score: Optional[float] = None
    arbitrage_potential: Optional[Decimal] = None
    
    class Config:
        arbitrary_types_allowed = True


class FilteringStats(BaseModel):
    """Statistics for filtering stage."""
    stage: FilterStage
    input_count: int
    output_count: int
    filtered_count: int
    filter_rate: float
    processing_time_ms: int
    top_filter_reasons: Dict[str, int] = {}


class HierarchicalFilteringEngine(LoggerMixin):
    """
    Hierarchical Filtering Engine for eliminating non-viable market pairs.
    
    Applies multi-stage filtering pipeline:
    1. Basic compatibility check
    2. Text similarity pre-screening  
    3. Liquidity and volume filtering
    4. Time window alignment
    5. Arbitrage potential assessment
    """
    
    def __init__(self, config: Optional[FilterConfig] = None):
        self.config = config or FilterConfig()
        self.filtering_stats: List[FilteringStats] = []
    
    async def filter_bucket_pairs(self, bucket_name: str, markets: List[NormalizedMarket]) -> List[MarketPair]:
        """Apply hierarchical filtering to a bucket of markets."""
        self.logger.info(f"Starting hierarchical filtering for bucket: {bucket_name}")
        
        # Separate markets by platform
        kalshi_markets = [m for m in markets if m.platform == MarketPlatform.KALSHI]
        polymarket_markets = [m for m in markets if m.platform == MarketPlatform.POLYMARKET]
        
        self.logger.debug(
            f"Market split for bucket {bucket_name}",
            kalshi_count=len(kalshi_markets),
            polymarket_count=len(polymarket_markets)
        )
        
        if not kalshi_markets or not polymarket_markets:
            self.logger.warning(f"Bucket {bucket_name} missing markets from one platform")
            return []
        
        # Stage 1: Basic compatibility check
        compatible_pairs = await self._basic_compatibility_filter(kalshi_markets, polymarket_markets, bucket_name)
        
        # Stage 2: Text similarity pre-screening
        text_similar_pairs = await self._text_similarity_filter(compatible_pairs)
        
        # Stage 3: Liquidity and volume filtering
        liquid_pairs = await self._liquidity_filter(text_similar_pairs)
        
        # Stage 4: Time window alignment
        time_aligned_pairs = await self._time_window_filter(liquid_pairs)
        
        # Stage 5: Arbitrage potential assessment
        viable_pairs = await self._arbitrage_potential_filter(time_aligned_pairs)
        
        self.logger.info(
            f"Filtering complete for bucket {bucket_name}",
            input_pairs=len(kalshi_markets) * len(polymarket_markets),
            output_pairs=len(viable_pairs),
            reduction_rate=1 - (len(viable_pairs) / (len(kalshi_markets) * len(polymarket_markets)))
        )
        
        return viable_pairs
    
    async def _basic_compatibility_filter(
        self, 
        kalshi_markets: List[NormalizedMarket],
        polymarket_markets: List[NormalizedMarket], 
        bucket_name: str
    ) -> List[MarketPair]:
        """Stage 1: Basic compatibility check."""
        start_time = datetime.utcnow()
        compatible_pairs = []
        filter_reasons = {}
        
        total_potential = len(kalshi_markets) * len(polymarket_markets)
        self.logger.debug(f"Stage 1: Checking {total_potential} potential pairs for basic compatibility")
        
        for kalshi_market in kalshi_markets:
            kalshi_price = self._get_yes_price(kalshi_market)
            
            # Skip markets with invalid pricing
            if not self._is_valid_price(kalshi_price):
                filter_reasons['kalshi_invalid_price'] = filter_reasons.get('kalshi_invalid_price', 0) + len(polymarket_markets)
                continue
            
            # Skip low volume markets
            if kalshi_market.volume < self.config.min_volume_threshold:
                filter_reasons['kalshi_low_volume'] = filter_reasons.get('kalshi_low_volume', 0) + len(polymarket_markets)
                continue
            
            for polymarket_market in polymarket_markets:
                polymarket_price = self._get_yes_price(polymarket_market)
                
                # Skip markets with invalid pricing
                if not self._is_valid_price(polymarket_price):
                    filter_reasons['polymarket_invalid_price'] = filter_reasons.get('polymarket_invalid_price', 0) + 1
                    continue
                
                # Skip low volume markets
                if polymarket_market.volume < self.config.min_volume_threshold:
                    filter_reasons['polymarket_low_volume'] = filter_reasons.get('polymarket_low_volume', 0) + 1
                    continue
                
                # Check price range validity
                if not (self.config.min_price_range <= kalshi_price <= self.config.max_price_range):
                    filter_reasons['kalshi_price_range'] = filter_reasons.get('kalshi_price_range', 0) + 1
                    continue
                
                if not (self.config.min_price_range <= polymarket_price <= self.config.max_price_range):
                    filter_reasons['polymarket_price_range'] = filter_reasons.get('polymarket_price_range', 0) + 1
                    continue
                
                # Check minimum arbitrage potential
                price_diff = abs(kalshi_price - polymarket_price)
                if price_diff < self.config.min_arbitrage_potential:
                    filter_reasons['insufficient_arbitrage'] = filter_reasons.get('insufficient_arbitrage', 0) + 1
                    continue
                
                # Create market pair
                pair = MarketPair(
                    kalshi_id=kalshi_market.external_id,
                    polymarket_id=polymarket_market.external_id,
                    kalshi_title=kalshi_market.title,
                    polymarket_title=polymarket_market.title,
                    kalshi_price=kalshi_price,
                    polymarket_price=polymarket_price,
                    kalshi_volume=kalshi_market.volume,
                    polymarket_volume=polymarket_market.volume,
                    kalshi_category=kalshi_market.category,
                    polymarket_category=polymarket_market.category,
                    kalshi_close_time=kalshi_market.end_date,
                    polymarket_close_time=polymarket_market.end_date,
                    bucket_name=bucket_name,
                    price_difference=price_diff
                )
                
                compatible_pairs.append(pair)
        
        processing_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        
        # Record statistics
        stats = FilteringStats(
            stage=FilterStage.BASIC_COMPATIBILITY,
            input_count=total_potential,
            output_count=len(compatible_pairs),
            filtered_count=total_potential - len(compatible_pairs),
            filter_rate=1 - (len(compatible_pairs) / total_potential) if total_potential > 0 else 0,
            processing_time_ms=processing_time,
            top_filter_reasons=filter_reasons
        )
        self.filtering_stats.append(stats)
        
        self.logger.debug(
            f"Stage 1 complete: {len(compatible_pairs)}/{total_potential} pairs passed basic compatibility",
            filter_rate=f"{stats.filter_rate:.2%}",
            processing_time_ms=processing_time
        )
        
        return compatible_pairs
    
    async def _text_similarity_filter(self, pairs: List[MarketPair]) -> List[MarketPair]:
        """Stage 2: Text similarity pre-screening."""
        start_time = datetime.utcnow()
        similar_pairs = []
        filter_reasons = {}
        
        self.logger.debug(f"Stage 2: Analyzing text similarity for {len(pairs)} pairs")
        
        for pair in pairs:
            # Calculate text similarity
            title_similarity = self._calculate_text_similarity(pair.kalshi_title, pair.polymarket_title)
            
            # Include description if available (would need to be added to MarketPair)
            description_similarity = 0.0  # Placeholder
            
            # Weighted similarity score
            overall_similarity = (
                title_similarity * self.config.title_weight +
                description_similarity * self.config.description_weight
            )
            
            pair.text_similarity = overall_similarity
            
            # Filter by similarity threshold OR significant price difference
            significant_price_diff = pair.price_difference >= 0.1  # 10% difference
            
            if overall_similarity >= self.config.min_text_similarity or significant_price_diff:
                similar_pairs.append(pair)
            else:
                filter_reasons['low_text_similarity'] = filter_reasons.get('low_text_similarity', 0) + 1
        
        processing_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        
        # Record statistics
        stats = FilteringStats(
            stage=FilterStage.TEXT_SIMILARITY,
            input_count=len(pairs),
            output_count=len(similar_pairs),
            filtered_count=len(pairs) - len(similar_pairs),
            filter_rate=1 - (len(similar_pairs) / len(pairs)) if len(pairs) > 0 else 0,
            processing_time_ms=processing_time,
            top_filter_reasons=filter_reasons
        )
        self.filtering_stats.append(stats)
        
        self.logger.debug(
            f"Stage 2 complete: {len(similar_pairs)}/{len(pairs)} pairs passed text similarity",
            filter_rate=f"{stats.filter_rate:.2%}",
            processing_time_ms=processing_time
        )
        
        return similar_pairs
    
    async def _liquidity_filter(self, pairs: List[MarketPair]) -> List[MarketPair]:
        """Stage 3: Liquidity and volume filtering."""
        start_time = datetime.utcnow()
        liquid_pairs = []
        filter_reasons = {}
        
        self.logger.debug(f"Stage 3: Analyzing liquidity for {len(pairs)} pairs")
        
        for pair in pairs:
            # Calculate liquidity scores
            kalshi_liquidity = self._calculate_liquidity_score(pair.kalshi_volume, pair.kalshi_price)
            polymarket_liquidity = self._calculate_liquidity_score(pair.polymarket_volume, pair.polymarket_price)
            
            # Combined liquidity score
            pair.liquidity_score = (kalshi_liquidity + polymarket_liquidity) / 2
            
            # Check minimum liquidity
            if pair.liquidity_score < self.config.min_liquidity_score:
                filter_reasons['low_liquidity'] = filter_reasons.get('low_liquidity', 0) + 1
                continue
            
            # Check volume ratio (avoid extreme volume imbalances)
            min_volume = min(float(pair.kalshi_volume), float(pair.polymarket_volume))
            max_volume = max(float(pair.kalshi_volume), float(pair.polymarket_volume))
            volume_ratio = min_volume / max_volume if max_volume > 0 else 0
            
            if volume_ratio < self.config.volume_ratio_threshold:
                filter_reasons['volume_imbalance'] = filter_reasons.get('volume_imbalance', 0) + 1
                continue
            
            liquid_pairs.append(pair)
        
        processing_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        
        # Record statistics
        stats = FilteringStats(
            stage=FilterStage.LIQUIDITY_FILTERING,
            input_count=len(pairs),
            output_count=len(liquid_pairs),
            filtered_count=len(pairs) - len(liquid_pairs),
            filter_rate=1 - (len(liquid_pairs) / len(pairs)) if len(pairs) > 0 else 0,
            processing_time_ms=processing_time,
            top_filter_reasons=filter_reasons
        )
        self.filtering_stats.append(stats)
        
        self.logger.debug(
            f"Stage 3 complete: {len(liquid_pairs)}/{len(pairs)} pairs passed liquidity filtering",
            filter_rate=f"{stats.filter_rate:.2%}",
            processing_time_ms=processing_time
        )
        
        return liquid_pairs
    
    async def _time_window_filter(self, pairs: List[MarketPair]) -> List[MarketPair]:
        """Stage 4: Time window alignment."""
        start_time = datetime.utcnow()
        aligned_pairs = []
        filter_reasons = {}
        
        self.logger.debug(f"Stage 4: Analyzing time alignment for {len(pairs)} pairs")
        
        current_time = datetime.utcnow()
        
        for pair in pairs:
            # Calculate time difference between close times
            time_diff = abs((pair.kalshi_close_time - pair.polymarket_close_time).total_seconds())
            time_diff_days = time_diff / (24 * 3600)
            
            # Check maximum time difference
            if time_diff_days > self.config.max_time_difference_days:
                filter_reasons['time_misalignment'] = filter_reasons.get('time_misalignment', 0) + 1
                continue
            
            # Calculate time alignment score
            max_diff_seconds = self.config.max_time_difference_days * 24 * 3600
            alignment_score = 1.0 - (time_diff / max_diff_seconds)
            pair.time_alignment_score = alignment_score
            
            # Check if both are closing soon (higher priority)
            kalshi_closing_soon = (pair.kalshi_close_time - current_time).total_seconds() < (self.config.both_closing_soon_hours * 3600)
            polymarket_closing_soon = (pair.polymarket_close_time - current_time).total_seconds() < (self.config.both_closing_soon_hours * 3600)
            
            # Boost score if both closing soon
            if kalshi_closing_soon and polymarket_closing_soon:
                pair.time_alignment_score = min(1.0, pair.time_alignment_score + 0.2)
            
            aligned_pairs.append(pair)
        
        processing_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        
        # Record statistics
        stats = FilteringStats(
            stage=FilterStage.TIME_WINDOW_ALIGNMENT,
            input_count=len(pairs),
            output_count=len(aligned_pairs),
            filtered_count=len(pairs) - len(aligned_pairs),
            filter_rate=1 - (len(aligned_pairs) / len(pairs)) if len(pairs) > 0 else 0,
            processing_time_ms=processing_time,
            top_filter_reasons=filter_reasons
        )
        self.filtering_stats.append(stats)
        
        self.logger.debug(
            f"Stage 4 complete: {len(aligned_pairs)}/{len(pairs)} pairs passed time alignment",
            filter_rate=f"{stats.filter_rate:.2%}",
            processing_time_ms=processing_time
        )
        
        return aligned_pairs
    
    async def _arbitrage_potential_filter(self, pairs: List[MarketPair]) -> List[MarketPair]:
        """Stage 5: Arbitrage potential assessment."""
        start_time = datetime.utcnow()
        viable_pairs = []
        filter_reasons = {}
        
        self.logger.debug(f"Stage 5: Analyzing arbitrage potential for {len(pairs)} pairs")
        
        for pair in pairs:
            # Calculate arbitrage potential
            arbitrage_potential = self._calculate_arbitrage_potential(pair)
            pair.arbitrage_potential = arbitrage_potential
            
            # Filter by minimum arbitrage potential
            if arbitrage_potential >= Decimal(str(self.config.min_arbitrage_potential)):
                viable_pairs.append(pair)
            else:
                filter_reasons['insufficient_arbitrage'] = filter_reasons.get('insufficient_arbitrage', 0) + 1
        
        processing_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        
        # Record statistics
        stats = FilteringStats(
            stage=FilterStage.ARBITRAGE_POTENTIAL,
            input_count=len(pairs),
            output_count=len(viable_pairs),
            filtered_count=len(pairs) - len(viable_pairs),
            filter_rate=1 - (len(viable_pairs) / len(pairs)) if len(pairs) > 0 else 0,
            processing_time_ms=processing_time,
            top_filter_reasons=filter_reasons
        )
        self.filtering_stats.append(stats)
        
        self.logger.debug(
            f"Stage 5 complete: {len(viable_pairs)}/{len(pairs)} pairs have viable arbitrage potential",
            filter_rate=f"{stats.filter_rate:.2%}",
            processing_time_ms=processing_time
        )
        
        return viable_pairs
    
    def _get_yes_price(self, market: NormalizedMarket) -> Decimal:
        """Extract Yes price from market outcomes."""
        for outcome in market.outcomes:
            if outcome.name.lower() in ['yes', 'true', '1']:
                return outcome.price
        
        # If no explicit Yes outcome, use first outcome
        if market.outcomes:
            return market.outcomes[0].price
        
        return Decimal('0.5')  # Default fallback
    
    def _is_valid_price(self, price: Decimal) -> bool:
        """Check if price is valid for arbitrage analysis."""
        return Decimal('0.01') <= price <= Decimal('0.99')
    
    def _calculate_text_similarity(self, text1: str, text2: str) -> float:
        """Calculate Jaccard similarity between two texts."""
        if not text1 or not text2:
            return 0.0
        
        # Normalize and tokenize
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        
        # Remove common stop words
        stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'will', 'be', 'is', 'are'}
        words1 = words1 - stop_words
        words2 = words2 - stop_words
        
        if not words1 or not words2:
            return 0.0
        
        # Jaccard similarity
        intersection = len(words1.intersection(words2))
        union = len(words1.union(words2))
        
        return intersection / union if union > 0 else 0.0
    
    def _calculate_liquidity_score(self, volume: Decimal, price: Decimal) -> float:
        """Calculate liquidity score based on volume and price."""
        # Adjust volume by price distance from 0.5 (more liquid near 50%)
        price_adjustment = 1.0 - abs(float(price) - 0.5) * 2
        adjusted_volume = float(volume) * max(0.1, price_adjustment)
        
        # Log-scale normalization
        if adjusted_volume <= 0:
            return 0.0
        
        # Normalize to 0-1 scale (assuming max volume of ~10000)
        return min(1.0, math.log10(adjusted_volume + 1) / 4.0)
    
    def _calculate_arbitrage_potential(self, pair: MarketPair) -> Decimal:
        """Calculate arbitrage potential for a market pair."""
        # Simple arbitrage calculation: buy low, sell high
        price_diff = abs(pair.kalshi_price - pair.polymarket_price)
        
        # Account for transaction costs (simplified)
        transaction_cost = Decimal('0.01')  # 1% transaction cost
        
        net_arbitrage = price_diff - transaction_cost
        return max(Decimal('0'), net_arbitrage)
    
    def get_filtering_statistics(self) -> List[FilteringStats]:
        """Get filtering statistics for all stages."""
        return self.filtering_stats
    
    def reset_statistics(self) -> None:
        """Reset filtering statistics."""
        self.filtering_stats = []
    
    def analyze_filtering_performance(self) -> Dict[str, Any]:
        """Analyze filtering performance across all stages."""
        if not self.filtering_stats:
            return {}
        
        total_input = self.filtering_stats[0].input_count
        total_output = self.filtering_stats[-1].output_count
        total_processing_time = sum(stat.processing_time_ms for stat in self.filtering_stats)
        
        analysis = {
            'overall_reduction': 1 - (total_output / total_input) if total_input > 0 else 0,
            'total_processing_time_ms': total_processing_time,
            'stage_breakdown': [],
            'bottleneck_stages': [],
            'filter_effectiveness': {}
        }
        
        # Analyze each stage
        for i, stat in enumerate(self.filtering_stats):
            stage_analysis = {
                'stage': stat.stage.value,
                'reduction_rate': stat.filter_rate,
                'processing_time_ms': stat.processing_time_ms,
                'throughput_per_second': stat.input_count / (stat.processing_time_ms / 1000) if stat.processing_time_ms > 0 else 0,
                'top_filter_reasons': stat.top_filter_reasons
            }
            analysis['stage_breakdown'].append(stage_analysis)
            
            # Identify bottlenecks (stages that take >20% of total time)
            if stat.processing_time_ms > (total_processing_time * 0.2):
                analysis['bottleneck_stages'].append(stat.stage.value)
            
            # Track filter effectiveness
            analysis['filter_effectiveness'][stat.stage.value] = {
                'items_filtered': stat.filtered_count,
                'filter_rate': stat.filter_rate,
                'efficiency': stat.filtered_count / stat.processing_time_ms if stat.processing_time_ms > 0 else 0
            }
        
        return analysis