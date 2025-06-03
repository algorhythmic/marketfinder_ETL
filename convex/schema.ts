import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  // Platform definitions
  platforms: defineTable({
    name: v.string(),
    displayName: v.string(),
    baseUrl: v.string(),
    apiEndpoint: v.optional(v.string()),
    isActive: v.boolean(),
    rateLimit: v.number(), // requests per minute
    lastSync: v.optional(v.number()),
    syncStatus: v.union(v.literal("active"), v.literal("error"), v.literal("paused")),
  }).index("by_name", ["name"]),

  // Raw market data from each platform
  markets: defineTable({
    platformId: v.id("platforms"),
    externalId: v.string(), // Platform's internal ID
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
    lastUpdated: v.number(),
    url: v.optional(v.string()),
    metadata: v.optional(v.object({
      tags: v.optional(v.array(v.string())),
      minBet: v.optional(v.number()),
      maxBet: v.optional(v.number()),
      createdAt: v.optional(v.number()),
    })),
  })
    .index("by_platform", ["platformId"])
    .index("by_status", ["status"])
    .index("by_category", ["category"])
    .index("by_last_updated", ["lastUpdated"])
    .searchIndex("search_markets", {
      searchField: "title",
      filterFields: ["platformId", "category", "status"],
    }),

  // Semantic market groups - markets that are equivalent across platforms
  marketGroups: defineTable({
    name: v.string(), // Canonical name for this group
    description: v.string(),
    category: v.string(),
    confidence: v.number(), // AI confidence in grouping (0-1)
    isVerified: v.boolean(), // Human verified
    createdBy: v.union(v.literal("ai"), v.literal("human")),
    lastAnalyzed: v.number(),
    tags: v.array(v.string()),
  })
    .index("by_category", ["category"])
    .index("by_confidence", ["confidence"])
    .searchIndex("search_groups", {
      searchField: "name",
      filterFields: ["category", "isVerified"],
    }),

  // Links markets to their semantic groups
  marketGroupMemberships: defineTable({
    marketId: v.id("markets"),
    groupId: v.id("marketGroups"),
    confidence: v.number(), // AI confidence this market belongs to group
    addedBy: v.union(v.literal("ai"), v.literal("human")),
    addedAt: v.number(),
  })
    .index("by_market", ["marketId"])
    .index("by_group", ["groupId"])
    .index("by_confidence", ["confidence"]),

  // Arbitrage opportunities
  arbitrageOpportunities: defineTable({
    groupId: v.id("marketGroups"),
    buyMarketId: v.id("markets"), // Market to buy
    sellMarketId: v.id("markets"), // Market to sell
    buyOutcome: v.string(),
    sellOutcome: v.string(),
    buyPrice: v.number(),
    sellPrice: v.number(),
    profitMargin: v.number(), // Expected profit percentage
    confidence: v.number(), // Confidence in opportunity
    volume: v.optional(v.number()), // Available volume
    detectedAt: v.number(),
    expiresAt: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("expired"), v.literal("taken")),
  })
    .index("by_group", ["groupId"])
    .index("by_profit_margin", ["profitMargin"])
    .index("by_detected_at", ["detectedAt"])
    .index("by_status", ["status"]),

  // User subscriptions and preferences
  userProfiles: defineTable({
    userId: v.id("users"),
    subscriptionTier: v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise")),
    subscriptionExpires: v.optional(v.number()),
    preferences: v.object({
      categories: v.array(v.string()),
      platforms: v.array(v.id("platforms")),
      minProfitMargin: v.number(),
      alertsEnabled: v.boolean(),
      emailNotifications: v.boolean(),
    }),
    apiKeys: v.optional(v.object({
      // Encrypted API keys for platforms
      polymarket: v.optional(v.string()),
      kalshi: v.optional(v.string()),
      predictit: v.optional(v.string()),
    })),
    lastActive: v.number(),
  }).index("by_user", ["userId"]),

  // User alerts and notifications
  alerts: defineTable({
    userId: v.id("users"),
    type: v.union(v.literal("arbitrage"), v.literal("price_change"), v.literal("new_market")),
    title: v.string(),
    message: v.string(),
    data: v.optional(v.object({
      arbitrageId: v.optional(v.id("arbitrageOpportunities")),
      marketId: v.optional(v.id("markets")),
      groupId: v.optional(v.id("marketGroups")),
    })),
    isRead: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_created_at", ["createdAt"])
    .index("by_unread", ["userId", "isRead"]),

  // Analytics and tracking
  priceHistory: defineTable({
    marketId: v.id("markets"),
    outcome: v.string(),
    price: v.number(),
    volume: v.optional(v.number()),
    timestamp: v.number(),
  })
    .index("by_market", ["marketId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_market_and_time", ["marketId", "timestamp"]),

  // System logs for monitoring
  syncLogs: defineTable({
    platformId: v.id("platforms"),
    status: v.union(v.literal("success"), v.literal("error"), v.literal("partial")),
    marketsProcessed: v.number(),
    errors: v.optional(v.array(v.string())),
    duration: v.number(), // milliseconds
    timestamp: v.number(),
  })
    .index("by_platform", ["platformId"])
    .index("by_timestamp", ["timestamp"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});