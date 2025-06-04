// import { internalMutation } from "./_generated/server";
// import { v } from "convex/values";

// export const upsertMarket = internalMutation({
//   args: {
//     platformId: v.id("platforms"),
//     externalId: v.string(),
//     title: v.string(),
//     description: v.optional(v.string()),
//     category: v.optional(v.string()),
//     outcomes: v.array(v.object({
//       id: v.string(),
//       name: v.string(),
//       price: v.number(),
//       volume: v.optional(v.number()),
//     })),
//     endDate: v.optional(v.number()),
//     totalVolume: v.optional(v.number()),
//     liquidity: v.optional(v.number()),
//     status: v.union(v.literal("active"), v.literal("closed"), v.literal("resolved")),
//     url: v.optional(v.string()),
//     metadata: v.optional(v.object({
//       tags: v.optional(v.array(v.string())),
//       minBet: v.optional(v.number()),
//       maxBet: v.optional(v.number()),
//       createdAt: v.optional(v.number()),
//     })),
//   },
//   handler: async (ctx, args) => {
//     const existing = await ctx.db
//       .query("markets")
//       .withIndex("by_platform", (q) => q.eq("platformId", args.platformId))
//       .filter((q) => q.eq(q.field("externalId"), args.externalId))
//       .first();

//     const marketData = {
//       ...args,
//       lastUpdated: Date.now(),
//     };

//     if (existing) {
//       // Store price history before updating
//       for (const outcome of existing.outcomes) {
//         const newOutcome = args.outcomes.find(o => o.id === outcome.id);
//         if (newOutcome && newOutcome.price !== outcome.price) {
//           await ctx.db.insert("priceHistory", {
//             marketId: existing._id,
//             outcome: outcome.id,
//             price: newOutcome.price,
//             volume: newOutcome.volume,
//             timestamp: Date.now(),
//           });
//         }
//       }

//       await ctx.db.patch(existing._id, marketData);
//       return existing._id;
//     } else {
//       const marketId = await ctx.db.insert("markets", marketData);
      
//       // Store initial price history
//       for (const outcome of args.outcomes) {
//         await ctx.db.insert("priceHistory", {
//           marketId,
//           outcome: outcome.id,
//           price: outcome.price,
//           volume: outcome.volume,
//           timestamp: Date.now(),
//         });
//       }

//       return marketId;
//     }
//   },
// });

//Below is the latest version of the upsertMarket function

import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsertMarket = internalMutation({
  args: {
    platformId: v.id("platforms"),
    externalId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    outcomes: v.array(v.object({
      id: v.string(),
      name: v.string(),
      price: v.number(),
      volume: v.optional(v.number()),
    })),
    endDate: v.optional(v.number()),
    totalVolume: v.optional(v.number()),
    liquidity: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("closed"), v.literal("resolved")),
    url: v.optional(v.string()),
    metadata: v.optional(v.object({
      tags: v.optional(v.array(v.string())),
      minBet: v.optional(v.number()),
      maxBet: v.optional(v.number()),
      createdAt: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("markets") // Assuming 'markets' is the correct table name as per schema
      .withIndex("by_platform", (q) => q.eq("platformId", args.platformId))
      .filter((q) => q.eq(q.field("externalId"), args.externalId))
      .first();

    const marketData = {
      ...args,
      lastUpdated: Date.now(),
    };

    if (existing) {
      // Store price history before updating
      for (const outcome of existing.outcomes) {
        const newOutcome = args.outcomes.find(o => o.id === outcome.id);
        if (newOutcome && newOutcome.price !== outcome.price) {
          await ctx.db.insert("priceHistory", { // Assuming 'priceHistory' table exists
            marketId: existing._id,
            outcome: outcome.id, 
            price: newOutcome.price,
            volume: newOutcome.volume,
            timestamp: Date.now(),
          });
        }
      }

      await ctx.db.patch(existing._id, marketData);
      return existing._id;
    } else {
      const marketId = await ctx.db.insert("markets", marketData);
      
      // Store initial price history
      for (const outcome of args.outcomes) {
        await ctx.db.insert("priceHistory", {
          marketId,
          outcome: outcome.id,
          price: outcome.price,
          volume: outcome.volume,
          timestamp: Date.now(),
        });
      }

      return marketId;
    }
  },
});

export const getMarkets = query({
  args: {
    platformId: v.optional(v.id("platforms")),
    category: v.optional(v.string()),
    searchTerm: v.optional(v.string()),
    count: v.optional(v.number()),
  },
  handler: async (ctx, { platformId, category, searchTerm, count }) => {
    let query;

    if (platformId) {
      query = ctx.db
        .query("markets")
        .withIndex("by_platform", (q) => q.eq("platformId", platformId));
    } else {
      query = ctx.db.query("markets");
    }

    // Always filter for active markets
    query = query.filter((q) => q.eq(q.field("status"), "active"));

    if (category) {
      query = query.filter((q) => q.eq(q.field("category"), category));
    }

    if (searchTerm) {
      // Using a basic filter on title. For production, a search index is recommended.
      // Example: q.search("title", searchTerm) if a search index on 'title' is configured.
      query = query.filter((q) => q.eq(q.field("title"), searchTerm));
    }

    // Apply ordering and limit
    const orderedQuery = query.order("desc"); // Orders by _creationTime descending

    const markets = await orderedQuery.take(count ?? 10); // Default to 10 if count not provided

    // Fetch platform names for each market
    const marketsWithPlatformNames = await Promise.all(
      markets.map(async (market) => {
        if (!market.platformId) {
          return { ...market, platformDisplayName: "Unknown" };
        }
        const platform = await ctx.db.get(market.platformId);
        return {
          ...market,
          platformDisplayName: platform?.displayName ?? platform?.name ?? "Unknown",
        };
      })
    );

    return marketsWithPlatformNames;
  },
});

//Below is perplexity's optimized version of markets.ts

// import { internalMutation, query } from "./_generated/server";
// import { v } from "convex/values";

// export const upsertMarket = internalMutation({
//   args: {
//     platformId: v.id("platforms"),
//     externalId: v.string(),
//     title: v.string(),
//     description: v.optional(v.string()),
//     category: v.optional(v.string()),
//     outcomes: v.array(v.object({
//       id: v.string(),
//       name: v.string(),
//       price: v.number(),
//       volume: v.optional(v.number()),
//     })),
//     endDate: v.optional(v.number()),
//     totalVolume: v.optional(v.number()),
//     liquidity: v.optional(v.number()),
//     status: v.union(v.literal("active"), v.literal("closed"), v.literal("resolved")),
//     url: v.optional(v.string()),
//     metadata: v.optional(v.object({
//       tags: v.optional(v.array(v.string())),
//       minBet: v.optional(v.number()),
//       maxBet: v.optional(v.number()),
//       createdAt: v.optional(v.number()),
//     })),
//   },
//   handler: async (ctx, args) => {
//     // Validation to prevent unnecessary operations
//     if (!args.outcomes || args.outcomes.length === 0) {
//       throw new Error("Markets must have at least one outcome");
//     }

//     // Validate prices are reasonable
//     for (const outcome of args.outcomes) {
//       if (outcome.price < 0 || outcome.price > 1) {
//         throw new Error(`Invalid price ${outcome.price} for outcome ${outcome.name}`);
//       }
//     }

//     // Use compound index for efficient lookup
//     const existing = await ctx.db
//       .query("markets")
//       .withIndex("by_platform_external", (q) => 
//         q.eq("platformId", args.platformId).eq("externalId", args.externalId))
//       .first();

//     // Get platform data once for denormalization
//     const platform = await ctx.db.get(args.platformId);

//     const marketData = {
//       ...args,
//       platformDisplayName: platform?.displayName ?? platform?.name ?? "Unknown",
//       lastUpdated: Date.now(),
//     };

//     if (existing) {
//       // Collect all price changes first (batch processing)
//       const priceUpdates = [];
//       for (const outcome of existing.outcomes) {
//         const newOutcome = args.outcomes.find(o => o.id === outcome.id);
//         if (newOutcome && newOutcome.price !== outcome.price) {
//           priceUpdates.push({
//             marketId: existing._id,
//             outcome: outcome.id,
//             oldPrice: outcome.price,
//             newPrice: newOutcome.price,
//             volume: newOutcome.volume,
//             timestamp: Date.now(),
//           });
//         }
//       }

//       // Batch insert all price history records
//       if (priceUpdates.length > 0) {
//         await Promise.all(
//           priceUpdates.map(update => ctx.db.insert("priceHistory", update))
//         );
//       }

//       // Single update operation
//       await ctx.db.patch(existing._id, marketData);
//       return existing._id;

//     } else {
//       // Insert new market
//       const marketId = await ctx.db.insert("markets", marketData);

//       // Batch insert initial price history
//       const initialPriceHistory = args.outcomes.map(outcome => ({
//         marketId,
//         outcome: outcome.id,
//         newPrice: outcome.price,
//         volume: outcome.volume,
//         timestamp: Date.now(),
//       }));

//       await Promise.all(
//         initialPriceHistory.map(record => ctx.db.insert("priceHistory", record))
//       );

//       return marketId;
//     }
//   },
// });

// export const getMarkets = query({
//   args: {
//     platformId: v.optional(v.id("platforms")),
//     category: v.optional(v.string()),
//     searchTerm: v.optional(v.string()),
//     count: v.optional(v.number()),
//   },
//   handler: async (ctx, { platformId, category, searchTerm, count }) => {
//     // Cap maximum results to prevent excessive bandwidth usage
//     const limit = Math.min(count ?? 10, 100);

//     // Early return for empty search
//     if (searchTerm && searchTerm.trim().length === 0) {
//       return [];
//     }

//     // Use compound indexes for optimal performance
//     let query;

//     if (platformId) {
//       // Use compound index: by_platform_status
//       query = ctx.db
//         .query("markets")
//         .withIndex("by_platform_status", (q) => 
//           q.eq("platformId", platformId).eq("status", "active"));
//     } else if (category) {
//       // Use compound index: by_category_status  
//       query = ctx.db
//         .query("markets")
//         .withIndex("by_category_status", (q) => 
//           q.eq("category", category).eq("status", "active"));
//     } else {
//       // Use index: by_status_creation for ordering
//       query = ctx.db
//         .query("markets")
//         .withIndex("by_status_creation", (q) => 
//           q.eq("status", "active"));
//     }

//     // Apply search filter only when needed
//     if (searchTerm && searchTerm.trim().length > 0) {
//       const searchLower = searchTerm.toLowerCase().trim();
//       query = query.filter((q) => 
//         q.or(
//           q.eq(q.field("title").toLowerCase(), searchLower),
//           q.eq(q.field("description")?.toLowerCase(), searchLower)
//         )
//       );
//     }

//     // Apply category filter if not already indexed
//     if (category && platformId) {
//       query = query.filter((q) => q.eq(q.field("category"), category));
//     }

//     // Get markets with ordering and limit
//     const markets = await query
//       .order("desc") // Orders by _creationTime descending
//       .take(limit);

//     // OPTIMIZATION: Batch fetch all unique platform data
//     const uniquePlatformIds = [...new Set(
//       markets
//         .map(m => m.platformId)
//         .filter(Boolean)
//     )];

//     // Single batch operation instead of N individual queries
//     const platforms = await Promise.all(
//       uniquePlatformIds.map(id => ctx.db.get(id))
//     );

//     // Create lookup map for O(1) access
//     const platformMap = new Map(
//       platforms
//         .filter(Boolean)
//         .map(p => [p._id, p])
//     );

//     // Transform markets with platform names in single pass
//     const marketsWithPlatformNames = markets.map(market => ({
//       ...market,
//       platformDisplayName: market.platformDisplayName || // Use denormalized field first
//         platformMap.get(market.platformId)?.displayName ?? 
//         platformMap.get(market.platformId)?.name ?? 
//         "Unknown",
//     }));

//     return marketsWithPlatformNames;
//   },
// });

// // Additional helper query for analytics (optional)
// export const getMarketStats = query({
//   args: {
//     platformId: v.optional(v.id("platforms")),
//   },
//   handler: async (ctx, { platformId }) => {
//     let query = ctx.db.query("markets");

//     if (platformId) {
//       query = query.withIndex("by_platform", (q) => q.eq("platformId", platformId));
//     }

//     const markets = await query.collect();

//     const stats = {
//       total: markets.length,
//       active: markets.filter(m => m.status === "active").length,
//       closed: markets.filter(m => m.status === "closed").length,
//       resolved: markets.filter(m => m.status === "resolved").length,
//       totalVolume: markets.reduce((sum, m) => sum + (m.totalVolume || 0), 0),
//       avgLiquidity: markets.length > 0 
//         ? markets.reduce((sum, m) => sum + (m.liquidity || 0), 0) / markets.length 
//         : 0,
//     };

//     return stats;
//   },
// });

// // Batch update utility for maintenance operations
// export const batchUpdateMarkets = internalMutation({
//   args: {
//     updates: v.array(v.object({
//       marketId: v.id("markets"),
//       data: v.object({
//         status: v.optional(v.union(v.literal("active"), v.literal("closed"), v.literal("resolved"))),
//         totalVolume: v.optional(v.number()),
//         liquidity: v.optional(v.number()),
//       }),
//     })),
//   },
//   handler: async (ctx, { updates }) => {
//     // Process updates in batches to avoid overwhelming the database
//     const batchSize = 50;
//     const results = [];

//     for (let i = 0; i < updates.length; i += batchSize) {
//       const batch = updates.slice(i, i + batchSize);
//       const batchResults = await Promise.all(
//         batch.map(async ({ marketId, data }) => {
//           try {
//             await ctx.db.patch(marketId, {
//               ...data,
//               lastUpdated: Date.now(),
//             });
//             return { marketId, success: true };
//           } catch (error) {
//             return { marketId, success: false, error: error.message };
//           }
//         })
//       );
//       results.push(...batchResults);
//     }

//     return results;
//   },
// });