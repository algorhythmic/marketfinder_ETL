// Data API endpoints for serving processed market data
import { Router } from 'express';
import { withDatabase } from '../utils/database';
import { logger } from '../utils/logger';
import { APIResponse, ProcessedMarket } from '../types';

export const dataRoutes = Router();

// Get all markets (with pagination and filtering)
dataRoutes.get('/markets', async (req, res) => {
  try {
    const {
      platform,
      category,
      active = 'true',
      limit = '100',
      offset = '0',
      sort = 'processed_at',
      order = 'DESC'
    } = req.query;
    
    const limitNum = Math.min(parseInt(limit as string) || 100, 1000); // Max 1000
    const offsetNum = parseInt(offset as string) || 0;
    
    const result = await withDatabase(async (client) => {
      let whereConditions = [];
      let queryParams = [];
      let paramIndex = 1;
      
      // Build WHERE conditions
      if (platform) {
        whereConditions.push(`platform = $${paramIndex++}`);
        queryParams.push(platform);
      }
      
      if (category) {
        whereConditions.push(`category = $${paramIndex++}`);
        queryParams.push(category);
      }
      
      if (active === 'true') {
        whereConditions.push(`is_active = true`);
      }
      
      const whereClause = whereConditions.length > 0 ? 
        `WHERE ${whereConditions.join(' AND ')}` : '';
      
      // Validate sort column
      const validSortColumns = ['processed_at', 'title', 'platform', 'category', 'volume', 'liquidity'];
      const sortColumn = validSortColumns.includes(sort as string) ? sort : 'processed_at';
      const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';
      
      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total 
        FROM processed_markets 
        ${whereClause}
      `;
      const countResult = await client.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].total);
      
      // Get paginated data
      const dataQuery = `
        SELECT id, platform, external_id, title, description, category,
               yes_price, no_price, volume, liquidity, end_date, start_date,
               is_active, processed_at
        FROM processed_markets 
        ${whereClause}
        ORDER BY ${sortColumn} ${sortOrder}
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      queryParams.push(limitNum, offsetNum);
      
      const dataResult = await client.query(dataQuery, queryParams);
      
      return {
        markets: dataResult.rows,
        pagination: {
          total,
          limit: limitNum,
          offset: offsetNum,
          has_more: offsetNum + limitNum < total
        }
      };
    });
    
    const response: APIResponse = {
      success: true,
      data: result.markets,
      count: result.markets.length,
      timestamp: new Date().toISOString(),
      ...result.pagination && { pagination: result.pagination }
    };
    
    res.json(response);
    
  } catch (error) {
    logger.error('Failed to fetch markets:', error);
    
    const response: APIResponse = {
      success: false,
      error: 'Failed to fetch markets',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

// Get market by ID
dataRoutes.get('/markets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const market = await withDatabase(async (client) => {
      const query = `
        SELECT id, platform, external_id, title, description, category,
               yes_price, no_price, volume, liquidity, end_date, start_date,
               is_active, processed_at, raw_data
        FROM processed_markets 
        WHERE id = $1
      `;
      const result = await client.query(query, [id]);
      return result.rows[0];
    });
    
    if (!market) {
      const response: APIResponse = {
        success: false,
        error: 'Market not found',
        timestamp: new Date().toISOString()
      };
      return res.status(404).json(response);
    }
    
    const response: APIResponse = {
      success: true,
      data: market,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
    
  } catch (error) {
    logger.error('Failed to fetch market:', error);
    
    const response: APIResponse = {
      success: false,
      error: 'Failed to fetch market',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

// Get market statistics
dataRoutes.get('/stats', async (req, res) => {
  try {
    const stats = await withDatabase(async (client) => {
      // Platform stats
      const platformStatsQuery = `
        SELECT 
          platform,
          COUNT(*) as total_markets,
          COUNT(CASE WHEN is_active THEN 1 END) as active_markets,
          AVG(volume) as avg_volume,
          AVG(liquidity) as avg_liquidity,
          COUNT(DISTINCT category) as categories
        FROM processed_markets 
        GROUP BY platform
      `;
      const platformResult = await client.query(platformStatsQuery);
      
      // Category stats
      const categoryStatsQuery = `
        SELECT 
          category,
          COUNT(*) as market_count,
          AVG(volume) as avg_volume
        FROM processed_markets 
        WHERE is_active = true
        GROUP BY category 
        ORDER BY market_count DESC
      `;
      const categoryResult = await client.query(categoryStatsQuery);
      
      // Overall stats
      const overallStatsQuery = `
        SELECT 
          COUNT(*) as total_markets,
          COUNT(CASE WHEN is_active THEN 1 END) as active_markets,
          COUNT(DISTINCT platform) as platforms,
          COUNT(DISTINCT category) as categories,
          MAX(processed_at) as last_update
        FROM processed_markets
      `;
      const overallResult = await client.query(overallStatsQuery);
      
      return {
        overall: overallResult.rows[0],
        by_platform: platformResult.rows,
        by_category: categoryResult.rows
      };
    });
    
    const response: APIResponse = {
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
    
  } catch (error) {
    logger.error('Failed to fetch stats:', error);
    
    const response: APIResponse = {
      success: false,
      error: 'Failed to fetch statistics',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

// Get latest processed data (for Vercel sync)
dataRoutes.get('/latest', async (req, res) => {
  try {
    const { 
      since,
      limit = '1000'
    } = req.query;
    
    const limitNum = Math.min(parseInt(limit as string) || 1000, 5000);
    
    const result = await withDatabase(async (client) => {
      let whereClause = 'WHERE is_active = true';
      let queryParams = [];
      
      if (since) {
        whereClause += ' AND processed_at > $1';
        queryParams.push(since);
      }
      
      const marketsQuery = `
        SELECT id, platform, external_id, title, description, category,
               yes_price, no_price, volume, liquidity, end_date, start_date,
               is_active, processed_at
        FROM processed_markets 
        ${whereClause}
        ORDER BY processed_at DESC
        LIMIT ${limitNum}
      `;
      
      const marketsResult = await client.query(marketsQuery, queryParams);
      
      return {
        markets: marketsResult.rows,
        count: marketsResult.rows.length,
        timestamp: new Date().toISOString()
      };
    });
    
    const response: APIResponse = {
      success: true,
      data: result,
      count: result.count,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
    
  } catch (error) {
    logger.error('Failed to fetch latest data:', error);
    
    const response: APIResponse = {
      success: false,
      error: 'Failed to fetch latest data',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});