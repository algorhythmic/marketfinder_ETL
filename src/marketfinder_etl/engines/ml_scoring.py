"""
ML-Enhanced Scoring Engine - Layer 3 of Multi-Layer Comparison Architecture

This engine uses machine learning to predict LLM evaluation success,
reducing the comparison space from 50K to ~1K pairs (98% reduction).
"""

import asyncio
import pickle
import numpy as np
from typing import Any, Dict, List, Optional, Tuple, Union
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
import joblib

from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score
import pandas as pd

from marketfinder_etl.core.logging import LoggerMixin
from marketfinder_etl.core.config import settings
from marketfinder_etl.models.arbitrage import MLFeatures, MLPrediction
from marketfinder_etl.engines.filtering import MarketPair


class MLModelConfig:
    """Configuration for ML model training and inference."""
    
    def __init__(self):
        # Model parameters
        self.model_type = "gradient_boosting"  # or "random_forest"
        self.n_estimators = 100
        self.max_depth = 6
        self.learning_rate = 0.1
        self.random_state = 42
        
        # Training parameters
        self.test_size = 0.2
        self.validation_size = 0.2
        self.min_training_samples = 100
        
        # Feature engineering
        self.feature_scaling = True
        self.feature_selection = True
        self.max_features = 20
        
        # Model persistence
        self.model_save_path = Path("models")
        self.model_filename = "arbitrage_ml_model.joblib"
        self.scaler_filename = "feature_scaler.joblib"
        
        # Performance thresholds
        self.min_model_accuracy = 0.7
        self.prediction_threshold = 0.3
        self.high_confidence_threshold = 0.8


class ModelMetrics:
    """Model performance metrics."""
    
    def __init__(self):
        self.accuracy: float = 0.0
        self.precision: float = 0.0
        self.recall: float = 0.0
        self.f1_score: float = 0.0
        self.roc_auc: float = 0.0
        self.cross_val_score: float = 0.0
        self.feature_importance: Dict[str, float] = {}
        self.training_time: float = 0.0
        self.model_version: str = "1.0"
        self.trained_at: datetime = datetime.utcnow()


class MLScoringEngine(LoggerMixin):
    """
    ML-Enhanced Scoring Engine for predicting LLM evaluation success.
    
    Uses gradient boosting to predict which market pairs are most likely
    to receive high confidence scores from LLM evaluation, allowing us to
    prioritize the most promising candidates.
    """
    
    def __init__(self, config: Optional[MLModelConfig] = None):
        self.config = config or MLModelConfig()
        self.model: Optional[Union[GradientBoostingClassifier, RandomForestClassifier]] = None
        self.scaler: Optional[StandardScaler] = None
        self.metrics: Optional[ModelMetrics] = None
        self.feature_names: List[str] = []
        
        # Load existing model if available
        self._load_model()
    
    async def score_market_pair(self, pair: MarketPair) -> MLPrediction:
        """Score a market pair using the ML model."""
        
        # Extract features
        features = self._extract_features(pair)
        
        # Make prediction
        if self.model is None:
            # Use heuristic scoring if no model is available
            llm_worthiness_score = self._heuristic_scoring(features)
            confidence_prediction = llm_worthiness_score * 0.8  # Conservative estimate
            explanation = "Heuristic scoring (no ML model available)"
        else:
            # Use trained ML model
            feature_vector = self._features_to_vector(features)
            llm_worthiness_score = float(self.model.predict_proba([feature_vector])[0][1])
            confidence_prediction = min(0.9, llm_worthiness_score + 0.1)
            explanation = self._generate_ml_explanation(features, llm_worthiness_score)
        
        return MLPrediction(
            market1_id=pair.kalshi_id,
            market2_id=pair.polymarket_id,
            pair_id=f"{pair.kalshi_id}_{pair.polymarket_id}",
            llm_worthiness_score=llm_worthiness_score,
            confidence_prediction=confidence_prediction,
            probability_threshold=self.config.prediction_threshold,
            model_version=self.metrics.model_version if self.metrics else "heuristic",
            features=features,
            explanation=explanation
        )
    
    def _extract_features(self, pair: MarketPair) -> MLFeatures:
        """Extract comprehensive features for ML prediction."""
        
        # Text similarity features
        jaccard_similarity = pair.text_similarity or 0.0
        cosine_similarity = self._calculate_cosine_similarity(pair.kalshi_title, pair.polymarket_title)
        keyword_overlap_count = self._count_keyword_overlap(pair.kalshi_title, pair.polymarket_title)
        
        # Market features
        price_difference = float(pair.price_difference or 0)
        volume_ratio = self._calculate_volume_ratio(pair.kalshi_volume, pair.polymarket_volume)
        category_match = pair.kalshi_category.lower() == pair.polymarket_category.lower()
        
        # Temporal features
        close_time_difference_hours = self._calculate_time_difference_hours(
            pair.kalshi_close_time, pair.polymarket_close_time
        )
        both_closing_soon = self._check_both_closing_soon(
            pair.kalshi_close_time, pair.polymarket_close_time
        )
        
        # Platform features
        kalshi_liquidity_score = float(pair.liquidity_score or 0) * 0.6  # Kalshi portion
        polymarket_liquidity_score = float(pair.liquidity_score or 0) * 0.4  # Polymarket portion
        
        # Historical features (would be computed from historical data)
        bucket_historical_success_rate = self._get_bucket_success_rate(pair.bucket_name)
        similar_pair_confidence = self._get_similar_pair_confidence(pair)
        
        return MLFeatures(
            jaccard_similarity=jaccard_similarity,
            cosine_similarity=cosine_similarity,
            keyword_overlap_count=keyword_overlap_count,
            price_difference=Decimal(str(price_difference)),
            volume_ratio=volume_ratio,
            category_match=category_match,
            close_time_difference_hours=close_time_difference_hours,
            both_closing_soon=both_closing_soon,
            kalshi_liquidity_score=kalshi_liquidity_score,
            polymarket_liquidity_score=polymarket_liquidity_score,
            bucket_historical_success_rate=bucket_historical_success_rate,
            similar_pair_confidence=similar_pair_confidence
        )
    
    def _calculate_cosine_similarity(self, text1: str, text2: str) -> float:
        """Calculate cosine similarity between two texts (simplified)."""
        if not text1 or not text2:
            return 0.0
        
        # Simple bag-of-words cosine similarity
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        
        # Intersection over geometric mean
        intersection = len(words1.intersection(words2))
        if intersection == 0:
            return 0.0
        
        return intersection / (len(words1) * len(words2)) ** 0.5
    
    def _count_keyword_overlap(self, text1: str, text2: str) -> int:
        """Count overlapping keywords between two texts."""
        if not text1 or not text2:
            return 0
        
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        
        # Remove common stop words
        stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'}
        words1 = words1 - stop_words
        words2 = words2 - stop_words
        
        return len(words1.intersection(words2))
    
    def _calculate_volume_ratio(self, volume1: Decimal, volume2: Decimal) -> float:
        """Calculate ratio of smaller to larger volume."""
        vol1 = float(volume1)
        vol2 = float(volume2)
        
        if vol1 == 0 and vol2 == 0:
            return 0.0
        
        min_vol = min(vol1, vol2)
        max_vol = max(vol1, vol2)
        
        return min_vol / max_vol if max_vol > 0 else 0.0
    
    def _calculate_time_difference_hours(self, time1: datetime, time2: datetime) -> float:
        """Calculate time difference in hours."""
        return abs((time1 - time2).total_seconds()) / 3600
    
    def _check_both_closing_soon(self, time1: datetime, time2: datetime) -> bool:
        """Check if both markets are closing within 24 hours."""
        current_time = datetime.utcnow()
        threshold = timedelta(hours=24)
        
        time1_soon = (time1 - current_time) <= threshold
        time2_soon = (time2 - current_time) <= threshold
        
        return time1_soon and time2_soon
    
    def _get_bucket_success_rate(self, bucket_name: str) -> float:
        """Get historical success rate for this bucket (placeholder)."""
        # This would query historical data in a real implementation
        bucket_rates = {
            'politics_trump_2024': 0.85,
            'crypto_bitcoin_price': 0.75,
            'sports_nfl_2024': 0.70,
            'economics_fed_rates': 0.80,
        }
        return bucket_rates.get(bucket_name, 0.6)  # Default 60%
    
    def _get_similar_pair_confidence(self, pair: MarketPair) -> float:
        """Get confidence from similar historical pairs (placeholder)."""
        # This would use similarity search on historical pairs
        return 0.7  # Default confidence
    
    def _features_to_vector(self, features: MLFeatures) -> np.ndarray:
        """Convert MLFeatures to numpy array for model input."""
        feature_vector = np.array([
            features.jaccard_similarity,
            features.cosine_similarity,
            features.keyword_overlap_count,
            float(features.price_difference),
            features.volume_ratio,
            float(features.category_match),
            features.close_time_difference_hours,
            float(features.both_closing_soon),
            features.kalshi_liquidity_score,
            features.polymarket_liquidity_score,
            features.bucket_historical_success_rate,
            features.similar_pair_confidence
        ])
        
        # Apply scaling if available
        if self.scaler:
            feature_vector = self.scaler.transform([feature_vector])[0]
        
        return feature_vector
    
    def _heuristic_scoring(self, features: MLFeatures) -> float:
        """Heuristic scoring when no ML model is available."""
        score = 0.0
        
        # Text similarity (0-40 points)
        text_score = (features.jaccard_similarity * 0.6 + features.cosine_similarity * 0.4)
        score += text_score * 40
        
        # Price difference (0-30 points)
        price_score = min(1.0, float(features.price_difference) * 10)  # Cap at 10% difference
        score += price_score * 30
        
        # Category match (0-20 points)
        if features.category_match:
            score += 20
        
        # Volume ratio (0-10 points)
        score += features.volume_ratio * 10
        
        return min(1.0, score / 100)
    
    def _generate_ml_explanation(self, features: MLFeatures, score: float) -> str:
        """Generate explanation for ML prediction."""
        explanations = []
        
        if features.jaccard_similarity > 0.5:
            explanations.append(f"High text similarity ({features.jaccard_similarity:.2f})")
        
        if float(features.price_difference) > 0.05:
            explanations.append(f"Significant price difference ({features.price_difference:.3f})")
        
        if features.category_match:
            explanations.append("Categories match")
        
        if features.both_closing_soon:
            explanations.append("Both markets closing soon")
        
        if features.bucket_historical_success_rate > 0.8:
            explanations.append("High bucket success rate")
        
        if not explanations:
            explanations.append("Low confidence prediction")
        
        return f"ML Score: {score:.2f} - " + ", ".join(explanations)
    
    async def train_model(self, training_data: List[Tuple[MarketPair, float]]) -> ModelMetrics:
        """Train the ML model on historical data."""
        self.logger.info(f"Training ML model with {len(training_data)} samples")
        
        if len(training_data) < self.config.min_training_samples:
            raise ValueError(f"Insufficient training data: {len(training_data)} < {self.config.min_training_samples}")
        
        start_time = datetime.utcnow()
        
        # Prepare training data
        X, y = self._prepare_training_data(training_data)
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=self.config.test_size, random_state=self.config.random_state
        )
        
        # Feature scaling
        if self.config.feature_scaling:
            self.scaler = StandardScaler()
            X_train = self.scaler.fit_transform(X_train)
            X_test = self.scaler.transform(X_test)
        
        # Train model
        if self.config.model_type == "gradient_boosting":
            self.model = GradientBoostingClassifier(
                n_estimators=self.config.n_estimators,
                max_depth=self.config.max_depth,
                learning_rate=self.config.learning_rate,
                random_state=self.config.random_state
            )
        else:
            self.model = RandomForestClassifier(
                n_estimators=self.config.n_estimators,
                max_depth=self.config.max_depth,
                random_state=self.config.random_state
            )
        
        self.model.fit(X_train, y_train)
        
        # Evaluate model
        y_pred = self.model.predict(X_test)
        y_pred_proba = self.model.predict_proba(X_test)[:, 1]
        
        # Calculate metrics
        metrics = ModelMetrics()
        metrics.accuracy = accuracy_score(y_test, y_pred)
        metrics.precision = precision_score(y_test, y_pred)
        metrics.recall = recall_score(y_test, y_pred)
        metrics.f1_score = f1_score(y_test, y_pred)
        metrics.roc_auc = roc_auc_score(y_test, y_pred_proba)
        metrics.cross_val_score = cross_val_score(self.model, X_train, y_train, cv=5).mean()
        metrics.training_time = (datetime.utcnow() - start_time).total_seconds()
        
        # Feature importance
        if hasattr(self.model, 'feature_importances_'):
            feature_importance = dict(zip(self.feature_names, self.model.feature_importances_))
            metrics.feature_importance = dict(sorted(feature_importance.items(), key=lambda x: x[1], reverse=True))
        
        self.metrics = metrics
        
        # Save model
        self._save_model()
        
        self.logger.info(
            f"Model training complete",
            accuracy=metrics.accuracy,
            precision=metrics.precision,
            recall=metrics.recall,
            f1_score=metrics.f1_score,
            roc_auc=metrics.roc_auc,
            training_time=metrics.training_time
        )
        
        return metrics
    
    def _prepare_training_data(self, training_data: List[Tuple[MarketPair, float]]) -> Tuple[np.ndarray, np.ndarray]:
        """Prepare training data for the ML model."""
        X = []
        y = []
        
        for pair, confidence in training_data:
            features = self._extract_features(pair)
            feature_vector = self._features_to_vector(features)
            
            # Convert confidence to binary classification (high/low confidence)
            label = 1 if confidence >= self.config.high_confidence_threshold else 0
            
            X.append(feature_vector)
            y.append(label)
        
        # Store feature names
        self.feature_names = [
            'jaccard_similarity', 'cosine_similarity', 'keyword_overlap_count',
            'price_difference', 'volume_ratio', 'category_match',
            'close_time_difference_hours', 'both_closing_soon',
            'kalshi_liquidity_score', 'polymarket_liquidity_score',
            'bucket_historical_success_rate', 'similar_pair_confidence'
        ]
        
        return np.array(X), np.array(y)
    
    def _save_model(self) -> None:
        """Save the trained model and scaler."""
        self.config.model_save_path.mkdir(exist_ok=True)
        
        if self.model:
            model_path = self.config.model_save_path / self.config.model_filename
            joblib.dump(self.model, model_path)
            self.logger.info(f"Model saved to {model_path}")
        
        if self.scaler:
            scaler_path = self.config.model_save_path / self.config.scaler_filename
            joblib.dump(self.scaler, scaler_path)
            self.logger.info(f"Scaler saved to {scaler_path}")
    
    def _load_model(self) -> None:
        """Load existing model and scaler if available."""
        model_path = self.config.model_save_path / self.config.model_filename
        scaler_path = self.config.model_save_path / self.config.scaler_filename
        
        try:
            if model_path.exists():
                self.model = joblib.load(model_path)
                self.logger.info(f"Model loaded from {model_path}")
            
            if scaler_path.exists():
                self.scaler = joblib.load(scaler_path)
                self.logger.info(f"Scaler loaded from {scaler_path}")
                
        except Exception as e:
            self.logger.warning(f"Failed to load model: {e}")
            self.model = None
            self.scaler = None
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get information about the current model."""
        if not self.model or not self.metrics:
            return {"status": "no_model_available"}
        
        return {
            "status": "model_available",
            "model_type": type(self.model).__name__,
            "metrics": {
                "accuracy": self.metrics.accuracy,
                "precision": self.metrics.precision,
                "recall": self.metrics.recall,
                "f1_score": self.metrics.f1_score,
                "roc_auc": self.metrics.roc_auc,
                "cross_val_score": self.metrics.cross_val_score
            },
            "feature_importance": self.metrics.feature_importance,
            "trained_at": self.metrics.trained_at.isoformat(),
            "model_version": self.metrics.model_version
        }
    
    def update_model_with_new_data(self, new_data: List[Tuple[MarketPair, float]]) -> None:
        """Update model with new LLM evaluation results."""
        if not new_data:
            return
        
        self.logger.info(f"Updating model with {len(new_data)} new samples")
        
        # In a production system, this would:
        # 1. Combine new data with existing training data
        # 2. Retrain the model
        # 3. Evaluate if the new model is better
        # 4. Deploy the new model if it improves performance
        
        # For now, just log the update
        self.logger.info("Model update completed (placeholder implementation)")
    
    @property
    def current_model_accuracy(self) -> float:
        """Get current model accuracy."""
        if self.metrics:
            return self.metrics.accuracy
        return 0.0