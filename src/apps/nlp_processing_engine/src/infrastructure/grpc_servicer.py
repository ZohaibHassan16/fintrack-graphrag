import logging
import time
import grpc
import asyncio
from concurrent.futures import ThreadPoolExecutor
import torch
from transformers import AsyncTextIteratorStreamer
import re

import infrastructure.embedding_pb2 as pb2
import infrastructure.embedding_pb2_grpc as pb2_grpc

logger = logging.getLogger(__name__)

LLM_GENERATION_EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="llm_gen")

SYSTEM_PROMPT = """You are a precise, professional financial analyst specializing exclusively in SEC 10-K MD&A filings.

Answer the user's question using ONLY the information explicitly present in the provided context excerpts.
- Synthesize a clear, concise, professional response.
- If the context does NOT contain sufficient information to answer the question accurately and completely, respond EXACTLY with this sentence and nothing else: "I do not have sufficient information in the provided SEC filing context to answer this question."
- NEVER hallucinate, infer, extrapolate, or use any external knowledge. Zero tolerance for speculation."""

class EmbeddingServicer(pb2_grpc.EmbeddingServiceServicer):
    def __init__(self, ai_engine):
        self.ai_engine = ai_engine

    async def GenerateEmbedding(self, request, context):
        start_time = time.time()
        query_text = request.query_text
        model_version = request.model_version
        
        logger.info(f"gRPC Request received! Text: '{query_text[:30]}...', Model: {model_version}")
        
        try:
            embedding_vector = await asyncio.to_thread(self.ai_engine.generate_embedding, query_text)
            processing_time = int((time.time() - start_time) * 1000)
            
            return pb2.EmbeddingResponse(
                vector=embedding_vector,  
                dimensions=len(embedding_vector),  
                processing_time_ms=processing_time
            )
        except Exception as e:
            logger.error(f"gRPC Error: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return pb2.EmbeddingResponse()

    async def GenerateAnswer(self, request, context):
        start_time = time.time()
        logger.info(f"Received RAG Generation Request for query: {request.query[:50]}...")

        generation_task = None

        try:
            llm_extractor = self.ai_engine.extractor
            tokenizer = llm_extractor.tokenizer
            model = llm_extractor.model
            device = llm_extractor.device

            # Clean the ASCII formatting from ALL retrieved Neo4j chunks
            clean_chunks = []
            for chunk in request.context_chunks:
                clean_text = re.sub(r'[─┼│\u2500-\u257F]', ' ', chunk)
                clean_text = re.sub(r' +', ' ', clean_text)
                clean_chunks.append(clean_text)

            context_text = "\n\n".join([f"[Context {i+1}]: {chunk}" for i, chunk in enumerate(clean_chunks)])
            user_prompt = f"Context excerpts:\n{context_text}\n\nQuestion: {request.query}"
            
            messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ]

            prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
            inputs = tokenizer(prompt, return_tensors="pt").to(device)

            # Hardware-Aware Timeout
            is_cpu = "cpu" in str(device).lower()
            stream_timeout = 600.0 if is_cpu else 60.0

            streamer = AsyncTextIteratorStreamer(
                tokenizer, 
                skip_prompt=True, 
                skip_special_tokens=True, 
                timeout=stream_timeout
            )

            generation_kwargs = {
                "input_ids": inputs.input_ids,
                "attention_mask": inputs.attention_mask,
                "streamer": streamer,
                "max_new_tokens": 512,
                "temperature": 0.0,
                "do_sample": False,
                "pad_token_id": tokenizer.eos_token_id,
            }

            loop = asyncio.get_running_loop()

            def run_generation():
                try:
                    logger.info(f"🝓🝓🝓🝓 PyTorch generation thread started on {str(device).upper()} (Timeout: {stream_timeout}s)")
                    with torch.no_grad():
                        model.generate(**generation_kwargs)
                    logger.info("🝓🝓🝓🝓 PyTorch generation completed successfully")
                except Exception as e:
                    logger.error(f"⸮⸮⸮⸮ Generation thread error: {e}", exc_info=True)
                    try:
                        loop.call_soon_threadsafe(streamer.text_queue.put_nowait, e)
                    except Exception:
                        pass

            generation_task = loop.run_in_executor(LLM_GENERATION_EXECUTOR, run_generation)

            try:
        
                async for token in streamer:
                    if isinstance(token, Exception):
                        raise token
                    yield pb2.RAGResponse(token=token, is_final=False)
                    
            except asyncio.TimeoutError:
                logger.error(f"⸮⸮⸮⸮ Generation timed out after {stream_timeout}s.")
                context.set_code(grpc.StatusCode.DEADLINE_EXCEEDED)
                yield pb2.RAGResponse(token="", is_final=True)
                return
            except Exception as stream_err:
                raise stream_err

            yield pb2.RAGResponse(token="", is_final=True)
            logger.info(f"🜂🜂🜂🜂 Streaming completed in {time.time() - start_time:.2f}s")

        except Exception as e:
            logger.error(f"␦␦␦␦ gRPC Generation Outer Error: {e}", exc_info=True)
            context.set_code(grpc.StatusCode.INTERNAL)
            yield pb2.RAGResponse(token="", is_final=True)
        finally:
            if generation_task and not generation_task.done():
                generation_task.cancel()