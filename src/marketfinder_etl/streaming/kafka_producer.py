"""
Kafka Producer - Real-time streaming of market data and arbitrage opportunities

This module provides high-performance streaming of market updates and arbitrage
opportunities using Apache Kafka for real-time processing and notifications.
"""

import asyncio
import json
from typing import Any, Dict, List, Optional, Union
from datetime import datetime
from decimal import Decimal
import uuid

from aiokafka import AIOKafkaProducer
from pydantic import BaseModel

from marketfinder_etl.core.logging import LoggerMixin
from marketfinder_etl.core.config import settings
from marketfinder_etl.models.market import NormalizedMarket
from marketfinder_etl.models.arbitrage import ArbitrageOpportunity


class KafkaConfig(BaseModel):
    """Kafka producer configuration."""
    bootstrap_servers: str = "localhost:9092"
    security_protocol: str = "PLAINTEXT"
    sasl_mechanism: Optional[str] = None
    sasl_username: Optional[str] = None
    sasl_password: Optional[str] = None
    
    # Producer settings
    acks: str = "1"  # Wait for leader acknowledgment
    retries: int = 3
    max_in_flight_requests: int = 5
    request_timeout_ms: int = 30000
    
    # Batching and compression
    batch_size: int = 16384  # 16KB
    linger_ms: int = 10      # Wait 10ms for batching
    compression_type: str = "gzip"
    
    # Topic settings
    market_updates_topic: str = "market-updates"
    arbitrage_opportunities_topic: str = "arbitrage-opportunities"
    pipeline_metrics_topic: str = "pipeline-metrics"
    alerts_topic: str = "alerts"
    
    # Performance settings
    buffer_memory: int = 33554432  # 32MB
    max_request_size: int = 1048576  # 1MB


class StreamingMessage(BaseModel):
    """Base streaming message format."""
    message_id: str
    timestamp: datetime
    message_type: str
    version: str = "1.0"
    source: str = "marketfinder-etl"


class MarketUpdateMessage(StreamingMessage):
    """Market data update message."""
    message_type: str = "market_update"
    
    # Market identification
    platform: str
    external_id: str
    
    # Update details
    update_type: str  # "new", "price_change", "volume_change", "status_change"
    old_values: Optional[Dict[str, Any]] = None
    new_values: Dict[str, Any]
    
    # Market snapshot
    current_market: Dict[str, Any]


class ArbitrageOpportunityMessage(StreamingMessage):
    """Arbitrage opportunity message."""
    message_type: str = "arbitrage_opportunity"
    
    # Opportunity details
    opportunity_id: str
    action: str  # "detected", "updated", "expired", "executed"
    
    # Market pair info
    market1_platform: str
    market1_id: str
    market1_title: str
    market2_platform: str
    market2_id: str
    market2_title: str
    
    # Opportunity metrics
    expected_profit_usd: float
    expected_profit_percentage: float
    confidence_score: float
    risk_level: str
    priority_score: float
    
    # Timing
    detected_at: datetime
    expires_at: Optional[datetime] = None


class PipelineMetricsMessage(StreamingMessage):
    """Pipeline execution metrics message."""
    message_type: str = "pipeline_metrics"
    
    # Execution details
    execution_id: str
    stage: str
    status: str
    
    # Performance metrics
    input_count: int
    output_count: int
    processing_time_seconds: float
    memory_usage_mb: Optional[float] = None
    
    # Quality metrics
    success_rate: float
    error_count: int


class AlertMessage(StreamingMessage):
    """Alert/notification message."""
    message_type: str = "alert"
    
    # Alert details
    alert_id: str
    alert_type: str  # "high_profit_opportunity", "pipeline_failure", "data_quality_issue"
    severity: str    # "low", "medium", "high", "critical"
    title: str
    description: str
    
    # Context
    related_entity_type: Optional[str] = None  # "market", "opportunity", "pipeline"
    related_entity_id: Optional[str] = None
    
    # Actions
    suggested_actions: List[str] = []
    auto_resolvable: bool = False


class KafkaProducer(LoggerMixin):
    """
    High-performance Kafka Producer for real-time market data streaming.
    
    Streams market updates, arbitrage opportunities, and pipeline metrics
    to Kafka topics for real-time processing and notifications.
    """
    
    def __init__(self, config: Optional[KafkaConfig] = None):
        self.config = config or KafkaConfig()
        self.producer: Optional[AIOKafkaProducer] = None
        self.is_connected = False
        
        # Message tracking
        self.messages_sent = 0
        self.messages_failed = 0
        self.bytes_sent = 0
        
        # Performance tracking
        self.last_send_time: Optional[datetime] = None
        self.avg_send_latency_ms = 0.0
    
    async def start(self) -> None:
        """Start the Kafka producer."""
        
        if self.is_connected:
            return
        
        try:
            # Configure producer
            producer_config = {
                "bootstrap_servers": self.config.bootstrap_servers,
                "security_protocol": self.config.security_protocol,
                "acks": self.config.acks,
                "retries": self.config.retries,
                "max_in_flight_requests_per_connection": self.config.max_in_flight_requests,
                "request_timeout_ms": self.config.request_timeout_ms,
                "batch_size": self.config.batch_size,
                "linger_ms": self.config.linger_ms,
                "compression_type": self.config.compression_type,
                "buffer_memory": self.config.buffer_memory,
                "max_request_size": self.config.max_request_size,
            }
            
            # Add SASL authentication if configured
            if self.config.sasl_mechanism:
                producer_config.update({
                    "sasl_mechanism": self.config.sasl_mechanism,
                    "sasl_plain_username": self.config.sasl_username,
                    "sasl_plain_password": self.config.sasl_password,
                })
            
            # Create and start producer
            self.producer = AIOKafkaProducer(
                **producer_config,
                value_serializer=self._serialize_message
            )
            
            await self.producer.start()
            self.is_connected = True
            
            self.logger.info("Kafka producer started successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to start Kafka producer: {e}")
            raise
    
    async def stop(self) -> None:
        """Stop the Kafka producer."""
        
        if not self.is_connected or not self.producer:
            return
        
        try:
            await self.producer.stop()
            self.is_connected = False
            
            self.logger.info("Kafka producer stopped successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to stop Kafka producer: {e}")
    
    async def send_market_update(
        self,
        market: NormalizedMarket,
        update_type: str,
        old_values: Optional[Dict] = None,
        new_values: Optional[Dict] = None
    ) -> bool:
        """Send market update message."""
        
        message = MarketUpdateMessage(
            message_id=str(uuid.uuid4()),
            timestamp=datetime.utcnow(),
            platform=market.platform.value,
            external_id=market.external_id,
            update_type=update_type,
            old_values=old_values,
            new_values=new_values or {},
            current_market=self._market_to_dict(market)
        )
        
        return await self._send_message(
            self.config.market_updates_topic,
            message,
            key=f"{market.platform.value}:{market.external_id}"
        )
    
    async def send_arbitrage_opportunity(
        self,
        opportunity: ArbitrageOpportunity,
        action: str = "detected"
    ) -> bool:
        """Send arbitrage opportunity message."""
        
        message = ArbitrageOpportunityMessage(
            message_id=str(uuid.uuid4()),
            timestamp=datetime.utcnow(),
            opportunity_id=opportunity.opportunity_id,
            action=action,
            market1_platform="kalshi",  # Assuming based on model
            market1_id=opportunity.market1_id,
            market1_title=opportunity.market1_title,
            market2_platform="polymarket",  # Assuming based on model
            market2_id=opportunity.market2_id,
            market2_title=opportunity.market2_title,
            expected_profit_usd=float(opportunity.metrics.expected_profit_usd),
            expected_profit_percentage=opportunity.metrics.expected_profit_percentage,
            confidence_score=opportunity.llm_confidence,
            risk_level=opportunity.risk_assessment.overall_risk_level.value,
            priority_score=opportunity.priority_score,
            detected_at=opportunity.detected_at,
            expires_at=opportunity.expires_at
        )
        
        return await self._send_message(
            self.config.arbitrage_opportunities_topic,
            message,
            key=opportunity.opportunity_id
        )
    
    async def send_pipeline_metrics(
        self,
        execution_id: str,
        stage: str,
        status: str,
        metrics: Dict[str, Any]
    ) -> bool:
        """Send pipeline metrics message."""
        
        message = PipelineMetricsMessage(
            message_id=str(uuid.uuid4()),
            timestamp=datetime.utcnow(),
            execution_id=execution_id,
            stage=stage,
            status=status,
            input_count=metrics.get("input_count", 0),
            output_count=metrics.get("output_count", 0),
            processing_time_seconds=metrics.get("processing_time_seconds", 0.0),
            memory_usage_mb=metrics.get("memory_usage_mb"),
            success_rate=metrics.get("success_rate", 1.0),
            error_count=metrics.get("error_count", 0)
        )
        
        return await self._send_message(
            self.config.pipeline_metrics_topic,
            message,
            key=execution_id
        )
    
    async def send_alert(
        self,
        alert_type: str,
        severity: str,
        title: str,
        description: str,
        related_entity_type: Optional[str] = None,
        related_entity_id: Optional[str] = None,
        suggested_actions: Optional[List[str]] = None
    ) -> bool:
        """Send alert message."""
        
        message = AlertMessage(
            message_id=str(uuid.uuid4()),
            timestamp=datetime.utcnow(),
            alert_id=str(uuid.uuid4()),
            alert_type=alert_type,
            severity=severity,
            title=title,
            description=description,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            suggested_actions=suggested_actions or [],
            auto_resolvable=False
        )
        
        return await self._send_message(
            self.config.alerts_topic,
            message,
            key=message.alert_id
        )
    
    async def send_high_profit_alert(self, opportunity: ArbitrageOpportunity) -> bool:
        """Send alert for high-profit arbitrage opportunity."""
        
        profit_threshold = 0.1  # 10%
        
        if opportunity.metrics.expected_profit_percentage >= profit_threshold:
            return await self.send_alert(
                alert_type="high_profit_opportunity",
                severity="high",
                title=f"High Profit Arbitrage Detected: {opportunity.metrics.expected_profit_percentage:.1%}",
                description=f"Found arbitrage opportunity between {opportunity.market1_title} and {opportunity.market2_title} with {opportunity.metrics.expected_profit_percentage:.1%} profit potential.",
                related_entity_type="opportunity",
                related_entity_id=opportunity.opportunity_id,
                suggested_actions=[
                    "Review opportunity details",
                    "Check market liquidity",
                    "Assess execution feasibility"
                ]
            )
        
        return False
    
    async def _send_message(
        self,
        topic: str,
        message: StreamingMessage,
        key: Optional[str] = None
    ) -> bool:
        """Send message to Kafka topic."""
        
        if not self.is_connected or not self.producer:
            self.logger.warning("Kafka producer not connected, skipping message")
            return False
        
        start_time = datetime.utcnow()
        
        try:
            # Send message
            future = await self.producer.send(
                topic,
                value=message.dict(),
                key=key.encode() if key else None
            )
            
            # Update metrics
            self.messages_sent += 1
            send_latency = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            # Update average latency
            if self.avg_send_latency_ms == 0:
                self.avg_send_latency_ms = send_latency
            else:
                self.avg_send_latency_ms = (self.avg_send_latency_ms + send_latency) / 2
            
            self.last_send_time = datetime.utcnow()
            
            self.logger.debug(
                f"Message sent to {topic}",
                message_type=message.message_type,
                latency_ms=int(send_latency)
            )
            
            return True
            
        except Exception as e:
            self.messages_failed += 1
            self.logger.error(f"Failed to send message to {topic}: {e}")
            return False
    
    def _serialize_message(self, message: Dict[str, Any]) -> bytes:
        """Serialize message to JSON bytes."""
        
        # Handle Decimal serialization
        def json_serializer(obj):
            if isinstance(obj, Decimal):
                return float(obj)
            elif isinstance(obj, datetime):
                return obj.isoformat()
            raise TypeError(f"Object of type {type(obj)} is not JSON serializable")
        
        json_str = json.dumps(message, default=json_serializer, separators=(',', ':'))
        self.bytes_sent += len(json_str.encode())
        
        return json_str.encode()
    
    def _market_to_dict(self, market: NormalizedMarket) -> Dict[str, Any]:
        """Convert market to dictionary for streaming."""
        
        return {
            "platform": market.platform.value,
            "external_id": market.external_id,
            "title": market.title,
            "category": market.category,
            "volume": float(market.volume),
            "liquidity": float(market.liquidity),
            "outcomes": [
                {
                    "name": outcome.name,
                    "price": float(outcome.price),
                    "volume": float(outcome.volume),
                    "probability": outcome.probability
                }
                for outcome in market.outcomes
            ],
            "end_date": market.end_date.isoformat() if market.end_date else None,
            "status": market.status.value if market.status else None
        }
    
    def get_producer_stats(self) -> Dict[str, Any]:
        """Get producer performance statistics."""
        
        return {
            "is_connected": self.is_connected,
            "messages_sent": self.messages_sent,
            "messages_failed": self.messages_failed,
            "bytes_sent": self.bytes_sent,
            "avg_send_latency_ms": self.avg_send_latency_ms,
            "last_send_time": self.last_send_time.isoformat() if self.last_send_time else None,
            "failure_rate": (
                self.messages_failed / max(1, self.messages_sent + self.messages_failed)
            )
        }
    
    async def flush(self) -> None:
        """Flush any pending messages."""
        if self.producer:
            await self.producer.flush()
    
    # Context manager support
    async def __aenter__(self):
        await self.start()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.stop()