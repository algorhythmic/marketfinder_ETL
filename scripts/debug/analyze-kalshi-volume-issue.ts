// Analyze the Kalshi volume issue - $2 average seems too low
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';

const DB_PATH = './data/complete-test.db';

async function analyzeKalshiVolumeIssue(): Promise<void> {
  console.log("🔍 ANALYZING KALSHI VOLUME ISSUE");
  console.log("=" .repeat(50));
  
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  try {
    instance = await DuckDBInstance.create(DB_PATH);
    connection = await instance.connect();
    
    // 1. Overall volume statistics
    console.log("\n📊 Overall Kalshi Volume Statistics:");
    const overallResult = await connection.run(`
      SELECT 
        COUNT(*) as total_markets,
        COUNT(CASE WHEN volume > 0 THEN 1 END) as with_volume,
        COUNT(CASE WHEN volume = 0 THEN 1 END) as zero_volume,
        MIN(volume) as min_vol,
        MAX(volume) as max_vol,
        AVG(volume) as avg_vol,
        AVG(CASE WHEN volume > 0 THEN volume END) as avg_nonzero_vol,
        COUNT(CASE WHEN volume > 100 THEN 1 END) as over_100,
        COUNT(CASE WHEN volume > 1000 THEN 1 END) as over_1000
      FROM test_markets 
      WHERE platform = 'kalshi'
    `);
    const overall = await overallResult.getRows();
    
    const [total, with_vol, zero_vol, min_vol, max_vol, avg_vol, avg_nonzero, over_100, over_1000] = overall[0];
    console.log(`  Total Markets: ${Number(total).toLocaleString()}`);
    console.log(`  Markets with Volume > 0: ${Number(with_vol).toLocaleString()} (${(Number(with_vol)/Number(total)*100).toFixed(1)}%)`);
    console.log(`  Markets with Zero Volume: ${Number(zero_vol).toLocaleString()} (${(Number(zero_vol)/Number(total)*100).toFixed(1)}%)`);
    console.log(`  Min Volume: $${Number(min_vol).toFixed(2)}`);
    console.log(`  Max Volume: $${Number(max_vol).toFixed(2)}`);
    console.log(`  Average Volume (all): $${Number(avg_vol).toFixed(2)}`);
    console.log(`  Average Volume (non-zero): $${Number(avg_nonzero).toFixed(2)}`);
    console.log(`  Markets > $100 volume: ${Number(over_100).toLocaleString()}`);
    console.log(`  Markets > $1000 volume: ${Number(over_1000).toLocaleString()}`);
    
    // 2. Check raw liquidity data
    console.log("\n💰 Kalshi Liquidity vs Volume Analysis:");
    const liquidityResult = await connection.run(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN liquidity > 0 THEN 1 END) as with_liquidity,
        MIN(liquidity) as min_liq,
        MAX(liquidity) as max_liq,
        AVG(liquidity) as avg_liq,
        AVG(CASE WHEN liquidity > 0 THEN liquidity END) as avg_nonzero_liq
      FROM test_markets 
      WHERE platform = 'kalshi'
    `);
    const liquidity = await liquidityResult.getRows();
    
    const [liq_total, with_liq, min_liq, max_liq, avg_liq, avg_nonzero_liq] = liquidity[0];
    console.log(`  Markets with Liquidity > 0: ${Number(with_liq).toLocaleString()} (${(Number(with_liq)/Number(liq_total)*100).toFixed(1)}%)`);
    console.log(`  Min Liquidity: $${Number(min_liq).toFixed(2)}`);
    console.log(`  Max Liquidity: $${Number(max_liq).toFixed(2)}`);
    console.log(`  Average Liquidity (all): $${Number(avg_liq).toFixed(2)}`);
    console.log(`  Average Liquidity (non-zero): $${Number(avg_nonzero_liq).toFixed(2)}`);
    
    // 3. Check if volume is calculated from liquidity/1000 as expected
    console.log("\n🔢 Volume Calculation Analysis:");
    const calcResult = await connection.run(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN ABS(volume - (liquidity / 1000.0)) < 0.01 THEN 1 END) as matches_formula,
        COUNT(CASE WHEN volume = 0 AND liquidity = 0 THEN 1 END) as both_zero,
        COUNT(CASE WHEN volume > 0 AND liquidity = 0 THEN 1 END) as vol_no_liq,
        COUNT(CASE WHEN volume = 0 AND liquidity > 0 THEN 1 END) as liq_no_vol
      FROM test_markets 
      WHERE platform = 'kalshi'
    `);
    const calc = await calcResult.getRows();
    
    const [calc_total, matches, both_zero, vol_no_liq, liq_no_vol] = calc[0];
    console.log(`  Markets where volume ≈ liquidity/1000: ${Number(matches).toLocaleString()} (${(Number(matches)/Number(calc_total)*100).toFixed(1)}%)`);
    console.log(`  Markets with both volume=0 and liquidity=0: ${Number(both_zero).toLocaleString()}`);
    console.log(`  Markets with volume>0 but liquidity=0: ${Number(vol_no_liq).toLocaleString()}`);
    console.log(`  Markets with liquidity>0 but volume=0: ${Number(liq_no_vol).toLocaleString()}`);
    
    // 4. Sample some raw data to see what's actually in the API responses
    console.log("\n📋 Sample Raw Kalshi Market Data:");
    const sampleResult = await connection.run(`
      SELECT title, volume, liquidity, raw_data
      FROM test_markets 
      WHERE platform = 'kalshi'
        AND volume > 0
      ORDER BY volume DESC
      LIMIT 5
    `);
    const samples = await sampleResult.getRows();
    
    console.log("Top 5 markets by volume:");
    samples.forEach((row, i) => {
      const [title, volume, liquidity, raw_data] = row;
      console.log(`\n  ${i+1}. "${String(title).substring(0, 50)}..."`);
      console.log(`     Volume: $${Number(volume).toFixed(2)}`);
      console.log(`     Liquidity: $${Number(liquidity).toFixed(2)}`);
      
      // Parse raw data to see actual API fields
      try {
        const raw = JSON.parse(String(raw_data));
        console.log(`     API Fields: volume=${raw.volume || 'N/A'}, liquidity=${raw.liquidity || 'N/A'}, open_interest=${raw.open_interest || 'N/A'}`);
        console.log(`     Price fields: yes_bid=${raw.yes_bid}, yes_ask=${raw.yes_ask}, last_price=${raw.last_price}`);
      } catch (e) {
        console.log(`     Raw data parse error: ${e}`);
      }
    });
    
    // 5. Check zero volume markets
    console.log("\n🔍 Sample Zero Volume Markets:");
    const zeroResult = await connection.run(`
      SELECT title, volume, liquidity, raw_data
      FROM test_markets 
      WHERE platform = 'kalshi'
        AND volume = 0
      ORDER BY liquidity DESC
      LIMIT 3
    `);
    const zeroSamples = await zeroResult.getRows();
    
    console.log("Markets with zero volume (but potentially liquidity):");
    zeroSamples.forEach((row, i) => {
      const [title, volume, liquidity, raw_data] = row;
      console.log(`\n  ${i+1}. "${String(title).substring(0, 50)}..."`);
      console.log(`     Volume: $${Number(volume).toFixed(2)}`);
      console.log(`     Liquidity: $${Number(liquidity).toFixed(2)}`);
      
      try {
        const raw = JSON.parse(String(raw_data));
        console.log(`     API Fields: volume=${raw.volume || 'N/A'}, liquidity=${raw.liquidity || 'N/A'}, open_interest=${raw.open_interest || 'N/A'}`);
        console.log(`     Status: ${raw.status}, Active: ${raw.can_close_early}`);
      } catch (e) {
        console.log(`     Raw data parse error: ${e}`);
      }
    });
    
    // 6. Recommendations
    console.log("\n💡 ANALYSIS & RECOMMENDATIONS:");
    const zeroPercent = Number(zero_vol) / Number(total) * 100;
    const avgNonZero = Number(avg_nonzero);
    
    if (zeroPercent > 95) {
      console.log("❌ ISSUE: 95%+ markets have zero volume - this suggests:");
      console.log("   1. Kalshi API may not provide volume data in public endpoints");
      console.log("   2. We may be looking at inactive/closed markets");
      console.log("   3. Volume calculation from liquidity proxy isn't working");
    } else if (avgNonZero < 50) {
      console.log("⚠️  WARNING: Average non-zero volume is very low");
      console.log("   - May indicate we're capturing low-activity markets");
      console.log("   - Consider filtering for active markets only");
    } else {
      console.log("✅ Volume data looks reasonable for active prediction markets");
    }
    
    console.log(`\n🔧 Suggested fixes:`);
    console.log(`   1. Verify Kalshi API endpoint includes active markets only`);
    console.log(`   2. Check if 'open_interest' field might be better volume proxy`);
    console.log(`   3. Consider using different volume calculation method`);
    console.log(`   4. Filter markets by status='active' and can_close_early=true`);
    
  } catch (error) {
    console.error("❌ Analysis failed:", error instanceof Error ? error.message : String(error));
  } finally {
    // Resources auto-cleanup
  }
}

analyzeKalshiVolumeIssue();