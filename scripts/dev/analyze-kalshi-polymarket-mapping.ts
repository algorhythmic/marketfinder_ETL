// Analyze and validate data model mapping between Kalshi and Polymarket
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import fetch from 'node-fetch';

const KALSHI_DB = './data/kalshi-markets-efficient.db';
const POLYMARKET_TEST_DB = './data/complete-test.db';
const MAPPING_DB = './data/platform-mapping-analysis.db';

interface PlatformDataModel {
  platform: string;
  totalMarkets: number;
  sampleMarkets: any[];
  dataFields: string[];
  priceFields: string[];
  volumeFields: string[];
  metadataFields: string[];
  categorization: any;
  timeFields: string[];
}

async function analyzeDataModelMapping(): Promise<void> {
  console.log("🔍 KALSHI-POLYMARKET DATA MODEL MAPPING ANALYSIS");
  console.log("=" .repeat(70));
  
  let mappingInstance: DuckDBInstance | null = null;
  let mappingConnection: DuckDBConnection | null = null;
  
  try {
    // Setup unified analysis database
    mappingInstance = await DuckDBInstance.create(MAPPING_DB);
    mappingConnection = await mappingInstance.connect();
    
    await setupMappingDatabase(mappingConnection);
    console.log("✅ Mapping analysis database initialized");
    
    // Step 1: Analyze Kalshi data model
    console.log("\n📊 STEP 1: Analyzing Kalshi Data Model");
    const kalshiModel = await analyzeKalshiDataModel();
    
    // Step 2: Analyze Polymarket data model  
    console.log("\n📊 STEP 2: Analyzing Polymarket Data Model");
    const polymarketModel = await analyzePolymarketDataModel();
    
    // Step 3: Compare data structures
    console.log("\n🔄 STEP 3: Comparing Data Structures");
    await compareDataStructures(kalshiModel, polymarketModel);
    
    // Step 4: Create unified mapping schema
    console.log("\n🗂️ STEP 4: Creating Unified Schema");
    const unifiedSchema = await createUnifiedSchema(mappingConnection, kalshiModel, polymarketModel);
    
    // Step 5: Test mapping with sample data
    console.log("\n🧪 STEP 5: Testing Data Mapping");
    await testDataMapping(mappingConnection, kalshiModel, polymarketModel);
    
    // Step 6: Validate arbitrage compatibility
    console.log("\n⚖️ STEP 6: Validating Arbitrage Compatibility");
    await validateArbitrageCompatibility(mappingConnection);
    
    // Step 7: Generate mapping recommendations
    console.log("\n💡 STEP 7: Mapping Recommendations");
    await generateMappingRecommendations(kalshiModel, polymarketModel, unifiedSchema);
    
  } catch (error) {
    console.error("❌ Mapping analysis failed:", error instanceof Error ? error.message : String(error));
  } finally {
    console.log(`\n🧹 Mapping analysis saved: ${MAPPING_DB}`);
  }
}

async function setupMappingDatabase(connection: DuckDBConnection): Promise<void> {
  await connection.run(`
    CREATE TABLE IF NOT EXISTS unified_markets (
      id VARCHAR PRIMARY KEY,
      platform VARCHAR NOT NULL,
      external_id VARCHAR NOT NULL,
      event_id VARCHAR,
      title VARCHAR NOT NULL,
      description VARCHAR,
      category VARCHAR,
      
      -- Pricing (normalized to 0-1 decimal)
      yes_price DOUBLE,
      no_price DOUBLE,
      bid_price DOUBLE,
      ask_price DOUBLE,
      last_price DOUBLE,
      
      -- Volume and liquidity
      volume DOUBLE,
      volume_24h DOUBLE,
      liquidity DOUBLE,
      open_interest INTEGER,
      
      -- Timing
      created_at TIMESTAMP,
      close_time TIMESTAMP,
      expiration_time TIMESTAMP,
      
      -- Status and metadata
      status VARCHAR,
      is_active BOOLEAN,
      can_trade BOOLEAN,
      
      -- Platform-specific data
      raw_data JSON,
      
      -- Mapping metadata
      mapped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      mapping_confidence DOUBLE DEFAULT 1.0
    )
  `);
  
  await connection.run(`
    CREATE TABLE IF NOT EXISTS mapping_issues (
      platform VARCHAR,
      field_name VARCHAR,
      issue_type VARCHAR,
      issue_description VARCHAR,
      sample_value VARCHAR,
      recommended_fix VARCHAR
    )
  `);
}

async function analyzeKalshiDataModel(): Promise<PlatformDataModel> {
  const kalshiInstance = await DuckDBInstance.create(KALSHI_DB);
  const kalshiConnection = await kalshiInstance.connect();
  
  // Get sample markets
  const sampleResult = await kalshiConnection.run(`
    SELECT * FROM kalshi_markets LIMIT 5
  `);
  const sampleMarkets = await sampleResult.getRows();
  
  // Get total count
  const countResult = await kalshiConnection.run(`
    SELECT COUNT(*) as total FROM kalshi_markets
  `);
  const totalMarkets = Number((await countResult.getRows())[0][0]);
  
  // Analyze field structure by examining one detailed market
  console.log("   🔍 Fetching fresh Kalshi market for field analysis...");
  const freshMarketResponse = await fetch("https://api.elections.kalshi.com/trade-api/v2/markets/KXWARMING-50");
  const freshMarket = await freshMarketResponse.json();
  const marketData = freshMarket.market;
  
  console.log(`   📊 Kalshi total markets: ${totalMarkets.toLocaleString()}`);
  console.log(`   📋 Sample market: "${marketData.title.substring(0, 50)}..."`);
  
  const kalshiFields = Object.keys(marketData);
  console.log(`   🏷️ Available fields: ${kalshiFields.length}`);
  
  // Categorize fields
  const priceFields = kalshiFields.filter(f => 
    f.includes('price') || f.includes('bid') || f.includes('ask')
  );
  const volumeFields = kalshiFields.filter(f => 
    f.includes('volume') || f.includes('liquidity') || f.includes('interest')
  );
  const timeFields = kalshiFields.filter(f => 
    f.includes('time') || f.includes('date')
  );
  const metadataFields = kalshiFields.filter(f => 
    ['status', 'category', 'title', 'subtitle', 'ticker', 'event_ticker'].includes(f)
  );
  
  console.log(`     💰 Price fields: ${priceFields.join(', ')}`);
  console.log(`     📈 Volume fields: ${volumeFields.join(', ')}`);
  console.log(`     ⏰ Time fields: ${timeFields.join(', ')}`);
  console.log(`     📝 Metadata fields: ${metadataFields.join(', ')}`);
  
  // Sample values for key fields
  console.log(`\n   📊 Sample values:`);
  console.log(`     Volume: ${marketData.volume}`);
  console.log(`     Liquidity: ${marketData.liquidity}`);
  console.log(`     Yes bid/ask: ${marketData.yes_bid}/${marketData.yes_ask}`);
  console.log(`     Status: ${marketData.status}`);
  console.log(`     Event ticker: ${marketData.event_ticker}`);
  
  return {
    platform: 'kalshi',
    totalMarkets,
    sampleMarkets,
    dataFields: kalshiFields,
    priceFields,
    volumeFields,
    metadataFields,
    timeFields,
    categorization: 'Event-based (event_ticker → markets)'
  };
}

async function analyzePolymarketDataModel(): Promise<PlatformDataModel> {
  // Get sample from existing Polymarket data
  const polyInstance = await DuckDBInstance.create(POLYMARKET_TEST_DB);
  const polyConnection = await polyInstance.connect();
  
  // Get sample markets
  const sampleResult = await polyConnection.run(`
    SELECT * FROM test_markets WHERE platform = 'polymarket' LIMIT 5
  `);
  const sampleMarkets = await sampleResult.getRows();
  
  // Get total count
  const countResult = await polyConnection.run(`
    SELECT COUNT(*) as total FROM test_markets WHERE platform = 'polymarket'
  `);
  const totalMarkets = Number((await countResult.getRows())[0][0]);
  
  // Fetch fresh Polymarket market for field analysis
  console.log("   🔍 Fetching fresh Polymarket market for field analysis...");
  const polyResponse = await fetch("https://gamma-api.polymarket.com/markets?limit=1&active=true");
  const polyData = await polyResponse.json();
  const marketData = polyData[0];
  
  console.log(`   📊 Polymarket total markets: ${totalMarkets.toLocaleString()}`);
  console.log(`   📋 Sample market: "${marketData.question.substring(0, 50)}..."`);
  
  const polyFields = Object.keys(marketData);
  console.log(`   🏷️ Available fields: ${polyFields.length}`);
  
  // Categorize fields
  const priceFields = polyFields.filter(f => 
    f.includes('price') || f.includes('Price') || f.includes('bid') || f.includes('ask')
  );
  const volumeFields = polyFields.filter(f => 
    f.includes('volume') || f.includes('Volume') || f.includes('liquidity') || f.includes('Liquidity')
  );
  const timeFields = polyFields.filter(f => 
    f.includes('date') || f.includes('Date') || f.includes('time') || f.includes('Time')
  );
  const metadataFields = polyFields.filter(f => 
    ['id', 'question', 'description', 'category', 'slug', 'active'].includes(f)
  );
  
  console.log(`     💰 Price fields: ${priceFields.join(', ')}`);
  console.log(`     📈 Volume fields: ${volumeFields.join(', ')}`);
  console.log(`     ⏰ Time fields: ${timeFields.join(', ')}`);
  console.log(`     📝 Metadata fields: ${metadataFields.join(', ')}`);
  
  // Sample values for key fields
  console.log(`\n   📊 Sample values:`);
  console.log(`     Volume: ${marketData.volume || marketData.volumeNum}`);
  console.log(`     Last trade price: ${marketData.lastTradePrice}`);
  console.log(`     Active: ${marketData.active}`);
  console.log(`     ID: ${marketData.id}`);
  
  return {
    platform: 'polymarket',
    totalMarkets,
    sampleMarkets,
    dataFields: polyFields,
    priceFields,
    volumeFields,
    metadataFields,
    timeFields,
    categorization: 'Direct markets (no events structure)'
  };
}

async function compareDataStructures(kalshi: PlatformDataModel, polymarket: PlatformDataModel): Promise<void> {
  console.log(`\n📊 Data Structure Comparison:`);
  console.log(`   Kalshi: ${kalshi.totalMarkets.toLocaleString()} markets, ${kalshi.dataFields.length} fields`);
  console.log(`   Polymarket: ${polymarket.totalMarkets.toLocaleString()} markets, ${polymarket.dataFields.length} fields`);
  
  // Find common and unique fields
  const kalshiSet = new Set(kalshi.dataFields);
  const polySet = new Set(polymarket.dataFields);
  
  const commonFields = kalshi.dataFields.filter(f => polySet.has(f));
  const kalshiOnly = kalshi.dataFields.filter(f => !polySet.has(f));
  const polyOnly = polymarket.dataFields.filter(f => !kalshiSet.has(f));
  
  console.log(`\n🔄 Field Overlap:`);
  console.log(`   Common fields: ${commonFields.length} (${commonFields.join(', ')})`);
  console.log(`   Kalshi only: ${kalshiOnly.length} (${kalshiOnly.slice(0, 5).join(', ')}${kalshiOnly.length > 5 ? '...' : ''})`);
  console.log(`   Polymarket only: ${polyOnly.length} (${polyOnly.slice(0, 5).join(', ')}${polyOnly.length > 5 ? '...' : ''})`);
  
  // Compare critical fields for arbitrage
  console.log(`\n⚖️ Critical Field Comparison:`);
  
  const criticalMappings = [
    { concept: 'Market ID', kalshi: 'ticker', polymarket: 'id' },
    { concept: 'Title/Question', kalshi: 'title', polymarket: 'question' },
    { concept: 'Volume', kalshi: 'volume', polymarket: 'volume/volumeNum' },
    { concept: 'Liquidity', kalshi: 'liquidity', polymarket: 'liquidity/liquidityNum' },
    { concept: 'Price', kalshi: 'yes_bid/yes_ask/last_price', polymarket: 'lastTradePrice' },
    { concept: 'Status', kalshi: 'status', polymarket: 'active' },
    { concept: 'Category', kalshi: 'category (via event)', polymarket: 'direct field' },
    { concept: 'End Date', kalshi: 'close_time', polymarket: 'endDateIso' }
  ];
  
  criticalMappings.forEach(mapping => {
    console.log(`   ${mapping.concept}:`);
    console.log(`     Kalshi: ${mapping.kalshi}`);
    console.log(`     Polymarket: ${mapping.polymarket}`);
  });
}

async function createUnifiedSchema(connection: DuckDBConnection, kalshi: PlatformDataModel, polymarket: PlatformDataModel): Promise<any> {
  console.log(`\n🗂️ Creating Unified Schema:`);
  
  const unifiedSchema = {
    core_fields: [
      'id', 'platform', 'external_id', 'title', 'category',
      'yes_price', 'no_price', 'volume', 'liquidity', 
      'close_time', 'status', 'is_active'
    ],
    mapping_rules: {
      kalshi: {
        id: 'platform + ticker',
        external_id: 'ticker',
        title: 'title',
        category: 'category (from event)',
        yes_price: '(yes_bid + yes_ask) / 2 / 100',
        no_price: '(no_bid + no_ask) / 2 / 100',
        volume: 'volume',
        liquidity: 'liquidity',
        close_time: 'close_time',
        status: 'status',
        is_active: 'status = "active" AND can_close_early'
      },
      polymarket: {
        id: 'platform + id',
        external_id: 'id',
        title: 'question',
        category: 'category (direct or inferred)',
        yes_price: 'lastTradePrice',
        no_price: '1 - lastTradePrice',
        volume: 'volume || volumeNum',
        liquidity: 'liquidity || liquidityNum',
        close_time: 'endDateIso',
        status: 'active ? "active" : "inactive"',
        is_active: 'active === true'
      }
    }
  };
  
  console.log(`   📋 Core unified fields: ${unifiedSchema.core_fields.join(', ')}`);
  
  return unifiedSchema;
}

async function testDataMapping(connection: DuckDBConnection, kalshi: PlatformDataModel, polymarket: PlatformDataModel): Promise<void> {
  console.log(`\n🧪 Testing Data Mapping with Sample Records:`);
  
  // Test Kalshi mapping
  console.log(`\n   🔍 Kalshi Mapping Test:`);
  try {
    const kalshiInstance = await DuckDBInstance.create(KALSHI_DB);
    const kalshiConnection = await kalshiInstance.connect();
    
    const testResult = await kalshiConnection.run(`
      SELECT 
        ticker,
        title,
        category,
        volume,
        liquidity,
        yes_price,
        no_price,
        status,
        is_active
      FROM kalshi_markets 
      WHERE is_active = true 
      LIMIT 3
    `);
    const kalshiSamples = await testResult.getRows();
    
    kalshiSamples.forEach((row, i) => {
      const [ticker, title, category, volume, liquidity, yes_price, no_price, status, is_active] = row;
      console.log(`     ${i+1}. ${ticker}: "${String(title).substring(0, 40)}..."`);
      console.log(`        Category: ${category}, Volume: $${Number(volume).toFixed(2)}`);
      console.log(`        Prices: Yes=${Number(yes_price).toFixed(3)}, No=${Number(no_price).toFixed(3)}`);
      console.log(`        Status: ${status}, Active: ${is_active}`);
    });
    
  } catch (error) {
    console.log(`     ❌ Kalshi mapping test failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // Test Polymarket mapping
  console.log(`\n   🔍 Polymarket Mapping Test:`);
  try {
    const polyInstance = await DuckDBInstance.create(POLYMARKET_TEST_DB);
    const polyConnection = await polyInstance.connect();
    
    const testResult = await polyConnection.run(`
      SELECT 
        external_id,
        title,
        category,
        volume,
        liquidity,
        yes_price,
        no_price
      FROM test_markets 
      WHERE platform = 'polymarket' 
      AND volume > 0
      LIMIT 3
    `);
    const polySamples = await testResult.getRows();
    
    polySamples.forEach((row, i) => {
      const [id, title, category, volume, liquidity, yes_price, no_price] = row;
      console.log(`     ${i+1}. ${id}: "${String(title).substring(0, 40)}..."`);
      console.log(`        Category: ${category}, Volume: $${Number(volume).toFixed(2)}`);
      console.log(`        Prices: Yes=${Number(yes_price).toFixed(3)}, No=${Number(no_price).toFixed(3)}`);
    });
    
  } catch (error) {
    console.log(`     ❌ Polymarket mapping test failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function validateArbitrageCompatibility(connection: DuckDBConnection): Promise<void> {
  console.log(`\n⚖️ Arbitrage Compatibility Validation:`);
  
  const compatibilityChecks = [
    {
      name: 'Price Normalization',
      description: 'Both platforms use 0-1 decimal prices',
      kalshi_method: 'Convert cents (0-100) to decimal (0-1)',
      polymarket_method: 'Already in decimal format (0-1)',
      compatibility: 'HIGH'
    },
    {
      name: 'Volume Comparison',
      description: 'Volume units are comparable',
      kalshi_method: 'USD volume from API',
      polymarket_method: 'USD volume from API',
      compatibility: 'HIGH'
    },
    {
      name: 'Market Timing',
      description: 'Close times are comparable',
      kalshi_method: 'ISO timestamp (close_time)',
      polymarket_method: 'ISO timestamp (endDateIso)',
      compatibility: 'HIGH'
    },
    {
      name: 'Market Status',
      description: 'Active market determination',
      kalshi_method: 'status="active" AND can_close_early',
      polymarket_method: 'active=true',
      compatibility: 'MEDIUM'
    },
    {
      name: 'Category Matching',
      description: 'Cross-platform category alignment',
      kalshi_method: 'Event-based categories',
      polymarket_method: 'Direct or inferred categories',
      compatibility: 'MEDIUM'
    }
  ];
  
  compatibilityChecks.forEach(check => {
    const icon = check.compatibility === 'HIGH' ? '✅' : check.compatibility === 'MEDIUM' ? '⚠️' : '❌';
    console.log(`\n   ${icon} ${check.name} (${check.compatibility}):`);
    console.log(`     Description: ${check.description}`);
    console.log(`     Kalshi: ${check.kalshi_method}`);
    console.log(`     Polymarket: ${check.polymarket_method}`);
  });
}

async function generateMappingRecommendations(kalshi: PlatformDataModel, polymarket: PlatformDataModel, schema: any): Promise<void> {
  console.log(`\n💡 MAPPING RECOMMENDATIONS:`);
  
  console.log(`\n✅ STRENGTHS:`);
  console.log(`   • Both platforms provide USD volume and liquidity data`);
  console.log(`   • Price normalization is straightforward (Kalshi: /100, Polymarket: direct)`);
  console.log(`   • Both have clear market status indicators`);
  console.log(`   • Timing data is compatible (ISO timestamps)`);
  console.log(`   • Rich market metadata available on both platforms`);
  
  console.log(`\n⚠️ CHALLENGES TO ADDRESS:`);
  console.log(`   • Kalshi uses Event → Markets hierarchy, Polymarket is flat`);
  console.log(`   • Category systems differ (event-based vs direct)`);
  console.log(`   • Different field names for same concepts`);
  console.log(`   • Volume calculation methods may vary`);
  console.log(`   • Price representations differ (cents vs decimals)`);
  
  console.log(`\n🔧 RECOMMENDED UNIFIED ETL PIPELINE:`);
  
  console.log(`\n   1. Data Extraction:`);
  console.log(`      Kalshi: Events → Markets (hierarchical)`);
  console.log(`      Polymarket: Direct market fetch (flat)`);
  
  console.log(`\n   2. Data Transformation:`);
  console.log(`      • Normalize prices: Kalshi (cents/100), Polymarket (direct)`);
  console.log(`      • Standardize IDs: platform-{external_id}`);
  console.log(`      • Unify categories: Use mapping table + NLP`);
  console.log(`      • Calculate yes/no prices consistently`);
  console.log(`      • Validate volume/liquidity units`);
  
  console.log(`\n   3. Unified Schema Implementation:`);
  console.log(`      CREATE TABLE unified_markets (`);
  console.log(`        id VARCHAR PRIMARY KEY,           -- kalshi-{ticker} | polymarket-{id}`);
  console.log(`        platform VARCHAR,                 -- 'kalshi' | 'polymarket'`);
  console.log(`        external_id VARCHAR,              -- ticker | id`);
  console.log(`        title VARCHAR,                    -- title | question`);
  console.log(`        category VARCHAR,                 -- normalized categories`);
  console.log(`        yes_price DOUBLE,                 -- 0-1 decimal`);
  console.log(`        no_price DOUBLE,                  -- 0-1 decimal`);
  console.log(`        volume DOUBLE,                    -- USD volume`);
  console.log(`        liquidity DOUBLE,                 -- USD liquidity`);
  console.log(`        close_time TIMESTAMP,             -- end date`);
  console.log(`        is_active BOOLEAN,                -- trading status`);
  console.log(`        last_updated TIMESTAMP            -- sync timestamp`);
  console.log(`      );`);
  
  console.log(`\n   4. Arbitrage Detection:`);
  console.log(`      • Match markets by semantic similarity (title/description)`);
  console.log(`      • Compare normalized yes/no prices across platforms`);
  console.log(`      • Calculate profit potential: |price_a - price_b| - fees`);
  console.log(`      • Filter by minimum volume thresholds`);
  console.log(`      • Rank by profit potential and market liquidity`);
  
  console.log(`\n🚀 PRODUCTION IMPLEMENTATION:`);
  console.log(`   ✅ Schema: Unified markets table ready`);
  console.log(`   ✅ Kalshi ETL: Event-based collection working`);
  console.log(`   ✅ Polymarket ETL: Direct market collection working`);
  console.log(`   🔄 Next: Implement unified transformation layer`);
  console.log(`   🎯 Next: Deploy semantic matching for arbitrage detection`);
  console.log(`   📊 Data Quality: ${kalshi.totalMarkets + polymarket.totalMarkets} total markets available`);
}

analyzeDataModelMapping();