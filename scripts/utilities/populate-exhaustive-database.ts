// Exhaustively populate DuckDB with maximum data from both platforms
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import fetch from 'node-fetch';

const DB_PATH = './data/marketfinder.db';

// Rate limiting for Kalshi (10 requests per second max)
const KALSHI_RATE_LIMIT_MS = 100; // 100ms between requests = 10 req/sec
const POLYMARKET_BATCH_SIZE = 100;

// Polymarket has 50,000+ markets! Configure based on needs:
// - Quick test: 20 batches = 2,000 markets (~20s)
// - Comprehensive: 100 batches = 10,000 markets (~90s)
// - Complete: 520 batches = 52,000 markets (~10min)
const MAX_POLYMARKET_BATCHES = parseInt(process.env.POLYMARKET_BATCHES || '100'); // Default to 10K markets
const MAX_KALSHI_PAGES = 50; // Kalshi pagination

interface KalshiMarket {
  ticker: string;
  title: string;
  subtitle?: string;
  close_time: string;
  status: string;
  yes_ask?: number;
  yes_bid?: number;
  no_ask?: number;
  no_bid?: number;
  last_price?: number;
  volume?: number;
  volume_24h?: number;
  open_interest?: number;
  liquidity?: number;
  category?: string;
}

interface PolymarketMarket {
  id: string;
  question: string;
  description?: string;
  category?: string;
  outcomes: string | string[];
  lastTradePrice?: number;
  bestBid?: number;
  bestAsk?: number;
  volumeNum?: number;
  volume?: number;
  liquidityNum?: number;
  liquidity?: number;
  endDateIso?: string;
  endDate?: string;
  startDateIso?: string;
  startDate?: string;
  active?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchKalshiMarketsExhaustive(): Promise<any[]> {
  console.log("📡 Fetching ALL available Kalshi markets with rate limiting...");
  
  const allMarkets: KalshiMarket[] = [];
  let cursor: string | undefined = undefined;
  let pageCount = 0;
  
  // Kalshi uses cursor-based pagination
  while (pageCount < MAX_KALSHI_PAGES) {
    try {
      // Build URL with cursor if available (don't filter by status in API, filter after)
      let url = "https://api.elections.kalshi.com/trade-api/v2/markets?limit=100";
      if (cursor) {
        url += `&cursor=${cursor}`;
      }
      
      console.log(`   Kalshi page ${pageCount + 1}: ${cursor ? 'cursor=' + cursor.substring(0, 10) + '...' : 'initial'}`);
      
      // Rate limiting: wait between requests
      if (pageCount > 0) {
        await sleep(KALSHI_RATE_LIMIT_MS);
      }
      
      const response = await fetch(url, {
        headers: { 
          "Accept": "application/json", 
          "User-Agent": "MarketFinder/1.0" 
        },
      });
      
      if (!response.ok) {
        console.warn(`   ⚠️ Kalshi API error: ${response.status}, stopping pagination`);
        break;
      }
      
      const data = await response.json();
      const markets: KalshiMarket[] = data.markets || [];
      
      console.log(`   ✅ Fetched ${markets.length} markets`);
      
      if (markets.length === 0) {
        console.log("   📝 No more markets available");
        break;
      }
      
      allMarkets.push(...markets);
      
      // Check for next cursor
      cursor = data.cursor;
      if (!cursor) {
        console.log("   📝 Reached end of pagination (no cursor)");
        break;
      }
      
      pageCount++;
      
    } catch (error) {
      console.error(`   ❌ Kalshi page ${pageCount + 1} failed:`, error instanceof Error ? error.message : String(error));
      break;
    }
  }
  
  console.log(`✅ Kalshi: ${allMarkets.length} total markets from ${pageCount} pages`);
  
  // Filter and transform
  const activeMarkets = allMarkets.filter(market => {
    try {
      return market.close_time > new Date().toISOString() &&
             (market.status === "active" || market.status === "initialized") &&
             market.ticker;
    } catch (e) { return false; }
  });
  
  console.log(`✅ Kalshi: ${activeMarkets.length} active markets after filtering`);
  
  return activeMarkets.map(market => {
    const title = market.title || 'Untitled Market';
    
    // Enhanced categorization
    let category = "other";
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes("trump") || lowerTitle.includes("biden") || lowerTitle.includes("election") || 
        lowerTitle.includes("president") || lowerTitle.includes("nomination") || lowerTitle.includes("ambassador") ||
        lowerTitle.includes("congress") || lowerTitle.includes("senate")) {
      category = "politics";
    } else if (lowerTitle.includes("bitcoin") || lowerTitle.includes("crypto") || lowerTitle.includes("ethereum")) {
      category = "crypto";
    } else if (lowerTitle.includes("economy") || lowerTitle.includes("gdp") || lowerTitle.includes("inflation") ||
               lowerTitle.includes("recession") || lowerTitle.includes("fed") || lowerTitle.includes("interest")) {
      category = "economics";
    } else if (lowerTitle.includes("climate") || lowerTitle.includes("temperature") || lowerTitle.includes("weather")) {
      category = "climate";
    } else if (lowerTitle.includes("sports") || lowerTitle.includes("nfl") || lowerTitle.includes("nba") ||
               lowerTitle.includes("championship") || lowerTitle.includes("world cup") || lowerTitle.includes("olympics")) {
      category = "sports";
    } else if (lowerTitle.includes("tech") || lowerTitle.includes("ai") || lowerTitle.includes("apple") ||
               lowerTitle.includes("google") || lowerTitle.includes("tesla")) {
      category = "technology";
    }
    
    return {
      platform: 'kalshi',
      external_id: market.ticker,
      title,
      description: market.subtitle || title,
      category,
      yes_price: calculateKalshiPrice(market, 'yes'),
      no_price: calculateKalshiPrice(market, 'no'),
      // Kalshi API doesn't provide volume data - use liquidity as proxy for market activity
      volume: parseFloat(String(market.liquidity || 0)) / 1000, // Scale liquidity to volume-like range
      liquidity: parseFloat(String(market.liquidity || market.open_interest || 0)),
      end_date: market.close_time,
      is_active: true,
      start_date: null,
      raw_data: JSON.stringify(market)
    };
  });
}

async function fetchPolymarketMarketsExhaustive(): Promise<any[]> {
  console.log(`📡 Fetching ALL available Polymarket markets (up to ${MAX_POLYMARKET_BATCHES * POLYMARKET_BATCH_SIZE})...`);
  
  const allMarkets: PolymarketMarket[] = [];
  let offset = 0;
  let hasMoreData = true;
  let batchCount = 0;
  
  while (hasMoreData && batchCount < MAX_POLYMARKET_BATCHES) {
    try {
      const url = `https://gamma-api.polymarket.com/markets?active=true&archived=false&limit=${POLYMARKET_BATCH_SIZE}&offset=${offset}&order=startDate&ascending=false`;
      
      console.log(`   Polymarket batch ${batchCount + 1}: offset=${offset}`);
      
      const response = await fetch(url, {
        headers: { "Accept": "application/json", "User-Agent": "MarketFinder/1.0" },
      });
      
      if (!response.ok) {
        console.warn(`   ⚠️ Polymarket API error: ${response.status}, stopping pagination`);
        break;
      }
      
      const data = await response.json();
      const markets: PolymarketMarket[] = Array.isArray(data) ? data : data.markets || [];
      
      console.log(`   ✅ Fetched ${markets.length} markets`);
      
      if (markets.length === 0) {
        console.log("   📝 No more markets available");
        hasMoreData = false;
      } else {
        allMarkets.push(...markets);
        
        if (markets.length < POLYMARKET_BATCH_SIZE) {
          console.log("   📝 Reached end (partial batch)");
          hasMoreData = false;
        } else {
          offset += POLYMARKET_BATCH_SIZE;
          batchCount++;
        }
      }
      
    } catch (error) {
      console.error(`   ❌ Polymarket batch ${batchCount + 1} failed:`, error instanceof Error ? error.message : String(error));
      break;
    }
  }
  
  console.log(`✅ Polymarket: ${allMarkets.length} total markets from ${batchCount + 1} batches`);
  
  // Filter and transform
  const validMarkets = allMarkets.filter(market => {
    const hasId = !!market.id;
    const hasQuestion = !!market.question;
    let hasValidOutcomes = false;
    
    if (typeof market.outcomes === 'string') {
      try {
        const parsed = JSON.parse(market.outcomes);
        hasValidOutcomes = Array.isArray(parsed) && parsed.length >= 2;
      } catch (e) {
        hasValidOutcomes = false;
      }
    } else if (Array.isArray(market.outcomes)) {
      hasValidOutcomes = market.outcomes.length >= 2;
    }
    
    return hasId && hasQuestion && hasValidOutcomes;
  });
  
  console.log(`✅ Polymarket: ${validMarkets.length} valid markets after filtering`);
  
  return validMarkets.map(market => {
    let yesPrice = 0.5, noPrice = 0.5;
    
    if (market.lastTradePrice !== undefined && market.lastTradePrice !== null) {
      yesPrice = parseFloat(String(market.lastTradePrice)) || 0.5;
      noPrice = 1 - yesPrice;
    } else if (market.bestBid !== undefined && market.bestAsk !== undefined) {
      const bid = parseFloat(String(market.bestBid)) || 0;
      const ask = parseFloat(String(market.bestAsk)) || 1;
      yesPrice = (bid + ask) / 2;
      noPrice = 1 - yesPrice;
    }
    
    // Parse outcomes for binary market validation
    let parsedOutcomes: string[] = [];
    if (typeof market.outcomes === 'string') {
      try {
        parsedOutcomes = JSON.parse(market.outcomes);
      } catch (e) {
        return null;
      }
    } else if (Array.isArray(market.outcomes)) {
      parsedOutcomes = market.outcomes;
    }
    
    const hasYesNo = parsedOutcomes.some(o => 
      o && typeof o === 'string' && (o.toLowerCase().includes('yes') || o.toLowerCase().includes('no'))
    );
    
    if (!hasYesNo && parsedOutcomes.length > 4) {
      return null; // Skip multi-outcome markets
    }
    
    return {
      platform: 'polymarket',
      external_id: market.id,
      title: market.question,
      description: market.description || market.question,
      category: market.category?.toLowerCase() || 'other',
      yes_price: yesPrice,
      no_price: noPrice,
      volume: parseFloat(String(market.volumeNum || market.volume || 0)),
      liquidity: parseFloat(String(market.liquidityNum || market.liquidity || 0)),
      end_date: market.endDateIso || market.endDate,
      is_active: market.active && !market.archived,
      start_date: market.startDateIso || market.startDate,
      raw_data: JSON.stringify(market)
    };
  }).filter(market => market !== null);
}

// Helper function to calculate representative price for Kalshi markets
function calculateKalshiPrice(market: KalshiMarket, outcome: 'yes' | 'no'): number {
  const bidField = outcome === 'yes' ? 'yes_bid' : 'no_bid';
  const askField = outcome === 'yes' ? 'yes_ask' : 'no_ask';
  
  const bid = parseFloat(String((market as any)[bidField] || 0));
  const ask = parseFloat(String((market as any)[askField] || 0));
  const lastPrice = parseFloat(String(market.last_price || 0));
  
  // Use bid-ask midpoint if both are available and reasonable
  if (bid > 0 && ask > 0 && ask > bid) {
    return (bid + ask) / 2;
  }
  
  // Fallback to last trade price if available
  if (lastPrice > 0) {
    return outcome === 'yes' ? lastPrice : (1 - lastPrice);
  }
  
  // Use ask price if available (more conservative than bid)
  if (ask > 0) {
    return ask;
  }
  
  // Use bid price if available
  if (bid > 0) {
    return bid;
  }
  
  // Default fallback
  return 0.5;
}

async function populateExhaustiveDatabase(): Promise<void> {
  const runId = `exhaustive-${Date.now()}`;
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  try {
    console.log("🦆 Exhaustive Database Population Started");
    console.log("=".repeat(60));
    console.log(`Run ID: ${runId}`);
    console.log(`Target: ~${MAX_POLYMARKET_BATCHES * POLYMARKET_BATCH_SIZE} Polymarket + ~${MAX_KALSHI_PAGES * 100} Kalshi markets`);
    console.log(`📊 Polymarket batches: ${MAX_POLYMARKET_BATCHES} (set POLYMARKET_BATCHES env var to change)`);
    console.log(`🔍 Note: Polymarket has 50,000+ total markets available\n`);
    
    // Connect to database
    instance = await DuckDBInstance.create(DB_PATH);
    connection = await instance.connect();
    
    // Clear existing data
    console.log("🧹 Clearing existing market data...");
    await connection.run("DELETE FROM raw_markets");
    
    // Start tracking this run
    await connection.run(`
      INSERT INTO fetch_runs (run_id, platform, total_markets, batches_processed, max_offset)
      VALUES ('${runId}', 'exhaustive', 0, 0, 0)
    `);
    
    // Fetch data from both platforms in parallel
    console.log("🚀 Starting parallel data fetching...\n");
    const startTime = Date.now();
    
    const [kalshiData, polymarketData] = await Promise.all([
      fetchKalshiMarketsExhaustive().catch(err => {
        console.error("⚠️  Kalshi exhaustive fetch failed:", err.message);
        return [];
      }),
      fetchPolymarketMarketsExhaustive().catch(err => {
        console.error("⚠️  Polymarket exhaustive fetch failed:", err.message);
        return [];
      })
    ]);
    
    const fetchTime = Date.now() - startTime;
    console.log(`\n⏱️  Total fetch time: ${(fetchTime / 1000).toFixed(1)}s`);
    
    let totalInserted = 0;
    
    // Insert Kalshi data
    console.log("\n💾 Storing Kalshi markets...");
    for (const [index, market] of kalshiData.entries()) {
      const marketId = `kalshi-${market.external_id}`;
      const title = market.title.replace(/'/g, "''");
      const description = market.description.replace(/'/g, "''");
      const category = market.category.replace(/'/g, "''");
      const endDate = market.end_date ? `'${market.end_date}'` : 'NULL';
      const startDate = market.start_date ? `'${market.start_date}'` : 'NULL';
      const rawData = market.raw_data.replace(/'/g, "''");
      
      await connection.run(`
        INSERT OR IGNORE INTO raw_markets (
          id, platform, external_id, title, description, category,
          yes_price, no_price, volume, liquidity, end_date, is_active,
          start_date, raw_data
        ) VALUES (
          '${marketId}', 'kalshi', '${market.external_id}', '${title}', 
          '${description}', '${category}', ${market.yes_price}, ${market.no_price}, 
          ${market.volume}, ${market.liquidity}, ${endDate}, ${market.is_active}, 
          ${startDate}, '${rawData}'
        )
      `);
      totalInserted++;
      
      if ((index + 1) % 25 === 0) {
        console.log(`   Progress: ${index + 1}/${kalshiData.length} Kalshi markets`);
      }
    }
    
    // Insert Polymarket data
    console.log("💾 Storing Polymarket markets...");
    for (const [index, market] of polymarketData.entries()) {
      const marketId = `polymarket-${market.external_id}`;
      const title = market.title.replace(/'/g, "''");
      const description = market.description.replace(/'/g, "''");
      const category = market.category.replace(/'/g, "''");
      const endDate = market.end_date ? `'${market.end_date}'` : 'NULL';
      const startDate = market.start_date ? `'${market.start_date}'` : 'NULL';
      const rawData = market.raw_data.replace(/'/g, "''");
      
      await connection.run(`
        INSERT OR IGNORE INTO raw_markets (
          id, platform, external_id, title, description, category,
          yes_price, no_price, volume, liquidity, end_date, is_active,
          start_date, raw_data
        ) VALUES (
          '${marketId}', 'polymarket', '${market.external_id}', '${title}', 
          '${description}', '${category}', ${market.yes_price}, ${market.no_price}, 
          ${market.volume}, ${market.liquidity}, ${endDate}, ${market.is_active}, 
          ${startDate}, '${rawData}'
        )
      `);
      totalInserted++;
      
      if ((index + 1) % 100 === 0) {
        console.log(`   Progress: ${index + 1}/${polymarketData.length} Polymarket markets`);
      }
    }
    
    // Update run stats
    await connection.run(`
      UPDATE fetch_runs 
      SET total_markets = ${totalInserted}, 
          batches_processed = ${Math.ceil(polymarketData.length / 100) + Math.ceil(kalshiData.length / 100)},
          completed_at = CURRENT_TIMESTAMP, 
          status = 'completed'
      WHERE run_id = '${runId}'
    `);
    
    // Generate comprehensive summary
    const totalTime = Date.now() - startTime;
    console.log("\n📊 EXHAUSTIVE POPULATION COMPLETE!");
    console.log("=".repeat(60));
    console.log(`✅ Kalshi markets: ${kalshiData.length}`);
    console.log(`✅ Polymarket markets: ${polymarketData.length}`);
    console.log(`✅ Total markets: ${totalInserted}`);
    console.log(`⏱️  Total time: ${(totalTime / 1000).toFixed(1)}s`);
    console.log(`📈 Rate: ${(totalInserted / (totalTime / 1000)).toFixed(1)} markets/sec`);
    
    // Verify data in database with detailed breakdown
    const verifyResult = await connection.run(`
      SELECT 
        platform, 
        COUNT(*) as count,
        COUNT(DISTINCT category) as categories,
        AVG(volume) as avg_volume,
        SUM(CASE WHEN (platform = 'polymarket' AND volume > 1000) OR (platform = 'kalshi' AND volume > 100) THEN 1 ELSE 0 END) as high_volume_count
      FROM raw_markets 
      GROUP BY platform
    `);
    const verifyData = await verifyResult.getRows();
    
    console.log("\n🔍 Database Verification:");
    verifyData.forEach(row => {
      // DuckDB returns rows as arrays: [platform, count, categories, avg_volume, high_volume_count]
      const [platform, count, categories, avg_volume, high_volume_count] = row;
      console.log(`   ${platform}:`);
      console.log(`     📊 Markets: ${Number(count)}`);
      console.log(`     🏷️  Categories: ${Number(categories)}`);
      console.log(`     💰 Avg Volume: $${Number(avg_volume).toFixed(2)}`);
      console.log(`     🔥 High Volume (>$1K): ${Number(high_volume_count)}`);
    });
    
    // Category breakdown
    const categoryResult = await connection.run(`
      SELECT category, COUNT(*) as count 
      FROM raw_markets 
      GROUP BY category 
      ORDER BY count DESC
    `);
    const categoryData = await categoryResult.getRows();
    
    console.log("\n📈 Category Distribution:");
    categoryData.forEach(row => {
      // DuckDB returns rows as arrays: [category, count]
      const [category, count] = row;
      console.log(`   ${category}: ${Number(count)} markets`);
    });
    
    console.log(`\n🎉 Exhaustive population completed! Run ID: ${runId}`);
    console.log("📋 DBeaver now shows comprehensive data from both platforms");
    console.log(`🚀 Ready for arbitrage detection across ${totalInserted} markets!`);
    
  } catch (error) {
    console.error("❌ Exhaustive population failed:", error instanceof Error ? error.message : String(error));
    
    // Mark run as failed
    try {
      if (connection) {
        const errorMsg = (error instanceof Error ? error.message : String(error)).replace(/'/g, "''");
        await connection.run(`
          UPDATE fetch_runs 
          SET completed_at = CURRENT_TIMESTAMP, status = 'failed', error_message = '${errorMsg}'
          WHERE run_id = '${runId}'
        `);
      }
    } catch (e) {
      console.error("Failed to update run status:", e instanceof Error ? e.message : String(e));
    }
  } finally {
    // Resources auto-cleanup
  }
}

populateExhaustiveDatabase();