import { internalAction } from "./_generated/server";
import { api } from "./_generated/api";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";

// Polymarket API types (based on actual API response from logs)
interface PolymarketApiMarket {
  id: string;
  question: string; // Use this for title
  description?: string;
  category?: string;
  slug: string;
  outcomes: string; // JSON string: e.g., "[\"Yes\", \"No\"]"
  outcomePrices: string; // JSON string: e.g., "[\"0.5\", \"0.5\"]"
  clobTokenIds?: string; // JSON string, can be missing: e.g., "[\"token_id_1\", \"token_id_2\"]"
  endDate?: string;
  volume?: string; // String representation of a number
  liquidity?: string; // String representation of a number
  active: boolean;
  closed: boolean;
  createdAt: string; // Use this for metadata.createdAt (e.g., "2020-10-02T16:10:01.467Z")
  // Other fields from API response like 'twitterCardImage', 'marketType', etc., can be added if needed
}

// Define types for Kalshi API responses
interface KalshiMarket {
  ticker: string;
  title: string;
  subtitle?: string;
  category: string;
  settlement_value?: string;
  settlement_time?: string; // ISO timestamp
  open_time: string; // ISO timestamp
  close_time: string; // ISO timestamp
  status: string; // "open", "closed", etc.
  yes_bid?: number;
  yes_ask?: number;
  no_bid?: number;
  no_ask?: number;
  volume_24h?: number;
  volume_7d?: number;
  volume_total?: number;
  liquidity?: number;
}

/**
 * Fetches market data from Polymarket API and stores it in the database
 */
export const fetchAndStorePolymarketMarkets = internalAction({
  args: {
    limit: v.optional(v.number()),
    skip: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const platformName = "polymarket";
    const limit = args.limit || 100; // Default to 100 markets per request
    const skip = args.skip || 0;
    
    const platform = await ctx.runQuery(api.platforms.getPlatformByName, { name: platformName });

    if (!platform) {
      console.error(`Platform ${platformName} not found.`);
      // Optionally, log this error to a system table using api.system.logSyncResult or similar
      return { processed: 0, errors: [`Platform ${platformName} not found`] }; // Stop execution if platform cannot be fetched
    }
    const platformId: Id<"platforms"> = platform._id;

    let rawData: PolymarketApiMarket[];
    try {
      const response = await fetch(`https://gamma-api.polymarket.com/markets?archived=false&closed=false&active=true&limit=${limit}&skip=${skip}`);
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}: ${await response.text()}`);
      }
      rawData = await response.json(); 
    } catch (error) {
      console.error("Failed to fetch or parse markets from Polymarket API:", error);
      // Optionally, log this error
      return;
    }

    let upsertedCount = 0;
    let failedCount = 0;

    for (const market of rawData) { 
      try {
        const marketStatus = market.closed ? "resolved" : (market.active ? "active" : "closed"); 

        const outcomeNames: string[] = market.outcomes ? JSON.parse(market.outcomes) : [];
        const outcomePricesStr: string[] = market.outcomePrices ? JSON.parse(market.outcomePrices) : [];
        const clobTokenIdsArray: string[] = market.clobTokenIds ? JSON.parse(market.clobTokenIds) : []; // Parsed array

        const processedOutcomes = [];
        // Determine the number of outcomes we can safely process based on the shortest array
        const numProcessableOutcomes = Math.min(outcomeNames.length, outcomePricesStr.length, clobTokenIdsArray.length);

        for (let i = 0; i < numProcessableOutcomes; i++) {
          const tokenId = clobTokenIdsArray[i];
          const name = outcomeNames[i];
          const priceStr = outcomePricesStr[i];
          
          // Ensure all essential parts are present; tokenId is crucial for the schema's non-optional id.
          if (tokenId && name && priceStr !== undefined) { 
            processedOutcomes.push({
              id: tokenId,
              name: name,
              price: parseFloat(priceStr), // Assuming valid number string if present
              // volume: undefined, // Per-outcome volume not directly available
            });
          }
        }
        // If, for example, clobTokenIdsArray is empty because market.clobTokenIds was undefined,
        // numProcessableOutcomes will be 0, and processedOutcomes will be an empty array, which is valid.

        await ctx.runMutation(internal.markets.upsertMarket, {
          platformId: platformId, 
          externalId: market.id,
          title: market.question, // Use market.question for title
          description: market.description,
          category: market.category,
          outcomes: processedOutcomes,
          endDate: market.endDate ? new Date(market.endDate).getTime() : undefined,
          totalVolume: market.volume ? parseFloat(market.volume) : undefined,
          liquidity: market.liquidity ? parseFloat(market.liquidity) : undefined,
          status: marketStatus, 
          url: market.slug ? `https://polymarket.com/event/${market.slug}` : undefined,
          metadata: {
            // tags: market.tags, // Uncomment if API provides tags and schema supports
            createdAt: market.createdAt ? new Date(market.createdAt).getTime() : undefined, // Use market.createdAt
          },
        });
        upsertedCount++;
      } catch (error) {
        console.error(`Failed to upsert market ${market.id} (${market.question}):`, error);
        if (failedCount === 0) { // Log details only for the first failure to avoid spam
          console.error("Problematic market object structure:", JSON.stringify(market, null, 2));
        }
        failedCount++;
      }
    }

    console.log(`Polymarket sync: ${upsertedCount} markets upserted, ${failedCount} failed.`);
    
    // Log the sync
    const startTime = Date.now();
    try {
      await ctx.runMutation(internal.syncLogs.createSyncLog, {
        platformId: platformId,
        status: failedCount > 0 ? "partial" : "success",
        marketsProcessed: upsertedCount,
        errors: failedCount > 0 ? [`Failed to process ${failedCount} markets`] : undefined,
        duration: Date.now() - startTime,
      });
    } catch (logError) {
      console.error("Failed to log sync result:", logError);
    }
    
    // Return results
    return { 
      processed: upsertedCount, 
      errors: failedCount > 0 ? [`Failed to process ${failedCount} markets`] : [] 
    };
  },
});

/**
 * Fetches market data from Kalshi API and stores it in the database
 */
export const fetchAndStoreKalshiMarkets = internalAction({
  args: {
    limit: v.optional(v.number()),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ processed: number; errors: string[] }> => {
    const platformName = "kalshi";
    const limit = args.limit || 50; // Default to 50 markets
    const errors: string[] = [];
    let processed = 0;
    const startTime = Date.now(); // Track start time for duration calculation
    
    try {
      // Look up Kalshi platform ID first
      const platform = await ctx.runQuery(api.platforms.getPlatformByName, { name: platformName });
      
      if (!platform) {
        throw new Error(`Platform ${platformName} not found in database`);
      }
      
      const platformId: Id<"platforms"> = platform._id;
      console.log(`Fetching Kalshi markets with limit=${limit}`);
      
      // Kalshi API requires authentication with RSA key signing
      // First try to get credentials from environment variables
      const kalshiKeyId = process.env.KALSHI_KEY_ID;
      const kalshiPrivateKey = process.env.KALSHI_PRIVATE_KEY;
      
      // For user-initiated syncs, we would fetch user credentials 
      // from a database table in a production implementation
      // But for now, we'll just use environment variables
      
      console.log("Checking for Kalshi API credentials");
      const requestOptions: RequestInit = {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
      };
      
      // If we have valid credentials, add authentication headers
      if (kalshiKeyId && kalshiPrivateKey) {
        console.log("Using authenticated Kalshi API request");
        const timestamp = Date.now().toString();
        
        // Generate authentication headers
        try {
          // In a production implementation, we would generate a proper RSA-PSS signature
          // For now, we're sending basic headers without signatures for development
          requestOptions.headers = {
            ...requestOptions.headers,
            "KALSHI-ACCESS-KEY": kalshiKeyId,
            "KALSHI-ACCESS-TIMESTAMP": timestamp,
            // In production, we would add the signature header:
            // "KALSHI-ACCESS-SIGNATURE": signature
          };
        } catch (error) {
          console.error("Failed to prepare Kalshi auth headers:", error);
          console.warn("Falling back to public endpoints");
        }
      } else {
        console.warn("Kalshi API credentials not found. Using public endpoints only.");
      }
      
      const response = await fetch(`https://trading-api.kalshi.com/v2/markets?status=open&limit=${limit}`, requestOptions);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Kalshi API returned ${response.status}: ${response.statusText}. Details: ${errorText}`);
      }
      
      const data = await response.json();
      const markets: KalshiMarket[] = data.markets || [];
      
      console.log(`Retrieved ${markets.length} markets from Kalshi`);
      
      // Process each market
      for (const market of markets) {
        try {
          // Create outcomes array for binary markets
          // Kalshi typically has Yes/No outcomes
          const outcomes = [
            {
              id: `${market.ticker}-yes`,
              name: "Yes",
              price: market.yes_ask || 0,
              volume: market.volume_total || 0,
            },
            {
              id: `${market.ticker}-no`,
              name: "No",
              price: market.no_ask || 0,
              volume: market.volume_total || 0,
            }
          ];
          
          // Format market data according to our schema and upsert it
          await ctx.runMutation(internal.markets.upsertMarket, {
            platformId,
            externalId: market.ticker,
            title: market.title,
            description: market.subtitle || "",
            category: market.category,
            outcomes,
            endDate: market.close_time ? new Date(market.close_time).getTime() : undefined,
            totalVolume: market.volume_total || 0,
            liquidity: market.liquidity || 0,
            status: market.status === "open" ? "active" : "closed",
            url: `https://kalshi.com/markets/${market.ticker}`,
            metadata: {
              tags: [market.category],
              createdAt: market.open_time ? new Date(market.open_time).getTime() : Date.now(),
            }
          });
          processed++;
          
        } catch (error: any) {
          console.error(`Error processing Kalshi market ${market.ticker}:`, error);
          errors.push(`Failed to process market ${market.ticker}: ${error?.message || 'Unknown error'}`);
        }
      }
      
      // Log the sync
      const syncDuration = Date.now() - startTime;
      await ctx.runMutation(internal.syncLogs.createSyncLog, {
        platformId,
        status: errors.length === 0 ? "success" : errors.length < markets.length ? "partial" : "error",
        marketsProcessed: processed,
        errors: errors.length > 0 ? errors : undefined,
        duration: syncDuration, // Track processing time
      });
      
      return { processed, errors };
      
    } catch (error: any) {
      console.error("Error fetching Kalshi markets:", error);
      errors.push(`General error: ${error?.message || 'Unknown error'}`);
      
      // Log sync failure if we have the platformId
      try {
        const platform = await ctx.runQuery(api.platforms.getPlatformByName, { name: platformName });
        
        if (platform) {
          const syncDuration = Date.now() - startTime;
          await ctx.runMutation(internal.syncLogs.createSyncLog, {
            platformId: platform._id,
            status: "error",
            marketsProcessed: processed,
            errors: [error?.message || 'Unknown error'],
            duration: syncDuration,
          });
        }
      } catch (logError: any) {
        console.error("Failed to log sync error:", logError);
      }
      
      return { processed, errors };
    }
  }
});
