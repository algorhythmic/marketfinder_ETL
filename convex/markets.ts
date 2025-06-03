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

    return await orderedQuery.take(count ?? 10); // Default to 10 if count not provided
  },
});