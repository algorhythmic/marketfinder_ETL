// Quick check of algorithm inefficiency
import { DuckDBInstance } from '@duckdb/node-api';

async function checkInefficiency() {
  const instance = await DuckDBInstance.create('./data/unified-markets-complete.db');
  const connection = await instance.connect();
  
  try {
    const result = await connection.run(`
      SELECT 
        platform,
        COUNT(*) as count
      FROM unified_markets 
      WHERE is_active = true
      GROUP BY platform
    `);
    
    const rows = await result.getRows();
    let kalshi = 0, polymarket = 0;
    
    rows.forEach(([platform, count]) => {
      console.log(`${platform}: ${Number(count).toLocaleString()}`);
      if (platform === 'kalshi') kalshi = Number(count);
      if (platform === 'polymarket') polymarket = Number(count);
    });
    
    const totalComparisons = kalshi * polymarket;
    console.log(`\n🚨 CURRENT ALGORITHM INEFFICIENCY:`);
    console.log(`   Total comparisons: ${totalComparisons.toLocaleString()}`);
    console.log(`   At 1ms per comparison: ${(totalComparisons/1000/60).toFixed(0)} minutes`);
    console.log(`   At $0.001 per LLM evaluation: $${(totalComparisons * 0.001).toLocaleString()}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await connection.close();
    await instance.close();
  }
}

checkInefficiency();