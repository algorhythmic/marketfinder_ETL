// Realistic analysis of Kalshi volume after proper filtering
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';

const DB_PATH = './data/complete-test.db';

async function analyzeRealisticKalshiVolume(): Promise<void> {
  console.log("📊 REALISTIC KALSHI VOLUME ANALYSIS");
  console.log("=" .repeat(50));
  
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  try {
    instance = await DuckDBInstance.create(DB_PATH);
    connection = await instance.connect();
    
    // 1. Apply proper filtering criteria
    console.log("\n🎯 Applying Production-Ready Filters:");
    
    const filteringResult = await connection.run(`
      SELECT 
        COUNT(*) as total_markets,
        
        -- Filter 1: Markets with real volume (API volume > 0)
        COUNT(CASE 
          WHEN json_extract(raw_data, '$.volume') IS NOT NULL 
           AND CAST(json_extract(raw_data, '$.volume') AS INTEGER) > 0 
          THEN 1 
        END) as markets_with_api_volume,
        
        -- Filter 2: Markets with substantial liquidity (>$1000)
        COUNT(CASE 
          WHEN json_extract(raw_data, '$.liquidity') IS NOT NULL 
           AND CAST(json_extract(raw_data, '$.liquidity') AS DOUBLE) > 1000 
          THEN 1 
        END) as markets_with_good_liquidity,
        
        -- Filter 3: Markets with open interest
        COUNT(CASE 
          WHEN json_extract(raw_data, '$.open_interest') IS NOT NULL 
           AND CAST(json_extract(raw_data, '$.open_interest') AS INTEGER) > 0 
          THEN 1 
        END) as markets_with_open_interest,
        
        -- Filter 4: Markets with active trading (bid/ask spread)
        COUNT(CASE 
          WHEN json_extract(raw_data, '$.yes_bid') IS NOT NULL 
           AND json_extract(raw_data, '$.yes_ask') IS NOT NULL
           AND CAST(json_extract(raw_data, '$.yes_bid') AS INTEGER) > 0
           AND CAST(json_extract(raw_data, '$.yes_ask') AS INTEGER) > 0
           AND CAST(json_extract(raw_data, '$.yes_ask') AS INTEGER) > CAST(json_extract(raw_data, '$.yes_bid') AS INTEGER)
          THEN 1 
        END) as markets_with_active_trading,
        
        -- Filter 5: Combined "truly active" markets
        COUNT(CASE 
          WHEN (
            (json_extract(raw_data, '$.volume') IS NOT NULL AND CAST(json_extract(raw_data, '$.volume') AS INTEGER) > 0) OR
            (json_extract(raw_data, '$.liquidity') IS NOT NULL AND CAST(json_extract(raw_data, '$.liquidity') AS DOUBLE) > 1000) OR
            (json_extract(raw_data, '$.open_interest') IS NOT NULL AND CAST(json_extract(raw_data, '$.open_interest') AS INTEGER) > 0)
          ) AND (
            json_extract(raw_data, '$.status') = 'active'
          )
          THEN 1 
        END) as truly_active_markets
        
      FROM test_markets 
      WHERE platform = 'kalshi'
    `);
    const filtering = await filteringResult.getRows();
    
    const [total, api_vol, good_liq, open_int, active_trading, truly_active] = filtering[0];
    
    console.log(`  📊 Total Kalshi Markets: ${Number(total).toLocaleString()}`);
    console.log(`  🔥 With API Volume > 0: ${Number(api_vol).toLocaleString()} (${(Number(api_vol)/Number(total)*100).toFixed(1)}%)`);
    console.log(`  💰 With Liquidity > $1K: ${Number(good_liq).toLocaleString()} (${(Number(good_liq)/Number(total)*100).toFixed(1)}%)`);
    console.log(`  📈 With Open Interest > 0: ${Number(open_int).toLocaleString()} (${(Number(open_int)/Number(total)*100).toFixed(1)}%)`);
    console.log(`  💸 With Active Trading: ${Number(active_trading).toLocaleString()} (${(Number(active_trading)/Number(total)*100).toFixed(1)}%)`);
    console.log(`  ⭐ Truly Active Markets: ${Number(truly_active).toLocaleString()} (${(Number(truly_active)/Number(total)*100).toFixed(1)}%)`);
    
    // 2. Analyze volume for ONLY active markets
    console.log("\n💰 VOLUME ANALYSIS FOR ACTIVE MARKETS ONLY:");
    
    const activeVolumeResult = await connection.run(`
      WITH active_markets AS (
        SELECT 
          title,
          volume,
          liquidity,
          CAST(json_extract(raw_data, '$.volume') AS INTEGER) as api_volume,
          CAST(json_extract(raw_data, '$.liquidity') AS DOUBLE) as api_liquidity,
          CAST(json_extract(raw_data, '$.open_interest') AS INTEGER) as api_open_interest,
          json_extract(raw_data, '$.status') as status
        FROM test_markets 
        WHERE platform = 'kalshi'
          AND (
            (json_extract(raw_data, '$.volume') IS NOT NULL AND CAST(json_extract(raw_data, '$.volume') AS INTEGER) > 0) OR
            (json_extract(raw_data, '$.liquidity') IS NOT NULL AND CAST(json_extract(raw_data, '$.liquidity') AS DOUBLE) > 1000) OR
            (json_extract(raw_data, '$.open_interest') IS NOT NULL AND CAST(json_extract(raw_data, '$.open_interest') AS INTEGER) > 0)
          )
          AND json_extract(raw_data, '$.status') = 'active'
      )
      SELECT 
        COUNT(*) as active_count,
        MIN(volume) as min_volume,
        MAX(volume) as max_volume,
        AVG(volume) as avg_volume,
        MIN(api_liquidity) as min_liquidity,
        MAX(api_liquidity) as max_liquidity,
        AVG(api_liquidity) as avg_liquidity,
        COUNT(CASE WHEN volume > 100 THEN 1 END) as over_100,
        COUNT(CASE WHEN volume > 1000 THEN 1 END) as over_1000
      FROM active_markets
    `);
    const activeVolume = await activeVolumeResult.getRows();
    
    if (activeVolume.length > 0 && activeVolume[0][0] > 0) {
      const [count, min_vol, max_vol, avg_vol, min_liq, max_liq, avg_liq, over_100, over_1000] = activeVolume[0];
      
      console.log(`  📊 Active Markets Count: ${Number(count).toLocaleString()}`);
      console.log(`  💰 Volume Range: $${Number(min_vol).toFixed(2)} - $${Number(max_vol).toFixed(2)}`);
      console.log(`  📈 Average Volume: $${Number(avg_vol).toFixed(2)}`);
      console.log(`  💎 Liquidity Range: $${Number(min_liq).toLocaleString()} - $${Number(max_liq).toLocaleString()}`);
      console.log(`  💸 Average Liquidity: $${Number(avg_liq).toLocaleString()}`);
      console.log(`  🎯 Markets > $100 volume: ${Number(over_100).toLocaleString()}`);
      console.log(`  🔥 Markets > $1000 volume: ${Number(over_1000).toLocaleString()}`);
      
      // 3. Show samples of active markets
      console.log("\n📋 SAMPLE ACTIVE MARKETS:");
      const sampleResult = await connection.run(`
        WITH active_markets AS (
          SELECT 
            title,
            volume,
            CAST(json_extract(raw_data, '$.volume') AS INTEGER) as api_volume,
            CAST(json_extract(raw_data, '$.liquidity') AS DOUBLE) as api_liquidity,
            json_extract(raw_data, '$.ticker') as ticker,
            json_extract(raw_data, '$.status') as status
          FROM test_markets 
          WHERE platform = 'kalshi'
            AND (
              (json_extract(raw_data, '$.volume') IS NOT NULL AND CAST(json_extract(raw_data, '$.volume') AS INTEGER) > 0) OR
              (json_extract(raw_data, '$.liquidity') IS NOT NULL AND CAST(json_extract(raw_data, '$.liquidity') AS DOUBLE) > 1000)
            )
            AND json_extract(raw_data, '$.status') = 'active'
        )
        SELECT title, volume, api_volume, api_liquidity, ticker
        FROM active_markets
        ORDER BY volume DESC
        LIMIT 10
      `);
      const samples = await sampleResult.getRows();
      
      samples.forEach((row, i) => {
        const [title, volume, api_volume, api_liquidity, ticker] = row;
        console.log(`  ${i+1}. "${String(title).substring(0, 45)}..."`);
        console.log(`     Volume: $${Number(volume).toFixed(2)} (API: ${Number(api_volume)}) | Liquidity: $${Number(api_liquidity).toLocaleString()}`);
        console.log(`     Ticker: ${ticker}`);
        console.log();
      });
      
    } else {
      console.log("  ⚠️ No active markets found with current filter criteria");
    }
    
    // 4. Production recommendations
    console.log("💡 PRODUCTION RECOMMENDATIONS:");
    
    const activeCount = Number(truly_active);
    const totalCount = Number(total);
    
    if (activeCount > 50) {
      console.log(`✅ Found ${activeCount} truly active markets - good for production!`);
      console.log(`🎯 Filter efficiency: ${(activeCount/totalCount*100).toFixed(1)}% (${activeCount}/${totalCount})`);
      
      if (activeVolume.length > 0 && activeVolume[0][0] > 0) {
        const avgVol = Number(activeVolume[0][3]);
        console.log(`💰 Active market average volume: $${avgVol.toFixed(2)} - ${avgVol > 200 ? 'Excellent' : avgVol > 50 ? 'Good' : 'Low'}`);
      }
      
      console.log("\n🔧 Production filtering criteria:");
      console.log("   ✅ status = 'active'");
      console.log("   ✅ (volume > 0 OR liquidity > $1000 OR open_interest > 0)");
      console.log("   ✅ yes_bid > 0 AND yes_ask > yes_bid (optional for better quality)");
      
    } else {
      console.log(`⚠️ Only ${activeCount} active markets found - may need to adjust criteria`);
      console.log("🔧 Consider lowering thresholds or including 'initialized' markets with activity");
    }
    
  } catch (error) {
    console.error("❌ Analysis failed:", error instanceof Error ? error.message : String(error));
  } finally {
    // Resources auto-cleanup
  }
}

analyzeRealisticKalshiVolume();