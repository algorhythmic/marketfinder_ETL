import { internalAction, internalMutation, query, internalQuery, action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Analyze market similarity using AI
export const analyzeMarketSimilarity = internalAction({
  args: {
    market1: v.object({
      id: v.id("markets"),
      title: v.string(),
      description: v.optional(v.string()),
      category: v.optional(v.string()),
    }),
    market2: v.object({
      id: v.id("markets"),
      title: v.string(),
      description: v.optional(v.string()),
      category: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const prompt = `
Analyze these two prediction markets to determine if they are asking about the same event or outcome:

Market 1:
Title: ${args.market1.title}
Description: ${args.market1.description || "No description"}
Category: ${args.market1.category || "Unknown"}

Market 2:
Title: ${args.market2.title}
Description: ${args.market2.description || "No description"}
Category: ${args.market2.category || "Unknown"}

Consider:
1. Are they asking about the same underlying event?
2. Do they have compatible timeframes?
3. Are the outcomes equivalent (even if worded differently)?
4. Account for different platforms using different terminology

Respond with a JSON object:
{
  "similar": boolean,
  "confidence": number (0-1),
  "reasoning": "explanation of why they are/aren't similar",
  "outcomeMapping": [{"market1Outcome": "Yes", "market2Outcome": "Will happen"}] or null
}
`;

    try {
      const response = await fetch(`${process.env.CONVEX_OPENAI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.CONVEX_OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1-nano",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`AI API request failed with status ${response.status}: ${errorText}`);
        return {
          similar: false,
          confidence: 0,
          reasoning: `AI API Error: ${response.status} - ${errorText.substring(0, 100)}`,
          outcomeMapping: null,
        };
      }

      const data = await response.json();
      // It's possible data.choices[0].message.content is not what we expect if the call was not fully successful
      // or if the model's response format changed.
      if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
        console.error("AI response format unexpected:", JSON.stringify(data));
        return {
          similar: false,
          confidence: 0,
          reasoning: "AI response format unexpected. Check logs.",
          outcomeMapping: null,
        };
      }
      const content = data.choices[0].message.content;
      
      try {
        return JSON.parse(content);
      } catch {
        // Fallback if JSON parsing fails
        return {
          similar: false,
          confidence: 0,
          reasoning: "Failed to parse AI response",
          outcomeMapping: null,
        };
      }
    } catch (error) {
      console.error("AI analysis failed:", error);
      return {
        similar: false,
        confidence: 0,
        reasoning: "AI service unavailable",
        outcomeMapping: null,
      };
    }
  },
});

// Public action to analyze a user-selected list of markets
export const analyzeSelectedMarkets = action({
  args: {
    marketIds: v.array(v.id("markets")),
  },
  handler: async (ctx, args) => {
    const { marketIds } = args;
    if (marketIds.length < 2) {
      console.log("Need at least two markets to compare.");
      return { message: "Please select at least two markets for semantic analysis.", groupsCreated: 0, comparisonsMade: 0 };
    }

    console.log(`Analyzing ${marketIds.length} selected markets for semantic similarity.`);

    // Fetch market details for all selected IDs
    const marketsToAnalyze = [];
    for (const marketId of marketIds) {
      const market = await ctx.runQuery(internal.markets.getMarketByIdInternal, { marketId }); // Assuming an internal query to get market by ID
      if (market) {
        marketsToAnalyze.push({
          id: market._id,
          title: market.title,
          description: market.description,
          category: market.category,
        });
      }
    }

    if (marketsToAnalyze.length < 2) {
      console.log("Not enough valid markets found to compare after fetching details.");
      return { message: "Could not retrieve enough market details for comparison. Please try again.", groupsCreated: 0, comparisonsMade: 0 };
    }

    let comparisonsMade = 0;
    let groupsCreated = 0;

    // Compare each market with every other market in the selection
    for (let i = 0; i < marketsToAnalyze.length; i++) {
      for (let j = i + 1; j < marketsToAnalyze.length; j++) {
        console.log(`Comparing market ${marketsToAnalyze[i].id} with ${marketsToAnalyze[j].id}`);
        comparisonsMade++;
        const similarity = await ctx.runAction(internal.semanticAnalysis.analyzeMarketSimilarity, {
          market1: marketsToAnalyze[i],
          market2: marketsToAnalyze[j],
        });

        if (similarity.similar && similarity.confidence > 0.7) { // Using the same threshold as processMarketCategory
          console.log(`Markets ${marketsToAnalyze[i].id} and ${marketsToAnalyze[j].id} are similar. Confidence: ${similarity.confidence}`);
          await ctx.runMutation(internal.semanticAnalysis.createOrUpdateMarketGroup, {
            market1Id: marketsToAnalyze[i].id,
            market2Id: marketsToAnalyze[j].id,
            confidence: similarity.confidence,
            reasoning: similarity.reasoning,
            category: marketsToAnalyze[i].category || marketsToAnalyze[j].category || "Unknown", // Use category from one of the markets
          });
          groupsCreated++; 
        }
      }
    }
    console.log(`Semantic analysis complete. Comparisons: ${comparisonsMade}, Groups updated/created: ${groupsCreated}`);
    return { message: `Semantic analysis complete. ${comparisonsMade} comparisons made, ${groupsCreated} groups updated or created.`, groupsCreated, comparisonsMade };
  },
});

// Generate semantic groups for new markets
export const generateSemanticGroups = internalAction({
  args: {},
  handler: async (ctx) => {
    console.log("generateSemanticGroups is temporarily disabled. Skipping execution.");
    return; // Temporarily disable this action

    // Get unprocessed markets (not in any group)
    const allMarkets = await ctx.runQuery(internal.semanticAnalysis.getUnprocessedMarkets);
    
    if (allMarkets.length === 0) return;

    console.log(`Processing ${allMarkets.length} unprocessed markets`);

    // Group markets by category first for efficiency
    const marketsByCategory = allMarkets.reduce((acc: Record<string, typeof allMarkets>, market) => {
      const category = market.category || "Other";
      if (!acc[category]) acc[category] = [];
      acc[category].push(market);
      return acc;
    }, {} as Record<string, typeof allMarkets>);

    for (const [category, markets] of Object.entries(marketsByCategory)) {
      await ctx.runAction(internal.semanticAnalysis.processMarketCategory, {
        category,
        markets: markets.map(m => ({ _id: m._id, title: m.title, description: m.description, category: m.category })),
      });
    }
  },
});

export const getUnprocessedMarkets = internalQuery({
  args: {},
  handler: async (ctx) => {
    const allMarkets = await ctx.db
      .query("markets")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    const processedMarketIds = new Set(
      (await ctx.db.query("marketGroupMemberships").collect())
        .map(m => m.marketId)
    );

    return allMarkets.filter(m => !processedMarketIds.has(m._id));
  },
});

export const processMarketCategory = internalAction({
  args: {
    category: v.string(),
    markets: v.array(v.object({
      _id: v.id("markets"),
      title: v.string(),
      description: v.optional(v.string()),
      category: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const { markets } = args;
    
    // Compare each market with every other market in the category
    for (let i = 0; i < markets.length; i++) {
      for (let j = i + 1; j < markets.length; j++) {
        const similarity = await ctx.runAction(internal.semanticAnalysis.analyzeMarketSimilarity, {
          market1: { id: markets[i]._id, title: markets[i].title, description: markets[i].description, category: markets[i].category },
          market2: { id: markets[j]._id, title: markets[j].title, description: markets[j].description, category: markets[j].category },
        });

        if (similarity.similar && similarity.confidence > 0.7) {
          await ctx.runMutation(internal.semanticAnalysis.createOrUpdateMarketGroup, {
            market1Id: markets[i]._id,
            market2Id: markets[j]._id,
            confidence: similarity.confidence,
            reasoning: similarity.reasoning,
            category: args.category,
          });
        }
      }
    }
  },
});

export const createOrUpdateMarketGroup = internalMutation({
  args: {
    market1Id: v.id("markets"),
    market2Id: v.id("markets"),
    confidence: v.number(),
    reasoning: v.string(),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if either market is already in a group
    const existing1 = await ctx.db
      .query("marketGroupMemberships")
      .withIndex("by_market", (q) => q.eq("marketId", args.market1Id))
      .first();

    const existing2 = await ctx.db
      .query("marketGroupMemberships")
      .withIndex("by_market", (q) => q.eq("marketId", args.market2Id))
      .first();

    let groupId: any;

    if (existing1 && existing2) {
      // Both markets are already in groups - merge if different groups
      if (existing1.groupId !== existing2.groupId) {
        // Merge groups (keep the one with higher confidence)
        const group1 = await ctx.db.get(existing1.groupId);
        const group2 = await ctx.db.get(existing2.groupId);
        
        if (group1 && group2) {
          const keepGroup = group1.confidence >= group2.confidence ? group1 : group2;
          const mergeGroup = group1.confidence >= group2.confidence ? group2 : group1;
          
          // Move all markets from merge group to keep group
          const memberships = await ctx.db
            .query("marketGroupMemberships")
            .withIndex("by_group", (q) => q.eq("groupId", mergeGroup._id))
            .collect();
          
          for (const membership of memberships) {
            await ctx.db.patch(membership._id, { groupId: keepGroup._id });
          }
          
          // Delete the merged group
          await ctx.db.delete(mergeGroup._id);
          groupId = keepGroup._id;
        } else {
          return;
        }
      } else {
        groupId = existing1.groupId;
      }
    } else if (existing1) {
      // Market 1 is in a group, add market 2
      groupId = existing1.groupId;
      await ctx.db.insert("marketGroupMemberships", {
        marketId: args.market2Id,
        groupId,
        confidence: args.confidence,
        addedBy: "ai",
        addedAt: Date.now(),
      });
    } else if (existing2) {
      // Market 2 is in a group, add market 1
      groupId = existing2.groupId;
      await ctx.db.insert("marketGroupMemberships", {
        marketId: args.market1Id,
        groupId,
        confidence: args.confidence,
        addedBy: "ai",
        addedAt: Date.now(),
      });
    } else {
      // Neither market is in a group, create new group
      const market1 = await ctx.db.get(args.market1Id);
      const market2 = await ctx.db.get(args.market2Id);
      
      if (!market1 || !market2) return;

      groupId = await ctx.db.insert("marketGroups", {
        name: `${market1.title} (Group)`,
        description: args.reasoning,
        category: args.category,
        confidence: args.confidence,
        isVerified: false,
        createdBy: "ai",
        lastAnalyzed: Date.now(),
        tags: [],
      });

      // Add both markets to the group
      await ctx.db.insert("marketGroupMemberships", {
        marketId: args.market1Id,
        groupId,
        confidence: args.confidence,
        addedBy: "ai",
        addedAt: Date.now(),
      });

      await ctx.db.insert("marketGroupMemberships", {
        marketId: args.market2Id,
        groupId,
        confidence: args.confidence,
        addedBy: "ai",
        addedAt: Date.now(),
      });
    }
  },
});

// Get market groups with their markets
export const getMarketGroups = query({
  args: {},
  handler: async (ctx) => {
    const groups = await ctx.db
      .query("marketGroups")
      .order("desc")
      .take(50);

    return await Promise.all(
      groups.map(async (group) => {
        const memberships = await ctx.db
          .query("marketGroupMemberships")
          .withIndex("by_group", (q) => q.eq("groupId", group._id))
          .collect();

        const markets = await Promise.all(
          memberships.map(async (membership) => {
            const market = await ctx.db.get(membership.marketId);
            if (!market) return null;
            
            const platform = await ctx.db.get(market.platformId);
            return { ...market, platform };
          })
        );

        return {
          ...group,
          markets: markets.filter(Boolean),
        };
      })
    );
  },
});
