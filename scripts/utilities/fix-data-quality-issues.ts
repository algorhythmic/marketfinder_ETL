// Fix identified data quality issues
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';

const DB_PATH = './data/marketfinder.db';

async function fixDataQualityIssues(): Promise<void> {
  console.log("🔧 FIXING DATA QUALITY ISSUES");
  console.log("=".repeat(50));
  
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  try {
    instance = await DuckDBInstance.create(DB_PATH);
    connection = await instance.connect();
    
    // 1. Fix Kalshi price scaling issue (prices in cents, not decimals)
    console.log("\n💰 Fixing Kalshi price scaling...");
    await fixKalshiPriceScaling(connection);
    
    // 2. Fix Polymarket category classification
    console.log("\n🏷️ Fixing Polymarket category classification...");
    await fixPolymarketCategories(connection);
    
    // 3. Fix Kalshi volume calculation (use liquidity proxy properly)
    console.log("\n📈 Fixing Kalshi volume calculation...");
    await fixKalshiVolumeCalculation(connection);
    
    // 4. Fix Polymarket no_price calculation
    console.log("\n🔢 Fixing Polymarket no_price calculation...");
    await fixPolymarketNoPrices(connection);
    
    // 5. Validate fixes
    console.log("\n✅ Validating fixes...");
    await validateFixes(connection);
    
    console.log("\n🎉 Data quality fixes completed!");
    
  } catch (error) {
    console.error("❌ Fix failed:", error instanceof Error ? error.message : String(error));
  } finally {
    // Resources auto-cleanup
  }
}

async function fixKalshiPriceScaling(connection: DuckDBConnection): Promise<void> {
  // Kalshi prices are in cents (0-100), need to convert to decimals (0-1)
  const updateResult = await connection.run(`
    UPDATE raw_markets 
    SET 
      yes_price = CASE 
        WHEN yes_price > 1.0 THEN yes_price / 100.0 
        ELSE yes_price 
      END,
      no_price = CASE 
        WHEN no_price > 1.0 THEN no_price / 100.0 
        ELSE no_price 
      END
    WHERE platform = 'kalshi' 
      AND (yes_price > 1.0 OR no_price > 1.0)
  `);
  
  console.log(`   ✅ Updated Kalshi price scaling`);
  
  // Fix no_price calculation for Kalshi (should be 1 - yes_price)
  await connection.run(`
    UPDATE raw_markets 
    SET no_price = 1.0 - yes_price
    WHERE platform = 'kalshi' 
      AND ABS((yes_price + no_price) - 1.0) > 0.01
  `);
  
  console.log(`   ✅ Fixed Kalshi no_price calculations`);
}

async function fixPolymarketCategories(connection: DuckDBConnection): Promise<void> {
  // Improve Polymarket category classification using title analysis
  const categoryMappings = [
    { pattern: 'trump|biden|election|president|senate|congress|democrat|republican|nominee|nomination|campaign', category: 'politics' },
    { pattern: 'bitcoin|btc|ethereum|eth|crypto|blockchain|token|coin|defi', category: 'crypto' },
    { pattern: 'nfl|nba|mlb|nhl|soccer|football|basketball|baseball|hockey|sport|championship|world cup|olympics', category: 'sports' },
    { pattern: 'ai|artificial intelligence|openai|chatgpt|tech|technology|apple|google|microsoft|tesla|meta', category: 'technology' },
    { pattern: 'economy|economic|gdp|inflation|recession|fed|federal reserve|stock|market|dow|nasdaq|s&p', category: 'economics' },
    { pattern: 'climate|temperature|weather|global warming|carbon|emission|environment', category: 'climate' },
    { pattern: 'health|medicine|covid|pandemic|disease|vaccine|medical|hospital|drug', category: 'health' },
    { pattern: 'movie|film|music|celebrity|entertainment|oscar|grammy|tv|show|series', category: 'culture' }
  ];
  
  let totalUpdated = 0;
  
  for (const mapping of categoryMappings) {
    const result = await connection.run(`
      UPDATE raw_markets 
      SET category = '${mapping.category}'
      WHERE platform = 'polymarket' 
        AND category = 'other'
        AND (
          LOWER(title) ~ '${mapping.pattern}' OR 
          LOWER(description) ~ '${mapping.pattern}'
        )
    `);
    
    // Count affected rows (DuckDB doesn't return affected count directly)
    const countResult = await connection.run(`
      SELECT COUNT(*) as count 
      FROM raw_markets 
      WHERE platform = 'polymarket' 
        AND category = '${mapping.category}'
    `);
    const count = await countResult.getRows();
    const categoryCount = Number(count[0][0]);
    
    console.log(`   ✅ Categorized ${categoryCount} markets as '${mapping.category}'`);
    totalUpdated += categoryCount;
  }
  
  console.log(`   📊 Total Polymarket markets recategorized: ${totalUpdated}`);
}

async function fixKalshiVolumeCalculation(connection: DuckDBConnection): Promise<void> {
  // Fix volume calculation for Kalshi - use liquidity/1000 as proxy, but also populate actual volume when available
  await connection.run(`
    UPDATE raw_markets 
    SET volume = CASE 
      WHEN volume = 0 AND liquidity > 0 THEN liquidity / 1000.0
      ELSE volume
    END
    WHERE platform = 'kalshi'
  `);
  
  console.log(`   ✅ Fixed Kalshi volume calculation using liquidity proxy`);
  
  // Also ensure liquidity values are properly extracted
  const liquidityResult = await connection.run(`
    SELECT COUNT(*) as count
    FROM raw_markets 
    WHERE platform = 'kalshi' AND liquidity > 0
  `);
  const liquidityRows = await liquidityResult.getRows();
  const liquidityCount = Number(liquidityRows[0][0]);
  
  console.log(`   📊 Kalshi markets with liquidity data: ${liquidityCount.toLocaleString()}`);
}

async function fixPolymarketNoPrices(connection: DuckDBConnection): Promise<void> {
  // Fix missing no_price values for Polymarket (should be 1 - yes_price for binary markets)
  await connection.run(`
    UPDATE raw_markets 
    SET no_price = 1.0 - yes_price
    WHERE platform = 'polymarket' 
      AND (no_price IS NULL OR no_price = 0)
      AND yes_price IS NOT NULL 
      AND yes_price BETWEEN 0 AND 1
  `);
  
  console.log(`   ✅ Fixed Polymarket no_price calculations`);
  
  // Fix any invalid price combinations
  await connection.run(`
    UPDATE raw_markets 
    SET no_price = 1.0 - yes_price
    WHERE platform = 'polymarket' 
      AND ABS((yes_price + no_price) - 1.0) > 0.1
      AND yes_price BETWEEN 0 AND 1
  `);
  
  console.log(`   ✅ Fixed invalid Polymarket price combinations`);
}

async function validateFixes(connection: DuckDBConnection): Promise<void> {
  console.log("\n📊 Post-Fix Validation:");
  
  // Check price ranges
  const priceResult = await connection.run(`
    SELECT 
      platform,
      COUNT(*) as total,
      COUNT(CASE WHEN yes_price BETWEEN 0.01 AND 0.99 THEN 1 END) as valid_yes_prices,
      COUNT(CASE WHEN no_price BETWEEN 0.01 AND 0.99 THEN 1 END) as valid_no_prices,
      COUNT(CASE WHEN ABS((yes_price + no_price) - 1.0) <= 0.01 THEN 1 END) as valid_price_sums
    FROM raw_markets 
    GROUP BY platform
  `);
  const priceRows = await priceResult.getRows();
  
  priceRows.forEach(row => {
    const [platform, total, valid_yes, valid_no, valid_sums] = row;
    const totalNum = Number(total);
    console.log(`\n  ${platform}:`);
    console.log(`    Valid Yes Prices: ${Number(valid_yes)}/${totalNum} (${(Number(valid_yes)/totalNum*100).toFixed(1)}%)`);
    console.log(`    Valid No Prices: ${Number(valid_no)}/${totalNum} (${(Number(valid_no)/totalNum*100).toFixed(1)}%)`);
    console.log(`    Valid Price Sums: ${Number(valid_sums)}/${totalNum} (${(Number(valid_sums)/totalNum*100).toFixed(1)}%)`);
  });
  
  // Check categories
  const categoryResult = await connection.run(`
    SELECT 
      platform,
      COUNT(*) as total,
      COUNT(CASE WHEN category != 'other' THEN 1 END) as categorized
    FROM raw_markets 
    GROUP BY platform
  `);
  const categoryRows = await categoryResult.getRows();
  
  console.log(`\n📋 Category Classification:`);
  categoryRows.forEach(row => {
    const [platform, total, categorized] = row;
    const totalNum = Number(total);
    const categorizedNum = Number(categorized);
    console.log(`  ${platform}: ${categorizedNum}/${totalNum} (${(categorizedNum/totalNum*100).toFixed(1)}%) properly categorized`);
  });
  
  // Check volume data
  const volumeResult = await connection.run(`
    SELECT 
      platform,
      COUNT(*) as total,
      COUNT(CASE WHEN volume > 0 THEN 1 END) as has_volume,
      AVG(volume) as avg_volume
    FROM raw_markets 
    GROUP BY platform
  `);
  const volumeRows = await volumeResult.getRows();
  
  console.log(`\n📈 Volume Data:`);
  volumeRows.forEach(row => {
    const [platform, total, has_volume, avg_volume] = row;
    const totalNum = Number(total);
    const volumeNum = Number(has_volume);
    console.log(`  ${platform}: ${volumeNum}/${totalNum} (${(volumeNum/totalNum*100).toFixed(1)}%) with volume, avg: $${Number(avg_volume).toFixed(2)}`);
  });
  
  // Show category distribution
  const categoryDistResult = await connection.run(`
    SELECT platform, category, COUNT(*) as count
    FROM raw_markets 
    GROUP BY platform, category 
    ORDER BY platform, count DESC
  `);
  const categoryDistRows = await categoryDistResult.getRows();
  
  console.log(`\n🏷️ Updated Category Distribution:`);
  let currentPlatform = '';
  categoryDistRows.forEach(row => {
    const [platform, category, count] = row;
    if (platform !== currentPlatform) {
      console.log(`\n  ${platform}:`);
      currentPlatform = String(platform);
    }
    console.log(`    ${category}: ${Number(count).toLocaleString()}`);
  });
}

fixDataQualityIssues();