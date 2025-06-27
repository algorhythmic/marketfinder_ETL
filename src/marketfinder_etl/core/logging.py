"""Structured logging configuration for MarketFinder ETL pipeline."""

import sys
import logging
from typing import Any, Dict, Optional
from pathlib import Path

import structlog
from rich.console import Console
from rich.logging import RichHandler

from marketfinder_etl.core.config import settings


def configure_logging() -> None:
    """Configure structured logging for the application."""
    
    # Create logs directory if it doesn't exist
    logs_dir = Path("logs")
    logs_dir.mkdir(exist_ok=True)
    
    # Configure structlog
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer() if settings.debug else structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, settings.log_level)
        ),
        logger_factory=structlog.WriteLoggerFactory(),
        cache_logger_on_first_use=True,
    )
    
    # Configure standard library logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, settings.log_level),
        handlers=[
            RichHandler(
                console=Console(stderr=True),
                rich_tracebacks=True,
                markup=True,
            )
        ] if settings.debug else [
            logging.FileHandler(logs_dir / "marketfinder_etl.log"),
            logging.StreamHandler(sys.stdout),
        ],
    )


def get_logger(name: Optional[str] = None) -> structlog.BoundLogger:
    """Get a structured logger instance.
    
    Args:
        name: Logger name, defaults to caller's module name
        
    Returns:
        Configured structlog logger
    """
    if name is None:
        # Get the caller's module name
        import inspect
        frame = inspect.currentframe()
        if frame and frame.f_back:
            name = frame.f_back.f_globals.get("__name__", "marketfinder_etl")
        else:
            name = "marketfinder_etl"
    
    return structlog.get_logger(name)


class LoggerMixin:
    """Mixin class to add structured logging to any class."""
    
    @property
    def logger(self) -> structlog.BoundLogger:
        """Get a logger instance bound to this class."""
        return get_logger(f"{self.__class__.__module__}.{self.__class__.__name__}")
    
    def log_method_call(self, method_name: str, **kwargs: Any) -> None:
        """Log a method call with parameters."""
        self.logger.debug(
            "Method called",
            method=method_name,
            class_name=self.__class__.__name__,
            **kwargs
        )
    
    def log_error(self, error: Exception, context: Optional[Dict[str, Any]] = None) -> None:
        """Log an error with context."""
        self.logger.error(
            "Error occurred",
            error_type=type(error).__name__,
            error_message=str(error),
            class_name=self.__class__.__name__,
            **(context or {})
        )


# Initialize logging when module is imported
configure_logging()