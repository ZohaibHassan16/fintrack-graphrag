package com.enterprise.fintrack.domain.ports;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * Port to execute read-only queries against the Neo4j cluster asynchronously.
 */

public interface GraphPersistencePort {
    CompletableFuture<List<Map<String, Object>>> executeQuery(String cypher, Map<String, Object> parameters);
    CompletableFuture<List<Map<String, Object>>> executeVectorSearch(List<Float> embeddingVector, int limit);
}