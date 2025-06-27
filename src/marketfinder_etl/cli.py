"""Command-line interface for MarketFinder ETL pipeline."""

from typing import Optional
import asyncio
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn

from marketfinder_etl.core.config import settings
from marketfinder_etl.core.logging import get_logger

app = typer.Typer(
    name="marketfinder",
    help="MarketFinder ETL - Modern Python data engineering pipeline for prediction market arbitrage detection",
    add_completion=False,
)
console = Console()
logger = get_logger("cli")


@app.command()
def info() -> None:
    """Display system information and configuration."""
    logger.info("Displaying system information")
    
    table = Table(title="MarketFinder ETL Configuration")
    table.add_column("Setting", style="cyan", no_wrap=True)
    table.add_column("Value", style="green")
    
    # Application info
    table.add_row("App Name", settings.app_name)
    table.add_row("Version", settings.app_version)
    table.add_row("Debug Mode", str(settings.debug))
    table.add_row("Log Level", settings.log_level)
    
    # Database
    table.add_row("DuckDB Path", settings.duckdb_path)
    table.add_row("Redis URL", settings.redis_url)
    
    # API Configuration
    table.add_row("API Host", f"{settings.api_host}:{settings.api_port}")
    table.add_row("Max Concurrent Requests", str(settings.max_concurrent_requests))
    table.add_row("LLM Rate Limit", f"{settings.max_llm_calls_per_minute}/min")
    
    # Airflow
    table.add_row("Airflow Home", settings.airflow_home)
    table.add_row("Airflow Port", str(settings.airflow_webserver_port))
    
    console.print(table)


@app.command()
def setup() -> None:
    """Set up the development environment and create necessary directories."""
    logger.info("Setting up MarketFinder ETL environment")
    
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        
        task = progress.add_task("Creating directories...", total=None)
        
        # Create necessary directories
        directories = [
            Path("data"),
            Path("logs"),
            Path("models"),
            Path(settings.airflow_home),
            Path(settings.airflow_dags_folder),
            Path("tests"),
            Path("docker"),
        ]
        
        for directory in directories:
            directory.mkdir(exist_ok=True)
            logger.debug(f"Created directory: {directory}")
        
        progress.update(task, description="Creating configuration files...")
        
        # Create .env template if it doesn't exist
        env_file = Path(".env")
        if not env_file.exists():
            env_template = """# MarketFinder ETL Configuration
DEBUG=true
LOG_LEVEL=INFO

# API Keys (set these with your actual keys)
KALSHI_EMAIL=your-kalshi-email
KALSHI_PASSWORD=your-kalshi-password
POLYMARKET_API_KEY=your-polymarket-key

# LLM Providers
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
GOOGLE_VERTEX_AI_KEY=your-vertex-key
GOOGLE_PROJECT_ID=your-project-id

# Database
DATABASE_URL=sqlite:///data/marketfinder.db
DUCKDB_PATH=data/unified_markets.db
CONVEX_DEPLOYMENT=your-convex-deployment

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# Processing
MAX_LLM_CALLS_PER_MINUTE=60
BUCKET_PROCESSING_BATCH_SIZE=1000
"""
            env_file.write_text(env_template)
            logger.info(f"Created .env template at {env_file}")
        
        progress.update(task, description="Setup complete!")
    
    console.print("✅ [bold green]Setup completed successfully![/bold green]")
    console.print("\n📝 [yellow]Next steps:[/yellow]")
    console.print("1. Edit .env file with your API keys")
    console.print("2. Run 'poetry install' to install dependencies")
    console.print("3. Run 'marketfinder test-connection' to verify API access")


@app.command()
def test_connection() -> None:
    """Test connections to external APIs and databases."""
    logger.info("Testing connections to external services")
    
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        
        task = progress.add_task("Testing connections...", total=None)
        
        # Test Redis connection
        progress.update(task, description="Testing Redis connection...")
        try:
            import redis
            r = redis.from_url(settings.redis_url)
            r.ping()
            console.print("✅ Redis connection: [bold green]Success[/bold green]")
        except Exception as e:
            console.print(f"❌ Redis connection: [bold red]Failed[/bold red] - {e}")
        
        # Test DuckDB
        progress.update(task, description="Testing DuckDB connection...")
        try:
            import duckdb
            conn = duckdb.connect(settings.duckdb_path)
            conn.execute("SELECT 1")
            conn.close()
            console.print("✅ DuckDB connection: [bold green]Success[/bold green]")
        except Exception as e:
            console.print(f"❌ DuckDB connection: [bold red]Failed[/bold red] - {e}")
        
        # Test API endpoints (if keys are configured)
        if settings.kalshi_email and settings.kalshi_password:
            progress.update(task, description="Testing Kalshi API...")
            # TODO: Implement Kalshi API test
            console.print("🔄 Kalshi API: [yellow]Test not implemented yet[/yellow]")
        else:
            console.print("⚠️ Kalshi API: [yellow]No credentials configured[/yellow]")
        
        if settings.polymarket_api_key:
            progress.update(task, description="Testing Polymarket API...")
            # TODO: Implement Polymarket API test  
            console.print("🔄 Polymarket API: [yellow]Test not implemented yet[/yellow]")
        else:
            console.print("⚠️ Polymarket API: [yellow]No credentials configured[/yellow]")


@app.command()
def run_pipeline(
    dry_run: bool = typer.Option(False, "--dry-run", help="Run pipeline in dry-run mode"),
    force: bool = typer.Option(False, "--force", help="Force pipeline execution"),
) -> None:
    """Run the complete ETL pipeline."""
    logger.info("Starting ETL pipeline", dry_run=dry_run, force=force)
    
    if dry_run:
        console.print("🔍 [yellow]Running in dry-run mode - no data will be processed[/yellow]")
    
    # TODO: Implement pipeline execution
    console.print("🔄 [yellow]Pipeline execution not implemented yet[/yellow]")


@app.command()
def start_airflow() -> None:
    """Start Airflow webserver and scheduler."""
    logger.info("Starting Airflow services")
    
    import subprocess
    import os
    
    # Set Airflow home
    os.environ["AIRFLOW_HOME"] = settings.airflow_home
    
    try:
        # Initialize Airflow database
        console.print("🔄 Initializing Airflow database...")
        subprocess.run(["airflow", "db", "init"], check=True)
        
        # Start webserver
        console.print(f"🚀 Starting Airflow webserver on port {settings.airflow_webserver_port}...")
        console.print(f"📊 Access Airflow UI at: http://localhost:{settings.airflow_webserver_port}")
        
        subprocess.run([
            "airflow", "webserver", 
            "--port", str(settings.airflow_webserver_port)
        ])
        
    except subprocess.CalledProcessError as e:
        console.print(f"❌ [bold red]Failed to start Airflow:[/bold red] {e}")
        logger.error("Failed to start Airflow", error=str(e))
    except KeyboardInterrupt:
        console.print("\n👋 Shutting down Airflow...")
        logger.info("Airflow shutdown requested")


if __name__ == "__main__":
    app()