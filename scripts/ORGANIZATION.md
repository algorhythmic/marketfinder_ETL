# Scripts Organization

## 📁 Folder Structure

### 🚀 **production/** - Production-Ready Scripts
Scripts that are ready for deployment and daily use:

- **`llm-arbitrage-matching.ts`** - Main LLM arbitrage detection system (AI Studio)
- **`vertex-ai-arbitrage-matching.ts`** - Enterprise LLM system (Vertex AI)  
- **`create-unified-etl-transform.ts`** - Data transformation pipeline
- **`fetch-kalshi-markets-efficient.ts`** - Optimized Kalshi data collection
- **`setup-llm-matching.sh`** - Production setup script

**Usage**: `node --import tsx/esm production/llm-arbitrage-matching.ts`

### 🛠️ **dev/** - Development Scripts  
Scripts for building, prototyping, and local development:

- **`demo-llm-matching.ts`** - Demo system (no API key required)
- **`analyze-kalshi-polymarket-mapping.ts`** - Cross-platform data analysis
- **`setup-local-duckdb.ts`** - Local database setup
- **`duckdb-server.ts`** - Database server for development
- **`improve-arbitrage-matching.ts`** - Arbitrage algorithm improvements

**Usage**: `node --import tsx/esm dev/demo-llm-matching.ts`

### 🧪 **testing/** - Validation & Testing Scripts
Scripts for data validation and system testing:

- **`test-complete-market-capture.ts`** - End-to-end market data validation
- **`test-improved-kalshi-collection.ts`** - Kalshi API testing
- **`test-kalshi-field-mapping.ts`** - Data field validation
- **`test-kalshi-status-fix.ts`** - Market status validation
- **`test-kalshi-volume-fix.ts`** - Volume data validation
- **`test-pagination-with-duckdb.ts`** - Pagination testing
- **`test-duckdb-row-access.ts`** - Database access testing
- **`validate-market-data.ts`** - Comprehensive data validation
- **`verify-current-database.ts`** - Database integrity checks

**Usage**: `node --import tsx/esm testing/validate-market-data.ts`

### 🐛 **debug/** - Debugging & Investigation Scripts
Scripts for troubleshooting and deep investigation:

- **`debug-database-query.ts`** - Database query debugging
- **`debug-kalshi-fetch.ts`** - Kalshi API debugging
- **`investigate-kalshi-api-limitations.ts`** - API limit analysis
- **`investigate-kalshi-authentication.ts`** - Authentication debugging
- **`investigate-kalshi-volume.ts`** - Volume data investigation
- **`investigate-polymarket-total.ts`** - Polymarket data analysis
- **`analyze-kalshi-volume-issue.ts`** - Volume discrepancy analysis

**Usage**: `node --import tsx/esm debug/investigate-kalshi-volume.ts`

### 🔧 **utilities/** - Helper & Analysis Scripts
General utility scripts for data analysis and maintenance:

- **`query-duckdb.ts`** - Interactive database queries
- **`simple-count.ts`** - Quick data counts
- **`pagination-summary.ts`** - API pagination analysis
- **`find-kalshi-volume-markets.ts`** - High-volume market finder
- **`find-polymarket-endpoint.ts`** - API endpoint discovery
- **`kalshi-realistic-volume-analysis.ts`** - Volume analysis
- **`fetch-all-kalshi-markets.ts`** - Bulk Kalshi data collection
- **`fix-data-quality-issues.ts`** - Data cleanup utilities
- **`fix-kalshi-market-filtering.ts`** - Market filtering fixes
- **`fix-polymarket-categories.ts`** - Category normalization
- **`populate-exhaustive-database.ts`** - Complete database population
- **`populate-full-database.ts`** - Full data pipeline

**Usage**: `node --import tsx/esm utilities/query-duckdb.ts`

## 🚀 Quick Start Guide

### Production Deployment
```bash
# Set up API key
export GEMINI_API_KEY='your-api-key'

# Run main arbitrage detection
node --import tsx/esm production/llm-arbitrage-matching.ts
```

### Development & Testing
```bash
# Run demo (no API key needed)
node --import tsx/esm dev/demo-llm-matching.ts

# Validate data quality  
node --import tsx/esm testing/validate-market-data.ts

# Debug volume issues
node --import tsx/esm debug/investigate-kalshi-volume.ts
```

### Data Analysis
```bash
# Quick database query
node --import tsx/esm utilities/query-duckdb.ts

# Analyze market volumes
node --import tsx/esm utilities/kalshi-realistic-volume-analysis.ts
```

## 📊 Script Dependencies

### Data Requirements
- **Unified Database**: `./data/unified-markets.db` (4,525 markets)
- **Environment**: `.env.local` with `GEMINI_API_KEY`

### Common Imports
- `@duckdb/node-api` - Database operations
- `tsx/esm` - TypeScript execution
- `node-fetch` - API calls

## 🎯 Recommended Workflow

1. **Start with**: `dev/demo-llm-matching.ts` (no setup required)
2. **Validate data**: `testing/validate-market-data.ts`
3. **Production setup**: `production/setup-llm-matching.sh`
4. **Run production**: `production/llm-arbitrage-matching.ts`
5. **Debug issues**: Use appropriate `debug/` scripts
6. **Analyze results**: Use `utilities/` scripts

## 💡 Pro Tips

- **Production**: Use `production/vertex-ai-arbitrage-matching.ts` for enterprise features
- **Development**: Use `dev/demo-llm-matching.ts` to understand the system
- **Debugging**: Start with `debug/investigate-*` scripts for specific issues  
- **Analysis**: Use `utilities/query-duckdb.ts` for custom data exploration

The scripts are now organized for maximum productivity and clarity! 🚀