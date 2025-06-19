// Populate DuckDB with data from both Kalshi and Polymarket platforms
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import fetch from 'node-fetch';

const DB_PATH = './data/marketfinder.db';

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

async function fetchKalshiMarkets(): Promise<any[]> {
  console.log("📡 Fetching Kalshi markets...");
  
  const response = await fetch("https://api.elections.kalshi.com/trade-api/v2/markets", {
    headers: { "Accept": "application/json", "User-Agent": "MarketFinder/1.0" },
  });
  
  if (!response.ok) throw new Error(`Kalshi API error: ${response.status}`);
  
  const data = await response.json();
  const allMarkets: KalshiMarket[] = data.markets || data || [];
  
  const activeMarkets = allMarkets.filter(market => {
    try {
      return market.close_time > new Date().toISOString() &&
             (market.status === "active" || market.status === "initialized") &&
             market.ticker;
    } catch (e) { return false; }
  });
  
  console.log(`✅ Kalshi: ${activeMarkets.length} active markets`);
  
  return activeMarkets.map(market => {
    const title = market.title || 'Untitled Market';
    
    // Categorize from title since API doesn't provide category
    let category = "other";
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes("trump") || lowerTitle.includes("biden") || lowerTitle.includes("nomination") || lowerTitle.includes("ambassador")) {
      category = "politics";
    } else if (lowerTitle.includes("bitcoin") || lowerTitle.includes("crypto")) {
      category = "crypto";
    } else if (lowerTitle.includes("economy") || lowerTitle.includes("gdp")) {
      category = "economics";
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
      start_date: null, // Kalshi doesn't provide start date
      raw_data: JSON.stringify(market)
    };
  });
}

async function fetchPolymarketMarkets(maxMarkets: number = 300): Promise<any[]> {
  console.log(`📡 Fetching Polymarket markets (max ${maxMarkets})...`);
  
  const allMarkets: PolymarketMarket[] = [];
  let offset = 0;
  const limit = 100;
  let hasMoreData = true;
  const maxBatches = Math.ceil(maxMarkets / limit);
  let batchCount = 0;
  
  while (hasMoreData && batchCount < maxBatches) {
    const url = `https://gamma-api.polymarket.com/markets?active=true&archived=false&limit=${limit}&offset=${offset}&order=startDate&ascending=false`;
    
    const response = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "MarketFinder/1.0" },
    });
    
    if (!response.ok) throw new Error(`Polymarket API error: ${response.status}`);
    
    const data = await response.json();
    const markets: PolymarketMarket[] = Array.isArray(data) ? data : data.markets || [];
    
    console.log(`   Batch ${batchCount + 1}: fetched ${markets.length} markets`);
    
    if (markets.length === 0) {
      hasMoreData = false;
    } else {
      allMarkets.push(...markets);
      
      if (markets.length < limit) {
        hasMoreData = false;
      } else {
        offset += limit;
        batchCount++;
      }
    }
  }
  
  console.log(`✅ Polymarket: ${allMarkets.length} total markets across ${batchCount + 1} batches`);
  
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

async function populateFullDatabase(): Promise<void> {
  const runId = `full-populate-${Date.now()}`;
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  try {
    console.log("🦆 Populating DuckDB with data from both platforms...");
    console.log(`Run ID: ${runId}\n`);
    
    // Connect to database
    instance = await DuckDBInstance.create(DB_PATH);
    connection = await instance.connect();
    
    // Clear existing data
    console.log("🧹 Clearing existing market data...");
    await connection.run("DELETE FROM raw_markets");
    
    // Start tracking this run
    await connection.run(`
      INSERT INTO fetch_runs (run_id, platform, total_markets, batches_processed, max_offset)
      VALUES ('${runId}', 'both', 0, 0, 0)
    `);
    
    // Fetch data from both platforms
    const [kalshiData, polymarketData] = await Promise.all([
      fetchKalshiMarkets().catch(err => {
        console.error("⚠️  Kalshi fetch failed:", err.message);
        return [];
      }),
      fetchPolymarketMarkets().catch(err => {
        console.error("⚠️  Polymarket fetch failed:", err.message);
        return [];
      })
    ]);
    
    let totalInserted = 0;
    
    // Insert Kalshi data
    console.log("\n💾 Storing Kalshi markets...");
    for (const market of kalshiData) {
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
    }
    
    // Insert Polymarket data
    console.log("💾 Storing Polymarket markets...");
    for (const market of polymarketData) {
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
    }
    
    // Update run stats
    await connection.run(`
      UPDATE fetch_runs 
      SET total_markets = ${totalInserted}, 
          batches_processed = ${Math.ceil(polymarketData.length / 100) + 1},
          completed_at = CURRENT_TIMESTAMP, 
          status = 'completed'
      WHERE run_id = '${runId}'
    `);
    
    // Generate summary
    console.log("\n📊 Population Summary:");
    console.log("=".repeat(50));
    console.log(`✅ Kalshi markets: ${kalshiData.length}`);
    console.log(`✅ Polymarket markets: ${polymarketData.length}`);
    console.log(`✅ Total markets: ${totalInserted}`);
    
    // Verify data in database
    const verifyResult = await connection.run(`
      SELECT platform, COUNT(*) as count 
      FROM raw_markets 
      GROUP BY platform
    `);
    const verifyData = await verifyResult.getRows();
    
    console.log("\n🔍 Database Verification:");
    verifyData.forEach(row => {
      console.log(`   ${row.platform}: ${Number(row.count)} markets`);
    });
    
    console.log(`\n🎉 Database population completed! Run ID: ${runId}`);
    console.log("📋 You can now view both platforms in DBeaver");
    
  } catch (error) {
    console.error("❌ Population failed:", error instanceof Error ? error.message : String(error));
    
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

populateFullDatabase();