"""
Semantic Bucketing Engine - Layer 1 of Multi-Layer Comparison Architecture

This engine groups similar markets across platforms into semantic buckets,
reducing the comparison space from 161M to ~500K potential pairs (99.7% reduction).
"""

import asyncio
import re
from typing import Any, Dict, List, Optional, Set, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass
from collections import defaultdict, Counter

import polars as pl
from pydantic import BaseModel

from marketfinder_etl.core.logging import LoggerMixin
from marketfinder_etl.models.market import NormalizedMarket, MarketPlatform
from marketfinder_etl.models.pipeline import BucketPair


@dataclass
class BucketDefinition:
    """Definition for a semantic bucket."""
    name: str
    keywords: List[str]
    categories: List[str]
    priority: int
    time_window: Optional[str] = None
    price_range: Optional[Tuple[float, float]] = None
    required_keywords: Optional[List[str]] = None
    excluded_keywords: Optional[List[str]] = None
    
    def __post_init__(self):
        # Normalize keywords to lowercase
        self.keywords = [kw.lower() for kw in self.keywords]
        if self.required_keywords:
            self.required_keywords = [kw.lower() for kw in self.required_keywords]
        if self.excluded_keywords:
            self.excluded_keywords = [kw.lower() for kw in self.excluded_keywords]


class BucketStats(BaseModel):
    """Statistics for a semantic bucket."""
    bucket_name: str
    kalshi_count: int = 0
    polymarket_count: int = 0
    total_markets: int = 0
    avg_confidence: float = 0.0
    last_updated: datetime
    sample_titles: List[str] = []


class SemanticBucketingEngine(LoggerMixin):
    """
    Semantic Bucketing Engine for grouping similar markets across platforms.
    
    Uses keyword matching, category classification, and temporal alignment
    to create semantic buckets that reduce the comparison space by 99.7%.
    """
    
    def __init__(self):
        self.bucket_definitions = self._create_bucket_definitions()
        self.bucket_stats: Dict[str, BucketStats] = {}
        
    def _create_bucket_definitions(self) -> Dict[str, BucketDefinition]:
        """Create comprehensive bucket definitions for market categorization."""
        
        definitions = {
            # Politics & Elections
            'politics_trump_2024': BucketDefinition(
                name='politics_trump_2024',
                keywords=['trump', 'donald', 'maga', 'republican nominee', 'gop nominee', 'trump 2024'],
                categories=['Politics', 'Elections'],
                priority=1,
                time_window='2024-01-01',
                required_keywords=['trump']
            ),
            
            'politics_biden_2024': BucketDefinition(
                name='politics_biden_2024', 
                keywords=['biden', 'joe biden', 'democratic nominee', 'democrat nominee', 'biden 2024'],
                categories=['Politics', 'Elections'],
                priority=1,
                time_window='2024-01-01',
                required_keywords=['biden']
            ),
            
            'politics_election_2024': BucketDefinition(
                name='politics_election_2024',
                keywords=['election', 'presidential', 'president', '2024 election', 'electoral', 'vote'],
                categories=['Politics', 'Elections'],
                priority=2,
                time_window='2024-01-01'
            ),
            
            'politics_congress': BucketDefinition(
                name='politics_congress',
                keywords=['congress', 'senate', 'house', 'representative', 'senator', 'midterm'],
                categories=['Politics'],
                priority=2
            ),
            
            # Cryptocurrency
            'crypto_bitcoin_price': BucketDefinition(
                name='crypto_bitcoin_price',
                keywords=['bitcoin', 'btc', 'bitcoin price', '$50000', '$100000'],
                categories=['Crypto', 'Cryptocurrency'],
                priority=1,
                price_range=(20000, 200000)
            ),
            
            'crypto_ethereum': BucketDefinition(
                name='crypto_ethereum',
                keywords=['ethereum', 'eth', 'ether', 'ethereum price'],
                categories=['Crypto', 'Cryptocurrency'],
                priority=1
            ),
            
            'crypto_general': BucketDefinition(
                name='crypto_general',
                keywords=['crypto', 'cryptocurrency', 'coin', 'token', 'defi', 'nft'],
                categories=['Crypto', 'Cryptocurrency'],
                priority=3
            ),
            
            # Sports
            'sports_nfl_2024': BucketDefinition(
                name='sports_nfl_2024',
                keywords=['nfl', 'super bowl', 'football', 'playoffs', 'chiefs', 'bills'],
                categories=['Sports', 'NFL'],
                priority=1,
                time_window='2024-09-01'
            ),
            
            'sports_nba_2024': BucketDefinition(
                name='sports_nba_2024',
                keywords=['nba', 'basketball', 'finals', 'championship', 'lakers', 'warriors'],
                categories=['Sports', 'NBA'],
                priority=1,
                time_window='2024-10-01'
            ),
            
            'sports_soccer': BucketDefinition(
                name='sports_soccer',
                keywords=['world cup', 'fifa', 'soccer', 'football', 'uefa', 'premier league'],
                categories=['Sports'],
                priority=2
            ),
            
            # Economics & Finance
            'economics_fed_rates': BucketDefinition(
                name='economics_fed_rates',
                keywords=['fed', 'federal reserve', 'interest rate', 'rate cut', 'rate hike', 'jerome powell'],
                categories=['Economics'],
                priority=1
            ),
            
            'economics_inflation': BucketDefinition(
                name='economics_inflation',
                keywords=['inflation', 'cpi', 'consumer price', 'deflation', 'prices'],
                categories=['Economics'],
                priority=2
            ),
            
            'economics_recession': BucketDefinition(
                name='economics_recession',
                keywords=['recession', 'gdp', 'economic growth', 'unemployment', 'job'],
                categories=['Economics'],
                priority=2
            ),
            
            # Business & Stocks
            'business_tech_stocks': BucketDefinition(
                name='business_tech_stocks',
                keywords=['apple', 'microsoft', 'google', 'amazon', 'meta', 'tesla', 'nvidia'],
                categories=['Business'],
                priority=1
            ),
            
            'business_ipo': BucketDefinition(
                name='business_ipo',
                keywords=['ipo', 'public offering', 'listing', 'debut'],
                categories=['Business'],
                priority=2
            ),
            
            # Entertainment
            'entertainment_awards': BucketDefinition(
                name='entertainment_awards',
                keywords=['oscar', 'academy award', 'emmy', 'golden globe', 'grammy'],
                categories=['Entertainment'],
                priority=2
            ),
            
            'entertainment_celebrity': BucketDefinition(
                name='entertainment_celebrity',
                keywords=['celebrity', 'movie', 'actor', 'actress', 'director', 'film'],
                categories=['Entertainment'],
                priority=3
            ),
            
            # Weather & Climate
            'weather_hurricane': BucketDefinition(
                name='weather_hurricane',
                keywords=['hurricane', 'storm', 'landfall', 'category', 'wind speed'],
                categories=['Weather'],
                priority=1
            ),
            
            'weather_temperature': BucketDefinition(
                name='weather_temperature',
                keywords=['temperature', 'heat', 'cold', 'record', 'degrees'],
                categories=['Weather'],
                priority=2
            ),
            
            # Science & Technology
            'science_space': BucketDefinition(
                name='science_space',
                keywords=['spacex', 'nasa', 'rocket', 'mars', 'moon', 'satellite'],
                categories=['Science', 'Technology'],
                priority=2
            ),
            
            'tech_ai': BucketDefinition(
                name='tech_ai',
                keywords=['ai', 'artificial intelligence', 'gpt', 'chatgpt', 'machine learning'],
                categories=['Technology'],
                priority=2
            ),
        }
        
        return definitions
    
    def calculate_bucket_score(self, market: NormalizedMarket, bucket: BucketDefinition) -> float:
        """Calculate how well a market fits into a specific bucket."""
        score = 0.0
        title_lower = market.title.lower()
        description_lower = (market.description or '').lower()
        combined_text = f"{title_lower} {description_lower}"
        
        # Keyword matching (0-50 points)
        keyword_matches = 0
        for keyword in bucket.keywords:
            if keyword in combined_text:
                keyword_matches += 1
                
        if bucket.keywords:
            keyword_score = min(50, (keyword_matches / len(bucket.keywords)) * 80)
            score += keyword_score
        
        # Required keywords check
        if bucket.required_keywords:
            has_required = all(req_kw in combined_text for req_kw in bucket.required_keywords)
            if not has_required:
                return 0.0  # Must have required keywords
        
        # Excluded keywords check
        if bucket.excluded_keywords:
            has_excluded = any(excl_kw in combined_text for excl_kw in bucket.excluded_keywords)
            if has_excluded:
                return 0.0  # Cannot have excluded keywords
        
        # Category matching (0-30 points)
        if market.category in bucket.categories:
            score += 30
        elif any(cat.lower() in market.category.lower() for cat in bucket.categories):
            score += 15
        
        # Time window validation (0-20 points or elimination)
        if bucket.time_window:
            try:
                bucket_date = datetime.fromisoformat(bucket.time_window)
                if market.end_date and market.end_date >= bucket_date:
                    score += 20
                elif market.created_date and market.created_date >= bucket_date:
                    score += 10
                # If no time alignment, don't eliminate but don't add points
            except ValueError:
                pass
        
        # Price range validation (for markets with price context)
        if bucket.price_range and hasattr(market, 'price_context'):
            # This would be implemented if markets had price context
            pass
        
        return min(100.0, score)
    
    def bucket_market(self, market: NormalizedMarket) -> Tuple[str, float]:
        """Assign a market to the best-fitting semantic bucket."""
        best_bucket = 'miscellaneous'
        best_score = 0.0
        
        # Calculate scores for all buckets
        for bucket_name, bucket_def in self.bucket_definitions.items():
            score = self.calculate_bucket_score(market, bucket_def)
            
            # Priority boost for higher priority buckets
            priority_boost = (5 - bucket_def.priority) * 5  # 0-20 point boost
            adjusted_score = score + priority_boost
            
            if adjusted_score > best_score and score >= 40:  # Minimum 40% match required
                best_score = score  # Use original score for confidence
                best_bucket = bucket_name
        
        return best_bucket, best_score / 100.0  # Return confidence as 0-1
    
    def bucket_markets(self, markets: List[NormalizedMarket]) -> List[BucketPair]:
        """Bucket all markets and create bucket pairs for processing."""
        self.logger.info(f"Starting semantic bucketing for {len(markets)} markets")
        
        # Create DataFrame for efficient processing
        market_data = []
        for market in markets:
            bucket_name, confidence = self.bucket_market(market)
            market_data.append({
                'external_id': market.external_id,
                'platform': market.platform.value,
                'title': market.title,
                'category': market.category,
                'bucket': bucket_name,
                'confidence': confidence,
                'volume': float(market.volume),
                'end_date': market.end_date.isoformat() if market.end_date else None
            })
        
        df = pl.DataFrame(market_data)
        
        # Update bucket statistics
        self._update_bucket_stats(df)
        
        # Create bucket pairs for cross-platform comparison
        bucket_pairs = self._create_bucket_pairs(df)
        
        self.logger.info(
            f"Bucketing complete: {len(bucket_pairs)} bucket pairs created",
            total_comparisons=sum(pair.comparison_count for pair in bucket_pairs)
        )
        
        return bucket_pairs
    
    def _update_bucket_stats(self, df: pl.DataFrame) -> None:
        """Update statistics for each bucket."""
        
        # Group by bucket and platform
        bucket_stats = (
            df.group_by(['bucket', 'platform'])
            .agg([
                pl.count().alias('count'),
                pl.col('confidence').mean().alias('avg_confidence'),
                pl.col('title').sample(n=3).alias('sample_titles')
            ])
        )
        
        # Create BucketStats objects
        for bucket_name in df['bucket'].unique():
            bucket_data = bucket_stats.filter(pl.col('bucket') == bucket_name)
            
            kalshi_count = 0
            polymarket_count = 0
            total_confidence = 0.0
            sample_titles = []
            
            for row in bucket_data.iter_rows(named=True):
                if row['platform'] == 'kalshi':
                    kalshi_count = row['count']
                elif row['platform'] == 'polymarket':
                    polymarket_count = row['count']
                
                total_confidence += row['avg_confidence'] * row['count']
                sample_titles.extend(row['sample_titles'])
            
            total_markets = kalshi_count + polymarket_count
            avg_confidence = total_confidence / total_markets if total_markets > 0 else 0.0
            
            self.bucket_stats[bucket_name] = BucketStats(
                bucket_name=bucket_name,
                kalshi_count=kalshi_count,
                polymarket_count=polymarket_count,
                total_markets=total_markets,
                avg_confidence=avg_confidence,
                last_updated=datetime.utcnow(),
                sample_titles=sample_titles[:5]  # Keep only 5 samples
            )
    
    def _create_bucket_pairs(self, df: pl.DataFrame) -> List[BucketPair]:
        """Create bucket pairs for cross-platform comparison."""
        bucket_pairs = []
        
        # Get cross-platform bucket summary
        bucket_summary = (
            df.filter(pl.col('bucket') != 'miscellaneous')  # Skip miscellaneous bucket
            .group_by(['bucket', 'platform'])
            .agg(pl.count().alias('count'))
            .pivot(index='bucket', columns='platform', values='count')
            .fill_null(0)
        )
        
        for row in bucket_summary.iter_rows(named=True):
            bucket_name = row['bucket']
            kalshi_count = row.get('kalshi', 0)
            polymarket_count = row.get('polymarket', 0)
            
            # Only create pairs where both platforms have markets
            if kalshi_count > 0 and polymarket_count > 0:
                comparison_count = kalshi_count * polymarket_count
                
                bucket_pair = BucketPair(
                    bucket_name=bucket_name,
                    kalshi_count=kalshi_count,
                    polymarket_count=polymarket_count,
                    comparison_count=comparison_count
                )
                
                bucket_pairs.append(bucket_pair)
        
        # Sort by comparison count (largest first) to prioritize high-impact buckets
        bucket_pairs.sort(key=lambda x: x.comparison_count, reverse=True)
        
        return bucket_pairs
    
    def get_bucket_statistics(self) -> Dict[str, BucketStats]:
        """Get current bucket statistics."""
        return self.bucket_stats
    
    def get_markets_in_bucket(
        self, 
        markets: List[NormalizedMarket], 
        bucket_name: str,
        platform: Optional[MarketPlatform] = None
    ) -> List[NormalizedMarket]:
        """Get all markets in a specific bucket."""
        bucket_markets = []
        
        for market in markets:
            market_bucket, confidence = self.bucket_market(market)
            
            if market_bucket == bucket_name:
                if platform is None or market.platform == platform:
                    # Add bucket metadata to market
                    market.semantic_bucket = bucket_name
                    market.bucket_confidence = confidence
                    bucket_markets.append(market)
        
        return bucket_markets
    
    def rebucket_stale_markets(self, markets: List[NormalizedMarket], hours_threshold: int = 24) -> List[NormalizedMarket]:
        """Re-bucket markets that haven't been bucketed recently."""
        cutoff_time = datetime.utcnow() - timedelta(hours=hours_threshold)
        stale_markets = []
        
        for market in markets:
            # Check if market needs re-bucketing
            needs_rebucket = (
                not hasattr(market, 'semantic_bucket') or
                not market.semantic_bucket or
                not hasattr(market, 'processed_at') or
                market.processed_at < cutoff_time
            )
            
            if needs_rebucket:
                bucket_name, confidence = self.bucket_market(market)
                market.semantic_bucket = bucket_name
                market.bucket_confidence = confidence
                market.processed_at = datetime.utcnow()
                stale_markets.append(market)
        
        self.logger.info(f"Re-bucketed {len(stale_markets)} stale markets")
        return stale_markets
    
    def analyze_bucket_effectiveness(self) -> Dict[str, Any]:
        """Analyze the effectiveness of bucket definitions."""
        analysis = {
            'total_buckets': len(self.bucket_stats),
            'active_buckets': len([b for b in self.bucket_stats.values() if b.total_markets > 0]),
            'cross_platform_buckets': len([b for b in self.bucket_stats.values() 
                                         if b.kalshi_count > 0 and b.polymarket_count > 0]),
            'bucket_efficiency': {},
            'top_buckets_by_volume': [],
            'empty_buckets': []
        }
        
        for bucket_name, stats in self.bucket_stats.items():
            if stats.total_markets == 0:
                analysis['empty_buckets'].append(bucket_name)
            else:
                # Calculate efficiency metrics
                cross_platform_potential = min(stats.kalshi_count, stats.polymarket_count) * 2
                efficiency = cross_platform_potential / stats.total_markets if stats.total_markets > 0 else 0
                
                analysis['bucket_efficiency'][bucket_name] = {
                    'efficiency_score': efficiency,
                    'total_markets': stats.total_markets,
                    'potential_comparisons': stats.kalshi_count * stats.polymarket_count,
                    'avg_confidence': stats.avg_confidence
                }
        
        # Sort buckets by comparison potential
        sorted_buckets = sorted(
            [(name, stats.kalshi_count * stats.polymarket_count, stats) 
             for name, stats in self.bucket_stats.items()],
            key=lambda x: x[1], reverse=True
        )
        
        analysis['top_buckets_by_volume'] = [
            {
                'bucket_name': name,
                'comparison_count': count,
                'kalshi_markets': stats.kalshi_count,
                'polymarket_markets': stats.polymarket_count
            }
            for name, count, stats in sorted_buckets[:10]
        ]
        
        return analysis