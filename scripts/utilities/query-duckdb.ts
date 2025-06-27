// Query local DuckDB for analysis
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';

const DB_PATH = './data/marketfinder.db';

async function queryDatabase(connection: DuckDBConnection, query: string, description: string): Promise<any[]> {
  console.log(`\n🔍 ${description}`);
  console.log(`Query: ${query}`);
  
  try {
    const result = await connection.run(query);
    const rows = await result.getRows();
    
    console.log(`✅ Results (${rows.length} rows):`);
    rows.forEach((row, i) => {
      if (i < 10) { // Show max 10 rows
        // Convert BigInt values to strings for JSON serialization
        const serializable = Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key, 
            typeof value === 'bigint' ? value.toString() : value
          ])
        );
        console.log(`   ${JSON.stringify(serializable)}`);
      }
    });
    if (rows.length > 10) {
      console.log(`   ... and ${rows.length - 10} more rows`);
    }
    return rows;
  } catch (error) {
    console.error(`❌ Query failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function analyzeDuckDB(): Promise<void> {
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  try {
    console.log("🦆 Analyzing local DuckDB data...");
    
    // Connect to database
    instance = await DuckDBInstance.create(DB_PATH);
    connection = await instance.connect();
    
    // Basic stats
    await queryDatabase(connection, `
      SELECT 
        platform,
        COUNT(*) as market_count,
        AVG(yes_price) as avg_yes_price,
        AVG(volume) as avg_volume,
        MIN(start_date) as earliest_date,
        MAX(start_date) as latest_date
      FROM raw_markets 
      GROUP BY platform
    `, "Platform Statistics");
    
    // Category breakdown
    await queryDatabase(connection, `
      SELECT 
        category,
        COUNT(*) as count,
        AVG(yes_price) as avg_price
      FROM raw_markets 
      GROUP BY category 
      ORDER BY count DESC
    `, "Category Breakdown");
    
    // Recent high-volume markets
    await queryDatabase(connection, `
      SELECT 
        title,
        platform,
        yes_price,
        volume,
        start_date
      FROM raw_markets 
      WHERE volume > 100
      ORDER BY volume DESC 
      LIMIT 10
    `, "High Volume Markets");
    
    // Fetch run history
    await queryDatabase(connection, `
      SELECT 
        run_id,
        platform,
        started_at,
        completed_at,
        total_markets,
        batches_processed,
        status
      FROM fetch_runs 
      ORDER BY started_at DESC
    `, "Fetch Run History");
    
    // Potential arbitrage detection (simple price comparison)
    await queryDatabase(connection, `
      SELECT 
        k.title as kalshi_title,
        p.title as polymarket_title,
        k.yes_price as kalshi_price,
        p.yes_price as polymarket_price,
        ABS(k.yes_price - p.yes_price) as price_diff
      FROM raw_markets k
      JOIN raw_markets p ON LOWER(k.title) LIKE '%' || LOWER(SPLIT_PART(p.title, ' ', 1)) || '%'
      WHERE k.platform = 'kalshi' 
        AND p.platform = 'polymarket'
        AND ABS(k.yes_price - p.yes_price) > 0.1
      ORDER BY price_diff DESC
      LIMIT 5
    `, "Potential Arbitrage Opportunities");
    
    // Market count by date (pagination analysis)
    await queryDatabase(connection, `
      SELECT 
        DATE(start_date) as market_date,
        COUNT(*) as markets_created,
        AVG(volume) as avg_volume
      FROM raw_markets 
      WHERE start_date IS NOT NULL
      GROUP BY DATE(start_date)
      ORDER BY market_date DESC
      LIMIT 10
    `, "Markets by Date (Pagination Analysis)");
    
    console.log("\n✅ DuckDB analysis complete!");
    
  } catch (error) {
    console.error("❌ Analysis failed:", error instanceof Error ? error.message : String(error));
  } finally {
    // Resources auto-cleanup on process exit
    // connection.close() and instance.close() not available in this version
  }
}

// Run analysis
analyzeDuckDB();