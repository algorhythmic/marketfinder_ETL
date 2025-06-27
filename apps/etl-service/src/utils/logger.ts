// Structured logging for the ETL service
import winston from 'winston';
import { env } from './config';

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: logFormat,
  defaultMeta: { service: 'marketfinder-etl' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ],
});

// Add file logging in production
if (env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error'
  }));
  
  logger.add(new winston.transports.File({
    filename: 'logs/combined.log'
  }));
}

// ETL-specific logging helpers
export const etlLogger = {
  startRun: (runType: string, runId: string) => {
    logger.info('ETL run started', { runType, runId, timestamp: new Date().toISOString() });
  },
  
  completeRun: (runType: string, runId: string, stats: { 
    marketsProcessed: number; 
    arbitrageFound: number; 
    durationMs: number 
  }) => {
    logger.info('ETL run completed', { 
      runType, 
      runId, 
      ...stats, 
      timestamp: new Date().toISOString() 
    });
  },
  
  failRun: (runType: string, runId: string, error: Error) => {
    logger.error('ETL run failed', { 
      runType, 
      runId, 
      error: error.message, 
      stack: error.stack,
      timestamp: new Date().toISOString() 
    });
  },
  
  apiCall: (platform: string, endpoint: string, status: number, responseTime: number) => {
    logger.debug('API call completed', { 
      platform, 
      endpoint, 
      status, 
      responseTime,
      timestamp: new Date().toISOString() 
    });
  },
  
  dataQuality: (platform: string, stats: {
    totalFetched: number;
    validMarkets: number;
    invalidMarkets: number;
  }) => {
    logger.info('Data quality check', { 
      platform, 
      ...stats,
      validPercentage: (stats.validMarkets / stats.totalFetched * 100).toFixed(2),
      timestamp: new Date().toISOString() 
    });
  }
};