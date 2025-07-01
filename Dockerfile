# Multi-stage Docker build for MarketFinder ETL
FROM python:3.11-slim as base

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install uv (fast Python installer/lockfile manager)
RUN pip install --no-cache-dir uv

WORKDIR /app

# Copy dependency definitions
COPY pyproject.toml uv.lock* ./

# Install dependencies
RUN uv pip sync --system --prerelease --no-cache-dir

# Development stage
FROM base as development

# Install development dependencies
RUN uv pip sync --system --no-cache-dir

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p logs data models

# Expose ports
EXPOSE 8000 8080 9090

CMD ["python", "-m", "marketfinder_etl.cli", "info"]

# Production stage
FROM base as production

# Copy source code
COPY src/ ./src/
COPY README.md ./

# Create non-root user
RUN groupadd -r marketfinder && useradd -r -g marketfinder marketfinder

# Create necessary directories and set permissions
RUN mkdir -p logs data models && \
    chown -R marketfinder:marketfinder /app

USER marketfinder

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

CMD ["uvicorn", "marketfinder_etl.api.main:app", "--host", "0.0.0.0", "--port", "8000"]