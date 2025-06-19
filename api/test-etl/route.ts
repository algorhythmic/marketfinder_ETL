// Test endpoint for ETL pipeline components

export async function POST(request: Request) {
  const { test } = await request.json();
  
  try {
    console.log(`Running ETL test: ${test}`);
    
    switch (test) {
      case 'fetchers':
        const { testFetchers } = await import('../etl-pipeline/fetchers');
        const fetchResults = await testFetchers();
        return Response.json({
          success: true,
          test: 'fetchers',
          results: {
            kalshiCount: fetchResults.kalshi.length,
            polymarketCount: fetchResults.polymarket.length,
            sampleKalshi: fetchResults.kalshi[0] || null,
            samplePolymarket: fetchResults.polymarket[0] || null,
          }
        });
        
      case 'transforms':
        const { testTransforms } = await import('../etl-pipeline/transforms');
        const transformResults = await testTransforms();
        return Response.json({
          success: true,
          test: 'transforms',
          results: {
            marketsCount: transformResults.markets.length,
            similaritiesCount: transformResults.similarities.length,
            opportunitiesCount: transformResults.opportunities.length,
            sampleMarket: transformResults.markets[0] || null,
            sampleSimilarity: transformResults.similarities[0] || null,
            sampleOpportunity: transformResults.opportunities[0] || null,
          }
        });
        
      case 'full-pipeline':
        // Test the complete pipeline with real data but limited scope
        const { testFetchers: testFetchersForPipeline } = await import('../etl-pipeline/fetchers');
        const [kalshiData, polymarketData] = await Promise.all([
          testFetchersForPipeline().then(r => r.kalshi.slice(0, 10)), // Limit to 10 markets
          testFetchersForPipeline().then(r => r.polymarket.slice(0, 10))
        ]);
        
        const duckdb = await import('duckdb');
        const db = await duckdb.Database.create(':memory:');
        const conn = await db.connect();
        
        try {
          const { loadRawDataIntoDuckDB, transformMarketsInDuckDB, detectSimilaritiesInDuckDB, calculateArbitrageInDuckDB } = await import('../etl-pipeline/transforms');
          
          await loadRawDataIntoDuckDB(conn, kalshiData, polymarketData);
          const markets = await transformMarketsInDuckDB(conn);
          const similarities = await detectSimilaritiesInDuckDB(conn, markets);
          const opportunities = await calculateArbitrageInDuckDB(conn, similarities);
          
          return Response.json({
            success: true,
            test: 'full-pipeline',
            results: {
              input: {
                kalshiMarkets: kalshiData.length,
                polymarketMarkets: polymarketData.length,
              },
              processing: {
                normalizedMarkets: markets.length,
                similarities: similarities.length,
                opportunities: opportunities.length,
              },
              samples: {
                market: markets[0] || null,
                similarity: similarities[0] || null,
                opportunity: opportunities[0] || null,
              }
            }
          });
          
        } finally {
          await conn.close();
          await db.close();
        }
        
      default:
        return Response.json({
          success: false,
          error: `Unknown test: ${test}`,
          availableTests: ['fetchers', 'transforms', 'full-pipeline']
        }, { status: 400 });
    }
    
  } catch (error) {
    console.error(`ETL test '${test}' failed:`, error);
    return Response.json({
      success: false,
      test,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({
    service: 'ETL Test Endpoint',
    availableTests: [
      {
        name: 'fetchers',
        description: 'Test data fetching from Kalshi and Polymarket APIs',
        method: 'POST',
        body: { test: 'fetchers' }
      },
      {
        name: 'transforms',
        description: 'Test DuckDB transformations with sample data',
        method: 'POST', 
        body: { test: 'transforms' }
      },
      {
        name: 'full-pipeline',
        description: 'Test complete ETL pipeline with limited real data',
        method: 'POST',
        body: { test: 'full-pipeline' }
      }
    ],
    usage: 'POST to this endpoint with {"test": "test-name"} to run specific tests'
  });
}