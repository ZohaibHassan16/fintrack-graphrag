package com.enterprise.fintrack.infra;

import com.enterprise.fintrack.domain.ports.CypherValidationPort;
import org.neo4j.cypherdsl.parser.CypherParser;
import org.neo4j.cypherdsl.core.Statement;
import org.neo4j.cypherdsl.core.ast.Visitor;
import org.neo4j.cypherdsl.core.ast.Visitable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Validates Cypher queries for read-only safety in the Fintrack pipeline.
 */
public class CypherValidationAdapter implements CypherValidationPort {

    private static final Logger logger = LoggerFactory.getLogger(CypherValidationAdapter.class);
    
    // Timeout if execution takes too long
    private static final String TIMEOUT_PARAMETER = " CYPHER dbms.transaction.timeout=5s ";

    @Override
    public boolean isReadOnlyAndSafe(String cypherQuery) throws SecurityException {
        if (cypherQuery == null || cypherQuery.trim().isEmpty()) {
            logger.warn("Received null or empty Cypher query; skipping AST validation.");
            return true; 
        }

        try {
            // Parse query semantics into AST
            Statement statement = CypherParser.parse(cypherQuery);
            AtomicBoolean containsWriteOperation = new AtomicBoolean(false);

            // Traverse the AST to detect any prohibited modification clauses
            statement.accept(new Visitor() {
                @Override
                public void enter(Visitable segment) {
                    String segmentName = segment.getClass().getSimpleName();
                    if (segmentName.contains("Merge") || 
                        segmentName.contains("Create") || 
                        segmentName.contains("Set") || 
                        segmentName.contains("Remove") || 
                        segmentName.contains("Delete")) {
                        containsWriteOperation.set(true);
                    }
                }
                @Override
                public void leave(Visitable segment) {}
            });

            if (containsWriteOperation.get()) {
                logger.error("Security Violation: Fintrack rejected a write-oriented Cypher query.");
                throw new SecurityException("Query contains unauthorized write operations (MERGE, CREATE, SET, REMOVE, DELETE).");
            }

            return true;
            
        } catch (IllegalArgumentException | ArrayIndexOutOfBoundsException e) {
            logger.error("Failed to parse Cypher into AST: {}", e.getMessage());
            throw new SecurityException("Invalid Cypher syntax detected during Fintrack validation.", e);
        } catch (Exception e) {
            logger.error("Unexpected error during Cypher validation: ", e);
            throw new SecurityException("Internal validation failure.", e);
        }
    }

    @Override
    public String applyTemporalConstraints(String cypherQuery) {
        if (cypherQuery == null || cypherQuery.trim().isEmpty()) {
            return cypherQuery;
        }
        
    
        if (!cypherQuery.toUpperCase().trim().startsWith("CYPHER")) {
            return TIMEOUT_PARAMETER + cypherQuery;
        }
        return cypherQuery;
    }
}