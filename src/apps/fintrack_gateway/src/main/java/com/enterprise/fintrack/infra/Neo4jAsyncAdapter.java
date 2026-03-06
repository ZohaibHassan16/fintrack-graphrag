package com.enterprise.fintrack.infra;

import com.enterprise.fintrack.domain.ports.GraphPersistencePort;
import org.neo4j.driver.AuthTokens;
import org.neo4j.driver.Driver;
import org.neo4j.driver.GraphDatabase;
import org.neo4j.driver.async.AsyncSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

public class Neo4jAsyncAdapter implements GraphPersistencePort {

    private static final Logger logger = LoggerFactory.getLogger(Neo4jAsyncAdapter.class);
    private final Driver driver;

    public Neo4jAsyncAdapter(String uri, String user, String password) {
        this.driver = GraphDatabase.driver(uri, AuthTokens.basic(user, password));
        logger.info("Initialized Asynchronous Neo4j Driver connected to {}", uri);
    }

    public void close() {
        driver.closeAsync();
    }

    @Override
    public CompletableFuture<List<Map<String, Object>>> executeQuery(String cypher, Map<String, Object> parameters) {
        AsyncSession session = driver.asyncSession();

        return session.executeReadAsync(tx -> 
            tx.runAsync(cypher, parameters)
              .thenCompose(cursor -> cursor.listAsync(record -> record.asMap()))
        ).whenComplete((result, error) -> {
            session.closeAsync();
            if (error != null) {
                logger.error("Async Neo4j query execution failed: {}", error.getMessage());
            }
        }).toCompletableFuture();
    }

    @Override
    public CompletableFuture<List<Map<String, Object>>> executeVectorSearch(List<Float> embeddingVector, int limit) {
  
    String vectorQuery = """
        CALL db.index.vector.queryNodes('chunk_embeddings', $limit, $embedding) 
        YIELD node, score 
        RETURN 
            coalesce(node.content, node.text_content) AS text, 
            coalesce(node.source_cik, "N/A") AS cik, 
            score 
        ORDER BY score DESC
        """;
    

    return executeQuery(vectorQuery, Map.of(
        "embedding", embeddingVector,
        "limit", limit
    ));
}
}