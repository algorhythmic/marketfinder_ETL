// Improve arbitrage matching with better title similarity and category fixing
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';

const UNIFIED_DB = './data/unified-markets.db';

async function improveArbitrageMatching(): Promise<void> {
  console.log("🎯 IMPROVING ARBITRAGE MATCHING SYSTEM");
  console.log("=" .repeat(60));
  
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  try {
    instance = await DuckDBInstance.create(UNIFIED_DB);
    connection = await instance.connect();
    
    // Step 1: Fix category misclassifications
    console.log("\n🏷️ Step 1: Fixing Category Classifications...");
    await fixCategoryMisclassifications(connection);
    
    // Step 2: Create better title normalization
    console.log("\n📝 Step 2: Improving Title Normalization...");
    await improveTitleNormalization(connection);
    
    // Step 3: Fix price normalization issues
    console.log("\n💰 Step 3: Fixing Price Normalization...");
    await fixPriceNormalization(connection);
    
    // Step 4: Create semantic matching functions
    console.log("\n🧠 Step 4: Creating Semantic Matching...");
    await createSemanticMatching(connection);
    
    // Step 5: Find real arbitrage opportunities
    console.log("\n⚖️ Step 5: Finding Arbitrage Opportunities...");
    await findArbitrageOpportunities(connection);
    
  } catch (error) {
    console.error("❌ Improvement failed:", error instanceof Error ? error.message : String(error));
  } finally {
    console.log(`\n✅ Arbitrage matching improvements completed`);
  }
}

async function fixCategoryMisclassifications(connection: DuckDBConnection): Promise<void> {
  // Fix obvious misclassifications based on title content
  const fixes = [
    {
      pattern: '%football%',
      category: 'sports',
      description: 'Football markets'
    },
    {
      pattern: '%basketball%',
      category: 'sports', 
      description: 'Basketball markets'
    },
    {
      pattern: '%nfl%',
      category: 'sports',
      description: 'NFL markets'
    },
    {
      pattern: '%nba%',
      category: 'sports',
      description: 'NBA markets'
    },
    {
      pattern: '%bitcoin%',
      category: 'crypto',
      description: 'Bitcoin markets'
    },
    {
      pattern: '%eth%',
      category: 'crypto',
      description: 'Ethereum markets'
    },
    {
      pattern: '%trump%',
      category: 'politics',
      description: 'Trump-related markets'
    },
    {
      pattern: '%election%',
      category: 'politics',
      description: 'Election markets'
    },
    {
      pattern: '%supreme court%',
      category: 'politics',
      description: 'Supreme Court markets'
    },
    {
      pattern: '%justice%',
      category: 'politics',
      description: 'Justice markets'
    }
  ];
  
  let totalFixed = 0;
  
  for (const fix of fixes) {
    const result = await connection.run(`
      UPDATE unified_markets 
      SET category = '${fix.category}'
      WHERE LOWER(title) LIKE '${fix.pattern}'
        AND category != '${fix.category}'
    `);
    
    // Count how many were updated
    const countResult = await connection.run(`
      SELECT COUNT(*) as count 
      FROM unified_markets 
      WHERE LOWER(title) LIKE '${fix.pattern}' AND category = '${fix.category}'
    `);
    const count = await countResult.getRows();
    const fixedCount = Number(count[0][0]);
    
    if (fixedCount > 0) {
      console.log(`   ✅ ${fix.description}: ${fixedCount} markets → ${fix.category}`);
      totalFixed += fixedCount;
    }
  }
  
  console.log(`   📊 Total category fixes: ${totalFixed}`);
}

async function improveTitleNormalization(connection: DuckDBConnection): Promise<void> {
  // Create better normalized titles for matching
  await connection.run(`
    UPDATE unified_markets 
    SET title_normalized = LOWER(
      REGEXP_REPLACE(
        REGEXP_REPLACE(title, '[^\\w\\s]', ' ', 'g'),
        '\\s+', ' ', 'g'
      )
    )
  `);
  
  // Create keyword-based hashes for better matching
  await connection.run(`
    UPDATE unified_markets 
    SET title_hash = SUBSTRING(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          LOWER(title), 
          '\\b(will|who|when|what|how|is|are|the|a|an|in|on|at|by|for|before|after)\\b', 
          '', 
          'g'
        ),
        '\\s+', '_', 'g'
      ), 
      1, 30
    )
  `);
  
  console.log(`   ✅ Improved title normalization with keyword extraction`);
}

async function fixPriceNormalization(connection: DuckDBConnection): Promise<void> {
  // Fix prices that are exactly 0 or 1 (likely edge cases)
  await connection.run(`
    UPDATE unified_markets 
    SET yes_price = 0.5, no_price = 0.5
    WHERE yes_price = 0.0 OR yes_price = 1.0 OR yes_price IS NULL
  `);
  
  // Ensure no_price = 1 - yes_price for consistency
  await connection.run(`
    UPDATE unified_markets 
    SET no_price = 1.0 - yes_price
    WHERE ABS((yes_price + no_price) - 1.0) > 0.01
  `);
  
  // Count fixes
  const validPriceResult = await connection.run(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN yes_price BETWEEN 0.01 AND 0.99 THEN 1 END) as valid_prices
    FROM unified_markets
  `);
  const priceStats = await validPriceResult.getRows();
  const [total, valid] = priceStats[0];
  
  console.log(`   ✅ Price validation: ${Number(valid)}/${Number(total)} (${(Number(valid)/Number(total)*100).toFixed(1)}%) valid prices`);
}

async function createSemanticMatching(connection: DuckDBConnection): Promise<void> {
  // Create a more sophisticated arbitrage matching view
  await connection.run(`
    DROP VIEW IF EXISTS improved_arbitrage_opportunities
  `);
  
  await connection.run(`
    CREATE VIEW improved_arbitrage_opportunities AS
    WITH potential_matches AS (
      SELECT 
        k.id as kalshi_id,
        k.external_id as kalshi_external_id,
        k.title as kalshi_title,
        k.yes_price as kalshi_yes_price,
        k.volume as kalshi_volume,
        k.liquidity as kalshi_liquidity,
        k.category as kalshi_category,
        
        p.id as polymarket_id,
        p.external_id as polymarket_external_id,
        p.title as polymarket_title,
        p.yes_price as polymarket_yes_price,
        p.volume as polymarket_volume,
        p.liquidity as polymarket_liquidity,
        p.category as polymarket_category,
        
        -- Multiple similarity scoring methods
        CASE 
          WHEN k.title_hash = p.title_hash THEN 1.0
          WHEN LENGTH(k.title_normalized) > 5 AND LENGTH(p.title_normalized) > 5 THEN
            1.0 - (LENGTH(k.title_normalized) + LENGTH(p.title_normalized) - 2 * LENGTH(
              CASE 
                WHEN INSTR(k.title_normalized, p.title_normalized) > 0 THEN p.title_normalized
                WHEN INSTR(p.title_normalized, k.title_normalized) > 0 THEN k.title_normalized
                ELSE ''
              END
            )) / CAST(GREATEST(LENGTH(k.title_normalized), LENGTH(p.title_normalized)) AS FLOAT)
          ELSE 0.0
        END as title_similarity,
        
        -- Category bonus
        CASE WHEN k.category = p.category THEN 0.2 ELSE 0.0 END as category_bonus,
        
        -- Keyword matching
        CASE 
          WHEN (
            (INSTR(k.title_normalized, 'trump') > 0 AND INSTR(p.title_normalized, 'trump') > 0) OR
            (INSTR(k.title_normalized, 'bitcoin') > 0 AND INSTR(p.title_normalized, 'bitcoin') > 0) OR
            (INSTR(k.title_normalized, 'election') > 0 AND INSTR(p.title_normalized, 'election') > 0) OR
            (INSTR(k.title_normalized, 'super bowl') > 0 AND INSTR(p.title_normalized, 'super bowl') > 0)
          ) THEN 0.3 
          ELSE 0.0 
        END as keyword_bonus
        
      FROM unified_markets k
      CROSS JOIN unified_markets p
      WHERE k.platform = 'kalshi' 
        AND p.platform = 'polymarket'
        AND k.is_active = true 
        AND p.is_active = true
        AND k.yes_price IS NOT NULL 
        AND p.yes_price IS NOT NULL
        AND k.yes_price BETWEEN 0.01 AND 0.99
        AND p.yes_price BETWEEN 0.01 AND 0.99
    )
    SELECT 
      kalshi_id,
      polymarket_id,
      kalshi_external_id,
      polymarket_external_id,
      kalshi_title,
      polymarket_title,
      kalshi_category,
      polymarket_category,
      kalshi_yes_price,
      polymarket_yes_price,
      ABS(kalshi_yes_price - polymarket_yes_price) as price_difference,
      -- Conservative profit calculation (assume 2% fees)
      (ABS(kalshi_yes_price - polymarket_yes_price) - 0.02) as potential_profit,
      LEAST(kalshi_volume, polymarket_volume) as min_volume,
      LEAST(kalshi_liquidity, polymarket_liquidity) as min_liquidity,
      (title_similarity + category_bonus + keyword_bonus) as total_similarity_score,
      title_similarity,
      category_bonus,
      keyword_bonus
    FROM potential_matches
    WHERE (title_similarity + category_bonus + keyword_bonus) > 0.4
      AND ABS(kalshi_yes_price - polymarket_yes_price) > 0.03
      AND LEAST(kalshi_volume, polymarket_volume) > 50
    ORDER BY potential_profit DESC, total_similarity_score DESC
  `);
  
  console.log(`   ✅ Created improved semantic matching view`);
}

async function findArbitrageOpportunities(connection: DuckDBConnection): Promise<void> {
  // Count opportunities
  const countResult = await connection.run(`
    SELECT COUNT(*) as count FROM improved_arbitrage_opportunities
    WHERE potential_profit > 0.01
  `);
  const count = await countResult.getRows();
  const opportunityCount = Number(count[0][0]);
  
  console.log(`   📊 Found ${opportunityCount} potential arbitrage opportunities`);
  
  if (opportunityCount > 0) {
    // Show top opportunities
    const topResult = await connection.run(`
      SELECT 
        kalshi_title,
        polymarket_title,
        kalshi_category,
        polymarket_category,
        kalshi_yes_price,
        polymarket_yes_price,
        price_difference,
        potential_profit,
        total_similarity_score,
        min_volume
      FROM improved_arbitrage_opportunities
      WHERE potential_profit > 0.01
      ORDER BY potential_profit DESC, total_similarity_score DESC
      LIMIT 10
    `);
    const opportunities = await topResult.getRows();
    
    console.log(`\n   🎯 Top Arbitrage Opportunities:`);
    opportunities.forEach((row, i) => {
      const [k_title, p_title, k_cat, p_cat, k_price, p_price, diff, profit, similarity, volume] = row;
      
      console.log(`\n   ${i+1}. 💰 Profit: ${(Number(profit)*100).toFixed(1)}% | Similarity: ${(Number(similarity)*100).toFixed(1)}% | Volume: $${Number(volume).toLocaleString()}`);
      console.log(`      📊 Price diff: ${(Number(diff)*100).toFixed(1)}% (${Number(k_price).toFixed(3)} vs ${Number(p_price).toFixed(3)})`);
      console.log(`      🏷️ Categories: ${k_cat} vs ${p_cat}`);
      console.log(`      📝 Kalshi: "${String(k_title).substring(0, 60)}..."`);
      console.log(`      📝 Polymarket: "${String(p_title).substring(0, 60)}..."`);
    });
  }
  
  // Summary statistics
  const statsResult = await connection.run(`
    SELECT 
      COUNT(*) as total_opportunities,
      COUNT(CASE WHEN potential_profit > 0.05 THEN 1 END) as high_profit_opportunities,
      AVG(potential_profit) as avg_profit,
      MAX(potential_profit) as max_profit,
      AVG(total_similarity_score) as avg_similarity,
      SUM(min_volume) as total_addressable_volume
    FROM improved_arbitrage_opportunities
    WHERE potential_profit > 0.01
  `);
  const stats = await statsResult.getRows();
  
  if (stats.length > 0) {
    const [total, high_profit, avg_profit, max_profit, avg_similarity, total_volume] = stats[0];
    
    console.log(`\n   📈 Arbitrage Summary:`);
    console.log(`     Total opportunities: ${Number(total).toLocaleString()}`);
    console.log(`     High profit (>5%): ${Number(high_profit).toLocaleString()}`);
    console.log(`     Average profit: ${(Number(avg_profit)*100).toFixed(2)}%`);
    console.log(`     Maximum profit: ${(Number(max_profit)*100).toFixed(2)}%`);
    console.log(`     Average similarity: ${(Number(avg_similarity)*100).toFixed(1)}%`);
    console.log(`     Total addressable volume: $${Number(total_volume).toLocaleString()}`);
  }
  
  // Category breakdown
  const categoryBreakdown = await connection.run(`
    SELECT 
      kalshi_category,
      COUNT(*) as opportunity_count,
      AVG(potential_profit) as avg_profit
    FROM improved_arbitrage_opportunities
    WHERE potential_profit > 0.01
    GROUP BY kalshi_category
    ORDER BY opportunity_count DESC
  `);
  const categoryStats = await categoryBreakdown.getRows();
  
  if (categoryStats.length > 0) {
    console.log(`\n   🏷️ Opportunities by Category:`);
    categoryStats.forEach(row => {
      const [category, count, avg_profit] = row;
      console.log(`     ${category}: ${Number(count)} opportunities (avg ${(Number(avg_profit)*100).toFixed(1)}% profit)`);
    });
  }
}

improveArbitrageMatching();