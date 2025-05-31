import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

// Create user profile
export const createUserProfile = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("userProfiles", {
      userId: args.userId,
      subscriptionTier: "free",
      preferences: {
        categories: [],
        platforms: [],
        minProfitMargin: 2,
        alertsEnabled: true,
        emailNotifications: false,
      },
      lastActive: Date.now(),
    });
  },
});

// Get or create user profile
export const getUserProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    let profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    return profile;
  },
});

// Update user preferences
export const updatePreferences = mutation({
  args: {
    preferences: v.object({
      categories: v.optional(v.array(v.string())),
      platforms: v.optional(v.array(v.id("platforms"))),
      minProfitMargin: v.optional(v.number()),
      alertsEnabled: v.optional(v.boolean()),
      emailNotifications: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Authentication required");

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (!profile) throw new Error("Profile not found");

    await ctx.db.patch(profile._id, {
      preferences: {
        ...profile.preferences,
        ...args.preferences,
      },
      lastActive: Date.now(),
    });
  },
});

// Get user alerts
export const getUserAlerts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("alerts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(args.limit || 50);
  },
});

// Mark alerts as read
export const markAlertsRead = mutation({
  args: { alertIds: v.array(v.id("alerts")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Authentication required");

    for (const alertId of args.alertIds) {
      const alert = await ctx.db.get(alertId);
      if (alert && alert.userId === userId) {
        await ctx.db.patch(alertId, { isRead: true });
      }
    }
  },
});

// Get subscription info
export const getSubscriptionInfo = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (!profile) return null;

    const limits = {
      free: {
        maxAlerts: 5,
        maxWatchlists: 1,
        apiAccess: false,
        realTimeData: false,
      },
      pro: {
        maxAlerts: 50,
        maxWatchlists: 10,
        apiAccess: true,
        realTimeData: true,
      },
      enterprise: {
        maxAlerts: -1, // unlimited
        maxWatchlists: -1,
        apiAccess: true,
        realTimeData: true,
      },
    };

    return {
      tier: profile.subscriptionTier,
      expires: profile.subscriptionExpires,
      limits: limits[profile.subscriptionTier],
    };
  },
});

// Create user profile (public)
export const createProfile = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Authentication required");

    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("userProfiles", {
      userId,
      subscriptionTier: "free",
      preferences: {
        categories: [],
        platforms: [],
        minProfitMargin: 2,
        alertsEnabled: true,
        emailNotifications: false,
      },
      lastActive: Date.now(),
    });
  },
});
