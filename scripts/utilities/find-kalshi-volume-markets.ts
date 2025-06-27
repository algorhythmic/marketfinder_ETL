// Find Kalshi markets with actual volume data
import fetch from 'node-fetch';

async function findKalshiVolumeMarkets(): Promise<void> {
  console.log("🔍 Searching for Kalshi markets with actual volume...\n");
  
  try {
    // Try different API approaches to find markets with volume
    const searches = [
      { name: "All markets (sorted by volume)", url: "https://api.elections.kalshi.com/trade-api/v2/markets?limit=50" },
      { name: "Markets with order by volume", url: "https://api.elections.kalshi.com/trade-api/v2/markets?limit=50&order_by=volume" },
      { name: "Markets with order by volume desc", url: "https://api.elections.kalshi.com/trade-api/v2/markets?limit=50&order_by=volume&sort=desc" },
      { name: "Active markets only", url: "https://api.elections.kalshi.com/trade-api/v2/markets?limit=50&status=active" },
      { name: "Search for elections", url: "https://api.elections.kalshi.com/trade-api/v2/markets?limit=50&search=election" },
      { name: "Search for Biden", url: "https://api.elections.kalshi.com/trade-api/v2/markets?limit=50&search=biden" },
      { name: "Search for president", url: "https://api.elections.kalshi.com/trade-api/v2/markets?limit=50&search=president" }
    ];
    
    for (const search of searches) {
      console.log(`\n📊 Testing: ${search.name}`);
      console.log(`URL: ${search.url}`);
      
      const response = await fetch(search.url, {
        headers: { "Accept": "application/json", "User-Agent": "MarketFinder/1.0" },
      });
      
      if (!response.ok) {
        console.log(`   ❌ Failed: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      const markets = data.markets || [];
      
      // Find markets with non-zero volume
      const volumeMarkets = markets.filter((m: any) => (m.volume || 0) > 0 || (m.volume_24h || 0) > 0);
      const liquidityMarkets = markets.filter((m: any) => (m.liquidity || 0) > 1000);
      
      console.log(`   📈 Found ${markets.length} total markets`);
      console.log(`   💰 Markets with volume > 0: ${volumeMarkets.length}`);
      console.log(`   💧 Markets with liquidity > $1K: ${liquidityMarkets.length}`);
      
      if (volumeMarkets.length > 0) {
        console.log("   🎯 Markets with volume:");
        volumeMarkets.slice(0, 5).forEach((market: any, i: number) => {
          console.log(`     ${i+1}. "${market.title}"`);
          console.log(`        Volume: ${market.volume}, Volume24h: ${market.volume_24h}, Liquidity: ${market.liquidity}`);
        });
      }
      
      // Show highest liquidity markets
      if (liquidityMarkets.length > 0) {
        const sortedByLiquidity = liquidityMarkets.sort((a: any, b: any) => (b.liquidity || 0) - (a.liquidity || 0));
        console.log("   💧 Highest liquidity markets:");
        sortedByLiquidity.slice(0, 3).forEach((market: any, i: number) => {
          console.log(`     ${i+1}. "${market.title}"`);
          console.log(`        Liquidity: $${market.liquidity.toLocaleString()}, Volume: ${market.volume}`);
        });
      }
      
      // Check for any political/election content
      const politicalMarkets = markets.filter((m: any) => {
        const title = m.title.toLowerCase();
        return title.includes('election') || title.includes('president') || title.includes('biden') || 
               title.includes('trump') || title.includes('congress') || title.includes('nomination');
      });
      
      if (politicalMarkets.length > 0) {
        console.log(`   🏛️  Found ${politicalMarkets.length} political markets`);
        politicalMarkets.slice(0, 3).forEach((market: any, i: number) => {
          console.log(`     ${i+1}. "${market.title}"`);
          console.log(`        Volume: ${market.volume}, Liquidity: $${market.liquidity}`);
        });
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Try a different endpoint - maybe the individual market endpoint has more volume data
    console.log("\n🔍 Testing individual market endpoint...");
    
    // Get a market ticker and test individual endpoint
    const generalResponse = await fetch("https://api.elections.kalshi.com/trade-api/v2/markets?limit=5", {
      headers: { "Accept": "application/json", "User-Agent": "MarketFinder/1.0" },
    });
    
    if (generalResponse.ok) {
      const generalData = await generalResponse.json();
      const markets = generalData.markets || [];
      
      if (markets.length > 0) {
        const ticker = markets[0].ticker;
        console.log(`Testing individual market: ${ticker}`);
        
        const individualResponse = await fetch(`https://api.elections.kalshi.com/trade-api/v2/markets/${ticker}`, {
          headers: { "Accept": "application/json", "User-Agent": "MarketFinder/1.0" },
        });
        
        if (individualResponse.ok) {
          const individualData = await individualResponse.json();
          console.log("Individual market data:");
          console.log(`  Volume: ${individualData.volume}`);
          console.log(`  Volume24h: ${individualData.volume_24h}`);
          console.log(`  Liquidity: ${individualData.liquidity}`);
          console.log(`  Open Interest: ${individualData.open_interest}`);
          
          // Check for additional volume fields
          const volumeFields = Object.keys(individualData).filter(key => 
            key.toLowerCase().includes('volume') || 
            key.toLowerCase().includes('trade') ||
            key.toLowerCase().includes('traded')
          );
          console.log("  All volume-related fields:", volumeFields);
        }
      }
    }
    
    console.log("\n💡 ANALYSIS:");
    console.log("If no markets have volume > 0, this could mean:");
    console.log("1. These are new/inactive markets with no recent trading");
    console.log("2. Kalshi doesn't populate volume in the markets endpoint");
    console.log("3. We need a different API endpoint for volume data");
    console.log("4. Volume might be in different units (shares vs dollars)");
    
  } catch (error) {
    console.error("❌ Search failed:", error instanceof Error ? error.message : String(error));
  }
}

findKalshiVolumeMarkets();