package com.enterprise.fintrack.domain.ports;

import java.util.List;
import java.util.concurrent.CompletableFuture;

/**
 * Port for the gRPC call to the dedicated Python embedding and LLM service.
 */
public interface EmbeddingServicePort {
    CompletableFuture<List<Float>> generateVectorEmbedding(String query);
    

    CompletableFuture<String> generateAnswer(String query, List<String> contextChunks);
}