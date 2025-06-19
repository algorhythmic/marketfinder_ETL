// Debug Kalshi fetching issues
import fetch from 'node-fetch';

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

async function debugKalshiFetch(): Promise<void> {
  console.log("🔍 Debugging Kalshi fetch issues...\n");
  
  try {
    // Test the exact same URL pattern used in populate-exhaustive-database.ts
    const url = "https://api.elections.kalshi.com/trade-api/v2/markets?limit=100&status=open";
    console.log(`📡 Testing URL: ${url}`);
    
    const response = await fetch(url, {
      headers: { 
        "Accept": "application/json", 
        "User-Agent": "MarketFinder/1.0" 
      },
    });
    
    console.log(`📈 Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      console.error(`❌ API error: ${response.status}`);
      const text = await response.text();
      console.log(`Response body: ${text.substring(0, 500)}...`);
      return;
    }
    
    const data = await response.json();
    console.log(`📊 Response structure:`);
    console.log(`  - Type: ${Array.isArray(data) ? 'Array' : typeof data}`);
    console.log(`  - Keys: ${Object.keys(data || {}).join(', ')}`);
    
    const markets: KalshiMarket[] = data.markets || [];
    console.log(`  - Markets array length: ${markets.length}`);
    
    if (markets.length === 0) {
      console.log("⚠️  No markets in response!");
      console.log("Full response:", JSON.stringify(data, null, 2));
      return;
    }
    
    // Test filtering logic
    console.log(`\\n🔎 Testing filtering logic:`);
    const currentTime = new Date().toISOString();
    console.log(`  Current time: ${currentTime}`);
    
    let validCount = 0;
    let timeFilterFails = 0;
    let statusFilterFails = 0;
    let tickerFilterFails = 0;
    
    markets.forEach((market, index) => {
      const hasValidTime = market.close_time > currentTime;
      const hasValidStatus = market.status === "open" || market.status === "initialized";
      const hasTicker = !!market.ticker;
      
      if (!hasValidTime) timeFilterFails++;
      if (!hasValidStatus) statusFilterFails++;
      if (!hasTicker) tickerFilterFails++;
      
      if (hasValidTime && hasValidStatus && hasTicker) {
        validCount++;
        if (index < 3) { // Show details for first 3 valid markets
          console.log(`  ✅ Valid market ${validCount}: "${market.title}"`);
          console.log(`     Ticker: ${market.ticker}`);
          console.log(`     Status: ${market.status}`);
          console.log(`     Close: ${market.close_time}`);
        }
      } else if (index < 3) { // Show details for first 3 invalid markets
        console.log(`  ❌ Invalid market ${index + 1}: "${market.title}"`);
        console.log(`     Ticker: ${market.ticker} (${hasTicker ? 'OK' : 'MISSING'})`);
        console.log(`     Status: ${market.status} (${hasValidStatus ? 'OK' : 'INVALID'})`);
        console.log(`     Close: ${market.close_time} (${hasValidTime ? 'OK' : 'EXPIRED'})`);
      }
    });
    
    console.log(`\\n📈 Filter Results:`);
    console.log(`  Total markets: ${markets.length}`);
    console.log(`  Valid markets: ${validCount}`);
    console.log(`  Failed filters:`);
    console.log(`    - Time filter: ${timeFilterFails} markets`);
    console.log(`    - Status filter: ${statusFilterFails} markets`);
    console.log(`    - Ticker filter: ${tickerFilterFails} markets`);
    
    if (validCount === 0) {
      console.log("\\n🚨 NO VALID MARKETS FOUND!");
      console.log("This explains why 0 Kalshi markets were populated.");
      
      // Try a different API call without status filter
      console.log("\\n🔄 Trying without status filter...");
      const url2 = "https://api.elections.kalshi.com/trade-api/v2/markets?limit=100";
      const response2 = await fetch(url2, {
        headers: { 
          "Accept": "application/json", 
          "User-Agent": "MarketFinder/1.0" 
        },
      });
      
      if (response2.ok) {
        const data2 = await response2.json();
        const markets2: KalshiMarket[] = data2.markets || [];
        console.log(`  Found ${markets2.length} markets without status filter`);
        
        // Check status distribution
        const statusCounts: Record<string, number> = {};
        markets2.forEach(market => {
          statusCounts[market.status] = (statusCounts[market.status] || 0) + 1;
        });
        console.log(`  Status distribution:`, statusCounts);
      }
    } else {
      console.log(`\\n✅ Found ${validCount} valid Kalshi markets!`);
    }
    
  } catch (error) {
    console.error("❌ Debug failed:", error instanceof Error ? error.message : String(error));
  }
}

debugKalshiFetch();