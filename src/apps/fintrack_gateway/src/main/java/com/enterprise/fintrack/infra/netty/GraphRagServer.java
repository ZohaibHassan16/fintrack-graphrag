package com.enterprise.fintrack.infra.netty;

import com.enterprise.fintrack.application.GraphRagOrchestrationUseCase;
import io.netty.bootstrap.ServerBootstrap;
import io.netty.channel.ChannelFuture;
import io.netty.channel.ChannelInitializer;
import io.netty.channel.ChannelPipeline;
import io.netty.channel.EventLoopGroup;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioServerSocketChannel;
import io.netty.handler.codec.http.HttpObjectAggregator;
import io.netty.handler.codec.http.HttpServerCodec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GraphRagServer {

    private static final Logger logger = LoggerFactory.getLogger(GraphRagServer.class);
    private final int port;
    private final GraphRagOrchestrationUseCase useCase;

    public GraphRagServer(int port, GraphRagOrchestrationUseCase useCase) {
        this.port = port;
        this.useCase = useCase;
    }

    public void start() throws InterruptedException {
        EventLoopGroup bossGroup = new NioEventLoopGroup(1); // need only one boss waiying at door
        EventLoopGroup workerGroup = new NioEventLoopGroup(); // no number assigned as it scales intelligently

        try {
            ServerBootstrap b = new ServerBootstrap();
            b.group(bossGroup, workerGroup)
             .channel(NioServerSocketChannel.class)
             .childHandler(new ChannelInitializer<SocketChannel>() {
                 @Override
                 protected void initChannel(SocketChannel ch) {
                     ChannelPipeline p = ch.pipeline();
                     p.addLast(new HttpServerCodec());
                     p.addLast(new HttpObjectAggregator(65536));
                     p.addLast(new GraphRagHttpHandler(useCase));
                 }
             });

            ChannelFuture f = b.bind(port).sync();
            logger.info("Java Netty Backend API Gateway started. Listening on port {}", port);
            
            f.channel().closeFuture().sync();
        } finally {
            bossGroup.shutdownGracefully();
            workerGroup.shutdownGracefully();
        }
    }
}