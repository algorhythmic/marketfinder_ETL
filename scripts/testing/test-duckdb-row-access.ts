// Test different ways to access DuckDB row data
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';

const DB_PATH = './data/marketfinder.db';

async function testRowAccess(): Promise<void> {
  console.log("🧪 Testing DuckDB row access patterns...\n");
  
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  try {
    instance = await DuckDBInstance.create(DB_PATH);
    connection = await instance.connect();
    
    // Test the verification query
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
    
    console.log("🔍 Raw verification data:");
    console.log("Type:", typeof verifyData);
    console.log("Length:", verifyData.length);
    console.log("Full data:", verifyData);
    
    console.log("\n📊 Testing different access patterns:");
    
    verifyData.forEach((row, index) => {
      console.log(`\nRow ${index}:`);
      console.log("  Raw row:", row);
      console.log("  Type:", typeof row);
      console.log("  Is Array:", Array.isArray(row));
      console.log("  Length:", row?.length);
      
      if (Array.isArray(row)) {
        console.log("  Array access:");
        console.log("    row[0]:", row[0], typeof row[0]);
        console.log("    row[1]:", row[1], typeof row[1]);
        console.log("    row[2]:", row[2], typeof row[2]);
        console.log("    row[3]:", row[3], typeof row[3]);
        console.log("    row[4]:", row[4], typeof row[4]);
        
        console.log("  Destructuring test:");
        try {
          const [platform, count, categories, avg_volume, high_volume_count] = row;
          console.log("    platform:", platform);
          console.log("    count:", count, "->", Number(count));
          console.log("    categories:", categories, "->", Number(categories));
          console.log("    avg_volume:", avg_volume, "->", Number(avg_volume));
          console.log("    high_volume_count:", high_volume_count, "->", Number(high_volume_count));
        } catch (e) {
          console.log("    Destructuring failed:", e instanceof Error ? e.message : String(e));
        }
      }
      
      // Test object property access
      console.log("  Object access:");
      console.log("    row.platform:", (row as any).platform);
      console.log("    row.count:", (row as any).count);
    });
    
    // Test category query too
    console.log("\n🏷️ Testing category query:");
    const categoryResult = await connection.run(`
      SELECT category, COUNT(*) as count 
      FROM raw_markets 
      GROUP BY category 
      ORDER BY count DESC
      LIMIT 3
    `);
    const categoryData = await categoryResult.getRows();
    
    console.log("Category data:", categoryData);
    categoryData.forEach((row, index) => {
      console.log(`Category row ${index}:`, row);
      if (Array.isArray(row)) {
        const [category, count] = row;
        console.log(`  ${category}: ${Number(count)} markets`);
      }
    });
    
  } catch (error) {
    console.error("❌ Test failed:", error instanceof Error ? error.message : String(error));
  } finally {
    // Resources auto-cleanup
  }
}

testRowAccess();