use std::time::Duration;
use async_trait::async_trait;

/// The core domain port for rate limiting outbound requests.
#[async_trait]
pub trait RateLimiterPort: Send + Sync {
    /// Attempts to acquire a single token.
    /// If exhausted, it should internally handle backoff mechanisms.
    async fn acquire_token(&self) -> Result<(), RateLimitError>;
}

#[derive(Debug)]
pub enum RateLimitError {
    BucketExhausted(Duration),
    SystemError(String),
}