"""
Main ETL DAG for MarketFinder arbitrage detection pipeline.

This DAG implements the multi-layer comparison architecture:
1. Extract market data from Kalshi and Polymarket
2. Apply semantic bucketing 
3. Hierarchical filtering
4. ML-enhanced scoring
5. LLM evaluation
6. Arbitrage detection
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.bash import BashOperator
from airflow.sensors.filesystem import FileSensor
from airflow.providers.postgres.hooks.postgres import PostgresHook
from airflow.utils.dates import days_ago
from airflow.models import Variable

# Default arguments for all tasks
default_args = {
    'owner': 'marketfinder-team',
    'depends_on_past': False,
    'start_date': days_ago(1),
    'email_on_failure': True,
    'email_on_retry': False,
    'retries': 3,
    'retry_delay': timedelta(minutes=5),
    'catchup': False,
}

# DAG definition
dag = DAG(
    'market_arbitrage_etl',
    default_args=default_args,
    description='MarketFinder ETL pipeline for arbitrage detection',
    schedule_interval='*/30 * * * *',  # Every 30 minutes
    max_active_runs=1,
    tags=['marketfinder', 'etl', 'arbitrage', 'prediction-markets'],
)


def extract_kalshi_markets(**context) -> Dict[str, Any]:
    """Extract market data from Kalshi API."""
    from marketfinder_etl.extractors.kalshi import KalshiExtractor
    from marketfinder_etl.core.logging import get_logger
    
    logger = get_logger("kalshi_extractor")
    extractor = KalshiExtractor()
    
    try:
        markets = extractor.extract_markets()
        logger.info(f"Extracted {len(markets)} markets from Kalshi")
        
        # Store results in XCom for next task
        return {
            'platform': 'kalshi',
            'market_count': len(markets),
            'markets': [market.dict() for market in markets],
            'extracted_at': datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to extract Kalshi markets: {e}")
        raise


def extract_polymarket_markets(**context) -> Dict[str, Any]:
    """Extract market data from Polymarket API.""" 
    from marketfinder_etl.extractors.polymarket import PolymarketExtractor
    from marketfinder_etl.core.logging import get_logger
    
    logger = get_logger("polymarket_extractor")
    extractor = PolymarketExtractor()
    
    try:
        markets = extractor.extract_markets()
        logger.info(f"Extracted {len(markets)} markets from Polymarket")
        
        return {
            'platform': 'polymarket',
            'market_count': len(markets),
            'markets': [market.dict() for market in markets],
            'extracted_at': datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to extract Polymarket markets: {e}")
        raise


def transform_and_normalize_markets(**context) -> Dict[str, Any]:
    """Transform raw market data into normalized format."""
    from marketfinder_etl.transformers.normalizer import MarketNormalizer
    from marketfinder_etl.core.logging import get_logger
    
    logger = get_logger("market_transformer")
    normalizer = MarketNormalizer()
    
    # Get raw markets from XCom
    ti = context['ti']
    kalshi_data = ti.xcom_pull(task_ids='extract_kalshi_markets')
    polymarket_data = ti.xcom_pull(task_ids='extract_polymarket_markets')
    
    try:
        all_raw_markets = []
        if kalshi_data:
            all_raw_markets.extend(kalshi_data['markets'])
        if polymarket_data:
            all_raw_markets.extend(polymarket_data['markets'])
        
        normalized_markets = normalizer.transform_markets(all_raw_markets)
        logger.info(f"Normalized {len(normalized_markets)} markets")
        
        return {
            'market_count': len(normalized_markets),
            'markets': [market.dict() for market in normalized_markets],
            'transformed_at': datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to transform markets: {e}")
        raise


def semantic_bucketing(**context) -> Dict[str, Any]:
    """Apply semantic bucketing to group similar markets."""
    from marketfinder_etl.engines.bucketing import SemanticBucketingEngine
    from marketfinder_etl.core.logging import get_logger
    
    logger = get_logger("semantic_bucketing")
    bucketing_engine = SemanticBucketingEngine()
    
    # Get normalized markets from XCom
    ti = context['ti']
    market_data = ti.xcom_pull(task_ids='transform_and_normalize_markets')
    
    try:
        markets = [market for market in market_data['markets']]
        bucket_pairs = bucketing_engine.bucket_markets(markets)
        
        logger.info(f"Created {len(bucket_pairs)} bucket pairs for processing")
        
        return {
            'bucket_pairs': [pair.dict() for pair in bucket_pairs],
            'total_comparisons': sum(pair.comparison_count for pair in bucket_pairs),
            'bucketed_at': datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to bucket markets: {e}")
        raise


def hierarchical_filtering(**context) -> Dict[str, Any]:
    """Apply hierarchical filtering to reduce comparison space."""
    from marketfinder_etl.engines.filtering import HierarchicalFilteringEngine
    from marketfinder_etl.core.logging import get_logger
    
    logger = get_logger("hierarchical_filtering")
    filtering_engine = HierarchicalFilteringEngine()
    
    # Get bucket pairs from XCom
    ti = context['ti']
    bucketing_data = ti.xcom_pull(task_ids='semantic_bucketing')
    
    try:
        filtered_pairs = []
        total_filtered = 0
        
        for bucket_pair_data in bucketing_data['bucket_pairs']:
            pairs = filtering_engine.filter_bucket_pairs(bucket_pair_data)
            filtered_pairs.extend(pairs)
            total_filtered += len(pairs)
        
        logger.info(f"Filtered to {total_filtered} viable market pairs")
        
        return {
            'filtered_pairs': [pair.dict() for pair in filtered_pairs],
            'pair_count': total_filtered,
            'filtered_at': datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to filter market pairs: {e}")
        raise


def ml_enhanced_scoring(**context) -> Dict[str, Any]:
    """Apply ML scoring to predict LLM evaluation success."""
    from marketfinder_etl.engines.ml_scoring import MLScoringEngine
    from marketfinder_etl.core.logging import get_logger
    
    logger = get_logger("ml_scoring")
    ml_engine = MLScoringEngine()
    
    # Get filtered pairs from XCom
    ti = context['ti']
    filtering_data = ti.xcom_pull(task_ids='hierarchical_filtering')
    
    try:
        ml_predictions = []
        high_score_pairs = []
        
        for pair_data in filtering_data['filtered_pairs']:
            prediction = ml_engine.score_market_pair(pair_data)
            ml_predictions.append(prediction)
            
            # Keep only high-scoring pairs for LLM evaluation
            if prediction.should_evaluate_with_llm():
                high_score_pairs.append(pair_data)
        
        logger.info(f"ML scored {len(ml_predictions)} pairs, {len(high_score_pairs)} qualify for LLM evaluation")
        
        return {
            'ml_predictions': [pred.dict() for pred in ml_predictions],
            'high_score_pairs': high_score_pairs,
            'llm_candidates': len(high_score_pairs),
            'scored_at': datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to perform ML scoring: {e}")
        raise


def llm_evaluation(**context) -> Dict[str, Any]:
    """Evaluate high-scoring pairs with LLM for semantic similarity."""
    from marketfinder_etl.engines.llm_evaluation import LLMEvaluationEngine
    from marketfinder_etl.core.logging import get_logger
    
    logger = get_logger("llm_evaluation")
    llm_engine = LLMEvaluationEngine()
    
    # Get high-scoring pairs from XCom
    ti = context['ti']
    ml_data = ti.xcom_pull(task_ids='ml_enhanced_scoring')
    
    try:
        llm_evaluations = llm_engine.evaluate_pairs(ml_data['high_score_pairs'])
        
        # Filter by confidence threshold
        high_confidence_evaluations = [
            eval for eval in llm_evaluations 
            if eval.confidence >= 0.7
        ]
        
        logger.info(f"LLM evaluated {len(llm_evaluations)} pairs, {len(high_confidence_evaluations)} are high confidence")
        
        return {
            'llm_evaluations': [eval.dict() for eval in high_confidence_evaluations],
            'evaluation_count': len(high_confidence_evaluations),
            'total_tokens_used': sum(eval.tokens_used or 0 for eval in llm_evaluations),
            'evaluated_at': datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to perform LLM evaluation: {e}")
        raise


def arbitrage_detection(**context) -> Dict[str, Any]:
    """Detect arbitrage opportunities from LLM-evaluated pairs."""
    from marketfinder_etl.engines.arbitrage_detection import ArbitrageDetectionEngine
    from marketfinder_etl.core.logging import get_logger
    
    logger = get_logger("arbitrage_detection")
    arbitrage_engine = ArbitrageDetectionEngine()
    
    # Get LLM evaluations from XCom
    ti = context['ti']
    llm_data = ti.xcom_pull(task_ids='llm_evaluation')
    
    try:
        opportunities = arbitrage_engine.detect_opportunities(llm_data['llm_evaluations'])
        
        # Sort by profit margin
        opportunities.sort(key=lambda x: x.profit_margin, reverse=True)
        
        # Take top 50 opportunities
        top_opportunities = opportunities[:50]
        
        logger.info(f"Detected {len(opportunities)} arbitrage opportunities, returning top {len(top_opportunities)}")
        
        return {
            'opportunities': [opp.dict() for opp in top_opportunities],
            'opportunity_count': len(top_opportunities),
            'total_detected': len(opportunities),
            'detected_at': datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to detect arbitrage opportunities: {e}")
        raise


def save_results_to_database(**context) -> None:
    """Save final results to database."""
    from marketfinder_etl.storage.database import DatabaseManager
    from marketfinder_etl.core.logging import get_logger
    
    logger = get_logger("database_saver")
    db_manager = DatabaseManager()
    
    # Get results from all previous tasks
    ti = context['ti']
    
    # Get all XCom data
    market_data = ti.xcom_pull(task_ids='transform_and_normalize_markets')
    arbitrage_data = ti.xcom_pull(task_ids='arbitrage_detection')
    
    try:
        # Save markets
        if market_data:
            db_manager.save_markets(market_data['markets'])
            logger.info(f"Saved {market_data['market_count']} markets to database")
        
        # Save opportunities
        if arbitrage_data:
            db_manager.save_opportunities(arbitrage_data['opportunities'])
            logger.info(f"Saved {arbitrage_data['opportunity_count']} opportunities to database")
        
        # Create sync log
        sync_log = {
            'sync_id': context['run_id'],
            'markets_processed': market_data['market_count'] if market_data else 0,
            'opportunities_found': arbitrage_data['opportunity_count'] if arbitrage_data else 0,
            'completed_at': datetime.utcnow(),
            'status': 'completed'
        }
        db_manager.save_sync_log(sync_log)
        
        logger.info("Pipeline results saved successfully")
        
    except Exception as e:
        logger.error(f"Failed to save results to database: {e}")
        raise


def send_notification(**context) -> None:
    """Send notification about pipeline completion."""
    from marketfinder_etl.notifications.slack import SlackNotifier
    from marketfinder_etl.core.logging import get_logger
    
    logger = get_logger("notification")
    notifier = SlackNotifier()
    
    # Get results summary
    ti = context['ti']
    arbitrage_data = ti.xcom_pull(task_ids='arbitrage_detection')
    
    try:
        if arbitrage_data:
            message = f"""
🎯 MarketFinder ETL Pipeline Completed

📊 **Results Summary:**
• Opportunities Found: {arbitrage_data['opportunity_count']}
• Total Detected: {arbitrage_data['total_detected']}
• Pipeline Run ID: {context['run_id']}
• Completed: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC

🔝 **Top Opportunity:**
{arbitrage_data['opportunities'][0]['reasoning'] if arbitrage_data['opportunities'] else 'No opportunities found'}

✅ Pipeline completed successfully!
            """
            
            notifier.send_message(message)
            logger.info("Notification sent successfully")
        
    except Exception as e:
        logger.error(f"Failed to send notification: {e}")
        # Don't fail the pipeline for notification errors


# Task definitions
extract_kalshi_task = PythonOperator(
    task_id='extract_kalshi_markets',
    python_callable=extract_kalshi_markets,
    dag=dag,
    pool='api_pool',  # Limit concurrent API calls
)

extract_polymarket_task = PythonOperator(
    task_id='extract_polymarket_markets',
    python_callable=extract_polymarket_markets,
    dag=dag,
    pool='api_pool',
)

transform_task = PythonOperator(
    task_id='transform_and_normalize_markets',
    python_callable=transform_and_normalize_markets,
    dag=dag,
)

bucketing_task = PythonOperator(
    task_id='semantic_bucketing',
    python_callable=semantic_bucketing,
    dag=dag,
)

filtering_task = PythonOperator(
    task_id='hierarchical_filtering',
    python_callable=hierarchical_filtering,
    dag=dag,
)

ml_scoring_task = PythonOperator(
    task_id='ml_enhanced_scoring',
    python_callable=ml_enhanced_scoring,
    dag=dag,
)

llm_evaluation_task = PythonOperator(
    task_id='llm_evaluation',
    python_callable=llm_evaluation,
    dag=dag,
    pool='llm_pool',  # Limit concurrent LLM calls
)

arbitrage_detection_task = PythonOperator(
    task_id='arbitrage_detection',
    python_callable=arbitrage_detection,
    dag=dag,
)

save_results_task = PythonOperator(
    task_id='save_results_to_database',
    python_callable=save_results_to_database,
    dag=dag,
)

notification_task = PythonOperator(
    task_id='send_notification',
    python_callable=send_notification,
    dag=dag,
    trigger_rule='all_done',  # Run even if previous tasks fail
)

# Task dependencies - Multi-layer pipeline flow
[extract_kalshi_task, extract_polymarket_task] >> transform_task
transform_task >> bucketing_task
bucketing_task >> filtering_task
filtering_task >> ml_scoring_task
ml_scoring_task >> llm_evaluation_task
llm_evaluation_task >> arbitrage_detection_task
arbitrage_detection_task >> save_results_task
save_results_task >> notification_task