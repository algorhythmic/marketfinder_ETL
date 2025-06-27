import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ETL Pipeline Mutations for Clean Data Storage

export const upsertMarkets = mutation({
  args: { 
    markets: v.array(v.object({
      platform: v.string(),
      externalId: v.string(),
      title: v.string(),
      description: v.string(),
      category: v.string(),
      eventType: v.string(),
      outcomes: v.array(v.object({
        name: v.string(),
        price: v.number(),
      })),
      volume: v.number(),
      liquidity: v.number(),
      endDate: v.number(),
      isActive: v.boolean(),
      processedAt: v.number(),
      etlVersion: v.string(),
    }))
  },
  handler: async (ctx, { markets }) => {
    let upsertedCount = 0;
    let insertedCount = 0;
    let updatedCount = 0;

    for (const market of markets) {
      // Check if market exists
      const existing = await ctx.db
        .query("markets")
        .withIndex("by_platform_external", (q) =>
          q.eq("platform", market.platform).eq("externalId", market.externalId)
        )
        .first();

      if (existing) {
        // Update existing market
        await ctx.db.patch(existing._id, {
          title: market.title,
          description: market.description,
          category: market.category,
          outcomes: market.outcomes,
          volume: market.volume,
          liquidity: market.liquidity,
          endDate: market.endDate,
          isActive: market.isActive,
          processedAt: market.processedAt,
          etlVersion: market.etlVersion,
        });
        updatedCount++;
      } else {
        // Insert new market
        await ctx.db.insert("markets", market);
        insertedCount++;
      }
      upsertedCount++;
    }

    return { 
      total: upsertedCount, 
      inserted: insertedCount, 
      updated: updatedCount 
    };
  },
});

export const upsertSimilarities = mutation({
  args: { 
    similarities: v.array(v.object({
      market1Id: v.string(),
      market2Id: v.string(),
      platform1: v.string(),
      platform2: v.string(),
      confidence: v.number(),
      reasoning: v.string(),
      analyzedAt: v.number(),
      llmModel: v.string(),
    }))
  },
  handler: async (ctx, { similarities }) => {
    // Clear old similarities for fresh data (for now)
    // TODO: Implement incremental updates later
    const existingSimilarities = await ctx.db.query("marketSimilarities").collect();
    for (const existing of existingSimilarities) {
      await ctx.db.delete(existing._id);
    }

    // Insert new similarities
    for (const similarity of similarities) {
      await ctx.db.insert("marketSimilarities", similarity);
    }

    return { inserted: similarities.length };
  },
});

export const upsertOpportunities = mutation({
  args: { 
    opportunities: v.array(v.object({
      similarityId: v.optional(v.string()),
      buyMarketId: v.string(),
      sellMarketId: v.string(),
      buyPlatform: v.string(),
      sellPlatform: v.string(),
      profitMargin: v.number(),
      confidence: v.number(),
      detectedAt: v.number(),
      status: v.string(),
      etlVersion: v.string(),
    }))
  },
  handler: async (ctx, { opportunities }) => {
    // Clear old active opportunities
    const existingOpportunities = await ctx.db
      .query("arbitrageOpportunities")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    
    for (const existing of existingOpportunities) {
      await ctx.db.delete(existing._id);
    }

    // Insert new opportunities
    for (const opportunity of opportunities) {
      await ctx.db.insert("arbitrageOpportunities", opportunity);
    }

    return { inserted: opportunities.length };
  },
});

export const logEtlRun = mutation({
  args: {
    runId: v.string(),
    status: v.string(),
    marketsProcessed: v.number(),
    similaritiesGenerated: v.number(),
    opportunitiesFound: v.number(),
    startTime: v.number(),
    endTime: v.number(),
    duration: v.number(),
    errors: v.optional(v.array(v.string())),
    etlVersion: v.string(),
    llmModel: v.optional(v.string()),
    kalshiMarketsCount: v.number(),
    polymarketMarketsCount: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("etlLogs", args);
  },
});

// Query functions for frontend

export const getActiveMarkets = query({
  args: {
    platform: v.optional(v.string()),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { platform, category, limit = 100 }) => {
    let query = ctx.db.query("markets").withIndex("by_active", (q) => q.eq("isActive", true));
    
    if (platform) {
      query = ctx.db.query("markets").withIndex("by_platform", (q) => q.eq("platform", platform));
    }
    
    let markets = await query.take(limit);
    
    if (category) {
      markets = markets.filter(market => market.category === category);
    }
    
    return markets;
  },
});

export const getArbitrageOpportunities = query({
  args: {
    minProfitMargin: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { minProfitMargin = 0.02, limit = 50 }) => {
    const opportunities = await ctx.db
      .query("arbitrageOpportunities")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .filter((q) => q.gte(q.field("profitMargin"), minProfitMargin))
      .order("desc")
      .take(limit);

    // Enrich with market data
    const enrichedOpportunities = await Promise.all(
      opportunities.map(async (opp) => {
        const buyMarket = await ctx.db
          .query("markets")
          .withIndex("by_platform_external", (q) =>
            q.eq("platform", opp.buyPlatform).eq("externalId", opp.buyMarketId)
          )
          .first();

        const sellMarket = await ctx.db
          .query("markets")
          .withIndex("by_platform_external", (q) =>
            q.eq("platform", opp.sellPlatform).eq("externalId", opp.sellMarketId)
          )
          .first();

        return {
          ...opp,
          buyMarket,
          sellMarket,
        };
      })
    );

    return enrichedOpportunities.filter(opp => opp.buyMarket && opp.sellMarket);
  },
});

export const getMarketSimilarities = query({
  args: {
    minConfidence: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { minConfidence = 0.7, limit = 100 }) => {
    return await ctx.db
      .query("marketSimilarities")
      .withIndex("by_confidence", (q) => q.gte("confidence", minConfidence))
      .order("desc")
      .take(limit);
  },
});

export const getEtlLogs = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 10 }) => {
    return await ctx.db
      .query("etlLogs")
      .withIndex("by_start_time")
      .order("desc")
      .take(limit);
  },
});

export const getMarketStats = query({
  handler: async (ctx) => {
    const markets = await ctx.db.query("markets").collect();
    const activeMarkets = markets.filter(m => m.isActive);
    const opportunities = await ctx.db
      .query("arbitrageOpportunities")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const platformCounts = markets.reduce((acc, market) => {
      acc[market.platform] = (acc[market.platform] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const categoryCounts = markets.reduce((acc, market) => {
      acc[market.category] = (acc[market.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalMarkets: markets.length,
      activeMarkets: activeMarkets.length,
      totalOpportunities: opportunities.length,
      platformCounts,
      categoryCounts,
      avgProfitMargin: opportunities.length > 0 
        ? opportunities.reduce((sum, opp) => sum + opp.profitMargin, 0) / opportunities.length 
        : 0,
    };
  },
});