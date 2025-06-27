# API Contracts: ETL Service ↔ Website Integration

## 🔄 Overview

This document defines the API contracts between the external ETL service and the MarketFinder website, ensuring clean separation of concerns and efficient data flow.

---

## 🏗️ Architecture Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   MARKETFINDER-ETL SERVICE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│ │   FETCH     │ │  PROCESS    │ │  ANALYZE    │ │   STORE     │ │
│ │             │ │             │ │             │ │             │ │
│ │ • Kalshi    │ │ • Bucketing │ │ • ML Score  │ │ • Results   │ │
│ │ • Polymarket│ │ • Filtering │ │ • LLM Eval  │ │ • Metrics   │ │
│ │ • 50K+ mkts │ │ • Transform │ │ • Arbitrage │ │ • Health    │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ │
│                                                       │         │
│                                                       ▼         │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │                  REST API ENDPOINTS                         │ │
│ │ • GET /api/arbitrage                                        │ │
│ │ • GET /api/markets/summary                                  │ │
│ │ • GET /api/health                                           │ │
│ │ • POST /api/sync (trigger)                                  │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   │ HTTP REST API
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                   MARKETFINDER-WEBSITE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│ │   CRON      │ │   CONVEX    │ │  FRONTEND   │ │    USER     │ │
│ │             │ │             │ │             │ │             │ │
│ │ • Fetch API │ │ • Store     │ │ • Display   │ │ • View      │ │
│ │ • 2x/day    │ │ • Real-time │ │ • Filter    │ │ • Filter    │ │
│ │ • Sync data │ │ • Subscribe │ │ • Monitor   │ │ • Trade     │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 API Specification

### Base Configuration

**ETL Service Base URL**: `https://marketfinder-etl.fly.dev`
**Authentication**: API Key in `Authorization: Bearer {token}` header
**Rate Limiting**: 1000 requests per hour per client
**Timeout**: 30 seconds per request

---

## 🔍 Primary Endpoints

### 1. GET /api/arbitrage

**Purpose**: Retrieve current arbitrage opportunities

**Request**:
```typescript
interface ArbitrageRequest {
  minProfitMargin?: number;     // Default: 0.02 (2%)
  minConfidence?: number;       // Default: 0.7 (70%)
  maxResults?: number;          // Default: 50
  platforms?: string[];         // Filter by platforms
  categories?: string[];        // Filter by categories
  sortBy?: 'profit' | 'confidence' | 'detected_at'; // Default: 'profit'
  sortOrder?: 'asc' | 'desc';   // Default: 'desc'
}
```

**Response**:
```typescript
interface ArbitrageResponse {
  success: true;
  data: {
    opportunities: ArbitrageOpportunity[];
    metadata: {
      totalFound: number;
      filteredCount: number;
      lastProcessed: string;        // ISO timestamp
      processingTime: number;       // seconds
      nextUpdate: string;           // ISO timestamp
      confidence: {
        high: number;               // count >0.8
        medium: number;             // count 0.6-0.8  
        low: number;                // count <0.6
      };
    };
  };
}

interface ArbitrageOpportunity {
  id: string;                     // Unique opportunity ID
  
  // Buy side (lower price)
  buyMarket: {
    title: string;
    platform: 'kalshi' | 'polymarket';
    externalId: string;
    outcome: string;              // "Yes" | "No"
    price: number;                // 0-1
    volume: number;
    url: string;
  };
  
  // Sell side (higher price)
  sellMarket: {
    title: string;
    platform: 'kalshi' | 'polymarket';
    externalId: string;
    outcome: string;              // "Yes" | "No"
    price: number;                // 0-1
    volume: number;
    url: string;
  };
  
  // Opportunity metrics
  profitMargin: number;           // 0-1 (potential profit)
  confidence: number;             // 0-1 (LLM confidence)
  reasoning: string;              // LLM explanation
  
  // Metadata
  detectedAt: string;             // ISO timestamp
  expiresAt: string;              // ISO timestamp
  category: string;               // Market category
  tags: string[];                 // Additional tags
  riskLevel: 'low' | 'medium' | 'high';
  
  // Trading info
  minInvestment: number;          // USD
  maxInvestment: number;          // USD (based on liquidity)
  estimatedReturn: number;        // USD for $1000 investment
}
```

**Example**:
```bash
curl -H "Authorization: Bearer {api_key}" \
  "https://marketfinder-etl.fly.dev/api/arbitrage?minProfitMargin=0.05&maxResults=10"
```

---

### 2. GET /api/markets/summary

**Purpose**: Get high-level market statistics and summaries

**Request**:
```typescript
interface MarketSummaryRequest {
  includeCategories?: boolean;    // Default: true
  includeTrends?: boolean;        // Default: false
  timeframe?: '1h' | '24h' | '7d'; // Default: '24h'
}
```

**Response**:
```typescript
interface MarketSummaryResponse {
  success: true;
  data: {
    overview: {
      totalMarkets: number;
      activeMarkets: number;
      totalVolume: number;         // USD
      avgConfidence: number;       // 0-1
      lastUpdated: string;         // ISO timestamp
      nextUpdate: string;          // ISO timestamp
    };
    
    byPlatform: {
      kalshi: PlatformSummary;
      polymarket: PlatformSummary;
    };
    
    categories?: CategorySummary[];
    trends?: TrendData[];
  };
}

interface PlatformSummary {
  totalMarkets: number;
  activeMarkets: number;
  avgVolume: number;
  topCategories: string[];
  healthStatus: 'healthy' | 'degraded' | 'down';
  lastSync: string;               // ISO timestamp
  errorRate: number;              // 0-1
}

interface CategorySummary {
  name: string;
  marketCount: number;
  totalVolume: number;
  avgProfitOpportunities: number;
  topMarkets: string[];           // Market titles
}

interface TrendData {
  timestamp: string;              // ISO timestamp
  totalMarkets: number;
  totalOpportunities: number;
  avgProfitMargin: number;
}
```

---

### 3. GET /api/health

**Purpose**: System health and performance metrics

**Response**:
```typescript
interface HealthResponse {
  success: true;
  data: {
    status: 'healthy' | 'degraded' | 'down';
    uptime: number;               // seconds
    version: string;              // ETL service version
    
    lastEtlRun: {
      runId: string;
      status: 'success' | 'partial' | 'error';
      startTime: string;          // ISO timestamp
      endTime: string;            // ISO timestamp
      duration: number;           // seconds
      marketsProcessed: number;
      opportunitiesFound: number;
      errors: string[];
    };
    
    performance: {
      avgResponseTime: number;    // milliseconds
      successRate: number;        // 0-1 (last 24h)
      errorRate: number;          // 0-1 (last 24h)
      requestCount: number;       // last 24h
    };
    
    resources: {
      cpuUsage: number;           // 0-1
      memoryUsage: number;        // 0-1
      diskUsage: number;          // 0-1
      dbConnections: number;
    };
    
    services: {
      kalshiApi: ServiceStatus;
      polymarketApi: ServiceStatus;
      llmProvider: ServiceStatus;
      database: ServiceStatus;
    };
  };
}

interface ServiceStatus {
  status: 'healthy' | 'degraded' | 'down';
  lastCheck: string;              // ISO timestamp
  responseTime: number;           // milliseconds
  errorCount: number;             // last hour
}
```

---

### 4. POST /api/sync

**Purpose**: Trigger manual ETL pipeline run (admin only)

**Request**:
```typescript
interface SyncRequest {
  type: 'full' | 'incremental' | 'opportunities_only';
  priority: 'low' | 'normal' | 'high';  // Default: 'normal'
  notify?: boolean;                     // Default: false
}
```

**Response**:
```typescript
interface SyncResponse {
  success: true;
  data: {
    runId: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    estimatedDuration: number;    // seconds
    queuePosition?: number;       // if queued
    startedAt?: string;           // ISO timestamp
    progress?: {
      stage: string;              // Current processing stage
      completed: number;          // 0-1
      eta: number;                // seconds remaining
    };
  };
}
```

---

## 🔒 Authentication & Security

### API Key Authentication

**Header Format**:
```
Authorization: Bearer etl_key_abc123...
```

**Key Rotation**: API keys rotate every 90 days
**Scope**: Each key has specific permissions (read-only, admin, etc.)

### Rate Limiting

| Endpoint | Rate Limit | Window |
|----------|------------|--------|
| `/api/arbitrage` | 60 requests | 1 minute |
| `/api/markets/summary` | 30 requests | 1 minute |  
| `/api/health` | 120 requests | 1 minute |
| `/api/sync` | 5 requests | 1 hour |

### Error Responses

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;                 // Error code
    message: string;              // Human readable
    details?: any;                // Additional context
    timestamp: string;            // ISO timestamp
    requestId: string;            // For debugging
  };
}
```

**Common Error Codes**:
- `INVALID_API_KEY`: Authentication failed
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INVALID_PARAMETERS`: Bad request parameters
- `SERVICE_UNAVAILABLE`: ETL service down
- `DATA_NOT_READY`: ETL pipeline still running

---

## 🔄 Website Integration Pattern

### Vercel Cron Implementation

```typescript
// api/cron/daily-sync.ts
export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  
  try {
    console.log('🔄 Starting daily ETL data sync...');
    
    // 1. Fetch latest arbitrage opportunities
    const arbitrageResponse = await fetch(
      `${process.env.ETL_SERVICE_URL}/api/arbitrage?maxResults=100`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.ETL_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!arbitrageResponse.ok) {
      throw new Error(`ETL API error: ${arbitrageResponse.status}`);
    }
    
    const arbitrageData = await arbitrageResponse.json();
    
    // 2. Fetch market summary
    const summaryResponse = await fetch(
      `${process.env.ETL_SERVICE_URL}/api/markets/summary`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.ETL_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!summaryResponse.ok) {
      throw new Error(`Summary API error: ${summaryResponse.status}`);
    }
    
    const summaryData = await summaryResponse.json();
    
    // 3. Store in Convex for frontend
    const convex = new ConvexHttpClient(process.env.CONVEX_URL!);
    
    await Promise.all([
      // Clear old opportunities and insert new ones
      convex.mutation(api.arbitrage.syncOpportunities, { 
        opportunities: arbitrageData.data.opportunities 
      }),
      
      // Update market summaries
      convex.mutation(api.markets.syncSummary, { 
        summary: summaryData.data 
      }),
      
      // Update system status
      convex.mutation(api.system.updateSyncStatus, {
        lastSync: Date.now(),
        opportunitiesCount: arbitrageData.data.opportunities.length,
        marketsCount: summaryData.data.overview.totalMarkets,
        status: 'success',
      }),
    ]);
    
    console.log(`✅ Sync completed: ${arbitrageData.data.opportunities.length} opportunities`);
    
    return new Response(JSON.stringify({ 
      success: true,
      opportunitiesProcessed: arbitrageData.data.opportunities.length,
      marketsProcessed: summaryData.data.overview.totalMarkets,
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('❌ Daily sync failed:', error);
    
    // Store error in Convex for monitoring
    try {
      const convex = new ConvexHttpClient(process.env.CONVEX_URL!);
      await convex.mutation(api.system.updateSyncStatus, {
        lastSync: Date.now(),
        status: 'error',
        error: error.message,
      });
    } catch (convexError) {
      console.error('Failed to log error to Convex:', convexError);
    }
    
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message,
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
```

### Convex Sync Mutations

```typescript
// convex/arbitrage.ts
export const syncOpportunities = mutation({
  args: { 
    opportunities: v.array(v.object({
      id: v.string(),
      buyMarket: v.object({
        title: v.string(),
        platform: v.string(),
        externalId: v.string(),
        outcome: v.string(),
        price: v.number(),
        volume: v.number(),
        url: v.string(),
      }),
      sellMarket: v.object({
        title: v.string(),
        platform: v.string(),
        externalId: v.string(),
        outcome: v.string(),
        price: v.number(),
        volume: v.number(),
        url: v.string(),
      }),
      profitMargin: v.number(),
      confidence: v.number(),
      reasoning: v.string(),
      detectedAt: v.string(),
      expiresAt: v.string(),
      category: v.string(),
      riskLevel: v.string(),
    }))
  },
  handler: async (ctx, { opportunities }) => {
    // Clear existing opportunities
    const existing = await ctx.db
      .query("arbitrageOpportunities")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    
    for (const opp of existing) {
      await ctx.db.delete(opp._id);
    }
    
    // Insert new opportunities
    for (const opportunity of opportunities) {
      await ctx.db.insert("arbitrageOpportunities", {
        externalId: opportunity.id,
        buyMarketTitle: opportunity.buyMarket.title,
        buyPlatform: opportunity.buyMarket.platform,
        buyOutcome: opportunity.buyMarket.outcome,
        buyPrice: opportunity.buyMarket.price,
        sellMarketTitle: opportunity.sellMarket.title,
        sellPlatform: opportunity.sellMarket.platform,
        sellOutcome: opportunity.sellMarket.outcome,
        sellPrice: opportunity.sellMarket.price,
        profitMargin: opportunity.profitMargin,
        confidence: opportunity.confidence,
        reasoning: opportunity.reasoning,
        detectedAt: new Date(opportunity.detectedAt).getTime(),
        expiresAt: new Date(opportunity.expiresAt).getTime(),
        category: opportunity.category,
        status: "active",
      });
    }
    
    return { inserted: opportunities.length };
  },
});
```

---

## 📊 Data Flow Optimization

### Bandwidth Usage Comparison

| Approach | Data Transfer | Operations | Cost Impact |
|----------|---------------|------------|-------------|
| **Current (Direct ETL)** | 161M comparisons | 161M Convex ops | $161K theoretical |
| **Proposed (API Integration)** | ~50 opportunities | ~100 Convex ops | <$1 actual |
| **Reduction** | 99.99997% | 99.99994% | 99.999% |

### Caching Strategy

**ETL Service Side**:
- Cache processed markets for 30 minutes
- Cache LLM results for 24 hours
- Cache API responses for 5 minutes

**Website Side**:
- Convex real-time subscriptions (no polling)
- Browser caching for static data (1 hour)
- Service worker for offline opportunity viewing

---

## 🔍 Monitoring & Observability

### Health Check Integration

```typescript
// api/cron/health-monitor.ts
export default async function handler(req: Request) {
  try {
    const health = await fetch(`${process.env.ETL_SERVICE_URL}/api/health`, {
      headers: { 'Authorization': `Bearer ${process.env.ETL_API_KEY}` },
    });
    
    const healthData = await health.json();
    
    // Store health metrics in Convex
    const convex = new ConvexHttpClient(process.env.CONVEX_URL!);
    await convex.mutation(api.monitoring.updateHealthMetrics, {
      etlStatus: healthData.data.status,
      lastEtlRun: healthData.data.lastEtlRun,
      performance: healthData.data.performance,
      timestamp: Date.now(),
    });
    
    // Alert on degraded status
    if (healthData.data.status !== 'healthy') {
      console.warn('🚨 ETL service health degraded:', healthData.data.status);
      // TODO: Send alert notification
    }
    
    return new Response('Health check completed', { status: 200 });
    
  } catch (error) {
    console.error('Health check failed:', error);
    return new Response('Health check failed', { status: 500 });
  }
}
```

### Error Handling

```typescript
// utils/etl-client.ts
export class ETLClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;
  
  constructor() {
    this.baseUrl = process.env.ETL_SERVICE_URL!;
    this.apiKey = process.env.ETL_API_KEY!;
    this.timeout = 30000; // 30 seconds
  }
  
  async getArbitrageOpportunities(params: ArbitrageRequest): Promise<ArbitrageOpportunity[]> {
    const url = new URL('/api/arbitrage', this.baseUrl);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        }
        if (response.status === 503) {
          throw new Error('ETL service temporarily unavailable.');
        }
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error?.message || 'Unknown API error');
      }
      
      return data.data.opportunities;
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timeout. ETL service may be under heavy load.');
      }
      
      throw error;
    }
  }
}
```

---

## 🚀 Deployment Configuration

### Environment Variables

**ETL Service**:
```bash
# API Configuration
PORT=3000
API_KEY_SECRET=your_secret_key_here
ALLOWED_ORIGINS=https://marketfinder.app,https://marketfinder-staging.vercel.app

# Database
DATABASE_URL=postgresql://user:pass@host:5432/marketfinder_etl
REDIS_URL=redis://host:6379

# External APIs
KALSHI_API_KEY=your_kalshi_key
KALSHI_PRIVATE_KEY=your_kalshi_private_key
POLYMARKET_API_KEY=your_polymarket_key
OPENAI_API_KEY=your_openai_key

# LLM Configuration
LLM_PROVIDER=openai
LLM_MODEL=gpt-4
LLM_MAX_TOKENS=4000
LLM_TEMPERATURE=0.1

# Performance
MAX_CONCURRENT_REQUESTS=10
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=1000
```

**Website**:
```bash
# ETL Integration
ETL_SERVICE_URL=https://marketfinder-etl.fly.dev
ETL_API_KEY=your_etl_api_key

# Convex
CONVEX_URL=https://your-convex-deployment.convex.cloud
NEXT_PUBLIC_CONVEX_URL=https://your-convex-deployment.convex.cloud

# Monitoring
SENTRY_DSN=your_sentry_dsn
ANALYTICS_ID=your_analytics_id
```

### Vercel Configuration

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-sync",
      "schedule": "0 */12 * * *"
    },
    {
      "path": "/api/cron/health-monitor", 
      "schedule": "*/30 * * * *"
    }
  ],
  "functions": {
    "api/cron/daily-sync.ts": {
      "maxDuration": 60
    },
    "api/cron/health-monitor.ts": {
      "maxDuration": 30
    }
  }
}
```

This API contract specification ensures efficient, reliable communication between the ETL service and website, enabling the dramatic bandwidth reduction and performance improvements outlined in the restructuring plan.