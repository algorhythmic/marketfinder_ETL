// Comprehensive data validation for market data quality
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';

const DB_PATH = './data/marketfinder.db';

interface ValidationResult {
  metric: string;
  platform: string;
  value: number;
  expected_range?: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  notes?: string;
}

async function validateMarketData(): Promise<void> {
  console.log("🔍 COMPREHENSIVE MARKET DATA VALIDATION");
  console.log("=".repeat(60));
  
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  try {
    instance = await DuckDBInstance.create(DB_PATH);
    connection = await instance.connect();
    
    const results: ValidationResult[] = [];
    
    // 1. Data Coverage Validation
    console.log("\n📊 DATA COVERAGE VALIDATION");
    console.log("-".repeat(40));
    
    await validateDataCoverage(connection, results);
    
    // 2. Field Completeness Validation
    console.log("\n🔢 FIELD COMPLETENESS VALIDATION");
    console.log("-".repeat(40));
    
    await validateFieldCompleteness(connection, results);
    
    // 3. Data Quality Validation
    console.log("\n✨ DATA QUALITY VALIDATION");
    console.log("-".repeat(40));
    
    await validateDataQuality(connection, results);
    
    // 4. Price Validation
    console.log("\n💰 PRICE VALIDATION");
    console.log("-".repeat(40));
    
    await validatePrices(connection, results);
    
    // 5. Volume & Liquidity Validation
    console.log("\n📈 VOLUME & LIQUIDITY VALIDATION");
    console.log("-".repeat(40));
    
    await validateVolumeAndLiquidity(connection, results);
    
    // 6. Category Distribution Validation
    console.log("\n🏷️ CATEGORY DISTRIBUTION VALIDATION");
    console.log("-".repeat(40));
    
    await validateCategories(connection, results);
    
    // 7. Cross-Platform Comparison
    console.log("\n⚖️ CROSS-PLATFORM COMPARISON");
    console.log("-".repeat(40));
    
    await validateCrossPlatform(connection, results);
    
    // Generate summary report
    console.log("\n📋 VALIDATION SUMMARY REPORT");
    console.log("=".repeat(60));
    
    generateSummaryReport(results);
    
    // Show detailed issues
    const issues = results.filter(r => r.status !== 'PASS');
    if (issues.length > 0) {
      console.log("\n⚠️ ISSUES FOUND:");
      console.log("-".repeat(40));
      issues.forEach(issue => {
        const emoji = issue.status === 'FAIL' ? '❌' : '⚠️';
        console.log(`${emoji} ${issue.platform}: ${issue.metric}`);
        console.log(`   Value: ${issue.value} ${issue.expected_range ? `(Expected: ${issue.expected_range})` : ''}`);
        if (issue.notes) console.log(`   Notes: ${issue.notes}`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.error("❌ Validation failed:", error instanceof Error ? error.message : String(error));
  } finally {
    // Resources auto-cleanup
  }
}

async function validateDataCoverage(connection: DuckDBConnection, results: ValidationResult[]): Promise<void> {
  // Total market counts
  const totalResult = await connection.run(`
    SELECT platform, COUNT(*) as total 
    FROM raw_markets 
    GROUP BY platform
  `);
  const totals = await totalResult.getRows();
  
  totals.forEach(row => {
    const [platform, count] = row;
    const total = Number(count);
    
    console.log(`📊 ${platform}: ${total.toLocaleString()} markets`);
    
    // Validate expected minimums
    let status: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
    let notes = '';
    
    if (platform === 'kalshi' && total < 4000) {
      status = 'WARN';
      notes = 'Lower than expected Kalshi market count';
    } else if (platform === 'polymarket' && total < 8000) {
      status = 'WARN';
      notes = 'Lower than expected Polymarket market count';
    }
    
    results.push({
      metric: 'Total Markets',
      platform: String(platform),
      value: total,
      expected_range: platform === 'kalshi' ? '4000+' : '8000+',
      status,
      notes
    });
  });
}

async function validateFieldCompleteness(connection: DuckDBConnection, results: ValidationResult[]): Promise<void> {
  const completenessResult = await connection.run(`
    SELECT 
      platform,
      COUNT(*) as total,
      COUNT(CASE WHEN title IS NOT NULL AND title != '' THEN 1 END) as has_title,
      COUNT(CASE WHEN yes_price IS NOT NULL AND yes_price > 0 THEN 1 END) as has_yes_price,
      COUNT(CASE WHEN no_price IS NOT NULL AND no_price > 0 THEN 1 END) as has_no_price,
      COUNT(CASE WHEN volume IS NOT NULL AND volume >= 0 THEN 1 END) as has_volume,
      COUNT(CASE WHEN liquidity IS NOT NULL AND liquidity > 0 THEN 1 END) as has_liquidity,
      COUNT(CASE WHEN category IS NOT NULL AND category != '' THEN 1 END) as has_category,
      COUNT(CASE WHEN end_date IS NOT NULL THEN 1 END) as has_end_date
    FROM raw_markets 
    GROUP BY platform
  `);
  const completeness = await completenessResult.getRows();
  
  completeness.forEach(row => {
    const [platform, total, has_title, has_yes_price, has_no_price, has_volume, has_liquidity, has_category, has_end_date] = row;
    const totalNum = Number(total);
    
    console.log(`\n${platform} Field Completeness:`);
    
    const fields = [
      { name: 'Title', count: Number(has_title), expected: 95 },
      { name: 'Yes Price', count: Number(has_yes_price), expected: platform === 'kalshi' ? 80 : 90 },
      { name: 'No Price', count: Number(has_no_price), expected: platform === 'kalshi' ? 80 : 90 },
      { name: 'Volume', count: Number(has_volume), expected: platform === 'kalshi' ? 15 : 85 },
      { name: 'Liquidity', count: Number(has_liquidity), expected: platform === 'kalshi' ? 70 : 25 },
      { name: 'Category', count: Number(has_category), expected: 90 },
      { name: 'End Date', count: Number(has_end_date), expected: 95 }
    ];
    
    fields.forEach(field => {
      const percentage = (field.count / totalNum) * 100;
      const status = percentage >= field.expected ? 'PASS' : (percentage >= field.expected - 10 ? 'WARN' : 'FAIL');
      
      console.log(`  ${field.name}: ${field.count}/${totalNum} (${percentage.toFixed(1)}%)`);
      
      results.push({
        metric: `${field.name} Completeness`,
        platform: String(platform),
        value: Number(percentage.toFixed(1)),
        expected_range: `${field.expected}%+`,
        status,
        notes: status !== 'PASS' ? `Only ${percentage.toFixed(1)}% completeness` : undefined
      });
    });
  });
}

async function validateDataQuality(connection: DuckDBConnection, results: ValidationResult[]): Promise<void> {
  // Check for data anomalies
  const qualityResult = await connection.run(`
    SELECT 
      platform,
      COUNT(*) as total,
      COUNT(CASE WHEN LENGTH(title) < 10 THEN 1 END) as short_titles,
      COUNT(CASE WHEN LENGTH(title) > 200 THEN 1 END) as long_titles,
      COUNT(CASE WHEN yes_price = 0.5 AND no_price = 0.5 THEN 1 END) as default_prices,
      COUNT(CASE WHEN yes_price + no_price != 1.0 THEN 1 END) as invalid_price_sums,
      COUNT(CASE WHEN category = 'other' THEN 1 END) as uncategorized
    FROM raw_markets 
    GROUP BY platform
  `);
  const quality = await qualityResult.getRows();
  
  quality.forEach(row => {
    const [platform, total, short_titles, long_titles, default_prices, invalid_price_sums, uncategorized] = row;
    const totalNum = Number(total);
    
    console.log(`\n${platform} Data Quality:`);
    
    const checks = [
      { name: 'Short Titles (<10 chars)', count: Number(short_titles), threshold: 5 },
      { name: 'Long Titles (>200 chars)', count: Number(long_titles), threshold: 1 },
      { name: 'Default Prices (0.5/0.5)', count: Number(default_prices), threshold: platform === 'kalshi' ? 20 : 10 },
      { name: 'Invalid Price Sums', count: Number(invalid_price_sums), threshold: 1 },
      { name: 'Uncategorized Markets', count: Number(uncategorized), threshold: 30 }
    ];
    
    checks.forEach(check => {
      const percentage = (check.count / totalNum) * 100;
      const status = percentage <= check.threshold ? 'PASS' : (percentage <= check.threshold * 2 ? 'WARN' : 'FAIL');
      
      console.log(`  ${check.name}: ${check.count} (${percentage.toFixed(1)}%)`);
      
      if (status !== 'PASS') {
        results.push({
          metric: check.name,
          platform: String(platform),
          value: Number(percentage.toFixed(1)),
          expected_range: `<${check.threshold}%`,
          status,
          notes: `${percentage.toFixed(1)}% of markets have this issue`
        });
      }
    });
  });
}

async function validatePrices(connection: DuckDBConnection, results: ValidationResult[]): Promise<void> {
  const priceResult = await connection.run(`
    SELECT 
      platform,
      COUNT(*) as total,
      AVG(yes_price) as avg_yes_price,
      MIN(yes_price) as min_yes_price,
      MAX(yes_price) as max_yes_price,
      STDDEV(yes_price) as std_yes_price,
      COUNT(CASE WHEN yes_price BETWEEN 0.01 AND 0.99 THEN 1 END) as valid_yes_prices
    FROM raw_markets 
    WHERE yes_price IS NOT NULL
    GROUP BY platform
  `);
  const prices = await priceResult.getRows();
  
  prices.forEach(row => {
    const [platform, total, avg_yes_price, min_yes_price, max_yes_price, std_yes_price, valid_yes_prices] = row;
    const totalNum = Number(total);
    const validPercentage = (Number(valid_yes_prices) / totalNum) * 100;
    
    console.log(`\n${platform} Price Analysis:`);
    console.log(`  Average Yes Price: ${Number(avg_yes_price).toFixed(3)}`);
    console.log(`  Price Range: ${Number(min_yes_price).toFixed(3)} - ${Number(max_yes_price).toFixed(3)}`);
    console.log(`  Standard Deviation: ${Number(std_yes_price).toFixed(3)}`);
    console.log(`  Valid Prices (0.01-0.99): ${Number(valid_yes_prices)}/${totalNum} (${validPercentage.toFixed(1)}%)`);
    
    // Validate price distribution
    if (validPercentage < 80) {
      results.push({
        metric: 'Valid Price Range',
        platform: String(platform),
        value: Number(validPercentage.toFixed(1)),
        expected_range: '80%+',
        status: validPercentage < 60 ? 'FAIL' : 'WARN',
        notes: 'Many prices outside expected 0.01-0.99 range'
      });
    }
    
    // Check for price diversity (not all 0.5)
    const avgPrice = Number(avg_yes_price);
    if (Math.abs(avgPrice - 0.5) < 0.05) {
      results.push({
        metric: 'Price Diversity',
        platform: String(platform),
        value: Number(avgPrice.toFixed(3)),
        expected_range: 'Not ~0.5',
        status: 'WARN',
        notes: 'Prices too concentrated around 0.5 (may indicate default values)'
      });
    }
  });
}

async function validateVolumeAndLiquidity(connection: DuckDBConnection, results: ValidationResult[]): Promise<void> {
  const volumeResult = await connection.run(`
    SELECT 
      platform,
      COUNT(*) as total,
      AVG(volume) as avg_volume,
      MAX(volume) as max_volume,
      COUNT(CASE WHEN volume > 0 THEN 1 END) as has_volume,
      AVG(liquidity) as avg_liquidity,
      MAX(liquidity) as max_liquidity,
      COUNT(CASE WHEN liquidity > 0 THEN 1 END) as has_liquidity
    FROM raw_markets 
    GROUP BY platform
  `);
  const volumes = await volumeResult.getRows();
  
  volumes.forEach(row => {
    const [platform, total, avg_volume, max_volume, has_volume, avg_liquidity, max_liquidity, has_liquidity] = row;
    const totalNum = Number(total);
    const volumePercentage = (Number(has_volume) / totalNum) * 100;
    const liquidityPercentage = (Number(has_liquidity) / totalNum) * 100;
    
    console.log(`\n${platform} Volume & Liquidity:`);
    console.log(`  Avg Volume: $${Number(avg_volume).toFixed(2)}`);
    console.log(`  Max Volume: $${Number(max_volume).toLocaleString()}`);
    console.log(`  Markets with Volume: ${Number(has_volume)}/${totalNum} (${volumePercentage.toFixed(1)}%)`);
    console.log(`  Avg Liquidity: $${Number(avg_liquidity).toLocaleString()}`);
    console.log(`  Max Liquidity: $${Number(max_liquidity).toLocaleString()}`);
    console.log(`  Markets with Liquidity: ${Number(has_liquidity)}/${totalNum} (${liquidityPercentage.toFixed(1)}%)`);
    
    // Validate volume coverage
    const expectedVolumePercentage = platform === 'kalshi' ? 15 : 80; // Kalshi uses liquidity proxy
    if (volumePercentage < expectedVolumePercentage) {
      results.push({
        metric: 'Volume Coverage',
        platform: String(platform),
        value: Number(volumePercentage.toFixed(1)),
        expected_range: `${expectedVolumePercentage}%+`,
        status: volumePercentage < expectedVolumePercentage - 20 ? 'FAIL' : 'WARN',
        notes: platform === 'kalshi' ? 'Kalshi uses liquidity as volume proxy' : 'Low volume data coverage'
      });
    }
    
    // Validate liquidity coverage
    const expectedLiquidityPercentage = platform === 'kalshi' ? 70 : 25;
    if (liquidityPercentage < expectedLiquidityPercentage) {
      results.push({
        metric: 'Liquidity Coverage',
        platform: String(platform),
        value: Number(liquidityPercentage.toFixed(1)),
        expected_range: `${expectedLiquidityPercentage}%+`,
        status: liquidityPercentage < expectedLiquidityPercentage - 20 ? 'FAIL' : 'WARN',
        notes: 'Low liquidity data coverage'
      });
    }
  });
}

async function validateCategories(connection: DuckDBConnection, results: ValidationResult[]): Promise<void> {
  const categoryResult = await connection.run(`
    SELECT 
      platform,
      category,
      COUNT(*) as count,
      AVG(volume) as avg_volume
    FROM raw_markets 
    GROUP BY platform, category 
    ORDER BY platform, count DESC
  `);
  const categories = await categoryResult.getRows();
  
  console.log(`\nCategory Distribution:`);
  
  const platformCategories: Record<string, Array<{category: string, count: number, avg_volume: number}>> = {};
  
  categories.forEach(row => {
    const [platform, category, count, avg_volume] = row;
    if (!platformCategories[String(platform)]) {
      platformCategories[String(platform)] = [];
    }
    platformCategories[String(platform)].push({
      category: String(category),
      count: Number(count),
      avg_volume: Number(avg_volume)
    });
  });
  
  Object.entries(platformCategories).forEach(([platform, cats]) => {
    console.log(`\n  ${platform}:`);
    
    const total = cats.reduce((sum, cat) => sum + cat.count, 0);
    const otherCount = cats.find(cat => cat.category === 'other')?.count || 0;
    const otherPercentage = (otherCount / total) * 100;
    
    cats.slice(0, 5).forEach(cat => {
      const percentage = (cat.count / total) * 100;
      console.log(`    ${cat.category}: ${cat.count.toLocaleString()} (${percentage.toFixed(1)}%) - Avg Vol: $${cat.avg_volume.toFixed(2)}`);
    });
    
    // Validate category distribution
    if (otherPercentage > 50) {
      results.push({
        metric: 'Category Classification',
        platform,
        value: Number(otherPercentage.toFixed(1)),
        expected_range: '<50%',
        status: otherPercentage > 70 ? 'FAIL' : 'WARN',
        notes: 'Too many markets categorized as "other"'
      });
    }
  });
}

async function validateCrossPlatform(connection: DuckDBConnection, results: ValidationResult[]): Promise<void> {
  const comparisonResult = await connection.run(`
    SELECT 
      'Total Markets' as metric,
      SUM(CASE WHEN platform = 'kalshi' THEN 1 ELSE 0 END) as kalshi_count,
      SUM(CASE WHEN platform = 'polymarket' THEN 1 ELSE 0 END) as polymarket_count
    FROM raw_markets
    UNION ALL
    SELECT 
      'Avg Volume',
      AVG(CASE WHEN platform = 'kalshi' THEN volume END) as kalshi_avg,
      AVG(CASE WHEN platform = 'polymarket' THEN volume END) as polymarket_avg
    FROM raw_markets
    UNION ALL
    SELECT 
      'Avg Liquidity',
      AVG(CASE WHEN platform = 'kalshi' THEN liquidity END) as kalshi_avg,
      AVG(CASE WHEN platform = 'polymarket' THEN liquidity END) as polymarket_avg
    FROM raw_markets
  `);
  const comparisons = await comparisonResult.getRows();
  
  console.log(`\nCross-Platform Comparison:`);
  
  comparisons.forEach(row => {
    const [metric, kalshi_value, polymarket_value] = row;
    console.log(`  ${metric}:`);
    console.log(`    Kalshi: ${Number(kalshi_value).toLocaleString()}`);
    console.log(`    Polymarket: ${Number(polymarket_value).toLocaleString()}`);
    
    // Check for reasonable ratios
    const ratio = Number(polymarket_value) / Number(kalshi_value);
    if (metric === 'Total Markets' && (ratio < 1.5 || ratio > 3)) {
      results.push({
        metric: 'Market Count Ratio',
        platform: 'Cross-platform',
        value: Number(ratio.toFixed(2)),
        expected_range: '1.5-3.0',
        status: 'WARN',
        notes: 'Unexpected ratio between platform market counts'
      });
    }
  });
}

function generateSummaryReport(results: ValidationResult[]): void {
  const totalChecks = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const warnings = results.filter(r => r.status === 'WARN').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  
  console.log(`Total Validation Checks: ${totalChecks}`);
  console.log(`✅ Passed: ${passed} (${(passed/totalChecks*100).toFixed(1)}%)`);
  console.log(`⚠️  Warnings: ${warnings} (${(warnings/totalChecks*100).toFixed(1)}%)`);
  console.log(`❌ Failed: ${failed} (${(failed/totalChecks*100).toFixed(1)}%)`);
  
  const overallStatus = failed > 0 ? 'NEEDS ATTENTION' : warnings > 3 ? 'REVIEW RECOMMENDED' : 'GOOD';
  console.log(`\n🎯 Overall Status: ${overallStatus}`);
  
  if (overallStatus === 'GOOD') {
    console.log(`\n🚀 Data quality looks good! Ready for Fly.io migration.`);
  } else {
    console.log(`\n🔧 Review the issues above before proceeding with migration.`);
  }
}

validateMarketData();