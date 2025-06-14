# Data Standardization Mapping

## Overview
This document defines the standardized data mapping between Kalshi and Polymarket APIs for the MarketFinder arbitrage detection pipeline.

---

## API Endpoints Used

### Kalshi
- **Endpoint**: `/cached/markets` (better performance)
- **Authentication**: 30-minute tokens with auto-renewal at 25 minutes
- **Rate Limit**: 20 requests/second (basic tier)
- **Pagination**: Cursor-based (`cursor=abc123&limit=50`)

### Polymarket  
- **Endpoint**: Gamma API (`gamma-api.polymarket.com/markets`)
- **Authentication**: Simplest approach (read-only)
- **Rate Limit**: Conservative with exponential backoff
- **Pagination**: Cursor-based

---

## Field Mapping Matrix

| Standardized Field | Kalshi Source | Polymarket Source | Notes |
|-------------------|---------------|-------------------|-------|
| **externalId** | `market_id` (UUID) | `condition_id` | Primary identifier |
| **title** | Market title | `question` | Market question/title |
| **description** | Market description | Market description | Extended context |
| **category** | Category (9 predefined) | `category` field | See category mapping below |
| **eventType** | "binary" (focus) | "binary" (focus) | Phase 1: binary markets only |
| **outcomes** | Outcome array | `tokens` array | Yes/No outcomes |
| **endDate** | Market end date | `end_date_iso` | ISO format standardization |
| **volume** | Volume data | `volume` | Trading volume |
| **liquidity** | Liquidity data | `liquidity` | Available liquidity |
| **isActive** | Market status | `active` boolean | Market trading status |
| **isClosed** | Market closure | `closed` boolean | Market closure status |

---

## Category Standardization

### Kalshi Categories (9 defined)
1. **Politics** → `politics`
2. **Sports** → `sports` 
3. **Culture** → `culture`
4. **Crypto** → `crypto`
5. **Climate** → `climate`
6. **Economics** → `economics`
7. **Tech & Science** → `technology`
8. **Health** → `health`
9. **World** → `world`

### Polymarket Category Mapping
- Use `market.category` field directly
- Map to closest Kalshi category when possible
- Create `other` category for unmapped Polymarket categories
- Track original category in `tags` array

### Category Mapping Logic
```typescript
function standardizeCategory(platform: string, originalCategory: string): string {
  if (platform === "kalshi") {
    return originalCategory.toLowerCase();
  }
  
  if (platform === "polymarket") {
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
}
```

---

## Outcome Structure Standardization

### Kalshi Outcomes
```json
{
  "outcomes": [
    {"name": "Yes", "price": 0.65},
    {"name": "No", "price": 0.35}
  ]
}
```

### Polymarket Outcomes  
```json
{
  "tokens": [
    {"outcome": "Yes", "price": "0.65"},
    {"outcome": "No", "price": "0.35"}  
  ]
}
```

### Normalized Structure
```typescript
interface StandardizedOutcome {
  name: string;        // "Yes" | "No" for binary
  currentPrice: number; // 0.0 - 1.0 probability
}
```

---

## Data Quality Validation

### Required Fields Validation
```typescript
interface MarketValidation {
  hasTitle: boolean;
  hasCategory: boolean;
  hasBinaryOutcomes: boolean;
  hasValidPrices: boolean;
  isActiveMarket: boolean;
  hasEndDate: boolean;
}

function validateMarket(market: any): MarketValidation {
  return {
    hasTitle: !!market.title && market.title.length > 0,
    hasCategory: !!market.category,
    hasBinaryOutcomes: market.outcomes?.length === 2,
    hasValidPrices: market.outcomes?.every(o => 
      o.currentPrice >= 0 && o.currentPrice <= 1
    ),
    isActiveMarket: market.isActive === true,
    hasEndDate: !!market.endDate && market.endDate > Date.now()
  };
}
```

---

## Normalization Pipeline

### Step 1: Raw Data Storage
```typescript
// Store original API responses
await ctx.db.insert("rawMarkets", {
  platformId: platformId,
  externalId: market.id || market.condition_id,
  rawData: market, // Complete original response
  fetchedAt: Date.now(),
  processed: false
});
```

### Step 2: Data Transformation
```typescript
function normalizeKalshiMarket(rawMarket: any, platformId: Id<"platforms">) {
  return {
    platformId,
    externalId: rawMarket.market_id,
    title: rawMarket.title,
    description: rawMarket.description || rawMarket.title,
    category: standardizeCategory("kalshi", rawMarket.category),
    eventType: "binary",
    outcomes: rawMarket.outcomes.map(o => ({
      name: o.name,
      currentPrice: parseFloat(o.price)
    })),
    tags: [rawMarket.category], // Keep original
    resolutionCriteria: rawMarket.resolution_criteria,
    endDate: new Date(rawMarket.end_date).getTime(),
    volume: rawMarket.volume,
    liquidity: rawMarket.liquidity,
    isActive: rawMarket.status === "active",
    normalizedAt: Date.now(),
    needsLLMAnalysis: true
  };
}

function normalizePolymarketMarket(rawMarket: any, platformId: Id<"platforms">) {
  return {
    platformId,
    externalId: rawMarket.condition_id,
    title: rawMarket.question,
    description: rawMarket.description || rawMarket.question,
    category: standardizeCategory("polymarket", rawMarket.category),
    eventType: "binary",
    outcomes: rawMarket.tokens.map(token => ({
      name: token.outcome,
      currentPrice: parseFloat(token.price)
    })),
    tags: [rawMarket.category], // Keep original
    resolutionCriteria: rawMarket.resolution_criteria,
    endDate: new Date(rawMarket.end_date_iso).getTime(),
    volume: rawMarket.volume,
    liquidity: rawMarket.liquidity,
    isActive: rawMarket.active && !rawMarket.closed,
    normalizedAt: Date.now(),
    needsLLMAnalysis: true
  };
}
```

---

## Fetch Timing Analysis

### 30-Minute Window Feasibility

**Real API Endpoints:**
- **Kalshi**: `https://trading-api.kalshi.com/v1/cached/markets/` (single response)
- **Polymarket**: `https://gamma-api.polymarket.com/markets` (no auth required)

**Updated Market Count Analysis:**
- **Kalshi**: All markets in single response (no pagination needed!)
- **Polymarket**: ~1000 markets with `limit=1000` parameter
- **Rate limits**: Kalshi 20/s, Polymarket no auth limits
- **Processing overhead**: ~30% for normalization

**Revised Calculation:**
```
Kalshi: 1 request (all markets) = 0.05 seconds
Polymarket: 1-2 requests = 0.1-0.2 seconds  
Processing: 2-3 minutes for normalization and storage

Total: ~3 minutes maximum - WELL within 30-minute window
```

**Key Advantages:**
- ✅ Kalshi returns ALL markets in single response (no pagination)
- ✅ Polymarket Gamma API requires no authentication
- ✅ Minimal network time, most time spent on data processing
- ✅ Massive safety margin within 30-minute token window

**Conclusion**: ✅ **Extremely feasible** - fetch completes in seconds, not minutes

---

## Error Handling Strategy

### Rate Limit Handling
```typescript
async function fetchWithBackoff(url: string, options: any, attempt = 1): Promise<any> {
  try {
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // Max 30s
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithBackoff(url, options, attempt + 1);
    }
    
    return response.json();
  } catch (error) {
    if (attempt < 3) {
      const delay = 1000 * attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithBackoff(url, options, attempt + 1);
    }
    throw error;
  }
}
```

### Data Quality Filtering
```typescript
function shouldProcessMarket(market: any): boolean {
  const validation = validateMarket(market);
  return validation.hasTitle && 
         validation.hasCategory && 
         validation.hasBinaryOutcomes && 
         validation.hasValidPrices && 
         validation.isActiveMarket;
}
```

---

## Implementation Priority

### Phase 1 (Week 1): Basic Mapping
- [x] Define core field mappings
- [ ] Implement normalization functions
- [ ] Test with sample data from both platforms
- [ ] Validate data quality filtering

### Phase 2 (Week 2): LLM Preparation  
- [ ] Optimize market grouping by category
- [ ] Implement batch preparation for LLM analysis
- [ ] Test category-based filtering performance

### Phase 3 (Week 3): Full Integration
- [ ] Connect to arbitrage detection pipeline
- [ ] Implement real-time data updates
- [ ] Monitor data quality metrics