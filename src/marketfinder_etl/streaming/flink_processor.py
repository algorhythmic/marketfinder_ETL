"""
Apache Flink Stream Processing - Advanced real-time analytics

This module provides sophisticated stream processing capabilities using Apache Flink
for complex event processing, windowed aggregations, and real-time pattern detection.
"""

import asyncio
import json
from typing import Any, Dict, List, Optional, Callable, Tuple
from datetime import datetime, timedelta
from decimal import Decimal
from dataclasses import dataclass
from enum import Enum

from pydantic import BaseModel
import pandas as pd

from marketfinder_etl.core.logging import LoggerMixin


class WindowType(str, Enum):
    """Types of time windows for stream processing."""
    TUMBLING = "tumbling"      # Non-overlapping fixed windows
    SLIDING = "sliding"        # Overlapping fixed windows  
    SESSION = "session"        # Dynamic windows based on activity
    GLOBAL = "global"          # Single window for all events


class AggregationType(str, Enum):
    """Types of aggregations for stream processing."""
    COUNT = "count"
    SUM = "sum"
    AVG = "avg"
    MIN = "min"
    MAX = "max"
    STDDEV = "stddev"
    MEDIAN = "median"
    PERCENTILE = "percentile"


@dataclass
class WindowConfig:
    """Configuration for stream processing windows."""
    window_type: WindowType
    size_seconds: int
    slide_seconds: Optional[int] = None  # For sliding windows
    session_timeout_seconds: Optional[int] = None  # For session windows


@dataclass
class StreamProcessingConfig:
    """Configuration for Flink stream processing."""
    # Window settings
    default_window: WindowConfig = WindowConfig(WindowType.TUMBLING, 60)
    
    # Processing settings
    parallelism: int = 4
    checkpoint_interval_ms: int = 30000  # 30 seconds
    min_pause_between_checkpoints_ms: int = 5000
    
    # Watermark settings
    max_out_of_orderness_ms: int = 5000
    idle_source_timeout_ms: int = 30000
    
    # Performance settings
    buffer_timeout_ms: int = 100
    enable_object_reuse: bool = True


class MarketEvent(BaseModel):
    """Standardized market event for stream processing."""
    event_id: str
    timestamp: datetime
    event_type: str  # "price_change", "volume_spike", "new_market", etc.
    
    # Market identification
    platform: str
    market_id: str
    market_title: str
    category: str
    
    # Event data
    price: Optional[float] = None
    volume: Optional[float] = None
    liquidity: Optional[float] = None
    
    # Change metrics
    price_change: Optional[float] = None
    volume_change: Optional[float] = None
    price_change_percentage: Optional[float] = None
    
    # Context
    metadata: Dict[str, Any] = {}


class ArbitragePattern(BaseModel):
    """Detected arbitrage pattern from stream processing."""
    pattern_id: str
    pattern_type: str  # "convergence", "divergence", "volatility_spike"
    detected_at: datetime
    
    # Market pair
    market1_platform: str
    market1_id: str
    market2_platform: str
    market2_id: str
    
    # Pattern metrics
    price_spread: float
    volume_ratio: float
    duration_seconds: int
    confidence_score: float
    
    # Predicted metrics
    predicted_profit: float
    predicted_duration: int
    risk_score: float


class StreamAlert(BaseModel):
    """Real-time stream processing alert."""
    alert_id: str
    alert_type: str
    severity: str
    triggered_at: datetime
    
    # Alert details
    title: str
    description: str
    affected_markets: List[str]
    
    # Metrics
    threshold_breached: float
    current_value: float
    deviation_percentage: float
    
    # Actions
    suggested_actions: List[str]
    auto_actionable: bool


class FlinkStreamProcessor(LoggerMixin):
    """
    Apache Flink Stream Processor for advanced real-time analytics.
    
    Provides complex event processing, windowed aggregations, and pattern
    detection for market data streams with millisecond latency.
    """
    
    def __init__(self, config: Optional[StreamProcessingConfig] = None):
        self.config = config or StreamProcessingConfig()
        
        # Stream processing state
        self.is_running = False
        self.processing_tasks: List[asyncio.Task] = []
        
        # Event streams
        self.market_events: List[MarketEvent] = []
        self.arbitrage_patterns: List[ArbitragePattern] = []
        self.stream_alerts: List[StreamAlert] = []
        
        # Window managers
        self.window_managers: Dict[str, 'WindowManager'] = {}
        
        # Pattern detectors
        self.pattern_detectors: List['PatternDetector'] = []
        
        # Event handlers
        self.event_handlers: Dict[str, List[Callable]] = {}
        
        # Performance metrics
        self.events_processed = 0
        self.patterns_detected = 0
        self.alerts_generated = 0
        self.processing_latency_ms = 0.0
        
        # Initialize built-in components
        self._initialize_components()
    
    def _initialize_components(self) -> None:
        """Initialize built-in stream processing components."""
        
        # Add price volatility detector
        volatility_detector = PriceVolatilityDetector()
        self.add_pattern_detector(volatility_detector)
        
        # Add arbitrage convergence detector
        convergence_detector = ArbitrageConvergenceDetector()
        self.add_pattern_detector(convergence_detector)
        
        # Add volume spike detector
        volume_detector = VolumeSpikeDetector()
        self.add_pattern_detector(volume_detector)
        
        # Initialize window managers
        self._initialize_windows()
    
    def _initialize_windows(self) -> None:
        """Initialize time-based window managers."""
        
        # 1-minute tumbling window for basic metrics
        self.window_managers["metrics_1m"] = WindowManager(
            WindowConfig(WindowType.TUMBLING, 60),
            self._process_metrics_window
        )
        
        # 5-minute sliding window for trend analysis
        self.window_managers["trends_5m"] = WindowManager(
            WindowConfig(WindowType.SLIDING, 300, 60),
            self._process_trends_window
        )
        
        # Session window for arbitrage pattern detection
        self.window_managers["arbitrage_sessions"] = WindowManager(
            WindowConfig(WindowType.SESSION, session_timeout_seconds=120),
            self._process_arbitrage_session
        )
    
    async def start(self) -> None:
        """Start the stream processor."""
        
        if self.is_running:
            return
        
        self.is_running = True
        
        # Start window managers
        for window_manager in self.window_managers.values():
            await window_manager.start()
        
        # Start main processing loop
        processing_task = asyncio.create_task(self._process_events_loop())
        self.processing_tasks.append(processing_task)
        
        # Start pattern detection loop
        pattern_task = asyncio.create_task(self._detect_patterns_loop())
        self.processing_tasks.append(pattern_task)
        
        self.logger.info("Flink stream processor started")
    
    async def stop(self) -> None:
        """Stop the stream processor."""
        
        if not self.is_running:
            return
        
        self.is_running = False
        
        # Cancel processing tasks
        for task in self.processing_tasks:
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        
        self.processing_tasks.clear()
        
        # Stop window managers
        for window_manager in self.window_managers.values():
            await window_manager.stop()
        
        self.logger.info("Flink stream processor stopped")
    
    async def process_event(self, event: MarketEvent) -> None:
        """Process a single market event."""
        
        start_time = datetime.utcnow()
        
        try:
            # Add to event stream
            self.market_events.append(event)
            
            # Route to window managers
            for window_manager in self.window_managers.values():
                await window_manager.add_event(event)
            
            # Trigger event handlers
            await self._trigger_event_handlers(event)
            
            # Update metrics
            self.events_processed += 1
            processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            # Update average latency
            if self.processing_latency_ms == 0:
                self.processing_latency_ms = processing_time
            else:
                self.processing_latency_ms = (self.processing_latency_ms + processing_time) / 2
            
        except Exception as e:
            self.logger.error(f"Error processing event: {e}")
    
    async def _process_events_loop(self) -> None:
        """Main event processing loop."""
        
        while self.is_running:
            try:
                # Process pending events in batches
                if len(self.market_events) > 100:
                    batch = self.market_events[:100]
                    self.market_events = self.market_events[100:]
                    
                    await self._process_event_batch(batch)
                
                await asyncio.sleep(0.1)  # 100ms processing cycle
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error in event processing loop: {e}")
                await asyncio.sleep(1)
    
    async def _detect_patterns_loop(self) -> None:
        """Pattern detection loop."""
        
        while self.is_running:
            try:
                # Run pattern detectors
                for detector in self.pattern_detectors:
                    patterns = await detector.detect_patterns(self.market_events[-1000:])  # Last 1000 events
                    
                    for pattern in patterns:
                        await self._handle_detected_pattern(pattern)
                
                await asyncio.sleep(5)  # Run pattern detection every 5 seconds
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error in pattern detection loop: {e}")
                await asyncio.sleep(1)
    
    async def _process_event_batch(self, events: List[MarketEvent]) -> None:
        """Process batch of events for efficiency."""
        
        # Group events by market for efficient processing
        events_by_market = {}
        for event in events:
            market_key = f"{event.platform}:{event.market_id}"
            if market_key not in events_by_market:
                events_by_market[market_key] = []
            events_by_market[market_key].append(event)
        
        # Process each market's events
        for market_key, market_events in events_by_market.items():
            await self._analyze_market_events(market_key, market_events)
    
    async def _analyze_market_events(self, market_key: str, events: List[MarketEvent]) -> None:
        """Analyze events for a specific market."""
        
        if not events:
            return
        
        # Calculate aggregated metrics
        total_volume = sum(e.volume or 0 for e in events)
        price_changes = [e.price_change_percentage for e in events if e.price_change_percentage]
        
        # Detect anomalies
        if price_changes:
            avg_change = sum(price_changes) / len(price_changes)
            
            # Significant price movement alert
            if abs(avg_change) > 10:  # 10% change
                await self._generate_alert(
                    alert_type="significant_price_movement",
                    severity="high",
                    title=f"Significant Price Movement: {avg_change:.1%}",
                    description=f"Market {market_key} showed {avg_change:.1%} price change",
                    affected_markets=[market_key],
                    current_value=avg_change,
                    threshold_breached=10.0
                )
        
        # High volume alert
        if total_volume > 100000:  # $100K volume threshold
            await self._generate_alert(
                alert_type="high_volume",
                severity="medium",
                title=f"High Volume Detected: ${total_volume:,.0f}",
                description=f"Market {market_key} showed unusually high volume",
                affected_markets=[market_key],
                current_value=total_volume,
                threshold_breached=100000.0
            )
    
    async def _trigger_event_handlers(self, event: MarketEvent) -> None:
        """Trigger registered event handlers."""
        
        handlers = self.event_handlers.get(event.event_type, [])
        handlers.extend(self.event_handlers.get("*", []))  # Wildcard handlers
        
        for handler in handlers:
            try:
                await handler(event)
            except Exception as e:
                self.logger.error(f"Event handler error: {e}")
    
    async def _handle_detected_pattern(self, pattern: ArbitragePattern) -> None:
        """Handle detected arbitrage pattern."""
        
        self.arbitrage_patterns.append(pattern)
        self.patterns_detected += 1
        
        # Generate alert for high-confidence patterns
        if pattern.confidence_score > 0.8:
            await self._generate_alert(
                alert_type="arbitrage_pattern",
                severity="high" if pattern.predicted_profit > 0.1 else "medium",
                title=f"Arbitrage Pattern Detected: {pattern.pattern_type}",
                description=f"Pattern between {pattern.market1_id} and {pattern.market2_id} with {pattern.predicted_profit:.1%} profit potential",
                affected_markets=[pattern.market1_id, pattern.market2_id],
                current_value=pattern.predicted_profit,
                threshold_breached=0.05,
                suggested_actions=["Review pattern details", "Assess execution feasibility"]
            )
    
    async def _generate_alert(
        self,
        alert_type: str,
        severity: str,
        title: str,
        description: str,
        affected_markets: List[str],
        current_value: float,
        threshold_breached: float,
        suggested_actions: Optional[List[str]] = None
    ) -> None:
        """Generate stream processing alert."""
        
        alert = StreamAlert(
            alert_id=f"stream_{datetime.utcnow().timestamp()}",
            alert_type=alert_type,
            severity=severity,
            triggered_at=datetime.utcnow(),
            title=title,
            description=description,
            affected_markets=affected_markets,
            threshold_breached=threshold_breached,
            current_value=current_value,
            deviation_percentage=((current_value - threshold_breached) / threshold_breached) * 100,
            suggested_actions=suggested_actions or [],
            auto_actionable=False
        )
        
        self.stream_alerts.append(alert)
        self.alerts_generated += 1
        
        self.logger.info(f"Stream alert generated: {title}")
    
    # Window processing methods
    
    async def _process_metrics_window(self, events: List[MarketEvent]) -> None:
        """Process 1-minute metrics window."""
        
        if not events:
            return
        
        # Calculate window metrics
        total_events = len(events)
        platforms = set(e.platform for e in events)
        avg_price_change = sum(e.price_change_percentage or 0 for e in events) / total_events
        total_volume = sum(e.volume or 0 for e in events)
        
        metrics = {
            "window_start": events[0].timestamp,
            "window_end": events[-1].timestamp,
            "total_events": total_events,
            "platforms": list(platforms),
            "avg_price_change": avg_price_change,
            "total_volume": total_volume
        }
        
        self.logger.debug(f"1-minute window metrics: {metrics}")
    
    async def _process_trends_window(self, events: List[MarketEvent]) -> None:
        """Process 5-minute trends window."""
        
        if not events:
            return
        
        # Analyze trends over 5-minute window
        events_by_minute = {}
        for event in events:
            minute_key = event.timestamp.replace(second=0, microsecond=0)
            if minute_key not in events_by_minute:
                events_by_minute[minute_key] = []
            events_by_minute[minute_key].append(event)
        
        # Calculate trend direction
        minute_volumes = {}
        for minute, minute_events in events_by_minute.items():
            minute_volumes[minute] = sum(e.volume or 0 for e in minute_events)
        
        if len(minute_volumes) >= 2:
            volumes = list(minute_volumes.values())
            trend = "increasing" if volumes[-1] > volumes[0] else "decreasing"
            
            self.logger.debug(f"5-minute trend: {trend}")
    
    async def _process_arbitrage_session(self, events: List[MarketEvent]) -> None:
        """Process arbitrage session window."""
        
        # Group events by market pairs for arbitrage analysis
        market_pairs = {}
        
        for i, event1 in enumerate(events):
            for event2 in events[i+1:]:
                if event1.platform != event2.platform:
                    pair_key = f"{event1.market_id}_{event2.market_id}"
                    if pair_key not in market_pairs:
                        market_pairs[pair_key] = []
                    market_pairs[pair_key].append((event1, event2))
        
        # Analyze each pair for arbitrage potential
        for pair_key, pair_events in market_pairs.items():
            await self._analyze_arbitrage_pair(pair_key, pair_events)
    
    async def _analyze_arbitrage_pair(self, pair_key: str, pair_events: List[Tuple[MarketEvent, MarketEvent]]) -> None:
        """Analyze market pair for arbitrage opportunities."""
        
        if not pair_events:
            return
        
        # Calculate price spreads over time
        spreads = []
        for event1, event2 in pair_events:
            if event1.price and event2.price:
                spread = abs(event1.price - event2.price)
                spreads.append(spread)
        
        if spreads:
            avg_spread = sum(spreads) / len(spreads)
            max_spread = max(spreads)
            
            # Detect significant arbitrage opportunity
            if max_spread > 0.05:  # 5% spread
                pattern = ArbitragePattern(
                    pattern_id=f"conv_{pair_key}_{datetime.utcnow().timestamp()}",
                    pattern_type="convergence",
                    detected_at=datetime.utcnow(),
                    market1_platform=pair_events[0][0].platform,
                    market1_id=pair_events[0][0].market_id,
                    market2_platform=pair_events[0][1].platform,
                    market2_id=pair_events[0][1].market_id,
                    price_spread=max_spread,
                    volume_ratio=1.0,  # Simplified
                    duration_seconds=300,  # 5 minute session
                    confidence_score=0.8,  # Simplified confidence
                    predicted_profit=max_spread * 0.8,  # 80% of spread after costs
                    predicted_duration=600,  # 10 minutes
                    risk_score=0.3
                )
                
                await self._handle_detected_pattern(pattern)
    
    # Pattern detector management
    
    def add_pattern_detector(self, detector: 'PatternDetector') -> None:
        """Add pattern detector."""
        self.pattern_detectors.append(detector)
    
    def remove_pattern_detector(self, detector: 'PatternDetector') -> None:
        """Remove pattern detector."""
        if detector in self.pattern_detectors:
            self.pattern_detectors.remove(detector)
    
    # Event handler management
    
    def add_event_handler(self, event_type: str, handler: Callable) -> None:
        """Add event handler for specific event type."""
        if event_type not in self.event_handlers:
            self.event_handlers[event_type] = []
        self.event_handlers[event_type].append(handler)
    
    def remove_event_handler(self, event_type: str, handler: Callable) -> None:
        """Remove event handler."""
        if event_type in self.event_handlers and handler in self.event_handlers[event_type]:
            self.event_handlers[event_type].remove(handler)
    
    # Statistics and monitoring
    
    def get_processing_stats(self) -> Dict[str, Any]:
        """Get stream processing statistics."""
        
        return {
            "is_running": self.is_running,
            "events_processed": self.events_processed,
            "patterns_detected": self.patterns_detected,
            "alerts_generated": self.alerts_generated,
            "avg_processing_latency_ms": self.processing_latency_ms,
            "active_windows": len(self.window_managers),
            "pattern_detectors": len(self.pattern_detectors),
            "event_handlers": sum(len(handlers) for handlers in self.event_handlers.values()),
            "recent_events": len(self.market_events),
            "active_patterns": len(self.arbitrage_patterns),
            "recent_alerts": len([a for a in self.stream_alerts if (datetime.utcnow() - a.triggered_at).total_seconds() < 3600])
        }
    
    def get_recent_patterns(self, limit: int = 10) -> List[Dict]:
        """Get recent arbitrage patterns."""
        
        recent_patterns = sorted(
            self.arbitrage_patterns,
            key=lambda p: p.detected_at,
            reverse=True
        )[:limit]
        
        return [pattern.dict() for pattern in recent_patterns]
    
    def get_recent_alerts(self, limit: int = 20) -> List[Dict]:
        """Get recent stream alerts."""
        
        recent_alerts = sorted(
            self.stream_alerts,
            key=lambda a: a.triggered_at,
            reverse=True
        )[:limit]
        
        return [alert.dict() for alert in recent_alerts]


# Supporting classes for window management and pattern detection

class WindowManager:
    """Manages time-based windows for stream processing."""
    
    def __init__(self, config: WindowConfig, processor: Callable):
        self.config = config
        self.processor = processor
        self.current_window: List[MarketEvent] = []
        self.window_start: Optional[datetime] = None
        self.is_running = False
        
    async def start(self) -> None:
        """Start window management."""
        self.is_running = True
        self.window_start = datetime.utcnow()
        
        # Start window processing task
        asyncio.create_task(self._process_windows())
    
    async def stop(self) -> None:
        """Stop window management."""
        self.is_running = False
    
    async def add_event(self, event: MarketEvent) -> None:
        """Add event to current window."""
        self.current_window.append(event)
    
    async def _process_windows(self) -> None:
        """Process windows based on configuration."""
        
        while self.is_running:
            try:
                if self.config.window_type == WindowType.TUMBLING:
                    await asyncio.sleep(self.config.size_seconds)
                    await self._flush_window()
                elif self.config.window_type == WindowType.SLIDING:
                    await asyncio.sleep(self.config.slide_seconds or self.config.size_seconds)
                    await self._process_sliding_window()
                else:
                    await asyncio.sleep(10)  # Default processing interval
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Window processing error: {e}")
                await asyncio.sleep(1)
    
    async def _flush_window(self) -> None:
        """Flush current window and process events."""
        if self.current_window:
            await self.processor(self.current_window)
            self.current_window = []
            self.window_start = datetime.utcnow()
    
    async def _process_sliding_window(self) -> None:
        """Process sliding window."""
        if self.current_window:
            cutoff_time = datetime.utcnow() - timedelta(seconds=self.config.size_seconds)
            
            # Keep only events within window
            self.current_window = [
                event for event in self.current_window
                if event.timestamp > cutoff_time
            ]
            
            # Process current window
            await self.processor(self.current_window)


class PatternDetector:
    """Base class for pattern detectors."""
    
    async def detect_patterns(self, events: List[MarketEvent]) -> List[ArbitragePattern]:
        """Detect patterns in event stream."""
        return []


class PriceVolatilityDetector(PatternDetector):
    """Detects price volatility patterns."""
    
    async def detect_patterns(self, events: List[MarketEvent]) -> List[ArbitragePattern]:
        """Detect volatility patterns."""
        patterns = []
        
        # Group events by market
        markets = {}
        for event in events:
            market_key = f"{event.platform}:{event.market_id}"
            if market_key not in markets:
                markets[market_key] = []
            markets[market_key].append(event)
        
        # Analyze each market for volatility
        for market_key, market_events in markets.items():
            if len(market_events) < 5:  # Need enough events
                continue
                
            price_changes = [e.price_change_percentage for e in market_events if e.price_change_percentage]
            
            if price_changes:
                volatility = sum(abs(change) for change in price_changes) / len(price_changes)
                
                if volatility > 5:  # 5% average volatility
                    pattern = ArbitragePattern(
                        pattern_id=f"vol_{market_key}_{datetime.utcnow().timestamp()}",
                        pattern_type="volatility_spike",
                        detected_at=datetime.utcnow(),
                        market1_platform=market_events[0].platform,
                        market1_id=market_events[0].market_id,
                        market2_platform="",
                        market2_id="",
                        price_spread=volatility,
                        volume_ratio=1.0,
                        duration_seconds=len(market_events) * 10,
                        confidence_score=min(0.9, volatility / 10),
                        predicted_profit=volatility * 0.1,
                        predicted_duration=300,
                        risk_score=volatility / 20
                    )
                    patterns.append(pattern)
        
        return patterns


class ArbitrageConvergenceDetector(PatternDetector):
    """Detects arbitrage convergence patterns."""
    
    async def detect_patterns(self, events: List[MarketEvent]) -> List[ArbitragePattern]:
        """Detect convergence patterns between platforms."""
        patterns = []
        
        # Find events for same markets on different platforms
        market_groups = {}
        for event in events:
            # Simple market matching by title similarity
            title_key = event.market_title[:20].lower()  # Use first 20 chars as key
            if title_key not in market_groups:
                market_groups[title_key] = {}
            
            platform = event.platform
            if platform not in market_groups[title_key]:
                market_groups[title_key][platform] = []
            market_groups[title_key][platform].append(event)
        
        # Analyze convergence for market pairs
        for title_key, platform_events in market_groups.items():
            if len(platform_events) >= 2:  # At least 2 platforms
                platforms = list(platform_events.keys())
                
                for i, platform1 in enumerate(platforms):
                    for platform2 in platforms[i+1:]:
                        events1 = platform_events[platform1]
                        events2 = platform_events[platform2]
                        
                        pattern = await self._analyze_convergence(events1, events2)
                        if pattern:
                            patterns.append(pattern)
        
        return patterns
    
    async def _analyze_convergence(self, events1: List[MarketEvent], events2: List[MarketEvent]) -> Optional[ArbitragePattern]:
        """Analyze convergence between two event streams."""
        
        if not events1 or not events2:
            return None
        
        # Calculate price spreads over time
        spreads = []
        for e1 in events1:
            for e2 in events2:
                if e1.price and e2.price and abs((e1.timestamp - e2.timestamp).total_seconds()) < 60:
                    spread = abs(e1.price - e2.price)
                    spreads.append(spread)
        
        if not spreads:
            return None
        
        avg_spread = sum(spreads) / len(spreads)
        
        # Detect significant arbitrage opportunity
        if avg_spread > 0.03:  # 3% spread threshold
            return ArbitragePattern(
                pattern_id=f"conv_{events1[0].market_id}_{events2[0].market_id}_{datetime.utcnow().timestamp()}",
                pattern_type="convergence",
                detected_at=datetime.utcnow(),
                market1_platform=events1[0].platform,
                market1_id=events1[0].market_id,
                market2_platform=events2[0].platform,
                market2_id=events2[0].market_id,
                price_spread=avg_spread,
                volume_ratio=1.0,
                duration_seconds=300,
                confidence_score=min(0.9, avg_spread / 0.1),
                predicted_profit=avg_spread * 0.7,
                predicted_duration=600,
                risk_score=0.4
            )
        
        return None


class VolumeSpikeDetector(PatternDetector):
    """Detects volume spike patterns."""
    
    async def detect_patterns(self, events: List[MarketEvent]) -> List[ArbitragePattern]:
        """Detect volume spike patterns."""
        patterns = []
        
        # Group by market and analyze volume patterns
        markets = {}
        for event in events:
            market_key = f"{event.platform}:{event.market_id}"
            if market_key not in markets:
                markets[market_key] = []
            markets[market_key].append(event)
        
        for market_key, market_events in markets.items():
            if len(market_events) < 3:
                continue
            
            volumes = [e.volume for e in market_events if e.volume]
            if not volumes:
                continue
            
            avg_volume = sum(volumes) / len(volumes)
            max_volume = max(volumes)
            
            # Detect volume spike (3x average)
            if max_volume > avg_volume * 3 and max_volume > 10000:  # $10K threshold
                pattern = ArbitragePattern(
                    pattern_id=f"vol_spike_{market_key}_{datetime.utcnow().timestamp()}",
                    pattern_type="volume_spike",
                    detected_at=datetime.utcnow(),
                    market1_platform=market_events[0].platform,
                    market1_id=market_events[0].market_id,
                    market2_platform="",
                    market2_id="",
                    price_spread=0.0,
                    volume_ratio=max_volume / avg_volume,
                    duration_seconds=len(market_events) * 10,
                    confidence_score=min(0.9, (max_volume / avg_volume) / 10),
                    predicted_profit=0.02,  # 2% potential from volume spike
                    predicted_duration=1800,  # 30 minutes
                    risk_score=0.6
                )
                patterns.append(pattern)
        
        return patterns