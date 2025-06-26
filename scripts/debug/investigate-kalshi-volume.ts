// Investigate Kalshi volume data issues
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

async function investigateKalshiVolume(): Promise<void> {
  console.log("🔍 Investigating Kalshi volume data issues...\n");
  
  try {
    // Fetch a sample of Kalshi markets
    const response = await fetch("https://api.elections.kalshi.com/trade-api/v2/markets?limit=20", {
      headers: { "Accept": "application/json", "User-Agent": "MarketFinder/1.0" },
    });
    
    if (!response.ok) {
      throw new Error(`Kalshi API error: ${response.status}`);
    }
    
    const data = await response.json();
    const markets: KalshiMarket[] = data.markets || [];
    
    console.log(`📊 Analyzing ${markets.length} sample Kalshi markets:\n`);
    
    // Analyze volume field availability and values
    let hasVolume = 0, hasVolume24h = 0, hasOpenInterest = 0, hasLiquidity = 0;
    let volumeSum = 0, volume24hSum = 0, openInterestSum = 0, liquiditySum = 0;
    let maxVolume = 0, maxVolume24h = 0, maxOpenInterest = 0, maxLiquidity = 0;
    
    console.log("📋 Volume field analysis:");
    console.log("Market | volume | volume_24h | open_interest | liquidity | our_calc");
    console.log("-".repeat(80));
    
    markets.forEach((market, index) => {
      // Check all possible volume-related fields
      const vol = market.volume || 0;
      const vol24h = (market as any).volume_24h || 0;
      const openInt = market.open_interest || 0;
      const liq = (market as any).liquidity || 0;
      
      // Our current calculation
      const ourVolume = parseFloat(String((market as any).volume_24h || market.volume || 0));
      
      if (vol > 0) hasVolume++;
      if (vol24h > 0) hasVolume24h++;
      if (openInt > 0) hasOpenInterest++;
      if (liq > 0) hasLiquidity++;
      
      volumeSum += vol;
      volume24hSum += vol24h;
      openInterestSum += openInt;
      liquiditySum += liq;
      
      maxVolume = Math.max(maxVolume, vol);
      maxVolume24h = Math.max(maxVolume24h, vol24h);
      maxOpenInterest = Math.max(maxOpenInterest, openInt);
      maxLiquidity = Math.max(maxLiquidity, liq);
      
      if (index < 10) { // Show first 10 markets
        console.log(`${(index+1).toString().padStart(2)} | ${String(vol).padStart(6)} | ${String(vol24h).padStart(10)} | ${String(openInt).padStart(13)} | ${String(liq).padStart(9)} | ${ourVolume}`);
      }
    });
    
    console.log("\n📈 Field Availability Summary:");
    console.log(`  volume: ${hasVolume}/${markets.length} (${(hasVolume/markets.length*100).toFixed(1)}%)`);
    console.log(`  volume_24h: ${hasVolume24h}/${markets.length} (${(hasVolume24h/markets.length*100).toFixed(1)}%)`);
    console.log(`  open_interest: ${hasOpenInterest}/${markets.length} (${(hasOpenInterest/markets.length*100).toFixed(1)}%)`);
    console.log(`  liquidity: ${hasLiquidity}/${markets.length} (${(hasLiquidity/markets.length*100).toFixed(1)}%)`);
    
    console.log("\n💰 Value Statistics:");
    console.log(`  volume - avg: ${(volumeSum/markets.length).toFixed(2)}, max: ${maxVolume}`);
    console.log(`  volume_24h - avg: ${(volume24hSum/markets.length).toFixed(2)}, max: ${maxVolume24h}`);
    console.log(`  open_interest - avg: ${(openInterestSum/markets.length).toFixed(2)}, max: ${maxOpenInterest}`);
    console.log(`  liquidity - avg: ${(liquiditySum/markets.length).toFixed(2)}, max: ${maxLiquidity}`);
    
    // Check if there are other volume-related fields we're missing
    console.log("\n🔎 Checking for other volume fields:");
    if (markets.length > 0) {
      const firstMarket = markets[0];
      const allKeys = Object.keys(firstMarket);
      const volumeKeys = allKeys.filter(key => 
        key.toLowerCase().includes('volume') || 
        key.toLowerCase().includes('trade') ||
        key.toLowerCase().includes('liquidity') ||
        key.toLowerCase().includes('interest') ||
        key.toLowerCase().includes('size') ||
        key.toLowerCase().includes('amount')
      );
      console.log("  Volume-related fields found:", volumeKeys);
      
      // Show full structure of first market
      console.log("\n📊 Full market structure (first market):");
      console.log(JSON.stringify(firstMarket, null, 2));
    }
    
    // Test with popular/political markets that should have higher volume
    console.log("\n🔍 Testing with political markets (should have higher volume):");
    const politicalResponse = await fetch("https://api.elections.kalshi.com/trade-api/v2/markets?limit=10&search=trump", {
      headers: { "Accept": "application/json", "User-Agent": "MarketFinder/1.0" },
    });
    
    if (politicalResponse.ok) {
      const politicalData = await politicalResponse.json();
      const politicalMarkets: KalshiMarket[] = politicalData.markets || [];
      
      console.log(`Found ${politicalMarkets.length} political markets:`);
      politicalMarkets.forEach((market, i) => {
        const vol = market.volume || 0;
        const vol24h = (market as any).volume_24h || 0;
        const liq = (market as any).liquidity || 0;
        console.log(`  ${i+1}. "${market.title}"`);
        console.log(`     Volume: ${vol}, Volume24h: ${vol24h}, Liquidity: ${liq}`);
      });
    }
    
  } catch (error) {
    console.error("❌ Investigation failed:", error instanceof Error ? error.message : String(error));
  }
}

investigateKalshiVolume();