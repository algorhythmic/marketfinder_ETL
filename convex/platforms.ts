import { query, mutation, internalQuery } from "./_generated/server";
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

export const getPlatformByIdInternal = internalQuery({
  args: { platformId: v.id("platforms") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.platformId);
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

export const getPlatformByName = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("platforms")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
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
    isActive: v.optional(v.boolean()),
    syncStatus: v.optional(v.union(v.literal("active"), v.literal("paused"))),
    rateLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // In a real app, would check admin status here
    const { platformId, ...updates } = args;
    return await ctx.db.patch(platformId, updates);
  },
});

// Store platform API credentials securely
// This uses userProfiles table temporarily until schema changes are fully applied
export const storePlatformCredentials = mutation({
  args: {
    platformName: v.string(),
    credentials: v.object({
      apiKey: v.string(),
      privateKey: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const { platformName, credentials } = args;
    const userId = await getAuthUserId(ctx);
    
    if (!userId) {
      throw new Error("Authentication required");
    }
    
    // Get the platform
    const platform = await ctx.db
      .query("platforms")
      .withIndex("by_name", q => q.eq("name", platformName))
      .first();
    
    if (!platform) {
      throw new Error(`Platform ${platformName} not found`);
    }
    
    // Get or create user profile
    let profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();
      
    if (!profile) {
      // Create default user profile if it doesn't exist
      const profileId = await ctx.db.insert("userProfiles", {
        userId,
        subscriptionTier: "free",
        preferences: {
          categories: [],
          platforms: [],
          minProfitMargin: 2,
          alertsEnabled: true,
          emailNotifications: false,
        },
        apiKeys: {},
        lastActive: Date.now(),
      });
      
      profile = await ctx.db.get(profileId);
    }
    
    // Update the apiKeys field in the profile
    // We know profile is not null at this point due to the check above
    if (profile) {
      // Create a properly typed apiKeys object with index signature
      const apiKeys: Record<string, string> = profile.apiKeys ? { ...profile.apiKeys } : {};
      apiKeys[platformName] = credentials.apiKey;
      
      // Store credentials in user profile for now
      // In the future, this would be moved to the dedicated platformCredentials table
      // when the schema changes are fully applied
      await ctx.db.patch(profile._id, {
        apiKeys,
        lastActive: Date.now(),
      });
    }
    
    // Store a note in the console about the credential update
    console.log(`Updated API credentials for ${platformName} for user ${userId}`);
    
    return { success: true, platformName };
  },
});

// Get platform credentials for a specific platform (only returns for authenticated user)
export const getPlatformCredentials = query({
  args: {
    platformName: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    
    if (!userId) {
      return null; // No credentials available for unauthenticated users
    }
    
    // First get the platform to confirm it exists
    const platform = await ctx.db
      .query("platforms")
      .withIndex("by_name", q => q.eq("name", args.platformName))
      .first();
      
    if (!platform) {
      return null;
    }
    
    // Get user profile to check for credentials
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();
      
    if (!profile || !profile.apiKeys) {
      return { configured: false };
    }
    
    // Use type assertion to treat apiKeys as a record with string keys
    const apiKeys = profile.apiKeys as Record<string, string | undefined>;
    const apiKey = apiKeys?.[args.platformName];
    
    return { 
      configured: !!apiKey,
      lastUpdated: profile.lastActive,
      // We don't return the actual keys for security, just confirmation they exist
      hasApiKey: !!apiKey,
    };
  },
});
