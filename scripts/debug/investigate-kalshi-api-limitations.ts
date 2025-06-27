// Investigate Kalshi API limitations and authentication requirements
import fetch from 'node-fetch';

async function investigateKalshiAPI(): Promise<void> {
  console.log("🔍 KALSHI API INVESTIGATION");
  console.log("=" .repeat(60));
  
  try {
    // 1. Test different public endpoints
    console.log("\n📡 Testing Public API Endpoints:");
    
    // Exchange status
    console.log("\n1. Exchange Status:");
    const statusResponse = await fetch("https://api.elections.kalshi.com/trade-api/v2/exchange/status");
    if (statusResponse.ok) {
      const status = await statusResponse.json();
      console.log(`   ✅ Status: ${JSON.stringify(status)}`);
    } else {
      console.log(`   ❌ Status Error: ${statusResponse.status}`);
    }
    
    // Events endpoint - check limits
    console.log("\n2. Events Endpoint Analysis:");
    const eventsLimits = [10, 50, 100, 200, 500, 1000];
    
    for (const limit of eventsLimits) {
      try {
        const response = await fetch(`https://api.elections.kalshi.com/trade-api/v2/events?limit=${limit}`);
        if (response.ok) {
          const data = await response.json();
          const events = data.events || [];
          console.log(`   📊 Limit ${limit}: ${events.length} events returned, cursor: ${data.cursor ? 'Yes' : 'No'}`);
        } else {
          console.log(`   ❌ Limit ${limit}: Error ${response.status}`);
        }
      } catch (error) {
        console.log(`   ❌ Limit ${limit}: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // 3. Test pagination on events
    console.log("\n3. Events Pagination Test:");
    let eventCursor: string | undefined = undefined;
    let totalEvents = 0;
    let pageCount = 0;
    const maxPages = 10;
    
    while (pageCount < maxPages) {
      try {
        let url = "https://api.elections.kalshi.com/trade-api/v2/events?limit=100";
        if (eventCursor) {
          url += `&cursor=${eventCursor}`;
        }
        
        const response = await fetch(url);
        if (!response.ok) {
          console.log(`   ❌ Page ${pageCount + 1}: Error ${response.status}`);
          break;
        }
        
        const data = await response.json();
        const events = data.events || [];
        totalEvents += events.length;
        
        console.log(`   📄 Page ${pageCount + 1}: ${events.length} events (Total: ${totalEvents})`);
        
        if (!data.cursor || events.length === 0) {
          console.log(`   📝 Pagination complete`);
          break;
        }
        
        eventCursor = data.cursor;
        pageCount++;
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.log(`   ❌ Page ${pageCount + 1}: ${error instanceof Error ? error.message : String(error)}`);
        break;
      }
    }
    
    console.log(`   📊 Total events discovered: ${totalEvents}`);
    
    // 4. Test markets endpoint with different parameters
    console.log("\n4. Markets Endpoint Analysis:");
    
    const marketTests = [
      { params: "", description: "Default" },
      { params: "?limit=1000", description: "High limit" },
      { params: "?status=active", description: "Active only" },
      { params: "?event_ticker=KXPRESIDENTIAL", description: "Specific event" }
    ];
    
    for (const test of marketTests) {
      try {
        const response = await fetch(`https://api.elections.kalshi.com/trade-api/v2/markets${test.params}`);
        if (response.ok) {
          const data = await response.json();
          const markets = data.markets || [];
          console.log(`   📊 ${test.description}: ${markets.length} markets, cursor: ${data.cursor ? 'Yes' : 'No'}`);
        } else {
          console.log(`   ❌ ${test.description}: Error ${response.status}`);
        }
      } catch (error) {
        console.log(`   ❌ ${test.description}: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // 5. Test if we can access markets for specific events
    console.log("\n5. Event-Specific Markets Test:");
    
    // Get a few event tickers first
    const eventsResponse = await fetch("https://api.elections.kalshi.com/trade-api/v2/events?limit=5");
    if (eventsResponse.ok) {
      const eventsData = await eventsResponse.json();
      const events = eventsData.events || [];
      
      for (const event of events.slice(0, 3)) {
        try {
          const response = await fetch(`https://api.elections.kalshi.com/trade-api/v2/markets?event_ticker=${event.event_ticker}`);
          if (response.ok) {
            const data = await response.json();
            const markets = data.markets || [];
            console.log(`   📊 Event "${event.title}": ${markets.length} markets`);
            
            // Show sample market data
            if (markets.length > 0) {
              const sample = markets[0];
              console.log(`     Sample: ${sample.title} (${sample.ticker}) - Vol: ${sample.volume || 0}, Liq: ${sample.liquidity || 0}`);
            }
          } else {
            console.log(`   ❌ Event "${event.title}": Error ${response.status}`);
          }
        } catch (error) {
          console.log(`   ❌ Event "${event.title}": ${error instanceof Error ? error.message : String(error)}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // 6. Authentication requirements analysis
    console.log("\n6. Authentication Requirements Analysis:");
    
    const protectedEndpoints = [
      "/trade-api/v2/portfolio/balance",
      "/trade-api/v2/portfolio/orders",
      "/trade-api/v2/markets/trades"
    ];
    
    for (const endpoint of protectedEndpoints) {
      try {
        const response = await fetch(`https://api.elections.kalshi.com${endpoint}`);
        console.log(`   ${endpoint}: ${response.status} ${response.statusText}`);
      } catch (error) {
        console.log(`   ${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // 7. Recommendations
    console.log("\n💡 ANALYSIS & RECOMMENDATIONS:");
    
    if (totalEvents > 100) {
      console.log(`✅ Events pagination works: ${totalEvents} total events available`);
    } else {
      console.log(`⚠️ Limited events access: only ${totalEvents} events`);
    }
    
    console.log("\n🔧 NEXT STEPS:");
    console.log("1. 📈 Use events endpoint to discover all available events");
    console.log("2. 🎯 For each event, fetch markets using event_ticker parameter");
    console.log("3. 🔑 Consider getting Kalshi API credentials for full access");
    console.log("4. 📊 Compare public vs authenticated data coverage");
    
    console.log("\n🚨 POTENTIAL ISSUES:");
    console.log("- Public API may have rate limits or data restrictions");
    console.log("- Authentication might be required for complete market data");
    console.log("- Volume/liquidity data might be limited in public endpoints");
    
  } catch (error) {
    console.error("❌ Investigation failed:", error instanceof Error ? error.message : String(error));
  }
}

investigateKalshiAPI();