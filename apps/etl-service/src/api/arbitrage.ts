// Arbitrage opportunities API endpoints
import { Router } from 'express';
import { withDatabase } from '../utils/database';
import { logger } from '../utils/logger';
import { APIResponse, ArbitrageOpportunity } from '../types';

export const arbitrageRoutes = Router();

// Get all arbitrage opportunities (with pagination and filtering)
arbitrageRoutes.get('/', async (req, res) => {
  try {
    const {
      min_profit = '0.05',
      min_similarity = '0.7',
      active = 'true',
      limit = '50',
      offset = '0',
      sort = 'profit_potential',
      order = 'DESC'
    } = req.query;
    
    const limitNum = Math.min(parseInt(limit as string) || 50, 500); // Max 500
    const offsetNum = parseInt(offset as string) || 0;
    const minProfit = parseFloat(min_profit as string) || 0.05;
    const minSimilarity = parseFloat(min_similarity as string) || 0.7;
    
    const result = await withDatabase(async (client) => {
      let whereConditions = [
        `profit_potential >= $1`,
        `similarity_score >= $2`
      ];
      let queryParams = [minProfit, minSimilarity];
      let paramIndex = 3;
      
      if (active === 'true') {
        whereConditions.push(`is_active = true`);
      }
      
      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
      
      // Validate sort column
      const validSortColumns = ['profit_potential', 'similarity_score', 'detected_at', 'price_difference'];
      const sortColumn = validSortColumns.includes(sort as string) ? sort : 'profit_potential';
      const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';
      
      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total 
        FROM arbitrage_opportunities 
        ${whereClause}
      `;
      const countResult = await client.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].total);
      
      // Get paginated data
      const dataQuery = `
        SELECT id, market_a_id, market_b_id, market_a_platform, market_b_platform,
               market_a_title, market_b_title, similarity_score, price_difference,
               profit_potential, detected_at, is_active
        FROM arbitrage_opportunities 
        ${whereClause}
        ORDER BY ${sortColumn} ${sortOrder}
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      queryParams.push(limitNum, offsetNum);
      
      const dataResult = await client.query(dataQuery, queryParams);
      
      return {
        opportunities: dataResult.rows,
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
      data: result.opportunities,
      count: result.opportunities.length,
      timestamp: new Date().toISOString(),
      pagination: result.pagination
    };
    
    res.json(response);
    
  } catch (error) {
    logger.error('Failed to fetch arbitrage opportunities:', error);
    
    const response: APIResponse = {
      success: false,
      error: 'Failed to fetch arbitrage opportunities',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

// Get top arbitrage opportunities
arbitrageRoutes.get('/top', async (req, res) => {
  try {
    const { limit = '10' } = req.query;
    const limitNum = Math.min(parseInt(limit as string) || 10, 50);
    
    const opportunities = await withDatabase(async (client) => {
      const query = `
        SELECT ao.id, ao.market_a_id, ao.market_b_id, 
               ao.market_a_platform, ao.market_b_platform,
               ao.market_a_title, ao.market_b_title, 
               ao.similarity_score, ao.price_difference, ao.profit_potential,
               ao.detected_at, ao.is_active,
               ma.yes_price as market_a_yes_price,
               ma.no_price as market_a_no_price,
               mb.yes_price as market_b_yes_price,
               mb.no_price as market_b_no_price
        FROM arbitrage_opportunities ao
        JOIN processed_markets ma ON ao.market_a_id = ma.id
        JOIN processed_markets mb ON ao.market_b_id = mb.id
        WHERE ao.is_active = true 
          AND ma.is_active = true 
          AND mb.is_active = true
          AND ao.profit_potential >= 0.05
        ORDER BY ao.profit_potential DESC
        LIMIT $1
      `;
      
      const result = await client.query(query, [limitNum]);
      return result.rows;
    });
    
    const response: APIResponse = {
      success: true,
      data: opportunities,
      count: opportunities.length,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
    
  } catch (error) {
    logger.error('Failed to fetch top arbitrage opportunities:', error);
    
    const response: APIResponse = {
      success: false,
      error: 'Failed to fetch top arbitrage opportunities',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

// Get arbitrage opportunity by ID
arbitrageRoutes.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const opportunity = await withDatabase(async (client) => {
      const query = `
        SELECT ao.*, 
               ma.title as market_a_full_title,
               ma.description as market_a_description,
               ma.yes_price as market_a_yes_price,
               ma.no_price as market_a_no_price,
               ma.volume as market_a_volume,
               ma.liquidity as market_a_liquidity,
               mb.title as market_b_full_title,
               mb.description as market_b_description,
               mb.yes_price as market_b_yes_price,
               mb.no_price as market_b_no_price,
               mb.volume as market_b_volume,
               mb.liquidity as market_b_liquidity
        FROM arbitrage_opportunities ao
        JOIN processed_markets ma ON ao.market_a_id = ma.id
        JOIN processed_markets mb ON ao.market_b_id = mb.id
        WHERE ao.id = $1
      `;
      
      const result = await client.query(query, [id]);
      return result.rows[0];
    });
    
    if (!opportunity) {
      const response: APIResponse = {
        success: false,
        error: 'Arbitrage opportunity not found',
        timestamp: new Date().toISOString()
      };
      return res.status(404).json(response);
    }
    
    const response: APIResponse = {
      success: true,
      data: opportunity,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
    
  } catch (error) {
    logger.error('Failed to fetch arbitrage opportunity:', error);
    
    const response: APIResponse = {
      success: false,
      error: 'Failed to fetch arbitrage opportunity',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

// Get arbitrage statistics
arbitrageRoutes.get('/stats', async (req, res) => {
  try {
    const stats = await withDatabase(async (client) => {
      // Overall arbitrage stats
      const overallQuery = `
        SELECT 
          COUNT(*) as total_opportunities,
          COUNT(CASE WHEN is_active THEN 1 END) as active_opportunities,
          AVG(profit_potential) as avg_profit_potential,
          MAX(profit_potential) as max_profit_potential,
          AVG(similarity_score) as avg_similarity_score,
          COUNT(CASE WHEN profit_potential >= 0.1 THEN 1 END) as high_profit_count
        FROM arbitrage_opportunities
      `;
      const overallResult = await client.query(overallQuery);
      
      // Platform pair stats
      const platformPairQuery = `
        SELECT 
          market_a_platform,
          market_b_platform,
          COUNT(*) as opportunity_count,
          AVG(profit_potential) as avg_profit
        FROM arbitrage_opportunities 
        WHERE is_active = true
        GROUP BY market_a_platform, market_b_platform
        ORDER BY opportunity_count DESC
      `;
      const platformPairResult = await client.query(platformPairQuery);
      
      // Recent opportunities
      const recentQuery = `
        SELECT 
          DATE_TRUNC('hour', detected_at) as hour,
          COUNT(*) as opportunities_detected
        FROM arbitrage_opportunities 
        WHERE detected_at > NOW() - INTERVAL '24 hours'
        GROUP BY DATE_TRUNC('hour', detected_at)
        ORDER BY hour DESC
      `;
      const recentResult = await client.query(recentQuery);
      
      return {
        overall: overallResult.rows[0],
        by_platform_pair: platformPairResult.rows,
        recent_activity: recentResult.rows
      };
    });
    
    const response: APIResponse = {
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
    
  } catch (error) {
    logger.error('Failed to fetch arbitrage stats:', error);
    
    const response: APIResponse = {
      success: false,
      error: 'Failed to fetch arbitrage statistics',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

// Get latest arbitrage opportunities (for Vercel sync)
arbitrageRoutes.get('/latest', async (req, res) => {
  try {
    const { 
      since,
      limit = '100'
    } = req.query;
    
    const limitNum = Math.min(parseInt(limit as string) || 100, 1000);
    
    const opportunities = await withDatabase(async (client) => {
      let whereClause = 'WHERE is_active = true';
      let queryParams = [];
      
      if (since) {
        whereClause += ' AND detected_at > $1';
        queryParams.push(since);
      }
      
      const query = `
        SELECT id, market_a_id, market_b_id, market_a_platform, market_b_platform,
               market_a_title, market_b_title, similarity_score, price_difference,
               profit_potential, detected_at, is_active
        FROM arbitrage_opportunities 
        ${whereClause}
        ORDER BY detected_at DESC
        LIMIT ${limitNum}
      `;
      
      const result = await client.query(query, queryParams);
      return result.rows;
    });
    
    const response: APIResponse = {
      success: true,
      data: opportunities,
      count: opportunities.length,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
    
  } catch (error) {
    logger.error('Failed to fetch latest arbitrage opportunities:', error);
    
    const response: APIResponse = {
      success: false,
      error: 'Failed to fetch latest arbitrage opportunities',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});