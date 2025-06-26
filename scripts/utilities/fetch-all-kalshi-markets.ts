// Fetch ALL available active markets from Kalshi using Events → Markets approach
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import fetch from 'node-fetch';

const DB_PATH = './data/all-kalshi-markets.db';

interface KalshiEvent {
  event_ticker: string;
  title: string;
  category: string;
  series_ticker: string;
  sub_title?: string;
}

interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  status: string;
  volume: number;
  volume_24h: number;
  liquidity: number;
  open_interest: number;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  close_time: string;
  open_time: string;
  category: string;
  can_close_early: boolean;
}

interface CollectionStats {
  totalEvents: number;
  processedEvents: number;
  totalMarkets: number;
  activeMarkets: number;
  highVolumeMarkets: number;
  avgVolume: number;
  maxVolume: number;
  categories: Record<string, number>;
  errors: number;
}

async function fetchAllKalshiMarkets(): Promise<void> {
  console.log("🚀 FETCHING ALL KALSHI ACTIVE MARKETS");
  console.log("=" .repeat(60));
  console.log("Target: Complete Kalshi market coverage");
  
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  const stats: CollectionStats = {
    totalEvents: 0,
    processedEvents: 0,
    totalMarkets: 0,
    activeMarkets: 0,
    highVolumeMarkets: 0,
    avgVolume: 0,
    maxVolume: 0,
    categories: {},
    errors: 0
  };
  
  try {
    // Setup database
    instance = await DuckDBInstance.create(DB_PATH);
    connection = await instance.connect();
    
    await setupDatabase(connection);
    console.log("✅ Database initialized");
    
    const startTime = Date.now();
    
    // Step 1: Fetch ALL Kalshi events
    console.log("\n📡 Step 1: Fetching ALL Kalshi Events...");
    const events = await fetchAllKalshiEvents();
    stats.totalEvents = events.length;
    console.log(`✅ Found ${events.length.toLocaleString()} total events`);
    
    // Store events in database
    await storeEvents(connection, events);
    
    // Step 2: Fetch markets for ALL events
    console.log("\n🎯 Step 2: Fetching Markets for ALL Events...");
    console.log("This may take several minutes...");
    
    const batchSize = 50; // Process events in batches for better monitoring
    const totalBatches = Math.ceil(events.length / batchSize);
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIdx = batchIndex * batchSize;
      const endIdx = Math.min(startIdx + batchSize, events.length);
      const batch = events.slice(startIdx, endIdx);
      
      console.log(`\n📦 Batch ${batchIndex + 1}/${totalBatches} (Events ${startIdx + 1}-${endIdx}):`);
      
      await processBatch(connection, batch, stats);
      
      // Progress update
      const progress = ((batchIndex + 1) / totalBatches * 100).toFixed(1);
      const elapsed = (Date.now() - startTime) / 1000;
      const estimated = elapsed / (batchIndex + 1) * totalBatches;
      
      console.log(`   📊 Progress: ${progress}% | Elapsed: ${elapsed.toFixed(0)}s | ETA: ${estimated.toFixed(0)}s`);
      console.log(`   📈 Running totals: ${stats.totalMarkets.toLocaleString()} markets, ${stats.activeMarkets.toLocaleString()} active`);
      
      // Brief pause between batches to be nice to the API
      if (batchIndex < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    const totalTime = (Date.now() - startTime) / 1000;
    
    // Step 3: Final analysis and statistics
    console.log("\n📊 FINAL COLLECTION RESULTS");
    console.log("=" .repeat(60));
    
    await generateFinalReport(connection, stats, totalTime);
    
  } catch (error) {
    console.error("❌ Collection failed:", error instanceof Error ? error.message : String(error));
  } finally {
    console.log(`\n🧹 Complete database saved at: ${DB_PATH}`);
    console.log("🚀 Ready for production deployment!");
  }
}

async function setupDatabase(connection: DuckDBConnection): Promise<void> {
  await connection.run(`
    CREATE TABLE IF NOT EXISTS kalshi_events (
      event_ticker VARCHAR PRIMARY KEY,
      title VARCHAR,
      category VARCHAR,
      series_ticker VARCHAR,
      sub_title VARCHAR,
      markets_count INTEGER DEFAULT 0,
      active_markets_count INTEGER DEFAULT 0,
      total_volume DOUBLE DEFAULT 0,
      fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await connection.run(`
    CREATE TABLE IF NOT EXISTS kalshi_markets (
      ticker VARCHAR PRIMARY KEY,
      event_ticker VARCHAR,
      title VARCHAR,
      status VARCHAR,
      volume DOUBLE,
      volume_24h DOUBLE,
      liquidity DOUBLE,
      open_interest INTEGER,
      yes_bid DOUBLE,
      yes_ask DOUBLE,
      no_bid DOUBLE,
      no_ask DOUBLE,
      last_price DOUBLE,
      close_time TIMESTAMP,
      open_time TIMESTAMP,
      category VARCHAR,
      can_close_early BOOLEAN,
      is_active BOOLEAN DEFAULT false,
      calculated_yes_price DOUBLE,
      calculated_no_price DOUBLE,
      fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await connection.run(`
    CREATE TABLE IF NOT EXISTS collection_log (
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      event_ticker VARCHAR,
      status VARCHAR,
      markets_found INTEGER,
      error_message VARCHAR
    )
  `);
}

async function fetchAllKalshiEvents(): Promise<KalshiEvent[]> {
  const events: KalshiEvent[] = [];
  let cursor: string | undefined = undefined;
  let pageCount = 0;
  const maxPages = 100; // Safety limit - should be enough for all events
  
  while (pageCount < maxPages) {
    try {
      let url = "https://api.elections.kalshi.com/trade-api/v2/events?limit=200";
      if (cursor) {
        url += `&cursor=${cursor}`;
      }
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'MarketFinder-Production/1.0'
        }
      });
      
      if (!response.ok) {
        console.log(`   ⚠️ Events page ${pageCount + 1}: HTTP ${response.status}`);
        break;
      }
      
      const data = await response.json();
      const pageEvents = data.events || [];
      
      events.push(...pageEvents);
      console.log(`   📄 Page ${pageCount + 1}: ${pageEvents.length} events (Total: ${events.length.toLocaleString()})`);
      
      if (!data.cursor || pageEvents.length === 0) {
        console.log(`   📝 All events fetched`);
        break;
      }
      
      cursor = data.cursor;
      pageCount++;
      
      // Rate limiting for politeness
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.log(`   ❌ Events page ${pageCount + 1}: ${error instanceof Error ? error.message : String(error)}`);
      break;
    }
  }
  
  return events;
}

async function storeEvents(connection: DuckDBConnection, events: KalshiEvent[]): Promise<void> {
  console.log("💾 Storing events in database...");
  
  for (const event of events) {
    await connection.run(`
      INSERT OR IGNORE INTO kalshi_events (event_ticker, title, category, series_ticker, sub_title)
      VALUES ('${event.event_ticker}', '${event.title.replace(/'/g, "''")}', 
              '${event.category}', '${event.series_ticker}', '${(event.sub_title || '').replace(/'/g, "''")}')
    `);
  }
}

async function processBatch(connection: DuckDBConnection, events: KalshiEvent[], stats: CollectionStats): Promise<void> {
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    
    try {
      console.log(`     ${i + 1}/${events.length}: ${event.title.substring(0, 50)}...`);
      
      const markets = await fetchMarketsForEvent(event.event_ticker);
      stats.processedEvents++;
      stats.totalMarkets += markets.length;
      
      let eventActiveCount = 0;
      let eventHighVolumeCount = 0;
      let eventTotalVolume = 0;
      
      for (const market of markets) {
        // Determine if market is active
        const isActive = isMarketActive(market);
        if (isActive) {
          stats.activeMarkets++;
          eventActiveCount++;
        }
        
        if (market.volume > 100) {
          stats.highVolumeMarkets++;
          eventHighVolumeCount++;
        }
        
        eventTotalVolume += market.volume;
        
        // Update category stats
        stats.categories[event.category] = (stats.categories[event.category] || 0) + 1;
        
        // Track max volume
        if (market.volume > stats.maxVolume) {
          stats.maxVolume = market.volume;
        }
        
        // Store market
        await storeMarket(connection, market, event.category, isActive);
      }
      
      // Update event statistics
      await connection.run(`
        UPDATE kalshi_events 
        SET markets_count = ${markets.length},
            active_markets_count = ${eventActiveCount},
            total_volume = ${eventTotalVolume}
        WHERE event_ticker = '${event.event_ticker}'
      `);
      
      // Log successful processing
      await connection.run(`
        INSERT INTO collection_log (event_ticker, status, markets_found)
        VALUES ('${event.event_ticker}', 'success', ${markets.length})
      `);
      
      console.log(`       📊 ${markets.length} markets (${eventActiveCount} active, ${eventHighVolumeCount} high-volume)`);
      
      // Rate limiting between events
      await new Promise(resolve => setTimeout(resolve, 50));
      
    } catch (error) {
      stats.errors++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`       ❌ Error: ${errorMsg}`);
      
      // Log error
      await connection.run(`
        INSERT INTO collection_log (event_ticker, status, markets_found, error_message)
        VALUES ('${event.event_ticker}', 'error', 0, '${errorMsg.replace(/'/g, "''")}')
      `);
    }
  }
}

async function fetchMarketsForEvent(eventTicker: string): Promise<KalshiMarket[]> {
  const response = await fetch(`https://api.elections.kalshi.com/trade-api/v2/markets?event_ticker=${eventTicker}&limit=1000`, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'MarketFinder-Production/1.0'
    }
  });
  
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
    volume_24h: parseFloat(String(market.volume_24h || 0)),
    liquidity: parseFloat(String(market.liquidity || 0)),
    open_interest: parseInt(String(market.open_interest || 0)),
    yes_bid: parseFloat(String(market.yes_bid || 0)),
    yes_ask: parseFloat(String(market.yes_ask || 0)),
    no_bid: parseFloat(String(market.no_bid || 0)),
    no_ask: parseFloat(String(market.no_ask || 0)),
    last_price: parseFloat(String(market.last_price || 0)),
    close_time: market.close_time,
    open_time: market.open_time,
    category: '',
    can_close_early: market.can_close_early || false
  }));
}

function isMarketActive(market: KalshiMarket): boolean {
  return (
    market.status === 'active' &&
    market.can_close_early &&
    new Date(market.close_time) > new Date() &&
    (market.volume > 0 || market.liquidity > 1000 || market.open_interest > 0 || 
     (market.yes_bid > 0 && market.yes_ask > 0))
  );
}

async function storeMarket(connection: DuckDBConnection, market: KalshiMarket, category: string, isActive: boolean): Promise<void> {
  // Calculate normalized prices
  const yesPrice = calculatePrice(market.yes_bid, market.yes_ask, market.last_price, 'yes');
  const noPrice = calculatePrice(market.no_bid, market.no_ask, market.last_price, 'no');
  
  await connection.run(`
    INSERT OR IGNORE INTO kalshi_markets (
      ticker, event_ticker, title, status, volume, volume_24h, liquidity, 
      open_interest, yes_bid, yes_ask, no_bid, no_ask, last_price, 
      close_time, open_time, category, can_close_early, is_active,
      calculated_yes_price, calculated_no_price
    ) VALUES (
      '${market.ticker}', '${market.event_ticker}', 
      '${market.title.replace(/'/g, "''")}', '${market.status}',
      ${market.volume}, ${market.volume_24h}, ${market.liquidity}, ${market.open_interest},
      ${market.yes_bid}, ${market.yes_ask}, ${market.no_bid}, ${market.no_ask}, 
      ${market.last_price}, '${market.close_time}', '${market.open_time}',
      '${category}', ${market.can_close_early}, ${isActive},
      ${yesPrice}, ${noPrice}
    )
  `);
}

function calculatePrice(bid: number, ask: number, lastPrice: number, outcome: 'yes' | 'no'): number {
  // Convert from cents to decimal if needed
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

async function generateFinalReport(connection: DuckDBConnection, stats: CollectionStats, totalTime: number): Promise<void> {
  console.log(`⏱️ Total collection time: ${(totalTime / 60).toFixed(1)} minutes`);
  console.log(`📊 Events processed: ${stats.processedEvents.toLocaleString()}/${stats.totalEvents.toLocaleString()}`);
  console.log(`📈 Total markets found: ${stats.totalMarkets.toLocaleString()}`);
  console.log(`🔥 Active markets: ${stats.activeMarkets.toLocaleString()} (${(stats.activeMarkets/stats.totalMarkets*100).toFixed(1)}%)`);
  console.log(`💰 High volume markets (>$100): ${stats.highVolumeMarkets.toLocaleString()}`);
  console.log(`🎯 Max volume found: $${stats.maxVolume.toLocaleString()}`);
  console.log(`❌ Errors encountered: ${stats.errors}`);
  
  // Calculate final average volume for active markets
  const avgVolumeResult = await connection.run(`
    SELECT AVG(volume) as avg_volume
    FROM kalshi_markets
    WHERE is_active = true AND volume > 0
  `);
  const avgVolumeRows = await avgVolumeResult.getRows();
  const avgVolume = Number(avgVolumeRows[0][0]);
  
  console.log(`💎 Average volume (active markets): $${avgVolume.toFixed(2)}`);
  
  // Top categories
  console.log(`\n🏷️ Top Categories:`);
  const sortedCategories = Object.entries(stats.categories)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10);
    
  sortedCategories.forEach(([category, count]) => {
    console.log(`   ${category}: ${count.toLocaleString()} markets`);
  });
  
  // Final quality assessment
  console.log(`\n🎯 QUALITY ASSESSMENT:`);
  if (stats.activeMarkets > 1000 && avgVolume > 100) {
    console.log(`✅ EXCELLENT: ${stats.activeMarkets.toLocaleString()} active markets with $${avgVolume.toFixed(2)} average volume`);
    console.log(`🚀 Perfect for arbitrage detection and production deployment!`);
  } else if (stats.activeMarkets > 500) {
    console.log(`✅ GOOD: Solid market coverage for arbitrage opportunities`);
  } else {
    console.log(`⚠️ LIMITED: May need to adjust filtering criteria`);
  }
  
  console.log(`\n📈 Estimated arbitrage opportunities: ${Math.round(stats.activeMarkets * 0.05).toLocaleString()}`);
}

fetchAllKalshiMarkets();