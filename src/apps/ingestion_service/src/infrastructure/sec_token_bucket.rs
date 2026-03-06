use crate::domain::rate_limiter::{RateLimiterPort, RateLimitError}; 
use dashmap::DashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::time::sleep;
use rand::Rng;
use async_trait::async_trait;
use tracing::{warn, debug};


pub struct SecTokenBucket {
    capacity: usize,
    tokens: Arc<AtomicUsize>,
    last_replenish: Arc<DashMap<String, Instant>>, 
    replenish_rate: Duration,
}

impl SecTokenBucket {
    pub fn new() -> Self {
        let capacity = 10;

        Self {
            capacity,
            tokens: Arc::new(AtomicUsize::new(capacity)),
            last_replenish: Arc::new(DashMap::new()), 
            replenish_rate: Duration::from_secs(1),
        }
    }

    fn try_replenish(&self) {
        let now = Instant::now();
        let mut entry = self.last_replenish.entry("sec_global".to_string()).or_insert(now);

        if now.duration_since(*entry) >= self.replenish_rate {
            self.tokens.store(self.capacity, Ordering::SeqCst);
            *entry = now;
            debug!("Token buckets replenished.");
        }
    }

    fn calculate_backoff(&self, attempt: u32) -> Duration {
        let base_delay = 500; 
        let mut rng = rand::thread_rng();
        let jitter = rng.gen_range(0..100);

        let backoff = (base_delay * 2_u64.pow(attempt)) + jitter;
        Duration::from_millis(backoff)
    }
}

#[async_trait]
impl RateLimiterPort for SecTokenBucket {
    async fn acquire_token(&self) -> Result<(), RateLimitError> { 
        let mut attempt = 0;

        loop {
            self.try_replenish();

            let current_tokens = self.tokens.load(Ordering::SeqCst); 
            
            if current_tokens > 0 {
                if self.tokens.compare_exchange(
                    current_tokens,
                    current_tokens - 1,
                    Ordering::SeqCst,
                    Ordering::SeqCst,
                ).is_ok() {
                    return Ok(());
                }
            }

            attempt += 1;
            let backoff_duration = self.calculate_backoff(attempt);

            warn!("Token bucket exhausted. Applying backoff for {}ms before retrying.", backoff_duration.as_millis());
            sleep(backoff_duration).await;

            if attempt > 5 {
                return Err(RateLimitError::BucketExhausted(backoff_duration)); 
            }
        }
    }
}