// Efficient Kalshi market collection - processes reasonable sample first
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import fetch from 'node-fetch';

const DB_PATH = './data/kalshi-markets-efficient.db';

interface CollectionConfig {
  maxEvents: number;
  batchSize: number;
  rateLimit: number; // ms between requests
}

// Configuration: Start with reasonable sample, can scale up
const config: CollectionConfig = {
  maxEvents: 1000, // Process first 1000 events (manageable in ~10 minutes)
  batchSize: 25,   // Smaller batches for better progress tracking
  rateLimit: 50    // 50ms between requests = 20 req/sec
};

async function fetchKalshiMarketsEfficient(): Promise<void> {
  console.log("🎯 EFFICIENT KALSHI MARKET COLLECTION");
  console.log("=" .repeat(60));
  console.log(`Target: ${config.maxEvents.toLocaleString()} events (expandable to full dataset)`);
  
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  const stats = {
    totalEvents: 0,
    processedEvents: 0,
    totalMarkets: 0,
    activeMarkets: 0,
    highVolumeMarkets: 0,
    maxVolume: 0,
    errors: 0
  };
  
  try {
    instance = await DuckDBInstance.create(DB_PATH);
    connection = await instance.connect();
    
    await setupEfficientDatabase(connection);
    console.log("✅ Database initialized");
    
    const startTime = Date.now();
    
    // Step 1: Fetch events (limited sample)
    console.log(`\n📡 Fetching ${config.maxEvents.toLocaleString()} Kalshi Events...`);
    const events = await fetchLimitedEvents(config.maxEvents);
    stats.totalEvents = events.length;
    console.log(`✅ Found ${events.length.toLocaleString()} events`);
    
    // Step 2: Process events in efficient batches
    console.log("\n🎯 Processing Events for Markets...");
    const totalBatches = Math.ceil(events.length / config.batchSize);
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIdx = batchIndex * config.batchSize;
      const endIdx = Math.min(startIdx + config.batchSize, events.length);
      const batch = events.slice(startIdx, endIdx);
      
      console.log(`\n📦 Batch ${batchIndex + 1}/${totalBatches} (${batch.length} events):`);
      
      await processEfficientBatch(connection, batch, stats);
      
      // Progress tracking
      const progress = ((batchIndex + 1) / totalBatches * 100).toFixed(1);
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = stats.processedEvents / elapsed;
      const eta = Math.round((events.length - stats.processedEvents) / rate);
      
      console.log(`   📊 Progress: ${progress}% | Rate: ${rate.toFixed(1)} events/sec | ETA: ${eta}s`);
      console.log(`   📈 Totals: ${stats.totalMarkets.toLocaleString()} markets, ${stats.activeMarkets.toLocaleString()} active`);
      
      // Rate limiting
      if (batchIndex < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    const totalTime = (Date.now() - startTime) / 1000;
    
    // Step 3: Generate comprehensive report
    await generateEfficientReport(connection, stats, totalTime);
    
  } catch (error) {
    console.error("❌ Collection failed:", error instanceof Error ? error.message : String(error));
  } finally {
    console.log(`\n🧹 Database saved: ${DB_PATH}`);
  }
}

async function setupEfficientDatabase(connection: DuckDBConnection): Promise<void> {
  await connection.run(`
    CREATE TABLE IF NOT EXISTS kalshi_events (
      event_ticker VARCHAR PRIMARY KEY,
      title VARCHAR,
      category VARCHAR,
      markets_count INTEGER DEFAULT 0,
      active_markets INTEGER DEFAULT 0,
      total_volume DOUBLE DEFAULT 0
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
      yes_price DOUBLE,
      no_price DOUBLE,
      category VARCHAR,
      is_active BOOLEAN,
      close_time TIMESTAMP
    )
  `);
}

async function fetchLimitedEvents(maxEvents: number): Promise<any[]> {
  const events: any[] = [];
  let cursor: string | undefined = undefined;
  let pageCount = 0;
  
  while (events.length < maxEvents) {
    try {
      let url = "https://api.elections.kalshi.com/trade-api/v2/events?limit=200";
      if (cursor) {
        url += `&cursor=${cursor}`;
      }
      
      const response = await fetch(url);
      if (!response.ok) break;
      
      const data = await response.json();
      const pageEvents = data.events || [];
      
      // Add events up to our limit
      const remainingSlots = maxEvents - events.length;
      events.push(...pageEvents.slice(0, remainingSlots));
      
      console.log(`   📄 Page ${++pageCount}: +${Math.min(pageEvents.length, remainingSlots)} events (Total: ${events.length.toLocaleString()})`);
      
      if (!data.cursor || pageEvents.length === 0 || events.length >= maxEvents) {
        break;
      }
      
      cursor = data.cursor;
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.log(`   ❌ Page ${pageCount + 1}: ${error instanceof Error ? error.message : String(error)}`);
      break;
    }
  }
  
  return events;
}

async function processEfficientBatch(connection: DuckDBConnection, events: any[], stats: any): Promise<void> {
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    
    try {
      const markets = await fetchMarketsForEvent(event.event_ticker);
      stats.processedEvents++;
      stats.totalMarkets += markets.length;
      
      let activeCount = 0;
      let highVolumeCount = 0;
      let totalVolume = 0;
      
      for (const market of markets) {
        const isActive = isMarketActive(market);
        const volume = parseFloat(String(market.volume || 0));
        
        if (isActive) {
          stats.activeMarkets++;
          activeCount++;
        }
        
        if (volume > 100) {
          stats.highVolumeMarkets++;
          highVolumeCount++;
        }
        
        totalVolume += volume;
        
        if (volume > stats.maxVolume) {
          stats.maxVolume = volume;
        }
        
        // Calculate prices
        const yesPrice = calculatePrice(market.yes_bid, market.yes_ask, market.last_price, 'yes');
        const noPrice = calculatePrice(market.no_bid, market.no_ask, market.last_price, 'no');
        
        // Store market
        await connection.run(`
          INSERT OR IGNORE INTO kalshi_markets (
            ticker, event_ticker, title, status, volume, liquidity, 
            open_interest, yes_price, no_price, category, is_active, close_time
          ) VALUES (
            '${market.ticker}', '${event.event_ticker}', 
            '${market.title.replace(/'/g, "''")}', '${market.status}',
            ${volume}, ${parseFloat(String(market.liquidity || 0))}, 
            ${parseInt(String(market.open_interest || 0))},
            ${yesPrice}, ${noPrice}, '${event.category}', ${isActive}, '${market.close_time}'
          )
        `);
      }
      
      // Store event summary
      await connection.run(`
        INSERT OR IGNORE INTO kalshi_events (
          event_ticker, title, category, markets_count, active_markets, total_volume
        ) VALUES (
          '${event.event_ticker}', '${event.title.replace(/'/g, "''")}', 
          '${event.category}', ${markets.length}, ${activeCount}, ${totalVolume}
        )
      `);
      
      console.log(`     ${i+1}/${events.length}: ${event.title.substring(0, 45)}... (${markets.length}m, ${activeCount}a)`);
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, config.rateLimit));
      
    } catch (error) {
      stats.errors++;
      console.log(`     ${i+1}/${events.length}: ERROR - ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function fetchMarketsForEvent(eventTicker: string): Promise<any[]> {
  const response = await fetch(`https://api.elections.kalshi.com/trade-api/v2/markets?event_ticker=${eventTicker}&limit=1000`);
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const data = await response.json();
  return data.markets || [];
}

function isMarketActive(market: any): boolean {
  const volume = parseFloat(String(market.volume || 0));
  const liquidity = parseFloat(String(market.liquidity || 0));
  const openInterest = parseInt(String(market.open_interest || 0));
  
  return (
    market.status === 'active' &&
    market.can_close_early &&
    new Date(market.close_time) > new Date() &&
    (volume > 0 || liquidity > 1000 || openInterest > 0)
  );
}

function calculatePrice(bid: number, ask: number, lastPrice: number, outcome: 'yes' | 'no'): number {
  const convertPrice = (price: number) => price > 1 ? price / 100 : price;
  
  if (bid > 0 && ask > 0 && ask > bid) {
    return (convertPrice(bid) + convertPrice(ask)) / 2;
  }
  
  if (lastPrice > 0) {
    const convertedLast = convertPrice(lastPrice);
    return outcome === 'yes' ? convertedLast : (1 - convertedLast);
  }
  
  return 0.5;
}

async function generateEfficientReport(connection: DuckDBConnection, stats: any, totalTime: number): Promise<void> {
  console.log("\n📊 COLLECTION RESULTS");
  console.log("=" .repeat(50));
  console.log(`⏱️ Time: ${(totalTime / 60).toFixed(1)} minutes`);
  console.log(`📈 Events: ${stats.processedEvents.toLocaleString()}/${stats.totalEvents.toLocaleString()}`);
  console.log(`📊 Markets: ${stats.totalMarkets.toLocaleString()}`);
  console.log(`🔥 Active: ${stats.activeMarkets.toLocaleString()} (${(stats.activeMarkets/stats.totalMarkets*100).toFixed(1)}%)`);
  console.log(`💰 High Volume: ${stats.highVolumeMarkets.toLocaleString()}`);
  console.log(`🎯 Max Volume: $${stats.maxVolume.toLocaleString()}`);
  console.log(`❌ Errors: ${stats.errors}`);
  
  // Detailed analysis
  const volumeResult = await connection.run(`
    SELECT 
      AVG(volume) as avg_volume,
      AVG(CASE WHEN is_active THEN volume END) as avg_active_volume,
      COUNT(CASE WHEN volume > 1000 THEN 1 END) as over_1k
    FROM kalshi_markets
  `);
  const volumeData = await volumeResult.getRows();
  const [avgVol, avgActiveVol, over1k] = volumeData[0];
  
  console.log(`💎 Avg Volume: $${Number(avgVol).toFixed(2)} (active: $${Number(avgActiveVol).toFixed(2)})`);
  console.log(`🚀 Markets >$1K: ${Number(over1k).toLocaleString()}`);
  
  // Category breakdown
  const categoryResult = await connection.run(`
    SELECT category, COUNT(*) as count, COUNT(CASE WHEN active_markets > 0 THEN 1 END) as with_active
    FROM kalshi_events
    GROUP BY category
    ORDER BY count DESC
    LIMIT 10
  `);
  const categories = await categoryResult.getRows();
  
  console.log(`\n🏷️ Top Categories:`);
  categories.forEach(row => {
    const [category, count, withActive] = row;
    console.log(`   ${category}: ${Number(count).toLocaleString()} events (${Number(withActive)} with active markets)`);
  });
  
  // Sample top markets
  const topResult = await connection.run(`
    SELECT title, volume, category
    FROM kalshi_markets
    WHERE is_active = true
    ORDER BY volume DESC
    LIMIT 5
  `);
  const topMarkets = await topResult.getRows();
  
  console.log(`\n🔥 Top Active Markets:`);
  topMarkets.forEach((row, i) => {
    const [title, volume, category] = row;
    console.log(`   ${i+1}. $${Number(volume).toLocaleString()} - ${String(title).substring(0, 50)}... (${category})`);
  });
  
  // Scalability projection
  const eventsPerMinute = stats.processedEvents / (totalTime / 60);
  const estimatedFullTime = (20000 / eventsPerMinute / 60).toFixed(1);
  
  console.log(`\n📈 SCALABILITY:`);
  console.log(`🎯 Current rate: ${eventsPerMinute.toFixed(1)} events/minute`);
  console.log(`⏱️ Full dataset (20K events): ~${estimatedFullTime} hours`);
  console.log(`📊 Estimated total markets: ${Math.round(stats.totalMarkets * 20).toLocaleString()}`);
  console.log(`🔥 Estimated active markets: ${Math.round(stats.activeMarkets * 20).toLocaleString()}`);
  
  // Production readiness
  console.log(`\n🚀 PRODUCTION ASSESSMENT:`);
  if (stats.activeMarkets > 200 && Number(avgActiveVol) > 100) {
    console.log(`✅ EXCELLENT: Ready for arbitrage detection!`);
    console.log(`💡 Scale to full dataset when ready for production`);
  } else if (stats.activeMarkets > 100) {
    console.log(`✅ GOOD: Solid foundation for arbitrage opportunities`);
  } else {
    console.log(`⚠️ LIMITED: Consider expanding dataset or adjusting filters`);
  }
  
  console.log(`\n🔧 NEXT STEPS:`);
  console.log(`1. Expand to full dataset (increase maxEvents to 20000)`);
  console.log(`2. Implement in production ETL pipeline`);
  console.log(`3. Set up regular data refresh (daily/hourly)`);
  console.log(`4. Deploy arbitrage detection algorithms`);
}

fetchKalshiMarketsEfficient();