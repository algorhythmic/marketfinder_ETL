"""
Monitoring and maintenance DAGs for MarketFinder ETL pipeline.

This includes:
- Data quality monitoring
- ML model retraining 
- Database maintenance
- System health checks
"""

from datetime import datetime, timedelta
from typing import Any, Dict

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.bash import BashOperator
from airflow.sensors.sql import SqlSensor
from airflow.utils.dates import days_ago

# Monitoring DAG
monitoring_dag = DAG(
    'marketfinder_monitoring',
    default_args={
        'owner': 'marketfinder-team',
        'depends_on_past': False,
        'start_date': days_ago(1),
        'email_on_failure': True,
        'retries': 1,
        'retry_delay': timedelta(minutes=5),
    },
    description='Monitoring and alerting for MarketFinder ETL',
    schedule_interval='*/15 * * * *',  # Every 15 minutes
    catchup=False,
    tags=['marketfinder', 'monitoring', 'alerts'],
)


def check_data_quality(**context) -> Dict[str, Any]:
    """Check data quality metrics."""
    from marketfinder_etl.monitoring.data_quality import DataQualityChecker
    from marketfinder_etl.core.logging import get_logger
    
    logger = get_logger("data_quality")
    checker = DataQualityChecker()
    
    try:
        quality_report = checker.run_quality_checks()
        
        # Alert if quality score is too low
        if quality_report.overall_score < 0.8:
            logger.warning(f"Data quality score is low: {quality_report.overall_score}")
            # TODO: Send alert
        
        return quality_report.dict()
        
    except Exception as e:
        logger.error(f"Data quality check failed: {e}")
        raise


def monitor_pipeline_performance(**context) -> Dict[str, Any]:
    """Monitor pipeline performance metrics."""
    from marketfinder_etl.monitoring.performance import PerformanceMonitor
    from marketfinder_etl.core.logging import get_logger
    
    logger = get_logger("performance_monitor")
    monitor = PerformanceMonitor()
    
    try:
        performance_report = monitor.generate_performance_report()
        
        # Check for performance degradation
        if performance_report.avg_processing_time > 300:  # 5 minutes
            logger.warning(f"Pipeline processing time is high: {performance_report.avg_processing_time}s")
        
        return performance_report.dict()
        
    except Exception as e:
        logger.error(f"Performance monitoring failed: {e}")
        raise


def check_api_health(**context) -> Dict[str, Any]:
    """Check health of external APIs."""
    from marketfinder_etl.monitoring.api_health import APIHealthChecker
    from marketfinder_etl.core.logging import get_logger
    
    logger = get_logger("api_health")
    checker = APIHealthChecker()
    
    try:
        health_status = checker.check_all_apis()
        
        # Alert on API failures
        for api, status in health_status.items():
            if not status['healthy']:
                logger.error(f"API {api} is unhealthy: {status['error']}")
        
        return health_status
        
    except Exception as e:
        logger.error(f"API health check failed: {e}")
        raise


# Monitoring tasks
data_quality_task = PythonOperator(
    task_id='check_data_quality',
    python_callable=check_data_quality,
    dag=monitoring_dag,
)

performance_task = PythonOperator(
    task_id='monitor_pipeline_performance',
    python_callable=monitor_pipeline_performance,
    dag=monitoring_dag,
)

api_health_task = PythonOperator(
    task_id='check_api_health',
    python_callable=check_api_health,
    dag=monitoring_dag,
)

# Maintenance DAG
maintenance_dag = DAG(
    'marketfinder_maintenance',
    default_args={
        'owner': 'marketfinder-team',
        'depends_on_past': False,
        'start_date': days_ago(1),
        'email_on_failure': True,
        'retries': 2,
        'retry_delay': timedelta(minutes=10),
    },
    description='Maintenance tasks for MarketFinder ETL',
    schedule_interval='0 2 * * *',  # Daily at 2 AM
    catchup=False,
    tags=['marketfinder', 'maintenance'],
)


def retrain_ml_model(**context) -> Dict[str, Any]:
    """Retrain ML model with recent data."""
    from marketfinder_etl.ml.model_trainer import MLModelTrainer
    from marketfinder_etl.core.logging import get_logger
    
    logger = get_logger("ml_trainer")
    trainer = MLModelTrainer()
    
    try:
        # Get recent training data
        training_data = trainer.prepare_training_data(days_back=7)
        
        if len(training_data) < 100:
            logger.info("Insufficient training data, skipping retraining")
            return {'retrained': False, 'reason': 'insufficient_data'}
        
        # Train new model
        model_metrics = trainer.train_model(training_data)
        
        # Only deploy if model improves
        if model_metrics['accuracy'] > trainer.current_model_accuracy:
            trainer.deploy_model()
            logger.info(f"Model retrained and deployed with accuracy: {model_metrics['accuracy']}")
            return {'retrained': True, 'metrics': model_metrics}
        else:
            logger.info("New model did not improve, keeping current model")
            return {'retrained': False, 'reason': 'no_improvement'}
        
    except Exception as e:
        logger.error(f"ML model retraining failed: {e}")
        raise


def cleanup_old_data(**context) -> Dict[str, Any]:
    """Clean up old data to manage storage."""
    from marketfinder_etl.storage.cleanup import DataCleanup
    from marketfinder_etl.core.logging import get_logger
    
    logger = get_logger("data_cleanup")
    cleanup = DataCleanup()
    
    try:
        # Clean up data older than 30 days
        cleanup_stats = cleanup.cleanup_old_data(days_to_keep=30)
        
        logger.info(f"Cleaned up {cleanup_stats['records_deleted']} old records")
        
        return cleanup_stats
        
    except Exception as e:
        logger.error(f"Data cleanup failed: {e}")
        raise


def backup_critical_data(**context) -> Dict[str, Any]:
    """Backup critical data."""
    from marketfinder_etl.storage.backup import DatabaseBackup
    from marketfinder_etl.core.logging import get_logger
    
    logger = get_logger("backup")
    backup = DatabaseBackup()
    
    try:
        backup_info = backup.create_backup()
        
        logger.info(f"Created backup: {backup_info['backup_file']}")
        
        return backup_info
        
    except Exception as e:
        logger.error(f"Backup failed: {e}")
        raise


# Maintenance tasks
retrain_model_task = PythonOperator(
    task_id='retrain_ml_model',
    python_callable=retrain_ml_model,
    dag=maintenance_dag,
)

cleanup_task = PythonOperator(
    task_id='cleanup_old_data', 
    python_callable=cleanup_old_data,
    dag=maintenance_dag,
)

backup_task = PythonOperator(
    task_id='backup_critical_data',
    python_callable=backup_critical_data,
    dag=maintenance_dag,
)

# Task dependencies for maintenance
[retrain_model_task, cleanup_task] >> backup_task