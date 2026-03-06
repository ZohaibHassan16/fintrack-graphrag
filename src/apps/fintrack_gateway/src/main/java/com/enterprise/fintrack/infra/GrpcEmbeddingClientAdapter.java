package com.enterprise.fintrack.infra;

import com.enterprise.fintrack.domain.ports.EmbeddingServicePort;
import com.enterprise.fintrack.grpc.EmbeddingRequest;
import com.enterprise.fintrack.grpc.EmbeddingResponse;
import com.enterprise.fintrack.grpc.EmbeddingServiceGrpc;
import com.enterprise.fintrack.grpc.RAGRequest;
import com.enterprise.fintrack.grpc.RAGResponse;
import io.grpc.ManagedChannel;
import io.grpc.netty.shaded.io.grpc.netty.GrpcSslContexts;
import io.grpc.netty.shaded.io.grpc.netty.NettyChannelBuilder;
import io.grpc.netty.shaded.io.netty.channel.EventLoopGroup;
import io.grpc.netty.shaded.io.netty.channel.nio.NioEventLoopGroup;
import io.grpc.netty.shaded.io.netty.channel.socket.nio.NioSocketChannel;
import io.grpc.netty.shaded.io.netty.handler.ssl.SslContext;
import io.grpc.netty.shaded.io.netty.handler.ssl.SslProvider;
import io.grpc.stub.StreamObserver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.common.util.concurrent.FutureCallback;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.MoreExecutors;

import java.io.File;
import java.io.FileInputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

public class GrpcEmbeddingClientAdapter implements EmbeddingServicePort {

    private static final Logger logger = LoggerFactory.getLogger(GrpcEmbeddingClientAdapter.class);
    private final ManagedChannel channel;
    private final EventLoopGroup eventLoopGroup; 
    private final EmbeddingServiceGrpc.EmbeddingServiceFutureStub futureStub;
    private final EmbeddingServiceGrpc.EmbeddingServiceStub asyncStub; 

    public GrpcEmbeddingClientAdapter(String host, int port) {
        try {
            SslContext sslContext = GrpcSslContexts.forClient()
                    .sslProvider(SslProvider.JDK)
                    .trustManager(new File("/certs/ca.crt")) 
                    .keyManager(
                            new FileInputStream("/certs/client.crt"), 
                            new FileInputStream("/certs/client.pkcs8.key")
                    )
                    .build();

            logger.info("Resolving hostname: {}...", host);
            InetAddress inetAddr = InetAddress.getByName(host);
            InetSocketAddress resolvedAddress = new InetSocketAddress(inetAddr, port);
            logger.info("Resolved {} to IPv4: {}", host, inetAddr.getHostAddress());

            this.eventLoopGroup = new NioEventLoopGroup();
            
            this.channel = NettyChannelBuilder.forAddress(resolvedAddress) 
                    .channelType(NioSocketChannel.class)
                    .eventLoopGroup(eventLoopGroup)
                    .enableRetry()
                    .maxRetryAttempts(5)
                    .sslContext(sslContext)
                    .overrideAuthority("python-nlp-engine")
                    .build();
                    
        } catch (Exception e) {
            logger.error("3RR0R: CR1T1C4L Failed to initialize mTLS Secure Channel", e);
            throw new RuntimeException("mTLS configuration failed.", e);
        }

        this.futureStub = EmbeddingServiceGrpc.newFutureStub(channel);
        this.asyncStub = EmbeddingServiceGrpc.newStub(channel); // NEW: Initialize async streaming stub
        logger.info("⁂ Initialized SECURE mTLS gRPC client connected to {}:{}", host, port);
    }

    public void shutdown() throws InterruptedException {
        if (channel != null) {
            channel.shutdown().awaitTermination(5, TimeUnit.SECONDS);
        }
        if (eventLoopGroup != null) {
            eventLoopGroup.shutdownGracefully(0, 5, TimeUnit.SECONDS);
        }
    }

    @Override
    public CompletableFuture<List<Float>> generateVectorEmbedding(String query) {
        CompletableFuture<List<Float>> completableFuture = new CompletableFuture<>();
        EmbeddingRequest request = EmbeddingRequest.newBuilder()
                .setQueryText(query)
                .build();

        ListenableFuture<EmbeddingResponse> responseFuture = futureStub.generateEmbedding(request);

        Futures.addCallback(responseFuture, new FutureCallback<EmbeddingResponse>() {
            @Override
            public void onSuccess(EmbeddingResponse result) {
                completableFuture.complete(result.getVectorList());
            }

            @Override
            public void onFailure(Throwable t) {
                logger.error("gRPC Embedding call failed: ", t);
                completableFuture.completeExceptionally(t);
            }
        }, MoreExecutors.directExecutor());

        return completableFuture;
    }

    @Override
    public CompletableFuture<String> generateAnswer(String query, List<String> contextChunks) {
        CompletableFuture<String> completableFuture = new CompletableFuture<>();
        StringBuilder answerBuilder = new StringBuilder();

        RAGRequest request = RAGRequest.newBuilder()
                .setQuery(query)
                .addAllContextChunks(contextChunks)
                .build();

        // async stub to listen to the incoming Python stream
        asyncStub.generateAnswer(request, new StreamObserver<RAGResponse>() {
            @Override
            public void onNext(RAGResponse response) {
                if (!response.getToken().isEmpty()) {
                    answerBuilder.append(response.getToken());
                }
                if (response.getIsFinal()) {
                    completableFuture.complete(answerBuilder.toString());
                }
            }

            @Override
            public void onError(Throwable t) {
                logger.error("gRPC Generation stream failed: ", t);
                completableFuture.completeExceptionally(t);
            }

            @Override
            public void onCompleted() {
                if (!completableFuture.isDone()) {
                    completableFuture.complete(answerBuilder.toString());
                }
            }
        });

        return completableFuture;
    }
}