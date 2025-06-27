"""
Cache Manager - High-performance caching layer for MarketFinder ETL

This module provides intelligent caching for API responses, processed data,
and computed results with TTL-based expiration and memory management.
"""

import asyncio
import hashlib
import json
import pickle
from typing import Any, Dict, List, Optional, Tuple, Union
from datetime import datetime, timedelta
from dataclasses import dataclass
from enum import Enum
import weakref

from pydantic import BaseModel

from marketfinder_etl.core.logging import LoggerMixin


class CacheStrategy(str, Enum):
    """Cache eviction strategies."""
    LRU = "lru"  # Least Recently Used
    LFU = "lfu"  # Least Frequently Used
    TTL = "ttl"  # Time To Live only
    FIFO = "fifo"  # First In, First Out


class CacheMetrics(BaseModel):
    """Cache performance metrics."""
    total_requests: int = 0
    cache_hits: int = 0
    cache_misses: int = 0
    evictions: int = 0
    memory_usage_bytes: int = 0
    avg_lookup_time_ms: float = 0.0
    
    @property
    def hit_rate(self) -> float:
        """Calculate cache hit rate."""
        if self.total_requests == 0:
            return 0.0
        return self.cache_hits / self.total_requests
    
    @property
    def miss_rate(self) -> float:
        """Calculate cache miss rate."""
        return 1.0 - self.hit_rate


@dataclass
class CacheEntry:
    """Individual cache entry with metadata."""
    key: str
    value: Any
    created_at: datetime
    expires_at: Optional[datetime]
    access_count: int = 0
    last_accessed: datetime = None
    size_bytes: int = 0
    
    def __post_init__(self):
        if self.last_accessed is None:
            self.last_accessed = self.created_at
        
        # Estimate size if not provided
        if self.size_bytes == 0:
            self.size_bytes = self._estimate_size()
    
    def _estimate_size(self) -> int:
        """Estimate memory size of cached value."""
        try:
            return len(pickle.dumps(self.value))
        except:
            # Fallback estimation
            if isinstance(self.value, str):
                return len(self.value.encode('utf-8'))
            elif isinstance(self.value, (list, dict)):
                return len(json.dumps(self.value, default=str).encode('utf-8'))
            else:
                return 1024  # Default estimate
    
    @property
    def is_expired(self) -> bool:
        """Check if entry has expired."""
        if self.expires_at is None:
            return False
        return datetime.utcnow() > self.expires_at
    
    @property
    def age_seconds(self) -> float:
        """Get age of entry in seconds."""
        return (datetime.utcnow() - self.created_at).total_seconds()
    
    def touch(self) -> None:
        """Update access metadata."""
        self.access_count += 1
        self.last_accessed = datetime.utcnow()


class CacheConfig(BaseModel):
    """Cache configuration."""
    # Size limits
    max_memory_mb: int = 512
    max_entries: int = 10000
    
    # TTL settings
    default_ttl_seconds: int = 3600  # 1 hour
    max_ttl_seconds: int = 86400     # 24 hours
    
    # Eviction settings
    eviction_strategy: CacheStrategy = CacheStrategy.LRU
    eviction_batch_size: int = 100
    eviction_threshold: float = 0.9  # Evict when 90% full
    
    # Performance settings
    enable_compression: bool = False
    enable_persistence: bool = False
    persistence_file: str = "cache.pkl"
    
    # Cleanup settings
    cleanup_interval_seconds: int = 300  # 5 minutes
    auto_cleanup: bool = True


class CacheManager(LoggerMixin):
    """
    High-performance Cache Manager with intelligent eviction and monitoring.
    
    Provides in-memory caching with configurable TTL, size limits, and
    eviction strategies optimized for ETL workloads.
    """
    
    def __init__(self, config: Optional[CacheConfig] = None):
        self.config = config or CacheConfig()
        self.cache: Dict[str, CacheEntry] = {}
        self.metrics = CacheMetrics()
        self._lock = asyncio.Lock()
        self._cleanup_task: Optional[asyncio.Task] = None
        
        # Start background cleanup if enabled
        if self.config.auto_cleanup:
            self._start_cleanup_task()
    
    def _start_cleanup_task(self) -> None:
        """Start background cleanup task."""
        if self._cleanup_task is None or self._cleanup_task.done():
            self._cleanup_task = asyncio.create_task(self._background_cleanup())
    
    async def _background_cleanup(self) -> None:
        """Background task for periodic cache cleanup."""
        while True:
            try:
                await asyncio.sleep(self.config.cleanup_interval_seconds)
                await self.cleanup_expired()
                await self._check_memory_pressure()
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.warning(f"Cache cleanup error: {e}")
    
    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        start_time = datetime.utcnow()
        
        async with self._lock:
            self.metrics.total_requests += 1
            
            if key not in self.cache:
                self.metrics.cache_misses += 1
                self._update_lookup_time(start_time)
                return None
            
            entry = self.cache[key]
            
            # Check if expired
            if entry.is_expired:
                del self.cache[key]
                self.metrics.cache_misses += 1
                self._update_lookup_time(start_time)
                return None
            
            # Update access metadata
            entry.touch()
            self.metrics.cache_hits += 1
            self._update_lookup_time(start_time)
            
            return entry.value
    
    async def set(
        self, 
        key: str, 
        value: Any, 
        ttl_seconds: Optional[int] = None
    ) -> bool:
        """Set value in cache with optional TTL."""
        
        async with self._lock:
            # Calculate expiration time
            if ttl_seconds is None:
                ttl_seconds = self.config.default_ttl_seconds
            
            ttl_seconds = min(ttl_seconds, self.config.max_ttl_seconds)
            
            expires_at = None
            if ttl_seconds > 0:
                expires_at = datetime.utcnow() + timedelta(seconds=ttl_seconds)
            
            # Create cache entry
            entry = CacheEntry(
                key=key,
                value=value,
                created_at=datetime.utcnow(),
                expires_at=expires_at
            )
            
            # Check memory pressure before adding
            if await self._would_exceed_limits(entry):
                await self._evict_entries()
            
            # Add to cache
            self.cache[key] = entry
            self._update_memory_usage()
            
            self.logger.debug(f"Cached value for key: {key[:50]}...")
            return True
    
    async def delete(self, key: str) -> bool:
        """Delete value from cache."""
        async with self._lock:
            if key in self.cache:
                del self.cache[key]
                self._update_memory_usage()
                return True
            return False
    
    async def clear(self) -> None:
        """Clear all cache entries."""
        async with self._lock:
            self.cache.clear()
            self.metrics.memory_usage_bytes = 0
            self.logger.info("Cache cleared")
    
    async def cleanup_expired(self) -> int:
        """Remove expired entries from cache."""
        async with self._lock:
            expired_keys = [
                key for key, entry in self.cache.items()
                if entry.is_expired
            ]
            
            for key in expired_keys:
                del self.cache[key]
            
            if expired_keys:
                self._update_memory_usage()
                self.logger.debug(f"Removed {len(expired_keys)} expired cache entries")
            
            return len(expired_keys)
    
    async def _would_exceed_limits(self, new_entry: CacheEntry) -> bool:
        """Check if adding entry would exceed cache limits."""
        
        # Check entry count limit
        if len(self.cache) >= self.config.max_entries:
            return True
        
        # Check memory limit
        max_memory_bytes = self.config.max_memory_mb * 1024 * 1024
        projected_usage = self.metrics.memory_usage_bytes + new_entry.size_bytes
        
        return projected_usage > (max_memory_bytes * self.config.eviction_threshold)
    
    async def _check_memory_pressure(self) -> None:
        """Check for memory pressure and trigger eviction if needed."""
        max_memory_bytes = self.config.max_memory_mb * 1024 * 1024
        
        if self.metrics.memory_usage_bytes > (max_memory_bytes * self.config.eviction_threshold):
            await self._evict_entries()
    
    async def _evict_entries(self) -> int:
        """Evict entries based on configured strategy."""
        
        if not self.cache:
            return 0
        
        # Determine number of entries to evict
        entries_to_evict = min(
            self.config.eviction_batch_size,
            max(1, len(self.cache) // 10)  # Evict at least 10% of entries
        )
        
        # Get entries to evict based on strategy
        if self.config.eviction_strategy == CacheStrategy.LRU:
            entries_to_remove = sorted(
                self.cache.items(),
                key=lambda x: x[1].last_accessed
            )[:entries_to_evict]
        
        elif self.config.eviction_strategy == CacheStrategy.LFU:
            entries_to_remove = sorted(
                self.cache.items(),
                key=lambda x: x[1].access_count
            )[:entries_to_evict]
        
        elif self.config.eviction_strategy == CacheStrategy.FIFO:
            entries_to_remove = sorted(
                self.cache.items(),
                key=lambda x: x[1].created_at
            )[:entries_to_evict]
        
        else:  # TTL strategy - remove entries closest to expiration
            entries_to_remove = sorted(
                self.cache.items(),
                key=lambda x: x[1].expires_at or datetime.max
            )[:entries_to_evict]
        
        # Remove selected entries
        for key, _ in entries_to_remove:
            del self.cache[key]
        
        self.metrics.evictions += len(entries_to_remove)
        self._update_memory_usage()
        
        self.logger.debug(f"Evicted {len(entries_to_remove)} cache entries using {self.config.eviction_strategy} strategy")
        return len(entries_to_remove)
    
    def _update_memory_usage(self) -> None:
        """Update memory usage metrics."""
        total_size = sum(entry.size_bytes for entry in self.cache.values())
        self.metrics.memory_usage_bytes = total_size
    
    def _update_lookup_time(self, start_time: datetime) -> None:
        """Update average lookup time."""
        lookup_time_ms = (datetime.utcnow() - start_time).total_seconds() * 1000
        
        # Update running average
        total_requests = self.metrics.total_requests
        current_avg = self.metrics.avg_lookup_time_ms
        
        self.metrics.avg_lookup_time_ms = (
            (current_avg * (total_requests - 1) + lookup_time_ms) / total_requests
        )
    
    # Bulk operations
    
    async def get_many(self, keys: List[str]) -> Dict[str, Any]:
        """Get multiple values from cache."""
        results = {}
        
        for key in keys:
            value = await self.get(key)
            if value is not None:
                results[key] = value
        
        return results
    
    async def set_many(
        self, 
        items: Dict[str, Any], 
        ttl_seconds: Optional[int] = None
    ) -> int:
        """Set multiple values in cache."""
        success_count = 0
        
        for key, value in items.items():
            if await self.set(key, value, ttl_seconds):
                success_count += 1
        
        return success_count
    
    async def delete_many(self, keys: List[str]) -> int:
        """Delete multiple values from cache."""
        success_count = 0
        
        for key in keys:
            if await self.delete(key):
                success_count += 1
        
        return success_count
    
    # Cache key utilities
    
    def generate_key(self, *args, **kwargs) -> str:
        """Generate cache key from arguments."""
        # Create a deterministic key from arguments
        key_data = {
            'args': args,
            'kwargs': sorted(kwargs.items())
        }
        
        key_string = json.dumps(key_data, sort_keys=True, default=str)
        return hashlib.md5(key_string.encode()).hexdigest()
    
    def generate_prefix_key(self, prefix: str, *args, **kwargs) -> str:
        """Generate cache key with prefix."""
        base_key = self.generate_key(*args, **kwargs)
        return f"{prefix}:{base_key}"
    
    # Cache statistics and monitoring
    
    def get_metrics(self) -> CacheMetrics:
        """Get current cache metrics."""
        self._update_memory_usage()
        return self.metrics
    
    def get_cache_info(self) -> Dict[str, Any]:
        """Get detailed cache information."""
        self._update_memory_usage()
        
        # Calculate additional statistics
        total_entries = len(self.cache)
        expired_entries = sum(1 for entry in self.cache.values() if entry.is_expired)
        
        if total_entries > 0:
            avg_age = sum(entry.age_seconds for entry in self.cache.values()) / total_entries
            avg_access_count = sum(entry.access_count for entry in self.cache.values()) / total_entries
        else:
            avg_age = 0
            avg_access_count = 0
        
        return {
            "config": self.config.dict(),
            "metrics": self.metrics.dict(),
            "statistics": {
                "total_entries": total_entries,
                "expired_entries": expired_entries,
                "avg_age_seconds": avg_age,
                "avg_access_count": avg_access_count,
                "memory_usage_mb": self.metrics.memory_usage_bytes / (1024 * 1024),
                "memory_utilization": (
                    self.metrics.memory_usage_bytes / (self.config.max_memory_mb * 1024 * 1024)
                ) if self.config.max_memory_mb > 0 else 0
            }
        }
    
    def reset_metrics(self) -> None:
        """Reset cache metrics."""
        self.metrics = CacheMetrics()
        self.logger.info("Cache metrics reset")
    
    # Context manager support
    
    async def __aenter__(self):
        """Async context manager entry."""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self._cleanup_task and not self._cleanup_task.done():
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
    
    # Decorator for caching function results
    
    def cached(
        self, 
        ttl_seconds: Optional[int] = None, 
        key_prefix: str = "func"
    ):
        """Decorator to cache function results."""
        
        def decorator(func):
            async def wrapper(*args, **kwargs):
                # Generate cache key
                cache_key = self.generate_prefix_key(key_prefix, func.__name__, *args, **kwargs)
                
                # Try to get from cache
                cached_result = await self.get(cache_key)
                if cached_result is not None:
                    return cached_result
                
                # Execute function and cache result
                result = await func(*args, **kwargs) if asyncio.iscoroutinefunction(func) else func(*args, **kwargs)
                await self.set(cache_key, result, ttl_seconds)
                
                return result
            
            return wrapper
        return decorator