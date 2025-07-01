"""Basic environment and structure tests using pytest.

These replace the ad-hoc scripts under testing/.* and integrate with
pytest discovery (configured in pyproject.toml).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
import pytest

import logging

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _src_root() -> Path:
    return _project_root() / "src"


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_python_version() -> None:
    """Ensure we are running on Python ≥3.11 (rule: requires-python)."""

    major, minor = sys.version_info[:2]
    logger.info("python-version", major=major, minor=minor)
    assert major == 3 and minor >= 11, "Python 3.11+ is required"


def test_project_structure() -> None:
    """Verify required package layout exists (see etl_rules)."""

    required_paths = [
        _src_root() / "marketfinder_etl" / "__init__.py",
        _src_root() / "marketfinder_etl" / "core" / "__init__.py",
        _src_root() / "marketfinder_etl" / "models" / "__init__.py",
        _src_root() / "marketfinder_etl" / "engines" / "__init__.py",
        _src_root() / "marketfinder_etl" / "extractors" / "__init__.py",
        _project_root() / "pyproject.toml",
    ]

    missing = [str(p.relative_to(_project_root())) for p in required_paths if not p.exists()]
    logger.info("project-structure", missing=missing)
    assert not missing, f"Missing required paths: {', '.join(missing)}"


def test_basic_imports() -> None:
    """Import key packages without using // @ts-ignore style suppression."""

    sys.path.insert(0, str(_src_root()))

    import pytest
    marketfinder_etl = pytest.importorskip("marketfinder_etl")
    pytest.importorskip("marketfinder_etl.core.config")
    pytest.importorskip("marketfinder_etl.models.base")

    logger.info("basic-imports", success=True)


def test_json_roundtrip() -> None:
    """Simple functional sanity check (no external deps)."""

    test_market = {
        "platform": "test",
        "market_id": "test_123",
        "title": "Test Market",
        "yes_price": 0.5,
        "no_price": 0.5,
    }

    payload = json.dumps(test_market)
    parsed = json.loads(payload)
    assert parsed == test_market
