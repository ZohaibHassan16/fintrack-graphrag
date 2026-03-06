import asyncio
import json
import logging
import grpc
from contextlib import asynccontextmanager
import os
import sys
import traceback
import zstandard as zstd 

from fastapi import FastAPI, Response
from fastapi.responses import PlainTextResponse
import uvicorn
from confluent_kafka import Consumer, KafkaError, KafkaException
from prometheus_client import Summary, Counter, Gauge, generate_latest, CONTENT_TYPE_LATEST
from sentence_transformers import SentenceTransformer

from application.semantic_chunker import SecDocumentChunker
from application.entity_resolution import DeterministicEntityResolver, EntityContext
from application.llm_extractor import PyTorchFiboExtractor
from infrastructure.neo4j_repository import Neo4jKnowledgeGraphRepository
from domain.fibo_ontology import CompanyNode

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Metrics
NLP_CONFIDENCE_DRIFT = Summary('nlp_extraction_confidence', 'Extraction confidence score')
ENTITY_RESOLUTION_TOTAL = Counter('entity_resolution_total', 'Total entity resolution attempts')
ENTITY_RESOLUTION_SUCCESS = Counter('entity_resolution_success', 'Successful entity merges')
KAFKA_CONSUMER_LAG = Gauge('kafka_consumer_lag', 'Current message lag for NLP group')


class FintrackAIPipeline:
    """
    Clean architectural Facade to orchestrate both the LLM Extractor 
    and the dense Embedding Model.
    """
    def __init__(self):
        logger.info("Initializing Fintrack AI Pipeline...")
        
        logger.info("Loading SentenceTransformer for semantic embeddings...")
        self.embedder = SentenceTransformer('all-MiniLM-L6-v2')
        

        logger.info("Loading Hardware-Aware Qwen2.5 for Entity Extraction...")
        self.extractor = PyTorchFiboExtractor()  # Dynamic init 
        
        logger.info("▣▣▣▣ Full AI Pipeline Loaded Successfully.")

    def generate_embedding(self, text: str) -> list[float]:
        """Generates a 384-dimensional vector for gRPC and Neo4j indexing."""
        logger.debug(f"Generating semantic embedding for text: {text[:40]}...")
        return self.embedder.encode(text).tolist()

    def extract_triples_with_confidence(self, text: str):
        """Executes LLM inference to extract FIBO-compliant triples."""
        return self.extractor.extract_triples_with_confidence(text)


chunker = SecDocumentChunker()
resolver = DeterministicEntityResolver(similarity_threshold=0.94)

ai_engine = FintrackAIPipeline()

neo4j_repo = Neo4jKnowledgeGraphRepository("bolt://neo4j-cluster:7687", "neo4j", "secure_password")
app_state = {"consumer_running": False}


async def process_kafka_message(msg) -> bool:
    try:
        raw_bytes = msg.value()
        
        try:
            dctx = zstd.ZstdDecompressor()
            decompressed_data = dctx.decompress(raw_bytes)
            payload_str = decompressed_data.decode("utf-8")
        except zstd.ZstdError:
            logger.warning(f"Zstd decompression failed for offset {msg.offset()}, attempting raw decode.")
            payload_str = raw_bytes.decode("utf-8")
    
        payload = json.loads(payload_str)
        
        cik = payload["cik_id"]
        accession_number = payload["sec_accession_number"]
        raw_text = payload["item_7_text"]
        
        logger.info(f"Processing SEC filing for CIK: {cik}")

        semantic_chunks = chunker.chunk_document(raw_text, cik, accession_number)
        
        if semantic_chunks and len(semantic_chunks) > 0:
            logger.debug(f"Sample chunk text: {semantic_chunks[0].text_content[:100]}...")
            
        for chunk in semantic_chunks:
            chunk.embedding = await asyncio.to_thread(ai_engine.generate_embedding, chunk.text_content)
            
        await neo4j_repo.persist_semantic_chunks(semantic_chunks)
        
        all_triples = []
        resolved_companies = {}
        
        for chunk in semantic_chunks:
            triples, confidence_scores = await asyncio.to_thread(ai_engine.extract_triples_with_confidence, chunk.text_content)
            all_triples.extend(triples)
            for score in confidence_scores:
                NLP_CONFIDENCE_DRIFT.observe(score)
            
        for triple in all_triples:
            ENTITY_RESOLUTION_TOTAL.inc()
            
            ctx_subj = EntityContext(c_suite_execs=[], sector_classification="Technology")
            ctx_obj = EntityContext(c_suite_execs=[], sector_classification="Technology")
            
            is_resolved = resolver.resolve_entities(
                triple.subject_cik, ctx_subj, 
                triple.object_cik, ctx_obj
            )
            
            if is_resolved:
                ENTITY_RESOLUTION_SUCCESS.inc()
                resolved_companies[triple.subject_cik] = CompanyNode(
                    cik_id=triple.subject_cik,
                    legal_name="Unified Entity Name", 
                    fibo_sector_classification="Technology"
                )

        if all_triples:
            await neo4j_repo.persist_fibo_triples(
                triples=all_triples, 
                companies=list(resolved_companies.values())
            )
            
        logger.info(f"Successfully processed and persisted pipeline for CIK: {cik}")
        return True
        
    except Exception as e:
        logger.error(f"Pipeline failure during message processing for offset {msg.offset()}: {e}")
        logger.error(traceback.format_exc())
        return False


async def kafka_consumer_loop():
    logger.info("Starting Kafka consumer task initialization...")
    consumer = None
    try:
        consumer_config = {
            'bootstrap.servers': 'kafka-cluster:9092',
            'group.id': 'nlp-extraction-group',
            'client.id': 'nlp-extraction-consumer-1', # Added for observability
            'auto.offset.reset': 'earliest',
            'enable.auto.commit': False,
            # max.poll.records has been strictly removed
            'fetch.max.bytes': 10485760,    
            'max.poll.interval.ms': 3600000  
        }
        
        consumer = Consumer(consumer_config)
        consumer.subscribe(['sec-filings-raw'])
        app_state["consumer_running"] = True
        
        logger.info("Kafka consumer loop started and subscribed. Awaiting payloads from Rust Ingestion Worker...")

        while app_state["consumer_running"]:
            # asyncio.to_thread prevents the synchronous poll from freezing FastAPI
            msg = await asyncio.to_thread(consumer.poll, 1.0)
            if msg is None: 
                continue
            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    continue
                else:
                    logger.error(f"Kafka consumer error: {msg.error()}")
                    break
            
            success = await process_kafka_message(msg)
            
            if success:
                consumer.commit(msg, asynchronous=False)
                logger.debug(f"Successfully committed Kafka offset: {msg.offset()}")
            else:
                logger.warning(f"Message processing failed. Offset {msg.offset()} not committed.")
                
    except asyncio.CancelledError:
        logger.info("Kafka consumer cancelled (shutdown requested).")
        raise
    except KafkaException as e:
        logger.error("Kafka error during consumer initialization or polling", exc_info=True)
    except Exception as e:
        logger.critical(f"☒☒☒☒ CRITICAL: Kafka consumer loop crashed: {e}", exc_info=True)
    finally:
        if consumer is not None:
            consumer.close()
        logger.info("Kafka consumer shut down gracefully.")
        app_state["consumer_running"] = False


async def start_grpc_server():
    try:
        logger.info("Attempting to boot gRPC Server...")
        server = grpc.aio.server()
        
        sys.path.append(os.path.join(os.path.dirname(__file__), "infrastructure"))
        
        import infrastructure.embedding_pb2_grpc as pb2_grpc
        from infrastructure.grpc_servicer import EmbeddingServicer
        
        servicer = EmbeddingServicer(ai_engine)
        pb2_grpc.add_EmbeddingServiceServicer_to_server(servicer, server)
        
        with open('/certs/server.key', 'rb') as f: private_key = f.read()
        with open('/certs/server.crt', 'rb') as f: certificate_chain = f.read()
        with open('/certs/ca.crt', 'rb') as f: root_certificates = f.read()

        server_credentials = grpc.ssl_server_credentials(
            ((private_key, certificate_chain),),
            root_certificates=root_certificates,
            require_client_auth=True
        )
        
        server.add_secure_port('0.0.0.0:50051', server_credentials)
        await server.start()
        logger.info("🪨 Secure mTLS gRPC Server started. Listening on port 50051...")
        await server.wait_for_termination()
        
    except Exception as e:
        logger.error(f"☒☒☒☒ CRITICAL: gRPC Server failed to start! Error: {e}")
        logger.error(traceback.format_exc())


@asynccontextmanager
async def lifespan(app: FastAPI):
    kafka_task = asyncio.create_task(kafka_consumer_loop()) 
    grpc_task = asyncio.create_task(start_grpc_server())
    
    await asyncio.sleep(2)  
    yield
    
    logger.info("Initiating graceful shutdown...")
    app_state["consumer_running"] = False
    
    # Wait for Kafka to finish processing its last message before closing Neo4j
    await asyncio.sleep(1) 
    await neo4j_repo.close()
    
    grpc_task.cancel()
    kafka_task.cancel()
    try:
        await asyncio.gather(kafka_task, grpc_task, return_exceptions=True)
    except asyncio.CancelledError:
        pass

app = FastAPI(lifespan=lifespan)

@app.get("/health")
async def health_check():
    return {"status": "healthy", "ai_model": "Qwen2.5-Instruct (Dynamic) + all-MiniLM-L6-v2"}

@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)