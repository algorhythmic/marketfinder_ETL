import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
// Removed unused imports

/**
 * Create a sync log entry to track platform data synchronization
 */
export const createSyncLog = internalMutation({
  args: {
    platformId: v.id("platforms"),
    status: v.union(v.literal("success"), v.literal("error"), v.literal("partial")),
    marketsProcessed: v.number(),
    errors: v.optional(v.array(v.string())),
    duration: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("syncLogs", {
      platformId: args.platformId,
      status: args.status,
      marketsProcessed: args.marketsProcessed,
      errors: args.errors,
      duration: args.duration,
      timestamp: Date.now(),
    });
  },
});

/**
 * Get recent sync logs for all platforms or a specific platform
 */
export const getRecentSyncLogs = internalQuery({
  args: {
    platformId: v.optional(v.id("platforms")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 10;
    
    let query = ctx.db
      .query("syncLogs")
      .withIndex("by_timestamp")
      .order("desc");
      
    if (args.platformId) {
      query = query.filter(q => 
        q.eq(q.field("platformId"), args.platformId)
      );
    }
    
    return await query.take(limit);
  },
});
