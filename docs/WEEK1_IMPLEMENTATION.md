# Week 1 Implementation Plan

## Overview
Based on the actual API endpoints and market count analysis, Week 1 implementation focuses on building the complete market ingestion pipeline with real data fetching from both platforms.

---

## Implementation Tasks

### Task 1: Database Schema Enhancement
**File**: `convex/schema.ts`
**Estimated Time**: 2-3 hours

```typescript
// Add to existing schema.ts
const newTables = {
  // Raw platform data storage
  rawMarkets: defineTable({
    platformId: v.id("platforms"),
    externalId: v.string(),
    rawData: v.any(), // Complete API response
    fetchedAt: v.number(),
    processed: v.boolean(),
    marketCount: v.optional(v.number()), // For batch tracking
  })
  .index("by_platform", ["platformId"])
  .index("by_processed", ["processed"])
  .index("by_fetched_at", ["fetchedAt"]),

  // Normalized markets for LLM processing
  normalizedMarkets: defineTable({
    platformId: v.id("platforms"),
    externalId: v.string(),
    
    // Core market data
    title: v.string(),
    description: v.string(),
    category: v.string(),
    eventType: v.string(), // "binary" focus
    
    // Outcomes for binary markets
    outcomes: v.array(v.object({
      name: v.string(), // "Yes" | "No"
      currentPrice: v.number(), // 0.0 - 1.0
    })),
    
    // Additional context
    tags: v.array(v.string()),
    resolutionCriteria: v.optional(v.string()),
    endDate: v.optional(v.number()),
    
    // Market metrics
    volume: v.optional(v.number()),
    liquidity: v.optional(v.number()),
    
    // Status tracking
    isActive: v.boolean(),
    isClosed: v.boolean(),
    normalizedAt: v.number(),
    needsLLMAnalysis: v.boolean(),
    
    // Quality validation
    dataQuality: v.object({
      hasValidTitle: v.boolean(),
      hasValidOutcomes: v.boolean(),
      hasValidPrices: v.boolean(),
      passesFilter: v.boolean(),
    }),
  })
  .index("by_platform", ["platformId"])
  .index("by_category", ["category"])
  .index("by_needs_analysis", ["needsLLMAnalysis"])
  .index("by_event_type", ["eventType"])
  .index("by_active", ["isActive"])
  .index("by_quality", ["dataQuality.passesFilter"]),
};
```

### Task 2: Platform Data Fetching Functions
**File**: `convex/jobs.ts`
**Estimated Time**: 4-5 hours

```typescript
// Enhanced fetching with real endpoints

// Kalshi fetching - single request for all markets
export const fetchKalshiMarkets = internalAction({
  args: {},
  handler: async (ctx) => {
    const platform = await ctx.runQuery(internal.platforms.getByName, { name: "kalshi" });
    if (!platform) throw new Error("Kalshi platform not found");

    try {
      // Single request gets ALL markets
      const response = await fetch("https://trading-api.kalshi.com/v1/cached/markets/", {
        headers: {
          "Accept": "application/json",
          "User-Agent": "MarketFinder/1.0",
        },
      });

      if (!response.ok) {
        throw new Error(`Kalshi API error: ${response.status}`);
      }

      const data = await response.json();
      const allMarkets = data.markets;
      
      // Filter for active binary markets
      const activeMarkets = allMarkets.filter(market => 
        market.close_date > new Date().toISOString() &&
        market.status === "active"
      );

      // Store raw data in batches
      const batchSize = 100;
      let processedCount = 0;

      for (let i = 0; i < activeMarkets.length; i += batchSize) {
        const batch = activeMarkets.slice(i, i + batchSize);
        
        for (const market of batch) {
          await ctx.runMutation(internal.jobs.storeRawMarket, {
            platformId: platform._id,
            externalId: market.ticker || market.id,
            rawData: market,
            fetchedAt: Date.now(),
          });
          processedCount++;
        }
      }

      // Update platform sync status
      await ctx.runMutation(internal.platforms.updateSyncStatus, {
        platformId: platform._id,
        status: "success",
        marketsProcessed: processedCount,
        lastSync: Date.now(),
      });

      return { 
        success: true, 
        marketsProcessed: processedCount,
        totalFetched: allMarkets.length 
      };

    } catch (error) {
      await ctx.runMutation(internal.platforms.updateSyncStatus, {
        platformId: platform._id,
        status: "error",
        error: error.message,
      });
      throw error;
    }
  },
});

// Polymarket fetching - Gamma API (no auth required)
export const fetchPolymarketMarkets = internalAction({
  args: {},
  handler: async (ctx) => {
    const platform = await ctx.runQuery(internal.platforms.getByName, { name: "polymarket" });
    if (!platform) throw new Error("Polymarket platform not found");

    try {
      // Fetch with high limit to get most markets in one request
      const response = await fetch("https://gamma-api.polymarket.com/markets", {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "MarketFinder/1.0",
        },
        body: JSON.stringify({
          active: true,
          limit: 1000,
        }),
      });

      if (!response.ok) {
        throw new Error(`Polymarket API error: ${response.status}`);
      }

      const markets = await response.json();
      
      // Filter for binary markets only
      const binaryMarkets = markets.filter(market => 
        market.active === true &&
        market.closed === false &&
        market.tokens?.length === 2 // Binary markets have 2 tokens
      );

      let processedCount = 0;
      const batchSize = 100;

      for (let i = 0; i < binaryMarkets.length; i += batchSize) {
        const batch = binaryMarkets.slice(i, i + batchSize);
        
        for (const market of batch) {
          await ctx.runMutation(internal.jobs.storeRawMarket, {
            platformId: platform._id,
            externalId: market.condition_id,
            rawData: market,
            fetchedAt: Date.now(),
          });
          processedCount++;
        }
      }

      await ctx.runMutation(internal.platforms.updateSyncStatus, {
        platformId: platform._id,
        status: "success",
        marketsProcessed: processedCount,
        lastSync: Date.now(),
      });

      return { 
        success: true, 
        marketsProcessed: processedCount,
        totalFetched: markets.length 
      };

    } catch (error) {
      await ctx.runMutation(internal.platforms.updateSyncStatus, {
        platformId: platform._id,
        status: "error",
        error: error.message,
      });
      throw error;
    }
  },
});

// Store raw market data
export const storeRawMarket = internalMutation({
  args: {
    platformId: v.id("platforms"),
    externalId: v.string(),
    rawData: v.any(),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if market already exists (upsert logic)
    const existing = await ctx.db
      .query("rawMarkets")
      .withIndex("by_platform", q => q.eq("platformId", args.platformId))
      .filter(q => q.eq(q.field("externalId"), args.externalId))
      .first();

    if (existing) {
      // Update existing record
      await ctx.db.patch(existing._id, {
        rawData: args.rawData,
        fetchedAt: args.fetchedAt,
        processed: false, // Mark for re-processing
      });
      return existing._id;
    } else {
      // Insert new record
      return await ctx.db.insert("rawMarkets", {
        ...args,
        processed: false,
      });
    }
  },
});
```

### Task 3: Data Normalization Pipeline
**File**: `convex/normalization.ts` (new file)
**Estimated Time**: 3-4 hours

```typescript
// Data normalization functions

export const normalizeAllRawMarkets = internalAction({
  args: {},
  handler: async (ctx) => {
    // Get unprocessed raw markets
    const rawMarkets = await ctx.runQuery(internal.normalization.getUnprocessedMarkets);
    
    let processedCount = 0;
    let errorCount = 0;

    for (const rawMarket of rawMarkets) {
      try {
        const platform = await ctx.runQuery(internal.platforms.getById, { 
          id: rawMarket.platformId 
        });
        
        let normalizedMarket;
        if (platform.name === "kalshi") {
          normalizedMarket = normalizeKalshiMarket(rawMarket, platform._id);
        } else if (platform.name === "polymarket") {
          normalizedMarket = normalizePolymarketMarket(rawMarket, platform._id);
        } else {
          throw new Error(`Unknown platform: ${platform.name}`);
        }

        // Validate market data quality
        const dataQuality = validateMarketData(normalizedMarket);
        normalizedMarket.dataQuality = dataQuality;

        // Only store markets that pass quality filter
        if (dataQuality.passesFilter) {
          await ctx.runMutation(internal.normalization.storeNormalizedMarket, {
            market: normalizedMarket,
          });
        }

        // Mark raw market as processed
        await ctx.runMutation(internal.normalization.markRawMarketProcessed, {
          rawMarketId: rawMarket._id,
        });

        processedCount++;

      } catch (error) {
        console.error(`Error normalizing market ${rawMarket.externalId}:`, error);
        errorCount++;
      }
    }

    return { processedCount, errorCount };
  },
});

function normalizeKalshiMarket(rawMarket: any, platformId: string) {
  const market = rawMarket.rawData;
  
  return {
    platformId,
    externalId: market.ticker || market.id,
    title: market.title,
    description: market.subtitle || market.title,
    category: standardizeCategory("kalshi", market.category),
    eventType: "binary",
    outcomes: [
      { name: "Yes", currentPrice: parseFloat(market.yes_ask || market.yes_price || 0.5) },
      { name: "No", currentPrice: parseFloat(market.no_ask || market.no_price || 0.5) }
    ],
    tags: [market.category, market.series_ticker].filter(Boolean),
    resolutionCriteria: market.rules,
    endDate: new Date(market.close_date).getTime(),
    volume: parseFloat(market.volume || 0),
    liquidity: parseFloat(market.open_interest || 0),
    isActive: market.status === "active",
    isClosed: market.status === "closed",
    normalizedAt: Date.now(),
    needsLLMAnalysis: true,
  };
}

function normalizePolymarketMarket(rawMarket: any, platformId: string) {
  const market = rawMarket.rawData;
  
  return {
    platformId,
    externalId: market.condition_id,
    title: market.question,
    description: market.description || market.question,
    category: standardizeCategory("polymarket", market.category),
    eventType: "binary",
    outcomes: market.tokens.map(token => ({
      name: token.outcome,
      currentPrice: parseFloat(token.price || 0.5)
    })),
    tags: [market.category].filter(Boolean),
    resolutionCriteria: market.rules,
    endDate: new Date(market.end_date_iso).getTime(),
    volume: parseFloat(market.volume || 0),
    liquidity: parseFloat(market.liquidity || 0),
    isActive: market.active && !market.closed,
    isClosed: market.closed,
    normalizedAt: Date.now(),
    needsLLMAnalysis: true,
  };
}

function validateMarketData(market: any) {
  const hasValidTitle = !!market.title && market.title.length > 10;
  const hasValidOutcomes = market.outcomes?.length === 2;
  const hasValidPrices = market.outcomes?.every(o => 
    o.currentPrice >= 0 && o.currentPrice <= 1
  );
  const hasCategory = !!market.category;
  const isActive = market.isActive === true;
  const hasFutureEndDate = market.endDate > Date.now();

  const passesFilter = hasValidTitle && 
                      hasValidOutcomes && 
                      hasValidPrices && 
                      hasCategory && 
                      isActive && 
                      hasFutureEndDate;

  return {
    hasValidTitle,
    hasValidOutcomes, 
    hasValidPrices,
    passesFilter,
  };
}

function standardizeCategory(platform: string, originalCategory: string): string {
  if (platform === "kalshi") {
    return originalCategory.toLowerCase();
  }
  
  const categoryMap = {
    "Politics": "politics",
    "Sports": "sports", 
    "Cryptocurrency": "crypto",
    "Technology": "technology",
    "Science": "technology",
    "Economics": "economics",
    "Business": "economics",
    "Climate": "climate",
    "Health": "health",
    "World": "world",
    "Culture": "culture",
    "Entertainment": "culture"
  };
  
  return categoryMap[originalCategory] || "other";
}
```

### Task 4: Cron Job Integration
**File**: `convex/crons.ts`
**Estimated Time**: 1 hour

```typescript
// Update existing crons.ts
const crons = cronJobs();

// Enhanced market sync with normalization
crons.interval("kalshi full sync", { minutes: 30 }, internal.jobs.runKalshiSync, {});
crons.interval("polymarket full sync", { minutes: 35 }, internal.jobs.runPolymarketSync, {}); 

// New: Data normalization after fetches
crons.interval("normalize raw markets", { minutes: 40 }, internal.normalization.normalizeAllRawMarkets, {});
```

### Task 5: Testing & Validation
**File**: `convex/test.ts` (new file)
**Estimated Time**: 2-3 hours

```typescript
// Test functions for Week 1 pipeline

export const testKalshiFetch = internalAction({
  args: {},
  handler: async (ctx) => {
    console.log("Testing Kalshi fetch...");
    const result = await ctx.runAction(internal.jobs.fetchKalshiMarkets);
    console.log("Kalshi fetch result:", result);
    return result;
  },
});

export const testPolymarketFetch = internalAction({
  args: {},
  handler: async (ctx) => {
    console.log("Testing Polymarket fetch...");
    const result = await ctx.runAction(internal.jobs.fetchPolymarketMarkets);
    console.log("Polymarket fetch result:", result);
    return result;
  },
});

export const testNormalization = internalAction({
  args: {},
  handler: async (ctx) => {
    console.log("Testing normalization...");
    const result = await ctx.runAction(internal.normalization.normalizeAllRawMarkets);
    console.log("Normalization result:", result);
    return result;
  },
});
```

---

## Success Criteria for Week 1

### ✅ Must Complete:
1. **Schema Enhancement**: New tables `rawMarkets` and `normalizedMarkets` created
2. **Data Fetching**: Successfully fetch all markets from both platforms
3. **Data Storage**: Store raw API responses in database
4. **Data Normalization**: Transform raw data into standardized format
5. **Quality Validation**: Filter out invalid/incomplete markets
6. **Cron Integration**: Automated pipeline runs every 30-35 minutes

### 📊 Success Metrics:
- **Kalshi**: Fetch 500-1500 active binary markets
- **Polymarket**: Fetch 300-800 active binary markets  
- **Data Quality**: >90% of markets pass validation filters
- **Processing Speed**: Complete pipeline runs in <5 minutes
- **Error Rate**: <5% of markets fail normalization

### 🧪 Testing Checklist:
- [ ] Manual fetch test for each platform
- [ ] Raw data storage verification
- [ ] Normalization accuracy spot-checks
- [ ] Category mapping validation
- [ ] Data quality filter effectiveness
- [ ] Cron job execution monitoring

---

## Implementation Order

### Day 1-2: Foundation
1. Update `convex/schema.ts` with new tables
2. Create basic fetching functions in `convex/jobs.ts`
3. Test manual data fetching

### Day 3-4: Data Processing  
1. Build normalization pipeline in `convex/normalization.ts`
2. Implement data quality validation
3. Test end-to-end data flow

### Day 5: Integration & Testing
1. Update cron jobs for automated pipeline
2. Run comprehensive tests
3. Monitor data quality and performance
4. Document any issues for Week 2

**Ready to begin implementation with solid foundation for LLM semantic analysis in Week 2!**