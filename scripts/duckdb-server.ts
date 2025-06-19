// Simple HTTP server to expose DuckDB for external tools like DBeaver
import { DuckDBInstance } from '@duckdb/node-api';
import express from 'express';
import cors from 'cors';

const DB_PATH = './data/marketfinder.db';
const PORT = 8080;

interface QueryRequest {
  query: string;
}

interface QueryResponse {
  success: boolean;
  data?: any[];
  error?: string;
  rowCount?: number;
  executionTime?: number;
}

async function createDuckDBServer(): Promise<void> {
  const app = express();
  
  // Middleware
  app.use(cors());
  app.use(express.json());
  
  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', database: DB_PATH, timestamp: new Date().toISOString() });
  });
  
  // Database info
  app.get('/info', async (req, res) => {
    try {
      const instance = await DuckDBInstance.create(DB_PATH);
      const connection = await instance.connect();
      
      // Get table list
      const tablesResult = await connection.run("SHOW TABLES");
      const tables = await tablesResult.getRows();
      
      // Get row counts
      const tableCounts: Record<string, number> = {};
      for (const table of tables) {
        const tableName = Object.values(table)[0] as string;
        const countResult = await connection.run(`SELECT COUNT(*) as count FROM ${tableName}`);
        const count = (await countResult.getRows())[0]?.count;
        tableCounts[tableName] = Number(count || 0);
      }
      
      res.json({
        database: DB_PATH,
        tables: tableCounts,
        totalTables: tables.length
      });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Execute query
  app.post('/query', async (req, res) => {
    const { query }: QueryRequest = req.body;
    
    if (!query) {
      return res.status(400).json({ 
        success: false, 
        error: 'Query is required' 
      } as QueryResponse);
    }
    
    const startTime = Date.now();
    
    try {
      const instance = await DuckDBInstance.create(DB_PATH);
      const connection = await instance.connect();
      
      const result = await connection.run(query);
      const rows = await result.getRows();
      
      const executionTime = Date.now() - startTime;
      
      // Convert BigInt values for JSON serialization
      const serializedRows = rows.map(row => 
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key, 
            typeof value === 'bigint' ? value.toString() : value
          ])
        )
      );
      
      res.json({
        success: true,
        data: serializedRows,
        rowCount: rows.length,
        executionTime
      } as QueryResponse);
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      } as QueryResponse);
    }
  });
  
  // Get schema for a table
  app.get('/schema/:tableName', async (req, res) => {
    const { tableName } = req.params;
    
    try {
      const instance = await DuckDBInstance.create(DB_PATH);
      const connection = await instance.connect();
      
      const result = await connection.run(`DESCRIBE ${tableName}`);
      const schema = await result.getRows();
      
      res.json({ table: tableName, schema });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Start server
  app.listen(PORT, () => {
    console.log(`🦆 DuckDB HTTP Server running on http://localhost:${PORT}`);
    console.log(`📊 Database: ${DB_PATH}`);
    console.log(`\n📋 Available endpoints:`);
    console.log(`   GET  /health          - Server health check`);
    console.log(`   GET  /info            - Database information`);
    console.log(`   POST /query           - Execute SQL query`);
    console.log(`   GET  /schema/:table   - Get table schema`);
    console.log(`\n🔗 Example usage:`);
    console.log(`   curl -X POST http://localhost:${PORT}/query \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '{"query": "SELECT COUNT(*) FROM raw_markets"}'`);
  });
}

createDuckDBServer().catch(console.error);