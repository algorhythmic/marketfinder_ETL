import { query, internalMutation, internalAction, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Detect arbitrage opportunities across market groups
export const detectArbitrageOpportunities = internalAction({
  args: {},
  handler: async (ctx) => {
    const groups = await ctx.runQuery(internal.arbitrage.getActiveMarketGroups);
    
    for (const group of groups) {
      await ctx.runAction(internal.arbitrage.analyzeGroupForArbitrage, {
        groupId: group._id,
      });
    }
  },
});

export const getActiveMarketGroups = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("marketGroups")
      .filter((q) => q.gte(q.field("confidence"), 0.7))
      .collect();
  },
});

export const analyzeGroupForArbitrage = internalAction({
  args: { groupId: v.id("marketGroups") },
  handler: async (ctx, args) => {
    const memberships = await ctx.runQuery(internal.arbitrage.getGroupMarkets, {
      groupId: args.groupId,
    });

    if (memberships.length < 2) return;

    // Compare all pairs of markets in the group
    for (let i = 0; i < memberships.length; i++) {
      for (let j = i + 1; j < memberships.length; j++) {
        const fullMarket1 = memberships[i];
        const fullMarket2 = memberships[j];

        // Skip if same platform (no arbitrage possible) or null markets
        if (!fullMarket1 || !fullMarket2 || fullMarket1.platformId === fullMarket2.platformId) continue;

        // Prepare market objects for the mutation, selecting only required fields
        const preparedMarket1 = {
          _id: fullMarket1._id,
          platformId: fullMarket1.platformId,
          outcomes: fullMarket1.outcomes.map(o => ({
            id: o.id,
            name: o.name,
            price: o.price,
            volume: o.volume, // volume is optional in validator
          })),
        };

        const preparedMarket2 = {
          _id: fullMarket2._id,
          platformId: fullMarket2.platformId,
          outcomes: fullMarket2.outcomes.map(o => ({
            id: o.id,
            name: o.name,
            price: o.price,
            volume: o.volume, // volume is optional in validator
          })),
        };

        await ctx.runMutation(internal.arbitrage.findArbitrageInMarketPair, {
          groupId: args.groupId,
          market1: preparedMarket1,
          market2: preparedMarket2,
        });
      }
    }
  },
});

export const getGroupMarkets = internalQuery({
  args: { groupId: v.id("marketGroups") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("marketGroupMemberships")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .collect();

    const markets = await Promise.all(
      memberships.map(async (membership) => {
        const market = await ctx.db.get(membership.marketId);
        return market && market.status === "active" ? market : null;
      })
    );

    return markets.filter((m): m is NonNullable<typeof m> => m !== null);
  },
});

export const findArbitrageInMarketPair = internalMutation({
  args: {
    groupId: v.id("marketGroups"),
    market1: v.object({
      _id: v.id("markets"),
      platformId: v.id("platforms"),
      outcomes: v.array(v.object({
        id: v.string(),
        name: v.string(),
        price: v.number(),
        volume: v.optional(v.number()),
      })),
    }),
    market2: v.object({
      _id: v.id("markets"),
      platformId: v.id("platforms"),
      outcomes: v.array(v.object({
        id: v.string(),
        name: v.string(),
        price: v.number(),
        volume: v.optional(v.number()),
      })),
    }),
  },
  handler: async (ctx, args) => {
    const { market1, market2, groupId } = args;

    // Find the best arbitrage opportunity between outcomes
    let bestOpportunity = null;
    let maxProfit = 0;

    for (const outcome1 of market1.outcomes) {
      for (const outcome2 of market2.outcomes) {
        // Check if outcomes are semantically equivalent (simplified)
        const outcomesMatch = outcome1.name.toLowerCase().includes("yes") && 
                             outcome2.name.toLowerCase().includes("yes") ||
                             outcome1.name.toLowerCase().includes("no") && 
                             outcome2.name.toLowerCase().includes("no");

        if (!outcomesMatch) continue;

        // Calculate potential profit
        // Buy low, sell high
        const buyPrice = Math.min(outcome1.price, outcome2.price);
        const sellPrice = Math.max(outcome1.price, outcome2.price);
        const profitMargin = ((sellPrice - buyPrice) / buyPrice) * 100;

        // Minimum 2% profit margin to be considered
        if (profitMargin > 2 && profitMargin > maxProfit) {
          maxProfit = profitMargin;
          bestOpportunity = {
            buyMarket: outcome1.price < outcome2.price ? market1 : market2,
            sellMarket: outcome1.price < outcome2.price ? market2 : market1,
            buyOutcome: outcome1.price < outcome2.price ? outcome1 : outcome2,
            sellOutcome: outcome1.price < outcome2.price ? outcome2 : outcome1,
            buyPrice,
            sellPrice,
            profitMargin,
          };
        }
      }
    }

    if (bestOpportunity) {
      // Check if this opportunity already exists
      const existing = await ctx.db
        .query("arbitrageOpportunities")
        .withIndex("by_group", (q) => q.eq("groupId", groupId))
        .filter((q) => 
          q.and(
            q.eq(q.field("buyMarketId"), bestOpportunity.buyMarket._id),
            q.eq(q.field("sellMarketId"), bestOpportunity.sellMarket._id),
            q.eq(q.field("status"), "active")
          )
        )
        .first();

      if (existing) {
        // Update existing opportunity
        await ctx.db.patch(existing._id, {
          buyPrice: bestOpportunity.buyPrice,
          sellPrice: bestOpportunity.sellPrice,
          profitMargin: bestOpportunity.profitMargin,
          detectedAt: Date.now(),
          expiresAt: Date.now() + (30 * 60 * 1000), // 30 minutes
        });
      } else {
        // Create new opportunity
        await ctx.db.insert("arbitrageOpportunities", {
          groupId,
          buyMarketId: bestOpportunity.buyMarket._id,
          sellMarketId: bestOpportunity.sellMarket._id,
          buyOutcome: bestOpportunity.buyOutcome.id,
          sellOutcome: bestOpportunity.sellOutcome.id,
          buyPrice: bestOpportunity.buyPrice,
          sellPrice: bestOpportunity.sellPrice,
          profitMargin: bestOpportunity.profitMargin,
          confidence: 0.8, // Base confidence
          volume: Math.min(
            bestOpportunity.buyOutcome.volume || 0,
            bestOpportunity.sellOutcome.volume || 0
          ),
          detectedAt: Date.now(),
          expiresAt: Date.now() + (30 * 60 * 1000), // 30 minutes
          status: "active",
        });
      }
    }
  },
});

// Get active arbitrage opportunities
export const getArbitrageOpportunities = query({
  args: {
    minProfitMargin: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("arbitrageOpportunities")
      .withIndex("by_status", (q) => q.eq("status", "active"));

    if (args.minProfitMargin !== undefined) {
      query = query.filter((q) => q.gte(q.field("profitMargin"), args.minProfitMargin!));
    }

    const opportunities = await query
      .order("desc")
      .take(args.limit || 50);

    // Enrich with market and platform data
    return await Promise.all(
      opportunities.map(async (opp) => {
        const [buyMarket, sellMarket, group] = await Promise.all([
          ctx.db.get(opp.buyMarketId),
          ctx.db.get(opp.sellMarketId),
          ctx.db.get(opp.groupId),
        ]);

        if (!buyMarket || !sellMarket || !group) return null;

        const [buyPlatform, sellPlatform] = await Promise.all([
          ctx.db.get(buyMarket.platformId),
          ctx.db.get(sellMarket.platformId),
        ]);

        return {
          ...opp,
          buyMarket: { ...buyMarket, platform: buyPlatform },
          sellMarket: { ...sellMarket, platform: sellPlatform },
          group,
        };
      })
    ).then(results => results.filter(Boolean));
  },
});

// Get arbitrage statistics
export const getArbitrageStats = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const dayAgo = now - (24 * 60 * 60 * 1000);
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000);

    const [active, today, thisWeek] = await Promise.all([
      ctx.db
        .query("arbitrageOpportunities")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect(),
      ctx.db
        .query("arbitrageOpportunities")
        .withIndex("by_detected_at")
        .filter((q) => q.gte(q.field("detectedAt"), dayAgo))
        .collect(),
      ctx.db
        .query("arbitrageOpportunities")
        .withIndex("by_detected_at")
        .filter((q) => q.gte(q.field("detectedAt"), weekAgo))
        .collect(),
    ]);

    return {
      activeCount: active.length,
      averageProfit: active.length > 0 
        ? active.reduce((sum, opp) => sum + opp.profitMargin, 0) / active.length 
        : 0,
      maxProfit: active.length > 0 
        ? Math.max(...active.map(opp => opp.profitMargin)) 
        : 0,
      todayCount: today.length,
      weekCount: thisWeek.length,
      topOpportunities: active
        .sort((a, b) => b.profitMargin - a.profitMargin)
        .slice(0, 5),
    };
  },
});
