package com.enterprise.fintrack;

import com.enterprise.fintrack.application.GraphRagOrchestrationUseCase;
import com.enterprise.fintrack.infra.CypherValidationAdapter;
import com.enterprise.fintrack.infra.GrpcEmbeddingClientAdapter;
import com.enterprise.fintrack.infra.Neo4jAsyncAdapter;
import com.enterprise.fintrack.infra.netty.GraphRagServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class Main {

    private static final Logger logger = LoggerFactory.getLogger(Main.class);

    public static void main(String[] args) {
        logger.info("Initializing Fintrack Gateway (Netty Async Reactor)...");

        GrpcEmbeddingClientAdapter embeddingClient = new GrpcEmbeddingClientAdapter("nlp-compute-tier", 50051);
        Neo4jAsyncAdapter neo4jAdapter = new Neo4jAsyncAdapter("bolt://neo4j-cluster:7687", "neo4j", "secure_password");
        CypherValidationAdapter cypherValidator = new CypherValidationAdapter();

        GraphRagOrchestrationUseCase orchestrationUseCase = new GraphRagOrchestrationUseCase(
                embeddingClient, neo4jAdapter, cypherValidator
        );

        int port = Integer.parseInt(System.getenv().getOrDefault("GATEWAY_PORT", "8080"));
        GraphRagServer server = new GraphRagServer(port, orchestrationUseCase);

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            logger.info("Initiating graceful shutdown of Fintrack Gateway...");
            neo4jAdapter.close();
            try {
                embeddingClient.shutdown();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }));

        try {
            server.start();
        } catch (InterruptedException e) {
            logger.error("Server interrupted", e);
            Thread.currentThread().interrupt();
        }
    }
}