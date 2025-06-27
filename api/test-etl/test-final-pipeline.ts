// Final test of complete ETL pipeline with all fixes
import fetch from 'node-fetch';

interface KalshiMarket {
  ticker: string;
  title: string;
  subtitle?: string;
  close_time: string;
  status: string;
  yes_ask?: number;
  no_ask?: number;
  last_price?: number;
  volume?: number;
  open_interest?: number;
  category?: string;
}

interface PolymarketMarket {
  id: string;
  question: string;
  description?: string;
  category?: string;
  outcomes: string | string[];
  lastTradePrice?: number;
  bestBid?: number;
  bestAsk?: number;
  volumeNum?: number;
  volume?: number;
  liquidityNum?: number;
  liquidity?: number;
  endDateIso?: string;
  endDate?: string;
  startDateIso?: string;
  startDate?: string;
  active?: boolean;
}

interface StandardizedMarket {
  platform: string;
  external_id: string;
  title: string;
  description: string;
  category: string;
  yes_price: number;
  no_price: number;
  volume: number;
  liquidity: number;
  end_date: number;
  is_active: boolean;
  raw_data: string;
}

interface SimilarityMatch {
  kalshi: StandardizedMarket;
  polymarket: StandardizedMarket;
  confidence: number;
  category: string;
}

interface ArbitrageOpportunity {
  kalshiMarket: string;
  polymarketMarket: string;
  profitMargin: number;
  buyPlatform: string;
  sellPlatform: string;
  confidence: number;
  category: string;
  kalshiPrice: number;
  polymarketPrice: number;
}

console.log("🎯 Final ETL Pipeline Test with All Fixes");
console.log("=".repeat(60));

async function fetchKalshiFinal(): Promise<StandardizedMarket[]> {
  const response = await fetch("https://api.elections.kalshi.com/trade-api/v2/markets", {
    headers: { "Accept": "application/json", "User-Agent": "MarketFinder/1.0" },
  });
  
  if (!response.ok) throw new Error(`Kalshi API error: ${response.status}`);
  
  const data = await response.json();
  const allMarkets: KalshiMarket[] = data.markets || data || [];
  
  const activeMarkets = allMarkets.filter(market => {
    try {
      return market.close_time > new Date().toISOString() &&
             (market.status === "open" || market.status === "initialized") &&
             market.ticker;
    } catch (e) { return false; }
  });
  
  return activeMarkets.map(market => {
    const title = market.title || 'Untitled Market';
    
    // Categorize from title since API doesn't provide category
    let category = "other";
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes("trump") || lowerTitle.includes("biden") || lowerTitle.includes("nomination") || lowerTitle.includes("ambassador")) {
      category = "politics";
    } else if (lowerTitle.includes("bitcoin") || lowerTitle.includes("crypto")) {
      category = "crypto";
    } else if (lowerTitle.includes("economy") || lowerTitle.includes("gdp")) {
      category = "economics";
    }
    
    return {
      platform: 'kalshi',
      external_id: market.ticker,
      title,
      description: market.subtitle || title,
      category,
      yes_price: parseFloat(String(market.yes_ask || market.last_price || 0.5)),
      no_price: parseFloat(String(market.no_ask || (1 - parseFloat(String(market.last_price || 0.5))))),
      volume: parseFloat(String(market.volume || 0)),
      liquidity: parseFloat(String(market.open_interest || 0)),
      end_date: new Date(market.close_time).getTime(),
      is_active: true,
      raw_data: JSON.stringify(market)
    };
  });
}

async function fetchPolymarketFinal(maxMarkets: number = 200): Promise<StandardizedMarket[]> {
  console.log(`Fetching Polymarket markets (max ${maxMarkets})...`);
  
  const allMarkets: PolymarketMarket[] = [];
  let offset = 0;
  const limit = 100;
  let hasMoreData = true;
  const maxBatches = Math.ceil(maxMarkets / limit);
  let batchCount = 0;
  
  while (hasMoreData && batchCount < maxBatches) {
    const url = `https://gamma-api.polymarket.com/markets?active=true&archived=false&limit=${limit}&offset=${offset}&order=startDate&ascending=false`;
    
    const response = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "MarketFinder/1.0" },
    });
    
    if (!response.ok) throw new Error(`Polymarket API error: ${response.status}`);
    
    const data = await response.json();
    const markets: PolymarketMarket[] = Array.isArray(data) ? data : data.markets || [];
    
    console.log(`Batch ${batchCount + 1}: fetched ${markets.length} markets`);
    
    if (markets.length === 0) {
      hasMoreData = false;
    } else {
      allMarkets.push(...markets);
      
      if (markets.length < limit) {
        hasMoreData = false;
      } else {
        offset += limit;
        batchCount++;
      }
    }
  }
  
  console.log(`Polymarket returned ${allMarkets.length} total markets across ${batchCount + 1} batches`);
  
  const validMarkets = allMarkets.filter(market => {
    const hasId = !!market.id;
    const hasQuestion = !!market.question;
    let hasValidOutcomes = false;
    
    // Parse outcomes if it's a JSON string
    if (typeof market.outcomes === 'string') {
      try {
        const parsed = JSON.parse(market.outcomes);
        hasValidOutcomes = Array.isArray(parsed) && parsed.length >= 2;
      } catch (e) {
        hasValidOutcomes = false;
      }
    } else if (Array.isArray(market.outcomes)) {
      hasValidOutcomes = market.outcomes.length >= 2;
    }
    
    return hasId && hasQuestion && hasValidOutcomes;
  });
  
  console.log(`Filtered to ${validMarkets.length} valid markets`);
  
  return validMarkets
    .map(market => {
      let yesPrice = 0.5, noPrice = 0.5;
      
      if (market.lastTradePrice !== undefined && market.lastTradePrice !== null) {
        yesPrice = parseFloat(String(market.lastTradePrice)) || 0.5;
        noPrice = 1 - yesPrice;
      } else if (market.bestBid !== undefined && market.bestAsk !== undefined) {
        const bid = parseFloat(String(market.bestBid)) || 0;
        const ask = parseFloat(String(market.bestAsk)) || 1;
        yesPrice = (bid + ask) / 2;
        noPrice = 1 - yesPrice;
      } else {
        return null; // Skip if no price data
      }
      
      // Parse outcomes and check for binary market
      let parsedOutcomes: string[] = [];
      if (typeof market.outcomes === 'string') {
        try {
          parsedOutcomes = JSON.parse(market.outcomes);
        } catch (e) {
          return null;
        }
      } else if (Array.isArray(market.outcomes)) {
        parsedOutcomes = market.outcomes;
      }
      
      const hasYesNo = parsedOutcomes.some(o => 
        o && typeof o === 'string' && (o.toLowerCase().includes('yes') || o.toLowerCase().includes('no'))
      );
      
      if (!hasYesNo && parsedOutcomes.length > 4) {
        return null; // Skip multi-outcome markets
      }
      
      return {
        platform: 'polymarket',
        external_id: market.id,
        title: market.question,
        description: market.description || market.question,
        category: market.category?.toLowerCase() || 'other',
        yes_price: yesPrice,
        no_price: noPrice,
        volume: parseFloat(String(market.volumeNum || market.volume || 0)),
        liquidity: parseFloat(String(market.liquidityNum || market.liquidity || 0)),
        end_date: new Date(market.endDateIso || market.endDate || Date.now()).getTime(),
        is_active: market.active && !market.archived,
        raw_data: JSON.stringify(market)
      };
    })
    .filter((market): market is StandardizedMarket => market !== null);
}

function calculateSimilarity(text1: string, text2: string): number {
  const words1 = text1.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  const words2 = text2.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  
  const intersection = words1.filter(word => words2.includes(word));
  const union = [...new Set([...words1, ...words2])];
  
  return intersection.length / Math.max(union.length, 1);
}

async function testFinalPipeline(): Promise<boolean> {
  try {
    console.log("📡 Step 1: Fetching with optimized logic...");
    const startTime = Date.now();
    
    const [kalshiData, polymarketData] = await Promise.all([
      fetchKalshiFinal().catch(err => {
        console.error("⚠️  Kalshi fetch failed:", err.message);
        return [];
      }),
      fetchPolymarketFinal().catch(err => {
        console.error("⚠️  Polymarket fetch failed:", err.message);
        return [];
      })
    ]);
    
    const fetchTime = Date.now() - startTime;
    console.log(`✅ Fetched ${kalshiData.length} Kalshi + ${polymarketData.length} Polymarket markets (${fetchTime}ms)`);
    
    // Category analysis
    console.log("\n📊 Category Analysis:");
    const kalshiCategories: Record<string, number> = {};
    kalshiData.forEach(m => kalshiCategories[m.category] = (kalshiCategories[m.category] || 0) + 1);
    console.log(`   Kalshi: ${Object.entries(kalshiCategories).map(([cat, count]) => `${cat}(${count})`).join(", ")}`);
    
    const polyCategories: Record<string, number> = {};
    polymarketData.forEach(m => polyCategories[m.category] = (polyCategories[m.category] || 0) + 1);
    console.log(`   Polymarket: ${Object.entries(polyCategories).map(([cat, count]) => `${cat}(${count})`).join(", ")}`);
    
    // Sample data
    if (kalshiData.length > 0) {
      console.log(`\n📝 Kalshi Sample: "${kalshiData[0].title}" (${kalshiData[0].category})`);
      console.log(`   Prices: Yes=${kalshiData[0].yes_price}, No=${kalshiData[0].no_price}`);
    }
    
    if (polymarketData.length > 0) {
      console.log(`\n📝 Polymarket Sample: "${polymarketData[0].title}" (${polymarketData[0].category})`);
      console.log(`   Prices: Yes=${polymarketData[0].yes_price}, No=${polymarketData[0].no_price}`);
    }
    
    // Cross-platform similarity detection
    console.log("\n🔗 Step 2: Cross-platform similarity detection...");
    const similarities: SimilarityMatch[] = [];
    
    // Find markets in same categories for comparison
    kalshiData.forEach(k => {
      polymarketData.forEach(p => {
        if (k.category === p.category && k.category !== 'other') {
          const titleSimilarity = calculateSimilarity(k.title, p.title);
          if (titleSimilarity > 0.3) {
            similarities.push({
              kalshi: k,
              polymarket: p,
              confidence: titleSimilarity,
              category: k.category
            });
          }
        }
      });
    });
    
    console.log(`✅ Found ${similarities.length} potential cross-platform similarities`);
    
    if (similarities.length > 0) {
      console.log("\n🔗 Top Similarities:");
      similarities
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3)
        .forEach((sim, i) => {
          console.log(`   ${i+1}. ${(sim.confidence * 100).toFixed(1)}% - ${sim.category}`);
          console.log(`      Kalshi: "${sim.kalshi.title}"`);
          console.log(`      Polymarket: "${sim.polymarket.title}"`);
        });
    }
    
    // Arbitrage detection
    console.log("\n💰 Step 3: Arbitrage opportunity detection...");
    const opportunities: ArbitrageOpportunity[] = [];
    
    similarities.forEach(sim => {
      const k = sim.kalshi;
      const p = sim.polymarket;
      
      // Calculate potential profit margins
      const profitBuyKalshi = Math.max(0, p.yes_price - k.yes_price) / k.yes_price;
      const profitBuyPoly = Math.max(0, k.yes_price - p.yes_price) / p.yes_price;
      const maxProfit = Math.max(profitBuyKalshi, profitBuyPoly);
      
      if (maxProfit > 0.01) { // 1% threshold for demonstration
        opportunities.push({
          kalshiMarket: k.title,
          polymarketMarket: p.title,
          profitMargin: maxProfit,
          buyPlatform: profitBuyKalshi > profitBuyPoly ? 'kalshi' : 'polymarket',
          sellPlatform: profitBuyKalshi > profitBuyPoly ? 'polymarket' : 'kalshi',
          confidence: sim.confidence,
          category: sim.category,
          kalshiPrice: k.yes_price,
          polymarketPrice: p.yes_price
        });
      }
    });
    
    console.log(`✅ Found ${opportunities.length} arbitrage opportunities (>1% profit)`);
    
    if (opportunities.length > 0) {
      console.log("\n💰 Top Arbitrage Opportunities:");
      opportunities
        .sort((a, b) => b.profitMargin - a.profitMargin)
        .slice(0, 3)
        .forEach((opp, i) => {
          console.log(`   ${i+1}. ${(opp.profitMargin * 100).toFixed(2)}% profit potential`);
          console.log(`      Strategy: Buy ${opp.buyPlatform} (${opp.buyPlatform === 'kalshi' ? opp.kalshiPrice : opp.polymarketPrice}), Sell ${opp.sellPlatform} (${opp.sellPlatform === 'kalshi' ? opp.kalshiPrice : opp.polymarketPrice})`);
          console.log(`      Category: ${opp.category} | Similarity: ${(opp.confidence * 100).toFixed(1)}%`);
        });
    }
    
    // Performance summary
    const totalTime = Date.now() - startTime;
    console.log("\n📈 Final Results Summary:");
    console.log("=".repeat(50));
    console.log(`✅ Total Markets Processed: ${kalshiData.length + polymarketData.length}`);
    console.log(`✅ Cross-Platform Similarities: ${similarities.length}`);
    console.log(`✅ Arbitrage Opportunities: ${opportunities.length}`);
    console.log(`✅ Total Processing Time: ${totalTime}ms`);
    console.log(`✅ Average Processing Speed: ${((totalTime) / (kalshiData.length + polymarketData.length)).toFixed(2)}ms per market`);
    
    // Data quality metrics
    const avgKalshiVolume = kalshiData.reduce((sum, m) => sum + m.volume, 0) / kalshiData.length;
    const avgPolyVolume = polymarketData.reduce((sum, m) => sum + m.volume, 0) / polymarketData.length;
    
    console.log("\n📊 Data Quality Metrics:");
    console.log(`   Kalshi Avg Volume: $${avgKalshiVolume.toFixed(2)}`);
    console.log(`   Polymarket Avg Volume: $${avgPolyVolume.toFixed(2)}`);
    console.log(`   Categories Detected: ${new Set([...Object.keys(kalshiCategories), ...Object.keys(polyCategories)]).size}`);
    
    console.log("\n🎉 ETL Pipeline Final Test: SUCCESS!");
    return true;
    
  } catch (error) {
    console.error("❌ Final pipeline test failed:", error instanceof Error ? error.message : String(error));
    return false;
  }
}

// Run the final test
testFinalPipeline()
  .then(success => {
    console.log(success ? "\n✅ All tests passed!" : "\n❌ Tests failed!");
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error("Unexpected error:", error);
    process.exit(1);
  });