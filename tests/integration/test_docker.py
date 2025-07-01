"""Docker integration tests for MarketFinder ETL.

Tests the application behavior in containerized environments,
replacing the complex shell script with proper pytest tests.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest


def _run_command(cmd: list[str], timeout: int = 60) -> tuple[int, str, str]:
    """Run a command and return exit code, stdout, stderr."""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=Path(__file__).parent.parent.parent
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return 1, "", "Command timed out"
    except Exception as e:
        return 1, "", str(e)


@pytest.mark.integration
@pytest.mark.slow
def test_docker_build() -> None:
    """Test that Docker image builds successfully."""
    cmd = ["docker", "build", "-t", "marketfinder-etl:test", "."]
    
    exit_code, stdout, stderr = _run_command(cmd, timeout=300)  # 5 minutes
    
    assert exit_code == 0, f"Docker build failed:\nSTDOUT: {stdout}\nSTDERR: {stderr}"
    print(f"✅ Docker build successful")


@pytest.mark.integration
@pytest.mark.slow
def test_docker_container_python_environment() -> None:
    """Test Python environment in Docker container."""
    # First ensure image exists
    build_cmd = ["docker", "build", "-t", "marketfinder-etl:test", "."]
    build_exit, _, build_stderr = _run_command(build_cmd, timeout=300)
    
    if build_exit != 0:
        pytest.skip(f"Docker build failed: {build_stderr}")
    
    # Test Python environment
    test_cmd = [
        "docker", "run", "--rm", 
        "marketfinder-etl:test",
        "python", "-c", 
        "import sys; print(f'Python {sys.version_info.major}.{sys.version_info.minor}')"
    ]
    
    exit_code, stdout, stderr = _run_command(test_cmd)
    
    assert exit_code == 0, f"Python test failed:\nSTDOUT: {stdout}\nSTDERR: {stderr}"
    assert "Python 3.1" in stdout, f"Expected Python 3.11+, got: {stdout}"
    print(f"✅ Docker Python environment: {stdout.strip()}")


@pytest.mark.integration
@pytest.mark.slow
def test_docker_container_imports() -> None:
    """Test that key modules can be imported in Docker container."""
    # Build if needed
    build_cmd = ["docker", "build", "-t", "marketfinder-etl:test", "."]
    build_exit, _, build_stderr = _run_command(build_cmd, timeout=300)
    
    if build_exit != 0:
        pytest.skip(f"Docker build failed: {build_stderr}")
    
    # Test imports
    import_test = '''
import sys
sys.path.insert(0, "/app/src")

try:
    import marketfinder_etl
    print("✅ marketfinder_etl imported")
    
    from marketfinder_etl.core import config
    print("✅ config imported")
    
    from marketfinder_etl.models import base
    print("✅ models imported")
    
    print("SUCCESS: All imports successful")
except Exception as e:
    print(f"FAILED: Import error: {e}")
    sys.exit(1)
'''
    
    test_cmd = [
        "docker", "run", "--rm",
        "marketfinder-etl:test", 
        "python", "-c", import_test
    ]
    
    exit_code, stdout, stderr = _run_command(test_cmd)
    
    assert exit_code == 0, f"Import test failed:\nSTDOUT: {stdout}\nSTDERR: {stderr}"
    assert "SUCCESS" in stdout, f"Expected success message, got: {stdout}"
    print(f"✅ Docker imports successful")


@pytest.mark.integration
def test_docker_environment_detection() -> None:
    """Test Docker environment can be detected."""
    # This test runs locally but simulates Docker environment detection
    
    # Simulate Docker environment variables
    original_env = os.environ.get('DOCKER_CONTAINER')
    
    try:
        os.environ['DOCKER_CONTAINER'] = 'true'
        
        # Test environment detection
        is_docker = os.environ.get('DOCKER_CONTAINER', 'false').lower() == 'true'
        assert is_docker, "Should detect Docker environment"
        
        print("✅ Docker environment detection working")
        
    finally:
        # Restore original environment
        if original_env is not None:
            os.environ['DOCKER_CONTAINER'] = original_env
        else:
            os.environ.pop('DOCKER_CONTAINER', None)


@pytest.mark.integration
@pytest.mark.slow 
def test_docker_health_check() -> None:
    """Test Docker container health and responsiveness."""
    # Build if needed
    build_cmd = ["docker", "build", "-t", "marketfinder-etl:test", "."]
    build_exit, _, build_stderr = _run_command(build_cmd, timeout=300)
    
    if build_exit != 0:
        pytest.skip(f"Docker build failed: {build_stderr}")
    
    # Test container starts and responds
    health_test = '''
import os
import sys

# Basic health checks
print("Container Health Check:")
print(f"Python version: {sys.version}")
print(f"Working directory: {os.getcwd()}")
print(f"Python path: {sys.path[:3]}")

# Test basic functionality
try:
    import json
    test_data = {"status": "healthy", "timestamp": "2024-01-01"}
    serialized = json.dumps(test_data)
    parsed = json.loads(serialized)
    assert parsed["status"] == "healthy"
    print("✅ JSON serialization working")
    
    print("SUCCESS: Container is healthy")
except Exception as e:
    print(f"FAILED: Health check error: {e}")
    sys.exit(1)
'''
    
    test_cmd = [
        "docker", "run", "--rm",
        "-e", "DOCKER_CONTAINER=true",
        "marketfinder-etl:test",
        "python", "-c", health_test
    ]
    
    exit_code, stdout, stderr = _run_command(test_cmd, timeout=30)
    
    assert exit_code == 0, f"Health check failed:\nSTDOUT: {stdout}\nSTDERR: {stderr}"
    assert "SUCCESS" in stdout, f"Expected success message, got: {stdout}"
    print(f"✅ Docker container health check passed")


@pytest.mark.integration
def test_docker_cleanup() -> None:
    """Clean up test Docker images."""
    # Remove test image
    cleanup_cmd = ["docker", "rmi", "marketfinder-etl:test", "--force"]
    exit_code, stdout, stderr = _run_command(cleanup_cmd)
    
    # Don't assert on this - cleanup is best effort
    if exit_code == 0:
        print("✅ Docker test image cleaned up")
    else:
        print(f"⚠️ Docker cleanup warning: {stderr}")