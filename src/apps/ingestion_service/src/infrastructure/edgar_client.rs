use crate::domain::sec_filing::DocumentFetcherPort;
use crate::domain::rate_limiter::RateLimiterPort;
use reqwest::{Client, header};
use async_trait::async_trait;
use std::sync::Arc;
use tracing::{info, error, warn};
use serde::Deserialize;


#[derive(Deserialize, Debug)]
struct SecSubmissions {
    filings: Filings,
}

#[derive(Deserialize, Debug)]
struct Filings {
    recent: RecentFilings,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct RecentFilings {
    accession_number: Vec<String>,
    primary_document: Vec<String>,
}

pub struct SecEdgarClient {
    http_client: Client,
    rate_limiter: Arc<dyn RateLimiterPort>,
}

impl SecEdgarClient {
    pub fn new(rate_limiter: Arc<dyn RateLimiterPort>, contact_email: &str) -> Self {
        let mut headers = header::HeaderMap::new();
        let user_agent = format!("FinTrack/1.0 ({})", contact_email);
        
        headers.insert(header::USER_AGENT, header::HeaderValue::from_str(&user_agent).unwrap());
        headers.insert(header::ACCEPT_ENCODING, header::HeaderValue::from_static("gzip, deflate"));

        let http_client = Client::builder()
            .default_headers(headers)
            .gzip(true) 
            .build()
            .expect("Failed to build HTTP client");

        Self { http_client, rate_limiter }
    }
}

#[async_trait]
impl DocumentFetcherPort for SecEdgarClient {
    async fn fetch_raw_bytes(&self, raw_url: &str) -> Result<Vec<u8>, String> {
        // sanitize URL
        let url = raw_url.trim();
        let mut target_url = url.to_string();

    
        if url.ends_with(".txt") {
            info!("Intercepted .txt URL: '{}'. Resolving substantive HTML via JSON API...", url);
            let parts: Vec<&str> = url.split('/').collect();
            
            // Expected URL: https://www.sec.gov/Archives/edgar/data/{CIK}/{ACCESSION_NO_DASHES}/{ACCESSION}.txt
            if parts.len() >= 9 {
                let cik = parts[6];
                let target_accession = parts[8].replace(".txt", "");

                let padded_cik = format!("{:0>10}", cik);
                let api_url = format!("https://data.sec.gov/submissions/CIK{}.json", padded_cik);

          
                if let Err(_) = self.rate_limiter.acquire_token().await {
                    return Err("Rate limit exhausted for JSON API lookup".to_string());
                }

                let resp = self.http_client.get(&api_url).send().await;
                
                if let Ok(response) = resp {
                    if response.status().is_success() {
                        if let Ok(submissions) = response.json::<SecSubmissions>().await {
                            let recent = submissions.filings.recent;
                            
                            let mut found = false;
                            for (i, acc_num) in recent.accession_number.iter().enumerate() {
                                if acc_num == &target_accession {
                                    let mut primary_doc = recent.primary_document[i].clone();
                                    
                                 
                                    if primary_doc.contains("ix?doc=") {
                                        primary_doc = primary_doc.replace("ix?doc=", "");
                                    }

                                    let accession_no_dashes = acc_num.replace("-", "");
                                    
                                  
                                    target_url = format!(
                                        "https://www.sec.gov/Archives/edgar/data/{}/{}/{}", 
                                        cik, 
                                        accession_no_dashes, 
                                        primary_doc
                                    );
                                    
                                    info!("SUCCESS: Resolved substantive HTML document: {}", target_url);
                                    found = true;
                                    break;
                                }
                            }
                            if !found {
                                warn!("Accession {} not found in JSON history for CIK {}", target_accession, cik);
                            }
                        } else {
                            warn!("Failed to deserialize SEC JSON API payload for CIK {}", cik);
                        }
                    } else {
                        warn!("SEC API returned HTTP {} for CIK {}", response.status(), cik);
                    }
                }
            }
        }
     
        if let Err(e) = self.rate_limiter.acquire_token().await {
            error!("Rate limiter prevented final request: {:?}", e);
            return Err("Rate limit exhausted".to_string());
        }

        info!("Fetching final target document: {}", target_url);
        
        let response = self.http_client
            .get(&target_url)
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("SEC Document Fetch returned status: {}", response.status()));
        }

        let bytes = response.bytes()
            .await
            .map_err(|e| format!("Failed to read response bytes: {}", e))?;

        Ok(bytes.to_vec())
    }
}