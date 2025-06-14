# MarketFinder Development Plan

## Overview
This document outlines the consolidated development plan for implementing the complete arbitrage detection pipeline, focusing on semantic analysis-driven market matching between Polymarket and Kalshi platforms.

---

## Core Architecture: Data Pipeline Flow

### Complete Workflow
```
API Ingestion → Data Standardization → LLM Analysis → Arbitrage Detection → Frontend Display
```

1. **Batch Fetching**: Complete catalog ingestion from both platforms with pagination
2. **Data Modeling**: Standardized storage for efficient cross-platform comparison  
3. **LLM Optimization**: Category-based batching to reduce token usage
4. **Market Matching**: High-confidence tuple generation (≥0.7 threshold)
5. **Arbitrage Calculation**: Binary market profit margin analysis
6. **Frontend Integration**: Real-time opportunity display

---

## Implementation Phases

### Phase 1: Complete Market Ingestion Pipeline (Week 1)

#### 1.1 Enhanced Batch Fetching Strategy
```typescript
// convex/jobs.ts enhancements

// Kalshi API - 30-minute token expiration handling
async function fetchCompleteKalshiCatalog() {
  let allMarkets = [];
  let hasMore = true;
  let cursor = null;
  let authToken = await kalshiAuth(); // Initial authentication
  let authTime = Date.now();
  
  while (hasMore) {
    // Re-authenticate if token near expiration (25 minutes)
    if (Date.now() - authTime > 25 * 60 * 1000) {
      authToken = await kalshiAuth();
      authTime = Date.now();
    }
    
    const batch = await fetchKalshiBatch(cursor, 50, authToken); // Cached endpoint
    allMarkets.push(...batch.markets);
    cursor = batch.nextCursor;
    hasMore = batch.hasMore;
    
    // Rate limiting: 20 requests/second basic tier
    await new Promise(resolve => setTimeout(resolve, 50)); // 20/s = 50ms delay
  }
  
  return allMarkets;
}

// Polymarket API - Gamma API for read-only market data
async function fetchCompletePolymarketCatalog() {
  let allMarkets = [];
  let hasMore = true;
  let cursor = null;
  
  while (hasMore) {
    const batch = await fetchPolymarketGammaBatch(cursor, 100);
    allMarkets.push(...batch.markets);
    cursor = batch.nextCursor;
    hasMore = batch.hasMore;
    
    // Conservative rate limiting with exponential backoff
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return allMarkets;
}
```

#### 1.2 Database Schema Enhancements
```typescript
// New tables in convex/schema.ts:

// Raw platform data storage
rawMarkets: defineTable({
  platformId: v.id("platforms"),
  externalId: v.string(),
  rawData: v.any(), // Original API response
  fetchedAt: v.number(),
  processed: v.boolean(),
})
.index("by_platform", ["platformId"])
.index("by_processed", ["processed"]),

// Normalized market structure for LLM comparison
normalizedMarkets: defineTable({
  platformId: v.id("platforms"),
  externalId: v.string(),
  
  // Standardized fields from API mapping
  title: v.string(),
  description: v.string(),
  category: v.string(), // Kalshi: 9 categories, Polymarket: market.category
  eventType: v.string(), // "binary" focus for Phase 1
  
  // Outcomes structure
  outcomes: v.array(v.object({
    name: v.string(),
    currentPrice: v.number(),
  })),
  
  // Additional context for LLM
  tags: v.array(v.string()),
  resolutionCriteria: v.optional(v.string()),
  endDate: v.optional(v.number()),
  
  // Market metrics
  volume: v.optional(v.number()),
  liquidity: v.optional(v.number()),
  
  // Status tracking
  isActive: v.boolean(),
  normalizedAt: v.number(),
  needsLLMAnalysis: v.boolean(),
})
.index("by_platform", ["platformId"])
.index("by_category", ["category"])
.index("by_needs_analysis", ["needsLLMAnalysis"])
.index("by_event_type", ["eventType"])
```

### Phase 2: LLM-Powered Semantic Analysis (Week 2)

#### 2.1 Optimization Strategy
- **Category-based batching**: Group markets by category to reduce token usage
- **Optimal batch sizes**: 20 markets per LLM call (~4000 tokens)
- **Confidence filtering**: Only persist similarities ≥0.7 confidence
- **Rate limiting**: 2-second delays between LLM calls

#### 2.2 Market Similarity Detection
```typescript
// convex/semanticAnalysis.ts enhancements

// New table for LLM similarity results
marketSimilarities: defineTable({
  market1Id: v.id("normalizedMarkets"),
  market2Id: v.id("normalizedMarkets"),
  platform1Id: v.id("platforms"),
  platform2Id: v.id("platforms"),
  confidence: v.number(), // 0.7 - 1.0
  reasoning: v.string(),
  analyzedAt: v.number(),
  llmModel: v.string(),
  batchId: v.string(),
  status: v.union(
    v.literal("active"),
    v.literal("stale"), 
    v.literal("invalid")
  ),
})

// Optimized prompt structure
function createComparisonPrompt(markets) {
  return `Analyze these ${markets.length} prediction markets for semantic similarity.
  Focus on whether they're asking about the same underlying event or outcome.
  
  Markets to compare:
  ${markets.map((m, i) => `${i+1}. [${m.platform}] ${m.title} - ${m.description}`).join('\n')}
  
  Return JSON array of similar market pairs with confidence scores (0-1):
  [{"market1_id": "1", "market2_id": "3", "confidence": 0.85, "reasoning": "Both ask about same election outcome"}]
  
  Only include pairs with confidence >= 0.7`;
}
```

### Phase 3: Arbitrage Detection & Frontend (Week 3)

#### 3.1 Arbitrage Opportunity Calculation
```typescript
// Enhanced arbitrageOpportunities table
arbitrageOpportunities: defineTable({
  similarityId: v.id("marketSimilarities"),
  buyMarketId: v.id("normalizedMarkets"),
  sellMarketId: v.id("normalizedMarkets"),
  buyPlatform: v.string(),
  sellPlatform: v.string(),
  buyPrice: v.number(),
  sellPrice: v.number(),
  profitMargin: v.number(),
  potentialProfit: v.number(),
  volumeRatio: v.number(),
  timeToExpiry: v.optional(v.number()),
  riskScore: v.number(),
  detectedAt: v.number(),
  expiresAt: v.optional(v.number()),
  status: v.union(
    v.literal("active"),
    v.literal("expired"),
    v.literal("taken"),
    v.literal("invalid")
  ),
})
```

#### 3.2 Complete Pipeline Orchestration
```typescript
// convex/arbitragePipeline.ts - Master workflow
export const runCompleteArbitragePipeline = internalAction({
  handler: async (ctx) => {
    // Step 1: Fetch complete catalogs
    const polymarketData = await fetchCompletePolymarketCatalog();
    const kalshiData = await fetchCompleteKalshiCatalog();
    
    // Step 2: Store raw data
    await storeRawMarketData(ctx, "polymarket", polymarketData);
    await storeRawMarketData(ctx, "kalshi", kalshiData);
    
    // Step 3: Normalize for comparison
    await normalizeAllRawMarkets(ctx);
    
    // Step 4: LLM analysis by category
    await analyzeMarketSimilarities(ctx);
    
    // Step 5: Calculate arbitrage opportunities
    await calculateArbitrageOpportunities(ctx);
    
    // Step 6: Clean up stale data
    await cleanupExpiredOpportunities(ctx);
    
    return { 
      processedMarkets: polymarketData.length + kalshiData.length,
      newOpportunities: await countActiveOpportunities(ctx)
    };
  }
});
```

#### 3.3 Frontend Integration
```typescript
// src/components/ArbitrageView.tsx - Real data connection
export function ArbitrageView() {
  const opportunities = useQuery(api.arbitrage.getActiveOpportunities, {
    minProfitMargin: userPreferences.minProfitMargin,
    platforms: ["polymarket", "kalshi"],
    maxRiskScore: 0.7
  });
  
  const similarities = useQuery(api.semanticAnalysis.getMarketSimilarities, {
    minConfidence: 0.7,
    includePlatformData: true
  });
  
  return (
    <div className="space-y-6">
      {opportunities?.map(opp => (
        <ArbitrageOpportunityCard 
          key={opp._id}
          opportunity={opp}
          similarity={similarities?.find(s => s._id === opp.similarityId)}
          onTakeOpportunity={() => handleOpportunity(opp)}
        />
      ))}
    </div>
  );
}
```

---

## Technical Specifications

### LLM Analysis Configuration
- **Confidence Threshold**: 0.7 (configurable via settings)
- **Batch Size**: 20 markets per API call
- **Token Limit**: ~4000 tokens per request
- **Rate Limiting**: 2 seconds between calls
- **Model**: GPT-4 (configurable)

### Arbitrage Detection Rules
- **Market Types**: Binary markets only (initial phase)
- **Platforms**: Kalshi ↔ Polymarket only
- **Profit Calculation**: Simple price differential analysis
- **Risk Factors**: Volume ratio, time to expiry, liquidity depth

### Performance Optimizations
- **API Cost Management**: Category-based batching, result caching
- **Database Efficiency**: Proper indexing for similarity queries
- **Update Frequency**: Batch processing (no real-time requirements)

---

## Implementation Timeline

### Week 1: Data Foundation
- [ ] Enhanced batch fetching with pagination for both platforms
- [ ] Create `rawMarkets` and `normalizedMarkets` tables  
- [ ] Build market normalization functions
- [ ] Test complete catalog ingestion

### Week 2: LLM Integration
- [ ] Implement category-based batching for LLM analysis
- [ ] Create `marketSimilarities` table and analysis functions
- [ ] Build confidence-based filtering (≥0.7)
- [ ] Test semantic similarity detection

### Week 3: Arbitrage & Frontend
- [ ] Create `arbitrageOpportunities` table with profit calculations
- [ ] Build complete pipeline orchestration
- [ ] Connect ArbitrageView to real backend data
- [ ] Implement user preference filtering

---

## Key Design Decisions

### Semantic Analysis Priority
- **Automated Processing**: LLM analysis runs automatically on new markets
- **Confidence Threshold**: 0.7 minimum for display (configurable)
- **Conflict Resolution**: Highest confidence grouping displayed, conflicts persisted for future analysis

### Arbitrage Detection Strategy  
- **Binary Markets Only**: Focus on Kalshi ↔ Polymarket binary market pairs
- **Post-Grouping Analysis**: Arbitrage calculated after semantic grouping complete
- **Alert-Based**: User notifications based on preference settings

### Performance vs Cost Trade-offs
- **Batch Processing**: No real-time requirements, prioritize API cost savings
- **Update Frequency**: Configurable but not user-facing initially
- **Data Freshness**: Acceptable trade-off for reduced costs

---

## Future Considerations

### Phase 4: Advanced Features (Post Week 3)
- **Multi-outcome Markets**: Expand beyond binary markets
- **Additional Platforms**: Framework for new platform integration  
- **Advanced Arbitrage**: Complex opportunity detection algorithms
- **Automation System**: Playbook-based trading automation

### Scalability Considerations
- **Database Partitioning**: For large market datasets
- **LLM Call Optimization**: Advanced batching strategies
- **Caching Strategies**: Reduce redundant analysis calls
- **Monitoring & Alerting**: Pipeline health and performance tracking

---

## Success Metrics

### Week 1 Success Criteria
- [ ] Successfully ingest complete market catalogs from both platforms
- [ ] Achieve >95% data normalization success rate
- [ ] Process 1000+ markets without errors

### Week 2 Success Criteria  
- [ ] Generate market similarities with ≥0.7 confidence
- [ ] Process market batches within cost targets (<$1/day LLM costs)
- [ ] Achieve <5% false positive similarity rate

### Week 3 Success Criteria
- [ ] Display real arbitrage opportunities in frontend
- [ ] Calculate accurate profit margins for binary markets
- [ ] Connect user preferences to opportunity filtering