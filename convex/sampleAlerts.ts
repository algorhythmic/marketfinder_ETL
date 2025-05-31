import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

// Create sample alerts for demonstration
export const createSampleAlerts = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Authentication required");

    // Check if user already has alerts
    const existingAlerts = await ctx.db
      .query("alerts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existingAlerts) return; // Don't create duplicates

    const sampleAlerts = [
      {
        userId,
        type: "arbitrage" as const,
        title: "High Profit Arbitrage Detected",
        message: "Found 8.5% profit opportunity between Polymarket and Kalshi for Trump 2024 election market",
        isRead: false,
        createdAt: Date.now() - (2 * 60 * 60 * 1000), // 2 hours ago
      },
      {
        userId,
        type: "price_change" as const,
        title: "Significant Price Movement",
        message: "Bitcoin $100K market price changed by 15% in the last hour",
        isRead: false,
        createdAt: Date.now() - (4 * 60 * 60 * 1000), // 4 hours ago
      },
      {
        userId,
        type: "new_market" as const,
        title: "New Market Added",
        message: "New prediction market detected: 'Will AI achieve AGI by 2025?' on Manifold Markets",
        isRead: true,
        createdAt: Date.now() - (24 * 60 * 60 * 1000), // 1 day ago
      },
      {
        userId,
        type: "arbitrage" as const,
        title: "Moderate Arbitrage Opportunity",
        message: "3.2% profit margin detected for crypto prediction markets across platforms",
        isRead: true,
        createdAt: Date.now() - (2 * 24 * 60 * 60 * 1000), // 2 days ago
      },
    ];

    for (const alert of sampleAlerts) {
      await ctx.db.insert("alerts", alert);
    }
  },
});
