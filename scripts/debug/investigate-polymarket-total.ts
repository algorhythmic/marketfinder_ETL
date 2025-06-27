// Investigate total Polymarket markets to determine proper pagination limits
import fetch from 'node-fetch';

async function investigatePolymarketTotal(): Promise<void> {
  console.log("🔍 Investigating total Polymarket markets...\n");
  
  try {
    // Test large offset to see how many markets exist
    const testOffsets = [2000, 5000, 10000, 15000, 20000];
    
    for (const offset of testOffsets) {
      console.log(`📊 Testing offset ${offset}...`);
      
      const url = `https://gamma-api.polymarket.com/markets?active=true&archived=false&limit=100&offset=${offset}&order=startDate&ascending=false`;
      
      const response = await fetch(url, {
        headers: { "Accept": "application/json", "User-Agent": "MarketFinder/1.0" },
      });
      
      if (!response.ok) {
        console.log(`   ❌ API error at offset ${offset}: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      const markets = Array.isArray(data) ? data : data.markets || [];
      
      console.log(`   ✅ Offset ${offset}: ${markets.length} markets returned`);
      
      if (markets.length === 0) {
        console.log(`   🏁 Found end of data at offset ${offset}`);
        break;
      }
      
      if (markets.length < 100) {
        console.log(`   🏁 Partial batch (${markets.length}) - likely near end`);
        console.log(`   📈 Estimated total markets: ~${offset + markets.length}`);
        break;
      }
    }
    
    // Test different API parameters to see if they affect count
    console.log(`\n🔎 Testing different API parameters:`);
    
    const paramTests = [
      "?active=true&archived=false&limit=1",
      "?active=true&limit=1", 
      "?limit=1",
      "?active=true&archived=false&closed=false&limit=1"
    ];
    
    for (const params of paramTests) {
      const url = `https://gamma-api.polymarket.com/markets${params}`;
      console.log(`   Testing: ${params}`);
      
      const response = await fetch(url, {
        headers: { "Accept": "application/json", "User-Agent": "MarketFinder/1.0" },
      });
      
      if (response.ok) {
        const data = await response.json();
        const markets = Array.isArray(data) ? data : data.markets || [];
        console.log(`     Returns ${markets.length} market(s)`);
        
        // Check if response includes total count metadata
        if (typeof data === 'object' && !Array.isArray(data)) {
          console.log(`     Response keys:`, Object.keys(data));
          if (data.total) console.log(`     Total field: ${data.total}`);
          if (data.count) console.log(`     Count field: ${data.count}`);
          if (data.pagination) console.log(`     Pagination:`, data.pagination);
        }
      } else {
        console.log(`     ❌ Failed: ${response.status}`);
      }
    }
    
    // Binary search to find exact end point
    console.log(`\n🎯 Binary search for exact endpoint:`);
    let low = 2000;
    let high = 25000; // Conservative upper bound
    let lastValidOffset = 2000;
    
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      console.log(`   Testing offset ${mid} (range: ${low}-${high})`);
      
      const url = `https://gamma-api.polymarket.com/markets?active=true&archived=false&limit=100&offset=${mid}&order=startDate&ascending=false`;
      
      const response = await fetch(url, {
        headers: { "Accept": "application/json", "User-Agent": "MarketFinder/1.0" },
      });
      
      if (response.ok) {
        const data = await response.json();
        const markets = Array.isArray(data) ? data : data.markets || [];
        
        if (markets.length > 0) {
          lastValidOffset = mid;
          console.log(`     ✅ ${markets.length} markets found`);
          low = mid + 1;
        } else {
          console.log(`     📍 No markets at offset ${mid}`);
          high = mid - 1;
        }
      } else {
        console.log(`     ❌ API error: ${response.status}`);
        high = mid - 1;
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\n📊 RESULTS:`);
    console.log(`✅ Last valid offset: ${lastValidOffset}`);
    console.log(`📈 Estimated total markets: ${lastValidOffset + 100} (minimum)`);
    console.log(`🔄 Current script limit: 2000 markets (20 batches)`);
    console.log(`❗ Missing approximately: ${lastValidOffset + 100 - 2000} markets`);
    
    // Recommend new batch settings
    const totalEstimate = lastValidOffset + 100;
    const recommendedBatches = Math.ceil(totalEstimate / 100) + 5; // Add buffer
    console.log(`\n💡 RECOMMENDATIONS:`);
    console.log(`   Update MAX_POLYMARKET_BATCHES to: ${recommendedBatches}`);
    console.log(`   This will capture ~${recommendedBatches * 100} markets`);
    
  } catch (error) {
    console.error("❌ Investigation failed:", error instanceof Error ? error.message : String(error));
  }
}

investigatePolymarketTotal();