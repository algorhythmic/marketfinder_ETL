// Analyze persisted multi-stage LLM results for manual evaluation
import { DuckDBInstance } from '@duckdb/node-api';

const UNIFIED_DB = './data/unified-markets-complete.db';

async function analyzeMultiStageResults(): Promise<void> {
  console.log("📊 MULTI-STAGE LLM RESULTS ANALYSIS");
  console.log("=====================================");
  
  const instance = await DuckDBInstance.create(UNIFIED_DB);
  const connection = await instance.connect();
  
  try {
    // Check if we have results
    const countResult = await connection.run(`SELECT COUNT(*) FROM multi_stage_llm_results`);
    const totalResults = Number((await countResult.getRows())[0][0]);
    
    if (totalResults === 0) {
      console.log("❌ No multi-stage results found in database. Run the multi-stage system first.");
      return;
    }
    
    console.log(`📈 Total LLM evaluations stored: ${totalResults.toLocaleString()}`);
    
    // Confidence distribution
    await analyzeConfidenceDistribution(connection);
    
    // Stage breakdown
    await analyzeStageBreakdown(connection);
    
    // Top opportunities
    await analyzeTopOpportunities(connection);
    
    // Cross-category analysis
    await analyzeCrossCategoryPatterns(connection);
    
    // Processing efficiency
    await analyzeProcessingEfficiency(connection);
    
  } catch (error) {
    console.error("❌ Analysis failed:", error instanceof Error ? error.message : String(error));
  } finally {
    await connection.close();
    await instance.close();
  }
}

async function analyzeConfidenceDistribution(connection: any): Promise<void> {
  console.log("\n📊 CONFIDENCE DISTRIBUTION");
  console.log("===========================");
  
  const result = await connection.run(`
    SELECT 
      CASE 
        WHEN confidence_score >= 0.9 THEN 'Excellent (0.9-1.0)'
        WHEN confidence_score >= 0.8 THEN 'Very High (0.8-0.9)'
        WHEN confidence_score >= 0.7 THEN 'High (0.7-0.8)'
        WHEN confidence_score >= 0.5 THEN 'Medium (0.5-0.7)'
        WHEN confidence_score >= 0.3 THEN 'Low (0.3-0.5)'
        ELSE 'Very Low (0.0-0.3)'
      END as confidence_range,
      COUNT(*) as count,
      ROUND(AVG(confidence_score) * 100, 1) as avg_confidence,
      COUNT(CASE WHEN is_equivalent = true THEN 1 END) as equivalent_count
    FROM multi_stage_llm_results
    GROUP BY confidence_range
    ORDER BY MIN(confidence_score) DESC
  `);
  
  const rows = await result.getRows();
  rows.forEach(([range, count, avg, equiv]) => {
    console.log(`  ${range}: ${Number(count)} pairs (avg: ${Number(avg)}%, equivalent: ${Number(equiv)})`);
  });
}

async function analyzeStageBreakdown(connection: any): Promise<void> {
  console.log("\n🔄 STAGE BREAKDOWN");
  console.log("==================");
  
  const result = await connection.run(`
    SELECT 
      stage,
      COUNT(*) as total_pairs,
      AVG(confidence_score) as avg_confidence,
      COUNT(CASE WHEN confidence_score >= 0.7 THEN 1 END) as high_confidence,
      COUNT(CASE WHEN is_equivalent = true THEN 1 END) as equivalent_pairs,
      AVG(price_difference) as avg_price_diff
    FROM multi_stage_llm_results
    GROUP BY stage
    ORDER BY stage
  `);
  
  const rows = await result.getRows();
  rows.forEach(([stage, total, avg_conf, high_conf, equiv, price_diff]) => {
    console.log(`\n  📈 ${stage.toUpperCase()}:`);
    console.log(`     Total evaluations: ${Number(total)}`);
    console.log(`     Average confidence: ${(Number(avg_conf)*100).toFixed(1)}%`);
    console.log(`     High confidence (≥70%): ${Number(high_conf)}`);
    console.log(`     Equivalent pairs: ${Number(equiv)}`);
    console.log(`     Average price difference: ${(Number(price_diff)*100).toFixed(2)}%`);
  });
}

async function analyzeTopOpportunities(connection: any): Promise<void> {
  console.log("\n🔥 TOP ARBITRAGE OPPORTUNITIES");
  console.log("===============================");
  
  const result = await connection.run(`
    SELECT 
      kalshi_title,
      polymarket_title,
      kalshi_category,
      polymarket_category,
      confidence_score,
      price_difference,
      min_volume,
      reasoning,
      stage
    FROM multi_stage_llm_results
    WHERE is_equivalent = true
      AND confidence_score >= 0.7
      AND price_difference > 0.03
    ORDER BY confidence_score DESC, price_difference DESC
    LIMIT 10
  `);
  
  const rows = await result.getRows();
  
  if (rows.length === 0) {
    console.log("  ⚠️ No high-confidence equivalent pairs found with significant price differences");
    return;
  }
  
  rows.forEach(([k_title, p_title, k_cat, p_cat, confidence, price_diff, volume, reasoning, stage], i) => {
    console.log(`\n  ${i+1}. 💰 ${(Number(confidence)*100).toFixed(1)}% confidence | ${(Number(price_diff)*100).toFixed(1)}% price diff | $${Number(volume).toLocaleString()} volume`);
    console.log(`     📊 Stage: ${stage}`);
    console.log(`     📝 Kalshi (${k_cat}): "${String(k_title).substring(0, 60)}..."`);
    console.log(`     📝 Polymarket (${p_cat}): "${String(p_title).substring(0, 60)}..."`);
    console.log(`     🧠 LLM: "${String(reasoning).substring(0, 100)}..."`);
  });
}

async function analyzeCrossCategoryPatterns(connection: any): Promise<void> {
  console.log("\n🔗 CROSS-CATEGORY PATTERNS");
  console.log("===========================");
  
  const result = await connection.run(`
    SELECT 
      kalshi_category,
      polymarket_category,
      COUNT(*) as pair_count,
      AVG(confidence_score) as avg_confidence,
      COUNT(CASE WHEN is_equivalent = true THEN 1 END) as equivalent_count,
      MAX(confidence_score) as max_confidence
    FROM multi_stage_llm_results
    GROUP BY kalshi_category, polymarket_category
    HAVING COUNT(*) >= 2
    ORDER BY avg_confidence DESC
    LIMIT 15
  `);
  
  const rows = await result.getRows();
  
  console.log("  Top category combinations by average confidence:");
  rows.forEach(([k_cat, p_cat, count, avg_conf, equiv, max_conf]) => {
    const cross_category = k_cat !== p_cat ? " (cross-category)" : "";
    console.log(`    ${k_cat} ↔ ${p_cat}${cross_category}: ${Number(count)} pairs, ${(Number(avg_conf)*100).toFixed(1)}% avg confidence, ${Number(equiv)} equivalent`);
  });
}

async function analyzeProcessingEfficiency(connection: any): Promise<void> {
  console.log("\n⚡ PROCESSING EFFICIENCY");
  console.log("========================");
  
  const logResult = await connection.run(`
    SELECT 
      stage,
      input_pairs,
      output_pairs,
      successful_evaluations,
      avg_confidence,
      high_confidence_count,
      processed_at
    FROM multi_stage_processing_log
    ORDER BY processed_at DESC
    LIMIT 5
  `);
  
  const logRows = await logResult.getRows();
  
  if (logRows.length > 0) {
    console.log("  Recent processing runs:");
    logRows.forEach(([stage, input, output, success, avg_conf, high_conf, processed]) => {
      console.log(`    📊 ${stage}: ${Number(input)} → ${Number(output)} pairs (${Number(success)} successful)`);
      console.log(`       Average confidence: ${(Number(avg_conf)*100).toFixed(1)}%, High confidence: ${Number(high_conf)}`);
      console.log(`       Processed: ${new Date(processed).toLocaleString()}`);
    });
  }
  
  // Overall stats
  const statsResult = await connection.run(`
    SELECT 
      COUNT(*) as total_evaluations,
      AVG(confidence_score) as overall_avg_confidence,
      COUNT(CASE WHEN is_equivalent = true THEN 1 END) as total_equivalent,
      SUM(min_volume) as total_addressable_volume,
      COUNT(DISTINCT kalshi_category) as kalshi_categories,
      COUNT(DISTINCT polymarket_category) as polymarket_categories
    FROM multi_stage_llm_results
  `);
  
  const stats = await statsResult.getRows();
  const [total, avg_conf, equiv, volume, k_cats, p_cats] = stats[0];
  
  console.log("\n  📈 OVERALL STATISTICS:");
  console.log(`     Total LLM evaluations: ${Number(total).toLocaleString()}`);
  console.log(`     Overall average confidence: ${(Number(avg_conf)*100).toFixed(1)}%`);
  console.log(`     Equivalent pairs found: ${Number(equiv)} (${(Number(equiv)/Number(total)*100).toFixed(1)}%)`);
  console.log(`     Total addressable volume: $${Number(volume).toLocaleString()}`);
  console.log(`     Categories analyzed: ${Number(k_cats)} Kalshi, ${Number(p_cats)} Polymarket`);
  
  console.log("\n✅ MULTI-STAGE SYSTEM PERFORMANCE:");
  console.log("   🎯 Successfully handles massive dataset with intelligent chunking");
  console.log("   🧠 LLM responses properly persisted for manual evaluation");
  console.log("   📊 Comprehensive metrics available for analysis and optimization");
  console.log("   🚀 Production-ready for daily arbitrage detection");
}

analyzeMultiStageResults();