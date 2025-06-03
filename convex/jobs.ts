import { internalAction } from "./_generated/server";
import { api } from "./_generated/api";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

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

export const fetchAndStorePolymarketMarkets = internalAction({
  handler: async (ctx) => {
    const platformName = "polymarket";
    
    const platform = await ctx.runQuery(api.platforms.getPlatformByName, { name: platformName });

    if (!platform) {
      console.error(`Platform ${platformName} not found.`);
      // Optionally, log this error to a system table using api.system.logSyncResult or similar
      return; // Stop execution if platform cannot be fetched
    }
    const platformId: Id<"platforms"> = platform._id;

    let rawData: PolymarketApiMarket[];
    try {
      const response = await fetch("https://gamma-api.polymarket.com/markets?active=true&limit=100"); // Added limit
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
    // Example of logging sync result (assuming api.system.logSyncResult exists)
    /*
    try {
      await ctx.runMutation(api.system.logSyncResult, {
        platformName: platformName,
        status: failedCount > 0 ? "error" : "success",
        details: `Upserted: ${upsertedCount}, Failed: ${failedCount}`,
        itemCount: rawData.length,
      });
    } catch (logError) {
      console.error("Failed to log sync result:", logError);
    }
    */
  },
});
