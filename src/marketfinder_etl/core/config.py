"""Configuration management for MarketFinder ETL pipeline."""

from typing import Optional, List
from pydantic import Field, validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings with environment variable support."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )
    
    # Application
    app_name: str = "MarketFinder ETL"
    app_version: str = "0.1.0"
    debug: bool = False
    log_level: str = "INFO"
    
    # API Keys
    kalshi_email: Optional[str] = Field(None, description="Kalshi API email")
    kalshi_password: Optional[str] = Field(None, description="Kalshi API password")
    polymarket_api_key: Optional[str] = Field(None, description="Polymarket API key")
    
    # LLM Providers
    openai_api_key: Optional[str] = Field(None, description="OpenAI API key")
    anthropic_api_key: Optional[str] = Field(None, description="Anthropic API key")
    google_vertex_ai_key: Optional[str] = Field(None, description="Google Vertex AI key")
    google_project_id: Optional[str] = Field(None, description="Google Cloud project ID")
    
    # Database
    database_url: Optional[str] = Field(None, description="Primary database URL")
    duckdb_path: str = Field("data/unified_markets.db", description="DuckDB file path")
    convex_deployment: Optional[str] = Field(None, description="Convex deployment URL")
    
    # Redis (for caching and task queuing)
    redis_host: str = Field("localhost", description="Redis host")
    redis_port: int = Field(6379, description="Redis port")
    redis_db: int = Field(0, description="Redis database number")
    redis_password: Optional[str] = Field(None, description="Redis password")
    
    # Processing Configuration
    max_llm_calls_per_minute: int = Field(60, description="LLM rate limit")
    bucket_processing_batch_size: int = Field(1000, description="Batch size for processing")
    ml_model_update_frequency: str = Field("daily", description="ML model update frequency")
    
    # Airflow Configuration
    airflow_home: str = Field("./airflow", description="Airflow home directory")
    airflow_dags_folder: str = Field("./dags", description="Airflow DAGs folder")
    airflow_webserver_port: int = Field(8080, description="Airflow webserver port")
    
    # API Server
    api_host: str = Field("0.0.0.0", description="API server host")
    api_port: int = Field(8000, description="API server port")
    api_workers: int = Field(1, description="Number of API workers")
    
    # Data Processing
    enable_parallel_processing: bool = Field(True, description="Enable parallel processing")
    max_concurrent_requests: int = Field(10, description="Max concurrent API requests")
    request_timeout: int = Field(30, description="Request timeout in seconds")
    
    # Market Data Settings
    kalshi_base_url: str = Field("https://trading-api.kalshi.com/v1", description="Kalshi API base URL")
    polymarket_base_url: str = Field("https://gamma-api.polymarket.com", description="Polymarket API base URL")
    
    # Monitoring
    enable_prometheus: bool = Field(True, description="Enable Prometheus metrics")
    prometheus_port: int = Field(9090, description="Prometheus metrics port")
    
    @validator("log_level")
    def validate_log_level(cls, v: str) -> str:
        """Validate log level."""
        valid_levels = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        if v.upper() not in valid_levels:
            raise ValueError(f"Log level must be one of {valid_levels}")
        return v.upper()
    
    @validator("ml_model_update_frequency")
    def validate_update_frequency(cls, v: str) -> str:
        """Validate model update frequency."""
        valid_frequencies = {"hourly", "daily", "weekly", "monthly"}
        if v.lower() not in valid_frequencies:
            raise ValueError(f"Update frequency must be one of {valid_frequencies}")
        return v.lower()
    
    @property
    def redis_url(self) -> str:
        """Get Redis connection URL."""
        if self.redis_password:
            return f"redis://:{self.redis_password}@{self.redis_host}:{self.redis_port}/{self.redis_db}"
        return f"redis://{self.redis_host}:{self.redis_port}/{self.redis_db}"
    
    @property
    def duckdb_url(self) -> str:
        """Get DuckDB connection URL."""
        return f"duckdb:///{self.duckdb_path}"


# Global settings instance
settings = Settings()