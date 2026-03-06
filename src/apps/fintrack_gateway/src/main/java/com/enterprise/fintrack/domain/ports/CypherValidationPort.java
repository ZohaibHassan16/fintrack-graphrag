package com.enterprise.fintrack.domain.ports;

/**
 * Validates Text-to-Cypher translations to mitigate security and operational risks.
 */
public interface CypherValidationPort {
    /**
     * Parses the query semantics using an AST parser.
     * Rejects the query instantly if it detects write-oriented operations (MERGE, CREATE, etc.).
     */
    boolean isReadOnlyAndSafe(String cypherQuery) throws SecurityException;
    
    /**
     * Appends dbms.transaction.timeout to prevent unbounded multi-hop traversals.
     */
    String applyTemporalConstraints(String cypherQuery);
}