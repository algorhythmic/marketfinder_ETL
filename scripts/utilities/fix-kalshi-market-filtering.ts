// Fix Kalshi market filtering to only capture active markets with liquidity
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import fetch from 'node-fetch';

const DB_PATH = './data/active-markets-test.db';

async function testActiveMarketFiltering(): Promise<void> {
  console.log("🎯 TESTING ACTIVE KALSHI MARKET FILTERING");
  console.log("=" .repeat(60));
  
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  try {
    instance = await DuckDBInstance.create(DB_PATH);
    connection = await instance.connect();
    
    // Setup test database
    await connection.run(`
      CREATE TABLE IF NOT EXISTS active_markets (
        id VARCHAR PRIMARY KEY,
        platform VARCHAR NOT NULL,
        external_id VARCHAR NOT NULL,
        title VARCHAR NOT NULL,
        status VARCHAR,
        yes_price DOUBLE,
        no_price DOUBLE,
        volume DOUBLE,
        liquidity DOUBLE,
        open_interest INTEGER,
        can_close_early BOOLEAN,
        last_price DOUBLE,
        raw_data JSON
      )
    `);
    
    console.log("✅ Test database initialized");
    
    // Test different filtering strategies
    console.log("\n🔍 Testing Kalshi market filtering strategies...");
    
    let totalFetched = 0;
    let totalActive = 0;
    let cursor: string | undefined = undefined;
    let pageNum = 0;
    const maxPages = 20; // Test with fewer pages to focus on quality
    
    while (pageNum < maxPages) {
      console.log(`\nPage ${pageNum + 1}/${maxPages}:`);
      
      try {
        // Fetch markets with status filters
        let url = "https://api.elections.kalshi.com/trade-api/v2/markets?limit=100&status=active";
        if (cursor) {
          url += `&cursor=${cursor}`;
        }
        
        const response = await fetch(url, {
          headers: { 
            "Accept": "application/json", 
            "User-Agent": "MarketFinder-Test/1.0" 
          },
        });
        
        if (!response.ok) {
          console.warn(`⚠️ API error: ${response.status}`);
          break;
        }
        
        const data = await response.json();
        const markets = data.markets || [];
        
        console.log(`  📥 Fetched ${markets.length} markets`);
        totalFetched += markets.length;
        
        if (markets.length === 0) {
          console.log("  📝 No more markets available");
          break;
        }
        
        // Apply multiple filters for active markets
        let activeCount = 0;
        for (const market of markets) {
          const isActive = checkIfMarketIsActive(market);
          
          if (isActive) {
            activeCount++;
            totalActive++;
            
            // Calculate proper volume
            const volume = calculateVolume(market);
            const yesPrice = calculateKalshiPrice(market, 'yes');
            const noPrice = calculateKalshiPrice(market, 'no');
            
            // Store active market
            const marketId = `kalshi-${market.ticker}`;
            await connection.run(`
              INSERT OR IGNORE INTO active_markets (
                id, platform, external_id, title, status,
                yes_price, no_price, volume, liquidity, open_interest,
                can_close_early, last_price, raw_data
              ) VALUES (
                '${marketId}', 'kalshi', '${market.ticker}', 
                '${(market.title || '').replace(/'/g, "''")}', '${market.status}',
                ${yesPrice}, ${noPrice}, ${volume}, ${parseFloat(String(market.liquidity || 0))},
                ${parseInt(String(market.open_interest || 0))}, ${market.can_close_early || false},
                ${parseFloat(String(market.last_price || 0))}, 
                '${JSON.stringify(market).replace(/'/g, "''")}'
              )
            `);
          }
        }
        
        console.log(`  ✅ Active markets: ${activeCount}/${markets.length} (${(activeCount/markets.length*100).toFixed(1)}%)`);
        
        // Check for next cursor
        cursor = data.cursor;
        if (!cursor) {
          console.log("  📝 Reached end of pagination");
          break;
        }
        
        pageNum++;
        
        // Rate limiting
        if (pageNum > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        console.error(`❌ Page ${pageNum + 1} failed:`, error instanceof Error ? error.message : String(error));
        break;
      }
    }
    
    console.log(`\n📊 FILTERING RESULTS:`);
    console.log(`  Total Fetched: ${totalFetched.toLocaleString()}`);
    console.log(`  Active Markets: ${totalActive.toLocaleString()}`);
    console.log(`  Filtering Efficiency: ${(totalActive/totalFetched*100).toFixed(1)}%`);
    
    // Analyze the filtered results
    await analyzeFilteredResults(connection);
    
  } catch (error) {
    console.error("❌ Test failed:", error instanceof Error ? error.message : String(error));
  } finally {
    console.log(`\n🧹 Test database created at: ${DB_PATH}`);
  }
}

function checkIfMarketIsActive(market: any): boolean {
  // Multiple criteria for active markets
  return (
    // Must have valid status
    (market.status === 'active' || market.status === 'initialized') &&
    
    // Must be closeable (tradeable)
    market.can_close_early === true &&
    
    // Must have some liquidity OR volume OR open interest
    (
      (market.liquidity && parseFloat(String(market.liquidity)) > 0) ||
      (market.volume && parseFloat(String(market.volume)) > 0) ||
      (market.open_interest && parseInt(String(market.open_interest)) > 0)
    ) &&
    
    // Must have valid pricing
    (market.yes_bid || market.yes_ask || market.last_price) &&
    
    // Must be in future (not expired)
    market.close_time > new Date().toISOString()
  );
}

function calculateVolume(market: any): number {
  // Priority: actual volume > open_interest > liquidity proxy
  if (market.volume && parseFloat(String(market.volume)) > 0) {
    return parseFloat(String(market.volume));
  }
  
  if (market.open_interest && parseInt(String(market.open_interest)) > 0) {
    return parseInt(String(market.open_interest));
  }
  
  if (market.liquidity && parseFloat(String(market.liquidity)) > 0) {
    return parseFloat(String(market.liquidity)) / 1000;
  }
  
  return 0;
}

function calculateKalshiPrice(market: any, outcome: 'yes' | 'no'): number {
  const bidField = outcome === 'yes' ? 'yes_bid' : 'no_bid';
  const askField = outcome === 'yes' ? 'yes_ask' : 'no_ask';
  
  const bid = parseFloat(String(market[bidField] || 0));
  const ask = parseFloat(String(market[askField] || 0));
  const lastPrice = parseFloat(String(market.last_price || 0));
  
  // Convert from cents to decimals if needed
  const convertPrice = (price: number) => price > 1 ? price / 100 : price;
  
  if (bid > 0 && ask > 0 && ask > bid) {
    return (convertPrice(bid) + convertPrice(ask)) / 2;
  }
  
  if (lastPrice > 0) {
    return outcome === 'yes' ? convertPrice(lastPrice) : (1 - convertPrice(lastPrice));
  }
  
  return 0.5;
}

async function analyzeFilteredResults(connection: DuckDBConnection): Promise<void> {
  console.log("\n📈 FILTERED RESULTS ANALYSIS:");
  
  // Volume statistics
  const volumeResult = await connection.run(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN volume > 0 THEN 1 END) as with_volume,
      MIN(volume) as min_vol,
      MAX(volume) as max_vol,
      AVG(volume) as avg_vol,
      AVG(CASE WHEN volume > 0 THEN volume END) as avg_nonzero_vol,
      COUNT(CASE WHEN volume > 100 THEN 1 END) as over_100,
      COUNT(CASE WHEN volume > 1000 THEN 1 END) as over_1000
    FROM active_markets
  `);
  const volume = await volumeResult.getRows();
  
  const [total, with_vol, min_vol, max_vol, avg_vol, avg_nonzero, over_100, over_1000] = volume[0];
  console.log(`\n  Volume Analysis:`);
  console.log(`    Total Active Markets: ${Number(total).toLocaleString()}`);
  console.log(`    Markets with Volume > 0: ${Number(with_vol).toLocaleString()} (${(Number(with_vol)/Number(total)*100).toFixed(1)}%)`);
  console.log(`    Average Volume (all): $${Number(avg_vol).toFixed(2)}`);
  console.log(`    Average Volume (non-zero): $${Number(avg_nonzero).toFixed(2)}`);
  console.log(`    Markets > $100: ${Number(over_100).toLocaleString()}`);
  console.log(`    Markets > $1000: ${Number(over_1000).toLocaleString()}`);
  
  // Status and activity analysis
  const statusResult = await connection.run(`
    SELECT 
      status,
      COUNT(*) as count,
      AVG(volume) as avg_volume,
      AVG(liquidity) as avg_liquidity,
      AVG(open_interest) as avg_open_interest
    FROM active_markets
    GROUP BY status
    ORDER BY count DESC
  `);
  const statuses = await statusResult.getRows();
  
  console.log(`\n  Status Distribution:`);
  statuses.forEach(row => {
    const [status, count, avg_vol, avg_liq, avg_oi] = row;
    console.log(`    ${status}: ${Number(count).toLocaleString()} markets (Avg Vol: $${Number(avg_vol).toFixed(2)}, Avg Liq: $${Number(avg_liq).toFixed(0)})`);
  });
  
  // Sample high-volume markets
  const sampleResult = await connection.run(`
    SELECT title, volume, liquidity, open_interest, status
    FROM active_markets
    ORDER BY volume DESC
    LIMIT 5
  `);
  const samples = await sampleResult.getRows();
  
  console.log(`\n  Top 5 Active Markets by Volume:`);
  samples.forEach((row, i) => {
    const [title, volume, liquidity, open_interest, status] = row;
    console.log(`    ${i+1}. "${String(title).substring(0, 40)}..." - $${Number(volume).toFixed(2)} (${status})`);
  });
  
  console.log(`\n💡 RECOMMENDATIONS:`);
  const avgVol = Number(avg_vol);
  const activePercent = Number(with_vol) / Number(total) * 100;
  
  if (avgVol > 50 && activePercent > 80) {
    console.log(`✅ Excellent filtering! Average volume of $${avgVol.toFixed(2)} with ${activePercent.toFixed(1)}% active markets.`);
  } else if (avgVol > 20) {
    console.log(`✅ Good filtering! Average volume improved to $${avgVol.toFixed(2)}.`);
  } else {
    console.log(`⚠️ Filtering helped but may need more refinement.`);
  }
  
  console.log(`🔧 Use these filters in production:`);
  console.log(`   - status=active (or initialized with activity)`);
  console.log(`   - can_close_early=true`);
  console.log(`   - liquidity > 0 OR volume > 0 OR open_interest > 0`);
  console.log(`   - valid pricing data available`);
}

testActiveMarketFiltering();