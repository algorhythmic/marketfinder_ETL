// Test the Kalshi status fix
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

async function testKalshiStatusFix(): Promise<void> {
  console.log("🧪 Testing Kalshi status fix...\n");
  
  try {
    const response = await fetch("https://api.elections.kalshi.com/trade-api/v2/markets?limit=50", {
      headers: { "Accept": "application/json", "User-Agent": "MarketFinder/1.0" },
    });
    
    if (!response.ok) throw new Error(`Kalshi API error: ${response.status}`);
    
    const data = await response.json();
    const allMarkets: KalshiMarket[] = data.markets || [];
    
    console.log(`📊 Total markets: ${allMarkets.length}`);
    
    // Test new filtering logic
    const activeMarkets = allMarkets.filter(market => {
      try {
        return market.close_time > new Date().toISOString() &&
               (market.status === "active" || market.status === "initialized") &&
               market.ticker;
      } catch (e) { return false; }
    });
    
    console.log(`✅ Valid markets with new filter: ${activeMarkets.length}`);
    
    // Show status distribution
    const statusCounts: Record<string, number> = {};
    allMarkets.forEach(market => {
      statusCounts[market.status] = (statusCounts[market.status] || 0) + 1;
    });
    console.log(`📈 Status distribution:`, statusCounts);
    
    // Show a few examples
    console.log(`\\n📋 Example valid markets:`);
    activeMarkets.slice(0, 3).forEach((market, i) => {
      console.log(`  ${i+1}. "${market.title}" (${market.ticker})`);
      console.log(`     Status: ${market.status}, Close: ${market.close_time}`);
    });
    
    if (activeMarkets.length === 0) {
      console.log("❌ Still no valid markets - there may be another issue");
    } else {
      console.log(`\\n🎉 Fix successful! Now finding ${activeMarkets.length} valid Kalshi markets.`);
    }
    
  } catch (error) {
    console.error("❌ Test failed:", error instanceof Error ? error.message : String(error));
  }
}

testKalshiStatusFix();