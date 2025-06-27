"""Base extractor class for market data extraction."""

import asyncio
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, AsyncGenerator
from datetime import datetime
import time

import httpx
from pydantic import BaseModel

from marketfinder_etl.core.config import settings
from marketfinder_etl.core.logging import LoggerMixin
from marketfinder_etl.models.market import RawMarketData, MarketPlatform


class ExtractorConfig(BaseModel):
    """Configuration for data extractors."""
    
    timeout: int = 30
    max_retries: int = 3
    backoff_factor: float = 2.0
    max_concurrent_requests: int = 10
    rate_limit_per_second: float = 5.0
    user_agent: str = "MarketFinder-ETL/1.0"


class RateLimiter:
    """Simple rate limiter for API calls."""
    
    def __init__(self, calls_per_second: float):
        self.calls_per_second = calls_per_second
        self.min_interval = 1.0 / calls_per_second
        self.last_call_time = 0.0
    
    async def acquire(self) -> None:
        """Wait if necessary to respect rate limits."""
        current_time = time.time()
        time_since_last_call = current_time - self.last_call_time
        
        if time_since_last_call < self.min_interval:
            sleep_time = self.min_interval - time_since_last_call
            await asyncio.sleep(sleep_time)
        
        self.last_call_time = time.time()


class BaseExtractor(LoggerMixin, ABC):
    """Base class for market data extractors."""
    
    def __init__(self, config: Optional[ExtractorConfig] = None):
        self.config = config or ExtractorConfig()
        self.rate_limiter = RateLimiter(self.config.rate_limit_per_second)
        self._session: Optional[httpx.AsyncClient] = None
    
    @property
    def session(self) -> httpx.AsyncClient:
        """Get or create HTTP session."""
        if self._session is None:
            self._session = httpx.AsyncClient(
                timeout=httpx.Timeout(self.config.timeout),
                headers={
                    "User-Agent": self.config.user_agent,
                    **self.get_auth_headers()
                },
                limits=httpx.Limits(
                    max_connections=self.config.max_concurrent_requests,
                    max_keepalive_connections=5
                )
            )
        return self._session
    
    async def __aenter__(self):
        """Async context manager entry."""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()
    
    async def close(self) -> None:
        """Close HTTP session."""
        if self._session:
            await self._session.aclose()
            self._session = None
    
    @abstractmethod
    def get_platform(self) -> MarketPlatform:
        """Get the platform this extractor handles."""
        pass
    
    @abstractmethod
    def get_auth_headers(self) -> Dict[str, str]:
        """Get authentication headers for API requests."""
        pass
    
    @abstractmethod
    def get_base_url(self) -> str:
        """Get base URL for API requests."""
        pass
    
    @abstractmethod
    async def extract_markets(self) -> List[RawMarketData]:
        """Extract market data from the platform."""
        pass
    
    async def make_request(
        self,
        method: str,
        url: str,
        **kwargs: Any
    ) -> Dict[str, Any]:
        """Make an HTTP request with retry logic and rate limiting."""
        await self.rate_limiter.acquire()
        
        full_url = f"{self.get_base_url().rstrip('/')}/{url.lstrip('/')}"
        
        for attempt in range(self.config.max_retries + 1):
            try:
                self.logger.debug(
                    "Making API request",
                    method=method,
                    url=full_url,
                    attempt=attempt + 1
                )
                
                response = await self.session.request(method, full_url, **kwargs)
                response.raise_for_status()
                
                return response.json()
                
            except httpx.HTTPStatusError as e:
                self.logger.warning(
                    "HTTP error in API request",
                    status_code=e.response.status_code,
                    url=full_url,
                    attempt=attempt + 1
                )
                
                # Don't retry on client errors (4xx)
                if 400 <= e.response.status_code < 500:
                    raise
                
                if attempt == self.config.max_retries:
                    raise
                
                # Exponential backoff
                wait_time = self.config.backoff_factor ** attempt
                await asyncio.sleep(wait_time)
                
            except Exception as e:
                self.logger.error(
                    "Request failed",
                    error=str(e),
                    url=full_url,
                    attempt=attempt + 1
                )
                
                if attempt == self.config.max_retries:
                    raise
                
                wait_time = self.config.backoff_factor ** attempt
                await asyncio.sleep(wait_time)
    
    async def extract_paginated(
        self,
        endpoint: str,
        page_param: str = "page",
        limit_param: str = "limit",
        page_size: int = 100,
        max_pages: Optional[int] = None,
        **kwargs: Any
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Extract data from paginated endpoints."""
        page = 1
        total_items = 0
        
        while True:
            if max_pages and page > max_pages:
                self.logger.info(f"Reached max pages limit: {max_pages}")
                break
            
            params = {
                page_param: page,
                limit_param: page_size,
                **kwargs.get("params", {})
            }
            
            try:
                data = await self.make_request(
                    "GET",
                    endpoint,
                    params=params,
                    **{k: v for k, v in kwargs.items() if k != "params"}
                )
                
                # Extract items from response
                items = self.extract_items_from_response(data)
                
                if not items:
                    self.logger.info(f"No more items on page {page}")
                    break
                
                total_items += len(items)
                self.logger.debug(
                    "Extracted page",
                    page=page,
                    items_on_page=len(items),
                    total_items=total_items
                )
                
                yield data
                
                # Check if we have more pages
                if not self.has_more_pages(data, len(items), page_size):
                    break
                
                page += 1
                
            except Exception as e:
                self.logger.error(f"Failed to extract page {page}: {e}")
                raise
        
        self.logger.info(f"Extraction complete: {total_items} total items from {page-1} pages")
    
    def extract_items_from_response(self, response: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract items from API response. Override in subclasses."""
        # Default implementation assumes items are at the root
        if isinstance(response, list):
            return response
        elif isinstance(response, dict):
            # Common patterns
            for key in ["data", "items", "results", "markets"]:
                if key in response:
                    return response[key]
        return []
    
    def has_more_pages(
        self,
        response: Dict[str, Any],
        items_count: int,
        page_size: int
    ) -> bool:
        """Check if there are more pages to fetch. Override in subclasses."""
        # Default implementation: if we got fewer items than page size, we're done
        return items_count == page_size
    
    def create_raw_market_data(
        self,
        external_id: str,
        raw_data: Dict[str, Any],
        api_endpoint: Optional[str] = None
    ) -> RawMarketData:
        """Create RawMarketData instance."""
        return RawMarketData(
            platform=self.get_platform(),
            external_id=external_id,
            raw_data=raw_data,
            extracted_at=datetime.utcnow(),
            api_endpoint=api_endpoint
        )
    
    async def health_check(self) -> Dict[str, Any]:
        """Check if the API is healthy and accessible."""
        try:
            # Try a simple request to test connectivity
            start_time = time.time()
            await self.make_request("GET", "")
            response_time = time.time() - start_time
            
            return {
                "healthy": True,
                "platform": self.get_platform(),
                "response_time_ms": response_time * 1000,
                "timestamp": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            return {
                "healthy": False,
                "platform": self.get_platform(),
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }