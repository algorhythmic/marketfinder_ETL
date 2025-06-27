// Find the actual endpoint of Polymarket data
import fetch from 'node-fetch';

async function findPolymarketEndpoint(): Promise<void> {
  console.log("🎯 Finding exact Polymarket endpoint...\n");
  
  try {
    // Continue from where we left off
    let low = 25000;
    let high = 50000; // Expand range
    let lastValidOffset = 25000;
    
    console.log("🔍 Extended binary search:");
    
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
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Now find the exact endpoint with smaller increments
    console.log(`\n🔬 Fine-tuning search from ${lastValidOffset}:`);
    
    let exactEnd = lastValidOffset;
    for (let offset = lastValidOffset; offset <= lastValidOffset + 200; offset += 10) {
      const url = `https://gamma-api.polymarket.com/markets?active=true&archived=false&limit=100&offset=${offset}&order=startDate&ascending=false`;
      
      const response = await fetch(url, {
        headers: { "Accept": "application/json", "User-Agent": "MarketFinder/1.0" },
      });
      
      if (response.ok) {
        const data = await response.json();
        const markets = Array.isArray(data) ? data : data.markets || [];
        
        if (markets.length > 0) {
          exactEnd = offset;
          console.log(`   Offset ${offset}: ${markets.length} markets`);
        } else {
          console.log(`   Offset ${offset}: No markets - found endpoint!`);
          break;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Calculate final recommendations
    const totalMarkets = exactEnd + 100; // Add buffer for last batch
    const requiredBatches = Math.ceil(totalMarkets / 100) + 10; // Add safety buffer
    
    console.log(`\n📊 FINAL RESULTS:`);
    console.log(`🎯 Exact endpoint: ~${exactEnd}`);
    console.log(`📈 Total estimated markets: ${totalMarkets}`);
    console.log(`❗ Current capture: 2,000 markets`);
    console.log(`📉 Missing markets: ${totalMarkets - 2000}`);
    console.log(`📊 Missing percentage: ${((totalMarkets - 2000) / totalMarkets * 100).toFixed(1)}%`);
    
    console.log(`\n🔧 REQUIRED UPDATES:`);
    console.log(`   Change MAX_POLYMARKET_BATCHES from 20 to ${requiredBatches}`);
    console.log(`   This will capture ${requiredBatches * 100} markets (safe margin)`);
    
    // Show impact on processing time
    const currentTime = 21.6; // seconds from last run
    const estimatedNewTime = (currentTime / 2000) * totalMarkets;
    console.log(`\n⏱️  PERFORMANCE IMPACT:`);
    console.log(`   Current processing time: ${currentTime}s for 2,000 markets`);
    console.log(`   Estimated time for ${totalMarkets} markets: ${estimatedNewTime.toFixed(1)}s`);
    console.log(`   Additional time needed: +${(estimatedNewTime - currentTime).toFixed(1)}s`);
    
  } catch (error) {
    console.error("❌ Endpoint search failed:", error instanceof Error ? error.message : String(error));
  }
}

findPolymarketEndpoint();