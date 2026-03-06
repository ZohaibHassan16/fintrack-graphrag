use crate::domain::sec_filing::{EventPublisherPort, SecFilingPayload};
use rdkafka::producer::{FutureProducer, FutureRecord};
use rdkafka::ClientConfig;
use async_trait::async_trait;
use std::time::Duration;
use tracing::{info, error};

pub struct KafkaIngestionPublisher {
    producer: FutureProducer,
    topic: String,
}

impl KafkaIngestionPublisher {
    pub fn new(brokers: &str, topic: &str) -> Self {
        let producer: FutureProducer = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .set("message.timeout.ms", "5000")
            .set("compression.type", "zstd")      
            .set("enable.idempotence", "true")   
            .set("max.in.flight.requests.per.connection", "5") 
            .set("message.max.bytes", "2097152") 
            .set("queue.buffering.max.ms", "20")  
    
            .create()
            .expect("Producer creation error");

        Self {
            producer,
            topic: topic.to_string(),
        }
    }
}

#[async_trait]
impl EventPublisherPort for KafkaIngestionPublisher {
    async fn publish_filing(&self, payload: &SecFilingPayload) -> Result<(), String> {
        let payload_json = serde_json::to_string(payload).map_err(|e| e.to_string())?;

        // We use the CIK as the key to ensure all filings for the same company 
        // land in the same Kafka partition (preserving temporal order).
        let record = FutureRecord::to(&self.topic)
            .payload(&payload_json)
            .key(&payload.cik_id);

        match self.producer.send(record, Duration::from_secs(0)).await {
            Ok((partition, offset)) => {
                info!(
                    "Published: CIK {} to topic {} [P:{} / O:{}]", 
                    payload.cik_id, self.topic, partition, offset
                );
                Ok(())
            }
            Err((e, _)) => {
                error!("Kafka delivery failed for CIK {}: {:?}", payload.cik_id, e);
                Err(format!("Kafka error: {}", e))
            }
        }
    }
}