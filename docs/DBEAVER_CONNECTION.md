# Connecting to DuckDB with DBeaver

This guide shows how to connect to the MarketFinder DuckDB database using DBeaver.

## Method 1: Direct File Connection (Recommended)

### Prerequisites
1. **Install DBeaver Community** (free): https://dbeaver.io/download/
2. **Install DuckDB JDBC Driver** in DBeaver

### Setup DuckDB Driver
1. Open DBeaver
2. Go to `Database` → `Driver Manager`  
3. Click `New` button
4. Fill in:
   - **Driver Name:** DuckDB
   - **Class Name:** `org.duckdb.DuckDBDriver`
   - **URL Template:** `jdbc:duckdb:{file}`
   - **Default Port:** (leave empty)
   
5. In **Libraries** tab, click `Add File`
6. Download DuckDB JDBC from: https://repo1.maven.org/maven2/org/duckdb/duckdb_jdbc/
7. Select the latest `.jar` file

### Create Connection
1. Click `New Database Connection`
2. Select **DuckDB** driver
3. Fill in connection details:
   - **Path:** `/mnt/c/Workspace/Code/marketfinder/data/marketfinder.db`
   - **URL:** `jdbc:duckdb:/mnt/c/Workspace/Code/marketfinder/data/marketfinder.db`
   - **User/Password:** (leave empty)

4. Click `Test Connection` → Should show "Connected"
5. Click `Finish`

### Available Tables
- `raw_markets` - Market data from Kalshi and Polymarket
- `fetch_runs` - ETL pipeline run history  
- `market_similarities` - Cross-platform market matches

## Method 2: HTTP Bridge (For Remote Access)

If you need remote access or the direct file method doesn't work:

### Start DuckDB HTTP Server
```bash
npm run duckdb:server
```

Server will start on `http://localhost:8080` with endpoints:
- `GET /health` - Server status
- `GET /info` - Database info
- `POST /query` - Execute SQL queries
- `GET /schema/:table` - Table schema

### Test HTTP Access
```bash
# Get database info
curl http://localhost:8080/info

# Execute query
curl -X POST http://localhost:8080/query \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT COUNT(*) FROM raw_markets"}'
```

### DBeaver HTTP Connection
1. Use **Generic JDBC** driver
2. **URL:** `jdbc:postgresql://localhost:8080/` (using PostgreSQL wire protocol adapter)
3. **Note:** This requires additional PostgreSQL protocol adapter setup

## Method 3: DuckDB CLI (Terminal)

If you have DuckDB CLI installed:
```bash
# Install DuckDB CLI
# macOS: brew install duckdb  
# Linux: apt install duckdb
# Windows: Download from duckdb.org

# Connect to database
duckdb data/marketfinder.db

# Run queries
SELECT COUNT(*) FROM raw_markets;
SELECT platform, COUNT(*) FROM raw_markets GROUP BY platform;
```

## Sample Queries

Once connected, try these queries:

```sql
-- Market count by platform
SELECT platform, COUNT(*) as market_count 
FROM raw_markets 
GROUP BY platform;

-- Recent high-volume markets
SELECT title, platform, volume, yes_price 
FROM raw_markets 
WHERE volume > 1000 
ORDER BY volume DESC 
LIMIT 10;

-- ETL run history
SELECT run_id, total_markets, batches_processed, status, started_at 
FROM fetch_runs 
ORDER BY started_at DESC;

-- Price distribution
SELECT 
  platform,
  AVG(yes_price) as avg_price,
  MIN(yes_price) as min_price,
  MAX(yes_price) as max_price
FROM raw_markets 
GROUP BY platform;
```

## Database Schema

```sql
-- View table structure
DESCRIBE raw_markets;
DESCRIBE fetch_runs;
DESCRIBE market_similarities;

-- List all tables
SHOW TABLES;
```

## Troubleshooting

**"File not found"**: Ensure the database file exists at `data/marketfinder.db`
```bash
ls -la data/marketfinder.db
```

**"Driver not found"**: Download the correct DuckDB JDBC driver version

**"Connection refused"**: For HTTP method, ensure the server is running:
```bash
npm run duckdb:server
```

**"Permission denied"**: Check file permissions on the database file

The **direct file connection (Method 1)** is recommended for local development as it's the simplest and most reliable approach.