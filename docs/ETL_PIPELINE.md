# ETL Pipeline Architecture

## Overview
External ETL pipeline to minimize Convex bandwidth usage and optimize data processing for market ingestion and arbitrage detection.

---

## Architecture Decision

### **Problem**: Convex Bandwidth Limitations
- Raw market data: ~4.5MB per sync, 48 syncs/day = ~216MB daily
- Large JSON objects inefficient for Convex storage
- Processing 1000+ markets risks action timeouts
- Frequent writes impact performance and costs

### **Solution**: External ETL + Clean Convex Storage
```
External ETL Service → Process & Transform → Convex (Clean Data Only)
```

---

## ETL Pipeline Design

### **External ETL Service**
**Technology**: Node.js service (Vercel Functions or AWS Lambda)
**Frequency**: Every 30-35 minutes (matching current cron schedule)

#### **Stage 1: Data Extraction**
```typescript
// etl/extractors/kalshi.ts
export async function extractKalshiMarkets(): Promise<RawMarket[]> {
  const response = await fetch("https://trading-api.kalshi.com/v1/cached/markets/");
  const data = await response.json();
  
  return data.markets
    .filter(market => 
      market.close_date > new Date().toISOString() &&
      market.status === "active"
    )
    .map(market => ({
      platform: "kalshi",
      externalId: market.ticker || market.id,
      rawData: market,
      extractedAt: Date.now(),
    }));
}

// etl/extractors/polymarket.ts  
export async function extractPolymarketMarkets(): Promise<RawMarket[]> {
  const response = await fetch("https://gamma-api.polymarket.com/markets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active: true, limit: 1000 }),
  });
  
  const markets = await response.json();
  
  return markets
    .filter(market => 
      market.active && !market.closed && 
      market.tokens?.length === 2
    )
    .map(market => ({
      platform: "polymarket", 
      externalId: market.condition_id,
      rawData: market,
      extractedAt: Date.now(),
    }));
}
```

#### **Stage 2: Data Transformation**
```typescript
// etl/transformers/normalizer.ts
export function transformMarkets(rawMarkets: RawMarket[]): NormalizedMarket[] {
  return rawMarkets
    .map(raw => {
      try {
        if (raw.platform === "kalshi") {
          return normalizeKalshiMarket(raw);
        } else if (raw.platform === "polymarket") {
          return normalizePolymarketMarket(raw);
        }
        throw new Error(`Unknown platform: ${raw.platform}`);
      } catch (error) {
        console.error(`Failed to normalize ${raw.externalId}:`, error);
        return null;
      }
    })
    .filter(Boolean) // Remove failed transformations
    .filter(market => validateMarketQuality(market)); // Quality filter
}

function normalizeKalshiMarket(raw: RawMarket): NormalizedMarket {
  const market = raw.rawData;
  return {
    platform: "kalshi",
    externalId: raw.externalId,
    title: market.title,
    description: market.subtitle || market.title,
    category: standardizeCategory("kalshi", market.category),
    eventType: "binary",
    outcomes: [
      { name: "Yes", price: parseFloat(market.yes_ask || 0.5) },
      { name: "No", price: parseFloat(market.no_ask || 0.5) }
    ],
    endDate: new Date(market.close_date).getTime(),
    volume: parseFloat(market.volume || 0),
    liquidity: parseFloat(market.open_interest || 0),
    isActive: true,
    tags: [market.category],
    processedAt: Date.now(),
  };
}

// Similar function for Polymarket...
```

#### **Stage 3: LLM Semantic Analysis (Optional in ETL)**
```typescript
// etl/analyzers/semantic.ts
export async function analyzeMarketSimilarity(
  markets: NormalizedMarket[], 
  apiKey: string
): Promise<MarketSimilarity[]> {
  
  const similarities: MarketSimilarity[] = [];
  
  // Group by category for efficiency
  const categoryGroups = groupBy(markets, 'category');
  
  for (const [category, categoryMarkets] of Object.entries(categoryGroups)) {
    if (categoryMarkets.length < 2) continue;
    
    // Batch markets for LLM analysis (20 markets max)
    const batches = chunk(categoryMarkets, 20);
    
    for (const batch of batches) {
      const batchSimilarities = await analyzeBatchForSimilarity(batch, apiKey);
      similarities.push(...batchSimilarities);
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  return similarities.filter(s => s.confidence >= 0.7);
}
```

#### **Stage 4: Arbitrage Detection**
```typescript
// etl/analyzers/arbitrage.ts
export function detectArbitrageOpportunities(
  similarities: MarketSimilarity[],
  markets: NormalizedMarket[]
): ArbitrageOpportunity[] {
  
  const opportunities: ArbitrageOpportunity[] = [];
  
  for (const similarity of similarities) {
    const market1 = markets.find(m => m.externalId === similarity.market1Id);
    const market2 = markets.find(m => m.externalId === similarity.market2Id);
    
    if (!market1 || !market2 || market1.platform === market2.platform) {
      continue;
    }
    
    // Calculate arbitrage for binary markets
    const arbitrage = calculateBinaryArbitrage(market1, market2);
    
    if (arbitrage.profitMargin > 0.02) { // 2% minimum
      opportunities.push({
        similarityId: similarity.id,
        buyMarket: arbitrage.buyMarket,
        sellMarket: arbitrage.sellMarket,
        profitMargin: arbitrage.profitMargin,
        confidence: similarity.confidence,
        detectedAt: Date.now(),
      });
    }
  }
  
  return opportunities;
}
```

#### **Stage 5: Convex Upload**
```typescript
// etl/uploaders/convex.ts
export async function uploadToConvex(
  markets: NormalizedMarket[],
  similarities: MarketSimilarity[],
  opportunities: ArbitrageOpportunity[]
): Promise<void> {
  
  const convexClient = new ConvexHttpClient(process.env.CONVEX_URL!);
  
  // Batch upsert markets (100 at a time)
  const marketBatches = chunk(markets, 100);
  for (const batch of marketBatches) {
    await convexClient.mutation(api.etl.upsertMarkets, { markets: batch });
  }
  
  // Upload similarities
  const similarityBatches = chunk(similarities, 50);
  for (const batch of similarityBatches) {
    await convexClient.mutation(api.etl.upsertSimilarities, { similarities: batch });
  }
  
  // Upload arbitrage opportunities
  const opportunityBatches = chunk(opportunities, 50);
  for (const batch of opportunityBatches) {
    await convexClient.mutation(api.etl.upsertOpportunities, { opportunities: batch });
  }
  
  // Update sync status
  await convexClient.mutation(api.etl.updateSyncStatus, {
    marketsProcessed: markets.length,
    opportunitiesFound: opportunities.length,
    lastSync: Date.now(),
  });
}
```

---

## Convex Schema (Simplified)

### **Clean, Processed Data Only**
```typescript
// convex/schema.ts - ETL optimized

// Processed markets (no raw data)
markets: defineTable({
  platform: v.string(), // "kalshi" | "polymarket"
  externalId: v.string(),
  title: v.string(),
  description: v.string(),
  category: v.string(),
  eventType: v.string(),
  outcomes: v.array(v.object({
    name: v.string(),
    price: v.number(),
  })),
  endDate: v.number(),
  volume: v.number(),
  liquidity: v.number(),
  isActive: v.boolean(),
  tags: v.array(v.string()),
  processedAt: v.number(),
})
.index("by_platform", ["platform"])
.index("by_category", ["category"])
.index("by_active", ["isActive"]),

// LLM analysis results
marketSimilarities: defineTable({
  market1Id: v.string(), // external IDs
  market2Id: v.string(),
  platform1: v.string(),
  platform2: v.string(),
  confidence: v.number(),
  reasoning: v.string(),
  analyzedAt: v.number(),
})
.index("by_confidence", ["confidence"])
.index("by_markets", ["market1Id", "market2Id"]),

// Arbitrage opportunities
arbitrageOpportunities: defineTable({
  buyMarketId: v.string(),
  sellMarketId: v.string(),
  buyPlatform: v.string(),
  sellPlatform: v.string(),
  profitMargin: v.number(),
  confidence: v.number(),
  detectedAt: v.number(),
  status: v.string(), // "active" | "expired"
})
.index("by_profit", ["profitMargin"])
.index("by_status", ["status"]),

// ETL sync logs
syncLogs: defineTable({
  syncId: v.string(),
  marketsProcessed: v.number(),
  opportunitiesFound: v.number(),
  errors: v.array(v.string()),
  duration: v.number(),
  timestamp: v.number(),
})
.index("by_timestamp", ["timestamp"]),
```

---

## Deployment Architecture

### **ETL Service Deployment**
```yaml
# Vercel Functions approach
# /etl/api/sync.ts - Vercel serverless function

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  
  try {
    // Run complete ETL pipeline
    const kalshiMarkets = await extractKalshiMarkets();
    const polymarketMarkets = await extractPolymarketMarkets();
    
    const allMarkets = transformMarkets([...kalshiMarkets, ...polymarketMarkets]);
    const similarities = await analyzeMarketSimilarity(allMarkets, process.env.OPENAI_API_KEY!);
    const opportunities = detectArbitrageOpportunities(similarities, allMarkets);
    
    await uploadToConvex(allMarkets, similarities, opportunities);
    
    return Response.json({ 
      success: true, 
      marketsProcessed: allMarkets.length,
      opportunitiesFound: opportunities.length 
    });
    
  } catch (error) {
    console.error('ETL pipeline failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

### **Cron Trigger**
```typescript
// Use GitHub Actions, Vercel Cron, or external cron service
// to trigger ETL pipeline every 30 minutes

// .github/workflows/etl-sync.yml
name: ETL Sync
on:
  schedule:
    - cron: '*/30 * * * *' # Every 30 minutes
  workflow_dispatch: # Manual trigger

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger ETL Pipeline
        run: |
          curl -X POST https://your-app.vercel.app/api/etl/sync \
            -H "Authorization: Bearer ${{ secrets.ETL_API_KEY }}"
```

---

## Benefits of ETL Approach

### **Performance Benefits**
- ✅ **Reduced Convex bandwidth**: Only clean, final data stored
- ✅ **Faster processing**: No Convex action timeouts 
- ✅ **Parallel processing**: Can process thousands of markets simultaneously
- ✅ **Better error handling**: Robust retry and recovery logic

### **Cost Benefits**
- ✅ **Lower Convex costs**: Minimal database writes
- ✅ **Efficient LLM usage**: Optimized batching and caching
- ✅ **Scalable architecture**: Handle unlimited market volume

### **Development Benefits**
- ✅ **Easier testing**: ETL pipeline can be tested independently
- ✅ **Better monitoring**: Detailed logging and error tracking
- ✅ **Flexible deployment**: ETL can run on different platforms

---

## Migration Path

### **Phase 1**: Build ETL pipeline alongside existing Convex actions
### **Phase 2**: Test ETL pipeline with subset of data
### **Phase 3**: Switch to ETL pipeline, deprecate Convex actions
### **Phase 4**: Optimize and monitor ETL performance

Would you like me to start implementing the ETL pipeline architecture?