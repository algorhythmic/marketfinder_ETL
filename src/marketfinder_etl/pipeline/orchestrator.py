"""
Pipeline Orchestrator - Coordinates the complete ETL pipeline execution

This module orchestrates the execution of all pipeline stages from data extraction
through arbitrage detection, managing the flow between engines and handling errors.
"""

import asyncio
import uuid
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass
from enum import Enum

from pydantic import BaseModel

from marketfinder_etl.core.logging import LoggerMixin
from marketfinder_etl.core.config import settings
from marketfinder_etl.extractors import KalshiExtractor, PolymarketExtractor
from marketfinder_etl.transformers import MarketNormalizer, DataEnricher
from marketfinder_etl.engines import (
    SemanticBucketingEngine,
    HierarchicalFilteringEngine,
    MLScoringEngine,
    LLMEvaluationEngine,
    ArbitrageDetectionEngine
)
from marketfinder_etl.storage import DatabaseManager, CacheManager
from marketfinder_etl.models.market import NormalizedMarket
from marketfinder_etl.models.arbitrage import ArbitrageOpportunity


class PipelineStage(str, Enum):
    """Pipeline execution stages."""
    EXTRACTION = "extraction"
    NORMALIZATION = "normalization"
    ENRICHMENT = "enrichment"
    BUCKETING = "bucketing"
    FILTERING = "filtering"
    ML_SCORING = "ml_scoring"
    LLM_EVALUATION = "llm_evaluation"
    ARBITRAGE_DETECTION = "arbitrage_detection"
    STORAGE = "storage"


class PipelineStatus(str, Enum):
    """Pipeline execution status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class PipelineConfig:
    """Configuration for pipeline execution."""
    # Data extraction limits
    max_kalshi_markets: Optional[int] = None
    max_polymarket_markets: Optional[int] = None
    
    # Processing limits
    max_concurrent_extractions: int = 5
    max_concurrent_normalizations: int = 10
    max_concurrent_enrichments: int = 8
    
    # Quality thresholds
    min_bucket_confidence: float = 0.4
    min_similarity_threshold: float = 0.3
    min_ml_score: float = 0.3
    min_llm_confidence: float = 0.75
    min_arbitrage_profit: float = 0.02
    
    # Pipeline behavior
    enable_caching: bool = True
    enable_parallel_processing: bool = True
    fail_on_stage_error: bool = False
    max_retries: int = 3
    retry_delay_seconds: float = 5.0
    
    # Storage options
    store_intermediate_results: bool = True
    store_metrics: bool = True


class StageMetrics(BaseModel):
    """Metrics for a pipeline stage."""
    stage: PipelineStage
    input_count: int
    output_count: int
    success_count: int
    error_count: int
    processing_time_seconds: float
    memory_usage_mb: Optional[float] = None
    throughput_per_second: float = 0.0
    
    def __post_init__(self):
        if self.processing_time_seconds > 0:
            self.throughput_per_second = self.input_count / self.processing_time_seconds


class PipelineExecution(BaseModel):
    """Complete pipeline execution record."""
    execution_id: str
    status: PipelineStatus
    config: PipelineConfig
    stage_metrics: List[StageMetrics] = []
    
    # Timing
    started_at: datetime
    completed_at: Optional[datetime] = None
    total_duration_seconds: Optional[float] = None
    
    # Results
    total_opportunities_found: int = 0
    total_markets_processed: int = 0
    error_messages: List[str] = []
    
    # Performance
    peak_memory_usage_mb: Optional[float] = None
    cache_hit_rate: Optional[float] = None


class PipelineOrchestrator(LoggerMixin):
    """
    Pipeline Orchestrator for coordinating complete ETL execution.
    
    Manages the end-to-end execution of the market arbitrage detection pipeline,
    coordinating between all engines and handling error recovery.
    """
    
    def __init__(self, config: Optional[PipelineConfig] = None):
        self.config = config or PipelineConfig()
        self.execution_history: List[PipelineExecution] = []
        
        # Initialize components
        self.database_manager = DatabaseManager()
        self.cache_manager = CacheManager()
        self.market_normalizer = MarketNormalizer()
        self.data_enricher = DataEnricher()
        
        # Initialize engines
        self.bucketing_engine = SemanticBucketingEngine()
        self.filtering_engine = HierarchicalFilteringEngine()
        self.ml_scoring_engine = MLScoringEngine()
        self.llm_evaluation_engine = LLMEvaluationEngine()
        self.arbitrage_detection_engine = ArbitrageDetectionEngine()
        
        # State tracking
        self.current_execution: Optional[PipelineExecution] = None
        self.is_running = False
    
    async def execute_pipeline(
        self, 
        execution_id: Optional[str] = None,
        custom_config: Optional[PipelineConfig] = None
    ) -> PipelineExecution:
        """Execute the complete pipeline."""
        
        if self.is_running:
            raise RuntimeError("Pipeline is already running")
        
        # Initialize execution
        execution_id = execution_id or str(uuid.uuid4())
        config = custom_config or self.config
        
        execution = PipelineExecution(
            execution_id=execution_id,
            status=PipelineStatus.RUNNING,
            config=config,
            started_at=datetime.utcnow()
        )
        
        self.current_execution = execution
        self.is_running = True
        
        try:
            self.logger.info(f"Starting pipeline execution: {execution_id}")
            
            # Initialize database and cache
            await self.database_manager.initialize()
            
            # Stage 1: Data Extraction
            raw_markets = await self._execute_stage_with_metrics(
                PipelineStage.EXTRACTION,
                self._extract_market_data,
                execution
            )
            
            # Stage 2: Data Normalization
            normalized_markets = await self._execute_stage_with_metrics(
                PipelineStage.NORMALIZATION,
                self._normalize_market_data,
                execution,
                raw_markets
            )
            
            # Stage 3: Data Enrichment
            enriched_markets = await self._execute_stage_with_metrics(
                PipelineStage.ENRICHMENT,
                self._enrich_market_data,
                execution,
                normalized_markets
            )
            
            # Stage 4: Semantic Bucketing
            bucket_pairs = await self._execute_stage_with_metrics(
                PipelineStage.BUCKETING,
                self._execute_bucketing,
                execution,
                [em.market for em in enriched_markets]
            )
            
            # Stage 5: Hierarchical Filtering
            filtered_pairs = await self._execute_stage_with_metrics(
                PipelineStage.FILTERING,
                self._execute_filtering,
                execution,
                bucket_pairs
            )
            
            # Stage 6: ML Scoring
            ml_scored_pairs = await self._execute_stage_with_metrics(
                PipelineStage.ML_SCORING,
                self._execute_ml_scoring,
                execution,
                filtered_pairs
            )
            
            # Stage 7: LLM Evaluation
            llm_evaluated_pairs = await self._execute_stage_with_metrics(
                PipelineStage.LLM_EVALUATION,
                self._execute_llm_evaluation,
                execution,
                ml_scored_pairs
            )
            
            # Stage 8: Arbitrage Detection
            arbitrage_opportunities = await self._execute_stage_with_metrics(
                PipelineStage.ARBITRAGE_DETECTION,
                self._execute_arbitrage_detection,
                execution,
                llm_evaluated_pairs
            )
            
            # Stage 9: Storage
            await self._execute_stage_with_metrics(
                PipelineStage.STORAGE,
                self._store_results,
                execution,
                {
                    'normalized_markets': normalized_markets,
                    'enriched_markets': enriched_markets,
                    'opportunities': arbitrage_opportunities
                }
            )
            
            # Complete execution
            execution.status = PipelineStatus.COMPLETED
            execution.completed_at = datetime.utcnow()
            execution.total_duration_seconds = (
                execution.completed_at - execution.started_at
            ).total_seconds()
            execution.total_opportunities_found = len(arbitrage_opportunities)
            execution.total_markets_processed = len(normalized_markets)
            
            # Capture performance metrics
            cache_metrics = self.cache_manager.get_metrics()
            execution.cache_hit_rate = cache_metrics.hit_rate
            
            self.logger.info(
                f"Pipeline execution completed successfully",
                execution_id=execution_id,
                duration_seconds=execution.total_duration_seconds,
                opportunities_found=execution.total_opportunities_found,
                markets_processed=execution.total_markets_processed
            )
            
            return execution
            
        except Exception as e:
            execution.status = PipelineStatus.FAILED
            execution.completed_at = datetime.utcnow()
            execution.error_messages.append(str(e))
            
            self.logger.error(f"Pipeline execution failed: {e}", execution_id=execution_id)
            
            if self.config.fail_on_stage_error:
                raise
            
            return execution
            
        finally:
            self.is_running = False
            self.execution_history.append(execution)
            self.current_execution = None
    
    async def _execute_stage_with_metrics(
        self,
        stage: PipelineStage,
        stage_func,
        execution: PipelineExecution,
        *args
    ) -> Any:
        """Execute a pipeline stage with metrics collection."""
        
        start_time = datetime.utcnow()
        input_count = len(args[0]) if args and hasattr(args[0], '__len__') else 0
        
        self.logger.info(f"Starting stage: {stage.value}", input_count=input_count)
        
        try:
            result = await stage_func(*args)
            
            # Calculate metrics
            end_time = datetime.utcnow()
            processing_time = (end_time - start_time).total_seconds()
            output_count = len(result) if hasattr(result, '__len__') else 0
            
            metrics = StageMetrics(
                stage=stage,
                input_count=input_count,
                output_count=output_count,
                success_count=output_count,
                error_count=0,
                processing_time_seconds=processing_time
            )
            
            execution.stage_metrics.append(metrics)
            
            self.logger.info(
                f"Stage completed: {stage.value}",
                input_count=input_count,
                output_count=output_count,
                processing_time_seconds=processing_time
            )
            
            return result
            
        except Exception as e:
            # Record failed stage metrics
            end_time = datetime.utcnow()
            processing_time = (end_time - start_time).total_seconds()
            
            metrics = StageMetrics(
                stage=stage,
                input_count=input_count,
                output_count=0,
                success_count=0,
                error_count=1,
                processing_time_seconds=processing_time
            )
            
            execution.stage_metrics.append(metrics)
            execution.error_messages.append(f"{stage.value}: {str(e)}")
            
            self.logger.error(f"Stage failed: {stage.value}", error=str(e))
            
            if self.config.fail_on_stage_error:
                raise
            
            return []
    
    async def _extract_market_data(self) -> List[Dict]:
        """Extract raw market data from all platforms."""
        
        extractors = []
        
        # Initialize extractors
        if not self.config.max_kalshi_markets or self.config.max_kalshi_markets > 0:
            extractors.append(
                KalshiExtractor().extract_markets(
                    max_markets=self.config.max_kalshi_markets
                )
            )
        
        if not self.config.max_polymarket_markets or self.config.max_polymarket_markets > 0:
            extractors.append(
                PolymarketExtractor().extract_markets(
                    max_markets=self.config.max_polymarket_markets
                )
            )
        
        # Execute extractions in parallel
        results = await asyncio.gather(*extractors, return_exceptions=True)
        
        # Combine results
        raw_markets = []
        for result in results:
            if isinstance(result, list):
                raw_markets.extend(result)
            elif not isinstance(result, Exception):
                raw_markets.append(result)
        
        return raw_markets
    
    async def _normalize_market_data(self, raw_markets: List[Dict]) -> List[NormalizedMarket]:
        """Normalize raw market data."""
        
        normalized_markets = []
        
        if self.config.enable_parallel_processing:
            # Process in batches for memory efficiency
            batch_size = self.config.max_concurrent_normalizations
            
            for i in range(0, len(raw_markets), batch_size):
                batch = raw_markets[i:i + batch_size]
                
                tasks = [
                    self.market_normalizer.normalize_market_data(market)
                    for market in batch
                ]
                
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                for result in results:
                    if isinstance(result, NormalizedMarket):
                        normalized_markets.append(result)
        else:
            # Sequential processing
            for market in raw_markets:
                try:
                    normalized = await self.market_normalizer.normalize_market_data(market)
                    if normalized:
                        normalized_markets.append(normalized)
                except Exception as e:
                    self.logger.warning(f"Failed to normalize market: {e}")
        
        return normalized_markets
    
    async def _enrich_market_data(self, normalized_markets: List[NormalizedMarket]) -> List:
        """Enrich normalized market data."""
        return await self.data_enricher.enrich_markets_batch(normalized_markets)
    
    async def _execute_bucketing(self, normalized_markets: List[NormalizedMarket]) -> List:
        """Execute semantic bucketing."""
        return self.bucketing_engine.bucket_markets(normalized_markets)
    
    async def _execute_filtering(self, bucket_pairs: List) -> List:
        """Execute hierarchical filtering."""
        filtered_pairs = []
        
        for bucket_pair in bucket_pairs:
            # Get markets for this bucket
            bucket_markets = []  # Would get from bucket_pair
            
            # Apply filtering
            pairs = await self.filtering_engine.filter_bucket_pairs(
                bucket_pair.bucket_name,
                bucket_markets
            )
            
            filtered_pairs.extend(pairs)
        
        return filtered_pairs
    
    async def _execute_ml_scoring(self, filtered_pairs: List) -> List:
        """Execute ML scoring."""
        ml_predictions = []
        
        for pair in filtered_pairs:
            try:
                prediction = await self.ml_scoring_engine.score_market_pair(pair)
                if prediction.llm_worthiness_score >= self.config.min_ml_score:
                    ml_predictions.append((pair, prediction))
            except Exception as e:
                self.logger.warning(f"ML scoring failed for pair: {e}")
        
        return ml_predictions
    
    async def _execute_llm_evaluation(self, ml_scored_pairs: List) -> List:
        """Execute LLM evaluation."""
        return await self.llm_evaluation_engine.evaluate_market_pairs_batch(
            ml_scored_pairs
        )
    
    async def _execute_arbitrage_detection(self, llm_evaluated_pairs: List) -> List[ArbitrageOpportunity]:
        """Execute arbitrage detection."""
        return await self.arbitrage_detection_engine.detect_arbitrage_opportunities(
            llm_evaluated_pairs
        )
    
    async def _store_results(self, results: Dict) -> None:
        """Store all pipeline results."""
        
        # Store normalized markets
        if results.get('normalized_markets'):
            await self.database_manager.store_normalized_markets(
                results['normalized_markets']
            )
        
        # Store arbitrage opportunities
        if results.get('opportunities'):
            await self.database_manager.store_arbitrage_opportunities(
                results['opportunities']
            )
    
    def get_execution_status(self) -> Optional[Dict[str, Any]]:
        """Get current execution status."""
        if not self.current_execution:
            return None
        
        return {
            "execution_id": self.current_execution.execution_id,
            "status": self.current_execution.status.value,
            "started_at": self.current_execution.started_at.isoformat(),
            "current_stage": (
                self.current_execution.stage_metrics[-1].stage.value
                if self.current_execution.stage_metrics else "starting"
            ),
            "stages_completed": len(self.current_execution.stage_metrics),
            "total_stages": len(PipelineStage),
            "is_running": self.is_running
        }
    
    def get_execution_history(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent execution history."""
        
        recent_executions = sorted(
            self.execution_history,
            key=lambda x: x.started_at,
            reverse=True
        )[:limit]
        
        return [
            {
                "execution_id": exec.execution_id,
                "status": exec.status.value,
                "started_at": exec.started_at.isoformat(),
                "completed_at": exec.completed_at.isoformat() if exec.completed_at else None,
                "duration_seconds": exec.total_duration_seconds,
                "opportunities_found": exec.total_opportunities_found,
                "markets_processed": exec.total_markets_processed,
                "error_count": len(exec.error_messages)
            }
            for exec in recent_executions
        ]
    
    async def cancel_execution(self) -> bool:
        """Cancel current pipeline execution."""
        if not self.is_running or not self.current_execution:
            return False
        
        self.current_execution.status = PipelineStatus.CANCELLED
        self.current_execution.completed_at = datetime.utcnow()
        self.is_running = False
        
        self.logger.info(f"Pipeline execution cancelled: {self.current_execution.execution_id}")
        return True
    
    async def cleanup(self) -> None:
        """Cleanup resources."""
        await self.database_manager.close()
        await self.cache_manager.clear()
        
        self.logger.info("Pipeline orchestrator cleanup completed")