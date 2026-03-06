use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use tokio::time::{sleep, Duration};
use tracing::{info, Level, error};
use tracing_subscriber::FmtSubscriber;

pub mod application;
pub mod domain;
pub mod infrastructure;

use application::sec_crawler_usecase::SecCrawlerUseCase;
use infrastructure::sec_token_bucket::SecTokenBucket;
use infrastructure::edgar_client::SecEdgarClient;
use infrastructure::kafka_publisher::KafkaIngestionPublisher;
use infrastructure::pg_staging_repository::{PgStagingRepository, PendingFilingTask};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let subscriber = FmtSubscriber::builder().with_max_level(Level::INFO).finish();
    tracing::subscriber::set_global_default(subscriber).unwrap();

    info!("Initializing SEC EDGAR Concurrent Ingestion Worker...");

    // Initialize Adapters
    let rate_limiter = Arc::new(SecTokenBucket::new()); 
    let edgar_client = Arc::new(SecEdgarClient::new(rate_limiter.clone(), "data-ops@enterprise.com"));
    let kafka_publisher = Arc::new(KafkaIngestionPublisher::new("kafka-cluster:9092", "sec-filings-raw"));
    let crawler_usecase = Arc::new(SecCrawlerUseCase::new(edgar_client, kafka_publisher));
    
    // Initialize Operational Control Plane 
    let pg_repo = Arc::new(
        PgStagingRepository::new("postgres://user:pass@postgres-cluster:5432/staging_db")
        .await
        .expect("Failed to connect to PostgreSQL staging database")
    );

    let (tx, rx) = mpsc::channel::<PendingFilingTask>(1000);
    let shared_rx = Arc::new(Mutex::new(rx));

    for worker_id in 0..5 {
        let usecase_clone = crawler_usecase.clone();
        let pg_repo_clone = pg_repo.clone();
        let rx_clone = shared_rx.clone();
        
        tokio::spawn(async move {
            info!("Worker {} online and awaiting tasks.", worker_id);
            
            loop {
                // Lock the receiver just long enough to grab the next task
                let task_opt = {
                    let mut rx_lock = rx_clone.lock().await;
                    rx_lock.recv().await
                };

                match task_opt {
                    Some(task) => {
                        match usecase_clone.process_filing(&task.cik, &task.accession_number, &task.document_url).await {
                            Ok(_) => {
                                let _ = pg_repo_clone.mark_task_complete(task.id).await;
                            }
                            Err(e) => {
                                error!("Worker {} failed to process CIK {}: {}", worker_id, task.cik, e);
                                let _ = pg_repo_clone.mark_task_failed(task.id, &e).await;
                            }
                        }
                    }
                    None => break, 
                }
            }
        });
    }

    // Polling the Relational Control Plane
    let pg_repo_producer = pg_repo.clone();
    tokio::spawn(async move {
        loop {
            match pg_repo_producer.fetch_pending_tasks(100).await {
                Ok(tasks) => {
                    if tasks.is_empty() {
                        sleep(Duration::from_secs(60)).await;
                        continue;
                    }
                    
                    for task in tasks {
                        if tx.send(task).await.is_err() {
                            error!("MPSC channel receiver dropped, halting task generation.");
                            return;
                        }
                    }
                    

                    sleep(Duration::from_secs(10)).await;
                }
                Err(e) => {
                    error!("Failed to fetch pending tasks from PostgreSQL: {}", e);
                    sleep(Duration::from_secs(10)).await;
                }
            }
        }
    });

    tokio::signal::ctrl_c().await?;
    info!("Shutting down Ingestion Worker gracefully...");
    Ok(())
}