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
    rateLimit: v.number(),
    lastSync: v.optional(v.number()),
    syncStatus: v.union(v.literal("active"), v.literal("error"), v.literal("paused")),
  }).index("by_name", ["name"]),

  // Clean markets table for ETL processed data
  markets: defineTable({
    platform: v.string(), // "kalshi" | "polymarket"
    externalId: v.string(), // Platform-specific ID
    title: v.string(),
    description: v.string(),
    category: v.string(), // Standardized categories
    eventType: v.string(), // "binary" initially
    
    // Binary outcomes structure
    outcomes: v.array(v.object({
      name: v.string(), // "Yes" | "No"
      price: v.number(), // 0.0 - 1.0
    })),
    
    // Market metrics
    volume: v.number(),
    liquidity: v.number(),
    endDate: v.number(),
    
    // Status tracking
    isActive: v.boolean(),
    
    // ETL metadata
    processedAt: v.number(), // When ETL processed this market
    etlVersion: v.string(), // ETL pipeline version
  })
    .index("by_platform", ["platform"])
    .index("by_category", ["category"])
    .index("by_active", ["isActive"])
    .index("by_platform_external", ["platform", "externalId"]) // For upserts
    .index("by_processed_at", ["processedAt"])
    .searchIndex("search_markets", {
      searchField: "title",
      filterFields: ["platform", "category", "isActive"],
    }),

  // Rest of your tables remain the same...
  marketGroups: defineTable({
    name: v.string(),
    description: v.string(),
    category: v.string(),
    confidence: v.number(),
    isVerified: v.boolean(),
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

  marketGroupMemberships: defineTable({
    marketId: v.id("markets"),
    groupId: v.id("marketGroups"),
    confidence: v.number(),
    addedBy: v.union(v.literal("ai"), v.literal("human")),
    addedAt: v.number(),
  })
    .index("by_market", ["marketId"])
    .index("by_group", ["groupId"])
    .index("by_confidence", ["confidence"]),

  // Market similarities from ETL LLM analysis
  marketSimilarities: defineTable({
    market1Id: v.string(), // External ID from platform
    market2Id: v.string(), // External ID from platform
    platform1: v.string(), // "kalshi" | "polymarket"
    platform2: v.string(), // "kalshi" | "polymarket"
    confidence: v.number(), // 0.7 - 1.0
    reasoning: v.string(), // LLM explanation
    analyzedAt: v.number(),
    llmModel: v.string(), // "gpt-4", etc.
  })
    .index("by_confidence", ["confidence"])
    .index("by_market1", ["market1Id"])
    .index("by_market2", ["market2Id"])
    .index("by_platforms", ["platform1", "platform2"])
    .index("by_analyzed_at", ["analyzedAt"]),

  // Arbitrage opportunities from ETL processing
  arbitrageOpportunities: defineTable({
    // Reference to similarity that generated this opportunity
    similarityId: v.optional(v.string()),
    
    // Market references (external IDs)
    buyMarketId: v.string(),
    sellMarketId: v.string(),
    buyPlatform: v.string(),
    sellPlatform: v.string(),
    
    // Opportunity metrics
    profitMargin: v.number(),
    confidence: v.number(), // From similarity analysis
    
    // Detection metadata
    detectedAt: v.number(),
    status: v.union(v.literal("active"), v.literal("expired"), v.literal("taken")),
    etlVersion: v.string(),
  })
    .index("by_profit_margin", ["profitMargin"])
    .index("by_detected_at", ["detectedAt"])
    .index("by_status", ["status"])
    .index("by_platforms", ["buyPlatform", "sellPlatform"]),

  users: defineTable({
    // Fields from Clerk
    name: v.optional(v.string()),
    clerkId: v.optional(v.string()),
    // Custom fields
    preferences: v.optional(v.object({
      categories: v.array(v.string()),
      platforms: v.array(v.id("platforms")),
      minProfitMargin: v.number(),
      alertsEnabled: v.boolean(),
      emailNotifications: v.boolean(),
    })),
    llmApiKey: v.optional(v.string()), // Added for LLM API Key storage
  }).index("by_clerk_id", ["clerkId"]), // Index for querying by Clerk user ID

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
      polymarket: v.optional(v.string()),
      kalshi: v.optional(v.string()),
      predictit: v.optional(v.string()),
    })),
    lastActive: v.number(),
  }).index("by_user", ["userId"]),

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

  // ETL pipeline execution logs
  etlLogs: defineTable({
    runId: v.string(), // UUID for each ETL run
    status: v.union(v.literal("success"), v.literal("error"), v.literal("partial")),
    
    // Processing metrics
    marketsProcessed: v.number(),
    similaritiesGenerated: v.number(),
    opportunitiesFound: v.number(),
    
    // Timing and errors
    startTime: v.number(),
    endTime: v.number(),
    duration: v.number(), // milliseconds
    errors: v.optional(v.array(v.string())),
    
    // ETL metadata
    etlVersion: v.string(),
    llmModel: v.optional(v.string()),
    
    // Platform-specific metrics
    kalshiMarketsCount: v.number(),
    polymarketMarketsCount: v.number(),
  })
    .index("by_run_id", ["runId"])
    .index("by_status", ["status"])
    .index("by_start_time", ["startTime"]),

  // Store API credentials securely by user
  platformCredentials: defineTable({
    platformId: v.id("platforms"),
    userId: v.id("users"),
    apiKey: v.string(),   // Kalshi Key ID
    privateKey: v.optional(v.string()), // Kalshi RSA private key
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_platform", ["platformId"])
    .index("by_user", ["userId"])
    .index("by_platform_and_user", ["platformId", "userId"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
