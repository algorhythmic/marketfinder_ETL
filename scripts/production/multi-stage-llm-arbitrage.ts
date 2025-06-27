// Multi-stage intelligent LLM arbitrage detection with smart chunking
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import fetch from 'node-fetch';

const UNIFIED_DB = './data/unified-markets-complete.db';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

interface MarketPair {
  kalshi_id: string;
  kalshi_title: string;
  kalshi_desc: string;
  kalshi_category: string;
  kalshi_price: number;
  kalshi_volume: number;
  kalshi_close: string;
  polymarket_id: string;
  polymarket_title: string;
  polymarket_desc: string;
  polymarket_category: string;
  polymarket_price: number;
  polymarket_volume: number;
  polymarket_close: string;
  similarity_score: number;
}

interface LLMResult {
  kalshi_id: string;
  polymarket_id: string;
  confidence: number;
  reasoning: string;
  stage: string;
}

async function multiStageLLMArbitrage(): Promise<void> {
  console.log("🧠 MULTI-STAGE INTELLIGENT LLM ARBITRAGE DETECTION");
  console.log("=" .repeat(60));
  
  if (!GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY environment variable not set");
    return;
  }
  
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  try {
    instance = await DuckDBInstance.create(UNIFIED_DB);
    connection = await instance.connect();
    
    // Stage 0: Setup Database Tables
    console.log("\n🗃️ STAGE 0: Setting Up Database Tables");
    await setupMultiStageDB(connection);
    
    // Stage 1: Semantic Pre-filtering
    console.log("\n🔍 STAGE 1: Semantic Pre-filtering");
    const preFilteredPairs = await semanticPreFiltering(connection);
    
    // Stage 2: Batch LLM Screening
    console.log("\n🧠 STAGE 2: Batch LLM Screening (Condensed)");
    const screenedPairs = await batchLLMScreening(preFilteredPairs);
    
    // Stage 3: Deep LLM Analysis
    console.log("\n🔬 STAGE 3: Deep LLM Analysis (Full Context)");
    const { results: analyzedResults, pairs: analyzedPairs } = await deepLLMAnalysis(screenedPairs);
    
    // Stage 4: Store Results in Database
    console.log("\n💾 STAGE 4: Storing Results in Database");
    await storeMultiStageResults(connection, analyzedResults, analyzedPairs);
    
    // Stage 5: Final Arbitrage Validation
    console.log("\n⚖️ STAGE 5: Arbitrage Validation");
    await finalArbitrageValidation(connection, analyzedResults);
    
    console.log("\n🎉 Multi-stage LLM arbitrage detection completed!");
    
  } catch (error) {
    console.error("❌ Multi-stage analysis failed:", error instanceof Error ? error.message : String(error));
  }
}

async function semanticPreFiltering(connection: DuckDBConnection): Promise<MarketPair[]> {
  console.log("   🔍 Applying semantic filters to eliminate unrelated pairs...");
  
  const result = await connection.run(`
    WITH candidate_pairs AS (
      SELECT 
        k.id as kalshi_id, k.title as kalshi_title, 
        COALESCE(k.description, k.title) as kalshi_desc,
        k.category as kalshi_category, k.yes_price as kalshi_price, 
        k.volume as kalshi_volume, k.close_time as kalshi_close,
        p.id as polymarket_id, p.title as polymarket_title,
        COALESCE(p.description, p.title) as polymarket_desc,
        p.category as polymarket_category, p.yes_price as polymarket_price,
        p.volume as polymarket_volume, p.close_time as polymarket_close,
        
        -- Intelligent similarity scoring
        CASE 
          WHEN k.category = p.category THEN 50
          ELSE 0
        END +
        CASE 
          WHEN LOWER(k.title) LIKE '%trump%' AND LOWER(p.title) LIKE '%trump%' THEN 40
          WHEN LOWER(k.title) LIKE '%bitcoin%' AND LOWER(p.title) LIKE '%bitcoin%' THEN 40
          WHEN LOWER(k.title) LIKE '%recession%' AND LOWER(p.title) LIKE '%recession%' THEN 40
          WHEN LOWER(k.title) LIKE '%election%' AND LOWER(p.title) LIKE '%election%' THEN 30
          WHEN LOWER(k.title) LIKE '%nfl%' AND LOWER(p.title) LIKE '%nfl%' THEN 30
          WHEN LOWER(k.title) LIKE '%nba%' AND LOWER(p.title) LIKE '%nba%' THEN 30
          WHEN LOWER(k.title) LIKE '%ethereum%' AND LOWER(p.title) LIKE '%ethereum%' THEN 30
          WHEN LOWER(k.title) LIKE '%china%' AND LOWER(p.title) LIKE '%china%' THEN 20
          WHEN LOWER(k.title) LIKE '%fed%' AND LOWER(p.title) LIKE '%fed%' THEN 20
          ELSE 0
        END +
        CASE 
          WHEN ABS(k.yes_price - p.yes_price) > 0.15 THEN 25
          WHEN ABS(k.yes_price - p.yes_price) > 0.1 THEN 20
          WHEN ABS(k.yes_price - p.yes_price) > 0.05 THEN 15
          ELSE 0
        END +
        CASE 
          WHEN LEAST(k.volume, p.volume) > 10000 THEN 15
          WHEN LEAST(k.volume, p.volume) > 1000 THEN 10
          WHEN LEAST(k.volume, p.volume) > 100 THEN 5
          ELSE 0
        END as similarity_score
        
      FROM unified_markets k
      CROSS JOIN unified_markets p
      WHERE k.platform = 'kalshi' AND p.platform = 'polymarket'
        AND k.is_active = true AND p.is_active = true
        AND k.volume > 50 AND p.volume > 50
        AND k.yes_price BETWEEN 0.05 AND 0.95
        AND p.yes_price BETWEEN 0.05 AND 0.95
    )
    SELECT *
    FROM candidate_pairs
    WHERE similarity_score >= 30  -- Only keep promising candidates
    ORDER BY similarity_score DESC, LEAST(kalshi_volume, polymarket_volume) DESC
    LIMIT 1000  -- Manageable size for LLM processing
  `);
  
  const rows = await result.getRows();
  const pairs = rows.map(row => ({
    kalshi_id: String(row[0]),
    kalshi_title: String(row[1]),
    kalshi_desc: String(row[2]),
    kalshi_category: String(row[3]),
    kalshi_price: Number(row[4]),
    kalshi_volume: Number(row[5]),
    kalshi_close: String(row[6]),
    polymarket_id: String(row[7]),
    polymarket_title: String(row[8]),
    polymarket_desc: String(row[9]),
    polymarket_category: String(row[10]),
    polymarket_price: Number(row[11]),
    polymarket_volume: Number(row[12]),
    polymarket_close: String(row[13]),
    similarity_score: Number(row[14])
  }));
  
  console.log(`   ✅ Filtered to ${pairs.length} high-potential pairs`);
  console.log(`   📊 Score range: ${Math.min(...pairs.map(p => p.similarity_score))} - ${Math.max(...pairs.map(p => p.similarity_score))}`);
  
  return pairs;
}

async function batchLLMScreening(pairs: MarketPair[]): Promise<MarketPair[]> {
  console.log(`   🧠 Screening ${pairs.length} pairs with condensed descriptions...`);
  
  const screenedPairs: MarketPair[] = [];
  const batchSize = 15; // Larger batches for quick screening
  
  for (let i = 0; i < pairs.length; i += batchSize) {
    const batch = pairs.slice(i, i + batchSize);
    
    try {
      console.log(`     📦 Screening batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(pairs.length/batchSize)}`);
      
      const prompt = createScreeningPrompt(batch);
      const results = await callLLM(prompt, "screening");
      
      // Keep pairs with confidence >= 0.3 (promising for deep analysis)
      batch.forEach((pair, idx) => {
        if (idx < results.length && results[idx].confidence >= 0.3) {
          screenedPairs.push(pair);
        }
      });
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.log(`     ❌ Screening batch failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  console.log(`   ✅ Screened to ${screenedPairs.length} promising pairs`);
  return screenedPairs;
}

async function deepLLMAnalysis(pairs: MarketPair[]): Promise<{ results: LLMResult[], pairs: MarketPair[] }> {
  console.log(`   🔬 Deep analysis of ${pairs.length} pairs with full context...`);
  
  const analyzedResults: LLMResult[] = [];
  const processedPairs: MarketPair[] = [];
  const batchSize = 5; // Smaller batches for detailed analysis
  
  for (let i = 0; i < pairs.length; i += batchSize) {
    const batch = pairs.slice(i, i + batchSize);
    
    try {
      console.log(`     📦 Analyzing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(pairs.length/batchSize)}`);
      
      const prompt = createDeepAnalysisPrompt(batch);
      const results = await callLLM(prompt, "deep_analysis");
      
      // Map results back to actual market pairs
      for (let j = 0; j < results.length && j < batch.length; j++) {
        const result = results[j];
        const marketPair = batch[j];
        
        // Update result with actual market IDs
        result.kalshi_id = marketPair.kalshi_id;
        result.polymarket_id = marketPair.polymarket_id;
        
        analyzedResults.push(result);
        processedPairs.push(marketPair);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1500));
      
    } catch (error) {
      console.log(`     ❌ Analysis batch failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  console.log(`   ✅ Completed deep analysis of ${analyzedResults.length} pairs`);
  return { results: analyzedResults, pairs: processedPairs };
}

function createScreeningPrompt(batch: MarketPair[]): string {
  return `Screen these prediction market pairs for potential arbitrage. Give quick confidence scores (0.0-1.0) based on title similarity and basic context.

PAIRS TO SCREEN:

${batch.map((pair, i) => `
PAIR ${i + 1}:
Kalshi: "${pair.kalshi_title}" (${pair.kalshi_category}, $${pair.kalshi_price.toFixed(3)})
Polymarket: "${pair.polymarket_title}" (${pair.polymarket_category}, $${pair.polymarket_price.toFixed(3)})
Price Diff: ${Math.abs(pair.kalshi_price - pair.polymarket_price).toFixed(3)}
`).join('')}

RESPOND EXACTLY:
PAIR 1: confidence=0.XX
PAIR 2: confidence=0.XX
...

Be quick but accurate. Focus on title similarity and basic event matching.`;
}

function createDeepAnalysisPrompt(batch: MarketPair[]): string {
  return `Provide detailed arbitrage analysis for these prediction market pairs. Consider resolution criteria, timeframes, and exact conditions.

CRITICAL: For arbitrage to work, markets must resolve identically under the same conditions.

PAIRS FOR DEEP ANALYSIS:

${batch.map((pair, i) => {
  const kalshiDesc = pair.kalshi_desc.substring(0, 300);
  const polyDesc = pair.polymarket_desc.substring(0, 300);
  const kalshiClose = pair.kalshi_close ? new Date(pair.kalshi_close).toISOString().split('T')[0] : 'unknown';
  const polyClose = pair.polymarket_close ? new Date(pair.polymarket_close).toISOString().split('T')[0] : 'unknown';
  
  return `
PAIR ${i + 1}:

KALSHI: "${pair.kalshi_title}"
  Category: ${pair.kalshi_category} | Price: $${pair.kalshi_price.toFixed(3)} | Closes: ${kalshiClose}
  Resolution: ${kalshiDesc}...

POLYMARKET: "${pair.polymarket_title}"
  Category: ${pair.polymarket_category} | Price: $${pair.polymarket_price.toFixed(3)} | Closes: ${polyClose}
  Resolution: ${polyDesc}...

Price Difference: ${Math.abs(pair.kalshi_price - pair.polymarket_price).toFixed(3)} (${(Math.abs(pair.kalshi_price - pair.polymarket_price) * 100).toFixed(1)}%)`;
}).join('\n')}

RESPOND EXACTLY:
PAIR 1: confidence=0.XX, reasoning="detailed resolution criteria analysis"
PAIR 2: confidence=0.XX, reasoning="detailed resolution criteria analysis"
...

Focus on exact resolution criteria alignment. Different outcomes = NOT equivalent.`;
}

async function callLLM(prompt: string, stage: string): Promise<LLMResult[]> {
  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2000 }
    })
  });
  
  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status}`);
  }
  
  const data = await response.json();
  const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!responseText) {
    throw new Error('No response from LLM');
  }
  
  // Parse response
  const results: LLMResult[] = [];
  const lines = responseText.split('\n').filter(line => line.trim().startsWith('PAIR'));
  
  lines.forEach((line, i) => {
    const confidenceMatch = line.match(/confidence=([0-9.]+)/);
    const reasoningMatch = line.match(/reasoning="([^"]+)"/);
    
    if (confidenceMatch) {
      results.push({
        kalshi_id: `pair_${i}`, // Will be mapped properly in calling function
        polymarket_id: `pair_${i}`,
        confidence: parseFloat(confidenceMatch[1]),
        reasoning: reasoningMatch ? reasoningMatch[1] : 'No reasoning provided',
        stage: stage
      });
    }
  });
  
  return results;
}

async function finalArbitrageValidation(connection: DuckDBConnection, results: LLMResult[]): Promise<void> {
  console.log(`   ⚖️ Validating ${results.length} high-confidence pairs...`);
  
  const highConfidencePairs = results.filter(r => r.confidence >= 0.7);
  
  console.log(`   🎯 Found ${highConfidencePairs.length} pairs with ≥70% confidence`);
  console.log(`   📊 Average confidence: ${(results.reduce((sum, r) => sum + r.confidence, 0) / results.length * 100).toFixed(1)}%`);
  
  if (highConfidencePairs.length > 0) {
    console.log(`\n   🔥 HIGH-CONFIDENCE ARBITRAGE OPPORTUNITIES:`);
    highConfidencePairs.forEach((pair, i) => {
      console.log(`   ${i+1}. ${(pair.confidence*100).toFixed(1)}% confidence`);
      console.log(`      🧠 ${pair.reasoning.substring(0, 100)}...`);
    });
  }
  
  console.log(`\n   ✅ Multi-stage processing complete!`);
  console.log(`   📈 Efficiency: Evaluated massive dataset with targeted LLM usage`);
}

async function setupMultiStageDB(connection: DuckDBConnection): Promise<void> {
  // Create table for multi-stage LLM results with stage tracking
  await connection.run(`
    CREATE TABLE IF NOT EXISTS multi_stage_llm_results (
      id INTEGER PRIMARY KEY,
      kalshi_id VARCHAR,
      polymarket_id VARCHAR,
      stage VARCHAR, -- 'screening' or 'deep_analysis'
      confidence_score DOUBLE,
      reasoning TEXT,
      is_equivalent BOOLEAN,
      kalshi_title TEXT,
      polymarket_title TEXT,
      kalshi_category VARCHAR,
      polymarket_category VARCHAR,
      kalshi_price DOUBLE,
      polymarket_price DOUBLE,
      price_difference DOUBLE,
      kalshi_volume DOUBLE,
      polymarket_volume DOUBLE,
      min_volume DOUBLE,
      similarity_score DOUBLE,
      processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create processing log for multi-stage system
  await connection.run(`
    CREATE TABLE IF NOT EXISTS multi_stage_processing_log (
      id INTEGER PRIMARY KEY,
      stage VARCHAR,
      input_pairs INTEGER,
      output_pairs INTEGER,
      api_calls INTEGER,
      successful_evaluations INTEGER,
      failed_evaluations INTEGER,
      avg_confidence DOUBLE,
      high_confidence_count INTEGER,
      processing_time_seconds INTEGER,
      processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  console.log("   ✅ Database tables ready for multi-stage processing");
}

async function storeMultiStageResults(connection: DuckDBConnection, results: LLMResult[], pairs: MarketPair[]): Promise<void> {
  console.log(`   💾 Storing ${results.length} LLM evaluations to database...`);
  
  let storedCount = 0;
  
  for (let i = 0; i < results.length && i < pairs.length; i++) {
    const result = results[i];
    const pair = pairs[i];
    
    try {
      const price_difference = Math.abs(pair.kalshi_price - pair.polymarket_price);
      const min_volume = Math.min(pair.kalshi_volume, pair.polymarket_volume);
      
      await connection.run(`
        INSERT INTO multi_stage_llm_results (
          id, kalshi_id, polymarket_id, stage, confidence_score, reasoning, 
          is_equivalent, kalshi_title, polymarket_title, kalshi_category, polymarket_category,
          kalshi_price, polymarket_price, price_difference, kalshi_volume, polymarket_volume,
          min_volume, similarity_score, processed_at
        ) VALUES (
          ${i + 1}, '${result.kalshi_id}', '${result.polymarket_id}', '${result.stage}',
          ${result.confidence_score}, '${result.reasoning.replace(/'/g, "''")}',
          ${result.is_equivalent}, '${pair.kalshi_title.replace(/'/g, "''")}', 
          '${pair.polymarket_title.replace(/'/g, "''")}', '${pair.kalshi_category}', 
          '${pair.polymarket_category}', ${pair.kalshi_price}, ${pair.polymarket_price},
          ${price_difference}, ${pair.kalshi_volume}, ${pair.polymarket_volume},
          ${min_volume}, ${pair.similarity_score}, CURRENT_TIMESTAMP
        )
      `);
      
      storedCount++;
      
    } catch (error) {
      console.log(`     ⚠️ Failed to store result ${i + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  console.log(`   ✅ Stored ${storedCount}/${results.length} evaluations to database`);
  
  // Store processing summary
  const highConfidenceCount = results.filter(r => r.confidence >= 0.7).length;
  const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
  
  await connection.run(`
    INSERT INTO multi_stage_processing_log (
      stage, input_pairs, output_pairs, successful_evaluations, 
      avg_confidence, high_confidence_count, processed_at
    ) VALUES (
      'deep_analysis', ${pairs.length}, ${results.length}, ${storedCount},
      ${avgConfidence}, ${highConfidenceCount}, CURRENT_TIMESTAMP
    )
  `);
  
  console.log(`   📊 Processing summary: ${highConfidenceCount} high-confidence pairs (≥70%), avg confidence: ${(avgConfidence*100).toFixed(1)}%`);
}

multiStageLLMArbitrage();