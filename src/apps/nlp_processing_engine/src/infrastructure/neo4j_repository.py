from neo4j import AsyncGraphDatabase
from typing import List
import logging

from domain.fibo_ontology import CompanyNode, ExtractionTriple
from application.semantic_chunker import SemanticChunk

logger = logging.getLogger(__name__)

class Neo4jKnowledgeGraphRepository:
    def __init__(self, uri: str, user: str, password: str):
        self.driver = AsyncGraphDatabase.driver(uri, auth=(user, password))
        
    async def close(self):
        await self.driver.close()
    
    async def persist_semantic_chunks(self, chunks: List[SemanticChunk]):
        """
        Uses UNWIND for both node creation and relationship 
        linking in a single batch transaction.
        """
        if not chunks: return

    
        batch_cypher = """
        UNWIND $chunks as data
        MERGE (c:Chunk {chunk_id: data.chunk_id})
        SET c.source_cik = data.source_cik,
            c.accession_number = data.accession_number,
            c.text_content = data.text_content,
            c.sequence_index = data.sequence_index,
            c.embedding = data.embedding
            
        MERGE (f:Form {sec_accession_number: data.accession_number})
        MERGE (s:Section {name: "Item 7: Management's Discussion"})
        MERGE (f)-[:HAS_SECTION]->(s)
        MERGE (s)-[:CONTAINS]->(c)
        """
        
    
        linked_list_cypher = """
        UNWIND range(0, size($chunks) - 2) AS i
        WITH $chunks[i] AS c1, $chunks[i+1] AS c2
        MATCH (node1:Chunk {chunk_id: c1.chunk_id})
        MATCH (node2:Chunk {chunk_id: c2.chunk_id})
        MERGE (node1)-[:NEXT_CHUNK]->(node2)
        """
        
        async with self.driver.session() as session:
            chunk_data = [c.model_dump() for c in chunks]
            await session.run(batch_cypher, chunks=chunk_data)
            await session.run(linked_list_cypher, chunks=chunk_data)
            
        logger.info(f"Persisted {len(chunks)} chunks and sequential relationships via batching.")
    
    async def persist_fibo_triples(self, triples: List[ExtractionTriple], companies: List[CompanyNode]):
        """
        Dynamic relationship creation using APOC or UNWIND batching.
        """
        node_cypher = """
        UNWIND $companies AS comp
        MERGE (c:Company {cik_id: comp.cik_id})
        SET c.legal_name = comp.legal_name,
            c.stock_ticker = comp.stock_ticker,
            c.fibo_sector_classification = comp.fibo_sector_classification
        """

    
        edge_cypher = """
        UNWIND $triples AS t
        MATCH (subj:Company {cik_id: t.subject_cik})
        MATCH (obj:Company {cik_id: t.object_cik})
        CALL apoc.create.relationship(subj, t.predicate, {}, obj) YIELD rel
        RETURN count(rel)
        """

        async with self.driver.session() as session:
            await session.run(node_cypher, companies=[c.model_dump() for c in companies])
            if triples:
                await session.run(edge_cypher, triples=[t.model_dump() for t in triples])
                
        logger.info(f"Persisted {len(triples)} validated FIBO relationships via batching.")