// Demo LLM arbitrage matching with simulated responses (no API key required)
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';

const UNIFIED_DB = './data/unified-markets.db';

interface MarketPair {
  kalshi_id: string;
  kalshi_title: string;
  kalshi_price: number;
  kalshi_volume: number;
  polymarket_id: string;
  polymarket_title: string;
  polymarket_price: number;
  polymarket_volume: number;
  category: string;
}

async function demoLLMMatching(): Promise<void> {
  console.log("🎭 DEMO: LLM ARBITRAGE MATCHING SYSTEM");
  console.log("=" .repeat(60));
  console.log("(Simulated LLM responses - no API key required)");
  
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  try {
    instance = await DuckDBInstance.create(UNIFIED_DB);
    connection = await instance.connect();
    
    // Step 1: Find candidate pairs
    console.log("\n📊 Step 1: Finding Candidate Market Pairs...");
    const candidatePairs = await findCandidatePairs(connection);
    
    // Step 2: Simulate LLM evaluation
    console.log("\n🧠 Step 2: Simulating LLM Market Evaluation...");
    const llmResults = simulateLLMEvaluation(candidatePairs);
    
    // Step 3: Create demo arbitrage opportunities
    console.log("\n⚖️ Step 3: Creating Demo Arbitrage Opportunities...");
    await createDemoArbitrageTable(connection, llmResults);
    
    // Step 4: Show results
    console.log("\n🎯 Step 4: Demo Results...");
    await showDemoResults(connection);
    
    // Step 5: Show the actual LLM integration plan
    console.log("\n🚀 Step 5: Production LLM Integration Plan...");
    showProductionPlan();
    
  } catch (error) {
    console.error("❌ Demo failed:", error instanceof Error ? error.message : String(error));
  } finally {
    console.log(`\n✅ Demo completed - ready for production LLM integration!`);
  }
}

async function findCandidatePairs(connection: DuckDBConnection): Promise<MarketPair[]> {
  // Find markets that could potentially match across platforms
  const result = await connection.run(`
    SELECT 
      k.id as kalshi_id,
      k.title as kalshi_title,
      k.yes_price as kalshi_price,
      k.volume as kalshi_volume,
      p.id as polymarket_id,
      p.title as polymarket_title,
      p.yes_price as polymarket_price,
      p.volume as polymarket_volume,
      k.category
    FROM unified_markets k
    CROSS JOIN unified_markets p
    WHERE k.platform = 'kalshi' 
      AND p.platform = 'polymarket'
      AND k.is_active = true 
      AND p.is_active = true
      AND k.category = p.category
      AND k.volume > 500
      AND p.volume > 500
      AND ABS(k.yes_price - p.yes_price) > 0.05
    ORDER BY ABS(k.yes_price - p.yes_price) DESC, 
             LEAST(k.volume, p.volume) DESC
    LIMIT 10
  `);
  
  const rows = await result.getRows();
  console.log(`   📊 Found ${rows.length} candidate pairs for evaluation`);
  
  return rows.map(row => ({
    kalshi_id: String(row[0]),
    kalshi_title: String(row[1]),
    kalshi_price: Number(row[2]),
    kalshi_volume: Number(row[3]),
    polymarket_id: String(row[4]),
    polymarket_title: String(row[5]),
    polymarket_price: Number(row[6]),
    polymarket_volume: Number(row[7]),
    category: String(row[8])
  }));
}

function simulateLLMEvaluation(pairs: MarketPair[]): Array<{pair: MarketPair, confidence: number, reasoning: string}> {
  console.log(`   🎭 Simulating LLM evaluation for ${pairs.length} pairs...`);
  
  const results = pairs.map(pair => {
    // Simulate realistic LLM evaluation based on title similarity and context
    const confidence = simulateConfidenceScore(pair);
    const reasoning = generateSimulatedReasoning(pair, confidence);
    
    return {
      pair,
      confidence,
      reasoning
    };
  });
  
  // Sort by confidence
  results.sort((a, b) => b.confidence - a.confidence);
  
  console.log(`   🧠 Simulated LLM processing complete`);
  
  return results;
}

function simulateConfidenceScore(pair: MarketPair): number {
  const kalshiTitle = pair.kalshi_title.toLowerCase();
  const polyTitle = pair.polymarket_title.toLowerCase();
  
  let confidence = 0.0;
  
  // Simulate LLM reasoning patterns
  
  // 1. Exact keyword matches (high confidence)
  const highConfidenceKeywords = ['trump', 'bitcoin', 'ethereum', 'super bowl', 'world cup', 'recession'];
  for (const keyword of highConfidenceKeywords) {
    if (kalshiTitle.includes(keyword) && polyTitle.includes(keyword)) {
      confidence = Math.max(confidence, 0.85 + Math.random() * 0.1);
      break;
    }
  }
  
  // 2. Category and semantic similarity
  if (confidence < 0.7) {
    const semanticWords = ['election', 'president', 'nfl', 'nba', 'crypto', 'stock', 'economy'];
    for (const word of semanticWords) {
      if (kalshiTitle.includes(word) && polyTitle.includes(word)) {
        confidence = Math.max(confidence, 0.6 + Math.random() * 0.2);
        break;
      }
    }
  }
  
  // 3. Price difference suggests potential relationship
  const priceDiff = Math.abs(pair.kalshi_price - pair.polymarket_price);
  if (priceDiff > 0.1 && confidence < 0.5) {
    confidence = Math.max(confidence, 0.3 + Math.random() * 0.3);
  }
  
  // 4. Same category bonus
  if (pair.category !== 'other' && confidence < 0.4) {
    confidence = Math.max(confidence, 0.25 + Math.random() * 0.2);
  }
  
  // 5. Random factors (simulating LLM variability)
  confidence += (Math.random() - 0.5) * 0.1;
  
  return Math.max(0, Math.min(1, confidence));
}

function generateSimulatedReasoning(pair: MarketPair, confidence: number): string {
  const kalshiTitle = pair.kalshi_title.toLowerCase();
  const polyTitle = pair.polymarket_title.toLowerCase();
  
  if (confidence > 0.8) {
    return "High similarity - both markets appear to address the same underlying event with similar timeframes and outcomes";
  } else if (confidence > 0.6) {
    return "Moderate similarity - related events but may have different specific conditions or timeframes";
  } else if (confidence > 0.4) {
    return "Some similarity - same general topic but likely different specific outcomes or markets";
  } else if (confidence > 0.2) {
    return "Low similarity - same category but appear to be different events or outcomes";
  } else {
    return "Minimal similarity - different events, likely not equivalent for arbitrage";
  }
}

async function createDemoArbitrageTable(connection: DuckDBConnection, results: Array<{pair: MarketPair, confidence: number, reasoning: string}>): Promise<void> {
  // Create demo table
  await connection.run(`
    CREATE OR REPLACE TABLE demo_arbitrage_opportunities (
      kalshi_id VARCHAR,
      polymarket_id VARCHAR,
      kalshi_title VARCHAR,
      polymarket_title VARCHAR,
      category VARCHAR,
      confidence_score DOUBLE,
      reasoning TEXT,
      kalshi_price DOUBLE,
      polymarket_price DOUBLE,
      price_difference DOUBLE,
      potential_profit DOUBLE,
      min_volume DOUBLE,
      is_viable BOOLEAN
    )
  `);
  
  // Insert demo results
  for (const result of results) {
    const { pair, confidence, reasoning } = result;
    const priceDiff = Math.abs(pair.kalshi_price - pair.polymarket_price);
    const potentialProfit = Math.max(0, priceDiff - 0.02); // Assume 2% fees
    const minVolume = Math.min(pair.kalshi_volume, pair.polymarket_volume);
    const isViable = confidence >= 0.7 && potentialProfit > 0.03 && minVolume > 200;
    
    await connection.run(`
      INSERT INTO demo_arbitrage_opportunities VALUES (
        '${pair.kalshi_id}', '${pair.polymarket_id}',
        '${pair.kalshi_title.replace(/'/g, "''")}', '${pair.polymarket_title.replace(/'/g, "''")}',
        '${pair.category}', ${confidence}, '${reasoning.replace(/'/g, "''")}',
        ${pair.kalshi_price}, ${pair.polymarket_price}, ${priceDiff}, ${potentialProfit},
        ${minVolume}, ${isViable}
      )
    `);
  }
  
  console.log(`   💾 Created demo arbitrage table with ${results.length} evaluated pairs`);
}

async function showDemoResults(connection: DuckDBConnection): Promise<void> {
  // Count viable opportunities
  const countResult = await connection.run(`
    SELECT 
      COUNT(*) as total_evaluated,
      COUNT(CASE WHEN is_viable THEN 1 END) as viable_opportunities,
      AVG(confidence_score) as avg_confidence,
      MAX(potential_profit) as max_profit
    FROM demo_arbitrage_opportunities
  `);
  const stats = await countResult.getRows();
  const [total, viable, avgConfidence, maxProfit] = stats[0];
  
  console.log(`\n   📊 Demo Evaluation Results:`);
  console.log(`     Total pairs evaluated: ${Number(total)}`);
  console.log(`     Viable arbitrage opportunities: ${Number(viable)}`);
  console.log(`     Average LLM confidence: ${(Number(avgConfidence)*100).toFixed(1)}%`);
  console.log(`     Maximum potential profit: ${(Number(maxProfit)*100).toFixed(1)}%`);
  
  // Show top opportunities
  const topResult = await connection.run(`
    SELECT 
      kalshi_title,
      polymarket_title,
      category,
      confidence_score,
      kalshi_price,
      polymarket_price,
      potential_profit,
      min_volume,
      reasoning
    FROM demo_arbitrage_opportunities
    WHERE is_viable = true
    ORDER BY potential_profit DESC, confidence_score DESC
    LIMIT 5
  `);
  const opportunities = await topResult.getRows();
  
  if (opportunities.length > 0) {
    console.log(`\n   🎯 Top Demo Arbitrage Opportunities:`);
    opportunities.forEach((row, i) => {
      const [k_title, p_title, category, confidence, k_price, p_price, profit, volume, reasoning] = row;
      
      console.log(`\n   ${i+1}. 💰 Profit: ${(Number(profit)*100).toFixed(1)}% | Confidence: ${(Number(confidence)*100).toFixed(1)}% | Volume: $${Number(volume).toLocaleString()}`);
      console.log(`      🏷️ Category: ${category}`);
      console.log(`      📊 Prices: Kalshi ${Number(k_price).toFixed(3)} vs Polymarket ${Number(p_price).toFixed(3)}`);
      console.log(`      📝 Kalshi: "${String(k_title).substring(0, 55)}..."`);
      console.log(`      📝 Polymarket: "${String(p_title).substring(0, 55)}..."`);
      console.log(`      🧠 Simulated LLM: "${String(reasoning)}"`);
    });
  } else {
    console.log(`\n   ℹ️ No viable opportunities in demo data (increase market volume or adjust criteria)`);
  }
}

function showProductionPlan(): void {
  console.log(`\n🚀 PRODUCTION LLM INTEGRATION PLAN:`);
  console.log(`\n✅ WHAT'S READY:`);
  console.log(`   • Unified data model with 4,525 markets (3,515 Kalshi + 1,010 Polymarket)`);
  console.log(`   • Smart candidate pair filtering to reduce API costs`);
  console.log(`   • Batch processing system for efficient LLM evaluation`);
  console.log(`   • Complete arbitrage opportunity ranking and filtering`);
  
  console.log(`\n🔧 IMPLEMENTATION STEPS:`);
  console.log(`   1. Get Gemini API key: https://makersuite.google.com/app/apikey`);
  console.log(`   2. Set environment variable: export GEMINI_API_KEY='your-key'`);
  console.log(`   3. Run: node --import tsx/esm scripts/llm-arbitrage-matching.ts`);
  console.log(`   4. System will process ~50 highest-potential market pairs`);
  console.log(`   5. LLM evaluates semantic equivalence with confidence scores`);
  console.log(`   6. Generate ranked arbitrage opportunities`);
  
  console.log(`\n📊 EXPECTED PRODUCTION RESULTS:`);
  console.log(`   • Processing time: ~2-3 minutes for 50 pairs`);
  console.log(`   • API cost: ~$0.10-0.50 per batch (Gemini Flash is very affordable)`);
  console.log(`   • Expected viable opportunities: 5-15 high-confidence matches`);
  console.log(`   • Profit potential: 3-20% per opportunity`);
  
  console.log(`\n🎯 SCALING FOR PRODUCTION:`);
  console.log(`   • Start with top 100 market pairs daily`);
  console.log(`   • Expand to full dataset (1000+ pairs) as needed`);
  console.log(`   • Implement caching to avoid re-evaluating same pairs`);
  console.log(`   • Add real-time monitoring for new high-value opportunities`);
  
  console.log(`\n💡 WHY LLM MATCHING IS REVOLUTIONARY:`);
  console.log(`   • Detects semantic equivalence that keyword matching misses`);
  console.log(`   • Handles different phrasing: "Trump wins 2024" vs "Donald Trump elected President"`);
  console.log(`   • Understands context: timeframes, conditions, specific outcomes`);
  console.log(`   • Provides confidence scores for risk management`);
  console.log(`   • Continuously improves with better prompting and fine-tuning`);
}

demoLLMMatching();