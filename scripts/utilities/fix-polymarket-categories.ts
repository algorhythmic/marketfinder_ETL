// Fix Polymarket category classification with better pattern matching
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';

const DB_PATH = './data/marketfinder.db';

async function fixPolymarketCategories(): Promise<void> {
  console.log("🏷️ FIXING POLYMARKET CATEGORIES");
  console.log("=".repeat(40));
  
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;
  
  try {
    instance = await DuckDBInstance.create(DB_PATH);
    connection = await instance.connect();
    
    // First, let's examine some sample titles to understand the patterns
    console.log("\n📊 Analyzing sample Polymarket titles...");
    const sampleResult = await connection.run(`
      SELECT title, description 
      FROM raw_markets 
      WHERE platform = 'polymarket' 
      ORDER BY RANDOM() 
      LIMIT 20
    `);
    const samples = await sampleResult.getRows();
    
    console.log("Sample titles:");
    samples.forEach((row, i) => {
      const [title, description] = row;
      console.log(`  ${i+1}. "${String(title).substring(0, 60)}..."`);
    });
    
    // Use LIKE patterns instead of regex for better compatibility
    console.log("\n🔧 Applying category classifications...");
    
    const categoryMappings = [
      { 
        patterns: ['%trump%', '%biden%', '%election%', '%president%', '%senate%', '%congress%', '%democrat%', '%republican%', '%nominee%', '%nomination%', '%campaign%', '%vote%', '%poll%'], 
        category: 'politics' 
      },
      { 
        patterns: ['%bitcoin%', '%btc%', '%ethereum%', '%eth%', '%crypto%', '%blockchain%', '%token%', '%coin%', '%defi%'], 
        category: 'crypto' 
      },
      { 
        patterns: ['%nfl%', '%nba%', '%mlb%', '%nhl%', '%soccer%', '%football%', '%basketball%', '%baseball%', '%hockey%', '%sport%', '%championship%', '%world cup%', '%olympics%', '%game%', '%match%', '%team%'], 
        category: 'sports' 
      },
      { 
        patterns: ['%ai%', '%artificial intelligence%', '%openai%', '%chatgpt%', '%tech%', '%technology%', '%apple%', '%google%', '%microsoft%', '%tesla%', '%meta%', '%amazon%'], 
        category: 'technology' 
      },
      { 
        patterns: ['%economy%', '%economic%', '%gdp%', '%inflation%', '%recession%', '%fed%', '%federal reserve%', '%stock%', '%market%', '%dow%', '%nasdaq%', '%s&p%'], 
        category: 'economics' 
      },
      { 
        patterns: ['%climate%', '%temperature%', '%weather%', '%global warming%', '%carbon%', '%emission%', '%environment%'], 
        category: 'climate' 
      },
      { 
        patterns: ['%health%', '%medicine%', '%covid%', '%pandemic%', '%disease%', '%vaccine%', '%medical%', '%hospital%', '%drug%'], 
        category: 'health' 
      },
      { 
        patterns: ['%movie%', '%film%', '%music%', '%celebrity%', '%entertainment%', '%oscar%', '%grammy%', '%tv%', '%show%', '%series%'], 
        category: 'culture' 
      }
    ];
    
    let totalUpdated = 0;
    
    for (const mapping of categoryMappings) {
      // Build a WHERE clause with multiple LIKE conditions
      const likeConditions = mapping.patterns.map(pattern => 
        `LOWER(title) LIKE '${pattern}' OR LOWER(description) LIKE '${pattern}'`
      ).join(' OR ');
      
      const query = `
        UPDATE raw_markets 
        SET category = '${mapping.category}'
        WHERE platform = 'polymarket' 
          AND category = 'other'
          AND (${likeConditions})
      `;
      
      await connection.run(query);
      
      // Count how many were updated
      const countResult = await connection.run(`
        SELECT COUNT(*) as count 
        FROM raw_markets 
        WHERE platform = 'polymarket' 
          AND category = '${mapping.category}'
      `);
      const count = await countResult.getRows();
      const categoryCount = Number(count[0][0]);
      
      console.log(`   ✅ Categorized ${categoryCount} markets as '${mapping.category}'`);
      totalUpdated += categoryCount;
    }
    
    console.log(`\n📊 Total Polymarket markets recategorized: ${totalUpdated}`);
    
    // Show updated distribution
    console.log("\n📈 Updated category distribution:");
    const distributionResult = await connection.run(`
      SELECT category, COUNT(*) as count
      FROM raw_markets 
      WHERE platform = 'polymarket'
      GROUP BY category 
      ORDER BY count DESC
    `);
    const distribution = await distributionResult.getRows();
    
    const total = distribution.reduce((sum, row) => sum + Number(row[1]), 0);
    distribution.forEach(row => {
      const [category, count] = row;
      const percentage = (Number(count) / total * 100).toFixed(1);
      console.log(`  ${category}: ${Number(count).toLocaleString()} (${percentage}%)`);
    });
    
    // Show some examples of categorized markets
    console.log("\n📋 Examples of categorized markets:");
    for (const mapping of categoryMappings.slice(0, 4)) { // Show first 4 categories
      const exampleResult = await connection.run(`
        SELECT title 
        FROM raw_markets 
        WHERE platform = 'polymarket' 
          AND category = '${mapping.category}'
        LIMIT 3
      `);
      const examples = await exampleResult.getRows();
      
      if (examples.length > 0) {
        console.log(`\n  ${mapping.category}:`);
        examples.forEach(row => {
          console.log(`    - "${String(row[0]).substring(0, 80)}..."`);
        });
      }
    }
    
    console.log("\n🎉 Polymarket category classification completed!");
    
  } catch (error) {
    console.error("❌ Category fix failed:", error instanceof Error ? error.message : String(error));
  } finally {
    // Resources auto-cleanup
  }
}

fixPolymarketCategories();