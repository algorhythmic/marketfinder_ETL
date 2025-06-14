import { query } from "./_generated/server";
import { v } from "convex/values";

// Get a single market by its ID
export const getMarketById = query({
  args: { id: v.id("markets") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
