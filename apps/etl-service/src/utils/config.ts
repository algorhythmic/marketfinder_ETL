// Configuration management for the ETL service
import { ETLConfig } from '../types';

export const config: ETLConfig = {
  // Fetch configuration
  kalshi_rate_limit_ms: parseInt(process.env.KALSHI_RATE_LIMIT_MS || '100'),
  polymarket_batch_size: parseInt(process.env.POLYMARKET_BATCH_SIZE || '100'),
  max_polymarket_batches: parseInt(process.env.MAX_POLYMARKET_BATCHES || '500'), // 50K markets
  max_kalshi_pages: parseInt(process.env.MAX_KALSHI_PAGES || '50'),
  
  // Processing configuration  
  similarity_threshold: parseFloat(process.env.SIMILARITY_THRESHOLD || '0.7'),
  min_arbitrage_profit: parseFloat(process.env.MIN_ARBITRAGE_PROFIT || '0.05'),
  
  // Cron schedules
  full_etl_schedule: process.env.FULL_ETL_SCHEDULE || '0 */6 * * *',     // Every 6 hours
  incremental_etl_schedule: process.env.INCREMENTAL_ETL_SCHEDULE || '*/30 * * * *', // Every 30 minutes
  
  // Database configuration
  max_db_connections: parseInt(process.env.MAX_DB_CONNECTIONS || '10'),
  connection_timeout_ms: parseInt(process.env.CONNECTION_TIMEOUT_MS || '30000'),
};

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3001'),
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://localhost:5432/marketfinder',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // External service URLs
  CONVEX_URL: process.env.CONVEX_URL,
  VERCEL_WEBHOOK_URL: process.env.VERCEL_WEBHOOK_URL,
  
  // API keys (optional)
  KALSHI_API_KEY: process.env.KALSHI_API_KEY,
  POLYMARKET_API_KEY: process.env.POLYMARKET_API_KEY,
};

// Validate required environment variables
export function validateConfig(): void {
  const required = ['DATABASE_URL'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  console.log('✅ Configuration validated');
}