# MarketFinder ETL Service

> **Intelligent arbitrage detection across prediction market platforms using advanced multi-layer comparison architecture**

[![Pipeline Status](https://img.shields.io/badge/Pipeline-Active-green)]()
[![Processing Speed](https://img.shields.io/badge/Speed-1350x_Faster-blue)]()
[![Cost Efficiency](https://img.shields.io/badge/Cost_Reduction-99.99%25-orange)]()

## 🎯 Overview

MarketFinder ETL is a high-performance data processing service that identifies arbitrage opportunities between prediction market platforms (Kalshi and Polymarket). Using an intelligent multi-layer comparison architecture, it processes 161M+ potential market comparisons in under 2 minutes while achieving 99.99% cost reduction compared to naive approaches.

## 🏗️ Architecture

### Multi-Layer Processing Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    MARKET INGESTION LAYER                   │
├─────────────────────────────────────────────────────────────┤
│  Kalshi API (3.1K markets)    │    Polymarket API (51.6K)  │
│         ↓                     │              ↓             │
│    Data Normalization         │     Data Normalization     │
│         ↓                     │              ↓             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │           UNIFIED MARKETS DATABASE                      │ │
│  │  • Normalized schema • Embeddings • Metadata           │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────┐
│                INTELLIGENT COMPARISON ENGINE                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────┐  ┌────────────────┐  ┌─────────────────┐ │
│  │   LAYER 1:    │  │    LAYER 2:    │  │    LAYER 3:    │ │
│  │   SEMANTIC    │→ │  HIERARCHICAL  │→ │   ML-ENHANCED   │ │
│  │   BUCKETING   │  │   FILTERING    │  │    SCORING      │ │
│  │               │  │                │  │                 │ │
│  │ 161M → 500K   │  │  500K → 50K    │  │   50K → 1K      │ │
│  │ (99.7% cut)   │  │  (90% cut)     │  │   (98% cut)     │ │
│  └───────────────┘  └────────────────┘  └─────────────────┘ │
│                              ↓                             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              LLM EVALUATION ENGINE                      │ │
│  │  • Batch processing • Rate limiting • Error handling   │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────┐
│               ARBITRAGE OPPORTUNITY ENGINE                  │
├─────────────────────────────────────────────────────────────┤
│  Result Storage │ Confidence Ranking │ Risk Assessment     │
│
└─────────────────────────────────────────────────────────────┘
```

### Layer 1: Semantic Bucketing Engine
- **Purpose**: Group similar markets across platforms into semantic buckets
- **Reduction**: 161M → 500K comparisons (99.7% reduction)
- **Technology**: Keyword matching, category classification, temporal alignment
- **Buckets**: Politics, Crypto, Sports, Entertainment, etc.

### Layer 2: Hierarchical Filtering Engine
- **Purpose**: Apply multi-stage filtering to eliminate non-viable pairs
- **Reduction**: 500K → 50K comparisons (90% reduction)
- **Filters**:
  - Basic compatibility (price ranges, volume thresholds)
  - Text similarity pre-screening
  - Liquidity and volume filtering
  - Time window alignment

### Layer 3: ML-Enhanced Scoring Engine
- **Purpose**: Use machine learning to predict LLM evaluation success
- **Reduction**: 50K → 1K comparisons (98% reduction)
- **Features**: Text similarity, market dynamics, historical patterns
- **Model**: Gradient boosting trained on historical LLM results

### LLM Evaluation Engine
- **Purpose**: Final semantic analysis of top candidates
- **Reduction**: 1K → 50 opportunities (95% reduction)
- **Providers**: OpenAI, Anthropic, Vertex AI
- **Output**: High-confidence arbitrage opportunities with detailed reasoning

## 🚀 Performance Metrics

| Metric | Traditional Approach | Optimized Pipeline | Improvement |
|--------|---------------------|-------------------|-------------|
| **Processing Time** | 45 hours | 2 minutes | **1,350x faster** |
| **API Calls** | 161M LLM calls | 1K LLM calls | **99.99% reduction** |
| **Cost** | $161,221 | $10 | **99.99% cheaper** |
| **Accuracy** | Unknown | >90% confidence | **Measurable quality** |

## 📊 Repository Structure

```
marketfinder-etl/
├── src/
│   ├── marketfinder_etl/         # Python package – core ETL logic
│   │   ├── core/                 # Config & logging helpers
│   │   ├── extractors/           # API clients for Kalshi & Polymarket
│   │   ├── transformers/         # Data normalization & enrichment
│   │   ├── engines/              # Bucketing, filtering, ML scoring, LLM eval
│   │   ├── pipeline/             # Orchestrator and DAG-style helpers
│   │   ├── storage/              # DuckDB + Convex cache adapters
│   │   ├── streaming/            # Kafka producer / consumer utilities
│   │   ├── models/               # Pydantic schemas (Market, Arbitrage, …)
│   │   └── cli.py                # `python -m marketfinder_etl` entry point
│   └── utils/                    # Shared TS helpers (e.g., Kalshi auth)
│       ├── kalshi-auth.ts
│       └── test-kalshi-auth.ts
├── convex/                       # Convex backend functions & schema
├── scripts/                      # Batch scripts (production, testing, etc.)
│   ├── production/
│   ├── testing/
│   ├── utilities/
│   ├── debug/
│   └── dev/
├── dags/                         # Airflow DAG definitions
├── docs/                         # Project documentation
│   ├── ETL_PIPELINE.md
│   ├── multi-layer-comparison-architecture.md
│   ├── LLM_ARBITRAGE_SYSTEM.md
│   └── API_CONTRACTS.md
└── build & config files          # Dockerfile, tsconfig, pyproject, etc.
```

## 🛠️ Quick Start

### Prerequisites
- Node.js 18+
- TypeScript
- DuckDB (for local data processing)
- API keys for Kalshi, Polymarket, and LLM providers

### Installation

```bash
# Clone the repository
git clone https://github.com/algorhythmic/marketfinder_ETL.git
cd marketfinder_ETL

# Install dependencies
npm install

# Install Python runtime + dev dependencies (uses fast Rust-based `uv`)
uv pip install -e .[dev]

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys
```

### Running the ETL Pipeline

```bash
# Full pipeline execution
npm run etl:full

# Incremental updates only
npm run etl:incremental

# Test data fetching
npm run test:fetchers

# Start ETL service API
npm run start:service
```

## 🔧 Configuration

### Environment Variables

```bash
# API Keys
KALSHI_EMAIL=your-kalshi-email
KALSHI_PASSWORD=your-kalshi-password
POLYMARKET_API_KEY=your-polymarket-key

# LLM Providers
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
GOOGLE_VERTEX_AI_KEY=your-vertex-key

# Database
DATABASE_URL=your-database-url
CONVEX_DEPLOYMENT=your-convex-deployment

# Processing Configuration
MAX_LLM_CALLS_PER_MINUTE=60
BUCKET_PROCESSING_BATCH_SIZE=1000
ML_MODEL_UPDATE_FREQUENCY=daily
```

## 📈 Processing Scripts

### Production Scripts
- `fetch-kalshi-markets-efficient.ts` - Optimized Kalshi data collection
- `multi-stage-llm-arbitrage.ts` - Full multi-layer processing
- `vertex-ai-arbitrage-matching.ts` - Google Vertex AI integration
- `intelligent-chunking-strategy.ts` - Smart batch processing

### Development Scripts
- `setup-local-duckdb.ts` - Local database setup  
- `demo-llm-matching.ts` - LLM evaluation demo
- `improve-arbitrage-matching.ts` - Algorithm improvements

### Testing Scripts
- `validate-market-data.ts` - Data quality validation
- `test-complete-market-capture.ts` - End-to-end testing
- `test-kalshi-volume-fix.ts` - Volume calculation testing

## 🎯 API Endpoints

### ETL Service API

```typescript
// Health check
GET /api/health

// Market data
GET /api/markets?platform=kalshi&limit=100
GET /api/markets/summary

// Arbitrage opportunities  
GET /api/arbitrage/latest
GET /api/arbitrage/by-confidence?min=0.8

// Processing status
GET /api/status/pipeline
GET /api/status/buckets
```

### Processing Triggers

```typescript
// Manual pipeline execution
POST /api/etl/run-full
POST /api/etl/run-incremental

// Bucket-specific processing
POST /api/etl/process-bucket
{
  "bucket_name": "politics_trump_2024",
  "force_reprocess": false
}
```

## 🧠 Machine Learning Features

### Feature Engineering
- **Text Similarity**: Jaccard, cosine similarity, keyword overlap
- **Market Dynamics**: Price differences, volume ratios, liquidity scores
- **Temporal Features**: Close time alignment, urgency indicators
- **Historical Performance**: Bucket success rates, similar pair confidence

### Model Training
```bash
# Train ML model on historical data
npm run ml:train

# Evaluate model performance
npm run ml:evaluate

# Update model with new LLM results
npm run ml:update
```

## 📊 Monitoring & Analytics

### Performance Dashboards
- Pipeline execution times and success rates
- Bucket processing statistics
- LLM evaluation costs and accuracy
- Arbitrage opportunity tracking

### Alerting
- Pipeline failures and errors
- API rate limit warnings
- Data quality issues
- High-value opportunity notifications

## 🔄 Data Flow

### Input Sources
1. **Kalshi API**: ~3,100 active prediction markets
2. **Polymarket API**: ~51,600 active prediction markets  
3. **Historical Data**: Past arbitrage results and LLM evaluations

### Processing Stages
1. **Data Ingestion**: Fetch and normalize market data
2. **Semantic Bucketing**: Group markets by topic/category
3. **Hierarchical Filtering**: Apply multi-stage filtering
4. **ML Scoring**: Predict LLM evaluation success
5. **LLM Evaluation**: Semantic analysis of top candidates
6. **Opportunity Generation**: Create actionable arbitrage opportunities

### Outputs
- High-confidence arbitrage opportunities
- Market analysis and trends
- Performance metrics and analytics
- API endpoints for downstream applications

## 🛡️ Security & Reliability

### Security Features
- API key rotation and secure storage
- Rate limiting and abuse prevention
- Input validation and sanitization
- Audit logging for all operations

### Reliability Features
- Graceful error handling and recovery
- Circuit breakers for external API calls
- Data consistency checks and validation
- Incremental processing for efficiency

## 📚 Documentation

- [ETL Pipeline Documentation](docs/ETL_PIPELINE.md)
- [Multi-Layer Architecture Details](docs/multi-layer-comparison-architecture.md)
- [LLM Integration Guide](docs/LLM_ARBITRAGE_SYSTEM.md)
- [API Contracts](docs/API_CONTRACTS.md)
- [Deployment Strategy](docs/DEPLOYMENT_STRATEGY.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙋‍♂️ Support

For questions, issues, or contributions:
- Open an issue on GitHub
- Check the [documentation](docs/)
- Review existing [discussions](https://github.com/algorhythmic/marketfinder_ETL/discussions)

---

**Built with ❤️ for the prediction market arbitrage community**