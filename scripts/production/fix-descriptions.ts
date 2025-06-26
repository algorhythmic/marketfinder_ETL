// Fix descriptions in unified database by copying from raw data
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';

const UNIFIED_DB = './data/unified-markets-complete.db';
const RAW_DB = './data/marketfinder.db';

async function fixDescriptions(): Promise<void> {
  console.log("🔧 FIXING DESCRIPTIONS IN UNIFIED DATABASE");
  console.log("==========================================");
  
  let unifiedInstance: DuckDBInstance | null = null;
  let unifiedConnection: DuckDBConnection | null = null;
  let rawInstance: DuckDBInstance | null = null;
  let rawConnection: DuckDBConnection | null = null;
  
  try {
    // Open both databases
    unifiedInstance = await DuckDBInstance.create(UNIFIED_DB);
    unifiedConnection = await unifiedInstance.connect();
    
    rawInstance = await DuckDBInstance.create(RAW_DB);
    rawConnection = await rawInstance.connect();
    
    // Get all raw market descriptions
    console.log("📊 Loading raw market descriptions...");
    const rawResult = await rawConnection.run(`
      SELECT external_id, description 
      FROM raw_markets 
      WHERE platform = 'polymarket' AND description IS NOT NULL
    `);
    const rawMarkets = await rawResult.getRows();
    
    console.log(`   Found ${rawMarkets.length.toLocaleString()} Polymarket descriptions`);
    
    // Update unified database
    console.log("📝 Updating unified database descriptions...");
    let updated = 0;
    
    for (const [external_id, description] of rawMarkets) {
      try {
        await unifiedConnection.run(`
          UPDATE unified_markets 
          SET description = '${String(description).replace(/'/g, "''")}'
          WHERE id = 'polymarket-${external_id}'
        `);
        updated++;
        
        if (updated % 10000 === 0) {
          console.log(`   Updated ${updated.toLocaleString()} descriptions...`);
        }
      } catch (error) {
        // Skip problematic descriptions
      }
    }
    
    console.log(`✅ Updated ${updated.toLocaleString()} Polymarket descriptions`);
    
    // Verify results
    const checkResult = await unifiedConnection.run(`
      SELECT 
        platform,
        COUNT(*) as total,
        COUNT(CASE WHEN description IS NOT NULL AND LENGTH(description) > 50 THEN 1 END) as with_rich_desc,
        AVG(LENGTH(description)) as avg_length
      FROM unified_markets 
      GROUP BY platform
    `);
    const results = await checkResult.getRows();
    
    console.log("\n📊 FINAL DESCRIPTION STATUS:");
    results.forEach(([platform, total, with_desc, avg_len]) => {
      console.log(`  ${platform}: ${Number(with_desc).toLocaleString()}/${Number(total).toLocaleString()} markets with rich descriptions (avg: ${Number(avg_len).toFixed(0)} chars)`);
    });
    
    console.log("\n🎉 Description fix completed!");
    
  } catch (error) {
    console.error("❌ Description fix failed:", error instanceof Error ? error.message : String(error));
  }
}

fixDescriptions();