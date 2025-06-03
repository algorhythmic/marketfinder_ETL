import { query, mutation, internalMutation, action } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

// Get markets with filtering and pagination
export const getMarkets = query({
  args: {
    platformId: v.optional(v.id("platforms")),
    category: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("closed"), v.literal("resolved"))),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.search) {
      let query = ctx.db
        .query("markets")
        .withSearchIndex("search_markets", (q) => {
          let searchQuery = q.search("title", args.search!);
          if (args.platformId) {
            searchQuery = searchQuery.eq("platformId", args.platformId);
          }
          if (args.category) {
            searchQuery = searchQuery.eq("category", args.category);
          }
          if (args.status) {
            searchQuery = searchQuery.eq("status", args.status);
          }
          return searchQuery;
        });

      const markets = await query.collect();
      
      // Fetch platform info for each market
      const marketsWithPlatforms = await Promise.all(
        markets.map(async (market) => {
          const platform = await ctx.db.get(market.platformId);
          return { ...market, platform };
        })
      );

      return marketsWithPlatforms;
    }

    let query = ctx.db.query("markets");

    if (args.platformId) {
      query = query.withIndex("by_platform", (q) => q.eq("platformId", args.platformId));
    } else if (args.category) {
      query = query.withIndex("by_category", (q) => q.eq("category", args.category));
    } else if (args.status) {
      query = query.withIndex("by_status", (q) => q.eq("status", args.status));
    }

    const markets = await query.order("desc").take(args.limit || 50);

    // Fetch platform info for each market
    const marketsWithPlatforms = await Promise.all(
      markets.map(async (market) => {
        const platform = await ctx.db.get(market.platformId);
        return { ...market, platform };
      })
    );

    return marketsWithPlatforms;
  },
});

// Get market details with price history
export const getMarketDetails = query({
  args: { marketId: v.id("markets") },
  handler: async (ctx, args) => {
    const market = await ctx.db.get(args.marketId);
    if (!market) return null;

    const platform = await ctx.db.get(market.platformId);
    const priceHistory = await ctx.db
      .query("priceHistory")
      .withIndex("by_market", (q) => q.eq("marketId", args.marketId))
      .order("desc")
      .take(100);

    // Get market group if exists
    const groupMembership = await ctx.db
      .query("marketGroupMemberships")
      .withIndex("by_market", (q) => q.eq("marketId", args.marketId))
      .first();

    let group = null;
    let relatedMarkets: any[] = [];
    
    if (groupMembership) {
      group = await ctx.db.get(groupMembership.groupId);
      const allMemberships = await ctx.db
        .query("marketGroupMemberships")
        .withIndex("by_group", (q) => q.eq("groupId", groupMembership.groupId))
        .collect();
      
      relatedMarkets = await Promise.all(
        allMemberships
          .filter(m => m.marketId !== args.marketId)
          .map(async (m) => {
            const relatedMarket = await ctx.db.get(m.marketId);
            const relatedPlatform = relatedMarket ? await ctx.db.get(relatedMarket.platformId) : null;
            return relatedMarket && relatedPlatform ? { ...relatedMarket, platform: relatedPlatform } : null;
          })
      ).then(markets => markets.filter(Boolean));
    }

    return {
      ...market,
      platform,
      priceHistory,
      group,
      relatedMarkets,
    };
  },
});

// Upsert market data (used by sync process)
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
      .query("markets")
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

// Get markets by category for dashboard
export const getMarketsByCategory = query({
  args: {},
  handler: async (ctx) => {
    const markets = await ctx.db
      .query("markets")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const categories = markets.reduce((acc, market) => {
      const category = market.category || "Other";
      if (!acc[category]) acc[category] = [];
      acc[category].push(market);
      return acc;
    }, {} as Record<string, typeof markets>);

    return Object.entries(categories).map(([name, markets]) => ({
      name,
      count: markets.length,
      totalVolume: markets.reduce((sum, m) => sum + (m.totalVolume || 0), 0),
      markets: markets.slice(0, 10), // Top 10 per category
    }));
  },
});

// Get trending markets (high volume, recent activity)
export const getTrendingMarkets = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const markets = await ctx.db
      .query("markets")
      .withIndex("by_last_updated")
      .order("desc")
      .filter((q) => q.eq(q.field("status"), "active"))
      .take(args.limit || 20);

    // Sort by volume and recent activity
    return markets
      .filter(m => m.totalVolume && m.totalVolume > 0)
      .sort((a, b) => {
        const aScore = (a.totalVolume || 0) * (1 + (Date.now() - a.lastUpdated) / (1000 * 60 * 60 * 24));
        const bScore = (b.totalVolume || 0) * (1 + (Date.now() - b.lastUpdated) / (1000 * 60 * 60 * 24));
        return bScore - aScore;
      });
  },
});