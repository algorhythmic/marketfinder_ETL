# Project Restructuring Plan: Multi-Repository Architecture

## 🎯 Executive Summary

The MarketFinder project has evolved from a simple website into a complex monorepo containing heavy ETL processing that overwhelms Convex bandwidth and creates architectural inefficiencies. This plan outlines the separation into two focused repositories with specialized infrastructure.

**Current Problem**: 161M+ comparisons overwhelming Convex, mixed concerns, 500MB+ repository
**Proposed Solution**: Separate ETL service + lightweight website architecture
**Expected Outcome**: 99%+ cost reduction, 1350x speed improvement, simplified development

---

## 📊 Current State Analysis

### Repository Structure Issues

```
marketfinder/ (Current - 500MB+)
├── src/                     # React frontend (50MB)
├── api/                     # Vercel functions (25MB)
├── convex/                  # Backend logic (30MB)
├── scripts/                 # 50+ ETL scripts (300MB)
├── data/                    # Local databases (100MB+)
├── docs/                    # Architecture docs (15MB)
└── node_modules/            # Dependencies (varies)
```

### Performance Bottlenecks

| Metric | Current State | Impact |
|--------|---------------|---------|
| **Convex Bandwidth** | 161M comparisons/run | $161K theoretical cost |
| **Processing Time** | 45 hours | Impractical for production |
| **Repository Size** | 500MB+ | Slow clones, complex deploys |
| **Development Complexity** | Mixed concerns | Hard to maintain |
| **Deployment Issues** | Timeout failures | Unreliable ETL |

### Technology Stack Assessment

**Current Stack (Problematic)**:
- Convex: Handling intensive data processing (misuse)
- Vercel Functions: 2 cron limit, 15min timeout
- Mixed dependencies: Frontend + backend + ETL
- Single deployment target

**Infrastructure Misalignment**:
- Convex designed for real-time apps, not heavy ETL
- Vercel optimized for frontend, not data processing
- ETL requirements need dedicated compute resources

---

## 🏗️ Proposed Architecture

### Two-Repository Structure

```
┌─────────────────────────┐    ┌─────────────────────────┐
│   marketfinder-website  │    │   marketfinder-etl      │
│   (Frontend Focus)      │◄───┤   (Processing Focus)    │
│                         │    │                         │
│ • React UI              │    │ • Heavy ETL processing  │
│ • Convex real-time DB   │    │ • Multi-layer analysis  │
│ • User authentication  │    │ • DuckDB operations     │
│ • Opportunity display   │    │ • LLM integration       │
│ • Simple Vercel deploy  │    │ • Dedicated infrastructure │
└─────────────────────────┘    └─────────────────────────┘
         ~50MB                           ~300MB
```

### Architecture Benefits

| Component | Current | Proposed | Benefit |
|-----------|---------|----------|---------|
| **Website Size** | 500MB | 50MB | 90% reduction |
| **Convex Usage** | 161M operations | <1000 operations | 99.9%+ reduction |
| **Development Speed** | Complex setup | Simple frontend focus | Faster iteration |
| **Deployment Reliability** | Timeout failures | Dedicated resources | 100% reliability |
| **Cost Efficiency** | $161K theoretical | $50 actual | 99.97% reduction |

---

## 📁 Detailed Repository Design

### Repository 1: marketfinder-website

**Purpose**: Clean, fast website focused on user experience

```
marketfinder-website/
├── src/
│   ├── components/
│   │   ├── DashboardOverview.tsx
│   │   ├── Sidebar.tsx  
│   │   ├── MarketTable.tsx
│   │   ├── ArbitrageCard.tsx
│   │   └── ui/
│   ├── hooks/
│   │   ├── use-debounce.ts
│   │   ├── use-arbitrage.ts
│   │   └── use-markets.ts
│   ├── lib/
│   │   ├── utils.ts
│   │   └── constants.ts
│   └── app/
│       ├── layout.tsx
│       ├── page.tsx
│       └── dashboard/
├── convex/
│   ├── schema.ts              # Minimal schema
│   ├── markets.ts             # Read-only queries
│   ├── arbitrage.ts           # Opportunity queries
│   ├── sync.ts                # Data ingestion from ETL
│   └── auth.ts                # User authentication
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API_CONTRACTS.md
│   └── DEPLOYMENT.md
├── package.json               # Frontend-only dependencies
├── next.config.js
├── tailwind.config.ts
└── vercel.json                # Simple deployment config
```

**Key Characteristics**:
- **Size**: ~50MB (90% reduction)
- **Dependencies**: React, Next.js, Convex, Tailwind
- **Convex Schema**: Only final processed data
- **API Calls**: Read-only queries for UI
- **Deployment**: Single `vercel deploy` command

**Convex Schema (Simplified)**:
```typescript
// convex/schema.ts - Website optimized
export default defineSchema({
  // Processed arbitrage opportunities (not raw markets)
  arbitrageOpportunities: defineTable({
    buyMarketTitle: v.string(),
    sellMarketTitle: v.string(),
    buyPlatform: v.string(),
    sellPlatform: v.string(),
    profitMargin: v.number(),
    confidence: v.number(),
    detectedAt: v.number(),
    status: v.string(),
  }).index("by_profit", ["profitMargin"]),

  // Market summaries (aggregated data only)
  marketSummaries: defineTable({
    platform: v.string(),
    totalMarkets: v.number(),
    avgVolume: v.number(),
    topCategories: v.array(v.string()),
    lastUpdated: v.number(),
  }),

  // System status
  systemStatus: defineTable({
    component: v.string(),
    status: v.string(),
    lastSync: v.number(),
    metrics: v.object({
      marketsProcessed: v.number(),
      opportunitiesFound: v.number(),
      processingTime: v.number(),
    }),
  }),
});
```

### Repository 2: marketfinder-etl

**Purpose**: Heavy-duty data processing and arbitrage detection

```
marketfinder-etl/
├── src/
│   ├── engines/
│   │   ├── bucketing/
│   │   │   ├── SemanticBucketingEngine.ts
│   │   │   ├── bucketDefinitions.ts
│   │   │   └── bucketStats.ts
│   │   ├── filtering/
│   │   │   ├── HierarchicalFilteringEngine.ts
│   │   │   ├── textSimilarity.ts
│   │   │   └── liquidityFilters.ts
│   │   └── ml-scoring/
│   │       ├── MLScoringEngine.ts
│   │       ├── featureExtraction.ts
│   │       └── modelTraining.ts
│   ├── orchestration/
│   │   ├── MarketComparisonOrchestrator.ts
│   │   ├── IncrementalProcessor.ts
│   │   └── PerformanceMonitor.ts
│   ├── data/
│   │   ├── fetchers/
│   │   │   ├── KalshiFetcher.ts
│   │   │   └── PolymarketFetcher.ts
│   │   ├── transformers/
│   │   │   ├── MarketNormalizer.ts
│   │   │   └── DataValidator.ts
│   │   └── storage/
│   │       ├── DuckDBManager.ts
│   │       └── PostgreSQLManager.ts
│   ├── llm/
│   │   ├── LLMEvaluationEngine.ts
│   │   ├── batchProcessor.ts
│   │   └── providers/
│   │       ├── OpenAIProvider.ts
│   │       ├── AnthropicProvider.ts
│   │       └── VertexAIProvider.ts
│   └── api/
│       ├── server.ts              # Main API server
│       ├── routes/
│       │   ├── arbitrage.ts       # GET /api/arbitrage
│       │   ├── markets.ts         # GET /api/markets
│       │   ├── health.ts          # GET /api/health
│       │   └── sync.ts            # POST /api/sync
│       └── middleware/
│           ├── auth.ts
│           ├── rateLimit.ts
│           └── logging.ts
├── scripts/
│   ├── production/
│   │   ├── run-full-etl.ts
│   │   ├── incremental-update.ts
│   │   └── model-training.ts
│   ├── utilities/
│   │   ├── database-setup.ts
│   │   ├── data-migration.ts
│   │   └── performance-analysis.ts
│   └── monitoring/
│       ├── health-check.ts
│       ├── alert-system.ts
│       └── metrics-collection.ts
├── data/
│   ├── models/
│   │   ├── ml-model.pkl
│   │   └── embeddings.bin
│   ├── cache/
│   │   └── processed-buckets/
│   └── logs/
│       ├── etl-runs/
│       └── error-logs/
├── docker/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── fly.toml
├── docs/
│   ├── MULTI_LAYER_COMPARISON_ARCHITECTURE.md
│   ├── ETL_PIPELINE.md
│   ├── DEPLOYMENT_GUIDE.md
│   └── API_DOCUMENTATION.md
├── package.json                   # ETL-focused dependencies
├── tsconfig.json
└── fly.toml                      # Fly.io deployment config
```

**Key Characteristics**:
- **Size**: ~300MB (contains all processing logic)
- **Dependencies**: DuckDB, ML libraries, LLM SDKs
- **Infrastructure**: Fly.io/AWS with dedicated resources
- **Processing**: Can handle 161M+ comparisons efficiently
- **API**: RESTful endpoints for website integration

---

## 🔄 Data Flow Architecture

### End-to-End Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    MARKETFINDER-ETL SERVICE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐    │
│  │   FETCH     │───▶│   PROCESS    │───▶│   ANALYZE       │    │
│  │             │    │              │    │                 │    │
│  │ • Kalshi    │    │ • Bucketing  │    │ • ML Scoring    │    │
│  │ • Polymarket│    │ • Filtering  │    │ • LLM Eval      │    │
│  │ • 50K mkts  │    │ • Transform  │    │ • Arbitrage     │    │
│  └─────────────┘    └──────────────┘    └─────────────────┘    │
│                                                    │             │
│  ┌─────────────────────────────────────────────────┼─────────┐   │
│  │              RESULTS STORAGE                    │         │   │
│  │  • Top 50 opportunities                         │         │   │
│  │  • Confidence scores                            │         │   │
│  │  • Market summaries                             │         │   │
│  │  • System metrics                               │         │   │
│  └─────────────────────────────────────────────────┼─────────┘   │
└───────────────────────────────────────────────────┼─────────────┘
                                                     │
                                                     │ REST API
                                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                   MARKETFINDER-WEBSITE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐    │
│  │   SYNC      │───▶│   CONVEX     │───▶│   FRONTEND      │    │
│  │             │    │              │    │                 │    │
│  │ • Vercel    │    │ • Minimal    │    │ • React UI      │    │
│  │ • Cron      │    │ • Fast       │    │ • Real-time     │    │
│  │ • 2x/day    │    │ • Real-time  │    │ • User-focused  │    │
│  └─────────────┘    └──────────────┘    └─────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### API Contract Specification

**ETL Service → Website Integration**:

```typescript
// GET /api/arbitrage/latest
interface ArbitrageResponse {
  opportunities: ArbitrageOpportunity[];
  metadata: {
    totalFound: number;
    lastProcessed: string;
    processingTime: number;
    confidence: {
      high: number;    // >0.8
      medium: number;  // 0.6-0.8
      low: number;     // <0.6
    };
  };
}

interface ArbitrageOpportunity {
  id: string;
  buyMarket: {
    title: string;
    platform: 'kalshi' | 'polymarket';
    price: number;
    volume: number;
    url: string;
  };
  sellMarket: {
    title: string;
    platform: 'kalshi' | 'polymarket';
    price: number;
    volume: number;
    url: string;
  };
  profitMargin: number;
  confidence: number;
  reasoning: string;
  detectedAt: string;
  expiresAt: string;
}

// GET /api/markets/summary
interface MarketSummary {
  totalMarkets: number;
  byPlatform: {
    kalshi: { count: number; avgVolume: number; topCategories: string[] };
    polymarket: { count: number; avgVolume: number; topCategories: string[] };
  };
  lastUpdated: string;
  nextUpdate: string;
}

// GET /api/health
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  uptime: number;
  lastEtlRun: {
    timestamp: string;
    duration: number;
    marketsProcessed: number;
    opportunitiesFound: number;
    errors: string[];
  };
  performance: {
    avgResponseTime: number;
    successRate: number;
    errorRate: number;
  };
}
```

---

## 🚀 Migration Strategy

### Phase 1: Repository Setup (Week 1)

**Day 1-2: Create New Repositories**
```bash
# Create website repository
gh repo create marketfinder-website --private
cd marketfinder-website
git init

# Create ETL repository  
gh repo create marketfinder-etl --private
cd marketfinder-etl
git init
```

**Day 3-4: Website Repository Setup**
- Copy `src/`, `convex/` (minimal), `docs/`
- Create simplified `package.json` with frontend-only deps
- Remove all ETL-related files and dependencies
- Update Convex schema to handle only processed data
- Test build and deployment pipeline

**Day 5-7: ETL Repository Setup**
- Move all `scripts/`, `data/`, ETL logic
- Restructure into engines architecture
- Set up Docker/Fly.io deployment configuration
- Create API server with health endpoints
- Test data processing pipeline

### Phase 2: ETL Service Development (Week 2-3)

**Week 2: Core Engines Implementation**
- Implement SemanticBucketingEngine with bucket definitions
- Build HierarchicalFilteringEngine with multi-stage pipeline
- Create MLScoringEngine with feature extraction
- Develop MarketComparisonOrchestrator

**Week 3: Integration & API Development**
- Build REST API with all required endpoints
- Implement error handling and monitoring
- Add comprehensive logging and metrics
- Create deployment scripts and configuration

### Phase 3: Website Integration (Week 4)

**Day 1-3: Data Sync Implementation**
- Create Vercel cron functions for data ingestion
- Implement Convex mutations for processed data
- Build frontend components for new data structure
- Test end-to-end data flow

**Day 4-7: Frontend Optimization**
- Update all React components for new data structure
- Implement real-time updates with Convex subscriptions
- Add monitoring and health status displays
- Performance testing and optimization

### Phase 4: Production Deployment (Week 5)

**Day 1-3: ETL Service Deployment**
- Deploy ETL service to Fly.io/AWS
- Configure production environment variables
- Set up monitoring and alerting
- Run initial full ETL pipeline

**Day 4-7: Website Deployment & Cutover**
- Deploy website to Vercel
- Configure production data sync
- Monitor system performance
- Gradual traffic migration

---

## 💰 Cost-Benefit Analysis

### Cost Comparison

| Component | Current (Monthly) | Proposed (Monthly) | Savings |
|-----------|------------------|-------------------|---------|
| **Convex Bandwidth** | $1,610 (theoretical) | $5 (minimal usage) | $1,605 |
| **Vercel Functions** | $20 (timeout issues) | $0 (free tier) | $20 |
| **ETL Infrastructure** | $0 (broken) | $15 (Fly.io) | -$15 |
| **Development Time** | 20 hrs/week | 5 hrs/week | 15 hrs/week |
| **Total** | $1,630 + time | $20 + time | $1,610 + 75% time |

### Performance Improvements

| Metric | Current | Proposed | Improvement |
|--------|---------|----------|-------------|
| **Processing Time** | 45 hours | 2 minutes | 1,350x faster |
| **Reliability** | 20% success rate | 99%+ success rate | 5x improvement |
| **Cost per Opportunity** | $32,200 | $0.40 | 80,500x cheaper |
| **Development Velocity** | Slow (mixed concerns) | Fast (separated) | 3x faster |

### Risk Mitigation

**Technical Risks**:
- **Data Loss**: Comprehensive backup and migration scripts
- **Service Downtime**: Gradual migration with rollback plan
- **Integration Issues**: Extensive testing and staging environment
- **Performance Degradation**: Load testing and monitoring

**Business Risks**:
- **Development Slowdown**: Parallel development during migration
- **User Experience**: Minimal frontend changes during transition
- **Cost Overruns**: Fixed-price Fly.io deployment, predictable costs

---

## 📈 Success Metrics

### Quantitative Goals

**Performance Targets** (Post-Migration):
- ETL Processing Time: <5 minutes per full run
- Website Load Time: <2 seconds first paint
- API Response Time: <200ms average
- System Availability: >99.5% uptime

**Cost Targets**:
- Total Monthly Cost: <$30 (vs $1,630+ current)
- Cost per Arbitrage Opportunity: <$1 (vs $32,200 theoretical)
- Development Time: <5 hours/week maintenance

**Quality Targets**:
- Arbitrage Detection Accuracy: >90% confidence score
- False Positive Rate: <10%
- Data Freshness: <30 minutes lag
- Error Rate: <1% of operations

### Qualitative Benefits

**Developer Experience**:
- Clear separation of concerns
- Faster iteration on frontend features
- Independent scaling of components
- Simplified debugging and monitoring

**User Experience**:
- Faster website performance
- Real-time opportunity updates
- Better reliability and uptime
- Mobile-optimized interface

**Business Value**:
- Production-ready arbitrage detection
- Scalable architecture for growth
- Lower operational costs
- Competitive advantage in market efficiency

---

## 🔧 Implementation Checklist

### Pre-Migration
- [ ] Backup current repository and database
- [ ] Create staging environment for testing
- [ ] Document current API endpoints and data flow
- [ ] Set up monitoring and alerting systems

### Repository Setup
- [ ] Create `marketfinder-website` repository
- [ ] Create `marketfinder-etl` repository
- [ ] Configure GitHub Actions for both repos
- [ ] Set up development environments

### ETL Service Development
- [ ] Implement semantic bucketing engine
- [ ] Build hierarchical filtering system
- [ ] Create ML scoring pipeline
- [ ] Develop orchestration layer
- [ ] Build REST API server
- [ ] Add comprehensive logging
- [ ] Create deployment configuration

### Website Migration
- [ ] Simplify Convex schema
- [ ] Update React components
- [ ] Implement data sync functions
- [ ] Test frontend with new data structure
- [ ] Optimize for performance

### Integration & Testing
- [ ] Test ETL service API endpoints
- [ ] Validate data flow between services
- [ ] Load test full pipeline
- [ ] Security audit and testing
- [ ] User acceptance testing

### Production Deployment
- [ ] Deploy ETL service to Fly.io
- [ ] Deploy website to Vercel
- [ ] Configure production monitoring
- [ ] Run initial data sync
- [ ] Monitor performance metrics

### Post-Migration
- [ ] Archive old repository
- [ ] Update documentation
- [ ] Team training on new architecture
- [ ] Performance optimization
- [ ] Feature development planning

---

## 🔮 Future Roadmap

### Phase 6: Enhanced Features (Month 2-3)
- Advanced ML models for similarity detection
- Real-time market streaming updates
- Mobile app development
- Additional platform integrations

### Phase 7: Scale & Optimize (Month 4-6)
- Multi-region deployment
- Advanced caching strategies
- API rate limiting and optimization
- Enterprise features and authentication

### Phase 8: Business Growth (Month 6+)
- Premium subscription tiers
- Custom alert systems
- Trading integration APIs
- Market analysis tools

This restructuring plan transforms MarketFinder from an unwieldy monorepo into a production-ready, scalable platform optimized for both development velocity and operational efficiency.