// Verify current database state with proper formatting
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';

const DB_PATH = './data/marketfinder.db';

async function verifyCurrentDatabase(): Promise<void> {
  console.log("📊 Database Verification Report");
  console.log("=".repeat(50));
  
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  try {
    instance = await DuckDBInstance.create(DB_PATH);
    connection = await instance.connect();
    
    // Basic count
    const totalResult = await connection.run("SELECT COUNT(*) FROM raw_markets");
    const totalData = await totalResult.getRows();
    const totalCount = Number(totalData[0][0]);
    console.log(`\n📈 Total Markets: ${totalCount.toLocaleString()}`);
    
    // Platform breakdown with proper destructuring
    const verifyResult = await connection.run(`
      SELECT 
        platform, 
        COUNT(*) as count,
        COUNT(DISTINCT category) as categories,
        AVG(volume) as avg_volume,
        SUM(CASE WHEN volume > 1000 THEN 1 ELSE 0 END) as high_volume_count
      FROM raw_markets 
      GROUP BY platform
    `);
    const verifyData = await verifyResult.getRows();
    
    console.log("\n🔍 Platform Breakdown:");
    verifyData.forEach(row => {
      // Properly destructure the array
      const [platform, count, categories, avg_volume, high_volume_count] = row;
      console.log(`\n   ${platform}:`);
      console.log(`     📊 Markets: ${Number(count).toLocaleString()}`);
      console.log(`     🏷️  Categories: ${Number(categories)}`);
      console.log(`     💰 Avg Volume: $${Number(avg_volume).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
      console.log(`     🔥 High Volume (>$1K): ${Number(high_volume_count).toLocaleString()}`);
    });
    
    // Category distribution
    const categoryResult = await connection.run(`
      SELECT category, COUNT(*) as count 
      FROM raw_markets 
      GROUP BY category 
      ORDER BY count DESC
      LIMIT 10
    `);
    const categoryData = await categoryResult.getRows();
    
    console.log("\n📈 Top Categories:");
    categoryData.forEach(row => {
      const [category, count] = row;
      console.log(`   ${category}: ${Number(count).toLocaleString()} markets`);
    });
    
    // Sample recent markets
    const sampleResult = await connection.run(`
      SELECT platform, title, yes_price, volume, category
      FROM raw_markets 
      ORDER BY RANDOM()
      LIMIT 5
    `);
    const sampleData = await sampleResult.getRows();
    
    console.log("\n📋 Sample Markets:");
    sampleData.forEach((row, i) => {
      const [platform, title, yes_price, volume, category] = row;
      console.log(`   ${i+1}. [${platform}] "${String(title).substring(0, 40)}..."`);
      console.log(`      Price: ${Number(yes_price).toFixed(3)}, Volume: $${Number(volume).toFixed(0)}, Category: ${category}`);
    });
    
    // Data quality check
    const qualityResult = await connection.run(`
      SELECT 
        platform,
        COUNT(*) as total,
        SUM(CASE WHEN yes_price > 0 AND yes_price < 1 THEN 1 ELSE 0 END) as valid_prices,
        SUM(CASE WHEN volume > 0 THEN 1 ELSE 0 END) as has_volume,
        SUM(CASE WHEN liquidity > 0 THEN 1 ELSE 0 END) as has_liquidity
      FROM raw_markets 
      GROUP BY platform
    `);
    const qualityData = await qualityResult.getRows();
    
    console.log("\n🔍 Data Quality:");
    qualityData.forEach(row => {
      const [platform, total, valid_prices, has_volume, has_liquidity] = row;
      console.log(`\n   ${platform}:`);
      console.log(`     📊 Total: ${Number(total).toLocaleString()}`);
      console.log(`     💰 Valid Prices: ${Number(valid_prices).toLocaleString()} (${(Number(valid_prices)/Number(total)*100).toFixed(1)}%)`);
      console.log(`     📈 Has Volume: ${Number(has_volume).toLocaleString()} (${(Number(has_volume)/Number(total)*100).toFixed(1)}%)`);
      console.log(`     💧 Has Liquidity: ${Number(has_liquidity).toLocaleString()} (${(Number(has_liquidity)/Number(total)*100).toFixed(1)}%)`);
    });
    
    console.log("\n✅ Database verification completed successfully!");
    
  } catch (error) {
    console.error("❌ Verification failed:", error instanceof Error ? error.message : String(error));
  } finally {
    // Resources auto-cleanup
  }
}

verifyCurrentDatabase();