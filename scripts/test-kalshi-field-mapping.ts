// Test the improved Kalshi field mapping without database storage
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

async function testKalshiFieldMapping(): Promise<void> {
  console.log("🧪 Testing improved Kalshi field mapping...\n");
  
  try {
    // Fetch a small sample of Kalshi markets
    const response = await fetch("https://api.elections.kalshi.com/trade-api/v2/markets?limit=10&status=open", {
      headers: { "Accept": "application/json", "User-Agent": "MarketFinder/1.0" },
    });
    
    if (!response.ok) {
      throw new Error(`Kalshi API error: ${response.status}`);
    }
    
    const data = await response.json();
    const markets: KalshiMarket[] = data.markets || [];
    
    console.log(`📊 Analyzing ${markets.length} sample Kalshi markets:\n`);
    
    // Analyze field availability and pricing
    let hasYesBid = 0, hasYesAsk = 0, hasNoBid = 0, hasNoAsk = 0;
    let hasVolume = 0, hasVolume24h = 0, hasLiquidity = 0, hasOpenInterest = 0;
    let hasLastPrice = 0;
    let validPrices = 0;
    
    markets.forEach((market, index) => {
      console.log(`Market ${index + 1}: "${market.title}"`);
      console.log(`  Ticker: ${market.ticker}`);
      
      // Check field availability
      if ((market as any).yes_bid !== undefined) hasYesBid++;
      if (market.yes_ask !== undefined) hasYesAsk++;
      if ((market as any).no_bid !== undefined) hasNoBid++;
      if (market.no_ask !== undefined) hasNoAsk++;
      if (market.volume !== undefined) hasVolume++;
      if ((market as any).volume_24h !== undefined) hasVolume24h++;
      if ((market as any).liquidity !== undefined) hasLiquidity++;
      if (market.open_interest !== undefined) hasOpenInterest++;
      if (market.last_price !== undefined) hasLastPrice++;
      
      // Test price calculation
      const yesPrice = calculateKalshiPrice(market, 'yes');
      const noPrice = calculateKalshiPrice(market, 'no');
      
      if (yesPrice !== 0.5 || noPrice !== 0.5) {
        validPrices++;
      }
      
      console.log(`  Raw pricing data:`);
      console.log(`    yes_bid: ${(market as any).yes_bid}, yes_ask: ${market.yes_ask}`);
      console.log(`    no_bid: ${(market as any).no_bid}, no_ask: ${market.no_ask}`);
      console.log(`    last_price: ${market.last_price}`);
      console.log(`  Calculated prices: Yes=${yesPrice.toFixed(3)}, No=${noPrice.toFixed(3)}`);
      
      console.log(`  Volume data:`);
      console.log(`    volume: ${market.volume}, volume_24h: ${(market as any).volume_24h}`);
      console.log(`    Final volume: ${parseFloat(String((market as any).volume_24h || market.volume || 0))}`);
      
      console.log(`  Liquidity data:`);
      console.log(`    liquidity: ${(market as any).liquidity}, open_interest: ${market.open_interest}`);
      console.log(`    Final liquidity: ${parseFloat(String((market as any).liquidity || market.open_interest || 0))}`);
      
      console.log('');
    });
    
    // Summary statistics
    console.log("📈 Field Availability Summary:");
    console.log(`  yes_bid: ${hasYesBid}/${markets.length} (${(hasYesBid/markets.length*100).toFixed(1)}%)`);
    console.log(`  yes_ask: ${hasYesAsk}/${markets.length} (${(hasYesAsk/markets.length*100).toFixed(1)}%)`);
    console.log(`  no_bid: ${hasNoBid}/${markets.length} (${(hasNoBid/markets.length*100).toFixed(1)}%)`);
    console.log(`  no_ask: ${hasNoAsk}/${markets.length} (${(hasNoAsk/markets.length*100).toFixed(1)}%)`);
    console.log(`  last_price: ${hasLastPrice}/${markets.length} (${(hasLastPrice/markets.length*100).toFixed(1)}%)`);
    console.log(`  volume: ${hasVolume}/${markets.length} (${(hasVolume/markets.length*100).toFixed(1)}%)`);
    console.log(`  volume_24h: ${hasVolume24h}/${markets.length} (${(hasVolume24h/markets.length*100).toFixed(1)}%)`);
    console.log(`  liquidity: ${hasLiquidity}/${markets.length} (${(hasLiquidity/markets.length*100).toFixed(1)}%)`);
    console.log(`  open_interest: ${hasOpenInterest}/${markets.length} (${(hasOpenInterest/markets.length*100).toFixed(1)}%)`);
    console.log(`\\n💰 Price Calculation:`);
    console.log(`  Markets with non-default prices: ${validPrices}/${markets.length} (${(validPrices/markets.length*100).toFixed(1)}%)`);
    
    console.log("\\n✅ Field mapping test completed!");
    
  } catch (error) {
    console.error("❌ Test failed:", error instanceof Error ? error.message : String(error));
  }
}

testKalshiFieldMapping();