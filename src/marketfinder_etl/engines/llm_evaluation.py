"""
LLM Evaluation Engine - Layer 4 of Multi-Layer Comparison Architecture

This engine uses Large Language Models to perform deep semantic evaluation
of market pairs, reducing the comparison space from 1K to ~50 pairs (95% reduction).
"""

import asyncio
import json
import time
from typing import Any, Dict, List, Optional, Tuple, Union
from datetime import datetime, timedelta
from decimal import Decimal
from dataclasses import dataclass
from enum import Enum
import hashlib

import openai
import anthropic
from google.cloud import aiplatform
from pydantic import BaseModel

from marketfinder_etl.core.logging import LoggerMixin
from marketfinder_etl.core.config import settings
from marketfinder_etl.models.arbitrage import LLMEvaluation, MLPrediction
from marketfinder_etl.engines.filtering import MarketPair


class LLMProvider(str, Enum):
    """Supported LLM providers."""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    VERTEX_AI = "vertex_ai"


class EvaluationConfidence(str, Enum):
    """LLM evaluation confidence levels."""
    VERY_HIGH = "very_high"      # 90-100%
    HIGH = "high"                # 75-89%
    MEDIUM = "medium"            # 50-74%
    LOW = "low"                  # 25-49%
    VERY_LOW = "very_low"        # 0-24%


@dataclass
class LLMConfig:
    """Configuration for LLM evaluation."""
    # Provider settings
    provider: LLMProvider = LLMProvider.OPENAI
    model_name: str = "gpt-4"
    temperature: float = 0.1
    max_tokens: int = 1000
    
    # Rate limiting
    requests_per_minute: int = 60
    concurrent_requests: int = 5
    retry_attempts: int = 3
    retry_delay: float = 1.0
    
    # Evaluation thresholds
    min_confidence_threshold: float = 0.75
    high_confidence_threshold: float = 0.9
    batch_size: int = 10
    
    # Caching
    enable_caching: bool = True
    cache_duration_hours: int = 24
    
    # Cost management
    max_cost_per_batch: float = 10.0  # USD
    cost_tracking: bool = True


class LLMResponse(BaseModel):
    """Structured LLM response."""
    confidence_score: float
    reasoning: str
    semantic_similarity: float
    arbitrage_viability: float
    risk_assessment: str
    recommended_action: str
    processing_notes: Optional[str] = None


class EvaluationCache(BaseModel):
    """Cache for LLM evaluations."""
    pair_hash: str
    response: LLMResponse
    timestamp: datetime
    provider_used: LLMProvider
    model_version: str
    cost_usd: Optional[float] = None


class LLMEvaluationEngine(LoggerMixin):
    """
    LLM Evaluation Engine for deep semantic analysis of market pairs.
    
    Uses multiple LLM providers to evaluate market pair similarity and
    arbitrage potential through natural language understanding.
    """
    
    def __init__(self, config: Optional[LLMConfig] = None):
        self.config = config or LLMConfig()
        self.evaluation_cache: Dict[str, EvaluationCache] = {}
        self.cost_tracker = {"total_cost": 0.0, "requests_today": 0}
        self.rate_limiter = {"requests": [], "last_reset": datetime.utcnow()}
        
        # Initialize LLM clients
        self._initialize_clients()
        
    def _initialize_clients(self) -> None:
        """Initialize LLM provider clients."""
        try:
            if self.config.provider == LLMProvider.OPENAI:
                self.openai_client = openai.AsyncOpenAI(
                    api_key=settings.openai_api_key
                )
            elif self.config.provider == LLMProvider.ANTHROPIC:
                self.anthropic_client = anthropic.AsyncAnthropic(
                    api_key=settings.anthropic_api_key
                )
            elif self.config.provider == LLMProvider.VERTEX_AI:
                aiplatform.init(
                    project=settings.gcp_project_id,
                    location=settings.gcp_location
                )
                
        except Exception as e:
            self.logger.error(f"Failed to initialize LLM client: {e}")
            raise
    
    async def evaluate_market_pair(self, pair: MarketPair, ml_prediction: MLPrediction) -> LLMEvaluation:
        """Evaluate a single market pair using LLM."""
        
        # Check rate limits
        await self._check_rate_limits()
        
        # Check cache first
        pair_hash = self._generate_pair_hash(pair)
        cached_evaluation = self._get_cached_evaluation(pair_hash)
        
        if cached_evaluation:
            self.logger.debug(f"Using cached evaluation for pair {pair.kalshi_id}_{pair.polymarket_id}")
            return self._cache_to_evaluation(cached_evaluation, pair, ml_prediction)
        
        # Perform LLM evaluation
        try:
            llm_response = await self._query_llm(pair, ml_prediction)
            
            # Cache the response
            if self.config.enable_caching:
                self._cache_evaluation(pair_hash, llm_response)
            
            # Convert to LLMEvaluation
            evaluation = LLMEvaluation(
                market1_id=pair.kalshi_id,
                market2_id=pair.polymarket_id,
                pair_id=f"{pair.kalshi_id}_{pair.polymarket_id}",
                confidence_score=llm_response.confidence_score,
                semantic_similarity=llm_response.semantic_similarity,
                arbitrage_viability=llm_response.arbitrage_viability,
                reasoning=llm_response.reasoning,
                risk_assessment=llm_response.risk_assessment,
                recommended_action=llm_response.recommended_action,
                ml_score=ml_prediction.llm_worthiness_score,
                provider_used=self.config.provider.value,
                model_version=self.config.model_name,
                processing_time_ms=0,  # Would be measured in actual implementation
                evaluation_timestamp=datetime.utcnow()
            )
            
            self.logger.info(
                f"LLM evaluation complete",
                pair_id=evaluation.pair_id,
                confidence=evaluation.confidence_score,
                provider=self.config.provider.value
            )
            
            return evaluation
            
        except Exception as e:
            self.logger.error(f"LLM evaluation failed for pair {pair_hash}: {e}")
            
            # Return fallback evaluation
            return self._create_fallback_evaluation(pair, ml_prediction, str(e))
    
    async def evaluate_market_pairs_batch(
        self, 
        pairs_with_predictions: List[Tuple[MarketPair, MLPrediction]]
    ) -> List[LLMEvaluation]:
        """Evaluate multiple market pairs in batches."""
        
        self.logger.info(f"Starting batch LLM evaluation of {len(pairs_with_predictions)} pairs")
        
        evaluations = []
        total_batches = (len(pairs_with_predictions) + self.config.batch_size - 1) // self.config.batch_size
        
        for i in range(0, len(pairs_with_predictions), self.config.batch_size):
            batch = pairs_with_predictions[i:i + self.config.batch_size]
            batch_num = (i // self.config.batch_size) + 1
            
            self.logger.debug(f"Processing batch {batch_num}/{total_batches} with {len(batch)} pairs")
            
            # Process batch with concurrency control
            batch_tasks = [
                self.evaluate_market_pair(pair, prediction) 
                for pair, prediction in batch
            ]
            
            # Limit concurrent requests
            semaphore = asyncio.Semaphore(self.config.concurrent_requests)
            
            async def limited_evaluation(task):
                async with semaphore:
                    return await task
            
            batch_results = await asyncio.gather(
                *[limited_evaluation(task) for task in batch_tasks],
                return_exceptions=True
            )
            
            # Filter successful evaluations
            for result in batch_results:
                if isinstance(result, LLMEvaluation):
                    evaluations.append(result)
                else:
                    self.logger.warning(f"Batch evaluation failed: {result}")
            
            # Rate limiting between batches
            if batch_num < total_batches:
                await asyncio.sleep(1.0)  # Brief pause between batches
        
        # Filter by confidence threshold
        high_confidence_evaluations = [
            eval for eval in evaluations
            if eval.confidence_score >= self.config.min_confidence_threshold
        ]
        
        self.logger.info(
            f"Batch evaluation complete",
            total_evaluated=len(evaluations),
            high_confidence=len(high_confidence_evaluations),
            filter_rate=1 - (len(high_confidence_evaluations) / len(evaluations)) if evaluations else 0
        )
        
        return high_confidence_evaluations
    
    async def _query_llm(self, pair: MarketPair, ml_prediction: MLPrediction) -> LLMResponse:
        """Query the configured LLM provider."""
        
        prompt = self._create_evaluation_prompt(pair, ml_prediction)
        
        if self.config.provider == LLMProvider.OPENAI:
            return await self._query_openai(prompt)
        elif self.config.provider == LLMProvider.ANTHROPIC:
            return await self._query_anthropic(prompt)
        elif self.config.provider == LLMProvider.VERTEX_AI:
            return await self._query_vertex_ai(prompt)
        else:
            raise ValueError(f"Unsupported LLM provider: {self.config.provider}")
    
    async def _query_openai(self, prompt: str) -> LLMResponse:
        """Query OpenAI API."""
        
        response = await self.openai_client.chat.completions.create(
            model=self.config.model_name,
            messages=[
                {"role": "system", "content": self._get_system_prompt()},
                {"role": "user", "content": prompt}
            ],
            temperature=self.config.temperature,
            max_tokens=self.config.max_tokens
        )
        
        # Track cost
        if self.config.cost_tracking:
            estimated_cost = self._estimate_openai_cost(response)
            self.cost_tracker["total_cost"] += estimated_cost
        
        # Parse structured response
        content = response.choices[0].message.content
        return self._parse_llm_response(content)
    
    async def _query_anthropic(self, prompt: str) -> LLMResponse:
        """Query Anthropic API."""
        
        response = await self.anthropic_client.messages.create(
            model=self.config.model_name,
            max_tokens=self.config.max_tokens,
            temperature=self.config.temperature,
            messages=[
                {"role": "user", "content": f"{self._get_system_prompt()}\n\n{prompt}"}
            ]
        )
        
        # Track cost
        if self.config.cost_tracking:
            estimated_cost = self._estimate_anthropic_cost(response)
            self.cost_tracker["total_cost"] += estimated_cost
        
        # Parse structured response
        content = response.content[0].text
        return self._parse_llm_response(content)
    
    async def _query_vertex_ai(self, prompt: str) -> LLMResponse:
        """Query Vertex AI API."""
        # Vertex AI implementation would go here
        # This is a placeholder for the actual implementation
        raise NotImplementedError("Vertex AI integration not yet implemented")
    
    def _create_evaluation_prompt(self, pair: MarketPair, ml_prediction: MLPrediction) -> str:
        """Create evaluation prompt for LLM."""
        
        return f"""
Evaluate the following prediction market pair for arbitrage potential:

**Market Pair Information:**
- Kalshi Market: "{pair.kalshi_title}"
- Polymarket Market: "{pair.polymarket_title}"
- Price Difference: {pair.price_difference:.3f} ({float(pair.price_difference) * 100:.1f}%)
- Kalshi Price: ${pair.kalshi_price:.3f}
- Polymarket Price: ${pair.polymarket_price:.3f}
- Categories: {pair.kalshi_category} vs {pair.polymarket_category}
- Kalshi Volume: ${pair.kalshi_volume:,.0f}
- Polymarket Volume: ${pair.polymarket_volume:,.0f}
- Text Similarity: {pair.text_similarity:.2f}
- Closing Times: {pair.kalshi_close_time.strftime('%Y-%m-%d')} vs {pair.polymarket_close_time.strftime('%Y-%m-%d')}

**ML Prediction Score:** {ml_prediction.llm_worthiness_score:.3f}
**ML Confidence:** {ml_prediction.confidence_prediction:.3f}
**ML Features:** {json.dumps(ml_prediction.features.dict(), indent=2)}

**Evaluation Criteria:**
1. **Semantic Similarity**: Are these markets asking about the same event/outcome?
2. **Arbitrage Viability**: Is there genuine arbitrage potential considering transaction costs?
3. **Risk Assessment**: What are the key risks (timing, interpretation, liquidity)?
4. **Market Quality**: Are these liquid, well-defined markets?

Please provide your evaluation in the following JSON format:
```json
{{
    "confidence_score": <float 0-1>,
    "reasoning": "<detailed explanation>",
    "semantic_similarity": <float 0-1>,
    "arbitrage_viability": <float 0-1>,
    "risk_assessment": "<risk analysis>",
    "recommended_action": "<PROCEED|INVESTIGATE|REJECT>"
}}
```
"""
    
    def _get_system_prompt(self) -> str:
        """Get system prompt for LLM."""
        return """
You are an expert financial analyst specializing in prediction market arbitrage. Your task is to evaluate pairs of prediction markets from different platforms (Kalshi and Polymarket) to determine if they represent the same underlying event and offer genuine arbitrage opportunities.

Key considerations:
- Markets must be asking about the same specific event or outcome
- Price differences must exceed transaction costs (~2-3%)
- Markets should have sufficient liquidity
- Time alignment is important for risk management
- Consider regulatory and platform-specific risks

Be conservative in your evaluations - only recommend pairs with very high confidence.
"""
    
    def _parse_llm_response(self, content: str) -> LLMResponse:
        """Parse LLM response into structured format."""
        try:
            # Extract JSON from response
            start_idx = content.find('{')
            end_idx = content.rfind('}') + 1
            
            if start_idx != -1 and end_idx != -1:
                json_str = content[start_idx:end_idx]
                data = json.loads(json_str)
                
                return LLMResponse(
                    confidence_score=float(data.get('confidence_score', 0.0)),
                    reasoning=data.get('reasoning', 'No reasoning provided'),
                    semantic_similarity=float(data.get('semantic_similarity', 0.0)),
                    arbitrage_viability=float(data.get('arbitrage_viability', 0.0)),
                    risk_assessment=data.get('risk_assessment', 'No risk assessment'),
                    recommended_action=data.get('recommended_action', 'REJECT')
                )
            else:
                raise ValueError("No JSON found in response")
                
        except Exception as e:
            self.logger.warning(f"Failed to parse LLM response: {e}")
            
            # Fallback parsing from natural language
            return LLMResponse(
                confidence_score=0.5,  # Medium confidence as fallback
                reasoning=content[:500],  # Truncate for safety
                semantic_similarity=0.5,
                arbitrage_viability=0.5,
                risk_assessment="Unable to parse structured response",
                recommended_action="INVESTIGATE"
            )
    
    def _generate_pair_hash(self, pair: MarketPair) -> str:
        """Generate hash for market pair caching."""
        pair_string = f"{pair.kalshi_id}_{pair.polymarket_id}_{pair.kalshi_title}_{pair.polymarket_title}"
        return hashlib.md5(pair_string.encode()).hexdigest()
    
    def _get_cached_evaluation(self, pair_hash: str) -> Optional[EvaluationCache]:
        """Get cached evaluation if available and not expired."""
        if not self.config.enable_caching or pair_hash not in self.evaluation_cache:
            return None
        
        cached = self.evaluation_cache[pair_hash]
        cache_age = datetime.utcnow() - cached.timestamp
        
        if cache_age.total_seconds() > (self.config.cache_duration_hours * 3600):
            del self.evaluation_cache[pair_hash]
            return None
        
        return cached
    
    def _cache_evaluation(self, pair_hash: str, response: LLMResponse) -> None:
        """Cache LLM evaluation response."""
        self.evaluation_cache[pair_hash] = EvaluationCache(
            pair_hash=pair_hash,
            response=response,
            timestamp=datetime.utcnow(),
            provider_used=self.config.provider,
            model_version=self.config.model_name
        )
    
    def _cache_to_evaluation(
        self, 
        cached: EvaluationCache, 
        pair: MarketPair, 
        ml_prediction: MLPrediction
    ) -> LLMEvaluation:
        """Convert cached response to LLMEvaluation."""
        return LLMEvaluation(
            market1_id=pair.kalshi_id,
            market2_id=pair.polymarket_id,
            pair_id=f"{pair.kalshi_id}_{pair.polymarket_id}",
            confidence_score=cached.response.confidence_score,
            semantic_similarity=cached.response.semantic_similarity,
            arbitrage_viability=cached.response.arbitrage_viability,
            reasoning=f"[CACHED] {cached.response.reasoning}",
            risk_assessment=cached.response.risk_assessment,
            recommended_action=cached.response.recommended_action,
            ml_score=ml_prediction.llm_worthiness_score,
            provider_used=cached.provider_used.value,
            model_version=cached.model_version,
            processing_time_ms=0,
            evaluation_timestamp=cached.timestamp
        )
    
    def _create_fallback_evaluation(
        self, 
        pair: MarketPair, 
        ml_prediction: MLPrediction, 
        error: str
    ) -> LLMEvaluation:
        """Create fallback evaluation when LLM fails."""
        return LLMEvaluation(
            market1_id=pair.kalshi_id,
            market2_id=pair.polymarket_id,
            pair_id=f"{pair.kalshi_id}_{pair.polymarket_id}",
            confidence_score=0.0,  # Low confidence for fallback
            semantic_similarity=pair.text_similarity or 0.0,
            arbitrage_viability=float(pair.price_difference or 0),
            reasoning=f"LLM evaluation failed: {error}. Using fallback heuristics.",
            risk_assessment="High risk due to LLM evaluation failure",
            recommended_action="INVESTIGATE",
            ml_score=ml_prediction.llm_worthiness_score,
            provider_used="fallback",
            model_version="heuristic",
            processing_time_ms=0,
            evaluation_timestamp=datetime.utcnow()
        )
    
    async def _check_rate_limits(self) -> None:
        """Check and enforce rate limits."""
        current_time = datetime.utcnow()
        
        # Reset rate limiter if needed
        if (current_time - self.rate_limiter["last_reset"]).total_seconds() >= 60:
            self.rate_limiter["requests"] = []
            self.rate_limiter["last_reset"] = current_time
        
        # Remove old requests
        cutoff_time = current_time - timedelta(minutes=1)
        self.rate_limiter["requests"] = [
            req_time for req_time in self.rate_limiter["requests"]
            if req_time > cutoff_time
        ]
        
        # Check if we're over the limit
        if len(self.rate_limiter["requests"]) >= self.config.requests_per_minute:
            wait_time = 60 - (current_time - min(self.rate_limiter["requests"])).total_seconds()
            if wait_time > 0:
                self.logger.info(f"Rate limit reached, waiting {wait_time:.1f} seconds")
                await asyncio.sleep(wait_time)
        
        # Record this request
        self.rate_limiter["requests"].append(current_time)
    
    def _estimate_openai_cost(self, response) -> float:
        """Estimate OpenAI API cost."""
        # Simplified cost estimation
        prompt_tokens = response.usage.prompt_tokens
        completion_tokens = response.usage.completion_tokens
        
        # GPT-4 pricing (approximate)
        prompt_cost = (prompt_tokens / 1000) * 0.03
        completion_cost = (completion_tokens / 1000) * 0.06
        
        return prompt_cost + completion_cost
    
    def _estimate_anthropic_cost(self, response) -> float:
        """Estimate Anthropic API cost."""
        # Simplified cost estimation for Claude
        input_tokens = response.usage.input_tokens
        output_tokens = response.usage.output_tokens
        
        # Claude pricing (approximate)
        input_cost = (input_tokens / 1000) * 0.008
        output_cost = (output_tokens / 1000) * 0.024
        
        return input_cost + output_cost
    
    def get_evaluation_statistics(self) -> Dict[str, Any]:
        """Get evaluation statistics."""
        total_cached = len(self.evaluation_cache)
        cache_hit_rate = 0.0  # Would be calculated based on actual usage
        
        return {
            "provider": self.config.provider.value,
            "model": self.config.model_name,
            "total_cached_evaluations": total_cached,
            "cache_hit_rate": cache_hit_rate,
            "total_cost_usd": self.cost_tracker["total_cost"],
            "requests_today": self.cost_tracker["requests_today"],
            "rate_limit_status": {
                "requests_per_minute": self.config.requests_per_minute,
                "current_requests": len(self.rate_limiter["requests"])
            }
        }
    
    def clear_cache(self) -> None:
        """Clear evaluation cache."""
        self.evaluation_cache.clear()
        self.logger.info("Evaluation cache cleared")
    
    def get_cost_summary(self) -> Dict[str, Any]:
        """Get cost tracking summary."""
        return {
            "total_cost_usd": self.cost_tracker["total_cost"],
            "cost_per_evaluation": (
                self.cost_tracker["total_cost"] / max(1, self.cost_tracker["requests_today"])
            ),
            "daily_requests": self.cost_tracker["requests_today"],
            "estimated_monthly_cost": self.cost_tracker["total_cost"] * 30
        }