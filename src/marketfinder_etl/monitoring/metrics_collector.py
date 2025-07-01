"""
Metrics Collector - Comprehensive system monitoring and metrics collection

This module provides advanced monitoring capabilities with Prometheus metrics,
health checks, performance tracking, and automated alerting.
"""

import asyncio
import time
import psutil
import threading
from typing import Any, Dict, List, Optional, Callable
from datetime import datetime, timedelta
from decimal import Decimal
from dataclasses import dataclass
from enum import Enum

from prometheus_client import (
    Counter, Histogram, Gauge, Summary, Info, 
    CollectorRegistry, generate_latest, CONTENT_TYPE_LATEST
)
from pydantic import BaseModel

from marketfinder_etl.core.logging import LoggerMixin


class MetricType(str, Enum):
    """Types of metrics to collect."""
    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    SUMMARY = "summary"
    INFO = "info"


class AlertSeverity(str, Enum):
    """Alert severity levels."""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class MetricDefinition:
    """Definition for a custom metric."""
    name: str
    metric_type: MetricType
    description: str
    labels: List[str] = None
    buckets: List[float] = None  # For histograms
    
    def __post_init__(self):
        if self.labels is None:
            self.labels = []


@dataclass
class AlertRule:
    """Alert rule configuration."""
    name: str
    description: str
    metric_name: str
    condition: str  # e.g., "> 0.8", "< 100", "== 0"
    threshold: float
    severity: AlertSeverity
    duration_seconds: int = 60  # How long condition must be true
    cooldown_seconds: int = 300  # Minimum time between alerts
    labels: Dict[str, str] = None
    
    def __post_init__(self):
        if self.labels is None:
            self.labels = {}


class SystemMetrics(BaseModel):
    """System resource metrics."""
    cpu_usage_percent: float
    memory_usage_percent: float
    memory_available_gb: float
    disk_usage_percent: float
    disk_free_gb: float
    network_bytes_sent: int
    network_bytes_recv: int
    load_average_1m: float
    open_file_descriptors: int
    timestamp: datetime


class ApplicationMetrics(BaseModel):
    """Application-specific metrics."""
    # Pipeline metrics
    pipeline_executions_total: int
    pipeline_failures_total: int
    pipeline_duration_seconds: float
    
    # Processing metrics
    markets_processed_total: int
    opportunities_detected_total: int
    ml_predictions_total: int
    llm_evaluations_total: int
    
    # Performance metrics
    avg_processing_latency_ms: float
    cache_hit_rate: float
    database_connections_active: int
    
    # Business metrics
    total_profit_potential_usd: float
    high_confidence_opportunities: int
    active_arbitrage_pairs: int
    
    timestamp: datetime


class AlertEvent(BaseModel):
    """Alert event details."""
    alert_id: str
    rule_name: str
    severity: AlertSeverity
    metric_name: str
    current_value: float
    threshold: float
    message: str
    labels: Dict[str, str]
    triggered_at: datetime
    resolved_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None


class MetricsCollector(LoggerMixin):
    """
    Comprehensive Metrics Collector for system and application monitoring.
    
    Provides Prometheus-compatible metrics, health checks, and automated
    alerting with configurable rules and thresholds.
    """
    
    def __init__(self):
        # Prometheus registry
        self.registry = CollectorRegistry()
        
        # System metrics
        self.system_metrics: Optional[SystemMetrics] = None
        self.app_metrics: Optional[ApplicationMetrics] = None
        
        # Prometheus metrics
        self._initialize_prometheus_metrics()
        
        # Alert management
        self.alert_rules: List[AlertRule] = []
        self.active_alerts: Dict[str, AlertEvent] = {}
        self.alert_history: List[AlertEvent] = []
        self.alert_callbacks: List[Callable] = []
        
        # Collection state
        self.is_collecting = False
        self.collection_interval = 15  # seconds
        self.collection_task: Optional[asyncio.Task] = None
        
        # Performance tracking
        self.metrics_collected = 0
        self.collection_errors = 0
        self.last_collection_time: Optional[datetime] = None
        
        # Initialize default alert rules
        self._initialize_default_alert_rules()
    
    def _initialize_prometheus_metrics(self) -> None:
        """Initialize Prometheus metrics."""
        
        # System metrics
        self.cpu_usage = Gauge(
            'system_cpu_usage_percent',
            'CPU usage percentage',
            registry=self.registry
        )
        
        self.memory_usage = Gauge(
            'system_memory_usage_percent',
            'Memory usage percentage',
            registry=self.registry
        )
        
        self.disk_usage = Gauge(
            'system_disk_usage_percent',
            'Disk usage percentage',
            registry=self.registry
        )
        
        # Application metrics
        self.pipeline_executions = Counter(
            'pipeline_executions_total',
            'Total pipeline executions',
            ['status'],
            registry=self.registry
        )
        
        self.processing_duration = Histogram(
            'pipeline_processing_duration_seconds',
            'Pipeline processing duration',
            ['stage'],
            registry=self.registry
        )
        
        self.cache_hits = Counter(
            'cache_hits_total',
            'Total cache hits',
            ['cache_type'],
            registry=self.registry
        )
        
        self.cache_misses = Counter(
            'cache_misses_total', 
            'Total cache misses',
            ['cache_type'],
            registry=self.registry
        )
        
        self.arbitrage_opportunities = Gauge(
            'arbitrage_opportunities_active',
            'Active arbitrage opportunities',
            ['risk_level'],
            registry=self.registry
        )
        
        self.profit_potential = Gauge(
            'total_profit_potential_usd',
            'Total profit potential in USD',
            registry=self.registry
        )
        
        # ML/LLM metrics
        self.ml_predictions = Counter(
            'ml_predictions_total',
            'Total ML predictions',
            ['model_type', 'confidence_level'],
            registry=self.registry
        )
        
        self.llm_evaluations = Counter(
            'llm_evaluations_total',
            'Total LLM evaluations',
            ['provider', 'model'],
            registry=self.registry
        )
        
        self.llm_costs = Counter(
            'llm_costs_usd_total',
            'Total LLM costs in USD',
            ['provider', 'model'],
            registry=self.registry
        )
        
        # Error metrics
        self.errors_total = Counter(
            'errors_total',
            'Total errors',
            ['component', 'error_type'],
            registry=self.registry
        )
        
        # Database metrics
        self.db_connections = Gauge(
            'database_connections_active',
            'Active database connections',
            ['database_type'],
            registry=self.registry
        )
        
        self.db_query_duration = Histogram(
            'database_query_duration_seconds',
            'Database query duration',
            ['operation'],
            registry=self.registry
        )
    
    def _initialize_default_alert_rules(self) -> None:
        """Initialize default alert rules."""
        
        default_rules = [
            # System alerts
            AlertRule(
                name="high_cpu_usage",
                description="CPU usage is critically high",
                metric_name="system_cpu_usage_percent",
                condition=">",
                threshold=90.0,
                severity=AlertSeverity.CRITICAL,
                duration_seconds=120
            ),
            
            AlertRule(
                name="high_memory_usage",
                description="Memory usage is high",
                metric_name="system_memory_usage_percent", 
                condition=">",
                threshold=85.0,
                severity=AlertSeverity.WARNING,
                duration_seconds=180
            ),
            
            AlertRule(
                name="low_disk_space",
                description="Disk space is running low",
                metric_name="system_disk_usage_percent",
                condition=">",
                threshold=90.0,
                severity=AlertSeverity.ERROR,
                duration_seconds=300
            ),
            
            # Application alerts
            AlertRule(
                name="pipeline_failures",
                description="High pipeline failure rate",
                metric_name="pipeline_failure_rate",
                condition=">",
                threshold=0.1,  # 10% failure rate
                severity=AlertSeverity.ERROR,
                duration_seconds=300
            ),
            
            AlertRule(
                name="low_cache_hit_rate",
                description="Cache hit rate is low",
                metric_name="cache_hit_rate",
                condition="<",
                threshold=0.7,  # 70% hit rate
                severity=AlertSeverity.WARNING,
                duration_seconds=600
            ),
            
            AlertRule(
                name="high_processing_latency",
                description="Processing latency is high",
                metric_name="avg_processing_latency_ms",
                condition=">",
                threshold=5000.0,  # 5 seconds
                severity=AlertSeverity.WARNING,
                duration_seconds=300
            ),
            
            # Business alerts
            AlertRule(
                name="no_opportunities_detected",
                description="No arbitrage opportunities detected",
                metric_name="opportunities_detected_total",
                condition="==",
                threshold=0.0,
                severity=AlertSeverity.WARNING,
                duration_seconds=1800  # 30 minutes
            ),
        ]
        
        for rule in default_rules:
            self.add_alert_rule(rule)
    
    async def start_collection(self) -> None:
        """Start metrics collection."""
        
        if self.is_collecting:
            return
        
        self.is_collecting = True
        self.collection_task = asyncio.create_task(self._collection_loop())
        
        self.logger.info("Metrics collection started")
    
    async def stop_collection(self) -> None:
        """Stop metrics collection."""
        
        if not self.is_collecting:
            return
        
        self.is_collecting = False
        
        if self.collection_task and not self.collection_task.done():
            self.collection_task.cancel()
            try:
                await self.collection_task
            except asyncio.CancelledError:
                pass
        
        self.logger.info("Metrics collection stopped")
    
    async def _collection_loop(self) -> None:
        """Main metrics collection loop."""
        
        while self.is_collecting:
            try:
                start_time = time.time()
                
                # Collect system metrics
                await self._collect_system_metrics()
                
                # Collect application metrics
                await self._collect_application_metrics()
                
                # Update Prometheus metrics
                self._update_prometheus_metrics()
                
                # Check alert rules
                await self._check_alert_rules()
                
                # Update collection stats
                self.metrics_collected += 1
                self.last_collection_time = datetime.utcnow()
                
                collection_duration = time.time() - start_time
                self.logger.debug(f"Metrics collection completed in {collection_duration:.2f}s")
                
                # Wait for next collection
                await asyncio.sleep(self.collection_interval)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.collection_errors += 1
                self.logger.error(f"Error in metrics collection: {e}")
                await asyncio.sleep(5)  # Brief pause on error
    
    async def _collect_system_metrics(self) -> None:
        """Collect system resource metrics."""
        
        try:
            # CPU usage
            cpu_percent = psutil.cpu_percent(interval=1)
            
            # Memory usage
            memory = psutil.virtual_memory()
            memory_percent = memory.percent
            memory_available_gb = memory.available / (1024**3)
            
            # Disk usage
            disk = psutil.disk_usage('/')
            disk_percent = (disk.used / disk.total) * 100
            disk_free_gb = disk.free / (1024**3)
            
            # Network I/O
            network = psutil.net_io_counters()
            bytes_sent = network.bytes_sent
            bytes_recv = network.bytes_recv
            
            # Load average (Unix-like systems)
            try:
                load_avg = psutil.getloadavg()[0]
            except (AttributeError, OSError):
                load_avg = 0.0
            
            # Open file descriptors (Unix-like systems)
            try:
                process = psutil.Process()
                open_fds = process.num_fds()
            except (AttributeError, OSError):
                open_fds = 0
            
            self.system_metrics = SystemMetrics(
                cpu_usage_percent=cpu_percent,
                memory_usage_percent=memory_percent,
                memory_available_gb=memory_available_gb,
                disk_usage_percent=disk_percent,
                disk_free_gb=disk_free_gb,
                network_bytes_sent=bytes_sent,
                network_bytes_recv=bytes_recv,
                load_average_1m=load_avg,
                open_file_descriptors=open_fds,
                timestamp=datetime.utcnow()
            )
            
        except Exception as e:
            self.logger.error(f"Error collecting system metrics: {e}")
    
    async def _collect_application_metrics(self) -> None:
        """Collect application-specific metrics."""
        
        try:
            # This would typically interface with your application components
            # For now, we'll use placeholder values that would be updated by the actual components
            
            self.app_metrics = ApplicationMetrics(
                pipeline_executions_total=getattr(self, '_pipeline_executions', 0),
                pipeline_failures_total=getattr(self, '_pipeline_failures', 0),
                pipeline_duration_seconds=getattr(self, '_avg_pipeline_duration', 0.0),
                markets_processed_total=getattr(self, '_markets_processed', 0),
                opportunities_detected_total=getattr(self, '_opportunities_detected', 0),
                ml_predictions_total=getattr(self, '_ml_predictions', 0),
                llm_evaluations_total=getattr(self, '_llm_evaluations', 0),
                avg_processing_latency_ms=getattr(self, '_avg_latency', 0.0),
                cache_hit_rate=getattr(self, '_cache_hit_rate', 0.0),
                database_connections_active=getattr(self, '_db_connections', 0),
                total_profit_potential_usd=getattr(self, '_total_profit', 0.0),
                high_confidence_opportunities=getattr(self, '_high_conf_opps', 0),
                active_arbitrage_pairs=getattr(self, '_active_pairs', 0),
                timestamp=datetime.utcnow()
            )
            
        except Exception as e:
            self.logger.error(f"Error collecting application metrics: {e}")
    
    def _update_prometheus_metrics(self) -> None:
        """Update Prometheus metrics with collected data."""
        
        if self.system_metrics:
            self.cpu_usage.set(self.system_metrics.cpu_usage_percent)
            self.memory_usage.set(self.system_metrics.memory_usage_percent)
            self.disk_usage.set(self.system_metrics.disk_usage_percent)
        
        if self.app_metrics:
            # Update profit potential
            self.profit_potential.set(self.app_metrics.total_profit_potential_usd)
            
            # Update database connections
            self.db_connections.labels(database_type="duckdb").set(
                self.app_metrics.database_connections_active
            )
    
    # Public methods for updating application metrics
    
    def record_pipeline_execution(self, status: str, duration: float, stage: str = "complete") -> None:
        """Record pipeline execution metrics."""
        self.pipeline_executions.labels(status=status).inc()
        self.processing_duration.labels(stage=stage).observe(duration)
        
        # Update internal counters
        if status == "success":
            self._pipeline_executions = getattr(self, '_pipeline_executions', 0) + 1
        else:
            self._pipeline_failures = getattr(self, '_pipeline_failures', 0) + 1
        
        # Update average duration
        current_avg = getattr(self, '_avg_pipeline_duration', 0.0)
        total_executions = getattr(self, '_pipeline_executions', 0)
        if total_executions > 0:
            self._avg_pipeline_duration = (current_avg * (total_executions - 1) + duration) / total_executions
    
    def record_cache_hit(self, cache_type: str) -> None:
        """Record cache hit."""
        self.cache_hits.labels(cache_type=cache_type).inc()
        self._update_cache_hit_rate()
    
    def record_cache_miss(self, cache_type: str) -> None:
        """Record cache miss."""
        self.cache_misses.labels(cache_type=cache_type).inc()
        self._update_cache_hit_rate()
    
    def record_ml_prediction(self, model_type: str, confidence_level: str) -> None:
        """Record ML prediction."""
        self.ml_predictions.labels(model_type=model_type, confidence_level=confidence_level).inc()
        self._ml_predictions = getattr(self, '_ml_predictions', 0) + 1
    
    def record_llm_evaluation(self, provider: str, model: str, cost_usd: float) -> None:
        """Record LLM evaluation."""
        self.llm_evaluations.labels(provider=provider, model=model).inc()
        self.llm_costs.labels(provider=provider, model=model).inc(cost_usd)
        self._llm_evaluations = getattr(self, '_llm_evaluations', 0) + 1
    
    def record_arbitrage_opportunity(self, risk_level: str, profit_usd: float) -> None:
        """Record arbitrage opportunity."""
        self.arbitrage_opportunities.labels(risk_level=risk_level).inc()
        
        # Update totals
        self._opportunities_detected = getattr(self, '_opportunities_detected', 0) + 1
        self._total_profit = getattr(self, '_total_profit', 0.0) + profit_usd
        
        if profit_usd > 100:  # High confidence threshold
            self._high_conf_opps = getattr(self, '_high_conf_opps', 0) + 1
    
    def record_error(self, component: str, error_type: str) -> None:
        """Record error."""
        self.errors_total.labels(component=component, error_type=error_type).inc()
    
    def update_database_connections(self, database_type: str, count: int) -> None:
        """Update database connection count."""
        self.db_connections.labels(database_type=database_type).set(count)
        self._db_connections = count
    
    def record_database_query(self, operation: str, duration: float) -> None:
        """Record database query performance."""
        self.db_query_duration.labels(operation=operation).observe(duration)
    
    def _update_cache_hit_rate(self) -> None:
        """Update cache hit rate calculation."""
        # This is a simplified calculation - in practice you'd track by cache type
        total_hits = sum(self.cache_hits._value.values())
        total_misses = sum(self.cache_misses._value.values())
        total_requests = total_hits + total_misses
        
        if total_requests > 0:
            self._cache_hit_rate = total_hits / total_requests
        else:
            self._cache_hit_rate = 0.0
    
    # Alert management
    
    def add_alert_rule(self, rule: AlertRule) -> None:
        """Add alert rule."""
        self.alert_rules.append(rule)
        self.logger.info(f"Added alert rule: {rule.name}")
    
    def remove_alert_rule(self, rule_name: str) -> bool:
        """Remove alert rule by name."""
        for i, rule in enumerate(self.alert_rules):
            if rule.name == rule_name:
                del self.alert_rules[i]
                self.logger.info(f"Removed alert rule: {rule_name}")
                return True
        return False
    
    async def _check_alert_rules(self) -> None:
        """Check all alert rules and trigger alerts."""
        
        current_time = datetime.utcnow()
        
        for rule in self.alert_rules:
            try:
                # Get current metric value
                metric_value = self._get_metric_value(rule.metric_name)
                if metric_value is None:
                    continue
                
                # Check condition
                condition_met = self._evaluate_condition(metric_value, rule.condition, rule.threshold)
                
                alert_key = f"{rule.name}_{hash(str(rule.labels))}"
                
                if condition_met:
                    # Check if alert already exists
                    if alert_key in self.active_alerts:
                        # Update existing alert duration
                        active_alert = self.active_alerts[alert_key]
                        duration = (current_time - active_alert.triggered_at).total_seconds()
                        
                        # Only trigger if duration threshold is met
                        if duration >= rule.duration_seconds:
                            continue  # Alert already active and triggered
                    else:
                        # Create new alert
                        alert = AlertEvent(
                            alert_id=f"alert_{int(current_time.timestamp())}_{rule.name}",
                            rule_name=rule.name,
                            severity=rule.severity,
                            metric_name=rule.metric_name,
                            current_value=metric_value,
                            threshold=rule.threshold,
                            message=f"{rule.description}: {metric_value} {rule.condition} {rule.threshold}",
                            labels=rule.labels,
                            triggered_at=current_time
                        )
                        
                        self.active_alerts[alert_key] = alert
                        
                        # Check duration threshold before triggering
                        if rule.duration_seconds == 0:
                            await self._trigger_alert(alert)
                
                else:
                    # Condition not met - resolve alert if it exists
                    if alert_key in self.active_alerts:
                        alert = self.active_alerts[alert_key]
                        alert.resolved_at = current_time
                        alert.duration_seconds = (current_time - alert.triggered_at).total_seconds()
                        
                        # Move to history and remove from active
                        self.alert_history.append(alert)
                        del self.active_alerts[alert_key]
                        
                        await self._resolve_alert(alert)
            
            except Exception as e:
                self.logger.error(f"Error checking alert rule {rule.name}: {e}")
    
    def _get_metric_value(self, metric_name: str) -> Optional[float]:
        """Get current value for a metric."""
        
        # Map metric names to actual values
        metric_mapping = {
            "system_cpu_usage_percent": self.system_metrics.cpu_usage_percent if self.system_metrics else None,
            "system_memory_usage_percent": self.system_metrics.memory_usage_percent if self.system_metrics else None,
            "system_disk_usage_percent": self.system_metrics.disk_usage_percent if self.system_metrics else None,
            "cache_hit_rate": getattr(self, '_cache_hit_rate', None),
            "avg_processing_latency_ms": getattr(self, '_avg_latency', None),
            "opportunities_detected_total": getattr(self, '_opportunities_detected', None),
            "pipeline_failure_rate": self._calculate_pipeline_failure_rate(),
        }
        
        return metric_mapping.get(metric_name)
    
    def _calculate_pipeline_failure_rate(self) -> Optional[float]:
        """Calculate pipeline failure rate."""
        total_executions = getattr(self, '_pipeline_executions', 0) + getattr(self, '_pipeline_failures', 0)
        if total_executions == 0:
            return None
        
        failures = getattr(self, '_pipeline_failures', 0)
        return failures / total_executions
    
    def _evaluate_condition(self, value: float, condition: str, threshold: float) -> bool:
        """Evaluate alert condition."""
        
        if condition == ">":
            return value > threshold
        elif condition == "<":
            return value < threshold
        elif condition == "==":
            return abs(value - threshold) < 0.001  # Float equality with tolerance
        elif condition == ">=":
            return value >= threshold
        elif condition == "<=":
            return value <= threshold
        elif condition == "!=":
            return abs(value - threshold) >= 0.001
        
        return False
    
    async def _trigger_alert(self, alert: AlertEvent) -> None:
        """Trigger an alert."""
        
        self.logger.warning(f"ALERT TRIGGERED: {alert.message}")
        
        # Add to history
        self.alert_history.append(alert)
        
        # Notify callbacks
        for callback in self.alert_callbacks:
            try:
                await callback(alert)
            except Exception as e:
                self.logger.error(f"Alert callback failed: {e}")
    
    async def _resolve_alert(self, alert: AlertEvent) -> None:
        """Resolve an alert."""
        
        self.logger.info(f"ALERT RESOLVED: {alert.rule_name} after {alert.duration_seconds:.0f}s")
        
        # Notify callbacks about resolution
        for callback in self.alert_callbacks:
            try:
                await callback(alert)
            except Exception as e:
                self.logger.error(f"Alert resolution callback failed: {e}")
    
    def add_alert_callback(self, callback: Callable) -> None:
        """Add alert callback."""
        self.alert_callbacks.append(callback)
    
    def remove_alert_callback(self, callback: Callable) -> None:
        """Remove alert callback."""
        if callback in self.alert_callbacks:
            self.alert_callbacks.remove(callback)
    
    # Monitoring and status
    
    def get_metrics_summary(self) -> Dict[str, Any]:
        """Get metrics collection summary."""
        
        return {
            "is_collecting": self.is_collecting,
            "collection_interval": self.collection_interval,
            "metrics_collected": self.metrics_collected,
            "collection_errors": self.collection_errors,
            "last_collection": self.last_collection_time.isoformat() if self.last_collection_time else None,
            "system_metrics": self.system_metrics.dict() if self.system_metrics else None,
            "application_metrics": self.app_metrics.dict() if self.app_metrics else None,
            "active_alerts": len(self.active_alerts),
            "alert_rules": len(self.alert_rules)
        }
    
    def get_prometheus_metrics(self) -> str:
        """Get Prometheus-formatted metrics."""
        return generate_latest(self.registry).decode()
    
    def get_content_type(self) -> str:
        """Get Prometheus content type."""
        return CONTENT_TYPE_LATEST
    
    def get_health_status(self) -> Dict[str, Any]:
        """Get health status."""
        
        status = "healthy"
        issues = []
        
        if self.system_metrics:
            if self.system_metrics.cpu_usage_percent > 90:
                status = "degraded"
                issues.append("High CPU usage")
            
            if self.system_metrics.memory_usage_percent > 90:
                status = "degraded"
                issues.append("High memory usage")
            
            if self.system_metrics.disk_usage_percent > 95:
                status = "unhealthy"
                issues.append("Critical disk space")
        
        if len(self.active_alerts) > 0:
            critical_alerts = [a for a in self.active_alerts.values() if a.severity == AlertSeverity.CRITICAL]
            if critical_alerts:
                status = "unhealthy"
                issues.append(f"{len(critical_alerts)} critical alerts")
            else:
                status = "degraded"
                issues.append(f"{len(self.active_alerts)} active alerts")
        
        return {
            "status": status,
            "timestamp": datetime.utcnow().isoformat(),
            "issues": issues,
            "uptime_seconds": (
                (datetime.utcnow() - self.last_collection_time).total_seconds()
                if self.last_collection_time else 0
            )
        }