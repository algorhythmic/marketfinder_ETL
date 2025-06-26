// Health check endpoints
import { Router } from 'express';
import { checkDatabaseHealth } from '../utils/database';
import { logger } from '../utils/logger';
import { APIResponse, HealthStatus } from '../types';

export const healthRoutes = Router();

const startTime = Date.now();

// Basic health check
healthRoutes.get('/', async (req, res) => {
  try {
    const uptime = Date.now() - startTime;
    
    // Check database health
    const dbHealth = await checkDatabaseHealth();
    
    // Test external APIs (basic connectivity)
    const apiHealth = await checkExternalAPIs();
    
    // Get last ETL run info
    const lastETLRun = await getLastETLRunInfo();
    
    const status: HealthStatus = {
      status: determineOverallStatus(dbHealth.connected, apiHealth),
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(uptime / 1000),
      last_etl_run: lastETLRun,
      database: dbHealth,
      external_apis: apiHealth
    };
    
    const response: APIResponse<HealthStatus> = {
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    };
    
    res.status(status.status === 'healthy' ? 200 : 503).json(response);
    
  } catch (error) {
    logger.error('Health check failed:', error);
    
    const response: APIResponse = {
      success: false,
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    };
    
    res.status(503).json(response);
  }
});

// Detailed health check with more metrics
healthRoutes.get('/detailed', async (req, res) => {
  try {
    const uptime = Date.now() - startTime;
    const dbHealth = await checkDatabaseHealth();
    const apiHealth = await checkExternalAPIs();
    const lastETLRun = await getLastETLRunInfo();
    
    // Additional metrics
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    const detailedStatus = {
      status: determineOverallStatus(dbHealth.connected, apiHealth),
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(uptime / 1000),
      last_etl_run: lastETLRun,
      database: dbHealth,
      external_apis: apiHealth,
      system: {
        memory: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024),
          unit: 'MB'
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system
        },
        node_version: process.version,
        platform: process.platform,
        arch: process.arch
      }
    };
    
    const response: APIResponse = {
      success: true,
      data: detailedStatus,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
    
  } catch (error) {
    logger.error('Detailed health check failed:', error);
    
    const response: APIResponse = {
      success: false,
      error: 'Detailed health check failed',
      timestamp: new Date().toISOString()
    };
    
    res.status(503).json(response);
  }
});

// Liveness probe (simple)
healthRoutes.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

// Readiness probe
healthRoutes.get('/ready', async (req, res) => {
  try {
    const dbHealth = await checkDatabaseHealth();
    
    if (dbHealth.connected) {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        reason: 'database_not_connected',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      reason: 'health_check_failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Helper functions
async function checkExternalAPIs(): Promise<{
  kalshi: 'up' | 'down' | 'unknown';
  polymarket: 'up' | 'down' | 'unknown';
}> {
  const results = await Promise.allSettled([
    // Test Kalshi API
    fetch('https://api.elections.kalshi.com/trade-api/v2/markets?limit=1', {
      method: 'GET',
      headers: { 'User-Agent': 'MarketFinder-ETL/1.0' },
      signal: AbortSignal.timeout(5000) // 5 second timeout
    }),
    // Test Polymarket API  
    fetch('https://gamma-api.polymarket.com/markets?limit=1', {
      method: 'GET',
      headers: { 'User-Agent': 'MarketFinder-ETL/1.0' },
      signal: AbortSignal.timeout(5000) // 5 second timeout
    })
  ]);
  
  return {
    kalshi: results[0].status === 'fulfilled' && results[0].value.ok ? 'up' : 'down',
    polymarket: results[1].status === 'fulfilled' && results[1].value.ok ? 'up' : 'down'
  };
}

async function getLastETLRunInfo(): Promise<{
  started_at: string;
  status: string;
  markets_processed?: number;
} | undefined> {
  try {
    const { withDatabase } = await import('../utils/database');
    
    const result = await withDatabase(async (client) => {
      const query = `
        SELECT started_at, status, markets_processed 
        FROM etl_runs 
        ORDER BY started_at DESC 
        LIMIT 1
      `;
      const result = await client.query(query);
      return result.rows[0];
    });
    
    if (result) {
      return {
        started_at: result.started_at,
        status: result.status,
        markets_processed: result.markets_processed
      };
    }
    
    return undefined;
  } catch (error) {
    logger.error('Failed to get last ETL run info:', error);
    return undefined;
  }
}

function determineOverallStatus(
  dbConnected: boolean,
  apiHealth: { kalshi: string; polymarket: string }
): 'healthy' | 'degraded' | 'unhealthy' {
  if (!dbConnected) {
    return 'unhealthy';
  }
  
  const apisDown = Object.values(apiHealth).filter(status => status === 'down').length;
  
  if (apisDown === 0) {
    return 'healthy';
  } else if (apisDown === 1) {
    return 'degraded';
  } else {
    return 'unhealthy';
  }
}