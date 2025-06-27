// Setup persistent local DuckDB instance for testing
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import { promises as fs } from 'fs';
import path from 'path';

const DB_PATH = './data/marketfinder.db';
const DATA_DIR = './data';

async function setupLocalDuckDB(): Promise<void> {
  try {
    console.log("🦆 Setting up persistent DuckDB instance...");
    
    // Ensure data directory exists
    await fs.mkdir(DATA_DIR, { recursive: true });
    console.log(`✅ Data directory created: ${DATA_DIR}`);
    
    // Create/connect to persistent database
    const instance = await DuckDBInstance.create(DB_PATH);
    const connection = await instance.connect();
    
    console.log(`✅ Connected to DuckDB at: ${DB_PATH}`);
    
    // Create schema for market data
    await connection.run(`
      CREATE TABLE IF NOT EXISTS raw_markets (
        id VARCHAR PRIMARY KEY,
        platform VARCHAR NOT NULL,
        external_id VARCHAR NOT NULL,
        title VARCHAR NOT NULL,
        description TEXT,
        category VARCHAR,
        yes_price DECIMAL,
        no_price DECIMAL,
        volume DECIMAL,
        liquidity DECIMAL,
        end_date TIMESTAMP,
        is_active BOOLEAN,
        start_date TIMESTAMP,
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        raw_data JSON
      )
    `);
    
    // Create pagination tracking table
    await connection.run(`
      CREATE TABLE IF NOT EXISTS fetch_runs (
        run_id VARCHAR PRIMARY KEY,
        platform VARCHAR NOT NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        total_markets INTEGER,
        batches_processed INTEGER,
        max_offset INTEGER,
        status VARCHAR DEFAULT 'running',
        error_message TEXT
      )
    `);
    
    // Create market similarities table
    await connection.run(`
      CREATE TABLE IF NOT EXISTS market_similarities (
        id VARCHAR PRIMARY KEY,
        kalshi_id VARCHAR,
        polymarket_id VARCHAR,
        confidence DECIMAL,
        similarity_type VARCHAR,
        detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Show current table status
    const tablesResult = await connection.run("SHOW TABLES");
    const tables = await tablesResult.getRows();
    
    console.log("\n📊 Database Schema:");
    tables.forEach(row => {
      console.log(`   - ${Object.values(row)[0]}`); // Use first column value
    });
    
    // Show existing data counts
    const marketCountResult = await connection.run("SELECT COUNT(*) as count FROM raw_markets");
    const marketCount = (await marketCountResult.getRows())[0]?.count || 0;
    
    const runCountResult = await connection.run("SELECT COUNT(*) as count FROM fetch_runs");
    const runCount = (await runCountResult.getRows())[0]?.count || 0;
    
    console.log("\n📈 Current Data:");
    console.log(`   Markets: ${marketCount}`);
    console.log(`   Fetch runs: ${runCount}`);
    
    // Note: connections and instances auto-cleanup on process exit
    // connection.close() and instance.close() methods don't exist in this version
    
    console.log("\n✅ Local DuckDB setup complete!");
    console.log(`   Database file: ${path.resolve(DB_PATH)}`);
    console.log("   Ready for pagination testing!");
    
  } catch (error) {
    console.error("❌ Setup failed:", error instanceof Error ? error.message : String(error));
  }
}

setupLocalDuckDB();