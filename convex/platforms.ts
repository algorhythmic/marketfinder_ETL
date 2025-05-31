import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

// Initialize default platforms
export const initializePlatforms = mutation({
  args: {},
  handler: async (ctx) => {
    const platforms = [
      {
        name: "polymarket",
        displayName: "Polymarket",
        baseUrl: "https://polymarket.com",
        apiEndpoint: "https://gamma-api.polymarket.com",
        isActive: true,
        rateLimit: 60,
        syncStatus: "active" as const,
      },
      {
        name: "kalshi",
        displayName: "Kalshi",
        baseUrl: "https://kalshi.com",
        apiEndpoint: "https://trading-api.kalshi.com/trade-api/v2",
        isActive: true,
        rateLimit: 100,
        syncStatus: "active" as const,
      },
      {
        name: "predictit",
        displayName: "PredictIt",
        baseUrl: "https://www.predictit.org",
        apiEndpoint: "https://www.predictit.org/api/marketdata",
        isActive: true,
        rateLimit: 30,
        syncStatus: "active" as const,
      },
      {
        name: "manifold",
        displayName: "Manifold Markets",
        baseUrl: "https://manifold.markets",
        apiEndpoint: "https://api.manifold.markets/v0",
        isActive: true,
        rateLimit: 120,
        syncStatus: "active" as const,
      },
    ];

    for (const platform of platforms) {
      const existing = await ctx.db
        .query("platforms")
        .withIndex("by_name", (q) => q.eq("name", platform.name))
        .first();
      
      if (!existing) {
        await ctx.db.insert("platforms", platform);
      }
    }
  },
});

// Get all active platforms
export const listPlatforms = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("platforms")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

// Get platform sync status
export const getPlatformStatus = query({
  args: {},
  handler: async (ctx) => {
    const platforms = await ctx.db.query("platforms").collect();
    const logs = await ctx.db
      .query("syncLogs")
      .withIndex("by_timestamp")
      .order("desc")
      .take(100);

    return platforms.map(platform => {
      const recentLogs = logs
        .filter(log => log.platformId === platform._id)
        .slice(0, 5);
      
      return {
        ...platform,
        recentLogs,
        lastSync: recentLogs[0]?.timestamp,
      };
    });
  },
});

// Update platform configuration (admin only)
export const updatePlatform = mutation({
  args: {
    platformId: v.id("platforms"),
    updates: v.object({
      isActive: v.optional(v.boolean()),
      rateLimit: v.optional(v.number()),
      syncStatus: v.optional(v.union(v.literal("active"), v.literal("error"), v.literal("paused"))),
    }),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Authentication required");

    // TODO: Add admin role check
    
    await ctx.db.patch(args.platformId, args.updates);
  },
});
