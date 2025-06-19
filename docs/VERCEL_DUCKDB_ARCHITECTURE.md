# Vercel Functions + DuckDB + Convex Architecture

## Overview
Complete ETL pipeline architecture using Vercel Functions for processing, DuckDB for data transformation, and Convex for real-time frontend data.

---

## Architecture Benefits

### **Vercel Functions**
- ✅ Serverless scaling for data processing
- ✅ Built-in cron job support
- ✅ No infrastructure management
- ✅ Fast cold starts for scheduled tasks

### **DuckDB**
- ✅ In-memory SQL processing (no external DB needed)
- ✅ Excellent performance for analytical queries
- ✅ Perfect for data transformation and aggregation
- ✅ SQL-based semantic analysis and arbitrage detection

### **Convex**
- ✅ Real-time subscriptions for frontend
- ✅ Optimized for clean, structured data
- ✅ Built-in authentication and permissions
- ✅ Minimal bandwidth usage (processed data only)

---

## Complete Pipeline Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Vercel ETL    │    │     DuckDB       │    │     Convex      │
│   Functions     │───▶│  Transformation  │───▶│   Frontend DB   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
    ┌────▼────┐              ┌───▼───┐               ┌───▼───┐
    │ Kalshi  │              │  SQL  │               │React  │
    │Polymarket│              │Queries│               │ App   │
    │   APIs  │              │LLM    │               │Users  │
    └─────────┘              │Analysis│               └───────┘
                             └───────┘
```

---

## Implementation Plan

### **Stage 1: Data Extraction & Loading**

```typescript
// api/etl-pipeline/route.ts
import { ConvexHttpClient } from "convex/browser";
import * as duckdb from 'duckdb';
import { api } from "../../convex/_generated/api";

export async function POST() {
  try {
    console.log("Starting ETL pipeline...");
    
    // 1. EXTRACT: Fetch from both platforms
    const [kalshiData, polymarketData] = await Promise.all([
      fetchKalshiMarkets(),
      fetchPolymarketMarkets()
    ]);

    console.log(`Fetched ${kalshiData.length} Kalshi + ${polymarketData.length} Polymarket markets`);

    // 2. TRANSFORM: Load into DuckDB for processing
    const db = await duckdb.Database.create(':memory:');
    const conn = await db.connect();

    // Load raw data into DuckDB tables
    await loadRawDataIntoDuckDB(conn, kalshiData, polymarketData);
    
    // Transform and normalize data
    const unifiedMarkets = await transformMarketsInDuckDB(conn);
    
    // Detect market similarities using SQL
    const similarities = await detectSimilaritiesInDuckDB(conn, unifiedMarkets);
    
    // Calculate arbitrage opportunities
    const opportunities = await calculateArbitrageInDuckDB(conn, similarities);

    // 3. LOAD: Store clean data in Convex
    const convex = new ConvexHttpClient(process.env.CONVEX_URL!);
    
    await Promise.all([
      convex.mutation(api.etl.upsertMarkets, { markets: unifiedMarkets }),
      convex.mutation(api.etl.upsertSimilarities, { similarities }),
      convex.mutation(api.etl.upsertOpportunities, { opportunities })
    ]);

    await conn.close();
    await db.close();

    return Response.json({ 
      success: true, 
      markets: unifiedMarkets.length,
      similarities: similarities.length,
      opportunities: opportunities.length 
    });

  } catch (error) {
    console.error("ETL pipeline failed:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// Helper functions
async function fetchKalshiMarkets() {
  const response = await fetch("https://trading-api.kalshi.com/v1/cached/markets/");
  const data = await response.json();
  
  return data.markets
    .filter(market => 
      market.close_date > new Date().toISOString() &&
      market.status === "active"
    )
    .map(market => ({
      platform: 'kalshi',
      external_id: market.ticker || market.id,
      title: market.title,
      description: market.subtitle || market.title,
      category: market.category?.toLowerCase() || 'other',
      yes_price: parseFloat(market.yes_ask || 0.5),
      no_price: parseFloat(market.no_ask || 0.5),
      volume: parseFloat(market.volume || 0),
      liquidity: parseFloat(market.open_interest || 0),
      end_date: new Date(market.close_date).getTime(),
      is_active: true,
      raw_data: JSON.stringify(market)
    }));
}

async function fetchPolymarketMarkets() {
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
      platform: 'polymarket',
      external_id: market.condition_id,
      title: market.question,
      description: market.description || market.question,
      category: standardizeCategory(market.category),
      yes_price: parseFloat(market.tokens?.find(t => t.outcome === 'Yes')?.price || 0.5),
      no_price: parseFloat(market.tokens?.find(t => t.outcome === 'No')?.price || 0.5),
      volume: parseFloat(market.volume || 0),
      liquidity: parseFloat(market.liquidity || 0),
      end_date: new Date(market.end_date_iso).getTime(),
      is_active: true,
      raw_data: JSON.stringify(market)
    }));
}

function standardizeCategory(category: string): string {
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
  
  return categoryMap[category] || "other";
}
```

### **Stage 2: DuckDB Data Transformation**

```typescript
// api/etl-pipeline/transforms.ts

async function loadRawDataIntoDuckDB(conn: any, kalshiData: any[], polymarketData: any[]) {
  // Create tables and insert data
  await conn.run(`
    CREATE TABLE raw_kalshi (
      platform VARCHAR,
      external_id VARCHAR,
      title VARCHAR,
      description VARCHAR,
      category VARCHAR,
      yes_price DOUBLE,
      no_price DOUBLE,
      volume DOUBLE,
      liquidity DOUBLE,
      end_date BIGINT,
      is_active BOOLEAN,
      raw_data VARCHAR
    )
  `);

  await conn.run(`
    CREATE TABLE raw_polymarket (
      platform VARCHAR,
      external_id VARCHAR,
      title VARCHAR,
      description VARCHAR,
      category VARCHAR,
      yes_price DOUBLE,
      no_price DOUBLE,
      volume DOUBLE,
      liquidity DOUBLE,
      end_date BIGINT,
      is_active BOOLEAN,
      raw_data VARCHAR
    )
  `);

  // Insert data (DuckDB supports batch inserts)
  if (kalshiData.length > 0) {
    await conn.insertJSONObjects("raw_kalshi", kalshiData);
  }
  
  if (polymarketData.length > 0) {
    await conn.insertJSONObjects("raw_polymarket", polymarketData);
  }
}

async function transformMarketsInDuckDB(conn: any) {
  // Create unified markets table with standardized schema
  await conn.run(`
    CREATE TABLE unified_markets AS
    SELECT 
      platform,
      external_id,
      title,
      description,
      category,
      'binary' as event_type,
      [
        {'name': 'Yes', 'price': yes_price},
        {'name': 'No', 'price': no_price}
      ] as outcomes,
      volume,
      liquidity,
      end_date,
      is_active,
      now() as processed_at,
      -- Data quality checks
      CASE WHEN 
        length(title) > 10 AND
        yes_price BETWEEN 0 AND 1 AND
        no_price BETWEEN 0 AND 1 AND
        abs(yes_price + no_price - 1.0) < 0.1 AND
        end_date > extract(epoch from now()) * 1000
      THEN true ELSE false END as quality_pass
    FROM (
      SELECT * FROM raw_kalshi
      UNION ALL
      SELECT * FROM raw_polymarket
    )
    WHERE is_active = true
  `);

  // Return only high-quality markets
  const result = await conn.query(`
    SELECT * FROM unified_markets 
    WHERE quality_pass = true
    ORDER BY volume DESC
  `);

  return result.toArray();
}

async function detectSimilaritiesInDuckDB(conn: any, markets: any[]) {
  // Create market comparison pairs within same category
  await conn.run(`
    CREATE TABLE market_pairs AS
    SELECT 
      k.external_id as market1_id,
      p.external_id as market2_id,
      k.platform as platform1,
      p.platform as platform2,
      k.title as title1,
      p.title as title2,
      k.category,
      -- Simple text similarity scoring
      CASE 
        WHEN levenshtein(lower(k.title), lower(p.title)) < 10 THEN 0.9
        WHEN regexp_matches(lower(k.title), '\\b' || regexp_replace(lower(p.title), '[^a-z0-9\\s]', '', 'g') || '\\b') THEN 0.8
        WHEN k.category = p.category AND extract(epoch from now()) - extract(epoch from now()) < 86400 THEN 0.7
        ELSE 0.5
      END as confidence_score
    FROM unified_markets k
    CROSS JOIN unified_markets p
    WHERE k.platform = 'kalshi' 
      AND p.platform = 'polymarket'
      AND k.category = p.category
      AND k.external_id != p.external_id
  `);

  // For now, return high-confidence matches (later: replace with LLM analysis)
  const result = await conn.query(`
    SELECT 
      market1_id,
      market2_id,
      platform1,
      platform2,
      confidence_score as confidence,
      'Basic text similarity' as reasoning,
      extract(epoch from now()) * 1000 as analyzed_at
    FROM market_pairs 
    WHERE confidence_score >= 0.7
    ORDER BY confidence_score DESC
  `);

  return result.toArray();
}

async function calculateArbitrageInDuckDB(conn: any, similarities: any[]) {
  if (similarities.length === 0) return [];

  // Create arbitrage opportunities table
  await conn.run(`
    CREATE TABLE arbitrage_calc AS
    SELECT 
      s.market1_id,
      s.market2_id,
      s.platform1,
      s.platform2,
      s.confidence,
      m1.outcomes[1].price as market1_yes_price,
      m2.outcomes[1].price as market2_yes_price,
      m1.volume as market1_volume,
      m2.volume as market2_volume,
      -- Calculate arbitrage opportunity
      CASE 
        WHEN m1.outcomes[1].price < m2.outcomes[2].price 
        THEN (m2.outcomes[2].price - m1.outcomes[1].price) / m1.outcomes[1].price
        WHEN m2.outcomes[1].price < m1.outcomes[2].price
        THEN (m1.outcomes[2].price - m2.outcomes[1].price) / m2.outcomes[1].price
        ELSE 0
      END as profit_margin,
      CASE 
        WHEN m1.outcomes[1].price < m2.outcomes[2].price 
        THEN m1.external_id 
        ELSE m2.external_id
      END as buy_market_id,
      CASE 
        WHEN m1.outcomes[1].price < m2.outcomes[2].price 
        THEN m2.external_id 
        ELSE m1.external_id
      END as sell_market_id,
      extract(epoch from now()) * 1000 as detected_at
    FROM (SELECT unnest($1::JSON[]) as similarity) s_table(similarities)
    CROSS JOIN LATERAL (SELECT s_table.similarity as s)
    JOIN unified_markets m1 ON m1.external_id = s.market1_id
    JOIN unified_markets m2 ON m2.external_id = s.market2_id
  `);

  const result = await conn.query(`
    SELECT 
      buy_market_id,
      sell_market_id,
      platform1 as buy_platform,
      platform2 as sell_platform,
      profit_margin,
      confidence,
      detected_at,
      'active' as status
    FROM arbitrage_calc 
    WHERE profit_margin > 0.02  -- 2% minimum profit
    ORDER BY profit_margin DESC
  `);

  return result.toArray();
}
```

### **Stage 3: Convex Integration**

```typescript
// convex/etl.ts - Simplified mutations for ETL data

export const upsertMarkets = mutation({
  args: { markets: v.array(v.any()) },
  handler: async (ctx, { markets }) => {
    // Batch upsert markets
    for (const market of markets) {
      // Check if market exists
      const existing = await ctx.db
        .query("markets")
        .filter(q => 
          q.and(
            q.eq(q.field("platform"), market.platform),
            q.eq(q.field("externalId"), market.external_id)
          )
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          title: market.title,
          description: market.description,
          category: market.category,
          outcomes: market.outcomes,
          volume: market.volume,
          liquidity: market.liquidity,
          isActive: market.is_active,
          updatedAt: market.processed_at,
        });
      } else {
        await ctx.db.insert("markets", {
          platform: market.platform,
          externalId: market.external_id,
          title: market.title,
          description: market.description,
          category: market.category,
          eventType: market.event_type,
          outcomes: market.outcomes,
          volume: market.volume,
          liquidity: market.liquidity,
          endDate: market.end_date,
          isActive: market.is_active,
          createdAt: market.processed_at,
          updatedAt: market.processed_at,
        });
      }
    }

    return { upserted: markets.length };
  },
});

export const upsertSimilarities = mutation({
  args: { similarities: v.array(v.any()) },
  handler: async (ctx, { similarities }) => {
    // Clear old similarities and insert new ones
    // (Later: implement incremental updates)
    
    for (const similarity of similarities) {
      await ctx.db.insert("marketSimilarities", {
        market1Id: similarity.market1_id,
        market2Id: similarity.market2_id,
        platform1: similarity.platform1,
        platform2: similarity.platform2,
        confidence: similarity.confidence,
        reasoning: similarity.reasoning,
        analyzedAt: similarity.analyzed_at,
      });
    }

    return { inserted: similarities.length };
  },
});

export const upsertOpportunities = mutation({
  args: { opportunities: v.array(v.any()) },
  handler: async (ctx, { opportunities }) => {
    // Clear old opportunities and insert new ones
    await ctx.db.delete(
      await ctx.db.query("arbitrageOpportunities")
        .filter(q => q.eq(q.field("status"), "active"))
        .collect()
    );

    for (const opp of opportunities) {
      await ctx.db.insert("arbitrageOpportunities", {
        buyMarketId: opp.buy_market_id,
        sellMarketId: opp.sell_market_id,
        buyPlatform: opp.buy_platform,
        sellPlatform: opp.sell_platform,
        profitMargin: opp.profit_margin,
        confidence: opp.confidence,
        detectedAt: opp.detected_at,
        status: opp.status,
      });
    }

    return { inserted: opportunities.length };
  },
});
```

### **Stage 4: Deployment & Cron Jobs**

```typescript
// vercel.json - Cron job configuration
{
  "crons": [
    {
      "path": "/api/etl-pipeline",
      "schedule": "*/30 * * * *"  // Every 30 minutes
    }
  ],
  "functions": {
    "api/etl-pipeline/route.ts": {
      "maxDuration": 300  // 5 minute timeout
    }
  }
}
```

---

## Enhanced Pipeline with LLM Integration

For production, we can enhance the similarity detection with actual LLM analysis:

```typescript
// api/etl-pipeline/llm-analysis.ts
async function enhancedSimilarityDetection(conn: any) {
  // Get market pairs that need LLM analysis
  const pairs = await conn.query(`
    SELECT market1_id, market2_id, title1, title2, category
    FROM market_pairs 
    WHERE confidence_score >= 0.6  -- Pre-filter with basic similarity
    ORDER BY confidence_score DESC
    LIMIT 100  -- Process top candidates
  `);

  const llmResults = [];
  
  // Batch process with OpenAI
  for (let i = 0; i < pairs.length; i += 10) {
    const batch = pairs.slice(i, i + 10);
    const prompt = `Analyze these prediction market pairs for semantic similarity (0-1 confidence):
    ${batch.map(p => `"${p.title1}" vs "${p.title2}"`).join('\n')}
    Return JSON: [{"pair": 1, "confidence": 0.85, "reasoning": "..."}]`;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });
    
    const results = JSON.parse(response.choices[0].message.content);
    llmResults.push(...results);
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Update similarity scores with LLM results
  for (const result of llmResults) {
    if (result.confidence >= 0.7) {
      await conn.run(`
        UPDATE market_pairs 
        SET confidence_score = $1, reasoning = $2
        WHERE market1_id = $3 AND market2_id = $4
      `, [result.confidence, result.reasoning, pairs[result.pair-1].market1_id, pairs[result.pair-1].market2_id]);
    }
  }
}
```

This architecture gives us:
- ✅ **Powerful data processing** with DuckDB SQL
- ✅ **Minimal Convex bandwidth** (only final results)
- ✅ **Scalable LLM integration** with proper batching
- ✅ **Real-time frontend** with Convex subscriptions
- ✅ **Automated scheduling** with Vercel cron jobs

Would you like me to start implementing this architecture?