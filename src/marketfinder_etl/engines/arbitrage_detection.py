"""
Arbitrage Detection Engine - Final Layer of Multi-Layer Comparison Architecture

This engine processes the final ~50 high-confidence market pairs from LLM evaluation
to identify actionable arbitrage opportunities with precise risk assessment.
"""

import asyncio
import math
from typing import Any, Dict, List, Optional, Tuple, Union
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from dataclasses import dataclass
from enum import Enum

import polars as pl
import numpy as np
from pydantic import BaseModel, validator

from marketfinder_etl.core.logging import LoggerMixin
from marketfinder_etl.models.arbitrage import ArbitrageOpportunity, LLMEvaluation, ArbitrageStrategy
from marketfinder_etl.engines.filtering import MarketPair


class ArbitrageType(str, Enum):
    """Types of arbitrage opportunities."""
    SIMPLE_ARBITRAGE = "simple_arbitrage"          # Direct price difference
    CROSS_PLATFORM = "cross_platform"             # Platform-specific arbitrage
    TEMPORAL_ARBITRAGE = "temporal_arbitrage"      # Time-based opportunities
    LIQUIDITY_ARBITRAGE = "liquidity_arbitrage"   # Liquidity imbalance
    VOLATILITY_ARBITRAGE = "volatility_arbitrage" # Volatility-based


class RiskLevel(str, Enum):
    """Risk assessment levels."""
    VERY_LOW = "very_low"        # <5% risk
    LOW = "low"                  # 5-15% risk
    MEDIUM = "medium"            # 15-30% risk
    HIGH = "high"                # 30-50% risk
    VERY_HIGH = "very_high"      # >50% risk


@dataclass
class ArbitrageConfig:
    """Configuration for arbitrage detection."""
    # Profitability thresholds
    min_profit_threshold: float = 0.02      # 2% minimum profit
    min_profit_amount: float = 50.0         # $50 minimum profit
    max_position_size: float = 10000.0      # $10K max position
    
    # Risk parameters
    max_acceptable_risk: RiskLevel = RiskLevel.MEDIUM
    time_decay_factor: float = 0.1          # Risk increase per day
    liquidity_risk_threshold: float = 0.2   # 20% of daily volume
    
    # Transaction costs
    kalshi_trading_fee: float = 0.01        # 1% trading fee
    polymarket_trading_fee: float = 0.02    # 2% trading fee
    gas_cost_estimate: float = 5.0          # $5 gas cost
    slippage_tolerance: float = 0.005       # 0.5% slippage
    
    # Execution parameters
    max_execution_time_hours: int = 24      # Max time to execute
    min_liquidity_ratio: float = 0.1       # Min 10% of market volume
    correlation_threshold: float = 0.95     # Market correlation requirement
    
    # Alert settings
    enable_alerts: bool = True
    alert_threshold: float = 0.05           # 5% profit threshold for alerts
    max_alerts_per_hour: int = 10


class TransactionCostAnalysis(BaseModel):
    """Analysis of transaction costs for arbitrage."""
    kalshi_fee: Decimal
    polymarket_fee: Decimal
    gas_cost: Decimal
    slippage_cost: Decimal
    total_cost: Decimal
    cost_percentage: float
    
    def __init__(self, **data):
        super().__init__(**data)
        # Calculate cost percentage
        position_size = data.get('position_size', Decimal('1000'))
        self.cost_percentage = float(self.total_cost / position_size) if position_size > 0 else 0


class RiskAssessment(BaseModel):
    """Comprehensive risk assessment for arbitrage opportunity."""
    overall_risk_level: RiskLevel
    risk_score: float  # 0-1 scale
    
    # Individual risk factors
    liquidity_risk: float
    timing_risk: float
    execution_risk: float
    market_correlation_risk: float
    platform_risk: float
    
    # Risk explanations
    primary_risks: List[str]
    mitigation_strategies: List[str]
    risk_notes: str


class ArbitrageMetrics(BaseModel):
    """Key metrics for arbitrage opportunity."""
    expected_profit_usd: Decimal
    expected_profit_percentage: float
    roi_percentage: float
    sharpe_ratio: Optional[float] = None
    max_drawdown: Optional[float] = None
    
    # Execution metrics
    estimated_execution_time_minutes: int
    confidence_score: float
    success_probability: float
    
    # Market metrics
    volume_ratio: float
    price_stability_score: float
    liquidity_score: float


class ArbitrageDetectionEngine(LoggerMixin):
    """
    Arbitrage Detection Engine for identifying actionable opportunities.
    
    Processes high-confidence market pairs from LLM evaluation to create
    detailed arbitrage opportunities with precise risk and profit analysis.
    """
    
    def __init__(self, config: Optional[ArbitrageConfig] = None):
        self.config = config or ArbitrageConfig()
        self.detected_opportunities: List[ArbitrageOpportunity] = []
        self.performance_metrics = {
            "total_analyzed": 0,
            "opportunities_found": 0,
            "total_potential_profit": Decimal('0'),
            "avg_profit_margin": 0.0
        }
    
    async def detect_arbitrage_opportunities(
        self, 
        evaluated_pairs: List[Tuple[MarketPair, LLMEvaluation]]
    ) -> List[ArbitrageOpportunity]:
        """Detect arbitrage opportunities from LLM-evaluated pairs."""
        
        self.logger.info(f"Analyzing {len(evaluated_pairs)} high-confidence pairs for arbitrage")
        
        opportunities = []
        
        for pair, llm_eval in evaluated_pairs:
            self.performance_metrics["total_analyzed"] += 1
            
            # Only process high-confidence evaluations
            if llm_eval.confidence_score < 0.75:
                continue
            
            try:
                opportunity = await self._analyze_arbitrage_opportunity(pair, llm_eval)
                
                if opportunity and self._meets_profitability_threshold(opportunity):
                    opportunities.append(opportunity)
                    self.performance_metrics["opportunities_found"] += 1
                    self.performance_metrics["total_potential_profit"] += opportunity.metrics.expected_profit_usd
                    
            except Exception as e:
                self.logger.warning(f"Failed to analyze pair {pair.kalshi_id}_{pair.polymarket_id}: {e}")
        
        # Calculate average profit margin
        if opportunities:
            avg_profit = sum(op.metrics.expected_profit_percentage for op in opportunities) / len(opportunities)
            self.performance_metrics["avg_profit_margin"] = avg_profit
        
        # Sort by expected profit and filter by risk
        viable_opportunities = self._filter_and_rank_opportunities(opportunities)
        
        self.logger.info(
            f"Arbitrage detection complete",
            total_analyzed=self.performance_metrics["total_analyzed"],
            opportunities_found=len(viable_opportunities),
            total_potential_profit=float(self.performance_metrics["total_potential_profit"])
        )
        
        self.detected_opportunities = viable_opportunities
        return viable_opportunities
    
    async def _analyze_arbitrage_opportunity(
        self, 
        pair: MarketPair, 
        llm_eval: LLMEvaluation
    ) -> Optional[ArbitrageOpportunity]:
        """Analyze a specific market pair for arbitrage potential."""
        
        # Determine arbitrage type and strategy
        arbitrage_type = self._classify_arbitrage_type(pair)
        strategy = self._determine_optimal_strategy(pair, arbitrage_type)
        
        # Calculate transaction costs
        position_size = self._calculate_optimal_position_size(pair)
        transaction_costs = self._calculate_transaction_costs(pair, position_size)
        
        # Assess risks
        risk_assessment = self._assess_risks(pair, llm_eval)
        
        # Calculate metrics
        metrics = self._calculate_arbitrage_metrics(pair, transaction_costs, risk_assessment)
        
        # Only proceed if profitable after costs
        if metrics.expected_profit_usd <= 0:
            return None
        
        # Create arbitrage opportunity
        opportunity = ArbitrageOpportunity(
            opportunity_id=f"arb_{pair.kalshi_id}_{pair.polymarket_id}_{int(datetime.utcnow().timestamp())}",
            market1_id=pair.kalshi_id,
            market2_id=pair.polymarket_id,
            
            # Market details
            market1_title=pair.kalshi_title,
            market2_title=pair.polymarket_title,
            market1_price=pair.kalshi_price,
            market2_price=pair.polymarket_price,
            market1_volume=pair.kalshi_volume,
            market2_volume=pair.polymarket_volume,
            
            # Arbitrage details
            arbitrage_type=arbitrage_type.value,
            strategy=strategy,
            position_size=position_size,
            
            # Financial metrics
            metrics=metrics,
            transaction_costs=transaction_costs,
            risk_assessment=risk_assessment,
            
            # LLM evaluation context
            llm_confidence=llm_eval.confidence_score,
            llm_reasoning=llm_eval.reasoning,
            
            # Timing
            detected_at=datetime.utcnow(),
            expires_at=self._calculate_expiry_time(pair),
            
            # Status
            status="detected",
            priority_score=self._calculate_priority_score(metrics, risk_assessment)
        )
        
        return opportunity
    
    def _classify_arbitrage_type(self, pair: MarketPair) -> ArbitrageType:
        """Classify the type of arbitrage opportunity."""
        
        price_diff = abs(pair.kalshi_price - pair.polymarket_price)
        
        # Simple price arbitrage
        if price_diff >= Decimal('0.05'):  # 5% difference
            return ArbitrageType.SIMPLE_ARBITRAGE
        
        # Check time alignment
        time_diff = abs((pair.kalshi_close_time - pair.polymarket_close_time).total_seconds())
        if time_diff > 86400:  # More than 1 day difference
            return ArbitrageType.TEMPORAL_ARBITRAGE
        
        # Check volume imbalance
        volume_ratio = min(float(pair.kalshi_volume), float(pair.polymarket_volume)) / \
                      max(float(pair.kalshi_volume), float(pair.polymarket_volume))
        
        if volume_ratio < 0.3:  # Significant volume imbalance
            return ArbitrageType.LIQUIDITY_ARBITRAGE
        
        # Default to cross-platform
        return ArbitrageType.CROSS_PLATFORM
    
    def _determine_optimal_strategy(self, pair: MarketPair, arb_type: ArbitrageType) -> ArbitrageStrategy:
        """Determine optimal trading strategy."""
        
        # Determine which platform to buy/sell on
        if pair.kalshi_price < pair.polymarket_price:
            buy_platform = "kalshi"
            sell_platform = "polymarket"
        else:
            buy_platform = "polymarket"
            sell_platform = "kalshi"
        
        return ArbitrageStrategy(
            buy_platform=buy_platform,
            sell_platform=sell_platform,
            buy_price=min(pair.kalshi_price, pair.polymarket_price),
            sell_price=max(pair.kalshi_price, pair.polymarket_price),
            execution_order="simultaneous",  # Execute both sides simultaneously
            hedge_required=True,
            max_execution_time_minutes=60
        )
    
    def _calculate_optimal_position_size(self, pair: MarketPair) -> Decimal:
        """Calculate optimal position size considering liquidity and risk."""
        
        # Base position size on available liquidity
        min_volume = min(float(pair.kalshi_volume), float(pair.polymarket_volume))
        liquidity_limit = min_volume * self.config.liquidity_risk_threshold
        
        # Cap at maximum position size
        max_size = self.config.max_position_size
        
        # Calculate optimal size (Kelly criterion simplified)
        price_diff = abs(pair.kalshi_price - pair.polymarket_price)
        win_rate = 0.8  # Estimated win rate for high-confidence opportunities
        
        kelly_fraction = (win_rate * float(price_diff) - (1 - win_rate)) / float(price_diff)
        kelly_position = max_size * max(0, min(0.25, kelly_fraction))  # Cap Kelly at 25%
        
        # Use the minimum of all constraints
        optimal_size = min(liquidity_limit, max_size, kelly_position)
        
        return Decimal(str(optimal_size)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    
    def _calculate_transaction_costs(self, pair: MarketPair, position_size: Decimal) -> TransactionCostAnalysis:
        """Calculate comprehensive transaction costs."""
        
        kalshi_fee = position_size * Decimal(str(self.config.kalshi_trading_fee))
        polymarket_fee = position_size * Decimal(str(self.config.polymarket_trading_fee))
        gas_cost = Decimal(str(self.config.gas_cost_estimate))
        
        # Estimate slippage based on position size relative to volume
        kalshi_slippage_rate = min(0.01, float(position_size) / float(pair.kalshi_volume) * 0.5)
        polymarket_slippage_rate = min(0.01, float(position_size) / float(pair.polymarket_volume) * 0.5)
        slippage_cost = position_size * Decimal(str(kalshi_slippage_rate + polymarket_slippage_rate))
        
        total_cost = kalshi_fee + polymarket_fee + gas_cost + slippage_cost
        
        return TransactionCostAnalysis(
            kalshi_fee=kalshi_fee,
            polymarket_fee=polymarket_fee,
            gas_cost=gas_cost,
            slippage_cost=slippage_cost,
            total_cost=total_cost,
            position_size=position_size
        )
    
    def _assess_risks(self, pair: MarketPair, llm_eval: LLMEvaluation) -> RiskAssessment:
        """Perform comprehensive risk assessment."""
        
        # Calculate individual risk factors
        liquidity_risk = self._calculate_liquidity_risk(pair)
        timing_risk = self._calculate_timing_risk(pair)
        execution_risk = self._calculate_execution_risk(pair)
        correlation_risk = 1.0 - llm_eval.semantic_similarity
        platform_risk = 0.1  # Base platform risk
        
        # Calculate overall risk score
        risk_weights = [0.3, 0.25, 0.2, 0.15, 0.1]  # Weights for each risk factor
        risk_scores = [liquidity_risk, timing_risk, execution_risk, correlation_risk, platform_risk]
        overall_risk_score = sum(w * r for w, r in zip(risk_weights, risk_scores))
        
        # Determine risk level
        if overall_risk_score < 0.15:
            risk_level = RiskLevel.VERY_LOW
        elif overall_risk_score < 0.3:
            risk_level = RiskLevel.LOW
        elif overall_risk_score < 0.5:
            risk_level = RiskLevel.MEDIUM
        elif overall_risk_score < 0.7:
            risk_level = RiskLevel.HIGH
        else:
            risk_level = RiskLevel.VERY_HIGH
        
        # Identify primary risks
        primary_risks = []
        if liquidity_risk > 0.3:
            primary_risks.append("Low liquidity may cause significant slippage")
        if timing_risk > 0.3:
            primary_risks.append("Time misalignment increases execution risk")
        if correlation_risk > 0.2:
            primary_risks.append("Markets may not be perfectly correlated")
        if execution_risk > 0.3:
            primary_risks.append("Complex execution may fail")
        
        # Suggest mitigation strategies
        mitigation_strategies = []
        if liquidity_risk > 0.3:
            mitigation_strategies.append("Reduce position size to minimize market impact")
        if timing_risk > 0.3:
            mitigation_strategies.append("Execute trades as close to market close as possible")
        mitigation_strategies.append("Use limit orders to control execution prices")
        mitigation_strategies.append("Monitor positions closely for early exit opportunities")
        
        return RiskAssessment(
            overall_risk_level=risk_level,
            risk_score=overall_risk_score,
            liquidity_risk=liquidity_risk,
            timing_risk=timing_risk,
            execution_risk=execution_risk,
            market_correlation_risk=correlation_risk,
            platform_risk=platform_risk,
            primary_risks=primary_risks,
            mitigation_strategies=mitigation_strategies,
            risk_notes=f"Risk assessment based on {len(risk_scores)} factors with confidence {llm_eval.confidence_score:.2f}"
        )
    
    def _calculate_liquidity_risk(self, pair: MarketPair) -> float:
        """Calculate liquidity risk based on market volumes."""
        min_volume = min(float(pair.kalshi_volume), float(pair.polymarket_volume))
        
        # Risk increases as volume decreases
        if min_volume > 10000:
            return 0.1  # Low risk
        elif min_volume > 5000:
            return 0.2  # Medium-low risk
        elif min_volume > 1000:
            return 0.4  # Medium risk
        elif min_volume > 500:
            return 0.6  # High risk
        else:
            return 0.8  # Very high risk
    
    def _calculate_timing_risk(self, pair: MarketPair) -> float:
        """Calculate timing risk based on market close times."""
        time_diff_hours = abs((pair.kalshi_close_time - pair.polymarket_close_time).total_seconds()) / 3600
        
        # Risk increases with time difference
        if time_diff_hours < 1:
            return 0.1
        elif time_diff_hours < 24:
            return 0.2
        elif time_diff_hours < 168:  # 1 week
            return 0.4
        else:
            return 0.7
    
    def _calculate_execution_risk(self, pair: MarketPair) -> float:
        """Calculate execution risk based on market characteristics."""
        price_diff = abs(pair.kalshi_price - pair.polymarket_price)
        
        # Higher price differences may indicate execution challenges
        if price_diff < Decimal('0.02'):
            return 0.3  # Tight spreads can be hard to capture
        elif price_diff > Decimal('0.2'):
            return 0.4  # Large spreads may indicate market inefficiencies
        else:
            return 0.2  # Moderate spreads are ideal
    
    def _calculate_arbitrage_metrics(
        self, 
        pair: MarketPair, 
        costs: TransactionCostAnalysis, 
        risks: RiskAssessment
    ) -> ArbitrageMetrics:
        """Calculate comprehensive arbitrage metrics."""
        
        # Calculate expected profit
        gross_profit = abs(pair.kalshi_price - pair.polymarket_price) * costs.position_size
        net_profit = gross_profit - costs.total_cost
        profit_percentage = float(net_profit / costs.position_size) if costs.position_size > 0 else 0
        
        # Calculate ROI (annualized)
        time_to_close = min(
            (pair.kalshi_close_time - datetime.utcnow()).total_seconds(),
            (pair.polymarket_close_time - datetime.utcnow()).total_seconds()
        ) / (24 * 3600)  # Convert to days
        
        roi_annualized = (profit_percentage * 365 / max(1, time_to_close)) if time_to_close > 0 else 0
        
        # Calculate success probability based on risk
        success_probability = max(0.5, 1.0 - risks.risk_score)
        
        # Estimate execution time
        execution_time = max(30, int(risks.execution_risk * 120))  # 30-120 minutes
        
        return ArbitrageMetrics(
            expected_profit_usd=net_profit,
            expected_profit_percentage=profit_percentage,
            roi_percentage=roi_annualized,
            estimated_execution_time_minutes=execution_time,
            confidence_score=success_probability,
            success_probability=success_probability,
            volume_ratio=min(float(pair.kalshi_volume), float(pair.polymarket_volume)) / 
                        max(float(pair.kalshi_volume), float(pair.polymarket_volume)),
            price_stability_score=1.0 - float(abs(pair.kalshi_price - pair.polymarket_price)),
            liquidity_score=1.0 - risks.liquidity_risk
        )
    
    def _meets_profitability_threshold(self, opportunity: ArbitrageOpportunity) -> bool:
        """Check if opportunity meets minimum profitability requirements."""
        return (
            opportunity.metrics.expected_profit_usd >= Decimal(str(self.config.min_profit_amount)) and
            opportunity.metrics.expected_profit_percentage >= self.config.min_profit_threshold and
            opportunity.risk_assessment.overall_risk_level.value <= self.config.max_acceptable_risk.value
        )
    
    def _filter_and_rank_opportunities(self, opportunities: List[ArbitrageOpportunity]) -> List[ArbitrageOpportunity]:
        """Filter and rank opportunities by profitability and risk."""
        
        # Filter by profitability and risk
        viable_opportunities = [
            op for op in opportunities 
            if self._meets_profitability_threshold(op)
        ]
        
        # Sort by priority score (highest first)
        viable_opportunities.sort(key=lambda x: x.priority_score, reverse=True)
        
        return viable_opportunities
    
    def _calculate_priority_score(self, metrics: ArbitrageMetrics, risks: RiskAssessment) -> float:
        """Calculate priority score for ranking opportunities."""
        
        # Weighted scoring: profit (40%), ROI (30%), risk (20%), confidence (10%)
        profit_score = min(1.0, metrics.expected_profit_percentage / 0.1)  # Normalize to 10%
        roi_score = min(1.0, metrics.roi_percentage / 100.0)  # Normalize to 100% ROI
        risk_score = 1.0 - risks.risk_score  # Invert risk (lower risk = higher score)
        confidence_score = metrics.confidence_score
        
        priority_score = (
            profit_score * 0.4 +
            roi_score * 0.3 +
            risk_score * 0.2 +
            confidence_score * 0.1
        )
        
        return round(priority_score, 3)
    
    def _calculate_expiry_time(self, pair: MarketPair) -> datetime:
        """Calculate when the arbitrage opportunity expires."""
        
        # Opportunity expires when either market closes or after max execution time
        market_close = min(pair.kalshi_close_time, pair.polymarket_close_time)
        execution_deadline = datetime.utcnow() + timedelta(hours=self.config.max_execution_time_hours)
        
        return min(market_close, execution_deadline)
    
    def get_performance_summary(self) -> Dict[str, Any]:
        """Get performance summary for arbitrage detection."""
        
        if not self.detected_opportunities:
            return {"status": "no_opportunities"}
        
        # Calculate summary statistics
        total_profit = sum(float(op.metrics.expected_profit_usd) for op in self.detected_opportunities)
        avg_profit_pct = sum(op.metrics.expected_profit_percentage for op in self.detected_opportunities) / len(self.detected_opportunities)
        avg_roi = sum(op.metrics.roi_percentage for op in self.detected_opportunities) / len(self.detected_opportunities)
        
        # Risk distribution
        risk_distribution = {}
        for op in self.detected_opportunities:
            risk_level = op.risk_assessment.overall_risk_level.value
            risk_distribution[risk_level] = risk_distribution.get(risk_level, 0) + 1
        
        return {
            "total_opportunities": len(self.detected_opportunities),
            "total_potential_profit_usd": total_profit,
            "average_profit_percentage": avg_profit_pct,
            "average_roi_percentage": avg_roi,
            "risk_distribution": risk_distribution,
            "top_opportunity": {
                "id": self.detected_opportunities[0].opportunity_id,
                "profit_usd": float(self.detected_opportunities[0].metrics.expected_profit_usd),
                "profit_pct": self.detected_opportunities[0].metrics.expected_profit_percentage,
                "risk_level": self.detected_opportunities[0].risk_assessment.overall_risk_level.value
            } if self.detected_opportunities else None
        }
    
    def get_opportunities_by_risk_level(self, risk_level: RiskLevel) -> List[ArbitrageOpportunity]:
        """Get opportunities filtered by risk level."""
        return [
            op for op in self.detected_opportunities
            if op.risk_assessment.overall_risk_level == risk_level
        ]
    
    def get_high_priority_opportunities(self, limit: int = 10) -> List[ArbitrageOpportunity]:
        """Get the highest priority opportunities."""
        return self.detected_opportunities[:limit]