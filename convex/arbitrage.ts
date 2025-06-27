import { action, internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

// Helper function to get platform name by ID
async function getPlatformName(ctx: any, platformId: any) {
    const platform = await ctx.runQuery(internal.platforms.getPlatformByIdInternal, { platformId });
    return platform?.name ?? "Unknown Platform";
}

// Helper function containing the core arbitrage detection logic for binary markets
function findBinaryArbitrageOpportunities(markets: any[]) {
    const opportunities = [];
    for (let i = 0; i < markets.length; i++) {
        for (let j = i + 1; j < markets.length; j++) {
            const market1 = markets[i];
            const market2 = markets[j];

            // Don't compare markets from the same platform
            if (market1.platformId === market2.platformId) continue;

            const outcomes1 = market1.outcomes;
            const outcomes2 = market2.outcomes;

            // Ensure both are binary markets
            if (outcomes1.length !== 2 || outcomes2.length !== 2) continue;

            const yes1 = outcomes1.find((o: any) => o.name.toLowerCase() === 'yes');
            const no1 = outcomes1.find((o: any) => o.name.toLowerCase() === 'no');
            const yes2 = outcomes2.find((o: any) => o.name.toLowerCase() === 'yes');
            const no2 = outcomes2.find((o: any) => o.name.toLowerCase() === 'no');

            if (!yes1 || !no1 || !yes2 || !no2) continue;

            // Opportunity 1: Buy Yes on Market 1, Buy No on Market 2
            if (yes1.price + no2.price < 1) {
                const profitMargin = 1 - (yes1.price + no2.price);
                opportunities.push({
                    profitMargin,
                    description: `Buy 'Yes' on ${market1.platformName} for ${yes1.price} and 'No' on ${market2.platformName} for ${no2.price}.`,
                    legs: [
                        { platform: market1.platformName, market: market1.title, outcome: 'Yes', price: yes1.price },
                        { platform: market2.platformName, market: market2.title, outcome: 'No', price: no2.price },
                    ],
                    buyMarketId: market1._id,
                    sellMarketId: market2._id,
                    buyOutcome: 'Yes',
                    sellOutcome: 'No',
                    buyPrice: yes1.price,
                    sellPrice: no2.price,
                });
            }

            // Opportunity 2: Buy No on Market 1, Buy Yes on Market 2
            if (no1.price + yes2.price < 1) {
                const profitMargin = 1 - (no1.price + yes2.price);
                opportunities.push({
                    profitMargin,
                    description: `Buy 'No' on ${market1.platformName} for ${no1.price} and 'Yes' on ${market2.platformName} for ${yes2.price}.`,
                    legs: [
                        { platform: market1.platformName, market: market1.title, outcome: 'No', price: no1.price },
                        { platform: market2.platformName, market: market2.title, outcome: 'Yes', price: yes2.price },
                    ],
                    buyMarketId: market1._id,
                    sellMarketId: market2._id,
                    buyOutcome: 'No',
                    sellOutcome: 'Yes',
                    buyPrice: no1.price,
                    sellPrice: yes2.price,
                });
            }
        }
    }
    return opportunities;
}

// Internal action for the cron job to detect arbitrage across all market groups
export const detectArbitrageOpportunities = internalAction({
    handler: async (ctx) => {
        console.log("Running detectArbitrageOpportunities cron job...");
        const marketGroups = await ctx.runQuery(api.semanticAnalysis.getMarketGroups, {});

        for (const group of marketGroups) {
            if (!group.markets || group.markets.length < 2) continue;

            const marketsWithPlatforms = await Promise.all(
                group.markets.map(async (market: any) => {
                    if (!market) return null;
                    const platformName = await getPlatformName(ctx, market.platformId);
                    return { ...market, platformName };
                })
            );
            
            const validMarkets = marketsWithPlatforms.filter((m): m is NonNullable<typeof m> => m !== null);

            if (validMarkets.length < 2) continue;

            const opportunities = findBinaryArbitrageOpportunities(validMarkets);

            for (const opp of opportunities) {
                await ctx.runMutation(internal.arbitrage.storeArbitrageOpportunity, {
                    groupId: group._id,
                    buyMarketId: opp.buyMarketId,
                    sellMarketId: opp.sellMarketId,
                    buyOutcome: opp.buyOutcome,
                    sellOutcome: opp.sellOutcome,
                    buyPrice: opp.buyPrice,
                    sellPrice: opp.sellPrice,
                    profitMargin: opp.profitMargin,
                    confidence: group.confidence, // Use group confidence
                });
            }
        }
        console.log("Finished detectArbitrageOpportunities cron job.");
    },
});

// Internal mutation to store found opportunities in the database
export const storeArbitrageOpportunity = internalMutation({
    args: {
        groupId: v.id("marketGroups"),
        buyMarketId: v.id("markets"),
        sellMarketId: v.id("markets"),
        buyOutcome: v.string(),
        sellOutcome: v.string(),
        buyPrice: v.number(),
        sellPrice: v.number(),
        profitMargin: v.number(),
        confidence: v.number(),
    },
    handler: async (ctx, args) => {
        // Check if a similar opportunity already exists to avoid duplicates
        const existing = await ctx.db.query('arbitrageOpportunities')
            .withIndex('by_group', q => q.eq('groupId', args.groupId))
            .filter(q => q.and(
                q.eq(q.field('buyMarketId'), args.buyMarketId),
                q.eq(q.field('sellMarketId'), args.sellMarketId),
                q.eq(q.field('buyOutcome'), args.buyOutcome)
            ))
            .first();

        if (!existing) {
            await ctx.db.insert("arbitrageOpportunities", {
                ...args,
                detectedAt: Date.now(),
                status: "active",
            });
        }
    },
});

import { Id } from "./_generated/dataModel";

// Define the structure for a leg of an arbitrage opportunity
interface ArbitrageLeg {
  marketId: Id<"markets">;
  marketTitle: string;
  platformId: Id<"platforms">; 
  platformName: string;      
  outcomeName: string;
  price: number;
}

// Define the structure for a found arbitrage opportunity
interface FoundArbitrageOpportunity {
  marketA_leg: ArbitrageLeg;    
  marketB_leg: ArbitrageLeg;    
  combinedPrice: number;        
  profitMarginEstimate: number; 
  description: string;          
}

const ARBITRAGE_THRESHOLD = 0.99; // Combined price must be less than this

export const findArbitrageForSelectedMarkets = action({
  args: {
    marketIds: v.array(v.id("markets")),
  },
  handler: async (ctx, args): Promise<{ message: string; opportunities: FoundArbitrageOpportunity[] }> => {
    const { marketIds } = args;
    if (marketIds.length < 2) {
      return { message: "Please select at least two markets to find arbitrage.", opportunities: [] };
    }

    console.log(`Finding arbitrage for ${marketIds.length} selected markets:`, marketIds);

    const marketsFromDB = [];
    for (const marketId of marketIds) {
      const marketDoc = await ctx.runQuery(api.marketUtils.getMarketById, { id: marketId });
      if (marketDoc) {
        const platformDoc = await ctx.runQuery(internal.platforms.getPlatformByIdInternal, { platformId: marketDoc.platformId });
        if (!platformDoc) {
          console.warn(`Platform not found for market ${marketDoc._id} with platformId ${marketDoc.platformId}. Skipping market.`);
          continue;
        }

        const marketWithPlatformName = {
          ...marketDoc,
          platformName: platformDoc.name,
        };

        if (!marketWithPlatformName.platformName || !marketWithPlatformName.title || !marketWithPlatformName.outcomes) {
            console.warn(`Market ${marketWithPlatformName._id} is missing essential data (platformName, title, or outcomes) for arbitrage analysis after platform enrichment.`);
            continue;
        }
        marketsFromDB.push(marketWithPlatformName);
      }
    }

    if (marketsFromDB.length < 2) {
      return { message: "Could not retrieve enough valid market details for arbitrage analysis.", opportunities: [] };
    }

    const foundOpportunities: FoundArbitrageOpportunity[] = [];

    for (let i = 0; i < marketsFromDB.length; i++) {
      for (let j = i + 1; j < marketsFromDB.length; j++) {
        const marketA = marketsFromDB[i];
        const marketB = marketsFromDB[j];

        if (marketA.platformId === marketB.platformId) {
          continue;
        }

        if (
          marketA.outcomes?.length !== 2 || marketB.outcomes?.length !== 2 ||
          marketA.outcomes.some(o => o.price == null || !o.name) ||
          marketB.outcomes.some(o => o.price == null || !o.name)
        ) {
          console.log(`Skipping pair ${marketA.title} & ${marketB.title} due to non-binary or invalid outcome data.`);
          continue;
        }
        
        const outcomeA0 = marketA.outcomes[0];
        const outcomeA1 = marketA.outcomes[1];
        const outcomeB0 = marketB.outcomes[0];
        const outcomeB1 = marketB.outcomes[1];

        if (typeof outcomeA0.price !== 'number' || typeof outcomeA1.price !== 'number' ||
            typeof outcomeB0.price !== 'number' || typeof outcomeB1.price !== 'number') {
            console.log(`Skipping pair ${marketA.title} & ${marketB.title} due to non-numeric outcome prices.`);
            continue;
        }

        // Scenario 1: Buy outcomeA0 + Buy outcomeB1
        const combinedPrice1 = outcomeA0.price + outcomeB1.price;
        if (combinedPrice1 < ARBITRAGE_THRESHOLD) {
          const profitMargin1 = 1 - combinedPrice1;
          const opportunity: FoundArbitrageOpportunity = {
            marketA_leg: {
              marketId: marketA._id,
              marketTitle: marketA.title,
              platformId: marketA.platformId,
              platformName: marketA.platformName, // Now directly available
              outcomeName: outcomeA0.name,
              price: outcomeA0.price,
            },
            marketB_leg: {
              marketId: marketB._id,
              marketTitle: marketB.title,
              platformId: marketB.platformId,
              platformName: marketB.platformName, // Now directly available
              outcomeName: outcomeB1.name,
              price: outcomeB1.price,
            },
            combinedPrice: combinedPrice1,
            profitMarginEstimate: profitMargin1,
            description: `Buy '${outcomeA0.name}' on ${marketA.platformName} (@${outcomeA0.price.toFixed(2)}) and '${outcomeB1.name}' on ${marketB.platformName} (@${outcomeB1.price.toFixed(2)}). Est. Profit: ${(profitMargin1 * 100).toFixed(1)}%`,
          };
          foundOpportunities.push(opportunity);
        }

        // Scenario 2: Buy outcomeA1 + Buy outcomeB0
        const combinedPrice2 = outcomeA1.price + outcomeB0.price;
        if (combinedPrice2 < ARBITRAGE_THRESHOLD) {
          const profitMargin2 = 1 - combinedPrice2;
          const opportunity: FoundArbitrageOpportunity = {
            marketA_leg: {
              marketId: marketA._id,
              marketTitle: marketA.title,
              platformId: marketA.platformId,
              platformName: marketA.platformName, // Now directly available
              outcomeName: outcomeA1.name,
              price: outcomeA1.price,
            },
            marketB_leg: {
              marketId: marketB._id,
              marketTitle: marketB.title,
              platformId: marketB.platformId,
              platformName: marketB.platformName, // Now directly available
              outcomeName: outcomeB0.name,
              price: outcomeB0.price,
            },
            combinedPrice: combinedPrice2,
            profitMarginEstimate: profitMargin2,
            description: `Buy '${outcomeA1.name}' on ${marketA.platformName} (@${outcomeA1.price.toFixed(2)}) and '${outcomeB0.name}' on ${marketB.platformName} (@${outcomeB0.price.toFixed(2)}). Est. Profit: ${(profitMargin2 * 100).toFixed(1)}%`,
          };
          foundOpportunities.push(opportunity);
        }
      }
    }
    
    const message = foundOpportunities.length > 0 
      ? `Found ${foundOpportunities.length} potential arbitrage opportunities.`
      : "No obvious arbitrage opportunities found with current logic.";
      
    return { 
      message,
      opportunities: foundOpportunities 
    };
  },
});

// Future internal mutation to create an arbitrage opportunity record
/*
import { internalMutation } from "./_generated/server";
export const createArbitrageOpportunity = internalMutation({
  args: {
    marketAId: v.id("markets"),
    marketBId: v.id("markets"),
    opportunityDetails: v.object({
      profitMargin: v.number(),
      outcomesToBet: v.array(v.object({
        marketId: v.id("markets"),
        outcomeId: v.string(),
        outcomeName: v.string(),
        price: v.number(),
        platformName: v.string(),
      })),
    }),
    status: v.union(v.literal("active"), v.literal("expired"), v.literal("executed")),
  },
  handler: async (ctx, args) => {
    const opportunityId = await ctx.db.insert("arbitrageOpportunities", {
      marketAId: args.marketAId,
      marketBId: args.marketBId,
      opportunityDetails: args.opportunityDetails,
      identifiedAt: Date.now(),
      status: args.status,
    });
    return opportunityId;
  },
});
*/
