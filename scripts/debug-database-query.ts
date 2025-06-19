// Debug database verification query issues
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';

const DB_PATH = './data/marketfinder.db';

async function debugDatabaseQuery(): Promise<void> {
  console.log("🔍 Debugging database verification queries...\n");
  
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  try {
    instance = await DuckDBInstance.create(DB_PATH);
    connection = await instance.connect();
    
    // Test basic count
    console.log("📊 Testing basic queries:");
    const countResult = await connection.run("SELECT COUNT(*) as total FROM raw_markets");
    const countData = await countResult.getRows();
    console.log(`  Total rows: ${countData[0]?.total || 0}`);
    
    // Test platform breakdown
    console.log("\\n📈 Testing platform breakdown:");
    const platformResult = await connection.run("SELECT platform, COUNT(*) as count FROM raw_markets GROUP BY platform");
    const platformData = await platformResult.getRows();
    console.log("  Platform data:", platformData);
    
    // Test the exact verification query
    console.log("\\n🔎 Testing exact verification query:");
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
    console.log("  Verify data raw:", verifyData);
    
    // Process the data like the script does
    console.log("\\n📋 Processing like the script:");
    verifyData.forEach(row => {
      console.log(`   Raw row:`, row);
      console.log(`   Platform: ${row.platform}`);
      console.log(`   Count: ${Number(row.count)}`);
      console.log(`   Categories: ${Number(row.categories)}`);
      console.log(`   Avg Volume: ${Number(row.avg_volume)}`);
      console.log(`   High Volume: ${Number(row.high_volume_count)}`);
      console.log('');
    });
    
    // Test sample data
    console.log("📋 Sample data:");
    const sampleResult = await connection.run("SELECT * FROM raw_markets LIMIT 3");
    const sampleData = await sampleResult.getRows();
    sampleData.forEach((row, i) => {
      console.log(`  Row ${i+1}:`, {
        id: row.id,
        platform: row.platform,
        title: row.title?.substring(0, 30) + '...',
        volume: row.volume
      });
    });
    
  } catch (error) {
    console.error("❌ Debug failed:", error instanceof Error ? error.message : String(error));
  } finally {
    // Resources auto-cleanup
  }
}

debugDatabaseQuery();