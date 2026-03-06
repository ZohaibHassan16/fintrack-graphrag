import spacy
import numpy as np
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)

class EntityContext:
    """ Represents the secondary contextual properties for tie-breaking."""
    def __init__(self, c_suite_execs: List[str], sector_classification: str):
        self.c_suite_execs = set([exec.lower() for exec in c_suite_execs])
        self.sector_classification = sector_classification.lower()
        
class DeterministicEntityResolver:
    def __init__(self, similarity_threshold: float = 0.94):
        self.similarity_threshold = similarity_threshold
        logger.info("Loading spaCy NLP model for lemmatization...")
        self.nlp = spacy.load("en_core_web_sm")
        
        logger.info("Loading Sentence Transformer for vector embeddings...")
        self.embedder = SentenceTransformer("all-MiniLM-L6-v2")
    
    def _cosine_similarity(self, vec_a: np.ndarray, vec_b: np.ndarray) -> float:
        """
        Computes the mathematical similarity between two dense vector representations.
        """
        
        dot_product = np.dot(vec_a, vec_b)
        norm_a = np.linalg.norm(vec_a)
        norm_b = np.linalg.norm(vec_b)
        
        if norm_a == 0 or norm_b == 0:
            return 0.0
        
        return dot_product / (norm_a * norm_b)
    
    def _basic_nlp_match(self, name_a: str, name_b: str) -> bool:
        """
        Eliminate trivial duplicates.
        """
        
        doc_a = self.nlp(name_a.lower())
        doc_b = self.nlp(name_b.lower())
        
        lemma_a = " ".join([token.lemma_ for token in doc_a if not token.is_punct])
        lemma_b = " ".join([token.lemma_ for token in doc_b if not token.is_punct])
        
        return lemma_a == lemma_b
    
    def _evaluate_context(self, context_a: EntityContext, context_b: EntityContext) -> bool:
        """
        Evaluates secondary contextual properties if vector similarity is high.
        """
        if context_a.sector_classification != context_b.sector_classification:
            return False
        
        intersection = context_a.c_suite_execs.intersection(context_b.c_suite_execs)
        
        return len(intersection) > 0
    
    def resolve_entities(
        self, 
        name_a: str, context_a: EntityContext,
        name_b: str, context_b: EntityContext
    ) -> bool:
        """
        Executes the multi-stage deterministic entity resolution algorithm.
        """
        
        if self._basic_nlp_match(name_a, name_b):
            logger.debug(f"Entities '{name_a}' and '{name_b}' resolved via spaCy lemmatization.")
            return True
        
        embeddings = self.embedder.encode([name_a, name_b])
        vec_a, vec_b = embeddings[0], embeddings[1]
        
        sim_score = self._cosine_similarity(vec_a, vec_b)
        
        if sim_score > self.similarity_threshold:
            logger.debug(f"Cosine similarity ({sim_score:.3f}) > threshold. Evaluating context...")
            if self._evaluate_context(context_a, context_b):
                logger.info(f"Entities '{name_a}' and '{name_b}' successfully resolved into a unified identifier.")
                return True
            
        return False
                