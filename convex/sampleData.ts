import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Add sample market data for demonstration
export const addSampleData = mutation({
  args: {},
  handler: async (ctx) => {
    // Get platforms
    const platforms = await ctx.db.query("platforms").collect();
    if (platforms.length === 0) return;

    const polymarket = platforms.find(p => p.name === "polymarket");
    const kalshi = platforms.find(p => p.name === "kalshi");
    
    if (!polymarket || !kalshi) return;

    // Sample markets for demonstration
    const sampleMarkets = [
      {
        platformId: polymarket._id,
        externalId: "poly_election_2024",
        title: "Will Donald Trump win the 2024 US Presidential Election?",
        description: "This market resolves to Yes if Donald Trump wins the 2024 US Presidential Election.",
        category: "Politics",
        outcomes: [
          { id: "yes", name: "Yes", price: 0.52, volume: 1500000 },
          { id: "no", name: "No", price: 0.48, volume: 1200000 }
        ],
        endDate: new Date("2024-11-05").getTime(),
        totalVolume: 2700000,
        liquidity: 500000,
        status: "active" as const,
        url: "https://polymarket.com/event/trump-2024",
        metadata: {
          tags: ["election", "trump", "politics"],
          minBet: 1,
          maxBet: 10000,
          createdAt: Date.now() - (30 * 24 * 60 * 60 * 1000),
        },
      },
      {
        platformId: kalshi._id,
        externalId: "kalshi_election_2024",
        title: "Donald Trump to win 2024 Presidential Election",
        description: "Will Donald Trump be elected President in 2024?",
        category: "Politics",
        outcomes: [
          { id: "yes", name: "Yes", price: 0.49, volume: 800000 },
          { id: "no", name: "No", price: 0.51, volume: 900000 }
        ],
        endDate: new Date("2024-11-05").getTime(),
        totalVolume: 1700000,
        liquidity: 300000,
        status: "active" as const,
        url: "https://kalshi.com/events/trump-2024",
        metadata: {
          tags: ["election", "trump", "politics"],
          minBet: 1,
          maxBet: 25000,
          createdAt: Date.now() - (25 * 24 * 60 * 60 * 1000),
        },
      },
      {
        platformId: polymarket._id,
        externalId: "poly_btc_100k",
        title: "Will Bitcoin reach $100,000 by end of 2024?",
        description: "This market resolves to Yes if Bitcoin (BTC) reaches $100,000 USD by December 31, 2024.",
        category: "Crypto",
        outcomes: [
          { id: "yes", name: "Yes", price: 0.35, volume: 500000 },
          { id: "no", name: "No", price: 0.65, volume: 800000 }
        ],
        endDate: new Date("2024-12-31").getTime(),
        totalVolume: 1300000,
        liquidity: 200000,
        status: "active" as const,
        url: "https://polymarket.com/event/btc-100k",
        metadata: {
          tags: ["bitcoin", "crypto", "price"],
          minBet: 1,
          maxBet: 5000,
          createdAt: Date.now() - (20 * 24 * 60 * 60 * 1000),
        },
      },
      {
        platformId: kalshi._id,
        externalId: "kalshi_btc_100k",
        title: "Bitcoin to hit $100K in 2024",
        description: "Will Bitcoin reach $100,000 before January 1, 2025?",
        category: "Crypto",
        outcomes: [
          { id: "yes", name: "Yes", price: 0.38, volume: 300000 },
          { id: "no", name: "No", price: 0.62, volume: 450000 }
        ],
        endDate: new Date("2024-12-31").getTime(),
        totalVolume: 750000,
        liquidity: 150000,
        status: "active" as const,
        url: "https://kalshi.com/events/btc-100k",
        metadata: {
          tags: ["bitcoin", "crypto", "price"],
          minBet: 1,
          maxBet: 15000,
          createdAt: Date.now() - (18 * 24 * 60 * 60 * 1000),
        },
      },
    ];

    // Insert sample markets
    for (const market of sampleMarkets) {
      const existing = await ctx.db
        .query("markets")
        .withIndex("by_platform", (q) => q.eq("platformId", market.platformId))
        .filter((q) => q.eq(q.field("externalId"), market.externalId))
        .first();

      if (!existing) {
        const marketId = await ctx.db.insert("markets", {
          ...market,
          lastUpdated: Date.now(),
        });

        // Add price history
        for (const outcome of market.outcomes) {
          await ctx.db.insert("priceHistory", {
            marketId,
            outcome: outcome.id,
            price: outcome.price,
            volume: outcome.volume,
            timestamp: Date.now(),
          });
        }
      }
    }
  },
});
