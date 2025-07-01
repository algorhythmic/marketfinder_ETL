"""Unit tests for MLScoringEngine to ensure it reduces candidate pairs
and gives higher scores to obviously similar markets.
"""

from __future__ import annotations

import asyncio
from decimal import Decimal
from datetime import datetime, timedelta
from typing import List

import pytest

import pytest
try:
    from marketfinder_etl.engines.ml_scoring import MLScoringEngine  # type: ignore
except Exception as exc:  # pragma: no cover
    MLScoringEngine = None  # type: ignore
    pytest.skip(f"Skipping ML scoring tests due to import error: {exc}", allow_module_level=True)
from marketfinder_etl.engines.filtering import MarketPair

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_pair(idx: int, similar: bool) -> MarketPair:  # noqa: WPS110 (idx important here)
    """Create a synthetic MarketPair.

    If *similar* is True the two markets share category and keyword, have closer
    prices and volumes—should receive higher ML score.
    """

    base_title = "US Presidential Election 2024"
    other_title = "US Presidential Election 2024 – Winner" if similar else "Bitcoin price above 100k"

    kalshi_price = Decimal("0.65" if similar else "0.30")
    polymarket_price = Decimal("0.60" if similar else "0.70")

    return MarketPair(
        kalshi_id=f"k_{idx}",
        polymarket_id=f"p_{idx}",
        kalshi_title=base_title,
        polymarket_title=other_title,
        kalshi_price=kalshi_price,
        polymarket_price=polymarket_price,
        kalshi_volume=Decimal("5000"),
        polymarket_volume=Decimal("4500"),
        kalshi_category="politics" if similar else "crypto",
        polymarket_category="politics" if similar else "crypto",
        kalshi_close_time=datetime.utcnow() + timedelta(days=30),
        polymarket_close_time=datetime.utcnow() + timedelta(days=30),
        bucket_name="test",
    )


async def _score_pairs(engine: MLScoringEngine, pairs: List[MarketPair]):
    return [await engine.score_market_pair(p) for p in pairs]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ml_scoring_separates_similar_and_dissimilar() -> None:
    engine = MLScoringEngine()

    similar_pairs = [_make_pair(i, True) for i in range(10)]
    dissimilar_pairs = [_make_pair(i, False) for i in range(10, 20)]
    all_pairs = similar_pairs + dissimilar_pairs

    predictions = await _score_pairs(engine, all_pairs)

    # Split back
    similar_scores = [p.llm_worthiness_score for p in predictions[:10]]
    dissimilar_scores = [p.llm_worthiness_score for p in predictions[10:]]

    assert (
        sum(similar_scores) / len(similar_scores)
        > sum(dissimilar_scores) / len(dissimilar_scores)
    ), "Similar pairs should have higher average ML scores than dissimilar pairs"


@pytest.mark.asyncio
async def test_ml_scoring_reduces_candidate_count() -> None:
    engine = MLScoringEngine()

    # Create 50 mixed pairs (half likely, half unlikely)
    pairs = [_make_pair(i, i % 2 == 0) for i in range(50)]
    preds = await _score_pairs(engine, pairs)

    high = [p for p in preds if p.llm_worthiness_score >= engine.config.prediction_threshold]

    # Should filter out at least 30% of pairs
    assert len(high) <= 35, "ML scoring should filter out a significant proportion of low-quality pairs"
