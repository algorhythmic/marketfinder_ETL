import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { Doc, Id } from "./_generated/dataModel";

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
    // Use compound index for better performance
    const existing = await ctx.db
      .query("markets")
      .withIndex("by_platform_external", (q) => 
        q.eq("platformId", args.platformId).eq("externalId", args.externalId))
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
          await ctx.db.insert("priceHistory", {
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

// Optimized query with server-side filtering
export const getMarkets = query({
  args: {
    platformId: v.optional(v.id("platforms")),
    category: v.optional(v.string()),
    searchTerm: v.optional(v.string()),
    count: v.optional(v.number()),
    minVolume: v.optional(v.number()),
    maxVolume: v.optional(v.number()),
    minLiquidity: v.optional(v.number()),
    maxLiquidity: v.optional(v.number()),
    endDateBefore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let markets: Doc<"markets">[];

    // Handle search queries separately
    if (args.searchTerm) {
      let searchQuery = ctx.db
        .query("markets")
        .withSearchIndex("search_markets", (q) => {
          let search = q.search("title", args.searchTerm!);
          // Apply filters that are supported by the search index
          search = search.eq("status", "active");
          if (args.platformId) {
            search = search.eq("platformId", args.platformId);
          }
          if (args.category) {
            search = search.eq("category", args.category);
          }
          return search;
        });

      // Apply additional filters that aren't in the search index
      searchQuery = searchQuery.filter((q) => {
        let conditions = q.eq(q.field("_id"), q.field("_id")); // Always true base condition
        
        if (args.minVolume !== undefined) {
          conditions = q.and(conditions, q.gte(q.field("totalVolume"), args.minVolume));
        }
        if (args.maxVolume !== undefined) {
          conditions = q.and(conditions, q.lte(q.field("totalVolume"), args.maxVolume));
        }
        if (args.minLiquidity !== undefined) {
          conditions = q.and(conditions, q.gte(q.field("liquidity"), args.minLiquidity));
        }
        if (args.maxLiquidity !== undefined) {
          conditions = q.and(conditions, q.lte(q.field("liquidity"), args.maxLiquidity));
        }
        if (args.endDateBefore !== undefined) {
          conditions = q.and(conditions, q.lte(q.field("endDate"), args.endDateBefore));
        }
        
        return conditions;
      });

      markets = await searchQuery.take(args.count ?? 50);
    } else {
      // Handle non-search queries with proper indexing
      let queryBuilder;
      
      if (args.platformId !== undefined) {
        queryBuilder = ctx.db
          .query("markets")
          .withIndex("by_platform_status", (q) => 
            q.eq("platformId", args.platformId!).eq("status", "active"));
      } else {
        queryBuilder = ctx.db
          .query("markets")
          .withIndex("by_status", (q) => q.eq("status", "active"));
      }

      // Apply additional filters
      queryBuilder = queryBuilder.filter((q) => {
        let conditions = q.eq(q.field("_id"), q.field("_id")); // Always true base condition
        
        if (args.category) {
          conditions = q.and(conditions, q.eq(q.field("category"), args.category));
        }
        if (args.minVolume !== undefined) {
          conditions = q.and(conditions, q.gte(q.field("totalVolume"), args.minVolume));
        }
        if (args.maxVolume !== undefined) {
          conditions = q.and(conditions, q.lte(q.field("totalVolume"), args.maxVolume));
        }
        if (args.minLiquidity !== undefined) {
          conditions = q.and(conditions, q.gte(q.field("liquidity"), args.minLiquidity));
        }
        if (args.maxLiquidity !== undefined) {
          conditions = q.and(conditions, q.lte(q.field("liquidity"), args.maxLiquidity));
        }
        if (args.endDateBefore !== undefined) {
          conditions = q.and(conditions, q.lte(q.field("endDate"), args.endDateBefore));
        }
        
        return conditions;
      });

      markets = await queryBuilder.order("desc").take(args.count ?? 50);
    }

    // Efficiently fetch platform information
    const platformIds = markets
      .map((market: Doc<"markets">) => market.platformId)
      .filter((id): id is Id<"platforms"> => id !== undefined);
    
    const uniquePlatformIds = [...new Set(platformIds)];

    const platforms = await Promise.all(
      uniquePlatformIds.map(async (id) => {
        const platform = await ctx.db.get(id);
        return platform;
      })
    );
    
    const platformMap = new Map(
      platforms
        .filter((p): p is Doc<"platforms"> => p !== null)
        .map((p: Doc<"platforms">) => [p._id, p])
    );

    const marketsWithPlatformNames = markets.map((market: Doc<"markets">) => ({
      ...market,
      platformDisplayName: platformMap.get(market.platformId)?.displayName ??
                           platformMap.get(market.platformId)?.name ?? "Unknown",
    }));

    return marketsWithPlatformNames;
  },
});

// New paginated query for better performance
export const getMarketsPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    platformId: v.optional(v.id("platforms")),
    category: v.optional(v.string()),
    searchTerm: v.optional(v.string()),
    minVolume: v.optional(v.number()),
    maxVolume: v.optional(v.number()),
    minLiquidity: v.optional(v.number()),
    maxLiquidity: v.optional(v.number()),
    endDateBefore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let queryBuilder;

    // Handle search queries
    if (args.searchTerm) {
      queryBuilder = ctx.db
        .query("markets")
        .withSearchIndex("search_markets", (q) => {
          let search = q.search("title", args.searchTerm!);
          search = search.eq("status", "active");
          if (args.platformId) {
            search = search.eq("platformId", args.platformId);
          }
          if (args.category) {
            search = search.eq("category", args.category);
          }
          return search;
        });
    } else if (args.platformId) {
      queryBuilder = ctx.db
        .query("markets")
        .withIndex("by_platform_status", (q) => 
          q.eq("platformId", args.platformId!).eq("status", "active"));
    } else {
      queryBuilder = ctx.db
        .query("markets")
        .withIndex("by_last_updated")
        .filter((q) => q.eq(q.field("status"), "active"));
    }

    // Apply additional filters
    const filteredQuery = queryBuilder.filter((q) => {
      let conditions = q.eq(q.field("_id"), q.field("_id")); // Always true base condition
      
      if (args.category && !args.searchTerm) { // Don't re-filter if already filtered by search
        conditions = q.and(conditions, q.eq(q.field("category"), args.category));
      }
      if (args.minVolume !== undefined) {
        conditions = q.and(conditions, q.gte(q.field("totalVolume"), args.minVolume));
      }
      if (args.maxVolume !== undefined) {
        conditions = q.and(conditions, q.lte(q.field("totalVolume"), args.maxVolume));
      }
      if (args.minLiquidity !== undefined) {
        conditions = q.and(conditions, q.gte(q.field("liquidity"), args.minLiquidity));
      }
      if (args.maxLiquidity !== undefined) {
        conditions = q.and(conditions, q.lte(q.field("liquidity"), args.maxLiquidity));
      }
      if (args.endDateBefore !== undefined) {
        conditions = q.and(conditions, q.lte(q.field("endDate"), args.endDateBefore));
      }
      
      return conditions;
    });

    // Handle pagination differently for search vs non-search queries
    // Ordering (via index default: by_platform_status, or by_last_updated ascending, or search relevance)
    // is now determined by how queryBuilder was constructed.
    // Simplifying to remove the .order("desc") error for now.
    return await filteredQuery.paginate(args.paginationOpts);
  },
});

// Lightweight query for getting market stats
export const getMarketStats = query({
  args: {},
  handler: async (ctx) => {
    const markets = await ctx.db
      .query("markets")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const volumes = markets.map(m => m.totalVolume ?? 0);
    const liquidities = markets.map(m => m.liquidity ?? 0);

    const hasMarkets = markets.length > 0; // Check if any markets were returned

    return {
      totalMarkets: markets.length,
      minVolume: hasMarkets ? Math.min(...volumes) : 0, // Default to 0 if no markets
      maxVolume: hasMarkets ? Math.max(...volumes) : 0, // Default to 0 if no markets
      minLiquidity: hasMarkets ? Math.min(...liquidities) : 0, // Default to 0 if no markets
      maxLiquidity: hasMarkets ? Math.max(...liquidities) : 0, // Default to 0 if no markets
    };
  },
});
