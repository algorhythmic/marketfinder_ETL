// LLM-powered arbitrage matching using Gemini Flash for semantic market equivalence
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import fetch from 'node-fetch';

const UNIFIED_DB = './data/unified-markets-complete.db';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Set this environment variable
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

interface MarketTuple {
  id: string;
  platform: string;
  title: string;
  description?: string;
  category: string;
  yes_price: number;
  volume: number;
  liquidity: number;
  close_time?: string;
}

interface LLMMatchResult {
  kalshi_id: string;
  polymarket_id: string;
  confidence_score: number;
  reasoning: string;
  is_equivalent: boolean;
}

async function llmArbitrageMatching(): Promise<void> {
  console.log("🧠 LLM-POWERED ARBITRAGE MATCHING");
  console.log("=" .repeat(60));
  
  if (!GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY environment variable not set");
    console.log("💡 Set it with: export GEMINI_API_KEY='your-api-key'");
    return;
  }
  
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  try {
    instance = await DuckDBInstance.create(UNIFIED_DB);
    connection = await instance.connect();
    
    // Step 1: Prepare candidate market pairs
    console.log("\n📊 Step 1: Preparing Candidate Market Pairs...");
    const candidatePairs = await prepareCandidatePairs(connection);
    
    // Step 2: Create LLM matching database
    console.log("\n🗃️ Step 2: Setting Up LLM Matching Database...");
    await setupLLMMatchingDB(connection);
    
    // Step 3: Process markets in batches with LLM
    console.log("\n🧠 Step 3: Processing with Gemini Flash LLM...");
    const matches = await processMarketsWithLLM(candidatePairs);
    
    // Step 4: Store and analyze results
    console.log("\n💾 Step 4: Storing LLM Results...");
    await storeLLMResults(connection, matches);
    
    // Step 5: Generate arbitrage opportunities
    console.log("\n⚖️ Step 5: Generating Final Arbitrage Opportunities...");
    await generateLLMArbitrageOpportunities(connection);
    
  } catch (error) {
    console.error("❌ LLM matching failed:", error instanceof Error ? error.message : String(error));
  } finally {
    console.log(`\n✅ LLM arbitrage matching completed`);
  }
}

async function prepareCandidatePairs(connection: DuckDBConnection): Promise<MarketTuple[][]> {
  // Get high-value markets from both platforms - scale up for comprehensive analysis
  const kalshiMarkets = await getTopMarkets(connection, 'kalshi', 200);
  const polymarketMarkets = await getTopMarkets(connection, 'polymarket', 300);
  
  console.log(`   📊 Candidate markets: ${kalshiMarkets.length} Kalshi, ${polymarketMarkets.length} Polymarket`);
  
  // Create smart candidate pairs (same category or keyword overlap)
  const candidatePairs: MarketTuple[][] = [];
  
  for (const kalshiMarket of kalshiMarkets) {
    for (const polyMarket of polymarketMarkets) {
      // Pre-filter for reasonable candidates
      const shouldEvaluate = isReasonableCandidate(kalshiMarket, polyMarket);
      
      if (shouldEvaluate) {
        candidatePairs.push([kalshiMarket, polyMarket]);
      }
    }
  }
  
  // Sort by volume potential and limit to manageable batch size
  candidatePairs.sort((a, b) => {
    const aVolume = Math.min(a[0].volume, a[1].volume);
    const bVolume = Math.min(b[0].volume, b[1].volume);
    return bVolume - aVolume;
  });
  
  const maxPairs = 200; // Scale up for comprehensive evaluation
  const finalPairs = candidatePairs.slice(0, maxPairs);
  
  console.log(`   🎯 Selected ${finalPairs.length} candidate pairs for LLM evaluation`);
  
  return finalPairs;
}

async function getTopMarkets(connection: DuckDBConnection, platform: string, limit: number): Promise<MarketTuple[]> {
  // Get diverse markets across categories, not just highest volume
  const result = await connection.run(`
    WITH ranked_markets AS (
      SELECT 
        id, platform, title, description, category, yes_price, volume, liquidity, close_time,
        ROW_NUMBER() OVER (PARTITION BY category ORDER BY volume DESC) as category_rank
      FROM unified_markets
      WHERE platform = '${platform}' 
        AND is_active = true
        AND yes_price BETWEEN 0.05 AND 0.95
        AND volume > 50
    )
    SELECT id, platform, title, description, category, yes_price, volume, liquidity, close_time
    FROM ranked_markets
    WHERE category_rank <= ${Math.ceil(limit / 8)} -- Distribute across categories
    ORDER BY volume DESC
    LIMIT ${limit}
  `);
  
  const rows = await result.getRows();
  
  return rows.map(row => ({
    id: String(row[0]),
    platform: String(row[1]),
    title: String(row[2]),
    description: String(row[3] || ''),
    category: String(row[4]),
    yes_price: Number(row[5]),
    volume: Number(row[6]),
    liquidity: Number(row[7]),
    close_time: String(row[8] || '')
  }));
}

function isReasonableCandidate(kalshi: MarketTuple, polymarket: MarketTuple): boolean {
  // Quick filters to avoid obviously non-matching pairs
  const kalshiTitle = kalshi.title.toLowerCase();
  const polyTitle = polymarket.title.toLowerCase();
  
  // Category match bonus
  if (kalshi.category === polymarket.category) {
    return true;
  }
  
  // Keyword overlap check
  const keywords = ['trump', 'biden', 'election', 'bitcoin', 'ethereum', 'nfl', 'nba', 'super bowl', 'world cup', 'recession', 'fed'];
  
  for (const keyword of keywords) {
    if (kalshiTitle.includes(keyword) && polyTitle.includes(keyword)) {
      return true;
    }
  }
  
  // Price difference suggests potential arbitrage
  if (Math.abs(kalshi.yes_price - polymarket.yes_price) > 0.1) {
    return true;
  }
  
  return false;
}

async function setupLLMMatchingDB(connection: DuckDBConnection): Promise<void> {
  await connection.run(`
    CREATE TABLE IF NOT EXISTS llm_market_matches (
      id INTEGER PRIMARY KEY,
      kalshi_id VARCHAR,
      polymarket_id VARCHAR,
      confidence_score DOUBLE,
      reasoning TEXT,
      is_equivalent BOOLEAN,
      price_difference DOUBLE,
      kalshi_price DOUBLE,
      polymarket_price DOUBLE,
      min_volume DOUBLE,
      processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await connection.run(`
    CREATE TABLE IF NOT EXISTS llm_processing_log (
      batch_id INTEGER,
      total_pairs INTEGER,
      successful_evaluations INTEGER,
      failed_evaluations INTEGER,
      api_calls INTEGER,
      total_cost_estimate DOUBLE,
      processing_time_seconds INTEGER,
      processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function processMarketsWithLLM(candidatePairs: MarketTuple[][]): Promise<LLMMatchResult[]> {
  const results: LLMMatchResult[] = [];
  const batchSize = 5; // Process 5 pairs per API call for efficiency
  let apiCalls = 0;
  let successfulEvaluations = 0;
  let failedEvaluations = 0;
  
  console.log(`   🔄 Processing ${candidatePairs.length} pairs in batches of ${batchSize}...`);
  
  for (let i = 0; i < candidatePairs.length; i += batchSize) {
    const batch = candidatePairs.slice(i, i + batchSize);
    
    try {
      console.log(`     📦 Batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(candidatePairs.length/batchSize)}: ${batch.length} pairs`);
      
      const batchResults = await evaluateMarketBatch(batch);
      results.push(...batchResults);
      
      apiCalls++;
      successfulEvaluations += batchResults.length;
      
      // Rate limiting - Gemini Flash allows high throughput but be respectful
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.log(`     ❌ Batch failed: ${error instanceof Error ? error.message : String(error)}`);
      failedEvaluations += batch.length;
    }
  }
  
  console.log(`   📊 LLM Processing Complete:`);
  console.log(`     API calls: ${apiCalls}`);
  console.log(`     Successful evaluations: ${successfulEvaluations}`);
  console.log(`     Failed evaluations: ${failedEvaluations}`);
  console.log(`     Success rate: ${(successfulEvaluations/(successfulEvaluations+failedEvaluations)*100).toFixed(1)}%`);
  
  return results;
}

async function evaluateMarketBatch(batch: MarketTuple[][]): Promise<LLMMatchResult[]> {
  // Create prompt for batch evaluation
  const prompt = createBatchEvaluationPrompt(batch);
  
  const requestBody = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      temperature: 0.1, // Low temperature for consistent evaluation
      maxOutputTokens: 2000,
      topP: 0.8
    }
  };
  
  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!responseText) {
    throw new Error('No response text from Gemini API');
  }
  
  // Parse LLM response
  return parseLLMResponse(responseText, batch);
}

function createBatchEvaluationPrompt(batch: MarketTuple[][]): string {
  return `You are an expert at evaluating prediction market equivalence for arbitrage opportunities. 

Analyze these market pairs and determine if they represent the EXACT SAME underlying event with IDENTICAL resolution criteria. For arbitrage to work, both markets must resolve to the same outcome under the same conditions.

CRITICAL REQUIREMENTS FOR EQUIVALENCE:
- Markets must resolve based on the SAME specific event/outcome
- Resolution timeframes must align (markets closing at similar times)
- Resolution criteria must be identical or near-identical
- Both markets must answer the same fundamental question

EVALUATION CRITERIA:
- 0.9-1.0: IDENTICAL events, timeframes, and resolution criteria 
- 0.7-0.8: Very similar events with minor phrasing differences but same resolution
- 0.4-0.6: Related topics but DIFFERENT specific outcomes or timeframes
- 0.1-0.3: Same general topic but clearly different events
- 0.0: Completely unrelated events

MARKET PAIRS TO EVALUATE:

${batch.map((pair, i) => {
  const [kalshi, polymarket] = pair;
  
  const kalshiDesc = kalshi.description && kalshi.description.length > 10 
    ? kalshi.description.substring(0, 200) + "..." 
    : kalshi.title;
  
  const polyDesc = polymarket.description && polymarket.description.length > 10 
    ? polymarket.description.substring(0, 200) + "..." 
    : polymarket.title;
    
  const kalshiClose = kalshi.close_time ? new Date(kalshi.close_time).toISOString().split('T')[0] : 'unknown';
  const polyClose = polymarket.close_time ? new Date(polymarket.close_time).toISOString().split('T')[0] : 'unknown';
  
  return `PAIR ${i + 1}:

KALSHI: "${kalshi.title}" 
  Category: ${kalshi.category} | Price: ${kalshi.yes_price.toFixed(3)} | Closes: ${kalshiClose}
  Resolution Details: ${kalshiDesc}

POLYMARKET: "${polymarket.title}"
  Category: ${polymarket.category} | Price: ${polymarket.yes_price.toFixed(3)} | Closes: ${polyClose}  
  Resolution Details: ${polyDesc}`;
}).join('\n\n')}

RESPOND IN THIS EXACT FORMAT:
PAIR 1: confidence=0.XX, reasoning="detailed analysis of resolution criteria alignment"
PAIR 2: confidence=0.XX, reasoning="detailed analysis of resolution criteria alignment"
...

Focus on resolution criteria alignment, not just topic similarity. Different specific outcomes = NOT equivalent for arbitrage.`;
}

function parseLLMResponse(responseText: string, batch: MarketTuple[][]): LLMMatchResult[] {
  const results: LLMMatchResult[] = [];
  const lines = responseText.split('\n').filter(line => line.trim().startsWith('PAIR'));
  
  for (let i = 0; i < lines.length && i < batch.length; i++) {
    const line = lines[i];
    const [kalshi, polymarket] = batch[i];
    
    try {
      // Parse confidence score
      const confidenceMatch = line.match(/confidence=([0-9.]+)/);
      const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.0;
      
      // Parse reasoning
      const reasoningMatch = line.match(/reasoning="([^"]+)"/);
      const reasoning = reasoningMatch ? reasoningMatch[1] : 'No reasoning provided';
      
      results.push({
        kalshi_id: kalshi.id,
        polymarket_id: polymarket.id,
        confidence_score: confidence,
        reasoning: reasoning,
        is_equivalent: confidence >= 0.7 // Threshold for considering markets equivalent
      });
      
    } catch (error) {
      console.log(`     ⚠️ Failed to parse line ${i + 1}: ${line}`);
      // Add default result for failed parsing
      results.push({
        kalshi_id: batch[i][0].id,
        polymarket_id: batch[i][1].id,
        confidence_score: 0.0,
        reasoning: 'Parsing failed',
        is_equivalent: false
      });
    }
  }
  
  return results;
}

async function storeLLMResults(connection: DuckDBConnection, matches: LLMMatchResult[]): Promise<void> {
  console.log(`   💾 Storing ${matches.length} LLM evaluations...`);
  
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    
    // Get market details for additional context
    const marketDetails = await connection.run(`
      SELECT k.yes_price as kalshi_price, p.yes_price as polymarket_price,
             LEAST(k.volume, p.volume) as min_volume
      FROM unified_markets k, unified_markets p
      WHERE k.id = '${match.kalshi_id}' AND p.id = '${match.polymarket_id}'
    `);
    
    const details = await marketDetails.getRows();
    const [kalshi_price, polymarket_price, min_volume] = details[0] || [0, 0, 0];
    const price_difference = Math.abs(Number(kalshi_price) - Number(polymarket_price));
    
    await connection.run(`
      INSERT INTO llm_market_matches (
        id, kalshi_id, polymarket_id, confidence_score, reasoning, is_equivalent,
        price_difference, kalshi_price, polymarket_price, min_volume
      ) VALUES (
        ${i + 1}, '${match.kalshi_id}', '${match.polymarket_id}', ${match.confidence_score},
        '${match.reasoning.replace(/'/g, "''")}', ${match.is_equivalent},
        ${price_difference}, ${Number(kalshi_price)}, ${Number(polymarket_price)}, ${Number(min_volume)}
      )
    `);
  }
  
  const equivalentCount = matches.filter(m => m.is_equivalent).length;
  console.log(`   ✅ Found ${equivalentCount} equivalent market pairs (confidence ≥ 0.7)`);
}

async function generateLLMArbitrageOpportunities(connection: DuckDBConnection): Promise<void> {
  // Create final arbitrage opportunities view using LLM results
  await connection.run(`
    DROP VIEW IF EXISTS llm_arbitrage_opportunities
  `);
  
  await connection.run(`
    CREATE VIEW llm_arbitrage_opportunities AS
    SELECT 
      lmm.kalshi_id,
      lmm.polymarket_id,
      k.title as kalshi_title,
      p.title as polymarket_title,
      k.category as kalshi_category,
      p.category as polymarket_category,
      lmm.confidence_score,
      lmm.reasoning,
      lmm.kalshi_price,
      lmm.polymarket_price,
      lmm.price_difference,
      -- Conservative profit calculation (assume 2% total fees)
      GREATEST(lmm.price_difference - 0.02, 0) as potential_profit,
      lmm.min_volume,
      k.liquidity as kalshi_liquidity,
      p.liquidity as polymarket_liquidity,
      -- Risk-adjusted profit considering volume
      GREATEST(lmm.price_difference - 0.02, 0) * LOG(lmm.min_volume + 1) / 10 as risk_adjusted_score
    FROM llm_market_matches lmm
    JOIN unified_markets k ON lmm.kalshi_id = k.id
    JOIN unified_markets p ON lmm.polymarket_id = p.id
    WHERE lmm.is_equivalent = true
      AND lmm.price_difference > 0.03
      AND lmm.min_volume > 100
    ORDER BY potential_profit DESC, confidence_score DESC
  `);
  
  // Show results
  const resultsCount = await connection.run(`
    SELECT COUNT(*) as count FROM llm_arbitrage_opportunities
  `);
  const count = await resultsCount.getRows();
  const opportunityCount = Number(count[0][0]);
  
  console.log(`   🎯 Generated ${opportunityCount} LLM-verified arbitrage opportunities`);
  
  if (opportunityCount > 0) {
    // Show top opportunities
    const topOpportunities = await connection.run(`
      SELECT 
        kalshi_title,
        polymarket_title,
        confidence_score,
        kalshi_price,
        polymarket_price,
        price_difference,
        potential_profit,
        min_volume,
        reasoning
      FROM llm_arbitrage_opportunities
      ORDER BY potential_profit DESC
      LIMIT 5
    `);
    const opportunities = await topOpportunities.getRows();
    
    console.log(`\n   🔥 Top LLM-Verified Arbitrage Opportunities:`);
    opportunities.forEach((row, i) => {
      const [k_title, p_title, confidence, k_price, p_price, diff, profit, volume, reasoning] = row;
      
      console.log(`\n   ${i+1}. 💰 Profit: ${(Number(profit)*100).toFixed(1)}% | Confidence: ${(Number(confidence)*100).toFixed(1)}% | Volume: $${Number(volume).toLocaleString()}`);
      console.log(`      📊 Prices: Kalshi ${Number(k_price).toFixed(3)} vs Polymarket ${Number(p_price).toFixed(3)} (${(Number(diff)*100).toFixed(1)}% diff)`);
      console.log(`      📝 Kalshi: "${String(k_title).substring(0, 60)}..."`);
      console.log(`      📝 Polymarket: "${String(p_title).substring(0, 60)}..."`);
      console.log(`      🧠 LLM Reasoning: "${String(reasoning)}"`);
    });
    
    // Summary statistics
    const statsResult = await connection.run(`
      SELECT 
        COUNT(*) as total_opportunities,
        AVG(potential_profit) as avg_profit,
        MAX(potential_profit) as max_profit,
        AVG(confidence_score) as avg_confidence,
        SUM(min_volume) as total_volume
      FROM llm_arbitrage_opportunities
    `);
    const stats = await statsResult.getRows();
    const [total, avg_profit, max_profit, avg_confidence, total_volume] = stats[0];
    
    console.log(`\n   📈 LLM Arbitrage Summary:`);
    console.log(`     Total opportunities: ${Number(total).toLocaleString()}`);
    console.log(`     Average profit: ${(Number(avg_profit)*100).toFixed(2)}%`);
    console.log(`     Maximum profit: ${(Number(max_profit)*100).toFixed(2)}%`);
    console.log(`     Average LLM confidence: ${(Number(avg_confidence)*100).toFixed(1)}%`);
    console.log(`     Total addressable volume: $${Number(total_volume).toLocaleString()}`);
  }
}

llmArbitrageMatching();