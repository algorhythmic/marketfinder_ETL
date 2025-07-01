"""
Automation Scheduler - Advanced task scheduling and automation

This module provides comprehensive task scheduling, automation workflows,
and intelligent job management for the MarketFinder ETL system.
"""

import asyncio
import schedule
from typing import Any, Dict, List, Optional, Callable, Union
from datetime import datetime, timedelta, time
from dataclasses import dataclass
from enum import Enum
import json
import uuid

from pydantic import BaseModel

from marketfinder_etl.core.logging import LoggerMixin


class ScheduleType(str, Enum):
    """Types of schedule patterns."""
    INTERVAL = "interval"      # Every N seconds/minutes/hours
    DAILY = "daily"           # Daily at specific time
    WEEKLY = "weekly"         # Weekly on specific day/time
    MONTHLY = "monthly"       # Monthly on specific date
    CRON = "cron"            # Cron expression
    ONE_TIME = "one_time"    # Execute once at specific time


class JobStatus(str, Enum):
    """Job execution status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    SCHEDULED = "scheduled"


class JobPriority(str, Enum):
    """Job priority levels."""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class ScheduleConfig:
    """Schedule configuration."""
    schedule_type: ScheduleType
    
    # Interval configuration
    interval_seconds: Optional[int] = None
    interval_minutes: Optional[int] = None
    interval_hours: Optional[int] = None
    
    # Daily/Weekly/Monthly configuration
    at_time: Optional[str] = None  # "HH:MM" format
    weekday: Optional[str] = None  # "monday", "tuesday", etc.
    day_of_month: Optional[int] = None  # 1-31
    
    # Cron configuration
    cron_expression: Optional[str] = None
    
    # One-time configuration
    execute_at: Optional[datetime] = None
    
    # General configuration
    timezone: str = "UTC"
    max_instances: int = 1  # Maximum concurrent instances
    retry_attempts: int = 3
    retry_delay_seconds: int = 60


class ScheduledJob(BaseModel):
    """Scheduled job definition."""
    job_id: str
    name: str
    description: str
    
    # Function details
    function_name: str
    module_path: str
    args: List[Any] = []
    kwargs: Dict[str, Any] = {}
    
    # Schedule
    schedule_config: Dict[str, Any]  # ScheduleConfig as dict
    
    # Execution control
    is_enabled: bool = True
    priority: JobPriority = JobPriority.NORMAL
    timeout_seconds: Optional[int] = None
    
    # Tracking
    created_at: datetime
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    run_count: int = 0
    success_count: int = 0
    failure_count: int = 0
    
    # Metadata
    tags: List[str] = []
    owner: str = "system"


class JobExecution(BaseModel):
    """Job execution record."""
    execution_id: str
    job_id: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    status: JobStatus
    
    # Results
    result: Optional[Any] = None
    error_message: Optional[str] = None
    logs: List[str] = []
    
    # Performance
    duration_seconds: Optional[float] = None
    memory_usage_mb: Optional[float] = None
    cpu_usage_percent: Optional[float] = None


class AutomationScheduler(LoggerMixin):
    """
    Advanced Automation Scheduler for MarketFinder ETL.
    
    Provides intelligent job scheduling, execution monitoring, and automated
    task management with support for complex scheduling patterns.
    """
    
    def __init__(self):
        # Job registry
        self.scheduled_jobs: Dict[str, ScheduledJob] = {}
        self.job_executions: Dict[str, JobExecution] = {}
        
        # Execution tracking
        self.running_executions: Dict[str, asyncio.Task] = {}
        self.execution_history: List[JobExecution] = []
        
        # Scheduler state
        self.is_running = False
        self.scheduler_task: Optional[asyncio.Task] = None
        
        # Job functions registry
        self.registered_functions: Dict[str, Callable] = {}
        
        # Statistics
        self.total_executions = 0
        self.successful_executions = 0
        self.failed_executions = 0
        
        # Callbacks
        self.job_callbacks: Dict[str, List[Callable]] = {
            "before_execution": [],
            "after_execution": [],
            "on_success": [],
            "on_failure": []
        }
        
        # Initialize default jobs
        self._initialize_default_jobs()
    
    def _initialize_default_jobs(self) -> None:
        """Initialize default scheduled jobs for MarketFinder ETL."""
        
        # Data pipeline execution - every 30 minutes
        self.schedule_job(
            name="data_pipeline_execution",
            description="Execute main ETL data pipeline",
            function_name="execute_pipeline",
            module_path="marketfinder_etl.pipeline.orchestrator",
            schedule_config=ScheduleConfig(
                schedule_type=ScheduleType.INTERVAL,
                interval_minutes=30
            ),
            priority=JobPriority.HIGH,
            timeout_seconds=1800  # 30 minutes
        )
        
        # Market data refresh - every 5 minutes
        self.schedule_job(
            name="market_data_refresh",
            description="Refresh market data from external APIs",
            function_name="refresh_market_data",
            module_path="marketfinder_etl.fetchers.market_fetcher",
            schedule_config=ScheduleConfig(
                schedule_type=ScheduleType.INTERVAL,
                interval_minutes=5
            ),
            priority=JobPriority.NORMAL
        )
        
        # Model performance monitoring - daily at 2 AM
        self.schedule_job(
            name="model_performance_monitoring",
            description="Monitor ML model performance and trigger retraining if needed",
            function_name="check_model_performance",
            module_path="marketfinder_etl.ml.model_lifecycle",
            schedule_config=ScheduleConfig(
                schedule_type=ScheduleType.DAILY,
                at_time="02:00"
            ),
            priority=JobPriority.NORMAL
        )
        
        # Database cleanup - weekly on Sunday at 3 AM
        self.schedule_job(
            name="database_cleanup",
            description="Clean up old database records and optimize storage",
            function_name="cleanup_database",
            module_path="marketfinder_etl.database.maintenance",
            schedule_config=ScheduleConfig(
                schedule_type=ScheduleType.WEEKLY,
                weekday="sunday",
                at_time="03:00"
            ),
            priority=JobPriority.LOW
        )
        
        # System health check - every 10 minutes
        self.schedule_job(
            name="system_health_check",
            description="Perform comprehensive system health checks",
            function_name="perform_health_check",
            module_path="marketfinder_etl.monitoring.health_checker",
            schedule_config=ScheduleConfig(
                schedule_type=ScheduleType.INTERVAL,
                interval_minutes=10
            ),
            priority=JobPriority.HIGH
        )
    
    async def start(self) -> None:
        """Start the automation scheduler."""
        
        if self.is_running:
            return
        
        self.is_running = True
        self.scheduler_task = asyncio.create_task(self._scheduler_loop())
        
        self.logger.info("Automation scheduler started")
    
    async def stop(self) -> None:
        """Stop the automation scheduler."""
        
        if not self.is_running:
            return
        
        self.is_running = False
        
        # Cancel scheduler task
        if self.scheduler_task and not self.scheduler_task.done():
            self.scheduler_task.cancel()
            try:
                await self.scheduler_task
            except asyncio.CancelledError:
                pass
        
        # Cancel running executions
        for execution_id, task in list(self.running_executions.items()):
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        
        self.running_executions.clear()
        
        self.logger.info("Automation scheduler stopped")
    
    async def _scheduler_loop(self) -> None:
        """Main scheduler loop."""
        
        while self.is_running:
            try:
                current_time = datetime.utcnow()
                
                # Check all scheduled jobs
                for job in self.scheduled_jobs.values():
                    if not job.is_enabled:
                        continue
                    
                    # Check if job should run
                    if await self._should_execute_job(job, current_time):
                        await self._queue_job_execution(job)
                
                # Clean up completed executions
                await self._cleanup_completed_executions()
                
                # Sleep for a short interval
                await asyncio.sleep(30)  # Check every 30 seconds
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error in scheduler loop: {e}")
                await asyncio.sleep(60)  # Wait longer on error
    
    async def _should_execute_job(self, job: ScheduledJob, current_time: datetime) -> bool:
        """Check if job should be executed at current time."""
        
        # Check if job is already running (respecting max_instances)
        running_count = sum(
            1 for exec_id, task in self.running_executions.items()
            if exec_id.startswith(job.job_id) and not task.done()
        )
        
        schedule_config = ScheduleConfig(**job.schedule_config)
        
        if running_count >= schedule_config.max_instances:
            return False
        
        # Check next run time
        if job.next_run_at and current_time < job.next_run_at:
            return False
        
        # Calculate if it's time to run based on schedule type
        return await self._calculate_schedule_match(job, current_time)
    
    async def _calculate_schedule_match(self, job: ScheduledJob, current_time: datetime) -> bool:
        """Calculate if current time matches job schedule."""
        
        schedule_config = ScheduleConfig(**job.schedule_config)
        
        if schedule_config.schedule_type == ScheduleType.ONE_TIME:
            if schedule_config.execute_at:
                return current_time >= schedule_config.execute_at
            return False
        
        elif schedule_config.schedule_type == ScheduleType.INTERVAL:
            if job.last_run_at is None:
                return True  # First execution
            
            interval_seconds = 0
            if schedule_config.interval_seconds:
                interval_seconds = schedule_config.interval_seconds
            elif schedule_config.interval_minutes:
                interval_seconds = schedule_config.interval_minutes * 60
            elif schedule_config.interval_hours:
                interval_seconds = schedule_config.interval_hours * 3600
            
            if interval_seconds > 0:
                next_run = job.last_run_at + timedelta(seconds=interval_seconds)
                return current_time >= next_run
        
        elif schedule_config.schedule_type == ScheduleType.DAILY:
            if schedule_config.at_time:
                target_time = datetime.strptime(schedule_config.at_time, "%H:%M").time()
                if current_time.time() >= target_time:
                    # Check if we already ran today
                    if job.last_run_at:
                        return job.last_run_at.date() < current_time.date()
                    return True
        
        elif schedule_config.schedule_type == ScheduleType.WEEKLY:
            if schedule_config.weekday and schedule_config.at_time:
                weekdays = {
                    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
                    "friday": 4, "saturday": 5, "sunday": 6
                }
                target_weekday = weekdays.get(schedule_config.weekday.lower())
                target_time = datetime.strptime(schedule_config.at_time, "%H:%M").time()
                
                if (current_time.weekday() == target_weekday and 
                    current_time.time() >= target_time):
                    # Check if we already ran this week
                    if job.last_run_at:
                        week_start = current_time - timedelta(days=current_time.weekday())
                        return job.last_run_at < week_start
                    return True
        
        return False
    
    async def _queue_job_execution(self, job: ScheduledJob) -> str:
        """Queue job for execution."""
        
        execution_id = f"{job.job_id}_{uuid.uuid4().hex[:8]}"
        
        # Create execution record
        execution = JobExecution(
            execution_id=execution_id,
            job_id=job.job_id,
            started_at=datetime.utcnow(),
            status=JobStatus.PENDING
        )
        
        self.job_executions[execution_id] = execution
        
        # Create execution task
        execution_task = asyncio.create_task(
            self._execute_job(job, execution)
        )
        
        self.running_executions[execution_id] = execution_task
        
        self.logger.info(f"Queued job execution: {job.name} ({execution_id})")
        
        return execution_id
    
    async def _execute_job(self, job: ScheduledJob, execution: JobExecution) -> None:
        """Execute a scheduled job."""
        
        start_time = datetime.utcnow()
        
        try:
            # Update execution status
            execution.status = JobStatus.RUNNING
            execution.logs.append(f"Started execution at {start_time}")
            
            # Call before_execution callbacks
            await self._call_callbacks("before_execution", job, execution)
            
            # Load and execute the function
            function = await self._load_job_function(job)
            if function is None:
                raise Exception(f"Function not found: {job.module_path}.{job.function_name}")
            
            # Execute with timeout
            schedule_config = ScheduleConfig(**job.schedule_config)
            timeout = job.timeout_seconds or schedule_config.retry_delay_seconds * 10
            
            result = await asyncio.wait_for(
                self._call_function_safely(function, job.args, job.kwargs),
                timeout=timeout
            )
            
            # Update execution record
            execution.status = JobStatus.COMPLETED
            execution.result = result
            execution.completed_at = datetime.utcnow()
            execution.duration_seconds = (execution.completed_at - start_time).total_seconds()
            execution.logs.append(f"Completed successfully in {execution.duration_seconds:.2f}s")
            
            # Update job statistics
            job.last_run_at = start_time
            job.run_count += 1
            job.success_count += 1
            
            # Update next run time
            job.next_run_at = await self._calculate_next_run_time(job)
            
            # Update global statistics
            self.successful_executions += 1
            
            # Call success callbacks
            await self._call_callbacks("on_success", job, execution)
            
            self.logger.info(f"Job completed successfully: {job.name}")
            
        except asyncio.TimeoutError:
            execution.status = JobStatus.FAILED
            execution.error_message = "Job execution timed out"
            execution.completed_at = datetime.utcnow()
            execution.duration_seconds = (execution.completed_at - start_time).total_seconds()
            execution.logs.append(f"Failed: timeout after {execution.duration_seconds:.2f}s")
            
            job.failure_count += 1
            self.failed_executions += 1
            
            await self._call_callbacks("on_failure", job, execution)
            
            self.logger.error(f"Job timed out: {job.name}")
            
        except Exception as e:
            execution.status = JobStatus.FAILED
            execution.error_message = str(e)
            execution.completed_at = datetime.utcnow()
            execution.duration_seconds = (execution.completed_at - start_time).total_seconds()
            execution.logs.append(f"Failed with error: {str(e)}")
            
            job.failure_count += 1
            self.failed_executions += 1
            
            await self._call_callbacks("on_failure", job, execution)
            
            self.logger.error(f"Job failed: {job.name} - {str(e)}")
        
        finally:
            # Update total executions
            self.total_executions += 1
            
            # Call after_execution callbacks
            await self._call_callbacks("after_execution", job, execution)
            
            # Add to history
            self.execution_history.append(execution)
            
            # Remove from running executions
            if execution.execution_id in self.running_executions:
                del self.running_executions[execution.execution_id]
    
    async def _load_job_function(self, job: ScheduledJob) -> Optional[Callable]:
        """Load job function from module path."""
        
        # Check registered functions first
        function_key = f"{job.module_path}.{job.function_name}"
        if function_key in self.registered_functions:
            return self.registered_functions[function_key]
        
        try:
            # Dynamic import
            import importlib
            module = importlib.import_module(job.module_path)
            return getattr(module, job.function_name)
        except (ImportError, AttributeError) as e:
            self.logger.error(f"Failed to load function {function_key}: {e}")
            return None
    
    async def _call_function_safely(self, function: Callable, args: List, kwargs: Dict) -> Any:
        """Call function safely, handling both sync and async functions."""
        
        if asyncio.iscoroutinefunction(function):
            return await function(*args, **kwargs)
        else:
            # Run sync function in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, lambda: function(*args, **kwargs))
    
    async def _calculate_next_run_time(self, job: ScheduledJob) -> Optional[datetime]:
        """Calculate next run time for job."""
        
        schedule_config = ScheduleConfig(**job.schedule_config)
        current_time = datetime.utcnow()
        
        if schedule_config.schedule_type == ScheduleType.ONE_TIME:
            return None  # One-time jobs don't have next run
        
        elif schedule_config.schedule_type == ScheduleType.INTERVAL:
            interval_seconds = 0
            if schedule_config.interval_seconds:
                interval_seconds = schedule_config.interval_seconds
            elif schedule_config.interval_minutes:
                interval_seconds = schedule_config.interval_minutes * 60
            elif schedule_config.interval_hours:
                interval_seconds = schedule_config.interval_hours * 3600
            
            if interval_seconds > 0:
                return current_time + timedelta(seconds=interval_seconds)
        
        elif schedule_config.schedule_type == ScheduleType.DAILY:
            if schedule_config.at_time:
                target_time = datetime.strptime(schedule_config.at_time, "%H:%M").time()
                next_run = datetime.combine(current_time.date(), target_time)
                
                # If time has passed today, schedule for tomorrow
                if next_run <= current_time:
                    next_run += timedelta(days=1)
                
                return next_run
        
        return None
    
    async def _call_callbacks(self, callback_type: str, job: ScheduledJob, execution: JobExecution) -> None:
        """Call registered callbacks."""
        
        callbacks = self.job_callbacks.get(callback_type, [])
        
        for callback in callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(job, execution)
                else:
                    callback(job, execution)
            except Exception as e:
                self.logger.error(f"Callback error ({callback_type}): {e}")
    
    async def _cleanup_completed_executions(self) -> None:
        """Clean up completed execution records."""
        
        # Keep only last 1000 executions in history
        if len(self.execution_history) > 1000:
            self.execution_history = self.execution_history[-1000:]
        
        # Clean up old job executions (keep last 100 per job)
        cutoff_time = datetime.utcnow() - timedelta(days=7)
        
        old_executions = [
            exec_id for exec_id, execution in self.job_executions.items()
            if execution.completed_at and execution.completed_at < cutoff_time
        ]
        
        for exec_id in old_executions:
            del self.job_executions[exec_id]
    
    # Public API methods
    
    def schedule_job(
        self,
        name: str,
        description: str,
        function_name: str,
        module_path: str,
        schedule_config: ScheduleConfig,
        args: List[Any] = None,
        kwargs: Dict[str, Any] = None,
        priority: JobPriority = JobPriority.NORMAL,
        timeout_seconds: Optional[int] = None,
        tags: List[str] = None,
        owner: str = "system"
    ) -> str:
        """Schedule a new job."""
        
        job_id = f"job_{uuid.uuid4().hex[:8]}"
        
        job = ScheduledJob(
            job_id=job_id,
            name=name,
            description=description,
            function_name=function_name,
            module_path=module_path,
            args=args or [],
            kwargs=kwargs or {},
            schedule_config=asdict(schedule_config),
            priority=priority,
            timeout_seconds=timeout_seconds,
            created_at=datetime.utcnow(),
            tags=tags or [],
            owner=owner
        )
        
        # Calculate next run time
        job.next_run_at = await self._calculate_next_run_time(job)
        
        self.scheduled_jobs[job_id] = job
        
        self.logger.info(f"Scheduled job: {name} ({job_id})")
        
        return job_id
    
    def register_function(self, module_path: str, function_name: str, function: Callable) -> None:
        """Register a function for job execution."""
        
        function_key = f"{module_path}.{function_name}"
        self.registered_functions[function_key] = function
        
        self.logger.info(f"Registered function: {function_key}")
    
    def unschedule_job(self, job_id: str) -> bool:
        """Unschedule a job."""
        
        if job_id in self.scheduled_jobs:
            job = self.scheduled_jobs[job_id]
            del self.scheduled_jobs[job_id]
            
            self.logger.info(f"Unscheduled job: {job.name} ({job_id})")
            return True
        
        return False
    
    def enable_job(self, job_id: str) -> bool:
        """Enable a scheduled job."""
        
        if job_id in self.scheduled_jobs:
            self.scheduled_jobs[job_id].is_enabled = True
            return True
        
        return False
    
    def disable_job(self, job_id: str) -> bool:
        """Disable a scheduled job."""
        
        if job_id in self.scheduled_jobs:
            self.scheduled_jobs[job_id].is_enabled = False
            return True
        
        return False
    
    async def execute_job_now(self, job_id: str) -> Optional[str]:
        """Execute a job immediately."""
        
        if job_id not in self.scheduled_jobs:
            return None
        
        job = self.scheduled_jobs[job_id]
        return await self._queue_job_execution(job)
    
    def get_job(self, job_id: str) -> Optional[ScheduledJob]:
        """Get scheduled job by ID."""
        return self.scheduled_jobs.get(job_id)
    
    def list_jobs(self, enabled_only: bool = False) -> List[ScheduledJob]:
        """List all scheduled jobs."""
        
        jobs = list(self.scheduled_jobs.values())
        
        if enabled_only:
            jobs = [job for job in jobs if job.is_enabled]
        
        return sorted(jobs, key=lambda j: j.created_at)
    
    def get_execution(self, execution_id: str) -> Optional[JobExecution]:
        """Get job execution by ID."""
        return self.job_executions.get(execution_id)
    
    def list_executions(self, job_id: Optional[str] = None, limit: int = 50) -> List[JobExecution]:
        """List job executions."""
        
        executions = list(self.job_executions.values())
        
        if job_id:
            executions = [ex for ex in executions if ex.job_id == job_id]
        
        executions.sort(key=lambda ex: ex.started_at, reverse=True)
        
        return executions[:limit]
    
    def add_callback(self, callback_type: str, callback: Callable) -> None:
        """Add job callback."""
        
        if callback_type in self.job_callbacks:
            self.job_callbacks[callback_type].append(callback)
    
    def get_scheduler_stats(self) -> Dict[str, Any]:
        """Get scheduler statistics."""
        
        running_jobs = len(self.running_executions)
        enabled_jobs = len([j for j in self.scheduled_jobs.values() if j.is_enabled])
        
        return {
            "is_running": self.is_running,
            "total_jobs": len(self.scheduled_jobs),
            "enabled_jobs": enabled_jobs,
            "running_executions": running_jobs,
            "total_executions": self.total_executions,
            "successful_executions": self.successful_executions,
            "failed_executions": self.failed_executions,
            "success_rate": (
                self.successful_executions / max(1, self.total_executions)
            ),
            "registered_functions": len(self.registered_functions)
        }