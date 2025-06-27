"""
Kafka Consumer - Real-time processing of market data streams

This module provides high-performance consumption and processing of market updates
and arbitrage opportunities from Kafka streams for real-time analysis.
"""

import asyncio
import json
from typing import Any, Callable, Dict, List, Optional, Set
from datetime import datetime
import uuid

from aiokafka import AIOKafkaConsumer
from pydantic import BaseModel

from marketfinder_etl.core.logging import LoggerMixin
from marketfinder_etl.streaming.kafka_producer import (
    KafkaConfig, StreamingMessage, MarketUpdateMessage, 
    ArbitrageOpportunityMessage, PipelineMetricsMessage, AlertMessage
)


class ConsumerConfig(BaseModel):
    """Kafka consumer configuration."""
    bootstrap_servers: str = "localhost:9092"
    group_id: str = "marketfinder-consumers"
    
    # Consumer behavior
    auto_offset_reset: str = "latest"  # "earliest" or "latest"
    enable_auto_commit: bool = True
    auto_commit_interval_ms: int = 1000
    max_poll_records: int = 500
    
    # Session and heartbeat
    session_timeout_ms: int = 30000
    heartbeat_interval_ms: int = 10000
    
    # Performance
    fetch_min_bytes: int = 1024
    fetch_max_bytes: int = 52428800  # 50MB
    max_partition_fetch_bytes: int = 1048576  # 1MB
    
    # Security (inherit from producer config)
    security_protocol: str = "PLAINTEXT"
    sasl_mechanism: Optional[str] = None
    sasl_username: Optional[str] = None
    sasl_password: Optional[str] = None


class MessageHandler:
    """Base class for message handlers."""
    
    async def handle_market_update(self, message: MarketUpdateMessage) -> None:
        """Handle market update message."""
        pass
    
    async def handle_arbitrage_opportunity(self, message: ArbitrageOpportunityMessage) -> None:
        """Handle arbitrage opportunity message."""
        pass
    
    async def handle_pipeline_metrics(self, message: PipelineMetricsMessage) -> None:
        """Handle pipeline metrics message."""
        pass
    
    async def handle_alert(self, message: AlertMessage) -> None:
        """Handle alert message."""
        pass


class RealTimeArbitrageHandler(MessageHandler):
    """Handler for real-time arbitrage opportunity processing."""
    
    def __init__(self):
        self.active_opportunities: Dict[str, ArbitrageOpportunityMessage] = {}
        self.high_profit_threshold = 0.1  # 10%
        self.notification_callbacks: List[Callable] = []
    
    async def handle_arbitrage_opportunity(self, message: ArbitrageOpportunityMessage) -> None:
        """Process arbitrage opportunities in real-time."""
        
        opportunity_id = message.opportunity_id
        
        if message.action == "detected":
            # New opportunity detected
            self.active_opportunities[opportunity_id] = message
            
            # Check for high-profit opportunities
            if message.expected_profit_percentage >= self.high_profit_threshold:
                await self._notify_high_profit_opportunity(message)
            
        elif message.action == "updated":
            # Update existing opportunity
            if opportunity_id in self.active_opportunities:
                self.active_opportunities[opportunity_id] = message
        
        elif message.action in ["expired", "executed"]:
            # Remove expired/executed opportunities
            self.active_opportunities.pop(opportunity_id, None)
    
    async def _notify_high_profit_opportunity(self, message: ArbitrageOpportunityMessage) -> None:
        """Notify about high-profit opportunities."""
        
        notification = {
            "type": "high_profit_opportunity",
            "opportunity_id": message.opportunity_id,
            "profit_percentage": message.expected_profit_percentage,
            "profit_usd": message.expected_profit_usd,
            "market_pair": f"{message.market1_title} vs {message.market2_title}",
            "confidence": message.confidence_score,
            "risk_level": message.risk_level,
            "detected_at": message.detected_at,
            "expires_at": message.expires_at
        }
        
        # Send notifications to registered callbacks
        for callback in self.notification_callbacks:
            try:
                await callback(notification)
            except Exception as e:
                print(f"Notification callback failed: {e}")
    
    def add_notification_callback(self, callback: Callable) -> None:
        """Add callback for opportunity notifications."""
        self.notification_callbacks.append(callback)
    
    def get_active_opportunities(self) -> List[Dict]:
        """Get currently active opportunities."""
        return [
            {
                "opportunity_id": msg.opportunity_id,
                "market_pair": f"{msg.market1_title} vs {msg.market2_title}",
                "profit_percentage": msg.expected_profit_percentage,
                "profit_usd": msg.expected_profit_usd,
                "confidence": msg.confidence_score,
                "risk_level": msg.risk_level,
                "detected_at": msg.detected_at,
                "expires_at": msg.expires_at
            }
            for msg in self.active_opportunities.values()
        ]


class MarketDataAggregator(MessageHandler):
    """Handler for aggregating market data updates."""
    
    def __init__(self):
        self.market_data: Dict[str, Dict] = {}
        self.update_counts: Dict[str, int] = {}
        self.last_update_times: Dict[str, datetime] = {}
    
    async def handle_market_update(self, message: MarketUpdateMessage) -> None:
        """Aggregate market data updates."""
        
        market_key = f"{message.platform}:{message.external_id}"
        
        # Update market data
        self.market_data[market_key] = message.current_market
        self.update_counts[market_key] = self.update_counts.get(market_key, 0) + 1
        self.last_update_times[market_key] = message.timestamp
        
        # Log significant price changes
        if message.update_type == "price_change" and message.old_values:
            old_price = message.old_values.get("price", 0)
            new_price = message.new_values.get("price", 0)
            
            if old_price > 0:
                price_change = abs(new_price - old_price) / old_price
                if price_change > 0.05:  # 5% change
                    print(f"Significant price change: {market_key} {price_change:.1%}")
    
    def get_market_summary(self) -> Dict[str, Any]:
        """Get market data summary."""
        
        total_markets = len(self.market_data)
        total_updates = sum(self.update_counts.values())
        avg_updates_per_market = total_updates / max(1, total_markets)
        
        # Recent activity (last hour)
        recent_cutoff = datetime.utcnow().timestamp() - 3600
        recent_updates = sum(
            1 for timestamp in self.last_update_times.values()
            if timestamp.timestamp() > recent_cutoff
        )
        
        return {
            "total_markets": total_markets,
            "total_updates": total_updates,
            "avg_updates_per_market": avg_updates_per_market,
            "recent_updates_last_hour": recent_updates,
            "platforms": list(set(
                market_key.split(":")[0] 
                for market_key in self.market_data.keys()
            ))
        }


class PipelineMonitor(MessageHandler):
    """Handler for monitoring pipeline performance."""
    
    def __init__(self):
        self.execution_metrics: Dict[str, List[PipelineMetricsMessage]] = {}
        self.stage_performance: Dict[str, List[float]] = {}
        self.error_counts: Dict[str, int] = {}
    
    async def handle_pipeline_metrics(self, message: PipelineMetricsMessage) -> None:
        """Monitor pipeline performance metrics."""
        
        execution_id = message.execution_id
        
        # Store metrics by execution
        if execution_id not in self.execution_metrics:
            self.execution_metrics[execution_id] = []
        self.execution_metrics[execution_id].append(message)
        
        # Track stage performance
        stage = message.stage
        if stage not in self.stage_performance:
            self.stage_performance[stage] = []
        self.stage_performance[stage].append(message.processing_time_seconds)
        
        # Track errors
        if message.error_count > 0:
            self.error_counts[stage] = self.error_counts.get(stage, 0) + message.error_count
        
        # Alert on poor performance
        if message.processing_time_seconds > 300:  # 5 minutes
            print(f"Performance alert: {stage} took {message.processing_time_seconds:.1f}s")
        
        if message.success_rate < 0.9:  # Less than 90% success
            print(f"Quality alert: {stage} success rate {message.success_rate:.1%}")
    
    def get_performance_summary(self) -> Dict[str, Any]:
        """Get pipeline performance summary."""
        
        # Calculate average processing times by stage
        avg_stage_times = {
            stage: sum(times) / len(times)
            for stage, times in self.stage_performance.items()
            if times
        }
        
        # Recent executions
        recent_executions = len([
            exec_id for exec_id, metrics in self.execution_metrics.items()
            if metrics and (datetime.utcnow() - metrics[-1].timestamp).total_seconds() < 3600
        ])
        
        return {
            "total_executions": len(self.execution_metrics),
            "recent_executions_last_hour": recent_executions,
            "avg_stage_processing_times": avg_stage_times,
            "total_errors_by_stage": self.error_counts,
            "stages_monitored": list(self.stage_performance.keys())
        }


class AlertProcessor(MessageHandler):
    """Handler for processing alerts and notifications."""
    
    def __init__(self):
        self.alerts: List[AlertMessage] = []
        self.alert_counts_by_type: Dict[str, int] = {}
        self.alert_counts_by_severity: Dict[str, int] = {}
    
    async def handle_alert(self, message: AlertMessage) -> None:
        """Process incoming alerts."""
        
        # Store alert
        self.alerts.append(message)
        
        # Update counters
        self.alert_counts_by_type[message.alert_type] = (
            self.alert_counts_by_type.get(message.alert_type, 0) + 1
        )
        self.alert_counts_by_severity[message.severity] = (
            self.alert_counts_by_severity.get(message.severity, 0) + 1
        )
        
        # Handle critical alerts
        if message.severity == "critical":
            await self._handle_critical_alert(message)
        
        # Log alert
        print(f"Alert: [{message.severity.upper()}] {message.title}")
    
    async def _handle_critical_alert(self, message: AlertMessage) -> None:
        """Handle critical alerts with immediate action."""
        
        # Critical alerts need immediate attention
        critical_notification = {
            "type": "critical_alert",
            "alert_id": message.alert_id,
            "title": message.title,
            "description": message.description,
            "suggested_actions": message.suggested_actions,
            "timestamp": message.timestamp
        }
        
        # In production, this would trigger immediate notifications
        # (email, Slack, PagerDuty, etc.)
        print(f"🚨 CRITICAL ALERT: {message.title}")
        print(f"Description: {message.description}")
        if message.suggested_actions:
            print(f"Suggested actions: {', '.join(message.suggested_actions)}")
    
    def get_alert_summary(self) -> Dict[str, Any]:
        """Get alert summary statistics."""
        
        recent_alerts = [
            alert for alert in self.alerts
            if (datetime.utcnow() - alert.timestamp).total_seconds() < 3600
        ]
        
        return {
            "total_alerts": len(self.alerts),
            "recent_alerts_last_hour": len(recent_alerts),
            "alerts_by_type": self.alert_counts_by_type,
            "alerts_by_severity": self.alert_counts_by_severity,
            "latest_alerts": [
                {
                    "alert_id": alert.alert_id,
                    "type": alert.alert_type,
                    "severity": alert.severity,
                    "title": alert.title,
                    "timestamp": alert.timestamp
                }
                for alert in self.alerts[-10:]  # Last 10 alerts
            ]
        }


class KafkaConsumer(LoggerMixin):
    """
    High-performance Kafka Consumer for real-time stream processing.
    
    Consumes market updates, arbitrage opportunities, and metrics from
    Kafka streams with configurable message handlers.
    """
    
    def __init__(self, config: Optional[ConsumerConfig] = None):
        self.config = config or ConsumerConfig()
        self.consumer: Optional[AIOKafkaConsumer] = None
        self.is_running = False
        
        # Message handlers
        self.handlers: List[MessageHandler] = []
        
        # Built-in handlers
        self.arbitrage_handler = RealTimeArbitrageHandler()
        self.market_aggregator = MarketDataAggregator()
        self.pipeline_monitor = PipelineMonitor()
        self.alert_processor = AlertProcessor()
        
        # Add built-in handlers
        self.add_handler(self.arbitrage_handler)
        self.add_handler(self.market_aggregator)
        self.add_handler(self.pipeline_monitor)
        self.add_handler(self.alert_processor)
        
        # Consumer metrics
        self.messages_processed = 0
        self.messages_failed = 0
        self.last_message_time: Optional[datetime] = None
    
    def add_handler(self, handler: MessageHandler) -> None:
        """Add message handler."""
        self.handlers.append(handler)
    
    async def start(self, topics: List[str]) -> None:
        """Start consuming from specified topics."""
        
        if self.is_running:
            return
        
        try:
            # Configure consumer
            consumer_config = {
                "bootstrap_servers": self.config.bootstrap_servers,
                "group_id": self.config.group_id,
                "auto_offset_reset": self.config.auto_offset_reset,
                "enable_auto_commit": self.config.enable_auto_commit,
                "auto_commit_interval_ms": self.config.auto_commit_interval_ms,
                "max_poll_records": self.config.max_poll_records,
                "session_timeout_ms": self.config.session_timeout_ms,
                "heartbeat_interval_ms": self.config.heartbeat_interval_ms,
                "fetch_min_bytes": self.config.fetch_min_bytes,
                "fetch_max_bytes": self.config.fetch_max_bytes,
                "max_partition_fetch_bytes": self.config.max_partition_fetch_bytes,
            }
            
            # Add SASL authentication if configured
            if self.config.sasl_mechanism:
                consumer_config.update({
                    "security_protocol": self.config.security_protocol,
                    "sasl_mechanism": self.config.sasl_mechanism,
                    "sasl_plain_username": self.config.sasl_username,
                    "sasl_plain_password": self.config.sasl_password,
                })
            
            # Create consumer
            self.consumer = AIOKafkaConsumer(
                *topics,
                **consumer_config,
                value_deserializer=self._deserialize_message
            )
            
            await self.consumer.start()
            self.is_running = True
            
            self.logger.info(f"Kafka consumer started for topics: {topics}")
            
            # Start message processing loop
            asyncio.create_task(self._consume_messages())
            
        except Exception as e:
            self.logger.error(f"Failed to start Kafka consumer: {e}")
            raise
    
    async def stop(self) -> None:
        """Stop the consumer."""
        
        if not self.is_running or not self.consumer:
            return
        
        try:
            self.is_running = False
            await self.consumer.stop()
            
            self.logger.info("Kafka consumer stopped successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to stop Kafka consumer: {e}")
    
    async def _consume_messages(self) -> None:
        """Main message consumption loop."""
        
        while self.is_running and self.consumer:
            try:
                # Get messages
                message_batch = await self.consumer.getmany(timeout_ms=1000)
                
                for topic_partition, messages in message_batch.items():
                    for message in messages:
                        await self._process_message(message)
                
            except Exception as e:
                self.logger.error(f"Error in message consumption loop: {e}")
                await asyncio.sleep(1)  # Brief pause on error
    
    async def _process_message(self, kafka_message) -> None:
        """Process individual message."""
        
        try:
            # Deserialize message
            message_data = kafka_message.value
            message_type = message_data.get("message_type")
            
            # Create appropriate message object
            if message_type == "market_update":
                message = MarketUpdateMessage(**message_data)
            elif message_type == "arbitrage_opportunity":
                message = ArbitrageOpportunityMessage(**message_data)
            elif message_type == "pipeline_metrics":
                message = PipelineMetricsMessage(**message_data)
            elif message_type == "alert":
                message = AlertMessage(**message_data)
            else:
                self.logger.warning(f"Unknown message type: {message_type}")
                return
            
            # Route to appropriate handlers
            for handler in self.handlers:
                try:
                    if isinstance(message, MarketUpdateMessage):
                        await handler.handle_market_update(message)
                    elif isinstance(message, ArbitrageOpportunityMessage):
                        await handler.handle_arbitrage_opportunity(message)
                    elif isinstance(message, PipelineMetricsMessage):
                        await handler.handle_pipeline_metrics(message)
                    elif isinstance(message, AlertMessage):
                        await handler.handle_alert(message)
                        
                except Exception as e:
                    self.logger.error(f"Handler error: {e}")
            
            # Update metrics
            self.messages_processed += 1
            self.last_message_time = datetime.utcnow()
            
        except Exception as e:
            self.messages_failed += 1
            self.logger.error(f"Failed to process message: {e}")
    
    def _deserialize_message(self, message_bytes: bytes) -> Dict[str, Any]:
        """Deserialize message from JSON bytes."""
        
        try:
            return json.loads(message_bytes.decode())
        except Exception as e:
            self.logger.error(f"Failed to deserialize message: {e}")
            return {}
    
    def get_consumer_stats(self) -> Dict[str, Any]:
        """Get consumer performance statistics."""
        
        return {
            "is_running": self.is_running,
            "messages_processed": self.messages_processed,
            "messages_failed": self.messages_failed,
            "last_message_time": (
                self.last_message_time.isoformat() 
                if self.last_message_time else None
            ),
            "failure_rate": (
                self.messages_failed / max(1, self.messages_processed + self.messages_failed)
            ),
            "handlers_count": len(self.handlers)
        }
    
    def get_comprehensive_stats(self) -> Dict[str, Any]:
        """Get comprehensive statistics from all handlers."""
        
        return {
            "consumer": self.get_consumer_stats(),
            "arbitrage": self.arbitrage_handler.get_active_opportunities(),
            "market_data": self.market_aggregator.get_market_summary(),
            "pipeline": self.pipeline_monitor.get_performance_summary(),
            "alerts": self.alert_processor.get_alert_summary()
        }
    
    # Context manager support
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.stop()