// Test the Kalshi volume fix using liquidity as proxy
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import fetch from 'node-fetch';

const DB_PATH = './data/test-kalshi-volume.db';

interface KalshiMarket {
  ticker: string;
  title: string;
  subtitle?: string;
  close_time: string;
  status: string;
  yes_ask?: number;
  yes_bid?: number;
  no_ask?: number;
  no_bid?: number;
  last_price?: number;
  volume?: number;
  volume_24h?: number;
  open_interest?: number;
  liquidity?: number;
  category?: string;
}

// Helper function to calculate representative price for Kalshi markets
function calculateKalshiPrice(market: KalshiMarket, outcome: 'yes' | 'no'): number {
  const bidField = outcome === 'yes' ? 'yes_bid' : 'no_bid';
  const askField = outcome === 'yes' ? 'yes_ask' : 'no_ask';
  
  const bid = parseFloat(String((market as any)[bidField] || 0));
  const ask = parseFloat(String((market as any)[askField] || 0));
  const lastPrice = parseFloat(String(market.last_price || 0));
  
  // Use bid-ask midpoint if both are available and reasonable
  if (bid > 0 && ask > 0 && ask > bid) {
    return (bid + ask) / 2;
  }
  
  // Fallback to last trade price if available
  if (lastPrice > 0) {
    return outcome === 'yes' ? lastPrice : (1 - lastPrice);
  }
  
  // Use ask price if available (more conservative than bid)
  if (ask > 0) {
    return ask;
  }
  
  // Use bid price if available
  if (bid > 0) {
    return bid;
  }
  
  // Default fallback
  return 0.5;
}

async function testKalshiVolumeFix(): Promise<void> {
  console.log("🧪 Testing Kalshi volume fix using liquidity as proxy...\n");
  
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  try {
    // Fetch sample Kalshi data
    const response = await fetch("https://api.elections.kalshi.com/trade-api/v2/markets?limit=20", {
      headers: { "Accept": "application/json", "User-Agent": "MarketFinder/1.0" },
    });
    
    if (!response.ok) throw new Error(`Kalshi API error: ${response.status}`);
    
    const data = await response.json();
    const allMarkets: KalshiMarket[] = data.markets || [];
    
    // Apply our current filtering logic
    const activeMarkets = allMarkets.filter(market => {
      try {
        return market.close_time > new Date().toISOString() &&
               (market.status === "active" || market.status === "initialized") &&
               market.ticker;
      } catch (e) { return false; }
    });
    
    console.log(`📊 Processing ${activeMarkets.length} active Kalshi markets`);
    
    // Transform markets with new volume logic
    const processedMarkets = activeMarkets.map(market => {
      const title = market.title || 'Untitled Market';
      
      // Enhanced categorization
      let category = "other";
      const lowerTitle = title.toLowerCase();
      if (lowerTitle.includes("trump") || lowerTitle.includes("biden") || lowerTitle.includes("election") || 
          lowerTitle.includes("president") || lowerTitle.includes("nomination") || lowerTitle.includes("ambassador") ||
          lowerTitle.includes("congress") || lowerTitle.includes("senate")) {
        category = "politics";
      } else if (lowerTitle.includes("bitcoin") || lowerTitle.includes("crypto") || lowerTitle.includes("ethereum")) {
        category = "crypto";
      } else if (lowerTitle.includes("economy") || lowerTitle.includes("gdp") || lowerTitle.includes("inflation") ||
                 lowerTitle.includes("recession") || lowerTitle.includes("fed") || lowerTitle.includes("interest")) {
        category = "economics";
      } else if (lowerTitle.includes("climate") || lowerTitle.includes("temperature") || lowerTitle.includes("weather")) {
        category = "climate";
      } else if (lowerTitle.includes("sports") || lowerTitle.includes("nfl") || lowerTitle.includes("nba") ||
                 lowerTitle.includes("championship") || lowerTitle.includes("world cup") || lowerTitle.includes("olympics")) {
        category = "sports";
      } else if (lowerTitle.includes("tech") || lowerTitle.includes("ai") || lowerTitle.includes("apple") ||
                 lowerTitle.includes("google") || lowerTitle.includes("tesla")) {
        category = "technology";
      }
      
      return {
        platform: 'kalshi',
        external_id: market.ticker,
        title,
        description: market.subtitle || title,
        category,
        yes_price: calculateKalshiPrice(market, 'yes'),
        no_price: calculateKalshiPrice(market, 'no'),
        // NEW: Use liquidity as proxy for volume (scaled down)
        volume: parseFloat(String(market.liquidity || 0)) / 1000, // Scale liquidity to volume-like range
        liquidity: parseFloat(String(market.liquidity || market.open_interest || 0)),
        end_date: market.close_time,
        is_active: true,
        start_date: null,
        raw_data: JSON.stringify(market)
      };
    });
    
    // Create test database
    instance = await DuckDBInstance.create(DB_PATH);
    connection = await instance.connect();
    
    // Create schema
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
        end_date VARCHAR,
        is_active BOOLEAN,
        start_date VARCHAR,
        raw_data VARCHAR
      )
    `);
    
    // Insert test data
    for (const market of processedMarkets) {
      const marketId = `kalshi-${market.external_id}`;
      const title = market.title.replace(/'/g, "''");
      const description = market.description.replace(/'/g, "''");
      const category = market.category.replace(/'/g, "''");
      const endDate = market.end_date ? `'${market.end_date}'` : 'NULL';
      const startDate = market.start_date ? `'${market.start_date}'` : 'NULL';
      const rawData = market.raw_data.replace(/'/g, "''");
      
      await connection.run(`
        INSERT OR IGNORE INTO test_markets (
          id, platform, external_id, title, description, category,
          yes_price, no_price, volume, liquidity, end_date, is_active,
          start_date, raw_data
        ) VALUES (
          '${marketId}', 'kalshi', '${market.external_id}', '${title}', 
          '${description}', '${category}', ${market.yes_price}, ${market.no_price}, 
          ${market.volume}, ${market.liquidity}, ${endDate}, ${market.is_active}, 
          ${startDate}, '${rawData}'
        )
      `);
    }
    
    // Test analysis
    console.log("\\n📊 RESULTS WITH LIQUIDITY-BASED VOLUME:");
    
    // Basic stats
    const statsResult = await connection.run(`
      SELECT 
        COUNT(*) as total_markets,
        AVG(volume) as avg_volume,
        MAX(volume) as max_volume,
        SUM(CASE WHEN volume > 100 THEN 1 ELSE 0 END) as high_volume_count,
        AVG(liquidity) as avg_liquidity,
        MAX(liquidity) as max_liquidity
      FROM test_markets
    `);
    const stats = (await statsResult.getRows())[0];
    const [total_markets, avg_volume, max_volume, high_volume_count, avg_liquidity, max_liquidity] = stats;
    
    console.log(`✅ Total markets: ${Number(total_markets)}`);
    console.log(`📈 Average volume (liquidity/1000): $${Number(avg_volume).toFixed(2)}`);
    console.log(`🔥 Max volume: $${Number(max_volume).toFixed(2)}`);
    console.log(`💰 High volume markets (>$100): ${Number(high_volume_count)}`);
    console.log(`💧 Average liquidity: $${Number(avg_liquidity).toLocaleString()}`);
    console.log(`🌊 Max liquidity: $${Number(max_liquidity).toLocaleString()}`);
    
    // Show top markets by volume
    const topResult = await connection.run(`
      SELECT title, volume, liquidity, category
      FROM test_markets 
      ORDER BY volume DESC 
      LIMIT 5
    `);
    const topMarkets = await topResult.getRows();
    
    console.log("\\n🏆 Top markets by volume (liquidity-based):");
    topMarkets.forEach((row, i) => {
      const [title, volume, liquidity, category] = row;
      console.log(`  ${i+1}. "${String(title).substring(0, 40)}..."`);
      console.log(`     Volume: $${Number(volume).toFixed(2)}, Liquidity: $${Number(liquidity).toLocaleString()}, Category: ${category}`);
    });
    
    console.log("\\n🎯 COMPARISON:");
    console.log("Before fix:");
    console.log("  - Volume: $14.58 avg, 14 high-volume markets");
    console.log("  - High volume threshold: >$1,000");
    console.log("After fix:");
    console.log(`  - Volume: $${Number(avg_volume).toFixed(2)} avg, ${Number(high_volume_count)} high-volume markets`);
    console.log("  - High volume threshold: >$100 (adjusted for liquidity-based volume)");
    console.log("  - Volume now represents market liquidity activity");
    
  } catch (error) {
    console.error("❌ Test failed:", error instanceof Error ? error.message : String(error));
  } finally {
    // Resources auto-cleanup
  }
}

testKalshiVolumeFix();
git // Test the Kalshi volume fix using liquidity as proxy
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import fetch from 'node-fetch';

const DB_PATH = './data/test-kalshi-volume.db';

interface KalshiMarket {
  ticker: string;
  title: string;
  subtitle?: string;
  close_time: string;
  status: string;
  yes_ask?: number;
  yes_bid?: number;
  no_ask?: number;
  no_bid?: number;
  last_price?: number;
  volume?: number;
  volume_24h?: number;
  open_interest?: number;
  liquidity?: number;
  category?: string;
}

// Helper function to calculate representative price for Kalshi markets
function calculateKalshiPrice(market: KalshiMarket, outcome: 'yes' | 'no'): number {
  const bidField = outcome === 'yes' ? 'yes_bid' : 'no_bid';
  const askField = outcome === 'yes' ? 'yes_ask' : 'no_ask';
  
  const bid = parseFloat(String((market as any)[bidField] || 0));
  const ask = parseFloat(String((market as any)[askField] || 0));
  const lastPrice = parseFloat(String(market.last_price || 0));
  
  // Use bid-ask midpoint if both are available and reasonable
  if (bid > 0 && ask > 0 && ask > bid) {
    return (bid + ask) / 2;
  }
  
  // Fallback to last trade price if available
  if (lastPrice > 0) {
    return outcome === 'yes' ? lastPrice : (1 - lastPrice);
  }
  
  // Use ask price if available (more conservative than bid)
  if (ask > 0) {
    return ask;
  }
  
  // Use bid price if available
  if (bid > 0) {
    return bid;
  }
  
  // Default fallback
  return 0.5;
}

async function testKalshiVolumeFix(): Promise<void> {
  console.log("🧪 Testing Kalshi volume fix using liquidity as proxy...\n");
  
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  try {
    // Fetch sample Kalshi data
    const response = await fetch("https://api.elections.kalshi.com/trade-api/v2/markets?limit=20", {
      headers: { "Accept": "application/json", "User-Agent": "MarketFinder/1.0" },
    });
    
    if (!response.ok) throw new Error(`Kalshi API error: ${response.status}`);
    
    const data = await response.json();
    const allMarkets: KalshiMarket[] = data.markets || [];
    
    // Apply our current filtering logic
    const activeMarkets = allMarkets.filter(market => {
      try {
        return market.close_time > new Date().toISOString() &&
               (market.status === "active" || market.status === "initialized") &&
               market.ticker;
      } catch (e) { return false; }
    });
    
    console.log(`📊 Processing ${activeMarkets.length} active Kalshi markets`);
    
    // Transform markets with new volume logic
    const processedMarkets = activeMarkets.map(market => {
      const title = market.title || 'Untitled Market';
      
      // Enhanced categorization
      let category = "other";
      const lowerTitle = title.toLowerCase();
      if (lowerTitle.includes("trump") || lowerTitle.includes("biden") || lowerTitle.includes("election") || 
          lowerTitle.includes("president") || lowerTitle.includes("nomination") || lowerTitle.includes("ambassador") ||
          lowerTitle.includes("congress") || lowerTitle.includes("senate")) {
        category = "politics";
      } else if (lowerTitle.includes("bitcoin") || lowerTitle.includes("crypto") || lowerTitle.includes("ethereum")) {
        category = "crypto";
      } else if (lowerTitle.includes("economy") || lowerTitle.includes("gdp") || lowerTitle.includes("inflation") ||
                 lowerTitle.includes("recession") || lowerTitle.includes("fed") || lowerTitle.includes("interest")) {
        category = "economics";
      } else if (lowerTitle.includes("climate") || lowerTitle.includes("temperature") || lowerTitle.includes("weather")) {
        category = "climate";
      } else if (lowerTitle.includes("sports") || lowerTitle.includes("nfl") || lowerTitle.includes("nba") ||
                 lowerTitle.includes("championship") || lowerTitle.includes("world cup") || lowerTitle.includes("olympics")) {
        category = "sports";
      } else if (lowerTitle.includes("tech") || lowerTitle.includes("ai") || lowerTitle.includes("apple") ||
                 lowerTitle.includes("google") || lowerTitle.includes("tesla")) {
        category = "technology";
      }
      
      return {
        platform: 'kalshi',
        external_id: market.ticker,
        title,
        description: market.subtitle || title,
        category,
        yes_price: calculateKalshiPrice(market, 'yes'),
        no_price: calculateKalshiPrice(market, 'no'),
        // NEW: Use liquidity as proxy for volume (scaled down)
        volume: parseFloat(String(market.liquidity || 0)) / 1000, // Scale liquidity to volume-like range
        liquidity: parseFloat(String(market.liquidity || market.open_interest || 0)),
        end_date: market.close_time,
        is_active: true,
        start_date: null,
        raw_data: JSON.stringify(market)
      };
    });
    
    // Create test database
    instance = await DuckDBInstance.create(DB_PATH);
    connection = await instance.connect();
    
    // Create schema
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
        end_date VARCHAR,
        is_active BOOLEAN,
        start_date VARCHAR,
        raw_data VARCHAR
      )
    `);
    
    // Insert test data
    for (const market of processedMarkets) {
      const marketId = `kalshi-${market.external_id}`;
      const title = market.title.replace(/'/g, "''");
      const description = market.description.replace(/'/g, "''");
      const category = market.category.replace(/'/g, "''");
      const endDate = market.end_date ? `'${market.end_date}'` : 'NULL';
      const startDate = market.start_date ? `'${market.start_date}'` : 'NULL';
      const rawData = market.raw_data.replace(/'/g, "''");
      
      await connection.run(`
        INSERT OR IGNORE INTO test_markets (
          id, platform, external_id, title, description, category,
          yes_price, no_price, volume, liquidity, end_date, is_active,
          start_date, raw_data
        ) VALUES (
          '${marketId}', 'kalshi', '${market.external_id}', '${title}', 
          '${description}', '${category}', ${market.yes_price}, ${market.no_price}, 
          ${market.volume}, ${market.liquidity}, ${endDate}, ${market.is_active}, 
          ${startDate}, '${rawData}'
        )
      `);
    }
    
    // Test analysis
    console.log("\\n📊 RESULTS WITH LIQUIDITY-BASED VOLUME:");
    
    // Basic stats
    const statsResult = await connection.run(`
      SELECT 
        COUNT(*) as total_markets,
        AVG(volume) as avg_volume,
        MAX(volume) as max_volume,
        SUM(CASE WHEN volume > 100 THEN 1 ELSE 0 END) as high_volume_count,
        AVG(liquidity) as avg_liquidity,
        MAX(liquidity) as max_liquidity
      FROM test_markets
    `);
    const stats = (await statsResult.getRows())[0];
    const [total_markets, avg_volume, max_volume, high_volume_count, avg_liquidity, max_liquidity] = stats;
    
    console.log(`✅ Total markets: ${Number(total_markets)}`);
    console.log(`📈 Average volume (liquidity/1000): $${Number(avg_volume).toFixed(2)}`);
    console.log(`🔥 Max volume: $${Number(max_volume).toFixed(2)}`);
    console.log(`💰 High volume markets (>$100): ${Number(high_volume_count)}`);
    console.log(`💧 Average liquidity: $${Number(avg_liquidity).toLocaleString()}`);
    console.log(`🌊 Max liquidity: $${Number(max_liquidity).toLocaleString()}`);
    
    // Show top markets by volume
    const topResult = await connection.run(`
      SELECT title, volume, liquidity, category
      FROM test_markets 
      ORDER BY volume DESC 
      LIMIT 5
    `);
    const topMarkets = await topResult.getRows();
    
    console.log("\\n🏆 Top markets by volume (liquidity-based):");
    topMarkets.forEach((row, i) => {
      const [title, volume, liquidity, category] = row;
      console.log(`  ${i+1}. "${String(title).substring(0, 40)}..."`);
      console.log(`     Volume: $${Number(volume).toFixed(2)}, Liquidity: $${Number(liquidity).toLocaleString()}, Category: ${category}`);
    });
    
    console.log("\\n🎯 COMPARISON:");
    console.log("Before fix:");
    console.log("  - Volume: $14.58 avg, 14 high-volume markets");
    console.log("  - High volume threshold: >$1,000");
    console.log("After fix:");
    console.log(`  - Volume: $${Number(avg_volume).toFixed(2)} avg, ${Number(high_volume_count)} high-volume markets`);
    console.log("  - High volume threshold: >$100 (adjusted for liquidity-based volume)");
    console.log("  - Volume now represents market liquidity activity");
    
  } catch (error) {
    console.error("❌ Test failed:", error instanceof Error ? error.message : String(error));
  } finally {
    // Resources auto-cleanup
  }
}

testKalshiVolumeFix();