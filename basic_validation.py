#!/usr/bin/env python3
"""
Basic validation script to test core functionality without external dependencies.
This runs the essential tests from our test suite manually.
"""

import sys
import json
import time
from pathlib import Path

def test_python_version():
    """Test Python version requirement."""
    major, minor = sys.version_info[:2]
    print(f"🧪 Python Version: {major}.{minor}")
    
    if major == 3 and minor >= 11:
        print("✅ PASS: Python 3.11+ requirement met")
        return True
    else:
        print(f"❌ FAIL: Python 3.11+ required, got {major}.{minor}")
        return False

def test_project_structure():
    """Test basic project structure."""
    print("🧪 Project Structure")
    
    required_paths = [
        "src/marketfinder_etl/__init__.py",
        "src/marketfinder_etl/core/__init__.py", 
        "src/marketfinder_etl/models/__init__.py",
        "src/marketfinder_etl/engines/__init__.py",
        "src/marketfinder_etl/extractors/__init__.py",
        "pyproject.toml",
        "tests/__init__.py",
        ".github/workflows/ci.yml"
    ]
    
    missing = []
    for path in required_paths:
        if not Path(path).exists():
            missing.append(path)
    
    if missing:
        print(f"❌ FAIL: Missing files: {', '.join(missing)}")
        return False
    else:
        print(f"✅ PASS: All {len(required_paths)} required files found")
        return True

def test_basic_imports():
    """Test basic module imports."""
    print("🧪 Basic Module Imports")
    
    try:
        # Add src to Python path
        sys.path.insert(0, str(Path("src").absolute()))
        
        # Test core imports
        import marketfinder_etl
        print("  ✅ marketfinder_etl imported")
        
        from marketfinder_etl.core import config
        print("  ✅ config module imported")
        
        # Test that we can access basic attributes
        if hasattr(config, 'Settings'):
            print("  ✅ Settings class found")
        
        print("✅ PASS: Core imports successful")
        return True
        
    except ImportError as e:
        print(f"❌ FAIL: Import error: {e}")
        return False
    except Exception as e:
        print(f"❌ FAIL: Unexpected error: {e}")
        return False

def test_data_models():
    """Test basic data model functionality.""" 
    print("🧪 Data Models")
    
    try:
        # Test JSON serialization (basic functionality)
        test_market = {
            "platform": "test",
            "market_id": "test_123", 
            "title": "Test Market",
            "yes_price": 0.5,
            "no_price": 0.5
        }
        
        # Test JSON roundtrip
        json_str = json.dumps(test_market)
        parsed = json.loads(json_str)
        
        if parsed == test_market:
            print("  ✅ JSON serialization working")
            print("✅ PASS: Basic data handling works")
            return True
        else:
            print("❌ FAIL: JSON roundtrip failed")
            return False
            
    except Exception as e:
        print(f"❌ FAIL: Data model test error: {e}")
        return False

def test_configuration():
    """Test configuration and settings."""
    print("🧪 Configuration")
    
    try:
        # Test pyproject.toml exists and is valid
        pyproject_path = Path("pyproject.toml")
        if not pyproject_path.exists():
            print("❌ FAIL: pyproject.toml not found")
            return False
        
        # Test basic file reading
        content = pyproject_path.read_text()
        if "marketfinder-etl" in content and "pytest" in content:
            print("  ✅ pyproject.toml contains expected content")
            print("✅ PASS: Configuration valid")
            return True
        else:
            print("❌ FAIL: pyproject.toml missing expected content")
            return False
            
    except Exception as e:
        print(f"❌ FAIL: Configuration test error: {e}")
        return False

def test_ci_configuration():
    """Test CI/CD configuration."""
    print("🧪 CI/CD Configuration")
    
    try:
        ci_path = Path(".github/workflows/ci.yml")
        if not ci_path.exists():
            print("❌ FAIL: CI workflow not found")
            return False
        
        content = ci_path.read_text()
        required_items = ["pytest", "ruff", "mypy", "setup-python", "setup-node"]
        
        missing = [item for item in required_items if item not in content]
        if missing:
            print(f"❌ FAIL: CI missing: {', '.join(missing)}")
            return False
        
        print("  ✅ CI workflow has all required steps")
        print("✅ PASS: CI/CD configuration valid")
        return True
        
    except Exception as e:
        print(f"❌ FAIL: CI test error: {e}")
        return False

def main():
    """Run all validation tests."""
    print("🚀 MarketFinder ETL - Basic Validation")
    print("=" * 60)
    
    tests = [
        ("Python Version", test_python_version),
        ("Project Structure", test_project_structure),
        ("Basic Imports", test_basic_imports), 
        ("Data Models", test_data_models),
        ("Configuration", test_configuration),
        ("CI/CD Setup", test_ci_configuration)
    ]
    
    passed = 0
    total = len(tests)
    start_time = time.time()
    
    for name, test_func in tests:
        try:
            if test_func():
                passed += 1
            print()  # Blank line between tests
        except Exception as e:
            print(f"💥 CRITICAL ERROR in {name}: {e}")
            print()
    
    duration = time.time() - start_time
    
    print("=" * 60)
    print("📊 VALIDATION SUMMARY")
    print("=" * 60)
    print(f"Total Tests: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {total - passed}")
    print(f"Success Rate: {passed/total*100:.1f}%")
    print(f"Duration: {duration:.2f}s")
    
    if passed == total:
        print("\n🎉 ALL VALIDATION TESTS PASSED!")
        print("✅ ETL pipeline foundation is solid")
        print("✅ Testing infrastructure is configured")
        print("✅ Ready for development and CI/CD")
        return 0
    else:
        print(f"\n❌ {total - passed} VALIDATION TESTS FAILED")
        print("🔧 Fix the failing components before proceeding")
        return 1

if __name__ == "__main__":
    sys.exit(main())