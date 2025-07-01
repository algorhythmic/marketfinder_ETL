"""
Model Lifecycle Management - Automated model retraining and lifecycle management

This module provides comprehensive ML model lifecycle management including
automated retraining, performance monitoring, A/B testing, and model deployment.
"""

import asyncio
import joblib
import numpy as np
import pandas as pd
from typing import Any, Dict, List, Optional, Callable, Union, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from enum import Enum
from pathlib import Path
import json
import hashlib
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from sklearn.model_selection import train_test_split

from pydantic import BaseModel

from marketfinder_etl.core.logging import LoggerMixin


class ModelStatus(str, Enum):
    """Model lifecycle status."""
    TRAINING = "training"
    VALIDATION = "validation"
    TESTING = "testing"
    DEPLOYED = "deployed"
    DEPRECATED = "deprecated"
    FAILED = "failed"


class RetrainingTrigger(str, Enum):
    """Triggers for model retraining."""
    SCHEDULED = "scheduled"
    PERFORMANCE_DEGRADATION = "performance_degradation"
    DATA_DRIFT = "data_drift"
    MANUAL = "manual"
    NEW_DATA_AVAILABLE = "new_data_available"


class ModelType(str, Enum):
    """Types of ML models."""
    SIMILARITY = "similarity"
    ARBITRAGE_CLASSIFIER = "arbitrage_classifier"
    PROFIT_PREDICTOR = "profit_predictor"
    RISK_ASSESSOR = "risk_assessor"
    MARKET_MATCHER = "market_matcher"


@dataclass
class ModelMetrics:
    """Model performance metrics."""
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    mse: Optional[float] = None
    mae: Optional[float] = None
    custom_metrics: Dict[str, float] = None
    
    def __post_init__(self):
        if self.custom_metrics is None:
            self.custom_metrics = {}


@dataclass
class ModelConfig:
    """Model configuration and hyperparameters."""
    model_type: ModelType
    algorithm: str
    hyperparameters: Dict[str, Any]
    feature_columns: List[str]
    target_column: str
    validation_split: float = 0.2
    test_split: float = 0.1
    
    # Retraining configuration
    min_samples_for_retrain: int = 1000
    performance_threshold: float = 0.8
    retraining_schedule_hours: int = 24
    max_training_time_minutes: int = 60


class ModelVersion(BaseModel):
    """Model version metadata."""
    version_id: str
    model_type: ModelType
    trained_at: datetime
    status: ModelStatus
    
    # Performance
    metrics: Dict[str, float]
    validation_metrics: Dict[str, float]
    
    # Data
    training_samples: int
    feature_count: int
    data_hash: str
    
    # Deployment
    is_active: bool = False
    deployment_timestamp: Optional[datetime] = None
    
    # Files
    model_path: str
    config_path: str
    metadata_path: str


class RetrainingJob(BaseModel):
    """Retraining job details."""
    job_id: str
    trigger: RetrainingTrigger
    model_type: ModelType
    started_at: datetime
    completed_at: Optional[datetime] = None
    
    # Status
    status: str = "running"
    progress_percentage: float = 0.0
    
    # Results
    old_version_id: Optional[str] = None
    new_version_id: Optional[str] = None
    improvement_metrics: Dict[str, float] = {}
    
    # Configuration
    config: Dict[str, Any] = {}
    
    # Logs
    logs: List[str] = []


class ModelLifecycleManager(LoggerMixin):
    """
    Automated Model Lifecycle Manager for ML models.
    
    Handles model training, validation, deployment, monitoring, and automated
    retraining based on performance degradation or scheduled intervals.
    """
    
    def __init__(self, model_storage_path: str = "models"):
        self.model_storage_path = Path(model_storage_path)
        self.model_storage_path.mkdir(parents=True, exist_ok=True)
        
        # Model registry
        self.model_configs: Dict[ModelType, ModelConfig] = {}
        self.model_versions: Dict[str, ModelVersion] = {}
        self.active_models: Dict[ModelType, str] = {}  # model_type -> version_id
        
        # Retraining management
        self.retraining_jobs: Dict[str, RetrainingJob] = {}
        self.is_monitoring = False
        self.monitoring_task: Optional[asyncio.Task] = None
        
        # Performance tracking
        self.performance_history: Dict[str, List[Dict]] = {}
        self.data_drift_detection: Dict[ModelType, Dict] = {}
        
        # Callbacks
        self.retraining_callbacks: List[Callable] = []
        self.deployment_callbacks: List[Callable] = []
        
        # Initialize default configurations
        self._initialize_default_configs()
    
    def _initialize_default_configs(self) -> None:
        """Initialize default model configurations."""
        
        # Similarity model configuration
        self.model_configs[ModelType.SIMILARITY] = ModelConfig(
            model_type=ModelType.SIMILARITY,
            algorithm="random_forest",
            hyperparameters={
                "n_estimators": 100,
                "max_depth": 10,
                "min_samples_split": 5,
                "random_state": 42
            },
            feature_columns=[
                "title_similarity", "category_similarity", "description_similarity",
                "price_difference", "volume_ratio", "platform_reliability"
            ],
            target_column="is_match",
            performance_threshold=0.85
        )
        
        # Arbitrage classifier configuration
        self.model_configs[ModelType.ARBITRAGE_CLASSIFIER] = ModelConfig(
            model_type=ModelType.ARBITRAGE_CLASSIFIER,
            algorithm="gradient_boosting",
            hyperparameters={
                "n_estimators": 200,
                "learning_rate": 0.1,
                "max_depth": 8,
                "random_state": 42
            },
            feature_columns=[
                "price_spread", "volume_total", "market_maturity",
                "platform_liquidity", "time_to_expiry", "volatility"
            ],
            target_column="is_arbitrage_opportunity",
            performance_threshold=0.75
        )
        
        # Profit predictor configuration
        self.model_configs[ModelType.PROFIT_PREDICTOR] = ModelConfig(
            model_type=ModelType.PROFIT_PREDICTOR,
            algorithm="xgboost",
            hyperparameters={
                "n_estimators": 300,
                "learning_rate": 0.05,
                "max_depth": 6,
                "subsample": 0.8,
                "random_state": 42
            },
            feature_columns=[
                "price_spread", "volume_total", "market_activity",
                "historical_volatility", "time_factors", "liquidity_depth"
            ],
            target_column="actual_profit_percentage",
            performance_threshold=0.7
        )
    
    async def start_monitoring(self) -> None:
        """Start automated model monitoring and retraining."""
        
        if self.is_monitoring:
            return
        
        self.is_monitoring = True
        self.monitoring_task = asyncio.create_task(self._monitoring_loop())
        
        self.logger.info("Model lifecycle monitoring started")
    
    async def stop_monitoring(self) -> None:
        """Stop automated monitoring."""
        
        if not self.is_monitoring:
            return
        
        self.is_monitoring = False
        
        if self.monitoring_task and not self.monitoring_task.done():
            self.monitoring_task.cancel()
            try:
                await self.monitoring_task
            except asyncio.CancelledError:
                pass
        
        self.logger.info("Model lifecycle monitoring stopped")
    
    async def _monitoring_loop(self) -> None:
        """Main monitoring loop for automated retraining."""
        
        while self.is_monitoring:
            try:
                # Check scheduled retraining
                await self._check_scheduled_retraining()
                
                # Check performance degradation
                await self._check_performance_degradation()
                
                # Check data drift
                await self._check_data_drift()
                
                # Clean up old models
                await self._cleanup_old_models()
                
                # Sleep for monitoring interval
                await asyncio.sleep(3600)  # Check every hour
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error in monitoring loop: {e}")
                await asyncio.sleep(300)  # Wait 5 minutes on error
    
    async def _check_scheduled_retraining(self) -> None:
        """Check if any models need scheduled retraining."""
        
        current_time = datetime.utcnow()
        
        for model_type, config in self.model_configs.items():
            if model_type not in self.active_models:
                continue
                
            version_id = self.active_models[model_type]
            model_version = self.model_versions[version_id]
            
            # Check if retraining is due
            hours_since_training = (current_time - model_version.trained_at).total_seconds() / 3600
            
            if hours_since_training >= config.retraining_schedule_hours:
                await self.trigger_retraining(model_type, RetrainingTrigger.SCHEDULED)
    
    async def _check_performance_degradation(self) -> None:
        """Check for model performance degradation."""
        
        for model_type in self.active_models:
            await self._evaluate_model_performance(model_type)
    
    async def _check_data_drift(self) -> None:
        """Check for data drift requiring retraining."""
        
        # This would implement statistical tests for data drift
        # For now, we'll use a placeholder implementation
        
        for model_type in self.model_configs:
            drift_detected = await self._detect_data_drift(model_type)
            if drift_detected:
                await self.trigger_retraining(model_type, RetrainingTrigger.DATA_DRIFT)
    
    async def _detect_data_drift(self, model_type: ModelType) -> bool:
        """Detect data drift for a model type."""
        
        # Placeholder implementation
        # In practice, this would compare recent data distributions
        # with training data distributions using statistical tests
        
        return False  # No drift detected for now
    
    async def trigger_retraining(
        self, 
        model_type: ModelType, 
        trigger: RetrainingTrigger,
        override_config: Optional[Dict[str, Any]] = None
    ) -> str:
        """Trigger model retraining."""
        
        if model_type not in self.model_configs:
            raise ValueError(f"No configuration found for model type: {model_type}")
        
        # Create retraining job
        job_id = f"retrain_{model_type.value}_{int(datetime.utcnow().timestamp())}"
        
        old_version_id = self.active_models.get(model_type)
        
        job = RetrainingJob(
            job_id=job_id,
            trigger=trigger,
            model_type=model_type,
            started_at=datetime.utcnow(),
            old_version_id=old_version_id,
            config=override_config or {}
        )
        
        self.retraining_jobs[job_id] = job
        
        # Start retraining task
        asyncio.create_task(self._execute_retraining(job))
        
        self.logger.info(f"Triggered retraining for {model_type.value} (trigger: {trigger.value})")
        
        return job_id
    
    async def _execute_retraining(self, job: RetrainingJob) -> None:
        """Execute model retraining job."""
        
        try:
            config = self.model_configs[job.model_type]
            
            # Update job status
            job.status = "preparing_data"
            job.progress_percentage = 10.0
            job.logs.append("Starting data preparation")
            
            # Prepare training data
            training_data = await self._prepare_training_data(job.model_type)
            if training_data is None or len(training_data) < config.min_samples_for_retrain:
                job.status = "failed"
                job.logs.append(f"Insufficient training data: {len(training_data) if training_data is not None else 0} samples")
                return
            
            # Split data
            job.status = "splitting_data"
            job.progress_percentage = 20.0
            X_train, X_val, X_test, y_train, y_val, y_test = await self._split_data(training_data, config)
            
            # Train model
            job.status = "training"
            job.progress_percentage = 30.0
            job.logs.append(f"Training model with {len(X_train)} samples")
            
            model = await self._train_model(X_train, y_train, config)
            
            # Validate model
            job.status = "validation"
            job.progress_percentage = 70.0
            job.logs.append("Validating model performance")
            
            validation_metrics = await self._validate_model(model, X_val, y_val, config)
            
            # Test model
            job.status = "testing"
            job.progress_percentage = 85.0
            test_metrics = await self._test_model(model, X_test, y_test, config)
            
            # Check if new model is better
            if await self._is_model_improved(job.model_type, validation_metrics):
                # Save and deploy new model
                job.status = "deploying"
                job.progress_percentage = 95.0
                
                new_version = await self._save_model_version(
                    model, config, training_data, validation_metrics, test_metrics
                )
                
                await self._deploy_model(new_version)
                
                job.new_version_id = new_version.version_id
                job.improvement_metrics = self._calculate_improvement_metrics(
                    job.model_type, validation_metrics
                )
                
                job.logs.append(f"Deployed new model version: {new_version.version_id}")
                
                # Notify callbacks
                for callback in self.deployment_callbacks:
                    try:
                        await callback(new_version)
                    except Exception as e:
                        self.logger.error(f"Deployment callback error: {e}")
            
            else:
                job.logs.append("New model did not improve performance - keeping current model")
            
            job.status = "completed"
            job.progress_percentage = 100.0
            job.completed_at = datetime.utcnow()
            
            self.logger.info(f"Retraining completed for {job.model_type.value}")
            
        except Exception as e:
            job.status = "failed"
            job.logs.append(f"Training failed: {str(e)}")
            self.logger.error(f"Model retraining failed: {e}")
        
        # Notify callbacks
        for callback in self.retraining_callbacks:
            try:
                await callback(job)
            except Exception as e:
                self.logger.error(f"Retraining callback error: {e}")
    
    async def _prepare_training_data(self, model_type: ModelType) -> Optional[pd.DataFrame]:
        """Prepare training data for model type."""
        
        # This would fetch and prepare data from your data sources
        # For now, we'll create synthetic data for demonstration
        
        config = self.model_configs[model_type]
        
        # Generate synthetic training data
        np.random.seed(42)
        n_samples = 2000
        
        data = {}
        for feature in config.feature_columns:
            data[feature] = np.random.normal(0, 1, n_samples)
        
        # Generate target based on features
        if config.target_column == "is_match":
            data[config.target_column] = (data["title_similarity"] + data["category_similarity"] > 0).astype(int)
        elif config.target_column == "is_arbitrage_opportunity":
            data[config.target_column] = (data["price_spread"] > 0.5).astype(int)
        else:
            data[config.target_column] = np.random.normal(0.05, 0.02, n_samples)
        
        return pd.DataFrame(data)
    
    async def _split_data(
        self, 
        data: pd.DataFrame, 
        config: ModelConfig
    ) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.Series, pd.Series, pd.Series]:
        """Split data into train/validation/test sets."""
        
        X = data[config.feature_columns]
        y = data[config.target_column]
        
        # First split: separate test set
        X_temp, X_test, y_temp, y_test = train_test_split(
            X, y, test_size=config.test_split, random_state=42
        )
        
        # Second split: separate train and validation
        val_size = config.validation_split / (1 - config.test_split)
        X_train, X_val, y_train, y_val = train_test_split(
            X_temp, y_temp, test_size=val_size, random_state=42
        )
        
        return X_train, X_val, X_test, y_train, y_val, y_test
    
    async def _train_model(self, X_train: pd.DataFrame, y_train: pd.Series, config: ModelConfig) -> Any:
        """Train model with given data and configuration."""
        
        # Import appropriate model based on algorithm
        if config.algorithm == "random_forest":
            from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
            if config.target_column in ["is_match", "is_arbitrage_opportunity"]:
                model = RandomForestClassifier(**config.hyperparameters)
            else:
                model = RandomForestRegressor(**config.hyperparameters)
                
        elif config.algorithm == "gradient_boosting":
            from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
            if config.target_column in ["is_match", "is_arbitrage_opportunity"]:
                model = GradientBoostingClassifier(**config.hyperparameters)
            else:
                model = GradientBoostingRegressor(**config.hyperparameters)
                
        elif config.algorithm == "xgboost":
            try:
                import xgboost as xgb
                if config.target_column in ["is_match", "is_arbitrage_opportunity"]:
                    model = xgb.XGBClassifier(**config.hyperparameters)
                else:
                    model = xgb.XGBRegressor(**config.hyperparameters)
            except ImportError:
                # Fallback to sklearn if xgboost not available
                from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
                if config.target_column in ["is_match", "is_arbitrage_opportunity"]:
                    model = GradientBoostingClassifier()
                else:
                    model = GradientBoostingRegressor()
        
        else:
            raise ValueError(f"Unsupported algorithm: {config.algorithm}")
        
        # Train the model
        model.fit(X_train, y_train)
        
        return model
    
    async def _validate_model(
        self, 
        model: Any, 
        X_val: pd.DataFrame, 
        y_val: pd.Series, 
        config: ModelConfig
    ) -> ModelMetrics:
        """Validate model performance."""
        
        predictions = model.predict(X_val)
        
        if config.target_column in ["is_match", "is_arbitrage_opportunity"]:
            # Classification metrics
            accuracy = accuracy_score(y_val, predictions)
            precision = precision_score(y_val, predictions, average='weighted', zero_division=0)
            recall = recall_score(y_val, predictions, average='weighted', zero_division=0)
            f1 = f1_score(y_val, predictions, average='weighted', zero_division=0)
            
            return ModelMetrics(
                accuracy=accuracy,
                precision=precision,
                recall=recall,
                f1_score=f1
            )
        else:
            # Regression metrics
            from sklearn.metrics import mean_squared_error, mean_absolute_error
            mse = mean_squared_error(y_val, predictions)
            mae = mean_absolute_error(y_val, predictions)
            
            # Use MAE as accuracy proxy for regression
            accuracy = 1.0 - mae
            
            return ModelMetrics(
                accuracy=accuracy,
                precision=accuracy,  # Use accuracy for regression
                recall=accuracy,
                f1_score=accuracy,
                mse=mse,
                mae=mae
            )
    
    async def _test_model(
        self, 
        model: Any, 
        X_test: pd.DataFrame, 
        y_test: pd.Series, 
        config: ModelConfig
    ) -> ModelMetrics:
        """Test model performance on test set."""
        
        return await self._validate_model(model, X_test, y_test, config)
    
    async def _is_model_improved(self, model_type: ModelType, new_metrics: ModelMetrics) -> bool:
        """Check if new model is better than current active model."""
        
        if model_type not in self.active_models:
            return True  # No current model, so new one is better
        
        current_version_id = self.active_models[model_type]
        current_version = self.model_versions[current_version_id]
        
        # Compare primary metric (accuracy)
        current_accuracy = current_version.metrics.get("accuracy", 0.0)
        new_accuracy = new_metrics.accuracy
        
        # Require significant improvement (1% threshold)
        improvement_threshold = 0.01
        
        return new_accuracy > current_accuracy + improvement_threshold
    
    async def _save_model_version(
        self,
        model: Any,
        config: ModelConfig,
        training_data: pd.DataFrame,
        validation_metrics: ModelMetrics,
        test_metrics: ModelMetrics
    ) -> ModelVersion:
        """Save model version to disk."""
        
        # Generate version ID
        timestamp = datetime.utcnow()
        version_id = f"{config.model_type.value}_{timestamp.strftime('%Y%m%d_%H%M%S')}"
        
        # Create version directory
        version_dir = self.model_storage_path / version_id
        version_dir.mkdir(parents=True, exist_ok=True)
        
        # Save model
        model_path = version_dir / "model.joblib"
        joblib.dump(model, model_path)
        
        # Save configuration
        config_path = version_dir / "config.json"
        with open(config_path, 'w') as f:
            json.dump(asdict(config), f, indent=2, default=str)
        
        # Calculate data hash
        data_hash = hashlib.md5(str(training_data.values.tolist()).encode()).hexdigest()
        
        # Create model version
        model_version = ModelVersion(
            version_id=version_id,
            model_type=config.model_type,
            trained_at=timestamp,
            status=ModelStatus.VALIDATION,
            metrics=asdict(validation_metrics),
            validation_metrics=asdict(test_metrics),
            training_samples=len(training_data),
            feature_count=len(config.feature_columns),
            data_hash=data_hash,
            model_path=str(model_path),
            config_path=str(config_path),
            metadata_path=str(version_dir / "metadata.json")
        )
        
        # Save metadata
        with open(model_version.metadata_path, 'w') as f:
            json.dump(model_version.dict(), f, indent=2, default=str)
        
        # Store in registry
        self.model_versions[version_id] = model_version
        
        return model_version
    
    async def _deploy_model(self, model_version: ModelVersion) -> None:
        """Deploy model version as active model."""
        
        # Deactivate current model if exists
        if model_version.model_type in self.active_models:
            old_version_id = self.active_models[model_version.model_type]
            old_version = self.model_versions[old_version_id]
            old_version.is_active = False
        
        # Activate new model
        model_version.is_active = True
        model_version.status = ModelStatus.DEPLOYED
        model_version.deployment_timestamp = datetime.utcnow()
        
        # Update active models registry
        self.active_models[model_version.model_type] = model_version.version_id
        
        # Update metadata file
        with open(model_version.metadata_path, 'w') as f:
            json.dump(model_version.dict(), f, indent=2, default=str)
        
        self.logger.info(f"Deployed model {model_version.version_id}")
    
    def _calculate_improvement_metrics(
        self, 
        model_type: ModelType, 
        new_metrics: ModelMetrics
    ) -> Dict[str, float]:
        """Calculate improvement metrics compared to current model."""
        
        if model_type not in self.active_models:
            return {"accuracy_improvement": new_metrics.accuracy}
        
        current_version_id = self.active_models[model_type]
        current_version = self.model_versions[current_version_id]
        
        current_accuracy = current_version.metrics.get("accuracy", 0.0)
        
        return {
            "accuracy_improvement": new_metrics.accuracy - current_accuracy,
            "new_accuracy": new_metrics.accuracy,
            "old_accuracy": current_accuracy
        }
    
    async def _evaluate_model_performance(self, model_type: ModelType) -> None:
        """Evaluate current model performance and trigger retraining if needed."""
        
        if model_type not in self.active_models:
            return
        
        config = self.model_configs[model_type]
        
        # Load current model
        model = await self.load_model(model_type)
        if model is None:
            return
        
        # Get recent data for evaluation
        recent_data = await self._get_recent_data(model_type)
        if recent_data is None or len(recent_data) < 100:
            return
        
        # Evaluate performance
        X = recent_data[config.feature_columns]
        y = recent_data[config.target_column]
        
        current_metrics = await self._validate_model(model, X, y, config)
        
        # Check if performance is below threshold
        if current_metrics.accuracy < config.performance_threshold:
            self.logger.warning(
                f"Model {model_type.value} performance degraded: "
                f"{current_metrics.accuracy:.3f} < {config.performance_threshold:.3f}"
            )
            await self.trigger_retraining(model_type, RetrainingTrigger.PERFORMANCE_DEGRADATION)
    
    async def _get_recent_data(self, model_type: ModelType) -> Optional[pd.DataFrame]:
        """Get recent data for model evaluation."""
        
        # This would fetch recent data from your data sources
        # For now, return None to indicate no recent data available
        return None
    
    async def _cleanup_old_models(self) -> None:
        """Clean up old model versions."""
        
        cutoff_date = datetime.utcnow() - timedelta(days=30)  # Keep 30 days
        
        for version_id, version in list(self.model_versions.items()):
            if version.trained_at < cutoff_date and not version.is_active:
                # Remove from registry
                del self.model_versions[version_id]
                
                # Remove files
                try:
                    version_dir = Path(version.model_path).parent
                    if version_dir.exists():
                        import shutil
                        shutil.rmtree(version_dir)
                except Exception as e:
                    self.logger.error(f"Error cleaning up model {version_id}: {e}")
    
    # Public API methods
    
    async def load_model(self, model_type: ModelType) -> Optional[Any]:
        """Load active model for given type."""
        
        if model_type not in self.active_models:
            return None
        
        version_id = self.active_models[model_type]
        model_version = self.model_versions[version_id]
        
        try:
            return joblib.load(model_version.model_path)
        except Exception as e:
            self.logger.error(f"Error loading model {version_id}: {e}")
            return None
    
    def get_model_version(self, version_id: str) -> Optional[ModelVersion]:
        """Get model version by ID."""
        return self.model_versions.get(version_id)
    
    def get_active_model_version(self, model_type: ModelType) -> Optional[ModelVersion]:
        """Get active model version for type."""
        
        if model_type not in self.active_models:
            return None
        
        version_id = self.active_models[model_type]
        return self.model_versions.get(version_id)
    
    def list_model_versions(self, model_type: Optional[ModelType] = None) -> List[ModelVersion]:
        """List model versions, optionally filtered by type."""
        
        versions = list(self.model_versions.values())
        
        if model_type:
            versions = [v for v in versions if v.model_type == model_type]
        
        return sorted(versions, key=lambda v: v.trained_at, reverse=True)
    
    def get_retraining_job(self, job_id: str) -> Optional[RetrainingJob]:
        """Get retraining job by ID."""
        return self.retraining_jobs.get(job_id)
    
    def list_retraining_jobs(self, limit: int = 20) -> List[RetrainingJob]:
        """List recent retraining jobs."""
        
        jobs = sorted(
            self.retraining_jobs.values(),
            key=lambda j: j.started_at,
            reverse=True
        )
        
        return jobs[:limit]
    
    def add_retraining_callback(self, callback: Callable) -> None:
        """Add callback for retraining events."""
        self.retraining_callbacks.append(callback)
    
    def add_deployment_callback(self, callback: Callable) -> None:
        """Add callback for deployment events."""
        self.deployment_callbacks.append(callback)
    
    def get_lifecycle_stats(self) -> Dict[str, Any]:
        """Get model lifecycle statistics."""
        
        active_models = len(self.active_models)
        total_versions = len(self.model_versions)
        running_jobs = len([j for j in self.retraining_jobs.values() if j.status == "running"])
        
        # Calculate average performance
        avg_performance = {}
        for model_type in ModelType:
            if model_type in self.active_models:
                version_id = self.active_models[model_type]
                version = self.model_versions[version_id]
                avg_performance[model_type.value] = version.metrics.get("accuracy", 0.0)
        
        return {
            "active_models": active_models,
            "total_versions": total_versions,
            "running_jobs": running_jobs,
            "average_performance": avg_performance,
            "is_monitoring": self.is_monitoring,
            "storage_path": str(self.model_storage_path),
            "retraining_callbacks": len(self.retraining_callbacks),
            "deployment_callbacks": len(self.deployment_callbacks)
        }