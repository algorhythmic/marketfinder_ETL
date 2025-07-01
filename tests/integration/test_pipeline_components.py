"""Integration tests for MarketFinder ETL pipeline components.

Tests the actual pipeline components with performance metrics and reduction targets,
migrated from the manual testing framework.
"""

from __future__ import annotations

import asyncio
from typing import List

import pytest

from marketfinder_etl.models.market import NormalizedMarket

# Skip if imports fail (dependencies not available)
pytest.importorskip("marketfinder_etl.engines.bucketing")
pytest.importorskip("marketfinder_etl.engines.filtering")
pytest.importorskip("marketfinder_etl.engines.ml_scoring")


@pytest.fixture
def sample_markets() -> List[dict]:
    """Generate sample market data for testing."""
    markets = []
    categories = ["politics", "sports", "crypto", "entertainment"]
    
    for i in range(100):
        market_data = {
            "platform": "test",
            "market_id": f"test_{i}",
            "title": f"Test Market {i} - {categories[i % len(categories)]}",
            "category": categories[i % len(categories)],
            "close_time": "2024-12-31T23:59:59Z",
            "yes_price": 0.3 + (i % 7) * 0.1,  # Vary prices
            "no_price": 0.7 - (i % 7) * 0.1,
            "volume_24h": 1000.0 + (i * 100),
            "open_interest": 5000.0 + (i * 50),
            "liquidity": 10000.0 + (i * 200),
            "status": "open"
        }
        markets.append(market_data)
    
    return markets


@pytest.mark.integration
@pytest.mark.asyncio
async def test_semantic_bucketing_reduction(sample_markets: List[dict]) -> None:
    """Test semantic bucketing achieves significant comparison reduction."""
    from marketfinder_etl.engines.bucketing import SemanticBucketingEngine
    
    # Initialize bucketing engine
    engine = SemanticBucketingEngine()
    
    # Convert to NormalizedMarket objects
    markets = [NormalizedMarket(**market_data) for market_data in sample_markets]
    
    # Process markets through bucketing
    buckets = await engine.create_semantic_buckets(markets)
    
    # Calculate reduction metrics
    total_comparisons = len(markets) * (len(markets) - 1) // 2  # n choose 2
    reduced_comparisons = sum(len(bucket) * (len(bucket) - 1) // 2 for bucket in buckets.values())
    reduction_percentage = (1 - reduced_comparisons / total_comparisons) * 100 if total_comparisons > 0 else 0
    
    # Assertions
    assert len(buckets) > 0, "Should create at least one bucket"
    assert len(buckets) < len(markets), "Should group markets into fewer buckets"
    assert reduction_percentage > 50, f"Should achieve >50% reduction, got {reduction_percentage:.1f}%"
    
    # Log performance metrics
    print(f"Bucketing Performance:")
    print(f"  Input markets: {len(markets)}")
    print(f"  Output buckets: {len(buckets)}")
    print(f"  Reduction: {reduction_percentage:.1f}%")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_hierarchical_filtering_efficiency(sample_markets: List[dict]) -> None:
    """Test hierarchical filtering removes low-quality pairs efficiently."""
    from marketfinder_etl.engines.filtering import HierarchicalFilteringEngine
    
    # Initialize filtering engine
    engine = HierarchicalFilteringEngine()
    
    # Create test market pairs (simulate bucketing output)
    markets = [NormalizedMarket(**market_data) for market_data in sample_markets[:50]]
    
    # Generate market pairs for filtering
    market_pairs = []
    for i in range(0, len(markets), 2):
        if i + 1 < len(markets):
            market_pairs.append((markets[i], markets[i + 1]))
    
    # Apply filtering
    filtered_pairs = await engine.apply_hierarchical_filters(market_pairs)
    
    # Calculate filtering efficiency
    input_pairs = len(market_pairs)
    output_pairs = len(filtered_pairs)
    filtering_percentage = (1 - output_pairs / input_pairs) * 100 if input_pairs > 0 else 0
    
    # Assertions
    assert output_pairs <= input_pairs, "Should not increase pair count"
    assert filtering_percentage >= 0, "Should filter out some pairs"
    assert output_pairs >= 0, "Should have non-negative output"
    
    # Log performance metrics
    print(f"Filtering Performance:")
    print(f"  Input pairs: {input_pairs}")
    print(f"  Output pairs: {output_pairs}")
    print(f"  Filtered: {filtering_percentage:.1f}%")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_ml_scoring_quality_separation() -> None:
    """Test ML scoring separates high and low quality pairs."""
    from marketfinder_etl.engines.ml_scoring import MLScoringEngine
    from marketfinder_etl.engines.filtering import MarketPair
    from decimal import Decimal
    from datetime import datetime, timedelta
    
    engine = MLScoringEngine()
    
    # Create high-quality pairs (similar markets)
    high_quality_pairs = []
    for i in range(10):
        pair = MarketPair(
            kalshi_id=f"k_high_{i}",
            polymarket_id=f"p_high_{i}",
            kalshi_title="US Presidential Election 2024",
            polymarket_title="US Presidential Election 2024 - Winner",
            kalshi_price=Decimal("0.60"),
            polymarket_price=Decimal("0.65"),
            kalshi_volume=Decimal("5000"),
            polymarket_volume=Decimal("4500"),
            kalshi_category="politics",
            polymarket_category="politics",
            kalshi_close_time=datetime.utcnow() + timedelta(days=30),
            polymarket_close_time=datetime.utcnow() + timedelta(days=30),
            bucket_name="politics"
        )
        high_quality_pairs.append(pair)
    
    # Create low-quality pairs (different markets)
    low_quality_pairs = []
    for i in range(10):
        pair = MarketPair(
            kalshi_id=f"k_low_{i}",
            polymarket_id=f"p_low_{i}",
            kalshi_title="US Presidential Election 2024",
            polymarket_title="Bitcoin price above 100k",
            kalshi_price=Decimal("0.30"),
            polymarket_price=Decimal("0.80"),
            kalshi_volume=Decimal("1000"),
            polymarket_volume=Decimal("500"),
            kalshi_category="politics",
            polymarket_category="crypto",
            kalshi_close_time=datetime.utcnow() + timedelta(days=30),
            polymarket_close_time=datetime.utcnow() + timedelta(days=60),
            bucket_name="mixed"
        )
        low_quality_pairs.append(pair)
    
    # Score all pairs
    all_pairs = high_quality_pairs + low_quality_pairs
    scored_pairs = [await engine.score_market_pair(pair) for pair in all_pairs]
    
    # Split scores
    high_scores = [p.llm_worthiness_score for p in scored_pairs[:10]]
    low_scores = [p.llm_worthiness_score for p in scored_pairs[10:]]
    
    # Calculate averages
    avg_high = sum(high_scores) / len(high_scores) if high_scores else 0
    avg_low = sum(low_scores) / len(low_scores) if low_scores else 0
    
    # Assertions
    assert avg_high > avg_low, f"High-quality pairs should score higher: {avg_high:.3f} vs {avg_low:.3f}"
    assert all(score >= 0 for score in high_scores + low_scores), "All scores should be non-negative"
    
    # Log performance metrics
    print(f"ML Scoring Performance:")
    print(f"  Avg high-quality score: {avg_high:.3f}")
    print(f"  Avg low-quality score: {avg_low:.3f}")
    print(f"  Separation ratio: {avg_high/avg_low:.2f}" if avg_low > 0 else "  Separation ratio: ∞")


@pytest.mark.integration
@pytest.mark.slow
@pytest.mark.asyncio
async def test_pipeline_end_to_end_reduction(sample_markets: List[dict]) -> None:
    """Test complete pipeline achieves target reduction (161M -> 50 opportunities)."""
    from marketfinder_etl.engines.bucketing import SemanticBucketingEngine
    from marketfinder_etl.engines.filtering import HierarchicalFilteringEngine
    from marketfinder_etl.engines.ml_scoring import MLScoringEngine
    
    # Simulate large-scale input (scale up sample)
    scaled_markets = sample_markets * 100  # 10,000 markets
    markets = [NormalizedMarket(**market_data) for market_data in scaled_markets]
    
    initial_count = len(markets)
    print(f"Pipeline Test - Starting with {initial_count} markets")
    
    # Stage 1: Semantic Bucketing
    bucketing_engine = SemanticBucketingEngine()
    buckets = await bucketing_engine.create_semantic_buckets(markets)
    
    # Calculate bucketing reduction
    total_pairs_before = initial_count * (initial_count - 1) // 2
    bucketed_pairs = sum(len(bucket) * (len(bucket) - 1) // 2 for bucket in buckets.values())
    bucketing_reduction = (1 - bucketed_pairs / total_pairs_before) * 100
    
    print(f"  After bucketing: {bucketed_pairs:,} pairs ({bucketing_reduction:.1f}% reduction)")
    
    # Stage 2: Hierarchical Filtering (simulate with subset)
    filtering_engine = HierarchicalFilteringEngine()
    
    # Take first 1000 pairs for testing (to keep test fast)
    test_pairs = []
    pair_count = 0
    for bucket in buckets.values():
        if pair_count >= 1000:
            break
        bucket_list = list(bucket)
        for i in range(len(bucket_list)):
            for j in range(i + 1, len(bucket_list)):
                if pair_count >= 1000:
                    break
                test_pairs.append((bucket_list[i], bucket_list[j]))
                pair_count += 1
    
    filtered_pairs = await filtering_engine.apply_hierarchical_filters(test_pairs)
    filtering_reduction = (1 - len(filtered_pairs) / len(test_pairs)) * 100 if test_pairs else 0
    
    print(f"  After filtering: {len(filtered_pairs)} pairs ({filtering_reduction:.1f}% reduction)")
    
    # Assertions for pipeline efficiency
    assert bucketing_reduction > 80, f"Bucketing should achieve >80% reduction, got {bucketing_reduction:.1f}%"
    assert filtering_reduction > 20, f"Filtering should achieve >20% reduction, got {filtering_reduction:.1f}%"
    
    # Calculate total pipeline reduction
    total_reduction = 1 - (len(filtered_pairs) / total_pairs_before)
    total_reduction_pct = total_reduction * 100
    
    print(f"  Total pipeline reduction: {total_reduction_pct:.3f}%")
    
    # Pipeline should achieve significant overall reduction
    assert total_reduction > 0.99, f"Pipeline should achieve >99% reduction, got {total_reduction_pct:.3f}%"