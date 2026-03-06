use sqlx::{PgPool, postgres::PgPoolOptions};
use tracing::{info, error};


#[derive(Debug, Clone, sqlx::FromRow)]
pub struct PendingFilingTask {
    pub id: i32,
    pub cik: String,
    pub accession_number: String,
    pub document_url: String,
}

pub struct PgStagingRepository {
    pool: PgPool,
}

impl PgStagingRepository {
    pub async fn new(database_url: &str) -> Result<Self, sqlx::Error> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect(database_url)
            .await?;
            
        Ok(Self { pool })
    }

    // Fetches filings that have been scraped from the SEC daily index 
    // but haven't been processed by the NLP pipeline yet.
    pub async fn fetch_pending_tasks(&self, limit: i64) -> Result<Vec<PendingFilingTask>, sqlx::Error> {

        let records = sqlx::query_as::<_, PendingFilingTask>(
            r#"
            SELECT id, cik, accession_number, document_url
            FROM ingestion_state
            WHERE status = 'PENDING'
            ORDER BY created_at ASC
            LIMIT $1
            "#
        )
        .bind(limit) // Bind variables at runtime
        .fetch_all(&self.pool)
        .await?;

        Ok(records)
    }

    
    pub async fn mark_task_complete(&self, id: i32) -> Result<(), sqlx::Error> {
      
        sqlx::query(
            r#"
            UPDATE ingestion_state
            SET status = 'COMPLETED', processed_at = NOW()
            WHERE id = $1
            "#
        )
        .bind(id)
        .execute(&self.pool)
        .await?;

        info!("Task {} marked as COMPLETED in staging database.", id);
        Ok(())
    }
    
 
    pub async fn mark_task_failed(&self, id: i32, error_msg: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE ingestion_state
            SET status = 'FAILED', error_log = $2
            WHERE id = $1
            "#
        )
        .bind(id)
        .bind(error_msg)
        .execute(&self.pool)
        .await?;

        error!("Task {} marked as FAILED in staging database.", id);
        Ok(())
    }
}