"""Pipeline configuration and processing models."""

from typing import Any, Dict, List, Optional, Union
from datetime import datetime, timedelta
from enum import Enum
from decimal import Decimal

from pydantic import Field, validator

from marketfinder_etl.models.base import BaseModel, TimestampedModel, MetadataModel
from marketfinder_etl.models.market import MarketPlatform


class PipelineStage(str, Enum):
    """ETL pipeline processing stages."""
    EXTRACTION = "extraction"
    TRANSFORMATION = "transformation" 
    BUCKETING = "bucketing"
    FILTERING = "filtering"
    ML_SCORING = "ml_scoring"
    LLM_EVALUATION = "llm_evaluation"
    ARBITRAGE_DETECTION = "arbitrage_detection"
    LOADING = "loading"


class PipelineStatus(str, Enum):
    """Pipeline execution status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ProcessingMode(str, Enum):
    """Pipeline processing modes."""
    FULL = "full"          # Process all markets
    INCREMENTAL = "incremental"  # Process only new/updated markets
    BUCKET = "bucket"      # Process specific semantic bucket
    TESTING = "testing"    # Testing mode with limited data


class PipelineConfig(BaseModel):
    """Configuration for ETL pipeline execution."""
    
    # Execution settings
    mode: ProcessingMode = Field(default=ProcessingMode.INCREMENTAL, description="Processing mode")
    dry_run: bool = Field(default=False, description="Run in dry-run mode without persisting data")
    force_refresh: bool = Field(default=False, description="Force refresh of cached data")
    
    # Data source settings
    enabled_platforms: List[MarketPlatform] = Field(
        default_factory=lambda: list(MarketPlatform), 
        description="Platforms to process"
    )
    max_markets_per_platform: Optional[int] = Field(None, description="Limit markets per platform")
    
    # Processing settings
    enable_parallel_processing: bool = Field(True, description="Enable parallel processing")
    max_concurrent_requests: int = Field(10, description="Max concurrent API requests")
    batch_size: int = Field(1000, description="Batch size for processing")
    
    # Semantic bucketing
    enable_semantic_bucketing: bool = Field(True, description="Enable semantic bucketing")
    bucket_confidence_threshold: float = Field(0.6, description="Minimum bucket confidence")
    
    # Hierarchical filtering
    enable_hierarchical_filtering: bool = Field(True, description="Enable hierarchical filtering")
    min_volume_threshold: Decimal = Field(Decimal("100"), description="Minimum volume threshold")
    min_price_range: float = Field(0.05, description="Minimum price range (0.05-0.95)")
    max_price_range: float = Field(0.95, description="Maximum price range (0.05-0.95)")
    
    # ML scoring
    enable_ml_scoring: bool = Field(True, description="Enable ML scoring")
    ml_model_version: str = Field("1.0", description="ML model version to use")
    ml_threshold: float = Field(0.3, description="ML score threshold for LLM evaluation")
    
    # LLM evaluation
    enable_llm_evaluation: bool = Field(True, description="Enable LLM evaluation")
    llm_provider: str = Field("openai", description="LLM provider (openai, anthropic, vertex)")
    llm_model: str = Field("gpt-4", description="LLM model to use")
    max_llm_calls_per_minute: int = Field(60, description="LLM rate limit")
    llm_batch_size: int = Field(20, description="LLM evaluation batch size")
    
    # Arbitrage detection
    enable_arbitrage_detection: bool = Field(True, description="Enable arbitrage detection")
    min_profit_margin: Decimal = Field(Decimal("0.02"), description="Minimum profit margin (2%)")
    min_confidence: float = Field(0.7, description="Minimum confidence for opportunities")
    
    # Output settings
    max_opportunities: int = Field(50, description="Maximum opportunities to return")
    save_intermediate_results: bool = Field(True, description="Save intermediate processing results")
    
    @validator("bucket_confidence_threshold", "ml_threshold", "min_confidence")
    def validate_thresholds(cls, v: float) -> float:
        """Validate threshold values are between 0 and 1."""
        if not (0 <= v <= 1):
            raise ValueError("Threshold must be between 0 and 1")
        return v


class ProcessingStats(BaseModel):
    """Statistics for pipeline processing stage."""
    
    stage: PipelineStage = Field(..., description="Processing stage")
    
    # Timing
    started_at: datetime = Field(default_factory=datetime.utcnow, description="Stage start time")
    completed_at: Optional[datetime] = Field(None, description="Stage completion time")
    duration_seconds: Optional[float] = Field(None, description="Stage duration in seconds")
    
    # Counts
    input_count: int = Field(0, description="Number of input items")
    output_count: int = Field(0, description="Number of output items")
    filtered_count: int = Field(0, description="Number of items filtered out")
    error_count: int = Field(0, description="Number of errors")
    
    # Performance
    throughput_per_second: Optional[float] = Field(None, description="Items processed per second")
    memory_usage_mb: Optional[float] = Field(None, description="Peak memory usage in MB")
    
    # Status
    status: PipelineStatus = Field(default=PipelineStatus.PENDING, description="Stage status")
    error_message: Optional[str] = Field(None, description="Error message if failed")
    
    def mark_started(self) -> None:
        """Mark stage as started."""
        self.started_at = datetime.utcnow()
        self.status = PipelineStatus.RUNNING
    
    def mark_completed(self) -> None:
        """Mark stage as completed and calculate duration."""
        self.completed_at = datetime.utcnow()
        self.status = PipelineStatus.COMPLETED
        self.duration_seconds = (self.completed_at - self.started_at).total_seconds()
        
        if self.duration_seconds > 0:
            self.throughput_per_second = self.output_count / self.duration_seconds
    
    def mark_failed(self, error_message: str) -> None:
        """Mark stage as failed."""
        self.completed_at = datetime.utcnow()
        self.status = PipelineStatus.FAILED
        self.error_message = error_message
        self.duration_seconds = (self.completed_at - self.started_at).total_seconds()


class BucketPair(BaseModel):
    """Semantic bucket pair for processing."""
    
    bucket_name: str = Field(..., description="Semantic bucket name")
    kalshi_count: int = Field(..., description="Number of Kalshi markets in bucket")
    polymarket_count: int = Field(..., description="Number of Polymarket markets in bucket")
    comparison_count: int = Field(..., description="Total potential comparisons")
    
    # Processing stats
    processed_count: int = Field(0, description="Number of comparisons processed")
    filtered_count: int = Field(0, description="Number of comparisons filtered out")
    ml_scored_count: int = Field(0, description="Number of comparisons ML scored")
    llm_evaluated_count: int = Field(0, description="Number of comparisons LLM evaluated")
    opportunities_found: int = Field(0, description="Number of opportunities found")
    
    # Timing
    last_processed: Optional[datetime] = Field(None, description="Last processing timestamp")
    avg_processing_time: Optional[float] = Field(None, description="Average processing time per comparison")
    
    @property
    def reduction_ratio(self) -> float:
        """Calculate reduction ratio from initial to final count."""
        if self.comparison_count == 0:
            return 0.0
        return 1.0 - (self.opportunities_found / self.comparison_count)
    
    @property
    def efficiency_score(self) -> float:
        """Calculate efficiency score based on opportunities found vs processed."""
        if self.processed_count == 0:
            return 0.0
        return self.opportunities_found / self.processed_count


class SyncLog(TimestampedModel):
    """Log entry for ETL pipeline synchronization."""
    
    # Execution info
    sync_id: str = Field(..., description="Unique sync execution ID")
    config: PipelineConfig = Field(..., description="Pipeline configuration used")
    
    # Overall results
    status: PipelineStatus = Field(..., description="Overall sync status")
    started_at: datetime = Field(default_factory=datetime.utcnow, description="Sync start time")
    completed_at: Optional[datetime] = Field(None, description="Sync completion time")
    duration_seconds: Optional[float] = Field(None, description="Total sync duration")
    
    # Processing statistics
    stage_stats: List[ProcessingStats] = Field(default_factory=list, description="Per-stage statistics")
    bucket_stats: List[BucketPair] = Field(default_factory=list, description="Per-bucket statistics")
    
    # Data counts
    markets_extracted: int = Field(0, description="Total markets extracted")
    markets_processed: int = Field(0, description="Total markets processed")
    similarities_found: int = Field(0, description="Total similarities found")
    opportunities_found: int = Field(0, description="Total opportunities found")
    
    # Quality metrics
    data_quality_score: Optional[float] = Field(None, description="Overall data quality score")
    processing_efficiency: Optional[float] = Field(None, description="Processing efficiency score")
    
    # Costs
    llm_calls_made: int = Field(0, description="Number of LLM API calls")
    estimated_cost_usd: Optional[Decimal] = Field(None, description="Estimated cost in USD")
    
    # Errors
    errors: List[str] = Field(default_factory=list, description="Error messages")
    warnings: List[str] = Field(default_factory=list, description="Warning messages")
    
    def add_stage_stats(self, stats: ProcessingStats) -> None:
        """Add statistics for a processing stage."""
        self.stage_stats.append(stats)
    
    def add_bucket_stats(self, bucket: BucketPair) -> None:
        """Add statistics for a semantic bucket."""
        self.bucket_stats.append(bucket)
    
    def mark_completed(self) -> None:
        """Mark sync as completed."""
        self.completed_at = datetime.utcnow()
        self.status = PipelineStatus.COMPLETED
        self.duration_seconds = (self.completed_at - self.started_at).total_seconds()
        
        # Calculate processing efficiency
        if self.markets_extracted > 0:
            self.processing_efficiency = self.opportunities_found / self.markets_extracted
    
    def mark_failed(self, error_message: str) -> None:
        """Mark sync as failed."""
        self.completed_at = datetime.utcnow()
        self.status = PipelineStatus.FAILED
        self.errors.append(error_message)
        self.duration_seconds = (self.completed_at - self.started_at).total_seconds()
    
    @property
    def success_rate(self) -> float:
        """Calculate overall success rate."""
        if not self.stage_stats:
            return 0.0
        
        successful_stages = sum(1 for stat in self.stage_stats if stat.status == PipelineStatus.COMPLETED)
        return successful_stages / len(self.stage_stats)
    
    @property
    def total_reduction_ratio(self) -> float:
        """Calculate total reduction ratio from markets to opportunities."""
        if self.markets_extracted == 0:
            return 0.0
        return 1.0 - (self.opportunities_found / self.markets_extracted)