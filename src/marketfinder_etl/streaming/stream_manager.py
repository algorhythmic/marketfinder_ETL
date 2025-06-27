"""
Stream Manager - Coordinates real-time streaming infrastructure

This module manages the complete streaming infrastructure, coordinating
producers, consumers, and stream processing for real-time market analysis.
"""

import asyncio
from typing import Any, Dict, List, Optional, Callable
from datetime import datetime
import uuid

from pydantic import BaseModel

from marketfinder_etl.core.logging import LoggerMixin
from marketfinder_etl.streaming.kafka_producer import KafkaProducer, KafkaConfig
from marketfinder_etl.streaming.kafka_consumer import KafkaConsumer, ConsumerConfig
from marketfinder_etl.models.market import NormalizedMarket
from marketfinder_etl.models.arbitrage import ArbitrageOpportunity


class StreamingConfig(BaseModel):
    """Comprehensive streaming configuration."""
    # Kafka settings
    kafka_config: KafkaConfig = KafkaConfig()
    consumer_config: ConsumerConfig = ConsumerConfig()
    
    # Streaming behavior
    enable_producer: bool = True
    enable_consumer: bool = True
    auto_start_streams: bool = True
    
    # Topics to consume
    consume_topics: List[str] = [
        "market-updates",
        "arbitrage-opportunities", 
        "pipeline-metrics",
        "alerts"
    ]
    
    # Real-time processing
    enable_real_time_alerts: bool = True
    high_profit_threshold: float = 0.1  # 10%
    critical_alert_threshold: float = 0.2  # 20%
    
    # Performance settings
    max_concurrent_handlers: int = 10
    message_batch_size: int = 100
    processing_timeout_seconds: int = 30


class StreamMetrics(BaseModel):
    """Streaming performance metrics."""
    # Producer metrics
    messages_produced: int = 0
    producer_failures: int = 0
    avg_producer_latency_ms: float = 0.0
    
    # Consumer metrics  
    messages_consumed: int = 0
    consumer_failures: int = 0
    avg_processing_latency_ms: float = 0.0
    
    # Real-time processing
    arbitrage_opportunities_detected: int = 0
    high_profit_alerts_sent: int = 0
    pipeline_executions_monitored: int = 0
    
    # System health
    uptime_seconds: float = 0.0
    last_activity: Optional[datetime] = None
    error_rate: float = 0.0


class StreamManager(LoggerMixin):
    """
    Stream Manager for coordinating real-time streaming infrastructure.
    
    Manages producers, consumers, and real-time processing pipelines
    for market data and arbitrage opportunity streaming.
    """
    
    def __init__(self, config: Optional[StreamingConfig] = None):
        self.config = config or StreamingConfig()
        
        # Streaming components
        self.producer: Optional[KafkaProducer] = None
        self.consumer: Optional[KafkaConsumer] = None
        
        # State management
        self.is_running = False
        self.start_time: Optional[datetime] = None
        self.metrics = StreamMetrics()
        
        # Real-time processing
        self.notification_callbacks: List[Callable] = []
        self.processing_tasks: List[asyncio.Task] = []
        
        # Message queues for batch processing
        self.pending_market_updates: List[Dict] = []
        self.pending_opportunities: List[Dict] = []
    
    async def start(self) -> None:
        """Start the streaming infrastructure."""
        
        if self.is_running:
            self.logger.warning("Stream manager already running")
            return
        
        try:
            self.start_time = datetime.utcnow()
            
            # Initialize producer
            if self.config.enable_producer:
                self.producer = KafkaProducer(self.config.kafka_config)
                await self.producer.start()
                self.logger.info("Kafka producer started")
            
            # Initialize consumer
            if self.config.enable_consumer:
                self.consumer = KafkaConsumer(self.config.consumer_config)
                
                # Setup real-time alert callbacks
                if self.config.enable_real_time_alerts:
                    self.consumer.arbitrage_handler.add_notification_callback(
                        self._handle_arbitrage_notification
                    )
                
                await self.consumer.start(self.config.consume_topics)
                self.logger.info(f"Kafka consumer started for topics: {self.config.consume_topics}")
            
            # Start background processing tasks
            if self.config.auto_start_streams:
                await self._start_processing_tasks()
            
            self.is_running = True
            self.logger.info("Stream manager started successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to start stream manager: {e}")
            await self.stop()  # Cleanup on failure
            raise
    
    async def stop(self) -> None:
        """Stop the streaming infrastructure."""
        
        if not self.is_running:
            return
        
        try:
            self.is_running = False
            
            # Stop processing tasks
            for task in self.processing_tasks:
                if not task.done():
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass
            
            self.processing_tasks.clear()
            
            # Stop consumer
            if self.consumer:
                await self.consumer.stop()
                self.consumer = None
                self.logger.info("Kafka consumer stopped")
            
            # Stop producer
            if self.producer:
                await self.producer.stop()
                self.producer = None
                self.logger.info("Kafka producer stopped")
            
            # Update metrics
            if self.start_time:
                self.metrics.uptime_seconds = (
                    datetime.utcnow() - self.start_time
                ).total_seconds()
            
            self.logger.info("Stream manager stopped successfully")
            
        except Exception as e:
            self.logger.error(f"Error stopping stream manager: {e}")
    
    async def _start_processing_tasks(self) -> None:
        """Start background processing tasks."""
        
        # Metrics collection task
        metrics_task = asyncio.create_task(self._collect_metrics_periodically())
        self.processing_tasks.append(metrics_task)
        
        # Batch processing task
        batch_task = asyncio.create_task(self._process_batches_periodically())
        self.processing_tasks.append(batch_task)
        
        self.logger.info("Background processing tasks started")
    
    async def _collect_metrics_periodically(self) -> None:
        """Periodically collect and update metrics."""
        
        while self.is_running:
            try:
                await self._update_metrics()
                await asyncio.sleep(30)  # Update every 30 seconds
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error collecting metrics: {e}")
                await asyncio.sleep(5)
    
    async def _process_batches_periodically(self) -> None:
        """Process message batches periodically."""
        
        while self.is_running:
            try:
                await self._process_pending_batches()
                await asyncio.sleep(5)  # Process every 5 seconds
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error processing batches: {e}")
                await asyncio.sleep(1)
    
    async def _update_metrics(self) -> None:
        """Update streaming metrics."""
        
        if self.start_time:
            self.metrics.uptime_seconds = (
                datetime.utcnow() - self.start_time
            ).total_seconds()
        
        # Update producer metrics
        if self.producer:
            producer_stats = self.producer.get_producer_stats()
            self.metrics.messages_produced = producer_stats["messages_sent"]
            self.metrics.producer_failures = producer_stats["messages_failed"]
            self.metrics.avg_producer_latency_ms = producer_stats["avg_send_latency_ms"]
        
        # Update consumer metrics
        if self.consumer:
            consumer_stats = self.consumer.get_consumer_stats()
            self.metrics.messages_consumed = consumer_stats["messages_processed"]
            self.metrics.consumer_failures = consumer_stats["messages_failed"]
            
            # Update real-time processing metrics
            arbitrage_opportunities = self.consumer.arbitrage_handler.get_active_opportunities()
            self.metrics.arbitrage_opportunities_detected = len(arbitrage_opportunities)
        
        # Calculate error rate
        total_messages = self.metrics.messages_produced + self.metrics.messages_consumed
        total_failures = self.metrics.producer_failures + self.metrics.consumer_failures
        
        if total_messages > 0:
            self.metrics.error_rate = total_failures / total_messages
        
        self.metrics.last_activity = datetime.utcnow()
    
    async def _process_pending_batches(self) -> None:
        """Process pending message batches."""
        
        # Process market updates batch
        if len(self.pending_market_updates) >= self.config.message_batch_size:
            batch = self.pending_market_updates[:self.config.message_batch_size]
            self.pending_market_updates = self.pending_market_updates[self.config.message_batch_size:]
            
            await self._process_market_update_batch(batch)
        
        # Process arbitrage opportunities batch
        if len(self.pending_opportunities) >= self.config.message_batch_size:
            batch = self.pending_opportunities[:self.config.message_batch_size]
            self.pending_opportunities = self.pending_opportunities[self.config.message_batch_size:]
            
            await self._process_opportunity_batch(batch)
    
    async def _process_market_update_batch(self, batch: List[Dict]) -> None:
        """Process batch of market updates."""
        
        # Example: Aggregate market data, detect anomalies, etc.
        self.logger.debug(f"Processing market update batch of {len(batch)} items")
        
        # Could implement:
        # - Price volatility detection
        # - Volume spike detection
        # - Market correlation analysis
        # - Real-time risk assessment
    
    async def _process_opportunity_batch(self, batch: List[Dict]) -> None:
        """Process batch of arbitrage opportunities."""
        
        # Example: Portfolio optimization, risk aggregation, etc.
        self.logger.debug(f"Processing opportunity batch of {len(batch)} items")
        
        # Could implement:
        # - Portfolio risk optimization
        # - Opportunity ranking
        # - Capital allocation strategies
        # - Execution planning
    
    async def _handle_arbitrage_notification(self, notification: Dict) -> None:
        """Handle real-time arbitrage notifications."""
        
        try:
            # Check for high-profit opportunities
            profit_percentage = notification.get("profit_percentage", 0)
            
            if profit_percentage >= self.config.high_profit_threshold:
                self.metrics.high_profit_alerts_sent += 1
                
                # Send critical alert for very high profit
                if profit_percentage >= self.config.critical_alert_threshold:
                    await self._send_critical_alert(notification)
                
                # Notify registered callbacks
                await self._notify_callbacks(notification)
            
        except Exception as e:
            self.logger.error(f"Error handling arbitrage notification: {e}")
    
    async def _send_critical_alert(self, notification: Dict) -> None:
        """Send critical alert for high-profit opportunities."""
        
        if self.producer:
            await self.producer.send_alert(
                alert_type="critical_arbitrage_opportunity",
                severity="critical",
                title=f"Critical Arbitrage: {notification['profit_percentage']:.1%} Profit",
                description=f"Exceptional arbitrage opportunity detected: {notification['market_pair']} with {notification['profit_percentage']:.1%} profit potential (${notification['profit_usd']:.2f})",
                related_entity_type="opportunity",
                related_entity_id=notification["opportunity_id"],
                suggested_actions=[
                    "Immediate review required",
                    "Assess execution feasibility",
                    "Check market liquidity",
                    "Consider position sizing"
                ]
            )
    
    async def _notify_callbacks(self, notification: Dict) -> None:
        """Notify registered callbacks about events."""
        
        for callback in self.notification_callbacks:
            try:
                await callback(notification)
            except Exception as e:
                self.logger.error(f"Notification callback failed: {e}")
    
    # Public streaming methods
    
    async def stream_market_update(
        self,
        market: NormalizedMarket,
        update_type: str,
        old_values: Optional[Dict] = None,
        new_values: Optional[Dict] = None
    ) -> bool:
        """Stream market update."""
        
        if not self.producer:
            return False
        
        return await self.producer.send_market_update(
            market, update_type, old_values, new_values
        )
    
    async def stream_arbitrage_opportunity(
        self,
        opportunity: ArbitrageOpportunity,
        action: str = "detected"
    ) -> bool:
        """Stream arbitrage opportunity."""
        
        if not self.producer:
            return False
        
        success = await self.producer.send_arbitrage_opportunity(opportunity, action)
        
        # Send high-profit alert if applicable
        if success and action == "detected":
            await self.producer.send_high_profit_alert(opportunity)
        
        return success
    
    async def stream_pipeline_metrics(
        self,
        execution_id: str,
        stage: str,
        status: str,
        metrics: Dict[str, Any]
    ) -> bool:
        """Stream pipeline metrics."""
        
        if not self.producer:
            return False
        
        return await self.producer.send_pipeline_metrics(
            execution_id, stage, status, metrics
        )
    
    # Callback management
    
    def add_notification_callback(self, callback: Callable) -> None:
        """Add notification callback."""
        self.notification_callbacks.append(callback)
    
    def remove_notification_callback(self, callback: Callable) -> None:
        """Remove notification callback."""
        if callback in self.notification_callbacks:
            self.notification_callbacks.remove(callback)
    
    # Status and monitoring
    
    def get_stream_status(self) -> Dict[str, Any]:
        """Get current streaming status."""
        
        return {
            "is_running": self.is_running,
            "uptime_seconds": self.metrics.uptime_seconds,
            "producer_connected": self.producer.is_connected if self.producer else False,
            "consumer_running": self.consumer.is_running if self.consumer else False,
            "active_tasks": len([t for t in self.processing_tasks if not t.done()]),
            "metrics": self.metrics.dict(),
            "last_activity": self.metrics.last_activity.isoformat() if self.metrics.last_activity else None
        }
    
    def get_comprehensive_stats(self) -> Dict[str, Any]:
        """Get comprehensive streaming statistics."""
        
        base_stats = self.get_stream_status()
        
        # Add consumer-specific stats if available
        if self.consumer:
            base_stats["consumer_stats"] = self.consumer.get_comprehensive_stats()
        
        # Add producer-specific stats if available
        if self.producer:
            base_stats["producer_stats"] = self.producer.get_producer_stats()
        
        return base_stats
    
    def get_active_opportunities(self) -> List[Dict]:
        """Get currently active arbitrage opportunities."""
        
        if self.consumer and self.consumer.arbitrage_handler:
            return self.consumer.arbitrage_handler.get_active_opportunities()
        
        return []
    
    # Health checks
    
    async def health_check(self) -> Dict[str, Any]:
        """Perform comprehensive health check."""
        
        health_status = {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "components": {}
        }
        
        # Check producer health
        if self.config.enable_producer:
            if self.producer and self.producer.is_connected:
                health_status["components"]["producer"] = "healthy"
            else:
                health_status["components"]["producer"] = "unhealthy"
                health_status["status"] = "degraded"
        
        # Check consumer health
        if self.config.enable_consumer:
            if self.consumer and self.consumer.is_running:
                health_status["components"]["consumer"] = "healthy"
            else:
                health_status["components"]["consumer"] = "unhealthy"
                health_status["status"] = "degraded"
        
        # Check error rate
        if self.metrics.error_rate > 0.1:  # More than 10% errors
            health_status["status"] = "degraded"
            health_status["warning"] = f"High error rate: {self.metrics.error_rate:.1%}"
        
        return health_status
    
    # Context manager support
    async def __aenter__(self):
        await self.start()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.stop()