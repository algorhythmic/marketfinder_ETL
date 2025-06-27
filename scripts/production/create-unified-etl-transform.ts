// Create unified ETL transformation layer for Kalshi and Polymarket
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';

const KALSHI_DB = './data/kalshi-markets-efficient.db';
const POLYMARKET_DB = './data/marketfinder.db';
const UNIFIED_DB = './data/unified-markets-complete.db';

interface UnifiedMarket {
  id: string;                    // platform-external_id
  platform: string;             // 'kalshi' | 'polymarket'  
  external_id: string;          // ticker | id
  event_id?: string;            // event_ticker (Kalshi only)
  title: string;                // title | question
  description?: string;         // subtitle | description
  category: string;             // normalized categories
  
  // Pricing (normalized to 0-1)
  yes_price: number;           
  no_price: number;
  bid_price?: number;
  ask_price?: number;
  
  // Volume and liquidity
  volume: number;              // USD
  volume_24h?: number;         // USD
  liquidity: number;           // USD
  open_interest?: number;
  
  // Status and timing
  status: string;              // normalized status
  is_active: boolean;
  can_trade: boolean;
  close_time: string;          // ISO timestamp
  
  // Metadata
  last_updated: string;
  raw_platform_data?: any;
}

async function createUnifiedETLTransform(): Promise<void> {
  console.log("🔄 CREATING UNIFIED ETL TRANSFORMATION LAYER");
  console.log("=" .repeat(60));
  
  let unifiedInstance: DuckDBInstance | null = null;
  let unifiedConnection: DuckDBConnection | null = null;
  
  try {
    // Setup unified database
    unifiedInstance = await DuckDBInstance.create(UNIFIED_DB);
    unifiedConnection = await unifiedInstance.connect();
    
    await createUnifiedSchema(unifiedConnection);
    console.log("✅ Unified database schema created");
    
    // Transform and load Kalshi data
    console.log("\n📊 Transforming Kalshi Markets...");
    const kalshiStats = await transformKalshiMarkets(unifiedConnection);
    
    // Transform and load Polymarket data  
    console.log("\n📊 Transforming Polymarket Markets...");
    const polymarketStats = await transformPolymarketMarkets(unifiedConnection);
    
    // Create category mapping
    console.log("\n🏷️ Creating Category Mappings...");
    await createCategoryMappings(unifiedConnection);
    
    // Validate unified data
    console.log("\n✅ Validating Unified Data...");
    await validateUnifiedData(unifiedConnection, kalshiStats, polymarketStats);
    
    // Create arbitrage detection view
    console.log("\n⚖️ Creating Arbitrage Detection Views...");
    await createArbitrageViews(unifiedConnection);
    
    console.log("\n🎉 Unified ETL transformation completed successfully!");
    
  } catch (error) {
    console.error("❌ Unified ETL failed:", error instanceof Error ? error.message : String(error));
  } finally {
    console.log(`\n🧹 Unified database: ${UNIFIED_DB}`);
  }
}

async function createUnifiedSchema(connection: DuckDBConnection): Promise<void> {
  // Main unified markets table
  await connection.run(`
    CREATE TABLE IF NOT EXISTS unified_markets (
      id VARCHAR PRIMARY KEY,
      platform VARCHAR NOT NULL,
      external_id VARCHAR NOT NULL,
      event_id VARCHAR,
      
      -- Content
      title VARCHAR NOT NULL,
      description VARCHAR,
      category VARCHAR,
      
      -- Pricing (normalized 0-1)
      yes_price DOUBLE,
      no_price DOUBLE,
      bid_price DOUBLE,
      ask_price DOUBLE,
      spread DOUBLE,
      
      -- Volume and liquidity
      volume DOUBLE DEFAULT 0,
      volume_24h DOUBLE DEFAULT 0,
      liquidity DOUBLE DEFAULT 0,
      open_interest INTEGER DEFAULT 0,
      
      -- Status
      status VARCHAR,
      is_active BOOLEAN DEFAULT false,
      can_trade BOOLEAN DEFAULT false,
      
      -- Timing
      close_time TIMESTAMP,
      open_time TIMESTAMP,
      
      -- Metadata
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      transformation_version VARCHAR DEFAULT '1.0',
      
      -- Indexes for arbitrage detection
      title_normalized VARCHAR,
      title_hash VARCHAR
    )
  `);
  
  // Category mapping table
  await connection.run(`
    CREATE TABLE IF NOT EXISTS category_mappings (
      original_category VARCHAR,
      platform VARCHAR,
      unified_category VARCHAR,
      confidence DOUBLE DEFAULT 1.0,
      mapping_method VARCHAR
    )
  `);
  
  // Transformation log
  await connection.run(`
    CREATE TABLE IF NOT EXISTS transformation_log (
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      platform VARCHAR,
      operation VARCHAR,
      records_processed INTEGER,
      records_successful INTEGER,
      errors INTEGER,
      notes VARCHAR
    )
  `);
  
  // Arbitrage opportunities view
  await connection.run(`
    CREATE VIEW IF NOT EXISTS arbitrage_opportunities AS
    WITH market_pairs AS (
      SELECT 
        k.id as kalshi_id,
        k.title as kalshi_title,
        k.yes_price as kalshi_yes_price,
        k.volume as kalshi_volume,
        k.liquidity as kalshi_liquidity,
        p.id as polymarket_id,
        p.title as polymarket_title,
        p.yes_price as polymarket_yes_price,
        p.volume as polymarket_volume,
        p.liquidity as polymarket_liquidity,
        -- Similarity calculation (simplified)
        CASE 
          WHEN LENGTH(k.title_normalized) > 0 AND LENGTH(p.title_normalized) > 0 
          THEN 1.0 - (LEVENSHTEIN(k.title_normalized, p.title_normalized) * 1.0 / GREATEST(LENGTH(k.title_normalized), LENGTH(p.title_normalized)))
          ELSE 0.0 
        END as title_similarity
      FROM unified_markets k
      JOIN unified_markets p ON k.platform = 'kalshi' AND p.platform = 'polymarket'
      WHERE k.is_active = true AND p.is_active = true
        AND k.category = p.category
        AND k.yes_price IS NOT NULL AND p.yes_price IS NOT NULL
    )
    SELECT 
      kalshi_id,
      polymarket_id,
      kalshi_title,
      polymarket_title,
      title_similarity,
      kalshi_yes_price,
      polymarket_yes_price,
      ABS(kalshi_yes_price - polymarket_yes_price) as price_difference,
      ABS(kalshi_yes_price - polymarket_yes_price) * 0.95 as potential_profit,
      LEAST(kalshi_volume, polymarket_volume) as min_volume,
      LEAST(kalshi_liquidity, polymarket_liquidity) as min_liquidity
    FROM market_pairs
    WHERE title_similarity > 0.7
      AND ABS(kalshi_yes_price - polymarket_yes_price) > 0.05
      AND LEAST(kalshi_volume, polymarket_volume) > 100
    ORDER BY potential_profit DESC, title_similarity DESC
  `);
}

async function transformKalshiMarkets(connection: DuckDBConnection): Promise<any> {
  const kalshiInstance = await DuckDBInstance.create(KALSHI_DB);
  const kalshiConn = await kalshiInstance.connect();
  
  const result = await kalshiConn.run(`
    SELECT 
      ticker,
      event_ticker,
      title,
      category,
      volume,
      liquidity,
      open_interest,
      yes_price,
      no_price,
      status,
      is_active,
      close_time
    FROM kalshi_markets
    WHERE ticker IS NOT NULL
  `);
  
  const markets = await result.getRows();
  console.log(`   📊 Processing ${markets.length.toLocaleString()} Kalshi markets...`);
  
  let processed = 0;
  let errors = 0;
  
  for (const market of markets) {
    try {
      const [ticker, event_ticker, title, category, volume, liquidity, open_interest, 
             yes_price, no_price, status, is_active, close_time] = market;
      
      // Transform to unified format
      const unifiedMarket: UnifiedMarket = {
        id: `kalshi-${ticker}`,
        platform: 'kalshi',
        external_id: String(ticker),
        event_id: String(event_ticker),
        title: String(title),
        description: String(title || ''),
        category: normalizeCategory(String(category), 'kalshi'),
        
        // Prices already normalized in our Kalshi collection
        yes_price: Number(yes_price) || 0.5,
        no_price: Number(no_price) || 0.5,
        
        // Volume and liquidity
        volume: Number(volume) || 0,
        liquidity: Number(liquidity) || 0,
        open_interest: Number(open_interest) || 0,
        
        // Status
        status: String(status),
        is_active: Boolean(is_active),
        can_trade: Boolean(is_active), // Use is_active as proxy for can_trade
        close_time: String(close_time),
        
        last_updated: new Date().toISOString()
      };
      
      // Insert into unified table
      await insertUnifiedMarket(connection, unifiedMarket);
      processed++;
      
    } catch (error) {
      errors++;
      if (errors < 5) { // Show first few errors
        console.log(`     ❌ Error processing Kalshi market: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  
  console.log(`   ✅ Kalshi: ${processed.toLocaleString()} processed, ${errors} errors`);
  
  // Log transformation
  await connection.run(`
    INSERT INTO transformation_log (platform, operation, records_processed, records_successful, errors)
    VALUES ('kalshi', 'transform', ${markets.length}, ${processed}, ${errors})
  `);
  
  return { platform: 'kalshi', total: markets.length, processed, errors };
}

async function transformPolymarketMarkets(connection: DuckDBConnection): Promise<any> {
  const polyInstance = await DuckDBInstance.create(POLYMARKET_DB);
  const polyConn = await polyInstance.connect();
  
  const result = await polyConn.run(`
    SELECT 
      external_id,
      title,
      description,
      category,
      volume,
      liquidity,
      yes_price,
      no_price,
      end_date,
      CAST(raw_data AS VARCHAR) as raw_json
    FROM raw_markets
    WHERE platform = 'polymarket' AND external_id IS NOT NULL
  `);
  
  const markets = await result.getRows();
  console.log(`   📊 Processing ${markets.length.toLocaleString()} Polymarket markets...`);
  
  let processed = 0;
  let errors = 0;
  
  for (const market of markets) {
    try {
      const [external_id, title, description, category, volume, liquidity, yes_price, no_price, end_date, raw_json] = market;
      
      // Extract enhanced description from raw data if available
      let enhancedDescription = String(description || '');
      try {
        const rawData = JSON.parse(String(raw_json || '{}'));
        if (rawData.description && rawData.description.length > enhancedDescription.length) {
          enhancedDescription = rawData.description;
        }
      } catch (e) {
        // Use basic description if JSON parsing fails
      }

      // Transform to unified format
      const unifiedMarket: UnifiedMarket = {
        id: `polymarket-${external_id}`,
        platform: 'polymarket',
        external_id: String(external_id),
        title: String(title),
        description: enhancedDescription,
        category: normalizeCategory(String(category), 'polymarket'),
        
        // Polymarket prices are already in 0-1 format
        yes_price: Number(yes_price) || 0.5,
        no_price: Number(no_price) || 0.5,
        
        // Volume and liquidity
        volume: Number(volume) || 0,
        liquidity: Number(liquidity) || 0,
        
        // Status (simplified - assume active if we have data)
        status: 'active',
        is_active: true,
        can_trade: true,
        close_time: String(end_date),
        
        last_updated: new Date().toISOString()
      };
      
      // Insert into unified table
      await insertUnifiedMarket(connection, unifiedMarket);
      processed++;
      
    } catch (error) {
      errors++;
      if (errors < 5) { // Show first few errors
        console.log(`     ❌ Error processing Polymarket market: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  
  console.log(`   ✅ Polymarket: ${processed.toLocaleString()} processed, ${errors} errors`);
  
  // Log transformation
  await connection.run(`
    INSERT INTO transformation_log (platform, operation, records_processed, records_successful, errors)
    VALUES ('polymarket', 'transform', ${markets.length}, ${processed}, ${errors})
  `);
  
  return { platform: 'polymarket', total: markets.length, processed, errors };
}

async function insertUnifiedMarket(connection: DuckDBConnection, market: UnifiedMarket): Promise<void> {
  // Create normalized title for matching
  const titleNormalized = market.title.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Simple hash for faster matching
  const titleHash = titleNormalized.substring(0, 20);
  
  await connection.run(`
    INSERT OR REPLACE INTO unified_markets (
      id, platform, external_id, event_id, title, category,
      yes_price, no_price, volume, liquidity, open_interest,
      status, is_active, can_trade, close_time, last_updated,
      title_normalized, title_hash
    ) VALUES (
      '${market.id}', '${market.platform}', '${market.external_id}', 
      '${market.event_id || ''}', '${market.title.replace(/'/g, "''")}', '${market.category}',
      ${market.yes_price}, ${market.no_price}, ${market.volume}, ${market.liquidity}, ${market.open_interest || 0},
      '${market.status}', ${market.is_active}, ${market.can_trade}, '${market.close_time}', 
      '${market.last_updated}', '${titleNormalized.replace(/'/g, "''")}', '${titleHash}'
    )
  `);
}

function normalizeCategory(category: string, platform: string): string {
  const cat = category.toLowerCase().trim();
  
  // Unified category mapping
  const categoryMap: Record<string, string> = {
    // Politics
    'politics': 'politics',
    'elections': 'politics', 
    'world': 'politics',
    
    // Economics
    'economics': 'economics',
    'economic': 'economics',
    'finance': 'economics',
    
    // Sports
    'sports': 'sports',
    'sport': 'sports',
    
    // Technology
    'science and technology': 'technology',
    'technology': 'technology',
    'tech': 'technology',
    
    // Crypto
    'crypto': 'crypto',
    'cryptocurrency': 'crypto',
    
    // Entertainment
    'entertainment': 'entertainment',
    'culture': 'entertainment',
    
    // Climate
    'climate and weather': 'climate',
    'climate': 'climate',
    
    // Other
    'other': 'other'
  };
  
  return categoryMap[cat] || 'other';
}

async function createCategoryMappings(connection: DuckDBConnection): Promise<void> {
  // Get unique categories from both platforms
  const categoryResult = await connection.run(`
    SELECT platform, category, COUNT(*) as count
    FROM unified_markets
    GROUP BY platform, category
    ORDER BY platform, count DESC
  `);
  const categories = await categoryResult.getRows();
  
  console.log(`   📊 Category distribution:`);
  let currentPlatform = '';
  categories.forEach(row => {
    const [platform, category, count] = row;
    if (platform !== currentPlatform) {
      console.log(`\n     ${platform}:`);
      currentPlatform = String(platform);
    }
    console.log(`       ${category}: ${Number(count).toLocaleString()}`);
  });
}

async function validateUnifiedData(connection: DuckDBConnection, kalshiStats: any, polymarketStats: any): Promise<void> {
  // Overall statistics
  const statsResult = await connection.run(`
    SELECT 
      platform,
      COUNT(*) as total,
      COUNT(CASE WHEN is_active THEN 1 END) as active,
      AVG(volume) as avg_volume,
      AVG(yes_price) as avg_yes_price,
      COUNT(CASE WHEN yes_price BETWEEN 0.01 AND 0.99 THEN 1 END) as valid_prices
    FROM unified_markets
    GROUP BY platform
  `);
  const stats = await statsResult.getRows();
  
  console.log(`\n   📊 Unified Data Validation:`);
  stats.forEach(row => {
    const [platform, total, active, avg_vol, avg_yes, valid_prices] = row;
    const totalNum = Number(total);
    console.log(`\n     ${platform}:`);
    console.log(`       Total: ${totalNum.toLocaleString()}`);
    console.log(`       Active: ${Number(active).toLocaleString()} (${(Number(active)/totalNum*100).toFixed(1)}%)`);
    console.log(`       Avg Volume: $${Number(avg_vol).toFixed(2)}`);
    console.log(`       Avg Yes Price: ${Number(avg_yes).toFixed(3)}`);
    console.log(`       Valid Prices: ${Number(valid_prices)}/${totalNum} (${(Number(valid_prices)/totalNum*100).toFixed(1)}%)`);
  });
  
  // Cross-platform comparison
  const totalResult = await connection.run(`
    SELECT 
      COUNT(*) as total_markets,
      COUNT(CASE WHEN platform = 'kalshi' THEN 1 END) as kalshi_count,
      COUNT(CASE WHEN platform = 'polymarket' THEN 1 END) as polymarket_count,
      COUNT(DISTINCT category) as unique_categories
    FROM unified_markets
  `);
  const totals = await totalResult.getRows();
  const [total_markets, kalshi_count, polymarket_count, unique_categories] = totals[0];
  
  console.log(`\n   🎯 Unified Dataset Summary:`);
  console.log(`     Total Markets: ${Number(total_markets).toLocaleString()}`);
  console.log(`     Kalshi: ${Number(kalshi_count).toLocaleString()}`);
  console.log(`     Polymarket: ${Number(polymarket_count).toLocaleString()}`);
  console.log(`     Categories: ${Number(unique_categories)}`);
}

async function createArbitrageViews(connection: DuckDBConnection): Promise<void> {
  // Test arbitrage detection
  const arbitrageResult = await connection.run(`
    SELECT COUNT(*) as potential_opportunities
    FROM arbitrage_opportunities
    WHERE potential_profit > 0.05
  `);
  const opportunities = await arbitrageResult.getRows();
  const opportunityCount = Number(opportunities[0][0]);
  
  console.log(`   ⚖️ Potential arbitrage opportunities: ${opportunityCount.toLocaleString()}`);
  
  if (opportunityCount > 0) {
    // Show top opportunities
    const topResult = await connection.run(`
      SELECT kalshi_title, polymarket_title, price_difference, potential_profit, title_similarity
      FROM arbitrage_opportunities
      ORDER BY potential_profit DESC
      LIMIT 3
    `);
    const topOpportunities = await topResult.getRows();
    
    console.log(`\n   🔥 Top Arbitrage Opportunities:`);
    topOpportunities.forEach((row, i) => {
      const [kalshi_title, poly_title, price_diff, profit, similarity] = row;
      console.log(`     ${i+1}. Profit: ${(Number(profit)*100).toFixed(1)}% | Similarity: ${(Number(similarity)*100).toFixed(1)}%`);
      console.log(`        Kalshi: "${String(kalshi_title).substring(0, 40)}..."`);
      console.log(`        Polymarket: "${String(poly_title).substring(0, 40)}..."`);
    });
  }
}

createUnifiedETLTransform();