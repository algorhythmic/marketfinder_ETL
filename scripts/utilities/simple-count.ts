// Simple count query to verify data persistence
import { DuckDBInstance } from '@duckdb/node-api';

async function simpleCount(): Promise<void> {
  try {
    console.log("🔍 Checking data persistence...");
    
    const instance = await DuckDBInstance.create('./data/marketfinder.db');
    const connection = await instance.connect();
    
    // Simple count
    const result = await connection.run("SELECT COUNT(*) as count FROM raw_markets");
    const rows = await result.getRows();
    const count = rows[0]?.count;
    
    console.log(`📊 Markets in database: ${count}`);
    
    if (Number(count) > 0) {
      // Get a sample row
      const sampleResult = await connection.run("SELECT title, platform, yes_price FROM raw_markets LIMIT 1");
      const sampleRows = await sampleResult.getRows();
      if (sampleRows.length > 0) {
        const sample = sampleRows[0];
        console.log(`📝 Sample market: "${sample.title}" (${sample.platform}) - $${sample.yes_price}`);
      }
      
      // Get run info
      const runResult = await connection.run("SELECT * FROM fetch_runs ORDER BY started_at DESC LIMIT 1");
      const runRows = await runResult.getRows();
      if (runRows.length > 0) {
        const run = runRows[0];
        console.log(`⚡ Latest run: ${run.run_id} - ${Number(run.total_markets)} markets, ${run.status}`);
      }
      
      console.log("✅ Data persistence confirmed!");
    } else {
      console.log("❌ No data found in database");
    }
    
  } catch (error) {
    console.error("❌ Count failed:", error instanceof Error ? error.message : String(error));
  }
}

simpleCount();