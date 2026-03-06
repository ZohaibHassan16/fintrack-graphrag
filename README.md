```text
=============================================================================
 _____ _       _                  _    
|  ___(_)_ __ | |_ _ __ __ _  ___| | __
| |_  | | '_ \| __| '__/ _` |/ __| |/ /
|  _| | | | | | |_| | | (_| | (__|   < 
|_|   |_|_| |_|\__|_|  \__,_|\___|_|\_\

PROJECT: Fintrack
DESC: SEC GraphRAG Pipeline
=============================================================================

```
## SYNOPSIS
--------
Fintrack is a distributed GraphRAG pipeline 
built to extract, vectorize, and query financial data from SEC EDGAR 10-K filings. 

The core purpose of this system is to reliably parse the notoriously malformed 
HTML of corporate annual reports, specifically isolating "Item 7: Management’s 
Discussion and Analysis". Once extracted, this unstructured text is transformed 
into a highly structured Knowledge Graph and dense vector embeddings. 

Users interact with the system via a web interface by submitting natural language 
queries (e.g., "Summarize Accenture's AI risk factors"). The system traverses 
the financial knowledge graph, retrieves the exact relevant semantic chunks, 
and streams back AI-generated, fully cited and auditable financial analysis in real-time. 

It is explicitly engineered to survive the SEC's dirty data formats.

---

## [0x00] ARCHITECTURE TOPOLOGY

```text
+----------+      +-------------------+      +-------+      +------------------+      +----------------+
| Vanguard | ---> | Ingestion Crawler | ---> | Kafka | ---> | Python Compute   | ---> | Postgres/Neo4j |
| Producer |      | (Rust Tokio Node) |      | Broker|      | (PyTorch Engine) |      | (Storage)      |
+----------+      +-------------------+      +-------+      +------------------+      +----------------+
                                                                     ^
                                                                     |
                  +-------------------+      +------------+          |
                  | React             | ---> | Java Netty | ---------+
                  | Frontend          | <--- | Gateway    |
                  +-------------------+      +------------+

```

## [0x01] COMPONENT MANIFEST

**[+] Vanguard Daemon (Producer) :: Rust**

* Upstream discovery scheduler for the pipeline.
* Dual-mode execution (Historical Backfill / Live RSS).
* Resolves substantive HTML targets via SEC JSON API.
* Queues pending tasks in PostgreSQL for the downstream crawler.

**[+] Ingestion Crawler Node :: Rust**

* Coordinates SEC EDGAR scraping via a Postgres operational control plane.
* Implements strict rate-limiting and exponential backoff.
* Executes "Floor & Fence" regex algorithm to extract SEC Item 7 (MD&A).
* Pushes strictly cleaned payloads to Kafka (conserves bandwidth from raw HTML).

**[+] Inference Engine (Compute) :: Python/PyTorch**

* Consumes Zstandard-compressed payloads from Kafka.
* Handles LangChain text chunking and vector embedding.
* Executes deterministic entity resolution and LLM inference for FIBO triples.
* Exposes interface via gRPC for real-time RAG generation.

**[+] Async HTTP Broker (Gateway) :: Java Netty**

* Bridges HTTP/SSE to backend gRPC.
* Maintains persistent TCP connections.

**[+] UI Client (Frontend) :: React/Vite**

* Parses SSE streams simulating terminal stdout.
* Real-time Neo4j DAG rendering.
* Hardened with explicit abort controllers.

---

## [0x02] PKI / mTLS CONFIGURATION

Strict mutual TLS (mTLS) is enforced between the Java Netty Gateway and the Python Compute gRPC endpoints. The daemon expects a `certs/` directory in the project root with the following exact topology.

**!!! WARNING: NEVER COMMIT `*.key` FILES TO REVISION CONTROL !!!**

```text
certs/
|-- ca.crt          # Root Certificate Authority
|-- server.crt      # Python NLP Engine Public Cert (CN: python-nlp-engine)
|-- server.key      # Python NLP Engine Private Key (KEEP SECRET)
|-- client.crt      # Java Netty Gateway Public Cert (CN: java-netty-gateway)
|-- client.key      # Java Netty Gateway Private Key (KEEP SECRET)
+-- client.pkcs8.key# PKCS#8 formatted key (Required for specific Netty/Java SSL contexts)

```

---

## [0x03] CONTAINERIZATION & RUNTIME SPECS

All daemons are packaged via multi-stage Docker builds to strip build-time dependencies and minimize attack surface. Execution privileges are strictly dropped to non-root users (`fintrack_admin`) where applicable.

**[+] Java Netty Gateway (`Dockerfile.java-gateway`)**

* **Build:** `maven:3.9.5-eclipse-temurin-21`
* **Runtime Base:** `eclipse-temurin:21-jre-alpine`
* **Network:** Binds TCP/8080.
* **VM Tuning:** * `-XX:+UseZGC`
* `-XX:MaxRAMPercentage=75.0`
* `-Djava.security.egd=file:/dev/./urandom`



**[+] Python NLP Compute (`Dockerfile.python-nlp`)**

* **Build/Env:** Python 3.11 via `poetry`.
* **Runtime Base:** `nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04` (Hardware acceleration is strictly required; cuDNN 8 mapped).
* **Network:** Binds TCP/8000 (gRPC).

**[+] Rust Nodes (`Dockerfile.rust-ingestion` & `Dockerfile.rust-producer`)**

* **Build:** `rust:1.88-slim-bookworm` / `rust:1.88-alpine`
* **Runtime Base:** `debian:bookworm-slim` / `alpine:3.19`

---

## [0x04] OBSERVABILITY & TELEMETRY

The cluster utilizes Prometheus for time-series metrics collection.

**[+] Prometheus Daemon**

* **Configuration Path:** `k8/namespaces/observability/prometheus.yml`
* **Active Targets:** `localhost:9090`, `nlp-compute-tier:8000`.

---

## [0x05] SUBSYSTEM: JAVA NETTY GATEWAY

The Gateway operates as a non-blocking asynchronous HTTP to gRPC/Bolt broker. It is built on Java 21 using Netty 4.1.

**[+] I/O Execution Model**

* **Entrypoint:** `POST /api/v1/query`
* **Event Loop:** Utilizes a 1-thread BossGroup delegating to WorkerGroup.

**[+] GraphRAG Orchestration Engine**
Routes execution paths via `CompletableFuture`:

* `SEMANTIC_SEARCH`: Vectorizes text -> queries Neo4j -> calls LLM.
* `DETERMINISTIC_TRAVERSAL`: Raw Cypher execution against Neo4j.
* `HYBRID_GRAPH_RAG`: Concurrent execution of both methods.

**[+] AST Cypher Validation Middleware**
Parses incoming Cypher into an AST. Instantly kills queries containing modification clauses (`MERGE`, `CREATE`, `SET`, `REMOVE`, `DELETE`).

---

## [0x06] SUBSYSTEM: RUST INGESTION CRAWLER

The Ingestion Crawler retrieves, cleans, and extracts SEC 10-K filings using an async worker pool.

**[+] SEC EDGAR Client & Extraction**

* Polling `ingestion_state` table for `PENDING` tasks.
* Employs "Floor & Fence" regex logic to extract the exact boundaries of "Item 7: Management’s Discussion and Analysis".
* Rejects false positives (e.g., intermediate Items) and sanitizes zero-width ASCII artifacts.
* Publishes to `sec-filings-raw` Kafka topic via `rdkafka`.

---

## [0x07] SUBSYSTEM: PYTHON NLP INFERENCE ENGINE

The AI Compute tier handles dense vectorization, relationship extraction, and real-time generation via Qwen2.5-Instruct.

**[+] Processing Pipeline**

* Decompresses `zstd` Kafka payloads.
* Chunks text into overlapping semantic blocks.
* Extracts `ExtractionTriple` relationships conforming strictly to the FIBO ontology.
* Deterministically resolves entity collisions via spaCy NLP lemmatization and vector cosine similarity.
* Batch inserts nodes, sequential relationships (`NEXT_CHUNK`), and semantic edges into Neo4j via Cypher `UNWIND`.
* Hosts an mTLS gRPC server to stream prompt completions back to the Gateway.

---

## [0x08] SUBSYSTEM: VANGUARD PRODUCER (DISCOVERY DAEMON)

The Vanguard Producer is a lightweight, strict Rust daemon tasked solely with discovering target filings and feeding the Postgres operational queue.

**[+] Dual-Mode Execution Engine**

* **Historical Backfill:** On startup, probes `/app/data/sp500_ciks.txt`. Iterates through target CIKs, queries the SEC JSON API for submission history, and queues the most recent 10-K filing.
* **Live RSS Monitoring:** Infinite asynchronous loop leveraging `quick-xml`. Polls the EDGAR Atom feed (`action=getcurrent&type=10-k`) every 900 seconds to discover newly published filings.

**[+] Substantive URL Resolution**
EDGAR RSS feeds frequently surface `.txt` SGML wrappers instead of the actual HTML payload. The daemon intercepts these wrappers and uses the accession number to query the SEC JSON endpoint (`data.sec.gov/submissions/CIK...json`), stripping the interactive `ix?doc=` viewer prefix to resolve the raw, parsable `.htm` document link.

**[+] State Management & Network Constraints**

* **Rate Limiting:** Enforces an unyielding 9 Request-Per-Second limit via the `governor` crate (`Quota::per_second(nonzero!(9u32))`) to prevent SEC IP bans.
* **Queueing:** Utilizes `sqlx` to execute an `INSERT ... ON CONFLICT DO NOTHING` statement, persisting the resolved CIK, Accession Number, and URL to the `ingestion_state` table as `PENDING` for the downstream crawler to consume.

---

## [0x09] INTER-PROCESS COMMUNICATION (gRPC / PROTOBUF)

The Java Netty Gateway and Python NLP Engine communicate strictly over an mTLS-encrypted HTTP/2 channel utilizing Protocol Buffers (proto3). The Interface Definition Language (IDL) contract is defined in `src/libs/protobuf-schemas/embedding.proto`.

**[+] Service Definitions (`EmbeddingService`)**

* `GenerateEmbedding`: Unary RPC. Accepts an `EmbeddingRequest` and returns an `EmbeddingResponse` containing a packed 384-dimensional float array. Includes server-side processing latency (`processing_time_ms`) for telemetry.
* `GenerateAnswer`: Server-Streaming RPC. Accepts a `RAGRequest` containing the user query and an array of `context_chunks` retrieved from Neo4j. Returns an asynchronous stream of `RAGResponse` messages, emitting individual tokens to the Gateway as they are generated by the PyTorch model. Uses an `is_final` boolean flag to signal safe frame teardown.

---

## [0x0A] ORCHESTRATION & WORKSPACE BUILD

The infrastructure is provisioned via `docker-compose` on a localized, isolated bridge network (`fintrack_internal_net`). The Rust daemons are compiled via a unified Cargo virtual workspace at the repository root (Resolver V2) to enforce strict dependency versioning across the `ingestion_service` and `producer_service`.

**[+] Backing Data Services**

* **PostgreSQL (v15):** Operational control plane (port 5432). Validated via `pg_isready` healthcheck.
* **Redis (v7):** Caching layer with AOF persistence (port 6379).
* **Kafka (v3.5.1):** Configured in KRaft mode (bypassing ZooKeeper). Exposes `PLAINTEXT://9092` for brokering and `CONTROLLER://9093` for quorum voting.
* **Neo4j (v5.15.0 Enterprise):** Knowledge Graph persistence. The APOC plugin is injected at runtime. JVM limits are strictly defined (1G pagecache, 1G initial heap, 2G max heap) to prevent memory ballooning. Requires a 40s start period to accommodate graph initialization.

**[+] Initialization Dependency Graph**
To prevent connection refused panics, microservices declare explicit `depends_on` conditions bound to internal healthchecks:

* `postgres-cluster`, `neo4j-cluster`, and `kafka-cluster` must reach `service_healthy` state.
* `producer-tier` and `ingestion-tier` boot once Postgres/Kafka are ready.
* `nlp-compute-tier` maps `./certs` and limits RAM allocation to 8GB, starting after Neo4j and Kafka are responsive.
* `gateway-tier` initiates last, verifying `nlp-compute-tier` is fully instantiated (`service_started`) before binding port 8080.

---

## [0x0B] BUILD & INITIALIZATION SEQUENCE

Prerequisites:
* Docker Engine >= 20.10 & Docker Compose >= 2.0
* Node.js >= 18.0 (for local client execution)
* Sufficient disk space for SEC EDGAR backfill operations (>100GB for multi-year archives).

**[+] 1. Environment Configuration**
Clone the repository and populate `.env` files across all daemon directories. 
Required minimum variables: `POSTGRES_URI`, `NEO4J_AUTH`, and `KAFKA_BROKER`.

**[+] 2. Backend Orchestration (Docker)**
Initialize the infrastructure. The Docker Compose dependency graph will automatically stagger the boot sequence to prevent connection refused panics.

>_ $ docker compose build
>_ $ docker compose up -d

Verify daemon health, monitor the Kafka consumer lag, or watch the Java Netty event loops:
>_ $ docker compose logs --tail=50 -f

**[+] 3. Client Interface (Frontend)**
The React interface must be executed locally to capture raw Server-Sent Events (SSE) packets without Docker bridge network interference or buffering.

>_ $ cd frontend
>_ $ npm install
>_ $ npm run dev

The Vite development server binds to `localhost:5173`. 


```text
============================================================================= EOF

```

---
