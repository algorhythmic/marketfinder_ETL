# Deployment Strategy: ETL Service Infrastructure

## 🎯 Overview

This document outlines the deployment strategy for the MarketFinder ETL service, focusing on cost-effective, reliable infrastructure that can handle 50K+ markets and 161M+ potential comparisons efficiently.

---

## 🏗️ Infrastructure Requirements

### Performance Requirements

| Metric | Target | Rationale |
|--------|--------|-----------|
| **Processing Time** | <5 minutes full ETL | 1350x faster than current 45 hours |
| **Memory Usage** | 4-8GB RAM | Handle DuckDB + ML models + LLM batching |
| **Storage** | 50-100GB SSD | Raw data, models, logs, cache |
| **Network** | 100Mbps+ | API calls to Kalshi/Polymarket/LLM |
| **Uptime** | 99.5%+ | Business-critical arbitrage detection |
| **Cost** | <$30/month | 99%+ reduction from $1,630 theoretical |

### Workload Characteristics

**CPU-Intensive Tasks**:
- DuckDB analytical queries
- ML model inference
- Text similarity calculations
- Data transformation pipelines

**Memory-Intensive Tasks**:
- In-memory market comparison matrices
- Vector embeddings storage
- LLM batch processing
- Market data caching

**I/O-Intensive Tasks**:
- API data fetching (Kalshi, Polymarket)
- LLM API calls (OpenAI, Anthropic)
- Database read/write operations
- Log file management

---

## 🚀 Recommended Platform: Fly.io

### Why Fly.io?

**Cost Efficiency**:
- Predictable pricing: $15-25/month for required specs
- No surprise charges or complex billing
- Resource-based pricing, not request-based

**Performance**:
- Global edge deployment
- Persistent volumes for data
- Fast NVMe SSD storage
- Excellent network performance

**Developer Experience**:
- Simple deployment with `fly deploy`
- Built-in PostgreSQL database
- Integrated monitoring and logging
- Easy scaling and updates

**Reliability**:
- Built-in health checks
- Automatic failover
- Multi-region deployment option
- 99.9% uptime SLA

### Fly.io Configuration

```toml
# fly.toml
app = "marketfinder-etl"
primary_region = "ord" # Chicago - central US

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "3000"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

  [http_service.concurrency]
    type = "requests"
    hard_limit = 50
    soft_limit = 25

[[services]]
  protocol = "tcp"
  internal_port = 3000

  [[services.ports]]
    port = 80
    handlers = ["http"]
    force_https = true

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [services.concurrency]
    type = "requests"
    hard_limit = 50
    soft_limit = 25

# VM Resources
[vm]
  cpu_kind = "shared"
  cpus = 2
  memory_mb = 4096

# Persistent storage for data, models, logs
[mounts]
  source = "marketfinder_data"
  destination = "/app/data"

# Health checks
[checks]
  [checks.health]
    grace_period = "30s"
    interval = "15s"
    method = "get"
    path = "/api/health"
    port = 3000
    protocol = "http"
    restart_limit = 5
    timeout = "10s"

# Secrets (set via fly secrets)
# FLY_API_TOKEN (automatic)
# DATABASE_URL (from fly postgres)
# KALSHI_API_KEY
# POLYMARKET_API_KEY  
# OPENAI_API_KEY
# ETL_API_SECRET
```

### Docker Configuration

```dockerfile
# Dockerfile
FROM node:18-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite \
    postgresql-client

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/
COPY scripts/ ./scripts/

# Build TypeScript
RUN npm run build

# Create data directory
RUN mkdir -p /app/data/{cache,logs,models}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 && \
    chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

CMD ["npm", "start"]
```

### Database Setup

```bash
# Create PostgreSQL database
fly postgres create marketfinder-db --region ord --initial-cluster-size 1

# Connect database to app
fly postgres attach marketfinder-db

# Create volume for persistent data
fly volumes create marketfinder_data --region ord --size 50

# Set secrets
fly secrets set \
  KALSHI_API_KEY="your_kalshi_key" \
  POLYMARKET_API_KEY="your_polymarket_key" \
  OPENAI_API_KEY="your_openai_key" \
  ETL_API_SECRET="your_secret_key"
```

---

## 🏢 Alternative Platform: AWS

### AWS Architecture (If Fly.io Not Suitable)

**Compute**: ECS Fargate
- 2 vCPU, 4GB RAM
- No server management
- Auto-scaling based on CPU/memory
- Cost: ~$30-40/month

**Storage**: 
- EFS for persistent data (50GB)
- S3 for backups and static assets
- CloudWatch Logs for logging

**Database**: RDS PostgreSQL
- db.t3.micro instance
- 20GB storage
- Cost: ~$15-20/month

**Total AWS Cost**: ~$50-70/month

```yaml
# docker-compose.yml for AWS ECS
version: '3.8'

services:
  etl-service:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - KALSHI_API_KEY=${KALSHI_API_KEY}
      - POLYMARKET_API_KEY=${POLYMARKET_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    volumes:
      - etl-data:/app/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

volumes:
  etl-data:
    driver: aws
    driver_opts:
      type: efs
```

---

## 📦 Deployment Pipeline

### Automated Deployment (GitHub Actions)

```yaml
# .github/workflows/deploy-etl.yml
name: Deploy ETL Service

on:
  push:
    branches: [main]
    paths: ['apps/etl-service/**']
  
  pull_request:
    branches: [main]
    paths: ['apps/etl-service/**']

env:
  FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: 'apps/etl-service/package-lock.json'
      
      - name: Install dependencies
        run: |
          cd apps/etl-service
          npm ci
      
      - name: Run tests
        run: |
          cd apps/etl-service
          npm test
      
      - name: Type check
        run: |
          cd apps/etl-service
          npm run type-check
      
      - name: Lint
        run: |
          cd apps/etl-service
          npm run lint

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v3
      
      - uses: superfly/flyctl-actions/setup-flyctl@master
      
      - name: Deploy to Fly.io
        run: |
          cd apps/etl-service
          flyctl deploy --remote-only
      
      - name: Verify deployment
        run: |
          sleep 30
          curl -f https://marketfinder-etl.fly.dev/api/health
      
      - name: Notify team
        if: failure()
        uses: 8398a7/action-slack@v3
        with:
          status: failure
          channel: '#engineering'
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

### Manual Deployment Steps

```bash
# 1. Clone repository
git clone https://github.com/your-org/marketfinder-etl.git
cd marketfinder-etl

# 2. Install Fly.io CLI
curl -L https://fly.io/install.sh | sh

# 3. Login to Fly.io
fly auth login

# 4. Initialize app (first time only)
fly launch --name marketfinder-etl --region ord

# 5. Set secrets
fly secrets set \
  KALSHI_API_KEY="your_kalshi_key" \
  POLYMARKET_API_KEY="your_polymarket_key" \
  OPENAI_API_KEY="your_openai_key" \
  ETL_API_SECRET="your_secret_key"

# 6. Deploy
fly deploy

# 7. Verify deployment
curl https://marketfinder-etl.fly.dev/api/health
```

---

## 🔧 Production Configuration

### Environment Setup

```typescript
// src/config/environment.ts
export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database
  databaseUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.REDIS_URL,
  
  // External APIs
  kalshiApiKey: process.env.KALSHI_API_KEY!,
  kalshiPrivateKey: process.env.KALSHI_PRIVATE_KEY!,
  polymarketApiKey: process.env.POLYMARKET_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY!,
  
  // ETL Configuration
  etlApiSecret: process.env.ETL_API_SECRET!,
  maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '10'),
  rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '1000'),
  
  // LLM Configuration
  llmProvider: process.env.LLM_PROVIDER || 'openai',
  llmModel: process.env.LLM_MODEL || 'gpt-4',
  llmMaxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4000'),
  llmTemperature: parseFloat(process.env.LLM_TEMPERATURE || '0.1'),
  
  // Monitoring
  sentryDsn: process.env.SENTRY_DSN,
  logLevel: process.env.LOG_LEVEL || 'info',
};

// Validate required environment variables
const requiredVars = [
  'DATABASE_URL',
  'KALSHI_API_KEY', 
  'KALSHI_PRIVATE_KEY',
  'OPENAI_API_KEY',
  'ETL_API_SECRET'
];

for (const varName of requiredVars) {
  if (!process.env[varName]) {
    throw new Error(`Required environment variable ${varName} is not set`);
  }
}
```

### Logging Configuration

```typescript
// src/utils/logger.ts
import winston from 'winston';
import { config } from '../config/environment';

const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { 
    service: 'marketfinder-etl',
    version: process.env.npm_package_version 
  },
  transports: [
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    
    // File logging
    new winston.transports.File({ 
      filename: '/app/data/logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({ 
      filename: '/app/data/logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

export { logger };
```

### Health Check Implementation

```typescript
// src/api/routes/health.ts
import { Router } from 'express';
import { logger } from '../../utils/logger';
import { DatabaseManager } from '../../database/DatabaseManager';
import { checkExternalServices } from '../../utils/healthChecks';

const router = Router();

router.get('/health', async (req, res) => {
  const startTime = Date.now();
  const health = {
    status: 'healthy' as 'healthy' | 'degraded' | 'down',
    uptime: process.uptime(),
    version: process.env.npm_package_version || 'unknown',
    timestamp: new Date().toISOString(),
    checks: {},
  };

  try {
    // Database check
    const dbStart = Date.now();
    const dbManager = new DatabaseManager();
    await dbManager.healthCheck();
    health.checks.database = {
      status: 'healthy',
      responseTime: Date.now() - dbStart,
    };

    // External services check
    const servicesStart = Date.now();
    const serviceStatuses = await checkExternalServices();
    health.checks.services = {
      status: 'healthy',
      responseTime: Date.now() - servicesStart,
      details: serviceStatuses,
    };

    // Memory check
    const memUsage = process.memoryUsage();
    health.checks.memory = {
      status: memUsage.heapUsed < 3 * 1024 * 1024 * 1024 ? 'healthy' : 'degraded', // 3GB limit
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
    };

    // Determine overall status
    const checkStatuses = Object.values(health.checks).map(check => check.status);
    if (checkStatuses.includes('down')) {
      health.status = 'down';
    } else if (checkStatuses.includes('degraded')) {
      health.status = 'degraded';
    }

    const responseTime = Date.now() - startTime;
    logger.info('Health check completed', { 
      status: health.status, 
      responseTime,
    });

    res.status(health.status === 'healthy' ? 200 : 503).json({
      success: true,
      data: health,
    });

  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    
    health.status = 'down';
    health.checks.error = {
      status: 'down',
      message: error.message,
    };

    res.status(503).json({
      success: false,
      data: health,
    });
  }
});

export { router as healthRouter };
```

---

## 📊 Monitoring & Observability

### Application Monitoring

```typescript
// src/middleware/monitoring.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Request logging middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    });
  });
  
  next();
};

// Error tracking middleware
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    body: req.body,
  });
  
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An internal server error occurred',
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
};

// Performance monitoring
export const performanceMonitor = {
  trackETLRun: (runId: string, startTime: number, endTime: number, metrics: any) => {
    const duration = endTime - startTime;
    logger.info('ETL Run Completed', {
      runId,
      duration,
      marketsProcessed: metrics.marketsProcessed,
      opportunitiesFound: metrics.opportunitiesFound,
      efficiency: metrics.opportunitiesFound / metrics.marketsProcessed,
    });
  },
  
  trackLLMUsage: (provider: string, model: string, tokens: number, cost: number) => {
    logger.info('LLM Usage', {
      provider,
      model,
      tokens,
      cost,
      costPerToken: cost / tokens,
    });
  },
};
```

### Alerting Configuration

```typescript
// src/utils/alerting.ts
import { logger } from './logger';

interface AlertConfig {
  level: 'info' | 'warn' | 'error' | 'critical';
  message: string;
  metadata?: any;
}

export class AlertManager {
  async sendAlert(config: AlertConfig) {
    logger.log(config.level, 'Alert triggered', {
      alert: config.message,
      metadata: config.metadata,
      timestamp: new Date().toISOString(),
    });

    // In production, integrate with:
    // - Slack webhook
    // - PagerDuty
    // - Email notifications
    // - SMS alerts for critical issues
    
    if (config.level === 'critical') {
      // Immediate notification for critical issues
      await this.sendCriticalAlert(config);
    }
  }

  private async sendCriticalAlert(config: AlertConfig) {
    // Critical alert logic
    console.error('🚨 CRITICAL ALERT:', config.message);
  }
}

// Usage throughout the application
export const alertManager = new AlertManager();

// Example alert triggers
export const monitoringChecks = {
  checkETLPerformance: (duration: number, expectedDuration: number) => {
    if (duration > expectedDuration * 2) {
      alertManager.sendAlert({
        level: 'warn',
        message: 'ETL pipeline running slower than expected',
        metadata: { duration, expectedDuration },
      });
    }
  },
  
  checkAPIHealth: (successRate: number, errorRate: number) => {
    if (successRate < 0.95 || errorRate > 0.05) {
      alertManager.sendAlert({
        level: 'error',
        message: 'API performance degraded',
        metadata: { successRate, errorRate },
      });
    }
  },
  
  checkResourceUsage: (memoryUsage: number, cpuUsage: number) => {
    if (memoryUsage > 0.9 || cpuUsage > 0.9) {
      alertManager.sendAlert({
        level: 'critical',
        message: 'High resource usage detected',
        metadata: { memoryUsage, cpuUsage },
      });
    }
  },
};
```

---

## 🔐 Security Configuration

### API Security

```typescript
// src/middleware/security.ts
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import { config } from '../config/environment';

// Rate limiting
export const rateLimiter = rateLimit({
  windowMs: config.rateLimitWindow,
  max: config.rateLimitMax,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// API key authentication
export const authenticateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'MISSING_API_KEY',
        message: 'API key required',
      },
    });
  }
  
  const apiKey = authHeader.substring(7);
  
  if (apiKey !== config.etlApiSecret) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid API key',
      },
    });
  }
  
  next();
};

// CORS configuration
export const corsOptions = {
  origin: [
    'https://marketfinder.app',
    'https://marketfinder-staging.vercel.app',
    ...(config.nodeEnv === 'development' ? ['http://localhost:3000'] : []),
  ],
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Security headers
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});
```

### Environment Security

```bash
# Production security checklist

# 1. Rotate API keys regularly (every 90 days)
fly secrets set KALSHI_API_KEY="new_key"

# 2. Use strong, unique secrets
fly secrets set ETL_API_SECRET="$(openssl rand -base64 32)"

# 3. Enable HTTPS only
# (handled by Fly.io automatically)

# 4. Regular security updates
npm audit
npm update

# 5. Monitor access logs
fly logs --app marketfinder-etl

# 6. Database security
# - Use read-only replicas for analytics
# - Enable SSL connections
# - Regular backups
```

---

## 📈 Scaling Strategy

### Vertical Scaling (Fly.io)

```bash
# Scale up for increased load
fly scale vm shared-cpu-2x --memory 8192

# Scale down during low usage
fly scale vm shared-cpu-1x --memory 4096

# Monitor resource usage
fly status
fly metrics
```

### Horizontal Scaling (Multiple Instances)

```toml
# fly.toml - Multi-instance configuration
[vm]
  cpu_kind = "shared"
  cpus = 2
  memory_mb = 4096

[autoscaling]
  min_machines_running = 1
  max_machines_running = 3

[scaling]
  min_machines_running = 1
  max_machines_running = 3
  
  [[scaling.metrics]]
    type = "cpu"
    target = 80

  [[scaling.metrics]]
    type = "memory"
    target = 85
```

### Load Distribution

```typescript
// src/utils/loadBalancer.ts
export class ETLLoadBalancer {
  private instances: string[] = [
    'https://marketfinder-etl-01.fly.dev',
    'https://marketfinder-etl-02.fly.dev',
    'https://marketfinder-etl-03.fly.dev',
  ];
  
  private currentIndex = 0;
  
  getNextInstance(): string {
    const instance = this.instances[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.instances.length;
    return instance;
  }
  
  async healthCheck(): Promise<string[]> {
    const healthyInstances = [];
    
    for (const instance of this.instances) {
      try {
        const response = await fetch(`${instance}/api/health`, { 
          timeout: 5000 
        });
        if (response.ok) {
          healthyInstances.push(instance);
        }
      } catch (error) {
        logger.warn(`Instance ${instance} health check failed`, { error });
      }
    }
    
    return healthyInstances;
  }
}
```

This deployment strategy ensures the ETL service can handle production workloads efficiently while maintaining cost-effectiveness and reliability. The Fly.io-based approach provides the best balance of simplicity, performance, and cost for the MarketFinder ETL requirements.