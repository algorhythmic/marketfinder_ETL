# Scripts Directory

This directory contains TypeScript scripts for testing and managing the MarketFinder ETL pipeline.

## Available Scripts

### Core Testing
- **`test-pagination-with-duckdb.ts`** - Tests pagination with persistent DuckDB storage
- **`pagination-summary.ts`** - Generates summary report of pagination test results
- **`simple-count.ts`** - Simple data verification script

### Database Management  
- **`setup-local-duckdb.ts`** - Sets up persistent DuckDB instance with proper schema
- **`query-duckdb.ts`** - Comprehensive database analysis and querying

## NPM Scripts

Run these from the project root:

```bash
# Database setup
npm run setup:duckdb

# Pagination testing
npm run test:pagination
npm run pagination:summary

# Database analysis
npm run query:duckdb

# ETL pipeline testing
npm run test:etl
```

## Architecture

**Data Flow:**
1. **Setup** → Create persistent DuckDB with schema
2. **Pagination Test** → Fetch 500+ markets across multiple API batches  
3. **Storage** → Store in DuckDB with duplicate prevention
4. **Analysis** → Query and analyze stored data

**Key Features:**
- ✅ TypeScript-first with proper typing
- ✅ Persistent DuckDB storage  
- ✅ Pagination with offset/limit
- ✅ Error handling and run tracking
- ✅ Comprehensive data analysis
- ✅ Production-ready patterns

## Database Schema

```sql
-- Market data
raw_markets (id, platform, external_id, title, description, category, 
             yes_price, no_price, volume, liquidity, end_date, is_active, 
             start_date, fetched_at, raw_data)

-- Pagination tracking
fetch_runs (run_id, platform, started_at, completed_at, total_markets, 
            batches_processed, max_offset, status, error_message)

-- Market relationships  
market_similarities (id, kalshi_id, polymarket_id, confidence, 
                     similarity_type, detected_at)
```

All scripts use the official `@duckdb/node-api` for optimal TypeScript support.