// LLM-powered arbitrage matching using Vertex AI Gemini 2.5 Flash
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import fetch from 'node-fetch';

const UNIFIED_DB = './data/unified-markets.db';

// Vertex AI Configuration
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.VERTEX_PROJECT_ID;
const LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
const ACCESS_TOKEN = process.env.GOOGLE_CLOUD_ACCESS_TOKEN;

// Alternative: AI Studio API (for comparison)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

interface VertexAIConfig {
  projectId: string;
  location: string;
  accessToken?: string;
  model: string;
}

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

interface LLMMatchResult {
  kalshi_id: string;
  polymarket_id: string;
  confidence_score: number;
  reasoning: string;
  is_equivalent: boolean;
}

async function vertexAIArbitrageMatching(): Promise<void> {
  console.log("🔥 VERTEX AI GEMINI 2.5 FLASH ARBITRAGE MATCHING");
  console.log("=" .repeat(60));
  
  // Check available authentication methods
  const authMethod = checkAuthenticationSetup();
  if (!authMethod) {
    showAuthenticationGuide();
    return;
  }
  
  console.log(`✅ Using ${authMethod} authentication`);
  
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  try {
    instance = await DuckDBInstance.create(UNIFIED_DB);
    connection = await instance.connect();
    
    // Step 1: Prepare candidate market pairs
    console.log("\n📊 Step 1: Preparing Market Pairs...");
    const candidatePairs = await prepareCandidatePairs(connection);
    
    // Step 2: Setup database
    console.log("\n🗃️ Step 2: Setting Up Database...");
    await setupVertexAIMatchingDB(connection);
    
    // Step 3: Process with Vertex AI
    console.log("\n🧠 Step 3: Processing with Vertex AI Gemini 2.5 Flash...");
    const matches = await processWithVertexAI(candidatePairs, authMethod);
    
    // Step 4: Store and analyze results
    console.log("\n💾 Step 4: Storing Results...");
    await storeVertexAIResults(connection, matches);
    
    // Step 5: Generate final opportunities
    console.log("\n⚖️ Step 5: Generating Arbitrage Opportunities...");
    await generateVertexAIArbitrageOpportunities(connection);
    
  } catch (error) {
    console.error("❌ Vertex AI matching failed:", error instanceof Error ? error.message : String(error));
  } finally {
    console.log(`\n✅ Vertex AI arbitrage matching completed`);
  }
}

function checkAuthenticationSetup(): string | null {
  if (ACCESS_TOKEN && PROJECT_ID) {
    return 'Vertex AI (Access Token)';
  }
  
  if (GEMINI_API_KEY) {
    return 'AI Studio (API Key)';
  }
  
  // Check for Application Default Credentials
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLOUD_PROJECT) {
    return 'Vertex AI (Application Default Credentials)';
  }
  
  return null;
}

function showAuthenticationGuide(): void {
  console.log("\n❌ No authentication found. Choose one of these methods:\n");
  
  console.log("🔥 METHOD 1: Vertex AI with Access Token (Recommended)");
  console.log("   1. Install gcloud CLI: https://cloud.google.com/sdk/docs/install");
  console.log("   2. Authenticate: gcloud auth login");
  console.log("   3. Set project: gcloud config set project YOUR_PROJECT_ID");
  console.log("   4. Get token: gcloud auth print-access-token");
  console.log("   5. Set environment variables:");
  console.log("      export GOOGLE_CLOUD_PROJECT='your-project-id'");
  console.log("      export VERTEX_PROJECT_ID='your-project-id'");
  console.log("      export GOOGLE_CLOUD_ACCESS_TOKEN='ya29.a0...'");
  console.log("      export VERTEX_LOCATION='us-central1'  # optional");
  
  console.log("\n🔧 METHOD 2: Vertex AI with Service Account");
  console.log("   1. Create service account: https://console.cloud.google.com/iam-admin/serviceaccounts");
  console.log("   2. Download JSON key file");
  console.log("   3. Set environment variable:");
  console.log("      export GOOGLE_APPLICATION_CREDENTIALS='/path/to/service-account.json'");
  console.log("      export GOOGLE_CLOUD_PROJECT='your-project-id'");
  
  console.log("\n💡 METHOD 3: AI Studio API (Simpler, but less enterprise features)");
  console.log("   1. Get API key: https://makersuite.google.com/app/apikey");
  console.log("   2. Set environment variable:");
  console.log("      export GEMINI_API_KEY='AIzaSy...'");
  
  console.log("\n📊 Benefits of Vertex AI vs AI Studio:");
  console.log("   Vertex AI: Enterprise features, 2M token context, better rate limits");
  console.log("   AI Studio: Simpler setup, good for prototyping");
}

async function prepareCandidatePairs(connection: DuckDBConnection): Promise<MarketPair[][]> {
  // Get high-potential market pairs
  const result = await connection.run(`
    SELECT 
      k.id as kalshi_id, k.title as kalshi_title, k.yes_price as kalshi_price, k.volume as kalshi_volume,
      p.id as polymarket_id, p.title as polymarket_title, p.yes_price as polymarket_price, p.volume as polymarket_volume,
      k.category
    FROM unified_markets k
    CROSS JOIN unified_markets p
    WHERE k.platform = 'kalshi' AND p.platform = 'polymarket'
      AND k.is_active = true AND p.is_active = true
      AND k.volume > 1000 AND p.volume > 1000
      AND ABS(k.yes_price - p.yes_price) > 0.05
      AND (
        k.category = p.category OR
        (LOWER(k.title) LIKE '%trump%' AND LOWER(p.title) LIKE '%trump%') OR
        (LOWER(k.title) LIKE '%bitcoin%' AND LOWER(p.title) LIKE '%bitcoin%') OR
        (LOWER(k.title) LIKE '%election%' AND LOWER(p.title) LIKE '%election%') OR
        (LOWER(k.title) LIKE '%nfl%' AND LOWER(p.title) LIKE '%nfl%')
      )
    ORDER BY ABS(k.yes_price - p.yes_price) DESC, LEAST(k.volume, p.volume) DESC
    LIMIT 25
  `);
  
  const rows = await result.getRows();
  
  const pairs: MarketPair[][] = rows.map(row => [{
    kalshi_id: String(row[0]),
    kalshi_title: String(row[1]),
    kalshi_price: Number(row[2]),
    kalshi_volume: Number(row[3]),
    polymarket_id: String(row[4]),
    polymarket_title: String(row[5]),
    polymarket_price: Number(row[6]),
    polymarket_volume: Number(row[7]),
    category: String(row[8])
  }, {
    kalshi_id: String(row[0]),
    kalshi_title: String(row[1]),
    kalshi_price: Number(row[2]),
    kalshi_volume: Number(row[3]),
    polymarket_id: String(row[4]),
    polymarket_title: String(row[5]),
    polymarket_price: Number(row[6]),
    polymarket_volume: Number(row[7]),
    category: String(row[8])
  }]).map(pair => [pair[0]]);
  
  console.log(`   📊 Selected ${rows.length} high-potential candidate pairs`);
  
  return pairs;
}

async function setupVertexAIMatchingDB(connection: DuckDBConnection): Promise<void> {
  await connection.run(`
    CREATE TABLE IF NOT EXISTS vertex_ai_matches (
      id INTEGER PRIMARY KEY,
      kalshi_id VARCHAR,
      polymarket_id VARCHAR,
      confidence_score DOUBLE,
      reasoning TEXT,
      is_equivalent BOOLEAN,
      model_used VARCHAR,
      api_method VARCHAR,
      price_difference DOUBLE,
      min_volume DOUBLE,
      processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function processWithVertexAI(candidatePairs: MarketPair[][], authMethod: string): Promise<LLMMatchResult[]> {
  const results: LLMMatchResult[] = [];
  const batchSize = 3; // Smaller batches for higher accuracy
  
  console.log(`   🔄 Processing ${candidatePairs.length} pairs with ${authMethod}...`);
  
  for (let i = 0; i < candidatePairs.length; i += batchSize) {
    const batch = candidatePairs.slice(i, i + batchSize);
    
    try {
      console.log(`     📦 Batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(candidatePairs.length/batchSize)}`);
      
      let batchResults: LLMMatchResult[];
      
      if (authMethod.includes('Vertex AI')) {
        batchResults = await callVertexAIAPI(batch);
      } else {
        batchResults = await callAIStudioAPI(batch);
      }
      
      results.push(...batchResults);
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.log(`     ❌ Batch failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  console.log(`   ✅ Processed ${results.length} market pairs`);
  return results;
}

async function callVertexAIAPI(batch: MarketPair[][]): Promise<LLMMatchResult[]> {
  const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-2.5-flash-001:generateContent`;
  
  const prompt = createEnhancedPrompt(batch);
  
  const requestBody = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
      topP: 0.8,
      topK: 40
    },
    safetySettings: [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      }
    ]
  };
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (ACCESS_TOKEN) {
    headers['Authorization'] = `Bearer ${ACCESS_TOKEN}`;
  }
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vertex AI API error: ${response.status} ${response.statusText}\n${errorText}`);
  }
  
  const data = await response.json();
  const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!responseText) {
    throw new Error('No response text from Vertex AI');
  }
  
  return parseEnhancedLLMResponse(responseText, batch);
}

async function callAIStudioAPI(batch: MarketPair[][]): Promise<LLMMatchResult[]> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
  
  const prompt = createEnhancedPrompt(batch);
  
  const requestBody = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
      topP: 0.8
    }
  };
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI Studio API error: ${response.status} ${response.statusText}\n${errorText}`);
  }
  
  const data = await response.json();
  const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!responseText) {
    throw new Error('No response text from AI Studio');
  }
  
  return parseEnhancedLLMResponse(responseText, batch);
}

function createEnhancedPrompt(batch: MarketPair[][]): string {
  return `You are an expert financial analyst evaluating prediction market equivalence for arbitrage opportunities.

TASK: Determine if these market pairs represent the same underlying event that would resolve identically.

EVALUATION CRITERIA:
- 1.0: Identical events (same outcome, same timeframe, same conditions)
- 0.9: Very similar events with minor differences in phrasing
- 0.8: Same core event but slightly different specific conditions
- 0.7: Related events but different timeframes or scope
- 0.5: Same general topic but different specific outcomes
- 0.3: Related concepts but different events
- 0.0: Completely unrelated events

IMPORTANT CONSIDERATIONS:
- Timeframes must match or overlap significantly
- Outcomes must be equivalent (both resolve "Yes" under same conditions)
- Different phrasing of same event should score high (e.g., "Trump wins" = "Trump elected")
- Pay attention to specific vs general questions

MARKET PAIRS:

${batch.map((pair, i) => {
  const market = pair[0]; // Since we're passing single markets, not pairs in this context
  return `PAIR ${i + 1}:
Platform A: "${market.kalshi_title}" 
  - Category: ${market.category}
  - Price: ${market.kalshi_price.toFixed(3)}
  - Volume: $${market.kalshi_volume.toLocaleString()}

Platform B: "${market.polymarket_title}"
  - Category: ${market.category}  
  - Price: ${market.polymarket_price.toFixed(3)}
  - Volume: $${market.polymarket_volume.toLocaleString()}

Price Difference: ${Math.abs(market.kalshi_price - market.polymarket_price).toFixed(3)} (${(Math.abs(market.kalshi_price - market.polymarket_price) * 100).toFixed(1)}%)`;
}).join('\n\n')}

RESPOND IN EXACT FORMAT:
PAIR 1: confidence=0.XX, reasoning="detailed explanation of equivalence assessment"
PAIR 2: confidence=0.XX, reasoning="detailed explanation of equivalence assessment"
...

Focus on accuracy - a false positive costs money, but a false negative misses profit.`;
}

function parseEnhancedLLMResponse(responseText: string, batch: MarketPair[][]): LLMMatchResult[] {
  const results: LLMMatchResult[] = [];
  const lines = responseText.split('\n').filter(line => line.trim().startsWith('PAIR'));
  
  for (let i = 0; i < lines.length && i < batch.length; i++) {
    const line = lines[i];
    const market = batch[i][0];
    
    try {
      const confidenceMatch = line.match(/confidence=([0-9.]+)/);
      const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.0;
      
      const reasoningMatch = line.match(/reasoning="([^"]+)"/);
      const reasoning = reasoningMatch ? reasoningMatch[1] : 'No reasoning provided';
      
      results.push({
        kalshi_id: market.kalshi_id,
        polymarket_id: market.polymarket_id,
        confidence_score: confidence,
        reasoning: reasoning,
        is_equivalent: confidence >= 0.75 // Higher threshold for Vertex AI
      });
      
    } catch (error) {
      console.log(`     ⚠️ Failed to parse response for pair ${i + 1}`);
      results.push({
        kalshi_id: market.kalshi_id,
        polymarket_id: market.polymarket_id,
        confidence_score: 0.0,
        reasoning: 'Response parsing failed',
        is_equivalent: false
      });
    }
  }
  
  return results;
}

async function storeVertexAIResults(connection: DuckDBConnection, matches: LLMMatchResult[]): Promise<void> {
  console.log(`   💾 Storing ${matches.length} Vertex AI evaluations...`);
  
  for (const match of matches) {
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
      INSERT INTO vertex_ai_matches (
        kalshi_id, polymarket_id, confidence_score, reasoning, is_equivalent,
        model_used, api_method, price_difference, min_volume
      ) VALUES (
        '${match.kalshi_id}', '${match.polymarket_id}', ${match.confidence_score},
        '${match.reasoning.replace(/'/g, "''")}', ${match.is_equivalent},
        'gemini-2.5-flash', 'vertex-ai', ${price_difference}, ${Number(min_volume)}
      )
    `);
  }
  
  const equivalentCount = matches.filter(m => m.is_equivalent).length;
  console.log(`   ✅ Found ${equivalentCount} equivalent market pairs (confidence ≥ 0.75)`);
}

async function generateVertexAIArbitrageOpportunities(connection: DuckDBConnection): Promise<void> {
  const opportunitiesResult = await connection.run(`
    CREATE OR REPLACE VIEW vertex_ai_arbitrage_opportunities AS
    SELECT 
      vam.kalshi_id,
      vam.polymarket_id,
      k.title as kalshi_title,
      p.title as polymarket_title,
      vam.confidence_score,
      vam.reasoning,
      vam.price_difference,
      GREATEST(vam.price_difference - 0.025, 0) as potential_profit, -- 2.5% total fees
      vam.min_volume,
      k.liquidity as kalshi_liquidity,
      p.liquidity as polymarket_liquidity,
      -- Enhanced risk scoring
      GREATEST(vam.price_difference - 0.025, 0) * vam.confidence_score * LOG(vam.min_volume + 1) / 15 as risk_adjusted_score
    FROM vertex_ai_matches vam
    JOIN unified_markets k ON vam.kalshi_id = k.id
    JOIN unified_markets p ON vam.polymarket_id = p.id
    WHERE vam.is_equivalent = true
      AND vam.price_difference > 0.04
      AND vam.min_volume > 500
    ORDER BY potential_profit DESC, confidence_score DESC
  `);
  
  const countResult = await connection.run(`
    SELECT COUNT(*) as count FROM vertex_ai_arbitrage_opportunities
  `);
  const count = await countResult.getRows();
  const opportunityCount = Number(count[0][0]);
  
  console.log(`   🎯 Generated ${opportunityCount} Vertex AI arbitrage opportunities`);
  
  if (opportunityCount > 0) {
    const topResult = await connection.run(`
      SELECT * FROM vertex_ai_arbitrage_opportunities
      ORDER BY potential_profit DESC
      LIMIT 5
    `);
    const opportunities = await topResult.getRows();
    
    console.log(`\n   🔥 Top Vertex AI Arbitrage Opportunities:`);
    opportunities.forEach((row, i) => {
      const [k_id, p_id, k_title, p_title, confidence, reasoning, diff, profit, volume] = row;
      
      console.log(`\n   ${i+1}. 💰 Profit: ${(Number(profit)*100).toFixed(1)}% | Confidence: ${(Number(confidence)*100).toFixed(1)}%`);
      console.log(`      📊 Volume: $${Number(volume).toLocaleString()} | Price Diff: ${(Number(diff)*100).toFixed(1)}%`);
      console.log(`      📝 Kalshi: "${String(k_title).substring(0, 60)}..."`);
      console.log(`      📝 Polymarket: "${String(p_title).substring(0, 60)}..."`);
      console.log(`      🧠 AI Analysis: "${String(reasoning)}"`);
    });
  }
}

vertexAIArbitrageMatching();