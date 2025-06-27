// DuckDB transformation logic for ETL pipeline

interface RawMarket {
  platform: string;
  external_id: string;
  title: string;
  description: string;
  category: string;
  yes_price: number;
  no_price: number;
  volume: number;
  liquidity: number;
  end_date: number;
  is_active: boolean;
  raw_data: string;
}

interface NormalizedMarket {
  platform: string;
  externalId: string;
  title: string;
  description: string;
  category: string;
  eventType: string;
  outcomes: Array<{ name: string; price: number }>;
  volume: number;
  liquidity: number;
  endDate: number;
  isActive: boolean;
  processedAt: number;
}

interface MarketSimilarity {
  market1Id: string;
  market2Id: string;
  platform1: string;
  platform2: string;
  confidence: number;
  reasoning: string;
  analyzedAt: number;
  llmModel: string;
}

interface ArbitrageOpportunity {
  similarityId?: string;
  buyMarketId: string;
  sellMarketId: string;
  buyPlatform: string;
  sellPlatform: string;
  profitMargin: number;
  confidence: number;
  detectedAt: number;
  status: string;
}

export async function loadRawDataIntoDuckDB(
  conn: any, 
  kalshiData: RawMarket[], 
  polymarketData: RawMarket[]
): Promise<void> {
  console.log("Loading raw data into DuckDB...");

  // Create tables for raw data
  await conn.run(`
    CREATE TABLE raw_kalshi (
      platform VARCHAR,
      external_id VARCHAR,
      title VARCHAR,
      description VARCHAR,
      category VARCHAR,
      yes_price DOUBLE,
      no_price DOUBLE,
      volume DOUBLE,
      liquidity DOUBLE,
      end_date BIGINT,
      is_active BOOLEAN,
      raw_data VARCHAR
    )
  `);

  await conn.run(`
    CREATE TABLE raw_polymarket (
      platform VARCHAR,
      external_id VARCHAR,
      title VARCHAR,
      description VARCHAR,
      category VARCHAR,
      yes_price DOUBLE,
      no_price DOUBLE,
      volume DOUBLE,
      liquidity DOUBLE,
      end_date BIGINT,
      is_active BOOLEAN,
      raw_data VARCHAR
    )
  `);

  // Insert data using DuckDB's JSON insertion capability
  if (kalshiData.length > 0) {
    console.log(`Inserting ${kalshiData.length} Kalshi markets`);
    for (const market of kalshiData) {
      await conn.run(`
        INSERT INTO raw_kalshi VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        market.platform,
        market.external_id,
        market.title,
        market.description,
        market.category,
        market.yes_price,
        market.no_price,
        market.volume,
        market.liquidity,
        market.end_date,
        market.is_active,
        market.raw_data
      ]);
    }
  }
  
  if (polymarketData.length > 0) {
    console.log(`Inserting ${polymarketData.length} Polymarket markets`);
    for (const market of polymarketData) {
      await conn.run(`
        INSERT INTO raw_polymarket VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        market.platform,
        market.external_id,
        market.title,
        market.description,
        market.category,
        market.yes_price,
        market.no_price,
        market.volume,
        market.liquidity,
        market.end_date,
        market.is_active,
        market.raw_data
      ]);
    }
  }

  console.log("Raw data loaded successfully");
}

export async function transformMarketsInDuckDB(conn: any): Promise<NormalizedMarket[]> {
  console.log("Transforming markets in DuckDB...");

  // Create unified markets table with standardized schema and quality checks
  await conn.run(`
    CREATE TABLE unified_markets AS
    SELECT 
      platform,
      external_id,
      title,
      description,
      category,
      'binary' as event_type,
      volume,
      liquidity,
      end_date,
      is_active,
      extract(epoch from now()) * 1000 as processed_at,
      yes_price,
      no_price,
      -- Data quality checks
      CASE WHEN 
        length(trim(title)) > 10 AND
        yes_price BETWEEN 0 AND 1 AND
        no_price BETWEEN 0 AND 1 AND
        abs(yes_price + no_price - 1.0) < 0.15 AND  -- Allow some tolerance for price discrepancies
        end_date > extract(epoch from now()) * 1000 AND
        volume >= 0 AND
        liquidity >= 0
      THEN true ELSE false END as quality_pass
    FROM (
      SELECT * FROM raw_kalshi
      UNION ALL
      SELECT * FROM raw_polymarket
    )
    WHERE is_active = true
  `);

  // Get quality statistics
  const qualityStats = await conn.query(`
    SELECT 
      COUNT(*) as total_markets,
      SUM(CASE WHEN quality_pass THEN 1 ELSE 0 END) as quality_pass_count,
      AVG(CASE WHEN quality_pass THEN 1.0 ELSE 0.0 END) as quality_pass_rate
    FROM unified_markets
  `);

  console.log("Quality stats:", qualityStats.toArray()[0]);

  // Return only high-quality markets with proper structure
  const result = await conn.query(`
    SELECT 
      platform,
      external_id as "externalId",
      title,
      description,
      category,
      event_type as "eventType",
      volume,
      liquidity,
      end_date as "endDate",
      is_active as "isActive",
      processed_at as "processedAt",
      yes_price,
      no_price
    FROM unified_markets 
    WHERE quality_pass = true
    ORDER BY volume DESC
  `);

  const markets = result.toArray();

  // Transform to include outcomes array
  const normalizedMarkets: NormalizedMarket[] = markets.map(market => ({
    platform: market.platform,
    externalId: market.externalId,
    title: market.title,
    description: market.description,
    category: market.category,
    eventType: market.eventType,
    outcomes: [
      { name: "Yes", price: market.yes_price },
      { name: "No", price: market.no_price }
    ],
    volume: market.volume,
    liquidity: market.liquidity,
    endDate: market.endDate,
    isActive: market.isActive,
    processedAt: market.processedAt,
  }));

  console.log(`Transformed ${normalizedMarkets.length} high-quality markets`);
  return normalizedMarkets;
}

export async function detectSimilaritiesInDuckDB(
  conn: any, 
  markets: NormalizedMarket[]
): Promise<MarketSimilarity[]> {
  console.log("Detecting market similarities in DuckDB...");

  if (markets.length === 0) {
    console.log("No markets to analyze");
    return [];
  }

  // Create market pairs table for cross-platform comparison
  await conn.run(`
    CREATE TABLE market_pairs AS
    SELECT 
      k.external_id as market1_id,
      p.external_id as market2_id,
      k.platform as platform1,
      p.platform as platform2,
      k.title as title1,
      p.title as title2,
      k.category,
      k.volume as volume1,
      p.volume as volume2,
      -- Basic text similarity scoring
      CASE 
        -- Exact title match (case insensitive)
        WHEN lower(trim(k.title)) = lower(trim(p.title)) THEN 0.95
        -- Very similar titles (Levenshtein distance)
        WHEN editdist3(lower(k.title), lower(p.title)) <= 3 THEN 0.9
        -- Common keywords in same category
        WHEN k.category = p.category AND (
          k.title ILIKE '%' || split_part(p.title, ' ', 1) || '%' OR
          k.title ILIKE '%' || split_part(p.title, ' ', 2) || '%'
        ) THEN 0.8
        -- Same category, recent markets
        WHEN k.category = p.category AND k.category != 'other' THEN 0.7
        ELSE 0.5
      END as confidence_score
    FROM unified_markets k
    CROSS JOIN unified_markets p
    WHERE k.platform = 'kalshi' 
      AND p.platform = 'polymarket'
      AND k.category = p.category  -- Only compare within same category
      AND k.external_id != p.external_id
  `);

  // Get high-confidence matches
  const result = await conn.query(`
    SELECT 
      market1_id as "market1Id",
      market2_id as "market2Id",
      platform1,
      platform2,
      confidence_score as confidence,
      CASE 
        WHEN confidence_score >= 0.9 THEN 'High text similarity detected'
        WHEN confidence_score >= 0.8 THEN 'Common keywords in same category'
        ELSE 'Same category match'
      END as reasoning,
      extract(epoch from now()) * 1000 as "analyzedAt",
      'duckdb-basic' as "llmModel"
    FROM market_pairs 
    WHERE confidence_score >= 0.7
    ORDER BY confidence_score DESC
    LIMIT 100
  `);

  const similarities = result.toArray() as MarketSimilarity[];
  console.log(`Found ${similarities.length} potential market similarities`);

  // Log some examples for debugging
  if (similarities.length > 0) {
    console.log("Top similarity example:", {
      confidence: similarities[0].confidence,
      reasoning: similarities[0].reasoning,
      platforms: `${similarities[0].platform1} <-> ${similarities[0].platform2}`
    });
  }

  return similarities;
}

export async function calculateArbitrageInDuckDB(
  conn: any, 
  similarities: MarketSimilarity[]
): Promise<ArbitrageOpportunity[]> {
  console.log("Calculating arbitrage opportunities in DuckDB...");

  if (similarities.length === 0) {
    console.log("No similarities to analyze for arbitrage");
    return [];
  }

  // Create arbitrage calculation table
  await conn.run(`
    CREATE TABLE arbitrage_calc AS
    SELECT 
      s.market1_id,
      s.market2_id,
      s.platform1,
      s.platform2,
      s.confidence,
      m1.yes_price as market1_yes_price,
      m1.no_price as market1_no_price,
      m2.yes_price as market2_yes_price,
      m2.no_price as market2_no_price,
      m1.volume as market1_volume,
      m2.volume as market2_volume,
      -- Calculate potential arbitrage
      GREATEST(
        -- Scenario 1: Buy Yes on market1, sell Yes on market2
        CASE WHEN m2.yes_price > m1.yes_price 
        THEN (m2.yes_price - m1.yes_price) / m1.yes_price 
        ELSE 0 END,
        -- Scenario 2: Buy No on market1, sell No on market2
        CASE WHEN m2.no_price > m1.no_price 
        THEN (m2.no_price - m1.no_price) / m1.no_price 
        ELSE 0 END,
        -- Scenario 3: Buy Yes on market2, sell Yes on market1
        CASE WHEN m1.yes_price > m2.yes_price 
        THEN (m1.yes_price - m2.yes_price) / m2.yes_price 
        ELSE 0 END,
        -- Scenario 4: Buy No on market2, sell No on market1
        CASE WHEN m1.no_price > m2.no_price 
        THEN (m1.no_price - m2.no_price) / m2.no_price 
        ELSE 0 END
      ) as profit_margin,
      -- Determine buy/sell markets
      CASE 
        WHEN m2.yes_price > m1.yes_price AND (m2.yes_price - m1.yes_price) / m1.yes_price = GREATEST(
          CASE WHEN m2.yes_price > m1.yes_price THEN (m2.yes_price - m1.yes_price) / m1.yes_price ELSE 0 END,
          CASE WHEN m2.no_price > m1.no_price THEN (m2.no_price - m1.no_price) / m1.no_price ELSE 0 END,
          CASE WHEN m1.yes_price > m2.yes_price THEN (m1.yes_price - m2.yes_price) / m2.yes_price ELSE 0 END,
          CASE WHEN m1.no_price > m2.no_price THEN (m1.no_price - m2.no_price) / m2.no_price ELSE 0 END
        ) THEN s.market1_id
        WHEN m1.yes_price > m2.yes_price AND (m1.yes_price - m2.yes_price) / m2.yes_price = GREATEST(
          CASE WHEN m2.yes_price > m1.yes_price THEN (m2.yes_price - m1.yes_price) / m1.yes_price ELSE 0 END,
          CASE WHEN m2.no_price > m1.no_price THEN (m2.no_price - m1.no_price) / m1.no_price ELSE 0 END,
          CASE WHEN m1.yes_price > m2.yes_price THEN (m1.yes_price - m2.yes_price) / m2.yes_price ELSE 0 END,
          CASE WHEN m1.no_price > m2.no_price THEN (m1.no_price - m2.no_price) / m2.no_price ELSE 0 END
        ) THEN s.market2_id
        ELSE s.market1_id
      END as buy_market_id,
      extract(epoch from now()) * 1000 as detected_at
    FROM (
      SELECT unnest($1::VARCHAR[]) as market1_id,
             unnest($2::VARCHAR[]) as market2_id,
             unnest($3::VARCHAR[]) as platform1,
             unnest($4::VARCHAR[]) as platform2,
             unnest($5::DOUBLE[]) as confidence
    ) s
    JOIN unified_markets m1 ON m1.external_id = s.market1_id
    JOIN unified_markets m2 ON m2.external_id = s.market2_id
  `, [
    similarities.map(s => s.market1Id),
    similarities.map(s => s.market2Id),
    similarities.map(s => s.platform1),
    similarities.map(s => s.platform2),
    similarities.map(s => s.confidence)
  ]);

  // Get profitable opportunities
  const result = await conn.query(`
    SELECT 
      buy_market_id as "buyMarketId",
      CASE WHEN buy_market_id = market1_id THEN market2_id ELSE market1_id END as "sellMarketId",
      CASE WHEN buy_market_id = market1_id THEN platform1 ELSE platform2 END as "buyPlatform",
      CASE WHEN buy_market_id = market1_id THEN platform2 ELSE platform1 END as "sellPlatform",
      profit_margin as "profitMargin",
      confidence,
      detected_at as "detectedAt",
      'active' as status
    FROM arbitrage_calc 
    WHERE profit_margin > 0.02  -- 2% minimum profit margin
    ORDER BY profit_margin DESC
    LIMIT 50
  `);

  const opportunities = result.toArray() as ArbitrageOpportunity[];
  console.log(`Found ${opportunities.length} arbitrage opportunities`);

  // Log top opportunity for debugging
  if (opportunities.length > 0) {
    console.log("Top arbitrage opportunity:", {
      profitMargin: (opportunities[0].profitMargin * 100).toFixed(2) + '%',
      buyPlatform: opportunities[0].buyPlatform,
      sellPlatform: opportunities[0].sellPlatform,
      confidence: opportunities[0].confidence
    });
  }

  return opportunities;
}

// Test function for development
export async function testTransforms() {
  console.log("Testing DuckDB transformations...");
  
  const duckdb = await import('duckdb');
  const db = await duckdb.Database.create(':memory:');
  const conn = await db.connect();

  try {
    // Create sample data
    const sampleKalshi = [{
      platform: 'kalshi',
      external_id: 'KALSHI-TEST-1',
      title: 'Will Bitcoin reach $100,000 by end of 2024?',
      description: 'Bitcoin price prediction',
      category: 'crypto',
      yes_price: 0.65,
      no_price: 0.35,
      volume: 10000,
      liquidity: 5000,
      end_date: Date.now() + 86400000, // Tomorrow
      is_active: true,
      raw_data: '{"test": true}'
    }];

    const samplePolymarket = [{
      platform: 'polymarket',
      external_id: 'POLY-TEST-1',
      title: 'Bitcoin to hit $100k by 2024?',
      description: 'Bitcoin price target',
      category: 'crypto',
      yes_price: 0.70,
      no_price: 0.30,
      volume: 8000,
      liquidity: 4000,
      end_date: Date.now() + 86400000,
      is_active: true,
      raw_data: '{"test": true}'
    }];

    await loadRawDataIntoDuckDB(conn, sampleKalshi, samplePolymarket);
    const markets = await transformMarketsInDuckDB(conn);
    const similarities = await detectSimilaritiesInDuckDB(conn, markets);
    const opportunities = await calculateArbitrageInDuckDB(conn, similarities);

    console.log("Transform test results:");
    console.log(`- Markets: ${markets.length}`);
    console.log(`- Similarities: ${similarities.length}`);
    console.log(`- Opportunities: ${opportunities.length}`);

    return { markets, similarities, opportunities };

  } finally {
    await conn.close();
    await db.close();
  }
}