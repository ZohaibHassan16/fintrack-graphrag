use crate::domain::sec_filing::{DocumentFetcherPort, EventPublisherPort, SecFilingPayload};
use lazy_static::lazy_static;
use regex::Regex;
use scraper::Html;
use std::sync::Arc;
use tracing::{error, info, warn};

lazy_static! {
  
    static ref ITEM_7_START: Regex = Regex::new(
        r"(?is)ITEM(?:\s|\W|_){0,30}?(?:7|VII|SEVEN)(?:\s|\W|_){0,30}?.{0,3000}?(?:MANAGEMENT|MD\&A|DISCUSSION|ANALYSIS|OVERVIEW)"
    ).unwrap();
    
 
    static ref ITEM_7_END: Regex = Regex::new(
        r"(?is)ITEM\W{0,20}?(?:7A|8|9|VIIA|VIII|IX)\W.{0,800}?(?:QUANTITATIVE|FINANCIAL|CONSOLIDATED|SUPPLEMENTARY|CHANGES|ACCOUNTANTS|NOTES|REPORT|STATEMENTS)"
    ).unwrap();

    // Detects if a false start boundary caused us to swallow Items 1-6.
    static ref INVALID_INTERMEDIATE_ITEM: Regex = Regex::new(
        r"(?i)\bITEM\s*?(?:1B|2|3|4|5|6)\b"
    ).unwrap();


    static ref PAGE_HEADER_CLEANER: Regex = Regex::new(
        r"(?i)(?:Table of Contents|Page\s*\d+)"
    ).unwrap();
}

pub struct SecCrawlerUseCase {
    fetcher: Arc<dyn DocumentFetcherPort>,
    publisher: Arc<dyn EventPublisherPort>,
}

impl SecCrawlerUseCase {
    pub fn new(fetcher: Arc<dyn DocumentFetcherPort>, publisher: Arc<dyn EventPublisherPort>) -> Self {
        Self { fetcher, publisher }
    }

    pub async fn process_filing(&self, cik: &str, accession_number: &str, url: &str) -> Result<(), String> {
        info!("Starting processing pipeline for CIK: {}", cik);

        let raw_bytes = self.fetcher.fetch_raw_bytes(url).await.map_err(|e| {
            error!("Failed to fetch document for CIK {}: {}", cik, e);
            e
        })?;

        let item_7_text = self.extract_item_7(&raw_bytes).ok_or_else(|| {
            let err = format!("Item 7 extraction failed for CIK {}", cik);
            warn!("{}", err);
            err
        })?;

        let payload = SecFilingPayload {
            cik_id: cik.to_string(),
            document_type: "10-K".to_string(),
            filing_data: chrono::Utc::now().to_rfc3339(),
            sec_accession_number: accession_number.to_string(),
            item_7_text,
        };

        self.publisher.publish_filing(&payload).await.map_err(|e| {
            error!("Failed to publish filing for CIK {}: {}", cik, e);
            e
        })?;

        info!("Successfully processed and published filing for CIK: {}", cik);
        Ok(())
    }

    fn extract_item_7(&self, raw_bytes: &[u8]) -> Option<String> {
        let html_str = String::from_utf8_lossy(raw_bytes);
        
        let document = Html::parse_document(&html_str);
        let mut text = String::with_capacity(html_str.len() / 2);
        
        for text_node in document.root_element().text() {
            let chunk = text_node.trim();
            if !chunk.is_empty() {
                let ultra_clean = chunk
                    .replace('\u{200b}', "")
                    .replace('\u{00ad}', "")
                    .replace('\u{00A0}', " ")
                    .replace("&nbsp;", " ")
                    .replace("&#160;", " ");
                text.push_str(&ultra_clean);
                text.push(' ');
            }
        }

    
        let normalized_text = text.replace('\n', " ").replace('\r', " ");
        let space_cleaner = Regex::new(r"\s{2,}").unwrap();
        let flattened = space_cleaner.replace_all(&normalized_text, " ").to_string();
        let final_text = PAGE_HEADER_CLEANER.replace_all(&flattened, " ").to_string();

        let mut best_start_idx: Option<usize> = None;
        let mut best_end_idx: Option<usize> = None;
        let mut max_distance = 0; 
        let mut found_valid_block = false;

        let start_matches: Vec<_> = ITEM_7_START.find_iter(&final_text).collect();

        if start_matches.is_empty() {
            warn!("Could not find any Item 7 start boundaries.");
            return None;
        }

        // Floor & Fence Algorithm
        for start_match in start_matches {
            let start_pos = start_match.start();
            let end_of_start_match = start_match.end();
            let search_slice = &final_text[end_of_start_match..];

            if let Some(end_match) = ITEM_7_END.find(search_slice) {
                let distance = end_match.start(); 

                
                if distance > max_distance {
                    let potential_payload = &search_slice[..distance];
                    
                    
                    if INVALID_INTERMEDIATE_ITEM.is_match(potential_payload) {
                        warn!("Fence triggered: Bounding box contained intermediate Items. Rejecting false positive.");
                        continue;
                    }

                    max_distance = distance;
                    best_start_idx = Some(start_pos);
                    best_end_idx = Some(end_of_start_match + distance); 
                    found_valid_block = true;
                }
            }
        }

     
        if max_distance < 1500 || !found_valid_block {
            warn!("Item 7 identified, but failed Floor constraints (Max distance: {} chars).", max_distance);
            return None;
        }

        if let (Some(start), Some(end)) = (best_start_idx, best_end_idx) {
            let extracted = final_text[start..end].trim();
            info!("X-RAY: Successfully extracted MD&A payload of length {} using Floor & Fence Algorithm.", extracted.len());
            return Some(extracted.to_string());
        }

        None
    }
}