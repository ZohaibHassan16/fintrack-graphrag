package com.enterprise.fintrack.domain;

/**
 * Determines the execution path of the GraphRAG engine.
 */
public enum QueryIntentType {
    /** Requires nuanced, semantic understanding via vector similarity search. */
    SEMANTIC_SEARCH,
    
    /** Requires deterministic relationship tracing via Cypher traversals. */
    DETERMINISTIC_TRAVERSAL,
    
    /** Combines explicit subgraph connections and semantically relevant text chunks. */
    HYBRID_GRAPH_RAG
}