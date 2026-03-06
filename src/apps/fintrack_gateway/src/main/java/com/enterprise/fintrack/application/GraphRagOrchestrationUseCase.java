package com.enterprise.fintrack.application;

import com.enterprise.fintrack.domain.QueryIntentType;
import com.enterprise.fintrack.domain.ports.EmbeddingServicePort;
import com.enterprise.fintrack.domain.ports.GraphPersistencePort;
import com.enterprise.fintrack.domain.ports.CypherValidationPort;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * The core orchestration engine combining vector similarity searches 
 * with multi-hop Cypher traversals to provide hallucination-free AI responses.
 */
public class GraphRagOrchestrationUseCase {

    private static final Logger logger = LoggerFactory.getLogger(GraphRagOrchestrationUseCase.class);

    private final EmbeddingServicePort embeddingService;
    private final GraphPersistencePort graphPersistence;
    private final CypherValidationPort cypherValidator;

    public GraphRagOrchestrationUseCase(
            EmbeddingServicePort embeddingService,
            GraphPersistencePort graphPersistence,
            CypherValidationPort cypherValidator) {
        this.embeddingService = embeddingService;
        this.graphPersistence = graphPersistence;
        this.cypherValidator = cypherValidator;
    }

    /**
     * Intelligently routes the query based on semantic or deterministic intent.
     */
    public CompletableFuture<Map<String, Object>> orchestrateQuery(
            String naturalLanguageQuery, 
            QueryIntentType intent, 
            String generatedCypher) {
            
        logger.info("Orchestrating GraphRAG query with intent: {}", intent);

        return switch (intent) {
            case SEMANTIC_SEARCH -> executeSemanticSearch(naturalLanguageQuery);
            case DETERMINISTIC_TRAVERSAL -> executeDeterministicTraversal(generatedCypher);
            case HYBRID_GRAPH_RAG -> executeHybridRetrieval(naturalLanguageQuery, generatedCypher);
        };
    }

    /**
     * Executes the full RAG pipeline: Embedding -> Neo4j Retrieval -> LLM Generation.
     */
    private CompletableFuture<Map<String, Object>> executeSemanticSearch(String query) {
        return embeddingService.generateVectorEmbedding(query)
                .thenCompose(vector -> {
                    logger.debug("Vector generated, executing Neo4j similarity search.");
                    return graphPersistence.executeVectorSearch(vector, 5); // top 5 results only
                })
                .thenCompose(results -> {
                    List<String> chunks = results.stream()
                            .map(r -> (String) r.get("text"))
                            .toList();

                    logger.info("Retrieved {} chunks from Neo4j. Calling LLM for synthesis...", chunks.size());
                    
                    // Call Python to read the chunks and generate the answer
                    return embeddingService.generateAnswer(query, chunks)
                            .thenApply(generatedAnswer -> {
                                Map<String, Object> context = new HashMap<>();
                                context.put("retrieval_type", "semantic_rag");
                                context.put("generated_answer", generatedAnswer); 
                                context.put("semantic_chunks", results);
                                return context;
                            });
                });
    }

    /**
     * If the query requires deterministic relationship tracing, the system dynamically 
     * translates the intent into a Cypher execution pattern.
     */
    private CompletableFuture<Map<String, Object>> executeDeterministicTraversal(String cypherQuery) {
        try {
            // Validating stuff
            cypherValidator.isReadOnlyAndSafe(cypherQuery);
            
            // two time
            String safeCypher = cypherValidator.applyTemporalConstraints(cypherQuery);
            
            return graphPersistence.executeQuery(safeCypher, Map.of())
                    .thenApply(results -> {
                        Map<String, Object> context = new HashMap<>();
                        context.put("retrieval_type", "deterministic");
                        context.put("graph_traversal_results", results);
                        return context;
                    });
        } catch (SecurityException e) {
            logger.error("Query blocked by AST Validation Middleware: {}", e.getMessage());
            return CompletableFuture.failedFuture(e);
        }
    }

    /**
     * In a hybrid query, the GraphRAG engine combines both retrieval methods.
     */
    private CompletableFuture<Map<String, Object>> executeHybridRetrieval(String query, String cypherQuery) {
        CompletableFuture<Map<String, Object>> semanticFuture = executeSemanticSearch(query);

        if (cypherQuery == null || cypherQuery.trim().isEmpty()) {
            logger.info("Hybrid search detected empty Cypher; falling back to pure Semantic Search.");
            return semanticFuture.thenApply(semanticCtx -> {
                Map<String, Object> hybridContext = new HashMap<>(semanticCtx);
                hybridContext.put("retrieval_type", "hybrid_fallback_semantic");
                hybridContext.put("graph_traversal_results", new java.util.ArrayList<>());
                return hybridContext;
            });
        }

        CompletableFuture<Map<String, Object>> deterministicFuture = executeDeterministicTraversal(cypherQuery);

        return semanticFuture.thenCombine(deterministicFuture, (semanticCtx, deterministicCtx) -> {
            Map<String, Object> hybridContext = new HashMap<>();
            hybridContext.put("retrieval_type", "hybrid");
            hybridContext.put("generated_answer", semanticCtx.get("generated_answer")); 
            hybridContext.put("semantic_chunks", semanticCtx.get("semantic_chunks"));
            hybridContext.put("graph_traversal_results", deterministicCtx.get("graph_traversal_results"));
            logger.info("Hybrid GraphRAG context successfully assembled.");
            return hybridContext;
        });
    }
}