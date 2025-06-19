// Test pagination with persistent DuckDB storage
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import fetch from 'node-fetch';

const DB_PATH = './data/marketfinder.db';

interface PolymarketMarket {
  id: string;
  question: string;
  description?: string;
  category?: string;
  outcomes: string | string[];
  lastTradePrice?: number;
  volumeNum?: number;
  volume?: number;
  liquidityNum?: number;
  liquidity?: number;
  endDateIso?: string;
  endDate?: string;
  startDateIso?: string;
  startDate?: string;
  active?: boolean;
  platform?: string;
}

async function testPaginationWithStorage(): Promise<void> {
  const runId = `test-${Date.now()}`;
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  try {
    console.log("🦆 Testing pagination with persistent DuckDB storage...");
    console.log(`Run ID: ${runId}\n`);
    
    // Connect to persistent database
    instance = await DuckDBInstance.create(DB_PATH);
    connection = await instance.connect();
    
    // Start tracking this run
    await connection.run(`
      INSERT INTO fetch_runs (run_id, platform, total_markets, batches_processed, max_offset)
      VALUES ('${runId}', 'polymarket', 0, 0, 0)
    `);
    
    // Fetch with pagination and store each batch
    const allMarkets: PolymarketMarket[] = [];
    let offset = 0;
    const limit = 100;
    let hasMoreData = true;
    let batchCount = 0;
    const maxBatches = 5; // Test with 5 batches
    
    while (hasMoreData && batchCount < maxBatches) {
      const url = `https://gamma-api.polymarket.com/markets?active=true&archived=false&limit=${limit}&offset=${offset}&order=startDate&ascending=false`;
      
      console.log(`📡 Batch ${batchCount + 1}: Fetching offset=${offset}...`);
      
      const response = await fetch(url, {
        headers: { "Accept": "application/json", "User-Agent": "MarketFinder/1.0" },
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      const markets = Array.isArray(data) ? data : (data as any).markets || [];
      
      console.log(`   Received ${markets.length} markets`);
      
      if (markets.length === 0) {
        console.log("   ✅ No more markets available");
        hasMoreData = false;
      } else {
        // Store batch in DuckDB
        for (const market of markets as PolymarketMarket[]) {
          const marketId = `${market.platform || 'polymarket'}-${market.id}`;
          
          // Parse outcomes if it's a JSON string
          let parsedOutcomes: string[] = [];
          if (typeof market.outcomes === 'string') {
            try {
              parsedOutcomes = JSON.parse(market.outcomes);
            } catch (e) {
              parsedOutcomes = [market.outcomes];
            }
          } else if (Array.isArray(market.outcomes)) {
            parsedOutcomes = market.outcomes;
          }
          
          // Determine if it's a binary market
          const hasYesNo = parsedOutcomes.some(o => 
            o && typeof o === 'string' && (
              o.toLowerCase().includes('yes') || o.toLowerCase().includes('no')
            )
          );
          
          // Skip non-binary markets
          if (!hasYesNo && parsedOutcomes.length > 4) {
            continue;
          }
          
          // Calculate prices
          let yesPrice = 0.5, noPrice = 0.5;
          if (market.lastTradePrice !== undefined && market.lastTradePrice !== null) {
            yesPrice = parseFloat(String(market.lastTradePrice)) || 0.5;
            noPrice = 1 - yesPrice;
          }
          
          // Insert into database (ON CONFLICT IGNORE to avoid duplicates)
          const title = (market.question || 'Unknown').replace(/'/g, "''");
          const description = (market.description || market.question || '').replace(/'/g, "''");
          const category = (market.category || 'other').replace(/'/g, "''");
          const endDate = market.endDateIso || market.endDate ? `'${market.endDateIso || market.endDate}'` : 'NULL';
          const startDate = market.startDateIso || market.startDate ? `'${market.startDateIso || market.startDate}'` : 'NULL';
          const rawData = JSON.stringify(market).replace(/'/g, "''");
          
          await connection.run(`
            INSERT OR IGNORE INTO raw_markets (
              id, platform, external_id, title, description, category,
              yes_price, no_price, volume, liquidity, end_date, is_active,
              start_date, raw_data
            ) VALUES (
              '${marketId}', 'polymarket', '${market.id}', '${title}', 
              '${description}', '${category}', ${yesPrice}, ${noPrice}, 
              ${parseFloat(String(market.volumeNum || market.volume || 0))}, 
              ${parseFloat(String(market.liquidityNum || market.liquidity || 0))}, 
              ${endDate}, ${market.active !== false}, ${startDate}, '${rawData}'
            )
          `);
        }
        
        allMarkets.push(...markets as PolymarketMarket[]);
        batchCount++;
        
        // Update run progress
        await connection.run(`
          UPDATE fetch_runs 
          SET total_markets = ${allMarkets.length}, batches_processed = ${batchCount}, max_offset = ${offset}
          WHERE run_id = '${runId}'
        `);
        
        console.log(`   ✅ Stored batch in DuckDB (total: ${allMarkets.length})`);
        
        // Check if we've reached the end
        if (markets.length < limit) {
          console.log("   ✅ Reached end (partial batch)");
          hasMoreData = false;
        } else {
          offset += limit;
        }
      }
    }
    
    // Mark run as completed
    await connection.run(`
      UPDATE fetch_runs 
      SET completed_at = CURRENT_TIMESTAMP, status = 'completed'
      WHERE run_id = '${runId}'
    `);
    
    // Commit transaction to ensure data persistence
    await connection.run("COMMIT");
    
    // Analyze the data
    console.log("\n📊 Data Analysis:");
    
    const statsResult = await connection.run(`
      SELECT 
        COUNT(*) as total_markets,
        COUNT(DISTINCT platform) as platforms,
        COUNT(DISTINCT category) as categories,
        AVG(yes_price) as avg_yes_price,
        AVG(volume) as avg_volume
      FROM raw_markets
    `);
    const stats = (await statsResult.getRows())[0];
    
    console.log(`   Total markets in DB: ${stats.total_markets}`);
    console.log(`   Platforms: ${stats.platforms}`);
    console.log(`   Categories: ${stats.categories}`);
    console.log(`   Avg Yes price: ${Number(stats.avg_yes_price).toFixed(3)}`);
    console.log(`   Avg Volume: $${Number(stats.avg_volume).toFixed(2)}`);
    
    // Check for duplicates
    const duplicatesResult = await connection.run(`
      SELECT external_id, COUNT(*) as count
      FROM raw_markets 
      WHERE platform = 'polymarket'
      GROUP BY external_id 
      HAVING COUNT(*) > 1
    `);
    const duplicates = await duplicatesResult.getRows();
    
    console.log(`   Duplicates found: ${duplicates.length}`);
    
    // Show recent markets
    const recentMarketsResult = await connection.run(`
      SELECT title, start_date, yes_price, volume
      FROM raw_markets 
      WHERE platform = 'polymarket'
      ORDER BY start_date DESC 
      LIMIT 5
    `);
    const recentMarkets = await recentMarketsResult.getRows();
    
    console.log("\n📈 Recent Markets:");
    recentMarkets.forEach((market, i) => {
      console.log(`   ${i+1}. "${market.title}"`);
      console.log(`      Date: ${new Date(market.start_date).toLocaleDateString()}, Price: ${market.yes_price}, Volume: $${market.volume}`);
    });
    
    console.log(`\n🎉 Pagination test completed! Run ID: ${runId}`);
    console.log(`   Database: ${DB_PATH}`);
    
  } catch (error) {
    console.error("❌ Pagination test failed:", error instanceof Error ? error.message : String(error));
    
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
    // Resources auto-cleanup on process exit
    // connection.close() and instance.close() not available in this version
  }
}

testPaginationWithStorage();