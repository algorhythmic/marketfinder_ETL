"""
Database Storage Layer - High-performance data persistence for MarketFinder ETL

This module provides efficient data storage and retrieval using DuckDB for analytics
and PostgreSQL for transactional data with automatic schema management.
"""

import asyncio
import json
from typing import Any, Dict, List, Optional, Tuple, Union
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
import uuid

import duckdb
import asyncpg
import polars as pl
from pydantic import BaseModel

from marketfinder_etl.core.logging import LoggerMixin
from marketfinder_etl.core.config import settings
from marketfinder_etl.models.market import NormalizedMarket, MarketPlatform
from marketfinder_etl.models.arbitrage import ArbitrageOpportunity, LLMEvaluation
from marketfinder_etl.transformers.data_enricher import EnrichedMarket


class DatabaseConfig(BaseModel):
    """Database configuration."""
    # DuckDB settings (for analytics)
    duckdb_path: str = "data/marketfinder.duckdb"
    duckdb_memory_limit: str = "2GB"
    duckdb_threads: int = 4
    
    # PostgreSQL settings (for transactional data)
    postgres_enabled: bool = False
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_database: str = "marketfinder"
    postgres_user: str = "postgres"
    postgres_password: str = ""
    postgres_pool_size: int = 10
    
    # Performance settings
    batch_insert_size: int = 1000
    enable_compression: bool = True
    auto_vacuum: bool = True
    
    # Retention policies
    raw_data_retention_days: int = 90
    processed_data_retention_days: int = 365
    archive_old_data: bool = True


class DatabaseManager(LoggerMixin):
    """
    Database Manager for efficient data storage and retrieval.
    
    Uses DuckDB for high-performance analytics and optional PostgreSQL
    for transactional operations with automatic schema management.
    """
    
    def __init__(self, config: Optional[DatabaseConfig] = None):
        self.config = config or DatabaseConfig()
        self.duckdb_conn: Optional[duckdb.DuckDBPyConnection] = None
        self.postgres_pool: Optional[asyncpg.Pool] = None
        self.initialized = False
        
        # Performance tracking
        self.performance_stats = {
            "total_inserts": 0,
            "total_queries": 0,
            "avg_insert_time_ms": 0,
            "avg_query_time_ms": 0,
            "cache_hits": 0,
            "cache_misses": 0
        }
    
    async def initialize(self) -> None:
        """Initialize database connections and create schemas."""
        
        if self.initialized:
            return
        
        try:
            # Initialize DuckDB
            await self._initialize_duckdb()
            
            # Initialize PostgreSQL if enabled
            if self.config.postgres_enabled:
                await self._initialize_postgres()
            
            # Create database schemas
            await self._create_schemas()
            
            self.initialized = True
            self.logger.info("Database manager initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize database manager: {e}")
            raise
    
    async def _initialize_duckdb(self) -> None:
        """Initialize DuckDB connection and configuration."""
        
        # Ensure data directory exists
        db_path = Path(self.config.duckdb_path)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Create DuckDB connection
        self.duckdb_conn = duckdb.connect(
            database=str(db_path),
            read_only=False
        )
        
        # Configure DuckDB settings
        self.duckdb_conn.execute(f"SET memory_limit='{self.config.duckdb_memory_limit}'")
        self.duckdb_conn.execute(f"SET threads={self.config.duckdb_threads}")
        
        if self.config.enable_compression:
            self.duckdb_conn.execute("SET enable_object_cache=true")
        
        self.logger.info(f"DuckDB initialized at {db_path}")
    
    async def _initialize_postgres(self) -> None:
        """Initialize PostgreSQL connection pool."""
        
        try:
            self.postgres_pool = await asyncpg.create_pool(
                host=self.config.postgres_host,
                port=self.config.postgres_port,
                database=self.config.postgres_database,
                user=self.config.postgres_user,
                password=self.config.postgres_password,
                min_size=2,
                max_size=self.config.postgres_pool_size
            )
            
            self.logger.info("PostgreSQL connection pool initialized")
            
        except Exception as e:
            self.logger.warning(f"PostgreSQL initialization failed: {e}")
            self.config.postgres_enabled = False
    
    async def _create_schemas(self) -> None:
        """Create database schemas and tables."""
        
        # DuckDB schema creation
        await self._create_duckdb_schemas()
        
        # PostgreSQL schema creation if enabled
        if self.config.postgres_enabled and self.postgres_pool:
            await self._create_postgres_schemas()
    
    async def _create_duckdb_schemas(self) -> None:
        """Create DuckDB schemas and tables."""
        
        # Raw market data table
        self.duckdb_conn.execute("""
            CREATE TABLE IF NOT EXISTS raw_markets (
                id VARCHAR PRIMARY KEY,
                platform VARCHAR NOT NULL,
                external_id VARCHAR NOT NULL,
                raw_data JSON NOT NULL,
                fetched_at TIMESTAMP NOT NULL,
                processing_status VARCHAR DEFAULT 'pending'
            )
        """)
        
        # Normalized markets table
        self.duckdb_conn.execute("""
            CREATE TABLE IF NOT EXISTS normalized_markets (
                id VARCHAR PRIMARY KEY,
                platform VARCHAR NOT NULL,
                external_id VARCHAR NOT NULL,
                title VARCHAR NOT NULL,
                description TEXT,
                category VARCHAR,
                event_type VARCHAR,
                status VARCHAR,
                volume DECIMAL(18,4),
                liquidity DECIMAL(18,4),
                created_date TIMESTAMP,
                end_date TIMESTAMP,
                normalized_at TIMESTAMP NOT NULL,
                outcomes JSON NOT NULL,
                metadata JSON
            )
        """)
        
        # Enriched markets table
        self.duckdb_conn.execute("""
            CREATE TABLE IF NOT EXISTS enriched_markets (
                id VARCHAR PRIMARY KEY,
                market_id VARCHAR NOT NULL,
                historical_context JSON,
                volatility_metrics JSON,
                sentiment JSON,
                trend_analysis JSON,
                correlation_score DOUBLE,
                enrichment_timestamp TIMESTAMP NOT NULL,
                enrichment_version VARCHAR,
                FOREIGN KEY (market_id) REFERENCES normalized_markets(id)
            )
        """)
        
        # Arbitrage opportunities table
        self.duckdb_conn.execute("""
            CREATE TABLE IF NOT EXISTS arbitrage_opportunities (
                id VARCHAR PRIMARY KEY,
                opportunity_id VARCHAR UNIQUE NOT NULL,
                market1_id VARCHAR NOT NULL,
                market2_id VARCHAR NOT NULL,
                arbitrage_type VARCHAR NOT NULL,
                strategy JSON NOT NULL,
                position_size DECIMAL(18,4),
                expected_profit_usd DECIMAL(18,4),
                expected_profit_percentage DOUBLE,
                risk_level VARCHAR,
                risk_score DOUBLE,
                llm_confidence DOUBLE,
                llm_reasoning TEXT,
                status VARCHAR DEFAULT 'detected',
                priority_score DOUBLE,
                detected_at TIMESTAMP NOT NULL,
                expires_at TIMESTAMP,
                executed_at TIMESTAMP,
                metrics JSON,
                transaction_costs JSON,
                risk_assessment JSON
            )
        """)
        
        # LLM evaluations table
        self.duckdb_conn.execute("""
            CREATE TABLE IF NOT EXISTS llm_evaluations (
                id VARCHAR PRIMARY KEY,
                pair_id VARCHAR NOT NULL,
                market1_id VARCHAR NOT NULL,
                market2_id VARCHAR NOT NULL,
                confidence_score DOUBLE NOT NULL,
                semantic_similarity DOUBLE,
                arbitrage_viability DOUBLE,
                reasoning TEXT,
                risk_assessment TEXT,
                recommended_action VARCHAR,
                ml_score DOUBLE,
                provider_used VARCHAR,
                model_version VARCHAR,
                processing_time_ms INTEGER,
                evaluation_timestamp TIMESTAMP NOT NULL,
                features JSON
            )
        """)
        
        # Pipeline execution logs
        self.duckdb_conn.execute("""
            CREATE TABLE IF NOT EXISTS pipeline_executions (
                id VARCHAR PRIMARY KEY,
                execution_id VARCHAR NOT NULL,
                stage VARCHAR NOT NULL,
                status VARCHAR NOT NULL,
                input_count INTEGER,
                output_count INTEGER,
                processing_time_ms INTEGER,
                error_message TEXT,
                metrics JSON,
                started_at TIMESTAMP NOT NULL,
                completed_at TIMESTAMP
            )
        """)
        
        # Create indexes for better performance
        self._create_duckdb_indexes()
        
        self.logger.info("DuckDB schemas created successfully")
    
    def _create_duckdb_indexes(self) -> None:
        """Create indexes for improved query performance."""
        
        indexes = [
            # Raw markets indexes
            "CREATE INDEX IF NOT EXISTS idx_raw_markets_platform ON raw_markets(platform)",
            "CREATE INDEX IF NOT EXISTS idx_raw_markets_fetched_at ON raw_markets(fetched_at)",
            "CREATE INDEX IF NOT EXISTS idx_raw_markets_status ON raw_markets(processing_status)",
            
            # Normalized markets indexes
            "CREATE INDEX IF NOT EXISTS idx_normalized_markets_platform ON normalized_markets(platform)",
            "CREATE INDEX IF NOT EXISTS idx_normalized_markets_category ON normalized_markets(category)",
            "CREATE INDEX IF NOT EXISTS idx_normalized_markets_end_date ON normalized_markets(end_date)",
            "CREATE INDEX IF NOT EXISTS idx_normalized_markets_volume ON normalized_markets(volume)",
            
            # Arbitrage opportunities indexes
            "CREATE INDEX IF NOT EXISTS idx_arbitrage_status ON arbitrage_opportunities(status)",
            "CREATE INDEX IF NOT EXISTS idx_arbitrage_detected_at ON arbitrage_opportunities(detected_at)",
            "CREATE INDEX IF NOT EXISTS idx_arbitrage_priority ON arbitrage_opportunities(priority_score)",
            "CREATE INDEX IF NOT EXISTS idx_arbitrage_profit ON arbitrage_opportunities(expected_profit_usd)",
            
            # LLM evaluations indexes
            "CREATE INDEX IF NOT EXISTS idx_llm_confidence ON llm_evaluations(confidence_score)",
            "CREATE INDEX IF NOT EXISTS idx_llm_timestamp ON llm_evaluations(evaluation_timestamp)",
            
            # Pipeline execution indexes
            "CREATE INDEX IF NOT EXISTS idx_pipeline_execution_id ON pipeline_executions(execution_id)",
            "CREATE INDEX IF NOT EXISTS idx_pipeline_stage ON pipeline_executions(stage)",
            "CREATE INDEX IF NOT EXISTS idx_pipeline_started_at ON pipeline_executions(started_at)"
        ]
        
        for index_sql in indexes:
            try:
                self.duckdb_conn.execute(index_sql)
            except Exception as e:
                self.logger.warning(f"Failed to create index: {e}")
    
    async def _create_postgres_schemas(self) -> None:
        """Create PostgreSQL schemas (for transactional data)."""
        
        if not self.postgres_pool:
            return
        
        async with self.postgres_pool.acquire() as conn:
            # User sessions and real-time data
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS user_sessions (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id VARCHAR NOT NULL,
                    session_token VARCHAR NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    expires_at TIMESTAMP NOT NULL,
                    last_activity TIMESTAMP DEFAULT NOW()
                )
            """)
            
            # Real-time market updates
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS market_updates (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    market_id VARCHAR NOT NULL,
                    platform VARCHAR NOT NULL,
                    update_type VARCHAR NOT NULL,
                    old_value JSON,
                    new_value JSON,
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """)
            
        self.logger.info("PostgreSQL schemas created successfully")
    
    # Data insertion methods
    
    async def store_raw_market_data(self, raw_data_list: List[Dict[str, Any]]) -> int:
        """Store raw market data in batches."""
        
        if not raw_data_list:
            return 0
        
        start_time = datetime.utcnow()
        
        try:
            # Prepare data for insertion
            records = []
            for data in raw_data_list:
                record = (
                    str(uuid.uuid4()),  # id
                    data.get("platform", ""),
                    data.get("external_id", ""),
                    json.dumps(data.get("raw_data", {})),
                    data.get("fetched_at", datetime.utcnow()),
                    "pending"
                )
                records.append(record)
            
            # Batch insert
            self.duckdb_conn.executemany(
                """INSERT INTO raw_markets 
                   (id, platform, external_id, raw_data, fetched_at, processing_status) 
                   VALUES (?, ?, ?, ?, ?, ?)""",
                records
            )
            
            # Update performance stats
            processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            self._update_insert_stats(len(records), processing_time)
            
            self.logger.info(f"Stored {len(records)} raw market records")
            return len(records)
            
        except Exception as e:
            self.logger.error(f"Failed to store raw market data: {e}")
            raise
    
    async def store_normalized_markets(self, markets: List[NormalizedMarket]) -> int:
        """Store normalized market data."""
        
        if not markets:
            return 0
        
        start_time = datetime.utcnow()
        
        try:
            records = []
            for market in markets:
                record = (
                    str(uuid.uuid4()),  # id
                    market.platform.value,
                    market.external_id,
                    market.title,
                    market.description,
                    market.category,
                    market.event_type.value if market.event_type else None,
                    market.status.value if market.status else None,
                    float(market.volume),
                    float(market.liquidity),
                    market.created_date,
                    market.end_date,
                    market.normalized_at,
                    json.dumps([outcome.dict() for outcome in market.outcomes]),
                    json.dumps(market.dict(exclude={"outcomes"}))
                )
                records.append(record)
            
            self.duckdb_conn.executemany(
                """INSERT INTO normalized_markets 
                   (id, platform, external_id, title, description, category, 
                    event_type, status, volume, liquidity, created_date, 
                    end_date, normalized_at, outcomes, metadata) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                records
            )
            
            processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            self._update_insert_stats(len(records), processing_time)
            
            self.logger.info(f"Stored {len(records)} normalized market records")
            return len(records)
            
        except Exception as e:
            self.logger.error(f"Failed to store normalized markets: {e}")
            raise
    
    async def store_arbitrage_opportunities(self, opportunities: List[ArbitrageOpportunity]) -> int:
        """Store arbitrage opportunities."""
        
        if not opportunities:
            return 0
        
        start_time = datetime.utcnow()
        
        try:
            records = []
            for opp in opportunities:
                record = (
                    str(uuid.uuid4()),  # id
                    opp.opportunity_id,
                    opp.market1_id,
                    opp.market2_id,
                    opp.arbitrage_type,
                    json.dumps(opp.strategy.dict()),
                    float(opp.position_size),
                    float(opp.metrics.expected_profit_usd),
                    opp.metrics.expected_profit_percentage,
                    opp.risk_assessment.overall_risk_level.value,
                    opp.risk_assessment.risk_score,
                    opp.llm_confidence,
                    opp.llm_reasoning,
                    opp.status,
                    opp.priority_score,
                    opp.detected_at,
                    opp.expires_at,
                    None,  # executed_at
                    json.dumps(opp.metrics.dict()),
                    json.dumps(opp.transaction_costs.dict()),
                    json.dumps(opp.risk_assessment.dict())
                )
                records.append(record)
            
            self.duckdb_conn.executemany(
                """INSERT INTO arbitrage_opportunities 
                   (id, opportunity_id, market1_id, market2_id, arbitrage_type, 
                    strategy, position_size, expected_profit_usd, expected_profit_percentage,
                    risk_level, risk_score, llm_confidence, llm_reasoning, status,
                    priority_score, detected_at, expires_at, executed_at, metrics,
                    transaction_costs, risk_assessment)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                records
            )
            
            processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            self._update_insert_stats(len(records), processing_time)
            
            self.logger.info(f"Stored {len(records)} arbitrage opportunities")
            return len(records)
            
        except Exception as e:
            self.logger.error(f"Failed to store arbitrage opportunities: {e}")
            raise
    
    # Data retrieval methods
    
    async def get_markets_by_platform(
        self, 
        platform: MarketPlatform, 
        limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Get markets by platform."""
        
        start_time = datetime.utcnow()
        
        try:
            query = """
                SELECT * FROM normalized_markets 
                WHERE platform = ? 
                ORDER BY normalized_at DESC
            """
            
            if limit:
                query += f" LIMIT {limit}"
            
            result = self.duckdb_conn.execute(query, [platform.value]).fetchall()
            columns = [desc[0] for desc in self.duckdb_conn.description]
            
            markets = [dict(zip(columns, row)) for row in result]
            
            processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            self._update_query_stats(processing_time)
            
            return markets
            
        except Exception as e:
            self.logger.error(f"Failed to get markets by platform: {e}")
            raise
    
    async def get_active_arbitrage_opportunities(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get active arbitrage opportunities ordered by priority."""
        
        start_time = datetime.utcnow()
        
        try:
            result = self.duckdb_conn.execute("""
                SELECT * FROM arbitrage_opportunities 
                WHERE status = 'detected' 
                AND expires_at > NOW()
                ORDER BY priority_score DESC, expected_profit_usd DESC
                LIMIT ?
            """, [limit]).fetchall()
            
            columns = [desc[0] for desc in self.duckdb_conn.description]
            opportunities = [dict(zip(columns, row)) for row in result]
            
            processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            self._update_query_stats(processing_time)
            
            return opportunities
            
        except Exception as e:
            self.logger.error(f"Failed to get active arbitrage opportunities: {e}")
            raise
    
    async def get_pipeline_performance_metrics(self, days: int = 7) -> Dict[str, Any]:
        """Get pipeline performance metrics for the last N days."""
        
        start_time = datetime.utcnow()
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        try:
            # Get execution statistics
            exec_stats = self.duckdb_conn.execute("""
                SELECT 
                    stage,
                    COUNT(*) as executions,
                    AVG(processing_time_ms) as avg_processing_time,
                    SUM(input_count) as total_input,
                    SUM(output_count) as total_output,
                    AVG(CAST(output_count AS DOUBLE) / NULLIF(input_count, 0)) as avg_efficiency
                FROM pipeline_executions 
                WHERE started_at >= ?
                GROUP BY stage
            """, [cutoff_date]).fetchall()
            
            # Get arbitrage statistics
            arb_stats = self.duckdb_conn.execute("""
                SELECT 
                    COUNT(*) as total_opportunities,
                    SUM(expected_profit_usd) as total_potential_profit,
                    AVG(expected_profit_percentage) as avg_profit_percentage,
                    AVG(risk_score) as avg_risk_score
                FROM arbitrage_opportunities
                WHERE detected_at >= ?
            """, [cutoff_date]).fetchone()
            
            processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            self._update_query_stats(processing_time)
            
            return {
                "execution_stats": [
                    {
                        "stage": row[0],
                        "executions": row[1],
                        "avg_processing_time_ms": row[2],
                        "total_input": row[3],
                        "total_output": row[4],
                        "avg_efficiency": row[5]
                    }
                    for row in exec_stats
                ],
                "arbitrage_stats": {
                    "total_opportunities": arb_stats[0],
                    "total_potential_profit": arb_stats[1],
                    "avg_profit_percentage": arb_stats[2],
                    "avg_risk_score": arb_stats[3]
                } if arb_stats else {}
            }
            
        except Exception as e:
            self.logger.error(f"Failed to get pipeline performance metrics: {e}")
            raise
    
    # Utility methods
    
    def _update_insert_stats(self, record_count: int, processing_time_ms: float) -> None:
        """Update insertion performance statistics."""
        self.performance_stats["total_inserts"] += 1
        
        # Update average insert time
        current_avg = self.performance_stats["avg_insert_time_ms"]
        total_inserts = self.performance_stats["total_inserts"]
        
        self.performance_stats["avg_insert_time_ms"] = (
            (current_avg * (total_inserts - 1) + processing_time_ms) / total_inserts
        )
    
    def _update_query_stats(self, processing_time_ms: float) -> None:
        """Update query performance statistics."""
        self.performance_stats["total_queries"] += 1
        
        # Update average query time
        current_avg = self.performance_stats["avg_query_time_ms"]
        total_queries = self.performance_stats["total_queries"]
        
        self.performance_stats["avg_query_time_ms"] = (
            (current_avg * (total_queries - 1) + processing_time_ms) / total_queries
        )
    
    async def cleanup_old_data(self) -> Dict[str, int]:
        """Clean up old data based on retention policies."""
        
        if not self.config.archive_old_data:
            return {}
        
        cleanup_stats = {}
        
        try:
            # Clean up old raw data
            raw_cutoff = datetime.utcnow() - timedelta(days=self.config.raw_data_retention_days)
            raw_deleted = self.duckdb_conn.execute(
                "DELETE FROM raw_markets WHERE fetched_at < ?",
                [raw_cutoff]
            ).fetchone()
            cleanup_stats["raw_markets_deleted"] = raw_deleted[0] if raw_deleted else 0
            
            # Clean up old processed data
            processed_cutoff = datetime.utcnow() - timedelta(days=self.config.processed_data_retention_days)
            processed_deleted = self.duckdb_conn.execute(
                "DELETE FROM normalized_markets WHERE normalized_at < ?",
                [processed_cutoff]
            ).fetchone()
            cleanup_stats["processed_markets_deleted"] = processed_deleted[0] if processed_deleted else 0
            
            # Vacuum if enabled
            if self.config.auto_vacuum:
                self.duckdb_conn.execute("VACUUM")
            
            self.logger.info(f"Data cleanup completed", **cleanup_stats)
            return cleanup_stats
            
        except Exception as e:
            self.logger.error(f"Failed to cleanup old data: {e}")
            return {}
    
    async def get_database_stats(self) -> Dict[str, Any]:
        """Get comprehensive database statistics."""
        
        try:
            # Table row counts
            tables = ["raw_markets", "normalized_markets", "enriched_markets", 
                     "arbitrage_opportunities", "llm_evaluations", "pipeline_executions"]
            
            table_stats = {}
            for table in tables:
                result = self.duckdb_conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()
                table_stats[table] = result[0] if result else 0
            
            # Database file size
            db_path = Path(self.config.duckdb_path)
            file_size_mb = db_path.stat().st_size / (1024 * 1024) if db_path.exists() else 0
            
            return {
                "table_stats": table_stats,
                "database_size_mb": round(file_size_mb, 2),
                "performance_stats": self.performance_stats,
                "config": self.config.dict()
            }
            
        except Exception as e:
            self.logger.error(f"Failed to get database stats: {e}")
            return {}
    
    async def close(self) -> None:
        """Close database connections."""
        
        if self.duckdb_conn:
            self.duckdb_conn.close()
            self.duckdb_conn = None
        
        if self.postgres_pool:
            await self.postgres_pool.close()
            self.postgres_pool = None
        
        self.initialized = False
        self.logger.info("Database connections closed")