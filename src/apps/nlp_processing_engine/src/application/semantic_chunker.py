from langchain.text_splitter import RecursiveCharacterTextSplitter
from pydantic import BaseModel
from typing import List, Optional
import logging

logger = logging.getLogger(__name__)

class SemanticChunk(BaseModel):
    """Represents a coherent semantic text block ready for
       vectorization and LLM extraction.
    """
    chunk_id: str
    source_cik: str
    accession_number: str
    text_content: str
    sequence_index: int
    embedding: Optional[List[float]] = None 

class SecDocumentChunker:
    def __init__(self):
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=2000,
            chunk_overlap=200,
            length_function=len,
            separators=["\n\n", "\n", "(?<=\. )", " ", ""]
        )
    
    def chunk_document(self, raw_text: str, cik: str, accession_number: str) -> List[SemanticChunk]:
        """
        Splits dense financial filings while preserving critical context
        and preventing the fracturing of financial sentences.
        """
        
        raw_chunks = self.text_splitter.split_text(raw_text)
        semantic_chunks = []
        
        for index, text in enumerate(raw_chunks):
            chunk = SemanticChunk(
                chunk_id=f"{accession_number}_chunk_{index}",
                source_cik=cik,
                accession_number=accession_number,
                text_content=text,
                sequence_index=index
            )
            semantic_chunks.append(chunk)
        
        logger.info(f"Successfully generated {len(semantic_chunks)} semantic chunks for CIK: {cik}")
        return semantic_chunks