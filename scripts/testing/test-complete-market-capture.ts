// Comprehensive test to ensure complete market capture from both platforms
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import fetch from 'node-fetch';

const DB_PATH = './data/complete-test.db';

interface TestConfig {
  kalshi_max_pages: number;
  polymarket_max_batches: number;
  test_duration_minutes: number;
}

const config: TestConfig = {
  kalshi_max_pages: 100, // Test with higher limits
  polymarket_max_batches: 600, // Up to 60K markets
  test_duration_minutes: 15 // Allow longer test time
};

interface MarketCounts {
  platform: string;
  total_fetched: number;
  total_valid: number;
  categories: Record<string, number>;
  price_ranges: {
    very_low: number; // 0-0.1
    low: number; // 0.1-0.3
    medium: number; // 0.3-0.7
    high: number; // 0.7-0.9
    very_high: number; // 0.9-1.0
  };
  volume_distribution: {
    no_volume: number;
    low_volume: number; // <$1K
    medium_volume: number; // $1K-$10K
    high_volume: number; // >$10K
  };
}

async function testCompleteMarketCapture(): Promise<void> {
  console.log("🔍 COMPREHENSIVE MARKET CAPTURE TEST");
  console.log("=".repeat(60));
  console.log(`Target: ${config.kalshi_max_pages * 100} Kalshi + ${config.polymarket_max_batches * 100} Polymarket markets`);
  console.log(`Max duration: ${config.test_duration_minutes} minutes\n`);
  
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  try {
    // Setup test database
    instance = await DuckDBInstance.create(DB_PATH);
    connection = await instance.connect();
    await setupTestDatabase(connection);
    
    const startTime = Date.now();
    
    // Test both platforms concurrently
    console.log("🚀 Starting concurrent market fetching...\n");
    
    const [kalshiResults, polymarketResults] = await Promise.all([
      testKalshiCompleteness(connection),
      testPolymarketCompleteness(connection)
    ]);
    
    const totalTime = (Date.now() - startTime) / 1000;
    console.log(`\n⏱️ Total test time: ${totalTime.toFixed(1)}s`);
    
    // Analyze results
    console.log("\n📊 COMPREHENSIVE ANALYSIS");
    console.log("=".repeat(60));
    
    await analyzeMarketCoverage(connection);
    await analyzeDataQuality(connection);
    await analyzeMarketDistribution(connection);
    await comparePlatforms(connection);
    
    // Generate recommendations
    console.log("\n💡 RECOMMENDATIONS");
    console.log("=".repeat(60));
    await generateRecommendations(connection, kalshiResults, polymarketResults);
    
  } catch (error) {
    console.error("❌ Test failed:", error instanceof Error ? error.message : String(error));
  } finally {
    // Cleanup
    if (connection) {
      console.log(`\n🧹 Test database created at: ${DB_PATH}`);
      console.log("Review the data before proceeding with production deployment.");
    }
  }
}

async function setupTestDatabase(connection: DuckDBConnection): Promise<void> {
  await connection.run(`
    CREATE TABLE IF NOT EXISTS test_markets (
      id VARCHAR PRIMARY KEY,
      platform VARCHAR NOT NULL,
      external_id VARCHAR NOT NULL,
      title VARCHAR NOT NULL,
      description VARCHAR,
      category VARCHAR,
      yes_price DOUBLE,
      no_price DOUBLE,
      volume DOUBLE,
      liquidity DOUBLE,
      end_date TIMESTAMP,
      start_date TIMESTAMP,
      is_active BOOLEAN,
      fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      batch_number INTEGER,
      raw_data JSON
    )
  `);
  
  await connection.run(`
    CREATE TABLE IF NOT EXISTS fetch_stats (
      platform VARCHAR,
      batch_number INTEGER,
      markets_fetched INTEGER,
      fetch_time_ms INTEGER,
      api_status INTEGER,
      notes VARCHAR
    )
  `);
  
  console.log("✅ Test database initialized");
}

async function testKalshiCompleteness(connection: DuckDBConnection): Promise<MarketCounts> {
  console.log("📡 Testing Kalshi market capture completeness...");
  
  let totalFetched = 0;
  let totalValid = 0;
  let cursor: string | undefined = undefined;
  let pageNum = 0;
  const categories: Record<string, number> = {};
  const priceRanges = { very_low: 0, low: 0, medium: 0, high: 0, very_high: 0 };
  const volumeDistribution = { no_volume: 0, low_volume: 0, medium_volume: 0, high_volume: 0 };
  
  while (pageNum < config.kalshi_max_pages) {
    const batchStart = Date.now();
    
    try {
      // Build URL with cursor
      let url = "https://api.elections.kalshi.com/trade-api/v2/markets?limit=100";
      if (cursor) {
        url += `&cursor=${cursor}`;
      }
      
      console.log(`   Kalshi page ${pageNum + 1}/${config.kalshi_max_pages}: ${cursor ? 'cursor=' + cursor.substring(0, 10) + '...' : 'initial'}`);
      
      // Rate limiting for Kalshi
      if (pageNum > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const response = await fetch(url, {
        headers: { 
          "Accept": "application/json", 
          "User-Agent": "MarketFinder-Test/1.0" 
        },
      });
      
      const fetchTime = Date.now() - batchStart;
      
      if (!response.ok) {
        console.warn(`   ⚠️ Kalshi API error: ${response.status}`);
        await connection.run(`
          INSERT INTO fetch_stats (platform, batch_number, markets_fetched, fetch_time_ms, api_status, notes)
          VALUES ('kalshi', ${pageNum}, 0, ${fetchTime}, ${response.status}, 'API Error')
        `);
        break;
      }
      
      const data = await response.json();
      const markets = data.markets || [];
      
      console.log(`   ✅ Fetched ${markets.length} markets (${fetchTime}ms)`);
      totalFetched += markets.length;
      
      if (markets.length === 0) {
        console.log("   📝 No more Kalshi markets available");
        break;
      }
      
      // Process and store markets
      let validCount = 0;
      for (const market of markets) {
        const isValid = market.close_time > new Date().toISOString() &&
                       (market.status === "active" || market.status === "initialized") &&
                       market.ticker;
        
        if (isValid) {
          validCount++;
          totalValid++;
          
          // Categorize
          const category = categorizeMarket(market.title || '', 'kalshi');
          categories[category] = (categories[category] || 0) + 1;
          
          // Analyze prices
          const yesPrice = calculateKalshiPrice(market, 'yes');
          if (yesPrice <= 0.1) priceRanges.very_low++;
          else if (yesPrice <= 0.3) priceRanges.low++;
          else if (yesPrice <= 0.7) priceRanges.medium++;
          else if (yesPrice <= 0.9) priceRanges.high++;
          else priceRanges.very_high++;
          
          // Analyze volume
          const volume = parseFloat(String(market.liquidity || 0)) / 1000;
          if (volume === 0) volumeDistribution.no_volume++;
          else if (volume < 1000) volumeDistribution.low_volume++;
          else if (volume < 10000) volumeDistribution.medium_volume++;
          else volumeDistribution.high_volume++;
          
          // Store in test database
          const marketId = `kalshi-${market.ticker}`;
          await connection.run(`
            INSERT OR IGNORE INTO test_markets (
              id, platform, external_id, title, description, category,
              yes_price, no_price, volume, liquidity, end_date, is_active,
              batch_number, raw_data
            ) VALUES (
              '${marketId}', 'kalshi', '${market.ticker}', 
              '${(market.title || '').replace(/'/g, "''")}', 
              '${(market.subtitle || '').replace(/'/g, "''")}', 
              '${category}', ${yesPrice}, ${calculateKalshiPrice(market, 'no')}, 
              ${volume}, ${parseFloat(String(market.liquidity || 0))}, 
              '${market.close_time}', true, ${pageNum}, 
              '${JSON.stringify(market).replace(/'/g, "''")}'
            )
          `);
        }
      }
      
      // Record fetch stats
      await connection.run(`
        INSERT INTO fetch_stats (platform, batch_number, markets_fetched, fetch_time_ms, api_status, notes)
        VALUES ('kalshi', ${pageNum}, ${validCount}, ${fetchTime}, 200, 'Success')
      `);
      
      // Check for next cursor
      cursor = data.cursor;
      if (!cursor) {
        console.log("   📝 Reached end of Kalshi pagination");
        break;
      }
      
      pageNum++;
      
    } catch (error) {
      console.error(`   ❌ Kalshi page ${pageNum + 1} failed:`, error instanceof Error ? error.message : String(error));
      break;
    }
  }
  
  console.log(`✅ Kalshi: ${totalValid}/${totalFetched} valid markets from ${pageNum} pages`);
  
  return {
    platform: 'kalshi',
    total_fetched: totalFetched,
    total_valid: totalValid,
    categories,
    price_ranges: priceRanges,
    volume_distribution: volumeDistribution
  };
}

async function testPolymarketCompleteness(connection: DuckDBConnection): Promise<MarketCounts> {
  console.log("📡 Testing Polymarket market capture completeness...");
  
  let totalFetched = 0;
  let totalValid = 0;
  let offset = 0;
  let batchNum = 0;
  const categories: Record<string, number> = {};
  const priceRanges = { very_low: 0, low: 0, medium: 0, high: 0, very_high: 0 };
  const volumeDistribution = { no_volume: 0, low_volume: 0, medium_volume: 0, high_volume: 0 };
  
  while (batchNum < config.polymarket_max_batches) {
    const batchStart = Date.now();
    
    try {
      const url = `https://gamma-api.polymarket.com/markets?active=true&archived=false&limit=100&offset=${offset}&order=startDate&ascending=false`;
      
      console.log(`   Polymarket batch ${batchNum + 1}/${config.polymarket_max_batches}: offset=${offset}`);
      
      const response = await fetch(url, {
        headers: { 
          "Accept": "application/json", 
          "User-Agent": "MarketFinder-Test/1.0" 
        },
      });
      
      const fetchTime = Date.now() - batchStart;
      
      if (!response.ok) {
        console.warn(`   ⚠️ Polymarket API error: ${response.status}`);
        await connection.run(`
          INSERT INTO fetch_stats (platform, batch_number, markets_fetched, fetch_time_ms, api_status, notes)
          VALUES ('polymarket', ${batchNum}, 0, ${fetchTime}, ${response.status}, 'API Error')
        `);
        break;
      }
      
      const data = await response.json();
      const markets = Array.isArray(data) ? data : data.markets || [];
      
      console.log(`   ✅ Fetched ${markets.length} markets (${fetchTime}ms)`);
      totalFetched += markets.length;
      
      if (markets.length === 0) {
        console.log("   📝 No more Polymarket markets available");
        break;
      }
      
      // Process and store markets
      let validCount = 0;
      for (const market of markets) {
        const hasValidOutcomes = checkValidOutcomes(market.outcomes);
        
        if (market.id && market.question && hasValidOutcomes) {
          validCount++;
          totalValid++;
          
          // Categorize
          const category = categorizeMarket(market.question || '', 'polymarket');
          categories[category] = (categories[category] || 0) + 1;
          
          // Analyze prices
          const yesPrice = parseFloat(String(market.lastTradePrice || 0.5));
          if (yesPrice <= 0.1) priceRanges.very_low++;
          else if (yesPrice <= 0.3) priceRanges.low++;
          else if (yesPrice <= 0.7) priceRanges.medium++;
          else if (yesPrice <= 0.9) priceRanges.high++;
          else priceRanges.very_high++;
          
          // Analyze volume
          const volume = parseFloat(String(market.volume || market.volumeNum || 0));
          if (volume === 0) volumeDistribution.no_volume++;
          else if (volume < 1000) volumeDistribution.low_volume++;
          else if (volume < 10000) volumeDistribution.medium_volume++;
          else volumeDistribution.high_volume++;
          
          // Store in test database
          const marketId = `polymarket-${market.id}`;
          await connection.run(`
            INSERT OR IGNORE INTO test_markets (
              id, platform, external_id, title, description, category,
              yes_price, no_price, volume, liquidity, end_date, is_active,
              batch_number, raw_data
            ) VALUES (
              '${marketId}', 'polymarket', '${market.id}', 
              '${(market.question || '').replace(/'/g, "''")}', 
              '${(market.description || '').replace(/'/g, "''")}', 
              '${category}', ${yesPrice}, ${1 - yesPrice}, 
              ${volume}, ${parseFloat(String(market.liquidity || market.liquidityNum || 0))}, 
              '${market.endDateIso || market.endDate || ''}', true, ${batchNum}, 
              '${JSON.stringify(market).replace(/'/g, "''")}'
            )
          `);
        }
      }
      
      // Record fetch stats
      await connection.run(`
        INSERT INTO fetch_stats (platform, batch_number, markets_fetched, fetch_time_ms, api_status, notes)
        VALUES ('polymarket', ${batchNum}, ${validCount}, ${fetchTime}, 200, 'Success')
      `);
      
      // Check if we should continue
      if (markets.length < 100) {
        console.log("   📝 Reached end of Polymarket data (partial batch)");
        break;
      }
      
      offset += 100;
      batchNum++;
      
    } catch (error) {
      console.error(`   ❌ Polymarket batch ${batchNum + 1} failed:`, error instanceof Error ? error.message : String(error));
      break;
    }
  }
  
  console.log(`✅ Polymarket: ${totalValid}/${totalFetched} valid markets from ${batchNum} batches`);
  
  return {
    platform: 'polymarket',
    total_fetched: totalFetched,
    total_valid: totalValid,
    categories,
    price_ranges: priceRanges,
    volume_distribution: volumeDistribution
  };
}

async function analyzeMarketCoverage(connection: DuckDBConnection): Promise<void> {
  console.log("\n📊 Market Coverage Analysis:");
  
  const coverageResult = await connection.run(`
    SELECT 
      platform,
      COUNT(*) as total_markets,
      COUNT(DISTINCT category) as unique_categories,
      AVG(volume) as avg_volume,
      MAX(volume) as max_volume,
      COUNT(CASE WHEN volume > 0 THEN 1 END) as markets_with_volume
    FROM test_markets 
    GROUP BY platform
  `);
  const coverage = await coverageResult.getRows();
  
  coverage.forEach(row => {
    const [platform, total, categories, avg_vol, max_vol, with_vol] = row;
    console.log(`\n  ${platform}:`);
    console.log(`    📊 Total Markets: ${Number(total).toLocaleString()}`);
    console.log(`    🏷️ Categories: ${Number(categories)}`);
    console.log(`    💰 Avg Volume: $${Number(avg_vol).toFixed(2)}`);
    console.log(`    🔥 Max Volume: $${Number(max_vol).toLocaleString()}`);
    console.log(`    📈 With Volume: ${Number(with_vol)}/${Number(total)} (${(Number(with_vol)/Number(total)*100).toFixed(1)}%)`);
  });
}

async function analyzeDataQuality(connection: DuckDBConnection): Promise<void> {
  console.log("\n🔍 Data Quality Analysis:");
  
  const qualityResult = await connection.run(`
    SELECT 
      platform,
      COUNT(*) as total,
      COUNT(CASE WHEN yes_price BETWEEN 0.01 AND 0.99 THEN 1 END) as valid_prices,
      COUNT(CASE WHEN category != 'other' THEN 1 END) as categorized,
      COUNT(CASE WHEN LENGTH(title) > 10 THEN 1 END) as good_titles,
      COUNT(CASE WHEN end_date IS NOT NULL THEN 1 END) as has_end_date
    FROM test_markets 
    GROUP BY platform
  `);
  const quality = await qualityResult.getRows();
  
  quality.forEach(row => {
    const [platform, total, valid_prices, categorized, good_titles, has_end_date] = row;
    const totalNum = Number(total);
    console.log(`\n  ${platform}:`);
    console.log(`    💰 Valid Prices: ${Number(valid_prices)}/${totalNum} (${(Number(valid_prices)/totalNum*100).toFixed(1)}%)`);
    console.log(`    🏷️ Categorized: ${Number(categorized)}/${totalNum} (${(Number(categorized)/totalNum*100).toFixed(1)}%)`);
    console.log(`    📝 Good Titles: ${Number(good_titles)}/${totalNum} (${(Number(good_titles)/totalNum*100).toFixed(1)}%)`);
    console.log(`    📅 Has End Date: ${Number(has_end_date)}/${totalNum} (${(Number(has_end_date)/totalNum*100).toFixed(1)}%)`);
  });
}

async function analyzeMarketDistribution(connection: DuckDBConnection): Promise<void> {
  console.log("\n📈 Market Distribution Analysis:");
  
  const distributionResult = await connection.run(`
    SELECT platform, category, COUNT(*) as count
    FROM test_markets 
    GROUP BY platform, category 
    ORDER BY platform, count DESC
  `);
  const distribution = await distributionResult.getRows();
  
  let currentPlatform = '';
  distribution.forEach(row => {
    const [platform, category, count] = row;
    if (platform !== currentPlatform) {
      console.log(`\n  ${platform}:`);
      currentPlatform = String(platform);
    }
    console.log(`    ${category}: ${Number(count).toLocaleString()}`);
  });
}

async function comparePlatforms(connection: DuckDBConnection): Promise<void> {
  console.log("\n⚖️ Platform Comparison:");
  
  const comparisonResult = await connection.run(`
    SELECT 
      'Markets' as metric,
      SUM(CASE WHEN platform = 'kalshi' THEN 1 ELSE 0 END) as kalshi,
      SUM(CASE WHEN platform = 'polymarket' THEN 1 ELSE 0 END) as polymarket
    FROM test_markets
    UNION ALL
    SELECT 
      'Avg Volume',
      AVG(CASE WHEN platform = 'kalshi' THEN volume END),
      AVG(CASE WHEN platform = 'polymarket' THEN volume END)
    FROM test_markets
    UNION ALL
    SELECT 
      'High Volume (>$1K)',
      SUM(CASE WHEN platform = 'kalshi' AND volume > 1000 THEN 1 ELSE 0 END),
      SUM(CASE WHEN platform = 'polymarket' AND volume > 1000 THEN 1 ELSE 0 END)
    FROM test_markets
  `);
  const comparison = await comparisonResult.getRows();
  
  comparison.forEach(row => {
    const [metric, kalshi, polymarket] = row;
    console.log(`  ${metric}:`);
    console.log(`    Kalshi: ${Number(kalshi).toLocaleString()}`);
    console.log(`    Polymarket: ${Number(polymarket).toLocaleString()}`);
    console.log(`    Ratio: ${(Number(polymarket) / Number(kalshi)).toFixed(2)}:1`);
  });
}

async function generateRecommendations(
  connection: DuckDBConnection, 
  kalshiResults: MarketCounts, 
  polymarketResults: MarketCounts
): Promise<void> {
  const totalMarkets = kalshiResults.total_valid + polymarketResults.total_valid;
  
  console.log(`📊 Total markets captured: ${totalMarkets.toLocaleString()}`);
  console.log(`🎯 Capture efficiency: Kalshi ${(kalshiResults.total_valid/kalshiResults.total_fetched*100).toFixed(1)}%, Polymarket ${(polymarketResults.total_valid/polymarketResults.total_fetched*100).toFixed(1)}%`);
  
  console.log("\n🚀 Production Recommendations:");
  
  // Recommend optimal batch sizes
  if (kalshiResults.total_valid >= 4000) {
    console.log("✅ Kalshi: Current pagination captures good coverage");
  } else {
    console.log(`⚠️ Kalshi: Consider increasing max_pages to ${Math.ceil(5000 / 100)} for better coverage`);
  }
  
  if (polymarketResults.total_valid >= 40000) {
    console.log("✅ Polymarket: Excellent coverage achieved");
  } else if (polymarketResults.total_valid >= 20000) {
    console.log("✅ Polymarket: Good coverage, consider current limits sufficient");
  } else {
    console.log(`⚠️ Polymarket: Consider increasing max_batches to ${Math.ceil(50000 / 100)} for comprehensive coverage`);
  }
  
  // Performance recommendations
  const avgFetchTime = await connection.run(`
    SELECT platform, AVG(fetch_time_ms) as avg_time
    FROM fetch_stats 
    WHERE api_status = 200
    GROUP BY platform
  `);
  const fetchTimes = await avgFetchTime.getRows();
  
  console.log("\n⚡ Performance Recommendations:");
  fetchTimes.forEach(row => {
    const [platform, avg_time] = row;
    console.log(`  ${platform}: ${Number(avg_time).toFixed(0)}ms avg - ${Number(avg_time) < 500 ? '✅ Good' : '⚠️ Consider optimization'}`);
  });
  
  console.log(`\n🏁 Ready for production deployment with ${totalMarkets.toLocaleString()} markets!`);
}

// Helper functions
function calculateKalshiPrice(market: any, outcome: 'yes' | 'no'): number {
  const bidField = outcome === 'yes' ? 'yes_bid' : 'no_bid';
  const askField = outcome === 'yes' ? 'yes_ask' : 'no_ask';
  
  const bid = parseFloat(String(market[bidField] || 0));
  const ask = parseFloat(String(market[askField] || 0));
  const lastPrice = parseFloat(String(market.last_price || 0));
  
  // Convert from cents to decimals if needed
  const convertPrice = (price: number) => price > 1 ? price / 100 : price;
  
  if (bid > 0 && ask > 0 && ask > bid) {
    return (convertPrice(bid) + convertPrice(ask)) / 2;
  }
  
  if (lastPrice > 0) {
    return outcome === 'yes' ? convertPrice(lastPrice) : (1 - convertPrice(lastPrice));
  }
  
  return 0.5;
}

function checkValidOutcomes(outcomes: any): boolean {
  if (typeof outcomes === 'string') {
    try {
      const parsed = JSON.parse(outcomes);
      return Array.isArray(parsed) && parsed.length >= 2;
    } catch {
      return false;
    }
  }
  return Array.isArray(outcomes) && outcomes.length >= 2;
}

function categorizeMarket(title: string, platform: string): string {
  const lowerTitle = title.toLowerCase();
  
  if (lowerTitle.includes('trump') || lowerTitle.includes('biden') || lowerTitle.includes('election') || 
      lowerTitle.includes('president') || lowerTitle.includes('senate') || lowerTitle.includes('congress') ||
      lowerTitle.includes('democrat') || lowerTitle.includes('republican') || lowerTitle.includes('vote')) {
    return 'politics';
  }
  
  if (lowerTitle.includes('bitcoin') || lowerTitle.includes('btc') || lowerTitle.includes('ethereum') || 
      lowerTitle.includes('eth') || lowerTitle.includes('crypto') || lowerTitle.includes('blockchain')) {
    return 'crypto';
  }
  
  if (lowerTitle.includes('nfl') || lowerTitle.includes('nba') || lowerTitle.includes('mlb') || 
      lowerTitle.includes('sport') || lowerTitle.includes('game') || lowerTitle.includes('team') ||
      lowerTitle.includes('championship') || lowerTitle.includes('soccer') || lowerTitle.includes('football')) {
    return 'sports';
  }
  
  if (lowerTitle.includes('ai') || lowerTitle.includes('tech') || lowerTitle.includes('apple') || 
      lowerTitle.includes('google') || lowerTitle.includes('microsoft') || lowerTitle.includes('openai')) {
    return 'technology';
  }
  
  if (lowerTitle.includes('economy') || lowerTitle.includes('market') || lowerTitle.includes('stock') || 
      lowerTitle.includes('gdp') || lowerTitle.includes('inflation') || lowerTitle.includes('fed')) {
    return 'economics';
  }
  
  return 'other';
}

testCompleteMarketCapture();