// Test improved Kalshi data collection using Events → Markets approach
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import fetch from 'node-fetch';

const DB_PATH = './data/improved-kalshi-test.db';

interface KalshiEvent {
  event_ticker: string;
  title: string;
  category: string;
  series_ticker: string;
}

interface KalshiMarket {
  ticker: string;
  title: string;
  status: string;
  volume: number;
  liquidity: number;
  open_interest: number;
  yes_bid: number;
  yes_ask: number;
  last_price: number;
  close_time: string;
  event_ticker: string;
}

async function testImprovedKalshiCollection(): Promise<void> {
  console.log("🚀 IMPROVED KALSHI DATA COLLECTION TEST");
  console.log("=" .repeat(60));
  console.log("Strategy: Events → Markets (proper API structure)");
  
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  try {
    // Setup database
    instance = await DuckDBInstance.create(DB_PATH);
    connection = await instance.connect();
    
    await connection.run(`
      CREATE TABLE IF NOT EXISTS kalshi_events (
        event_ticker VARCHAR PRIMARY KEY,
        title VARCHAR,
        category VARCHAR,
        series_ticker VARCHAR,
        markets_count INTEGER DEFAULT 0
      )
    `);
    
    await connection.run(`
      CREATE TABLE IF NOT EXISTS kalshi_markets (
        ticker VARCHAR PRIMARY KEY,
        event_ticker VARCHAR,
        title VARCHAR,
        status VARCHAR,
        volume DOUBLE,
        liquidity DOUBLE,
        open_interest INTEGER,
        yes_bid DOUBLE,
        yes_ask DOUBLE,
        last_price DOUBLE,
        close_time TIMESTAMP,
        category VARCHAR,
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log("✅ Database initialized");
    
    // Step 1: Fetch ALL events
    console.log("\n📡 Step 1: Fetching ALL Kalshi Events...");
    const events = await fetchAllKalshiEvents();
    console.log(`✅ Found ${events.length} total events`);
    
    // Store events
    for (const event of events) {
      await connection.run(`
        INSERT OR IGNORE INTO kalshi_events (event_ticker, title, category, series_ticker)
        VALUES ('${event.event_ticker}', '${event.title.replace(/'/g, "''")}', 
                '${event.category}', '${event.series_ticker}')
      `);
    }
    
    // Step 2: Fetch markets for each event (sample first 50 events for testing)
    console.log("\n🎯 Step 2: Fetching Markets for Events...");
    
    let totalMarkets = 0;
    let activeMarkets = 0;
    let highVolumeMarkets = 0;
    const sampleSize = 50; // Test with first 50 events
    
    for (let i = 0; i < Math.min(events.length, sampleSize); i++) {
      const event = events[i];
      
      try {
        console.log(`   ${i+1}/${Math.min(events.length, sampleSize)}: ${event.title.substring(0, 40)}...`);
        
        const markets = await fetchMarketsForEvent(event.event_ticker);
        totalMarkets += markets.length;
        
        let eventActiveCount = 0;
        let eventHighVolumeCount = 0;
        
        for (const market of markets) {
          // Store market
          await connection.run(`
            INSERT OR IGNORE INTO kalshi_markets (
              ticker, event_ticker, title, status, volume, liquidity, 
              open_interest, yes_bid, yes_ask, last_price, close_time, category
            ) VALUES (
              '${market.ticker}', '${market.event_ticker}', 
              '${market.title.replace(/'/g, "''")}', '${market.status}',
              ${market.volume}, ${market.liquidity}, ${market.open_interest},
              ${market.yes_bid}, ${market.yes_ask}, ${market.last_price},
              '${market.close_time}', '${event.category}'
            )
          `);
          
          // Count active markets
          if (market.volume > 0 || market.liquidity > 1000 || market.open_interest > 0) {
            activeMarkets++;
            eventActiveCount++;
          }
          
          if (market.volume > 100) {
            highVolumeMarkets++;
            eventHighVolumeCount++;
          }
        }
        
        // Update event with market count
        await connection.run(`
          UPDATE kalshi_events 
          SET markets_count = ${markets.length}
          WHERE event_ticker = '${event.event_ticker}'
        `);
        
        console.log(`     📊 ${markets.length} markets (${eventActiveCount} active, ${eventHighVolumeCount} high-volume)`);
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error) {
        console.log(`     ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    console.log(`\n📊 COLLECTION RESULTS:`);
    console.log(`  📈 Total Events: ${events.length.toLocaleString()}`);
    console.log(`  🎯 Events Processed: ${Math.min(events.length, sampleSize)}`);
    console.log(`  📊 Total Markets: ${totalMarkets.toLocaleString()}`);
    console.log(`  🔥 Active Markets: ${activeMarkets.toLocaleString()}`);
    console.log(`  💰 High Volume Markets: ${highVolumeMarkets.toLocaleString()}`);
    
    // Step 3: Analyze the improved data
    await analyzeImprovedData(connection);
    
  } catch (error) {
    console.error("❌ Test failed:", error instanceof Error ? error.message : String(error));
  } finally {
    console.log(`\n🧹 Test database created at: ${DB_PATH}`);
  }
}

async function fetchAllKalshiEvents(): Promise<KalshiEvent[]> {
  const events: KalshiEvent[] = [];
  let cursor: string | undefined = undefined;
  let pageCount = 0;
  const maxPages = 50; // Safety limit
  
  while (pageCount < maxPages) {
    try {
      let url = "https://api.elections.kalshi.com/trade-api/v2/events?limit=200";
      if (cursor) {
        url += `&cursor=${cursor}`;
      }
      
      const response = await fetch(url);
      if (!response.ok) {
        console.log(`   ⚠️ Events page ${pageCount + 1}: ${response.status}`);
        break;
      }
      
      const data = await response.json();
      const pageEvents = data.events || [];
      
      events.push(...pageEvents);
      console.log(`   📄 Page ${pageCount + 1}: ${pageEvents.length} events (Total: ${events.length})`);
      
      if (!data.cursor || pageEvents.length === 0) {
        console.log(`   📝 All events fetched`);
        break;
      }
      
      cursor = data.cursor;
      pageCount++;
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.log(`   ❌ Events page ${pageCount + 1}: ${error instanceof Error ? error.message : String(error)}`);
      break;
    }
  }
  
  return events;
}

async function fetchMarketsForEvent(eventTicker: string): Promise<KalshiMarket[]> {
  try {
    const response = await fetch(`https://api.elections.kalshi.com/trade-api/v2/markets?event_ticker=${eventTicker}&limit=1000`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    const markets = data.markets || [];
    
    return markets.map((market: any) => ({
      ticker: market.ticker,
      event_ticker: eventTicker,
      title: market.title,
      status: market.status,
      volume: parseFloat(String(market.volume || 0)),
      liquidity: parseFloat(String(market.liquidity || 0)),
      open_interest: parseInt(String(market.open_interest || 0)),
      yes_bid: parseFloat(String(market.yes_bid || 0)),
      yes_ask: parseFloat(String(market.yes_ask || 0)),
      last_price: parseFloat(String(market.last_price || 0)),
      close_time: market.close_time
    }));
    
  } catch (error) {
    throw new Error(`Failed to fetch markets for event ${eventTicker}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function analyzeImprovedData(connection: DuckDBConnection): Promise<void> {
  console.log("\n📈 IMPROVED DATA ANALYSIS:");
  
  // Overall statistics
  const overallResult = await connection.run(`
    SELECT 
      COUNT(*) as total_markets,
      COUNT(CASE WHEN volume > 0 THEN 1 END) as with_volume,
      COUNT(CASE WHEN liquidity > 1000 THEN 1 END) as with_good_liquidity,
      COUNT(CASE WHEN open_interest > 0 THEN 1 END) as with_open_interest,
      AVG(volume) as avg_volume,
      AVG(CASE WHEN volume > 0 THEN volume END) as avg_active_volume,
      MAX(volume) as max_volume,
      MAX(liquidity) as max_liquidity
    FROM kalshi_markets
  `);
  const overall = await overallResult.getRows();
  
  const [total, with_vol, with_liq, with_oi, avg_vol, avg_active_vol, max_vol, max_liq] = overall[0];
  
  console.log(`\n  📊 Market Statistics:`);
  console.log(`    Total Markets: ${Number(total).toLocaleString()}`);
  console.log(`    With Volume > 0: ${Number(with_vol).toLocaleString()} (${(Number(with_vol)/Number(total)*100).toFixed(1)}%)`);
  console.log(`    With Liquidity > $1K: ${Number(with_liq).toLocaleString()} (${(Number(with_liq)/Number(total)*100).toFixed(1)}%)`);
  console.log(`    With Open Interest: ${Number(with_oi).toLocaleString()} (${(Number(with_oi)/Number(total)*100).toFixed(1)}%)`);
  console.log(`    Average Volume (all): $${Number(avg_vol).toFixed(2)}`);
  console.log(`    Average Volume (active): $${Number(avg_active_vol).toFixed(2)}`);
  console.log(`    Max Volume: $${Number(max_vol).toLocaleString()}`);
  console.log(`    Max Liquidity: $${Number(max_liq).toLocaleString()}`);
  
  // Category analysis
  const categoryResult = await connection.run(`
    SELECT 
      category,
      COUNT(*) as market_count,
      COUNT(CASE WHEN volume > 0 THEN 1 END) as active_count,
      AVG(CASE WHEN volume > 0 THEN volume END) as avg_active_volume
    FROM kalshi_markets
    GROUP BY category
    ORDER BY market_count DESC
    LIMIT 10
  `);
  const categories = await categoryResult.getRows();
  
  console.log(`\n  🏷️ Top Categories:`);
  categories.forEach(row => {
    const [category, count, active, avg_vol] = row;
    console.log(`    ${category}: ${Number(count).toLocaleString()} markets (${Number(active)} active, avg $${Number(avg_vol).toFixed(2)})`);
  });
  
  // Top volume markets
  const topResult = await connection.run(`
    SELECT title, volume, liquidity, category
    FROM kalshi_markets
    WHERE volume > 0
    ORDER BY volume DESC
    LIMIT 5
  `);
  const topMarkets = await topResult.getRows();
  
  console.log(`\n  🔥 Top Volume Markets:`);
  topMarkets.forEach((row, i) => {
    const [title, volume, liquidity, category] = row;
    console.log(`    ${i+1}. ${String(title).substring(0, 50)}... ($${Number(volume).toFixed(2)}, ${category})`);
  });
  
  // Comparison with old method
  console.log(`\n💡 IMPROVEMENT ANALYSIS:`);
  
  const activeCount = Number(with_vol);
  const avgActiveVolume = Number(avg_active_vol);
  
  if (activeCount > 77) {
    console.log(`✅ MAJOR IMPROVEMENT: ${activeCount} active markets vs 77 before (${((activeCount-77)/77*100).toFixed(0)}% increase)`);
  }
  
  if (avgActiveVolume > 280) {
    console.log(`✅ VOLUME IMPROVED: $${avgActiveVolume.toFixed(2)} avg vs $280 before (${((avgActiveVolume-280)/280*100).toFixed(0)}% increase)`);
  }
  
  console.log(`\n🚀 PRODUCTION READINESS:`);
  if (activeCount > 200 && avgActiveVolume > 200) {
    console.log(`✅ EXCELLENT: Ready for production with ${activeCount} active markets!`);
    console.log(`🎯 Estimated full collection: ${Math.round(Number(total) * 20)} total markets from all events`);
  } else {
    console.log(`⚠️ GOOD START: Continue with full event collection for production`);
  }
}

testImprovedKalshiCollection();