import { DuckDBInstance } from '@duckdb/node-api';

const instance = await DuckDBInstance.create('./data/unified-markets-complete.db');
const connection = await instance.connect();

const checkResult = await connection.run(`
  SELECT 
    platform,
    COUNT(*) as total,
    COUNT(CASE WHEN description IS NOT NULL AND LENGTH(description) > 50 THEN 1 END) as with_rich_desc
  FROM unified_markets 
  GROUP BY platform
`);
const results = await checkResult.getRows();

console.log('📊 CURRENT DESCRIPTION STATUS:');
results.forEach(([platform, total, with_desc]) => {
  console.log(`${platform}: ${Number(with_desc).toLocaleString()}/${Number(total).toLocaleString()} with descriptions`);
});

// Get a sample with description
const sampleResult = await connection.run(`
  SELECT title, description 
  FROM unified_markets 
  WHERE LENGTH(description) > 100
  LIMIT 1
`);
const sample = await sampleResult.getRows();

if (sample.length > 0) {
  console.log('\n📝 SAMPLE ENHANCED DESCRIPTION:');
  console.log(`Title: ${sample[0][0]}`);
  console.log(`Description: ${String(sample[0][1]).substring(0, 300)}...`);
}