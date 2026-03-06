use serde::{Serialize, Deserialize};

/// Pure domain entity representing a sanitized SEC filing payload.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SecFilingPayload {
    pub cik_id: String,
    pub document_type: String,
    pub filing_data: String,
    pub sec_accession_number: String,
    pub item_7_text: String,
}

#[async_trait::async_trait]
pub trait DocumentFetcherPort: Send + Sync {
    /// Fetches the raw binary content of a document to allow for 
    /// manual encoding detection and decompression.
    async fn fetch_raw_bytes(&self, url: &str) -> Result<Vec<u8>, String>;
}

#[async_trait::async_trait]
pub trait EventPublisherPort: Send + Sync {
    /// Publishes the processed filing payload to the downstream event stream.
    async fn publish_filing(&self, payload: &SecFilingPayload) -> Result<(), String>;
}