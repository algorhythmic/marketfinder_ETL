import { ConvexHttpClient } from "convex/browser";
import { fetchKalshiMarkets, fetchPolymarketMarkets } from './fetchers';
import { 
  loadRawDataIntoDuckDB, 
  transformMarketsInDuckDB, 
  detectSimilaritiesInDuckDB, 
  calculateArbitrageInDuckDB 
} from './transforms';

const ETL_VERSION = "1.0.0";

export async function POST() {
  const runId = `etl-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const startTime = Date.now();
  
  console.log(`Starting ETL pipeline run: ${runId}`);
  
  try {
    // 1. EXTRACT: Fetch from both platforms
    console.log("Step 1: Extracting data from APIs...");
    const [kalshiData, polymarketData] = await Promise.all([
      fetchKalshiMarkets(),
      fetchPolymarketMarkets(500) // Fetch up to 500 markets (5 batches) for production balance
    ]);

    console.log(`Fetched ${kalshiData.length} Kalshi + ${polymarketData.length} Polymarket markets`);

    // 2. TRANSFORM: Load into DuckDB for processing
    console.log("Step 2: Loading data into DuckDB...");
    const duckdb = await import('duckdb');
    const db = await duckdb.Database.create(':memory:');
    const conn = await db.connect();

    try {
      // Load raw data into DuckDB tables
      await loadRawDataIntoDuckDB(conn, kalshiData, polymarketData);
      
      // Transform and normalize data
      console.log("Step 3: Transforming and normalizing data...");
      const unifiedMarkets = await transformMarketsInDuckDB(conn);
      console.log(`Normalized ${unifiedMarkets.length} markets`);
      
      // Detect market similarities using basic text matching (LLM optional)
      console.log("Step 4: Detecting market similarities...");
      const similarities = await detectSimilaritiesInDuckDB(conn, unifiedMarkets);
      console.log(`Found ${similarities.length} potential similarities`);
      
      // Calculate arbitrage opportunities
      console.log("Step 5: Calculating arbitrage opportunities...");
      const opportunities = await calculateArbitrageInDuckDB(conn, similarities);
      console.log(`Detected ${opportunities.length} arbitrage opportunities`);

      // 3. LOAD: Store clean data in Convex
      console.log("Step 6: Loading data into Convex...");
      const convex = new ConvexHttpClient(process.env.CONVEX_URL!);
      
      // Import the API dynamically to avoid module resolution issues
      const { api } = await import("../../convex/_generated/api.js");
      
      // Store all data in parallel
      const [marketResult, similarityResult, opportunityResult] = await Promise.all([
        convex.mutation(api.etl.upsertMarkets, { 
          markets: unifiedMarkets.map(m => ({
            ...m,
            etlVersion: ETL_VERSION
          }))
        }),
        convex.mutation(api.etl.upsertSimilarities, { similarities }),
        convex.mutation(api.etl.upsertOpportunities, { 
          opportunities: opportunities.map(o => ({
            ...o,
            etlVersion: ETL_VERSION
          }))
        })
      ]);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Log ETL run
      await convex.mutation(api.etl.logEtlRun, {
        runId,
        status: "success",
        marketsProcessed: unifiedMarkets.length,
        similaritiesGenerated: similarities.length,
        opportunitiesFound: opportunities.length,
        startTime,
        endTime,
        duration,
        etlVersion: ETL_VERSION,
        kalshiMarketsCount: kalshiData.length,
        polymarketMarketsCount: polymarketData.length,
      });

      console.log(`ETL pipeline completed successfully in ${duration}ms`);

      return Response.json({ 
        success: true,
        runId,
        duration,
        metrics: {
          kalshiMarkets: kalshiData.length,
          polymarketMarkets: polymarketData.length,
          processedMarkets: unifiedMarkets.length,
          similarities: similarities.length,
          opportunities: opportunities.length,
          convexResults: {
            markets: marketResult,
            similarities: similarityResult,
            opportunities: opportunityResult,
          }
        }
      });

    } finally {
      // Clean up DuckDB connection
      await conn.close();
      await db.close();
    }

  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.error("ETL pipeline failed:", error);

    // Log failed run
    try {
      const convex = new ConvexHttpClient(process.env.CONVEX_URL!);
      const { api } = await import("../../convex/_generated/api.js");
      await convex.mutation(api.etl.logEtlRun, {
        runId,
        status: "error",
        marketsProcessed: 0,
        similaritiesGenerated: 0,
        opportunitiesFound: 0,
        startTime,
        endTime,
        duration,
        errors: [error instanceof Error ? error.message : String(error)],
        etlVersion: ETL_VERSION,
        kalshiMarketsCount: 0,
        polymarketMarketsCount: 0,
      });
    } catch (logError) {
      console.error("Failed to log ETL error:", logError);
    }

    return Response.json({ 
      success: false,
      error: error instanceof Error ? error.message : String(error),
      runId,
      duration
    }, { status: 500 });
  }
}

// Health check endpoint
export async function GET() {
  return Response.json({ 
    status: "healthy", 
    service: "etl-pipeline",
    version: ETL_VERSION,
    timestamp: new Date().toISOString()
  });
}