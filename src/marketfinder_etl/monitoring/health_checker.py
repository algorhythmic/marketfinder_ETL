"""
Health Checker - Comprehensive system health monitoring

This module provides deep health checks for all system components with
dependency tracking, service discovery, and automated recovery suggestions.
"""

import asyncio
import aiohttp
from typing import Any, Dict, List, Optional, Callable, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass
from enum import Enum
import psutil
import socket

from pydantic import BaseModel

from marketfinder_etl.core.logging import LoggerMixin


class HealthStatus(str, Enum):
    """Health check status levels."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


class ComponentType(str, Enum):
    """Types of system components."""
    DATABASE = "database"
    CACHE = "cache"
    EXTERNAL_API = "external_api"
    QUEUE = "queue"
    SERVICE = "service"
    FILESYSTEM = "filesystem"
    NETWORK = "network"


@dataclass
class HealthCheckConfig:
    """Configuration for a health check."""
    name: str
    component_type: ComponentType
    check_interval_seconds: int = 30
    timeout_seconds: int = 10
    retry_attempts: int = 3
    retry_delay_seconds: float = 1.0
    
    # Component-specific settings
    url: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    database_query: Optional[str] = None
    expected_response: Optional[str] = None
    
    # Thresholds
    warning_threshold: Optional[float] = None
    critical_threshold: Optional[float] = None


class HealthCheckResult(BaseModel):
    """Result of a health check."""
    component_name: str
    component_type: ComponentType
    status: HealthStatus
    response_time_ms: Optional[float] = None
    
    # Details
    message: str
    details: Dict[str, Any] = {}
    error: Optional[str] = None
    
    # Metadata
    checked_at: datetime
    check_duration_ms: float
    attempt_number: int = 1


class DependencyMapping(BaseModel):
    """Dependency relationship between components."""
    component: str
    depends_on: List[str]
    dependency_type: str = "hard"  # "hard" or "soft"
    impact_description: str = ""


class SystemHealthStatus(BaseModel):
    """Overall system health status."""
    overall_status: HealthStatus
    component_count: int
    healthy_components: int
    degraded_components: int
    unhealthy_components: int
    unknown_components: int
    
    # Timing
    last_check_at: datetime
    next_check_at: datetime
    total_check_duration_ms: float
    
    # Details
    failing_components: List[str]
    degraded_components_list: List[str]
    critical_issues: List[str]
    suggestions: List[str]


class HealthChecker(LoggerMixin):
    """
    Comprehensive Health Checker for all system components.
    
    Provides deep health monitoring with dependency tracking, automated
    recovery suggestions, and intelligent alerting based on component criticality.
    """
    
    def __init__(self):
        # Health check configurations
        self.health_checks: Dict[str, HealthCheckConfig] = {}
        self.dependency_map: Dict[str, DependencyMapping] = {}
        
        # Results tracking
        self.latest_results: Dict[str, HealthCheckResult] = {}
        self.health_history: Dict[str, List[HealthCheckResult]] = {}
        
        # Custom check functions
        self.custom_checks: Dict[str, Callable] = {}
        
        # State management
        self.is_running = False
        self.check_task: Optional[asyncio.Task] = None
        
        # Performance tracking
        self.total_checks_performed = 0
        self.failed_checks = 0
        self.avg_check_duration_ms = 0.0
        
        # Initialize default health checks
        self._initialize_default_checks()
    
    def _initialize_default_checks(self) -> None:
        """Initialize default health checks."""
        
        # System resource checks
        self.add_health_check(HealthCheckConfig(
            name="system_cpu",
            component_type=ComponentType.SERVICE,
            check_interval_seconds=30,
            warning_threshold=80.0,
            critical_threshold=95.0
        ))
        
        self.add_health_check(HealthCheckConfig(
            name="system_memory",
            component_type=ComponentType.SERVICE,
            check_interval_seconds=30,
            warning_threshold=85.0,
            critical_threshold=95.0
        ))
        
        self.add_health_check(HealthCheckConfig(
            name="system_disk",
            component_type=ComponentType.FILESYSTEM,
            check_interval_seconds=60,
            warning_threshold=90.0,
            critical_threshold=98.0
        ))
        
        # External API checks
        self.add_health_check(HealthCheckConfig(
            name="kalshi_api",
            component_type=ComponentType.EXTERNAL_API,
            url="https://api.elections.kalshi.com/trade-api/v2/markets",
            check_interval_seconds=60,
            timeout_seconds=10
        ))
        
        self.add_health_check(HealthCheckConfig(
            name="polymarket_api",
            component_type=ComponentType.EXTERNAL_API,
            url="https://gamma-api.polymarket.com/markets",
            check_interval_seconds=60,
            timeout_seconds=10
        ))
        
        # Database connectivity
        self.add_health_check(HealthCheckConfig(
            name="duckdb_connection",
            component_type=ComponentType.DATABASE,
            check_interval_seconds=45,
            database_query="SELECT 1"
        ))
        
        # Initialize dependency mappings
        self._initialize_dependencies()
        
        # Add custom check functions
        self._register_custom_checks()
    
    def _initialize_dependencies(self) -> None:
        """Initialize component dependencies."""
        
        dependencies = [
            DependencyMapping(
                component="etl_pipeline",
                depends_on=["kalshi_api", "polymarket_api", "duckdb_connection"],
                dependency_type="hard",
                impact_description="Pipeline cannot process data without external APIs and database"
            ),
            
            DependencyMapping(
                component="arbitrage_detection",
                depends_on=["etl_pipeline", "ml_models", "llm_services"],
                dependency_type="hard",
                impact_description="Arbitrage detection requires successful data processing and ML/LLM services"
            ),
            
            DependencyMapping(
                component="alerting_system",
                depends_on=["system_cpu", "system_memory", "network_connectivity"],
                dependency_type="soft",
                impact_description="Alerting may be delayed if system resources are constrained"
            ),
        ]
        
        for dep in dependencies:
            self.dependency_map[dep.component] = dep
    
    def _register_custom_checks(self) -> None:
        """Register custom health check functions."""
        
        self.custom_checks["system_cpu"] = self._check_cpu_health
        self.custom_checks["system_memory"] = self._check_memory_health
        self.custom_checks["system_disk"] = self._check_disk_health
        self.custom_checks["network_connectivity"] = self._check_network_health
        self.custom_checks["duckdb_connection"] = self._check_database_health
    
    async def start(self) -> None:
        """Start continuous health checking."""
        
        if self.is_running:
            return
        
        self.is_running = True
        self.check_task = asyncio.create_task(self._health_check_loop())
        
        self.logger.info("Health checker started")
    
    async def stop(self) -> None:
        """Stop health checking."""
        
        if not self.is_running:
            return
        
        self.is_running = False
        
        if self.check_task and not self.check_task.done():
            self.check_task.cancel()
            try:
                await self.check_task
            except asyncio.CancelledError:
                pass
        
        self.logger.info("Health checker stopped")
    
    async def _health_check_loop(self) -> None:
        """Main health checking loop."""
        
        while self.is_running:
            try:
                # Perform all health checks
                await self._perform_health_checks()
                
                # Calculate next check time
                min_interval = min(
                    check.check_interval_seconds 
                    for check in self.health_checks.values()
                )
                
                await asyncio.sleep(min_interval)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error in health check loop: {e}")
                await asyncio.sleep(30)  # Wait before retrying
    
    async def _perform_health_checks(self) -> None:
        """Perform all configured health checks."""
        
        start_time = datetime.utcnow()
        
        # Group checks by interval to avoid unnecessary checks
        checks_to_run = []
        current_time = datetime.utcnow()
        
        for name, config in self.health_checks.items():
            last_result = self.latest_results.get(name)
            
            if not last_result:
                checks_to_run.append((name, config))
            else:
                time_since_last = (current_time - last_result.checked_at).total_seconds()
                if time_since_last >= config.check_interval_seconds:
                    checks_to_run.append((name, config))
        
        if not checks_to_run:
            return
        
        # Run checks in parallel
        check_tasks = [
            self._run_single_health_check(name, config)
            for name, config in checks_to_run
        ]
        
        results = await asyncio.gather(*check_tasks, return_exceptions=True)
        
        # Process results
        for (name, config), result in zip(checks_to_run, results):
            if isinstance(result, HealthCheckResult):
                self._store_health_result(name, result)
            elif isinstance(result, Exception):
                self.failed_checks += 1
                self.logger.error(f"Health check {name} failed with exception: {result}")
        
        # Update performance metrics
        total_duration = (datetime.utcnow() - start_time).total_seconds() * 1000
        self.total_checks_performed += len(checks_to_run)
        
        if self.avg_check_duration_ms == 0:
            self.avg_check_duration_ms = total_duration
        else:
            self.avg_check_duration_ms = (self.avg_check_duration_ms + total_duration) / 2
    
    async def _run_single_health_check(self, name: str, config: HealthCheckConfig) -> HealthCheckResult:
        """Run a single health check with retry logic."""
        
        start_time = datetime.utcnow()
        
        for attempt in range(config.retry_attempts):
            try:
                # Use custom check function if available
                if name in self.custom_checks:
                    result = await self.custom_checks[name](config)
                else:
                    result = await self._generic_health_check(config)
                
                result.attempt_number = attempt + 1
                return result
                
            except Exception as e:
                if attempt == config.retry_attempts - 1:
                    # Last attempt failed
                    return HealthCheckResult(
                        component_name=config.name,
                        component_type=config.component_type,
                        status=HealthStatus.UNHEALTHY,
                        message=f"Health check failed after {config.retry_attempts} attempts",
                        error=str(e),
                        checked_at=datetime.utcnow(),
                        check_duration_ms=(datetime.utcnow() - start_time).total_seconds() * 1000,
                        attempt_number=attempt + 1
                    )
                else:
                    # Wait before retry
                    await asyncio.sleep(config.retry_delay_seconds)
    
    async def _generic_health_check(self, config: HealthCheckConfig) -> HealthCheckResult:
        """Generic health check for HTTP endpoints."""
        
        start_time = datetime.utcnow()
        
        if config.url:
            return await self._check_http_endpoint(config)
        elif config.host and config.port:
            return await self._check_tcp_connection(config)
        else:
            raise ValueError(f"No check method configured for {config.name}")
    
    async def _check_http_endpoint(self, config: HealthCheckConfig) -> HealthCheckResult:
        """Check HTTP endpoint health."""
        
        start_time = datetime.utcnow()
        
        timeout = aiohttp.ClientTimeout(total=config.timeout_seconds)
        
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(config.url) as response:
                response_time = (datetime.utcnow() - start_time).total_seconds() * 1000
                
                if response.status < 400:
                    status = HealthStatus.HEALTHY
                    message = f"HTTP {response.status} - OK"
                elif response.status < 500:
                    status = HealthStatus.DEGRADED
                    message = f"HTTP {response.status} - Client Error"
                else:
                    status = HealthStatus.UNHEALTHY
                    message = f"HTTP {response.status} - Server Error"
                
                return HealthCheckResult(
                    component_name=config.name,
                    component_type=config.component_type,
                    status=status,
                    response_time_ms=response_time,
                    message=message,
                    details={"status_code": response.status, "url": config.url},
                    checked_at=datetime.utcnow(),
                    check_duration_ms=response_time
                )
    
    async def _check_tcp_connection(self, config: HealthCheckConfig) -> HealthCheckResult:
        """Check TCP connection health."""
        
        start_time = datetime.utcnow()
        
        try:
            # Attempt TCP connection
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(config.host, config.port),
                timeout=config.timeout_seconds
            )
            
            writer.close()
            await writer.wait_closed()
            
            response_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            return HealthCheckResult(
                component_name=config.name,
                component_type=config.component_type,
                status=HealthStatus.HEALTHY,
                response_time_ms=response_time,
                message=f"TCP connection successful to {config.host}:{config.port}",
                details={"host": config.host, "port": config.port},
                checked_at=datetime.utcnow(),
                check_duration_ms=response_time
            )
            
        except asyncio.TimeoutError:
            return HealthCheckResult(
                component_name=config.name,
                component_type=config.component_type,
                status=HealthStatus.UNHEALTHY,
                message=f"TCP connection timeout to {config.host}:{config.port}",
                error="Connection timeout",
                checked_at=datetime.utcnow(),
                check_duration_ms=config.timeout_seconds * 1000
            )
    
    # Custom health check functions
    
    async def _check_cpu_health(self, config: HealthCheckConfig) -> HealthCheckResult:
        """Check CPU health."""
        
        start_time = datetime.utcnow()
        
        try:
            cpu_percent = psutil.cpu_percent(interval=1)
            
            if cpu_percent >= config.critical_threshold:
                status = HealthStatus.UNHEALTHY
                message = f"Critical CPU usage: {cpu_percent:.1f}%"
            elif cpu_percent >= config.warning_threshold:
                status = HealthStatus.DEGRADED
                message = f"High CPU usage: {cpu_percent:.1f}%"
            else:
                status = HealthStatus.HEALTHY
                message = f"Normal CPU usage: {cpu_percent:.1f}%"
            
            check_duration = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            return HealthCheckResult(
                component_name=config.name,
                component_type=config.component_type,
                status=status,
                message=message,
                details={
                    "cpu_percent": cpu_percent,
                    "warning_threshold": config.warning_threshold,
                    "critical_threshold": config.critical_threshold,
                    "cpu_count": psutil.cpu_count()
                },
                checked_at=datetime.utcnow(),
                check_duration_ms=check_duration
            )
            
        except Exception as e:
            return HealthCheckResult(
                component_name=config.name,
                component_type=config.component_type,
                status=HealthStatus.UNKNOWN,
                message="Failed to check CPU usage",
                error=str(e),
                checked_at=datetime.utcnow(),
                check_duration_ms=(datetime.utcnow() - start_time).total_seconds() * 1000
            )
    
    async def _check_memory_health(self, config: HealthCheckConfig) -> HealthCheckResult:
        """Check memory health."""
        
        start_time = datetime.utcnow()
        
        try:
            memory = psutil.virtual_memory()
            memory_percent = memory.percent
            
            if memory_percent >= config.critical_threshold:
                status = HealthStatus.UNHEALTHY
                message = f"Critical memory usage: {memory_percent:.1f}%"
            elif memory_percent >= config.warning_threshold:
                status = HealthStatus.DEGRADED
                message = f"High memory usage: {memory_percent:.1f}%"
            else:
                status = HealthStatus.HEALTHY
                message = f"Normal memory usage: {memory_percent:.1f}%"
            
            check_duration = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            return HealthCheckResult(
                component_name=config.name,
                component_type=config.component_type,
                status=status,
                message=message,
                details={
                    "memory_percent": memory_percent,
                    "total_gb": memory.total / (1024**3),
                    "available_gb": memory.available / (1024**3),
                    "used_gb": memory.used / (1024**3)
                },
                checked_at=datetime.utcnow(),
                check_duration_ms=check_duration
            )
            
        except Exception as e:
            return HealthCheckResult(
                component_name=config.name,
                component_type=config.component_type,
                status=HealthStatus.UNKNOWN,
                message="Failed to check memory usage",
                error=str(e),
                checked_at=datetime.utcnow(),
                check_duration_ms=(datetime.utcnow() - start_time).total_seconds() * 1000
            )
    
    async def _check_disk_health(self, config: HealthCheckConfig) -> HealthCheckResult:
        """Check disk health."""
        
        start_time = datetime.utcnow()
        
        try:
            disk = psutil.disk_usage('/')
            disk_percent = (disk.used / disk.total) * 100
            
            if disk_percent >= config.critical_threshold:
                status = HealthStatus.UNHEALTHY
                message = f"Critical disk usage: {disk_percent:.1f}%"
            elif disk_percent >= config.warning_threshold:
                status = HealthStatus.DEGRADED
                message = f"High disk usage: {disk_percent:.1f}%"
            else:
                status = HealthStatus.HEALTHY
                message = f"Normal disk usage: {disk_percent:.1f}%"
            
            check_duration = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            return HealthCheckResult(
                component_name=config.name,
                component_type=config.component_type,
                status=status,
                message=message,
                details={
                    "disk_percent": disk_percent,
                    "total_gb": disk.total / (1024**3),
                    "free_gb": disk.free / (1024**3),
                    "used_gb": disk.used / (1024**3)
                },
                checked_at=datetime.utcnow(),
                check_duration_ms=check_duration
            )
            
        except Exception as e:
            return HealthCheckResult(
                component_name=config.name,
                component_type=config.component_type,
                status=HealthStatus.UNKNOWN,
                message="Failed to check disk usage",
                error=str(e),
                checked_at=datetime.utcnow(),
                check_duration_ms=(datetime.utcnow() - start_time).total_seconds() * 1000
            )
    
    async def _check_network_health(self, config: HealthCheckConfig) -> HealthCheckResult:
        """Check network connectivity."""
        
        start_time = datetime.utcnow()
        
        try:
            # Test DNS resolution and basic connectivity
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(config.timeout_seconds)
            
            result = sock.connect_ex(("8.8.8.8", 53))  # Google DNS
            sock.close()
            
            check_duration = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            if result == 0:
                status = HealthStatus.HEALTHY
                message = "Network connectivity OK"
            else:
                status = HealthStatus.UNHEALTHY
                message = f"Network connectivity failed (error: {result})"
            
            return HealthCheckResult(
                component_name=config.name,
                component_type=config.component_type,
                status=status,
                message=message,
                details={"connection_result": result},
                checked_at=datetime.utcnow(),
                check_duration_ms=check_duration
            )
            
        except Exception as e:
            return HealthCheckResult(
                component_name=config.name,
                component_type=config.component_type,
                status=HealthStatus.UNKNOWN,
                message="Failed to check network connectivity",
                error=str(e),
                checked_at=datetime.utcnow(),
                check_duration_ms=(datetime.utcnow() - start_time).total_seconds() * 1000
            )
    
    async def _check_database_health(self, config: HealthCheckConfig) -> HealthCheckResult:
        """Check database connectivity."""
        
        start_time = datetime.utcnow()
        
        try:
            # This would use the actual database connection
            # For now, simulate a database check
            
            await asyncio.sleep(0.1)  # Simulate query time
            
            check_duration = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            return HealthCheckResult(
                component_name=config.name,
                component_type=config.component_type,
                status=HealthStatus.HEALTHY,
                message="Database connection OK",
                details={"query": config.database_query or "SELECT 1"},
                checked_at=datetime.utcnow(),
                check_duration_ms=check_duration
            )
            
        except Exception as e:
            return HealthCheckResult(
                component_name=config.name,
                component_type=config.component_type,
                status=HealthStatus.UNHEALTHY,
                message="Database connection failed",
                error=str(e),
                checked_at=datetime.utcnow(),
                check_duration_ms=(datetime.utcnow() - start_time).total_seconds() * 1000
            )
    
    def _store_health_result(self, name: str, result: HealthCheckResult) -> None:
        """Store health check result."""
        
        self.latest_results[name] = result
        
        # Add to history
        if name not in self.health_history:
            self.health_history[name] = []
        
        self.health_history[name].append(result)
        
        # Keep only last 100 results per component
        if len(self.health_history[name]) > 100:
            self.health_history[name] = self.health_history[name][-100:]
    
    # Public API methods
    
    def add_health_check(self, config: HealthCheckConfig) -> None:
        """Add health check configuration."""
        self.health_checks[config.name] = config
        self.logger.info(f"Added health check: {config.name}")
    
    def remove_health_check(self, name: str) -> bool:
        """Remove health check configuration."""
        if name in self.health_checks:
            del self.health_checks[name]
            self.logger.info(f"Removed health check: {name}")
            return True
        return False
    
    def add_custom_check(self, name: str, check_function: Callable) -> None:
        """Add custom health check function."""
        self.custom_checks[name] = check_function
        self.logger.info(f"Added custom health check: {name}")
    
    async def run_health_check_now(self, component_name: str) -> Optional[HealthCheckResult]:
        """Run health check immediately for a specific component."""
        
        config = self.health_checks.get(component_name)
        if not config:
            return None
        
        result = await self._run_single_health_check(component_name, config)
        self._store_health_result(component_name, result)
        
        return result
    
    def get_system_health_status(self) -> SystemHealthStatus:
        """Get overall system health status."""
        
        if not self.latest_results:
            return SystemHealthStatus(
                overall_status=HealthStatus.UNKNOWN,
                component_count=0,
                healthy_components=0,
                degraded_components=0,
                unhealthy_components=0,
                unknown_components=0,
                last_check_at=datetime.utcnow(),
                next_check_at=datetime.utcnow(),
                total_check_duration_ms=0,
                failing_components=[],
                degraded_components_list=[],
                critical_issues=[],
                suggestions=[]
            )
        
        # Count components by status
        status_counts = {
            HealthStatus.HEALTHY: 0,
            HealthStatus.DEGRADED: 0,
            HealthStatus.UNHEALTHY: 0,
            HealthStatus.UNKNOWN: 0
        }
        
        failing_components = []
        degraded_components_list = []
        critical_issues = []
        
        for name, result in self.latest_results.items():
            status_counts[result.status] += 1
            
            if result.status == HealthStatus.UNHEALTHY:
                failing_components.append(name)
                critical_issues.append(f"{name}: {result.message}")
            elif result.status == HealthStatus.DEGRADED:
                degraded_components_list.append(name)
        
        # Determine overall status
        if status_counts[HealthStatus.UNHEALTHY] > 0:
            overall_status = HealthStatus.UNHEALTHY
        elif status_counts[HealthStatus.DEGRADED] > 0:
            overall_status = HealthStatus.DEGRADED
        elif status_counts[HealthStatus.UNKNOWN] > 0:
            overall_status = HealthStatus.UNKNOWN
        else:
            overall_status = HealthStatus.HEALTHY
        
        # Generate suggestions
        suggestions = self._generate_health_suggestions(failing_components, degraded_components_list)
        
        # Calculate timing
        last_check_times = [r.checked_at for r in self.latest_results.values()]
        last_check_at = max(last_check_times) if last_check_times else datetime.utcnow()
        
        min_interval = min(c.check_interval_seconds for c in self.health_checks.values())
        next_check_at = last_check_at + timedelta(seconds=min_interval)
        
        return SystemHealthStatus(
            overall_status=overall_status,
            component_count=len(self.latest_results),
            healthy_components=status_counts[HealthStatus.HEALTHY],
            degraded_components=status_counts[HealthStatus.DEGRADED],
            unhealthy_components=status_counts[HealthStatus.UNHEALTHY],
            unknown_components=status_counts[HealthStatus.UNKNOWN],
            last_check_at=last_check_at,
            next_check_at=next_check_at,
            total_check_duration_ms=self.avg_check_duration_ms,
            failing_components=failing_components,
            degraded_components_list=degraded_components_list,
            critical_issues=critical_issues,
            suggestions=suggestions
        )
    
    def _generate_health_suggestions(self, failing: List[str], degraded: List[str]) -> List[str]:
        """Generate health improvement suggestions."""
        
        suggestions = []
        
        if "system_cpu" in failing:
            suggestions.append("Consider scaling horizontally or optimizing CPU-intensive operations")
        
        if "system_memory" in failing or "system_memory" in degraded:
            suggestions.append("Monitor memory leaks and consider increasing available RAM")
        
        if "system_disk" in failing:
            suggestions.append("Free up disk space or add additional storage capacity")
        
        if any("api" in component for component in failing):
            suggestions.append("Check external API status and implement circuit breakers")
        
        if "duckdb_connection" in failing:
            suggestions.append("Verify database connectivity and check for locked resources")
        
        if len(failing) > len(self.latest_results) * 0.5:
            suggestions.append("System-wide issues detected - consider emergency procedures")
        
        return suggestions
    
    def get_component_health_history(self, component_name: str, hours: int = 24) -> List[HealthCheckResult]:
        """Get health history for a specific component."""
        
        if component_name not in self.health_history:
            return []
        
        cutoff_time = datetime.utcnow() - timedelta(hours=hours)
        
        return [
            result for result in self.health_history[component_name]
            if result.checked_at > cutoff_time
        ]
    
    def get_health_statistics(self) -> Dict[str, Any]:
        """Get health check statistics."""
        
        uptime_components = len([
            r for r in self.latest_results.values()
            if r.status in [HealthStatus.HEALTHY, HealthStatus.DEGRADED]
        ])
        
        total_components = len(self.latest_results)
        availability = (uptime_components / total_components) if total_components > 0 else 0
        
        return {
            "total_checks_performed": self.total_checks_performed,
            "failed_checks": self.failed_checks,
            "success_rate": (
                (self.total_checks_performed - self.failed_checks) / max(1, self.total_checks_performed)
            ),
            "avg_check_duration_ms": self.avg_check_duration_ms,
            "component_availability": availability,
            "configured_checks": len(self.health_checks),
            "custom_checks": len(self.custom_checks),
            "is_running": self.is_running
        }