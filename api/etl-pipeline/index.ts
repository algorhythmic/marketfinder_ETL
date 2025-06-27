// Export all ETL pipeline functions for easy testing and reuse

export { fetchKalshiMarkets, fetchPolymarketMarkets, testFetchers } from './fetchers';
export { 
  loadRawDataIntoDuckDB, 
  transformMarketsInDuckDB, 
  detectSimilaritiesInDuckDB, 
  calculateArbitrageInDuckDB,
  testTransforms 
} from './transforms';