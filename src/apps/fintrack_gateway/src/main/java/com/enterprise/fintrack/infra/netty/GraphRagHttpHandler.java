package com.enterprise.fintrack.infra.netty;

import com.enterprise.fintrack.application.GraphRagOrchestrationUseCase;
import com.enterprise.fintrack.domain.QueryIntentType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import io.netty.channel.ChannelFutureListener;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.SimpleChannelInboundHandler;
import io.netty.handler.codec.http.*;
import io.netty.util.CharsetUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GraphRagHttpHandler extends SimpleChannelInboundHandler<FullHttpRequest> {

    private static final Logger logger = LoggerFactory.getLogger(GraphRagHttpHandler.class);
    private static final ObjectMapper mapper = new ObjectMapper();
    private final GraphRagOrchestrationUseCase orchestrationUseCase;

    public GraphRagHttpHandler(GraphRagOrchestrationUseCase orchestrationUseCase) {
        this.orchestrationUseCase = orchestrationUseCase;
    }

    @Override
    protected void channelRead0(ChannelHandlerContext ctx, FullHttpRequest request) {
        if (HttpMethod.OPTIONS.equals(request.method())) {
            sendResponse(ctx, HttpResponseStatus.OK, "");
            return;
        }

        if (!HttpMethod.POST.equals(request.method()) || !"/api/v1/query".equals(request.uri())) {
            sendResponse(ctx, HttpResponseStatus.NOT_FOUND, "{\"error\": \"Endpoint not found\"}");
            return;
        }

        try {
            String jsonContent = request.content().toString(CharsetUtil.UTF_8);
            JsonNode rootNode = mapper.readTree(jsonContent);

            // Fintrack Query Extraction
            String naturalLanguageQuery = rootNode.path("query").asText("");
            String intentStr = rootNode.path("intent").asText("HYBRID_GRAPH_RAG");
            String generatedCypher = rootNode.path("cypher").asText(""); 

            if (naturalLanguageQuery.isEmpty()) {
                throw new IllegalArgumentException("Field 'query' is mandatory for Fintrack requests.");
            }

            QueryIntentType intent = QueryIntentType.valueOf(intentStr.toUpperCase());

            logger.info("Received highly concurrent Fintrack query. Dispatching asynchronously...");

            orchestrationUseCase.orchestrateQuery(naturalLanguageQuery, intent, generatedCypher)
                .whenComplete((resultMap, throwable) -> {
                    if (throwable != null) {
                        handleError(ctx, throwable);
                    } else {
                        try {
                            String jsonResponse = mapper.writeValueAsString(resultMap);
                            sendResponse(ctx, HttpResponseStatus.OK, jsonResponse);
                        } catch (Exception e) {
                            handleError(ctx, e);
                        }
                    }
                });

        } catch (IllegalArgumentException e) {
            logger.warn("Fintrack Validation Error: {}", e.getMessage());
            sendResponse(ctx, HttpResponseStatus.BAD_REQUEST, String.format("{\"error\": \"%s\"}", e.getMessage()));
        } catch (Exception e) {

            logger.error(" (x.x) FINTRACK INTERNAL FAILURE: ", e); 
            sendResponse(ctx, HttpResponseStatus.INTERNAL_SERVER_ERROR, 
                String.format("{\"error\": \"Internal Fintrack Error: %s\"}", e.getMessage()));
        }
    }

    private void handleError(ChannelHandlerContext ctx, Throwable throwable) {
        logger.error("Fintrack Pipeline execution failed: ", throwable);
        
        HttpResponseStatus status = HttpResponseStatus.INTERNAL_SERVER_ERROR;
        String message = throwable.getMessage() != null ? throwable.getMessage() : "Unknown execution error";
        
        if (throwable instanceof SecurityException || throwable.getCause() instanceof SecurityException) {
            status = HttpResponseStatus.FORBIDDEN;
        }
        
        String errorJson = String.format("{\"error\": \"%s\"}", message.replace("\"", "\\\""));
        sendResponse(ctx, status, errorJson);
    }

    private void sendResponse(ChannelHandlerContext ctx, HttpResponseStatus status, String content) {
        ByteBuf buffer = Unpooled.copiedBuffer(content, CharsetUtil.UTF_8);
        FullHttpResponse response = new DefaultFullHttpResponse(HttpVersion.HTTP_1_1, status, buffer);

        response.headers().set(HttpHeaderNames.CONTENT_TYPE, "application/json; charset=UTF-8");
        response.headers().set(HttpHeaderNames.CONTENT_LENGTH, buffer.readableBytes());
        response.headers().set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_ORIGIN, "*");
        response.headers().set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_METHODS, "POST, GET, OPTIONS");
        response.headers().set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_HEADERS, "Content-Type, Accept, X-Requested-With");
        response.headers().set(HttpHeaderNames.ACCESS_CONTROL_MAX_AGE, "3600"); 

        ctx.writeAndFlush(response).addListener(ChannelFutureListener.CLOSE);
    }

    @Override
    public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
        logger.error("Netty channel exception caught in Fintrack: ", cause);
        ctx.close();
    }
}