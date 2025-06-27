// Core data types for the ETL service

export interface RawKalshiMarket {
  ticker: string;
  title: string;
  subtitle?: string;
  close_time: string;
  status: string;
  yes_ask?: number;
  yes_bid?: number;
  no_ask?: number;
  no_bid?: number;
  last_price?: number;
  volume?: number;
  volume_24h?: number;
  open_interest?: number;
  liquidity?: number;
  category?: string;
}

export interface RawPolymarketMarket {
  id: string;
  question: string;
  description?: string;
  category?: string;
  outcomes: string | string[];
  lastTradePrice?: number;
  bestBid?: number;
  bestAsk?: number;
  volumeNum?: number;
  volume?: number;
  liquidityNum?: number;
  liquidity?: number;
  endDateIso?: string;
  endDate?: string;
  startDateIso?: string;
  startDate?: string;
  active?: boolean;
}

export interface ProcessedMarket {
  id: string;
  platform: 'kalshi' | 'polymarket';
  external_id: string;
  title: string;
  description: string;
  category: string;
  yes_price: number;
  no_price: number;
  volume: number;
  liquidity: number;
  end_date: string;
  start_date?: string;
  is_active: boolean;
  processed_at: Date;
  raw_data: string;
}

export interface ArbitrageOpportunity {
  id: string;
  market_a_id: string;
  market_b_id: string;
  market_a_platform: string;
  market_b_platform: string;
  market_a_title: string;
  market_b_title: string;
  similarity_score: number;
  price_difference: number;
  profit_potential: number;
  detected_at: Date;
  is_active: boolean;
}

export interface ETLRun {
  id: string;
  run_type: 'full' | 'incremental';
  started_at: Date;
  completed_at?: Date;
  markets_processed?: number;
  arbitrage_found?: number;
  status: 'running' | 'completed' | 'failed';
  error_message?: string;
  duration_ms?: number;
}

export interface ETLConfig {
  // Fetch configuration
  kalshi_rate_limit_ms: number;
  polymarket_batch_size: number;
  max_polymarket_batches: number;
  max_kalshi_pages: number;
  
  // Processing configuration
  similarity_threshold: number;
  min_arbitrage_profit: number;
  
  // Cron schedules
  full_etl_schedule: string;
  incremental_etl_schedule: string;
  
  // Database configuration
  max_db_connections: number;
  connection_timeout_ms: number;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
  count?: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime_seconds: number;
  last_etl_run?: {
    started_at: string;
    status: string;
    markets_processed?: number;
  };
  database: {
    connected: boolean;
    total_markets: number;
    last_update: string;
  };
  external_apis: {
    kalshi: 'up' | 'down' | 'unknown';
    polymarket: 'up' | 'down' | 'unknown';
  };
}