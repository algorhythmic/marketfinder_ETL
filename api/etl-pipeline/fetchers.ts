// Data fetching functions for Kalshi and Polymarket APIs

interface RawMarket {
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

export async function fetchKalshiMarkets(): Promise<RawMarket[]> {
  try {
    console.log("Fetching Kalshi markets...");
    
    const response = await fetch("https://api.elections.kalshi.com/trade-api/v2/markets", {
      headers: {
        "Accept": "application/json",
        "User-Agent": "MarketFinder/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Kalshi API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Handle both nested and direct market arrays
    const allMarkets = data.markets || data || [];
    
    if (!Array.isArray(allMarkets)) {
      throw new Error("Invalid Kalshi API response format");
    }
    console.log(`Kalshi returned ${allMarkets.length} total markets`);
    
    // Filter for active binary markets
    const activeMarkets = allMarkets.filter(market => {
      try {
        return market.close_time > new Date().toISOString() &&
               (market.status === "active" || market.status === "initialized") &&
               market.ticker; // Ensure we have a valid identifier
      } catch (e) {
        console.warn(`Skipping invalid Kalshi market:`, e);
        return false;
      }
    });

    console.log(`Filtered to ${activeMarkets.length} active Kalshi markets`);

    // Transform to standardized format
    return activeMarkets.map(market => ({
      platform: 'kalshi',
      external_id: market.ticker,
      title: market.title || 'Untitled Market',
      description: market.subtitle || market.title || 'No description',
      category: standardizeKalshiCategory(market.category) || categorizeFromTitle(market.title),
      yes_price: calculateKalshiPrice(market, 'yes'),
      no_price: calculateKalshiPrice(market, 'no'),
      volume: parseFloat(market.volume_24h || market.volume || 0),
      liquidity: parseFloat(market.liquidity || market.open_interest || 0),
      end_date: new Date(market.close_time).getTime(),
      is_active: true,
      raw_data: JSON.stringify(market)
    }));

  } catch (error) {
    console.error("Kalshi fetch error:", error);
    throw new Error(`Failed to fetch Kalshi markets: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function fetchPolymarketMarkets(maxMarkets: number = 1000): Promise<RawMarket[]> {
  try {
    console.log(`Fetching Polymarket markets (max ${maxMarkets})...`);
    
    const allMarkets: any[] = [];
    let offset = 0;
    const limit = 100;
    let hasMoreData = true;
    const maxBatches = Math.ceil(maxMarkets / limit);
    let batchCount = 0;
    
    while (hasMoreData && batchCount < maxBatches) {
      const url = `https://gamma-api.polymarket.com/markets?active=true&archived=false&limit=${limit}&offset=${offset}&order=startDate&ascending=false`;
      console.log(`Fetching batch: offset=${offset}, limit=${limit}`);
      
      const response = await fetch(url, {
        method: "GET",
        headers: { 
          "Accept": "application/json",
          "User-Agent": "MarketFinder/1.0",
        },
      });

      if (!response.ok) {
        throw new Error(`Polymarket API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      const markets = Array.isArray(data) ? data : data.markets || [];
      
      if (!Array.isArray(markets)) {
        throw new Error("Invalid Polymarket API response format");
      }

      console.log(`Batch ${Math.floor(offset/limit) + 1}: fetched ${markets.length} markets`);
      
      if (markets.length === 0) {
        // No more data available
        hasMoreData = false;
      } else {
        allMarkets.push(...markets);
        
        // If we got fewer markets than the limit, we've reached the end
        if (markets.length < limit) {
          hasMoreData = false;
        } else {
          offset += limit;
          batchCount++;
        }
      }
    }
    
    if (batchCount >= maxBatches) {
      console.log(`Reached maximum batch limit (${maxBatches}), may have more markets available`);
    }

    console.log(`Polymarket returned ${allMarkets.length} total markets across ${Math.ceil(allMarkets.length/limit)} batches`);
    
    // Filter for binary markets (API already filters for active=true&archived=false)
    const binaryMarkets = allMarkets.filter(market => {
      try {
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
      } catch (e) {
        console.warn(`Skipping invalid Polymarket market:`, e);
        return false;
      }
    });

    console.log(`Filtered to ${binaryMarkets.length} active binary Polymarket markets`);

    // Transform to standardized format
    return binaryMarkets
      .map(market => {
        // Handle pricing - use lastTradePrice for binary markets
        let yesPrice = 0.5, noPrice = 0.5;
        
        if (market.lastTradePrice !== undefined && market.lastTradePrice !== null) {
          yesPrice = parseFloat(market.lastTradePrice) || 0.5;
          noPrice = 1 - yesPrice;
        } else if (market.bestBid !== undefined && market.bestAsk !== undefined) {
          // Use midpoint of bid/ask spread
          const bid = parseFloat(market.bestBid) || 0;
          const ask = parseFloat(market.bestAsk) || 1;
          yesPrice = (bid + ask) / 2;
          noPrice = 1 - yesPrice;
        } else {
          // No price data available, skip
          return null;
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
          o && typeof o === 'string' && (
            o.toLowerCase().includes('yes') || o.toLowerCase().includes('no')
          )
        );
        
        // Skip if not binary or has too many outcomes
        if (!hasYesNo && parsedOutcomes.length > 4) {
          return null;
        }

        return {
          platform: 'polymarket',
          external_id: market.id,
          title: market.question,
          description: market.description || market.question,
          category: standardizePolymarketCategory(market.category),
          yes_price: yesPrice,
          no_price: noPrice,
          volume: parseFloat(market.volume || market.volumeNum || 0),
          liquidity: parseFloat(market.liquidity || market.liquidityNum || 0),
          end_date: new Date(market.endDateIso || market.endDate).getTime(),
          is_active: market.active && !market.archived,
          raw_data: JSON.stringify(market)
        };
      })
      .filter(Boolean); // Remove null entries

  } catch (error) {
    console.error("Polymarket fetch error:", error);
    throw new Error(`Failed to fetch Polymarket markets: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Category standardization functions
function standardizeKalshiCategory(category: string | undefined): string {
  if (!category) return "other";
  
  const normalized = category.toLowerCase().trim();
  
  // Kalshi uses these categories: Politics, Sports, Culture, Crypto, Climate, Economics, Tech & Science, Health, World
  const categoryMap: Record<string, string> = {
    "politics": "politics",
    "sports": "sports",
    "culture": "culture", 
    "crypto": "crypto",
    "cryptocurrency": "crypto",
    "climate": "climate",
    "economics": "economics",
    "economy": "economics",
    "tech & science": "technology",
    "technology": "technology",
    "science": "technology",
    "health": "health",
    "world": "world",
    "international": "world"
  };

  return categoryMap[normalized] || "other";
}

function standardizePolymarketCategory(category: string | undefined): string {
  if (!category) return "other";
  
  const normalized = category.toLowerCase().trim();
  
  // Map Polymarket categories to standardized categories
  const categoryMap: Record<string, string> = {
    "politics": "politics",
    "election": "politics",
    "elections": "politics",
    "sports": "sports",
    "cryptocurrency": "crypto",
    "crypto": "crypto",
    "bitcoin": "crypto",
    "ethereum": "crypto",
    "technology": "technology",
    "tech": "technology",
    "science": "technology",
    "ai": "technology",
    "economics": "economics",
    "business": "economics",
    "finance": "economics",
    "market": "economics",
    "climate": "climate",
    "environment": "climate",
    "weather": "climate",
    "health": "health",
    "medicine": "health",
    "covid": "health",
    "world": "world",
    "international": "world",
    "culture": "culture",
    "entertainment": "culture",
    "media": "culture",
    "celebrity": "culture"
  };

  return categoryMap[normalized] || "other";
}

// Categorize based on title keywords when API doesn't provide category
function categorizeFromTitle(title: string): string {
  if (!title) return "other";
  
  const lowerTitle = title.toLowerCase();
  
  if (lowerTitle.includes("trump") || lowerTitle.includes("biden") || lowerTitle.includes("election") || 
      lowerTitle.includes("president") || lowerTitle.includes("senator") || lowerTitle.includes("congress") ||
      lowerTitle.includes("nomination") || lowerTitle.includes("ambassador")) {
    return "politics";
  }
  
  if (lowerTitle.includes("bitcoin") || lowerTitle.includes("crypto") || lowerTitle.includes("ethereum") ||
      lowerTitle.includes("blockchain")) {
    return "crypto";
  }
  
  if (lowerTitle.includes("economy") || lowerTitle.includes("gdp") || lowerTitle.includes("inflation") ||
      lowerTitle.includes("market") || lowerTitle.includes("recession")) {
    return "economics";
  }
  
  if (lowerTitle.includes("climate") || lowerTitle.includes("temperature") || lowerTitle.includes("weather")) {
    return "climate";
  }
  
  if (lowerTitle.includes("sports") || lowerTitle.includes("nfl") || lowerTitle.includes("nba") ||
      lowerTitle.includes("championship")) {
    return "sports";
  }
  
  return "other";
}

// Helper function to calculate representative price for Kalshi markets
function calculateKalshiPrice(market: any, outcome: 'yes' | 'no'): number {
  const bidField = outcome === 'yes' ? 'yes_bid' : 'no_bid';
  const askField = outcome === 'yes' ? 'yes_ask' : 'no_ask';
  
  const bid = parseFloat(market[bidField] || 0);
  const ask = parseFloat(market[askField] || 0);
  const lastPrice = parseFloat(market.last_price || 0);
  
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

// Test function for development
export async function testFetchers() {
  console.log("Testing data fetchers...");
  
  try {
    const [kalshi, polymarket] = await Promise.all([
      fetchKalshiMarkets(),
      fetchPolymarketMarkets()
    ]);

    console.log("Fetch test results:");
    console.log(`- Kalshi: ${kalshi.length} markets`);
    console.log(`- Polymarket: ${polymarket.length} markets`);
    
    if (kalshi.length > 0) {
      console.log("Sample Kalshi market:", {
        title: kalshi[0].title,
        category: kalshi[0].category,
        prices: { yes: kalshi[0].yes_price, no: kalshi[0].no_price }
      });
    }
    
    if (polymarket.length > 0) {
      console.log("Sample Polymarket market:", {
        title: polymarket[0].title,
        category: polymarket[0].category,
        prices: { yes: polymarket[0].yes_price, no: polymarket[0].no_price }
      });
    }

    return { kalshi, polymarket };
    
  } catch (error) {
    console.error("Fetch test failed:", error);
    throw error;
  }
}