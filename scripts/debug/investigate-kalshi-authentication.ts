// Investigate why we can access Kalshi data without authentication
import fetch from 'node-fetch';

async function investigateKalshiAuthentication(): Promise<void> {
  console.log("🔍 KALSHI AUTHENTICATION INVESTIGATION");
  console.log("=" .repeat(60));
  
  try {
    // Test different endpoint patterns to understand what's public vs private
    const endpoints = [
      // Market data endpoints (currently working)
      { path: "/trade-api/v2/exchange/status", description: "Exchange Status", expectPublic: true },
      { path: "/trade-api/v2/events?limit=5", description: "Events List", expectPublic: true },
      { path: "/trade-api/v2/markets?limit=5", description: "Markets List", expectPublic: true },
      { path: "/trade-api/v2/markets/KXWARMING-50", description: "Specific Market", expectPublic: true },
      
      // Trading/account endpoints (should require auth)
      { path: "/trade-api/v2/portfolio/balance", description: "Account Balance", expectPublic: false },
      { path: "/trade-api/v2/portfolio/orders", description: "Orders", expectPublic: false },
      { path: "/trade-api/v2/portfolio/positions", description: "Positions", expectPublic: false },
      { path: "/trade-api/v2/markets/trades", description: "Market Trades", expectPublic: false },
      
      // Possibly public endpoints
      { path: "/trade-api/v2/series", description: "Series", expectPublic: true },
      { path: "/trade-api/v2/markets/history", description: "Market History", expectPublic: false }
    ];
    
    console.log("\n📡 Testing API Endpoints:");
    
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`https://api.elections.kalshi.com${endpoint.path}`, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'MarketFinder-Investigation/1.0'
          }
        });
        
        const statusIcon = response.ok ? "✅" : response.status === 401 ? "🔒" : "❌";
        const publicMatch = (response.ok && endpoint.expectPublic) || (!response.ok && !endpoint.expectPublic);
        const matchIcon = publicMatch ? "✓" : "⚠️";
        
        console.log(`   ${statusIcon} ${matchIcon} ${endpoint.description}: ${response.status} ${response.statusText}`);
        
        // For successful responses, check what data we get
        if (response.ok) {
          const data = await response.json();
          const dataKeys = Object.keys(data);
          console.log(`       Data fields: ${dataKeys.join(', ')}`);
          
          // Check if we're getting volume/liquidity data
          if (data.markets && data.markets.length > 0) {
            const market = data.markets[0];
            const hasVolume = market.volume !== undefined;
            const hasLiquidity = market.liquidity !== undefined;
            const hasOpenInterest = market.open_interest !== undefined;
            console.log(`       Market data: volume=${hasVolume}, liquidity=${hasLiquidity}, open_interest=${hasOpenInterest}`);
          }
          
          if (data.market) {
            const market = data.market;
            const hasVolume = market.volume !== undefined;
            const hasLiquidity = market.liquidity !== undefined;
            const hasOpenInterest = market.open_interest !== undefined;
            console.log(`       Market data: volume=${hasVolume}, liquidity=${hasLiquidity}, open_interest=${hasOpenInterest}`);
          }
        }
        
      } catch (error) {
        console.log(`   ❌ ⚠️ ${endpoint.description}: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Test if there's a difference between authenticated and non-authenticated data
    console.log("\n🔍 Analyzing Data Access Patterns:");
    
    // Check if volume/liquidity data varies by endpoint
    const marketDataSources = [
      "/trade-api/v2/markets?limit=5",
      "/trade-api/v2/markets/KXWARMING-50"
    ];
    
    for (const source of marketDataSources) {
      try {
        const response = await fetch(`https://api.elections.kalshi.com${source}`);
        if (response.ok) {
          const data = await response.json();
          
          let sampleMarket = null;
          if (data.markets && data.markets.length > 0) {
            sampleMarket = data.markets[0];
          } else if (data.market) {
            sampleMarket = data.market;
          }
          
          if (sampleMarket) {
            console.log(`\n   ${source}:`);
            console.log(`     Title: ${sampleMarket.title}`);
            console.log(`     Volume: ${sampleMarket.volume}`);
            console.log(`     Liquidity: ${sampleMarket.liquidity}`);
            console.log(`     Open Interest: ${sampleMarket.open_interest}`);
            console.log(`     Status: ${sampleMarket.status}`);
            console.log(`     Yes Bid/Ask: ${sampleMarket.yes_bid}/${sampleMarket.yes_ask}`);
          }
        }
      } catch (error) {
        console.log(`   ❌ ${source}: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Check if we're hitting a different API or getting cached data
    console.log("\n🔍 API Endpoint Analysis:");
    console.log("   Base URL: https://api.elections.kalshi.com");
    console.log("   API Version: /trade-api/v2/");
    console.log("   Domain: elections.kalshi.com (vs kalshi.com)");
    
    // Test if main kalshi.com API is different
    try {
      const mainApiResponse = await fetch("https://kalshi.com/api/v1/markets");
      console.log(`   Main kalshi.com API: ${mainApiResponse.status}`);
    } catch (error) {
      console.log(`   Main kalshi.com API: Not accessible`);
    }
    
    console.log("\n💡 HYPOTHESIS:");
    console.log("1. 🌐 Public Market Data: Kalshi may provide public access to market data for transparency");
    console.log("2. 🔒 Trading Functions: Authentication required only for trading, orders, balances");
    console.log("3. 📊 Real-time Data: Volume/liquidity might be real-time public data");
    console.log("4. 🏛️ Regulatory: As a regulated exchange, basic market data might be required to be public");
    
    console.log("\n🚨 POTENTIAL RISKS:");
    console.log("- Rate limiting may apply to unauthenticated requests");
    console.log("- Data completeness might be limited vs authenticated access");
    console.log("- Access could be revoked or restricted in the future");
    console.log("- Some market data might be delayed or filtered");
    
    console.log("\n✅ RECOMMENDATIONS:");
    console.log("1. 📈 Current approach is working for market data collection");
    console.log("2. 🔑 Consider getting API credentials for production robustness");
    console.log("3. 📊 Monitor for any data limitations or access restrictions");
    console.log("4. 🚀 Proceed with current method for MVP, upgrade later if needed");
    
  } catch (error) {
    console.error("❌ Investigation failed:", error instanceof Error ? error.message : String(error));
  }
}

investigateKalshiAuthentication();