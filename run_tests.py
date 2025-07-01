#!/usr/bin/env python3
"""
Simple test runner for MarketFinder ETL.

Usage:
    python run_tests.py              # Run all tests
    python run_tests.py --unit       # Run unit tests only
    python run_tests.py --integration # Run integration tests only
    python run_tests.py --coverage   # Run with coverage report
    python run_tests.py --fast       # Skip slow tests
"""

import subprocess
import sys
from pathlib import Path


def run_command(cmd: list[str]) -> int:
    """Run command and return exit code."""
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=Path(__file__).parent)
    return result.returncode


def main() -> int:
    """Main test runner."""
    args = sys.argv[1:]
    
    # Base pytest command
    cmd = ["python", "-m", "pytest", "tests/"]
    
    # Add options based on arguments
    if "--unit" in args:
        cmd.extend(["-m", "unit"])
    elif "--integration" in args:
        cmd.extend(["-m", "integration"])
    
    if "--coverage" in args:
        cmd.extend(["--cov=src", "--cov-report=term", "--cov-report=html"])
    
    if "--fast" in args:
        cmd.extend(["-m", "not slow"])
    
    if "--verbose" in args or "-v" in args:
        cmd.append("-v")
    
    # Add default verbose output
    if not any(arg in ["-v", "--verbose", "-q", "--quiet"] for arg in args):
        cmd.append("-v")
    
    print("🧪 MarketFinder ETL Test Runner")
    print("=" * 50)
    
    exit_code = run_command(cmd)
    
    if exit_code == 0:
        print("\n✅ All tests passed!")
    else:
        print(f"\n❌ Tests failed with exit code {exit_code}")
    
    return exit_code


if __name__ == "__main__":
    sys.exit(main())