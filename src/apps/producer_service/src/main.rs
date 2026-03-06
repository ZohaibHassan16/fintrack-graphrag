use serde::Deserialize;
use sqlx::postgres::PgPoolOptions;
use std::env;
use tokio::time::{sleep, Duration};
use tracing::{info, warn, error, Level};
use tracing_subscriber::FmtSubscriber;
use quick_xml::de::from_str;
use governor::{Quota, RateLimiter};
use nonzero_ext::nonzero;
use std::sync::Arc;

// SEC JSON schema
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
    form: Vec<String>,
}

// RSS Schema
#[derive(Debug, Deserialize)]
struct Feed {
    #[serde(rename = "entry", default)]
    entries: Vec<Entry>,
}
#[derive(Debug, Deserialize)]
struct Entry {
    id: String, 
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let subscriber = FmtSubscriber::builder().with_max_level(Level::INFO).finish();
    tracing::subscriber::set_global_default(subscriber).unwrap();

    info!("Starting Fintrack SEC Discovery Producer ...");

    let db_url = env::var("DATABASE_URL").unwrap_or_else(|_| "postgres://user:pass@postgres-cluster:5432/staging_db".to_string());
    let pool = PgPoolOptions::new().max_connections(2).connect(&db_url).await?;

    let client = reqwest::Client::builder()
        .user_agent("Fintrack Corp contact@fintrack.com") 
        .timeout(Duration::from_secs(30))
        .build()?;

    // 9 rq ps to be safe
    let limiter = Arc::new(RateLimiter::direct(Quota::per_second(nonzero!(9u32))));

    // Historical backfill mode
    if let Ok(ciks_str) = std::fs::read_to_string("/app/data/sp500_ciks.txt") {
        info!("HISTORICAL_CIKS detected. Running historical backfill for: {}", ciks_str);
        
        for raw_cik in ciks_str.split(',') {
            let raw_cik = raw_cik.trim();
            if raw_cik.is_empty() { continue; }
            
            let padded_cik = format!("{:0>10}", raw_cik);
            let api_url = format!("https://data.sec.gov/submissions/CIK{}.json", padded_cik);

            limiter.until_ready().await;
            let Ok(api_resp) = client.get(&api_url).send().await else {
                error!("Failed to fetch API for CIK: {}", raw_cik);
                continue;
            };
            
            let Ok(submissions) = api_resp.json::<SecSubmissions>().await else {
                error!("Failed to parse JSON for CIK: {}", raw_cik);
                continue; 
            };

            let recent = submissions.filings.recent;
            let mut found = false;
            
            // Scan for the most recent 10-K
            for (i, form) in recent.form.iter().enumerate() {
                if form == "10-K" {
                    let acc_num = &recent.accession_number[i];
                    let mut primary_doc = recent.primary_document[i].clone();
                    
                    if primary_doc.contains("ix?doc=") {
                        primary_doc = primary_doc.replace("ix?doc=", "");
                    }
                    
                    let accession_no_dashes = acc_num.replace("-", "");
                    let final_html_url = format!(
                        "https://www.sec.gov/Archives/edgar/data/{}/{}/{}", 
                        raw_cik.trim_start_matches('0'), 
                        accession_no_dashes, 
                        primary_doc
                    );

                    let result = sqlx::query(
                        "INSERT INTO ingestion_state (cik, accession_number, document_url, status)
                         VALUES ($1, $2, $3, 'PENDING')
                         ON CONFLICT (cik, accession_number) DO NOTHING"
                    )
                    .bind(raw_cik)
                    .bind(acc_num)
                    .bind(&final_html_url)
                    .execute(&pool)
                    .await;

                    if let Ok(res) = result {
                        if res.rows_affected() > 0 {
                            info!("Historical Backfill: Queued {} 10-K -> {}", raw_cik, final_html_url);
                        } else {
                            info!("Historical Backfill: {} 10-K is already in the database.", raw_cik);
                        }
                    }
                    found = true;
                    break;
                }
            }
            if !found {
                warn!("No historical 10-K found for CIK: {}", raw_cik);
            }
        }
        info!("Historical backfill sequence complete. Transitioning to live RSS monitoring...");
    }


    // Live RSS monitoring
    loop {
        info!("Checking SEC RSS feed for new filings...");

        let rss_url = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=10-k&output=atom";
        let Ok(resp) = client.get(rss_url).send().await else {
            error!("Failed to fetch RSS feed");
            sleep(Duration::from_secs(60)).await;
            continue;
        };

        let xml_text = resp.text().await?;
        let Ok(feed) = from_str::<Feed>(&xml_text) else {
            error!("Failed to parse RSS XML");
            continue;
        };

        let mut new_filings = 0;

        for entry in feed.entries {
            // Extract Accession Number from  entry ID
            let Some(accession) = entry.id.split("accession-number=").nth(1) else { continue; };
            let raw_cik = accession.split('-').next().unwrap_or_default();
            
            let padded_cik = format!("{:0>10}", raw_cik);
            let api_url = format!("https://data.sec.gov/submissions/CIK{}.json", padded_cik);

            // Resolve the actual Primary Document via JSON API
            limiter.until_ready().await;
            let Ok(api_resp) = client.get(&api_url).send().await else { continue; };
            let Ok(submissions) = api_resp.json::<SecSubmissions>().await else { continue; };
            
            let recent = submissions.filings.recent;
            for (i, acc_num) in recent.accession_number.iter().enumerate() {
                if acc_num == accession {
                    let mut primary_doc = recent.primary_document[i].clone();
                    
    
                    if primary_doc.contains("ix?doc=") {
                        primary_doc = primary_doc.replace("ix?doc=", "");
                    }

                    let accession_no_dashes = acc_num.replace("-", "");
                    let final_html_url = format!(
                        "https://www.sec.gov/Archives/edgar/data/{}/{}/{}", 
                        raw_cik.trim_start_matches('0'), 
                        accession_no_dashes, 
                        primary_doc
                    );

    
                    let result = sqlx::query(
                        "INSERT INTO ingestion_state (cik, accession_number, document_url, status)
                         VALUES ($1, $2, $3, 'PENDING')
                         ON CONFLICT (cik, accession_number) DO NOTHING"
                    )
                    .bind(raw_cik)
                    .bind(accession)
                    .bind(&final_html_url)
                    .execute(&pool)
                    .await?;

                    if result.rows_affected() > 0 {
                        new_filings += 1;
                        info!("Discovered & Resolved: CIK {} -> {}", raw_cik, final_html_url);
                    }
                    break;
                }
            }
        }

        info!("Run complete. Discovered {} new high-quality filings.", new_filings);
        sleep(Duration::from_secs(900)).await; 
    }
}