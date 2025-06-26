// Main server for the ETL service
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cron from 'node-cron';
import { config, env, validateConfig } from './utils/config';
import { logger } from './utils/logger';
import { initializeDatabase, closeDatabasePool } from './utils/database';
import { runFullETL, runIncrementalETL } from './etl/pipeline';

// API route handlers
import { dataRoutes } from './api/data';
import { healthRoutes } from './api/health';
import { arbitrageRoutes } from './api/arbitrage';

async function startServer() {
  try {
    // Validate configuration
    validateConfig();
    
    // Initialize database
    await initializeDatabase();
    
    // Create Express app
    const app = express();
    
    // Security middleware
    app.use(helmet());
    app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
      credentials: true
    }));
    
    // Body parsing middleware
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));
    
    // Request logging middleware
    app.use((req, res, next) => {
      logger.info('HTTP Request', {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
      next();
    });
    
    // Mount API routes
    app.use('/health', healthRoutes);
    app.use('/api/data', dataRoutes);
    app.use('/api/arbitrage', arbitrageRoutes);
    
    // Root endpoint
    app.get('/', (req, res) => {
      res.json({
        service: 'MarketFinder ETL Service',
        version: '1.0.0',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        endpoints: {
          health: '/health',
          data: '/api/data',
          arbitrage: '/api/arbitrage'
        }
      });
    });
    
    // Error handling middleware
    app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Express error:', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
      });
      
      res.status(500).json({
        success: false,
        error: env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
        timestamp: new Date().toISOString()
      });
    });
    
    // 404 handler
    app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        timestamp: new Date().toISOString()
      });
    });
    
    // Setup ETL cron jobs
    if (env.NODE_ENV === 'production') {
      logger.info('Setting up ETL cron jobs...', {
        fullETL: config.full_etl_schedule,
        incrementalETL: config.incremental_etl_schedule
      });
      
      // Full ETL every 6 hours
      cron.schedule(config.full_etl_schedule, async () => {
        logger.info('Starting scheduled full ETL run');
        try {
          await runFullETL();
          logger.info('Scheduled full ETL run completed');
        } catch (error) {
          logger.error('Scheduled full ETL run failed:', error);
        }
      });
      
      // Incremental ETL every 30 minutes
      cron.schedule(config.incremental_etl_schedule, async () => {
        logger.info('Starting scheduled incremental ETL run');
        try {
          await runIncrementalETL();
          logger.info('Scheduled incremental ETL run completed');
        } catch (error) {
          logger.error('Scheduled incremental ETL run failed:', error);
        }
      });
    } else {
      logger.info('Development mode: ETL cron jobs disabled');
    }
    
    // Start HTTP server
    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 ETL Service started`, {
        port: env.PORT,
        environment: env.NODE_ENV,
        pid: process.pid
      });
    });
    
    // Graceful shutdown handling
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, starting graceful shutdown...');
      
      server.close(async () => {
        logger.info('HTTP server closed');
        await closeDatabasePool();
        process.exit(0);
      });
    });
    
    process.on('SIGINT', async () => {
      logger.info('SIGINT received, starting graceful shutdown...');
      
      server.close(async () => {
        logger.info('HTTP server closed');
        await closeDatabasePool();
        process.exit(0);
      });
    });
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      process.exit(1);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection:', { reason, promise });
      process.exit(1);
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();