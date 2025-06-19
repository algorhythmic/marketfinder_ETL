// Simple test endpoint for just testing data fetching without Convex

export async function POST(request: Request) {
  try {
    console.log("Testing data fetchers only (no Convex)...");
    
    // Import fetching functions
    const { fetchKalshiMarkets, fetchPolymarketMarkets } = await import('../etl-pipeline/fetchers');
    
    // Test fetching from both platforms
    console.log("Fetching from Kalshi...");
    const kalshiData = await fetchKalshiMarkets();
    console.log(`✅ Kalshi: ${kalshiData.length} markets fetched`);
    
    console.log("Fetching from Polymarket...");
    const polymarketData = await fetchPolymarketMarkets();
    console.log(`✅ Polymarket: ${polymarketData.length} markets fetched`);
    
    // Test DuckDB transformations
    console.log("Testing DuckDB transformations...");
    const duckdb = await import('duckdb');
    const db = await duckdb.Database.create(':memory:');
    const conn = await db.connect();
    
    try {
      const { 
        loadRawDataIntoDuckDB, 
        transformMarketsInDuckDB, 
        detectSimilaritiesInDuckDB, 
        calculateArbitrageInDuckDB 
      } = await import('../etl-pipeline/transforms');
      
      // Load data into DuckDB
      await loadRawDataIntoDuckDB(conn, kalshiData.slice(0, 20), polymarketData.slice(0, 20));
      console.log("✅ Data loaded into DuckDB");
      
      // Transform markets
      const markets = await transformMarketsInDuckDB(conn);
      console.log(`✅ Transformed ${markets.length} markets`);
      
      // Detect similarities
      const similarities = await detectSimilaritiesInDuckDB(conn, markets);
      console.log(`✅ Found ${similarities.length} market similarities`);
      
      // Calculate arbitrage
      const opportunities = await calculateArbitrageInDuckDB(conn, similarities);
      console.log(`✅ Detected ${opportunities.length} arbitrage opportunities`);
      
      return Response.json({
        success: true,
        test: "fetchers-and-transforms",
        results: {
          rawData: {
            kalshiMarkets: kalshiData.length,
            polymarketMarkets: polymarketData.length,
          },
          processed: {
            normalizedMarkets: markets.length,
            similarities: similarities.length,
            opportunities: opportunities.length,
          },
          samples: {
            kalshiMarket: kalshiData[0] ? {
              title: kalshiData[0].title,
              category: kalshiData[0].category,
              prices: { yes: kalshiData[0].yes_price, no: kalshiData[0].no_price }
            } : null,
            polymarketMarket: polymarketData[0] ? {
              title: polymarketData[0].title,
              category: polymarketData[0].category,
              prices: { yes: polymarketData[0].yes_price, no: polymarketData[0].no_price }
            } : null,
            normalizedMarket: markets[0] || null,
            similarity: similarities[0] ? {
              confidence: similarities[0].confidence,
              reasoning: similarities[0].reasoning,
              platforms: `${similarities[0].platform1} <-> ${similarities[0].platform2}`
            } : null,
            opportunity: opportunities[0] ? {
              profitMargin: (opportunities[0].profitMargin * 100).toFixed(2) + '%',
              buyPlatform: opportunities[0].buyPlatform,
              sellPlatform: opportunities[0].sellPlatform,
              confidence: opportunities[0].confidence
            } : null,
          },
          categoryBreakdown: {
            kalshi: getCategoryBreakdown(kalshiData),
            polymarket: getCategoryBreakdown(polymarketData),
          }
        }
      });
      
    } finally {
      await conn.close();
      await db.close();
    }
    
  } catch (error) {
    console.error("Test failed:", error);
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}

function getCategoryBreakdown(markets: any[]) {
  const categories = {};
  for (const market of markets) {
    categories[market.category] = (categories[market.category] || 0) + 1;
  }
  return categories;
}

export async function GET() {
  return Response.json({
    service: "Fetchers and Transforms Test",
    description: "Tests data fetching from APIs and DuckDB transformations without Convex dependencies",
    usage: "POST to run the test",
    endpoints: ["Kalshi API", "Polymarket API", "DuckDB processing"]
  });
}