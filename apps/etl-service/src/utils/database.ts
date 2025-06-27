// Database connection and utilities
import { Pool, PoolClient } from 'pg';
import { env, config } from './config';
import { logger } from './logger';

// Database connection pool
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: config.max_db_connections,
  idleTimeoutMillis: config.connection_timeout_ms,
  connectionTimeoutMillis: config.connection_timeout_ms,
});

// Database schema initialization
export async function initializeDatabase(): Promise<void> {
  const client = await pool.connect();
  
  try {
    logger.info('Initializing database schema...');
    
    // Create processed_markets table
    await client.query(`
      CREATE TABLE IF NOT EXISTS processed_markets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        platform VARCHAR(20) NOT NULL,
        external_id VARCHAR(100) NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        category VARCHAR(50),
        yes_price DECIMAL(5,3),
        no_price DECIMAL(5,3),
        volume DECIMAL(12,2),
        liquidity DECIMAL(12,2),
        end_date TIMESTAMP,
        start_date TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        processed_at TIMESTAMP DEFAULT NOW(),
        raw_data JSONB,
        UNIQUE(platform, external_id)
      )
    `);
    
    // Create arbitrage_opportunities table
    await client.query(`
      CREATE TABLE IF NOT EXISTS arbitrage_opportunities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        market_a_id UUID REFERENCES processed_markets(id),
        market_b_id UUID REFERENCES processed_markets(id),
        market_a_platform VARCHAR(20) NOT NULL,
        market_b_platform VARCHAR(20) NOT NULL,
        market_a_title TEXT NOT NULL,
        market_b_title TEXT NOT NULL,
        similarity_score DECIMAL(3,2),
        price_difference DECIMAL(5,3),
        profit_potential DECIMAL(5,3),
        detected_at TIMESTAMP DEFAULT NOW(),
        is_active BOOLEAN DEFAULT true
      )
    `);
    
    // Create etl_runs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS etl_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_type VARCHAR(20) NOT NULL,
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        markets_processed INTEGER,
        arbitrage_found INTEGER,
        status VARCHAR(20) DEFAULT 'running',
        error_message TEXT,
        duration_ms INTEGER
      )
    `);
    
    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_processed_markets_platform ON processed_markets(platform);
      CREATE INDEX IF NOT EXISTS idx_processed_markets_category ON processed_markets(category);
      CREATE INDEX IF NOT EXISTS idx_processed_markets_active ON processed_markets(is_active);
      CREATE INDEX IF NOT EXISTS idx_arbitrage_opportunities_active ON arbitrage_opportunities(is_active);
      CREATE INDEX IF NOT EXISTS idx_arbitrage_opportunities_profit ON arbitrage_opportunities(profit_potential DESC);
      CREATE INDEX IF NOT EXISTS idx_etl_runs_started ON etl_runs(started_at DESC);
    `);
    
    logger.info('✅ Database schema initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize database schema:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Helper function to get a database client with automatic cleanup
export async function withDatabase<T>(
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    return await operation(client);
  } finally {
    client.release();
  }
}

// Health check for database
export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  totalMarkets: number;
  lastUpdate: string;
}> {
  try {
    const result = await withDatabase(async (client) => {
      const countResult = await client.query('SELECT COUNT(*) as total FROM processed_markets');
      const lastUpdateResult = await client.query(
        'SELECT MAX(processed_at) as last_update FROM processed_markets'
      );
      
      return {
        connected: true,
        totalMarkets: parseInt(countResult.rows[0]?.total || '0'),
        lastUpdate: lastUpdateResult.rows[0]?.last_update || new Date().toISOString()
      };
    });
    
    return result;
  } catch (error) {
    logger.error('Database health check failed:', error);
    return {
      connected: false,
      totalMarkets: 0,
      lastUpdate: new Date().toISOString()
    };
  }
}

// Graceful shutdown
export async function closeDatabasePool(): Promise<void> {
  logger.info('Closing database connection pool...');
  await pool.end();
  logger.info('✅ Database connection pool closed');
}