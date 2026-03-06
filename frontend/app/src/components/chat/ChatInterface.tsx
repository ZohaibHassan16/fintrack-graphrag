/**
 * Fintrack GraphRAG SEC Analytics Platform - Chat Interface
 * 
 * Features:
 * - Retro-terminal citation badges [Ref: N]
 * - Sources Utilized section for non-inline citations
 * - Deep dark terminal aesthetic
 * - Smooth streaming with monospace fonts
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { 
  Send, 
  AlertCircle,
  TrendingUp,
  Building2,
  DollarSign,
  PieChart,
  ChevronRight,
  Terminal,
  Loader2,
} from 'lucide-react';
import { useFintrackStore } from '@/store';
import { useFintrackStream } from '@/hooks/useFintrackStream'; 
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { ChatMessage, Citation } from '@/types';


const SUGGESTED_QUERIES = [
  { 
    icon: Building2, 
    text: 'Compare Microsoft and Google cloud revenue',
    category: 'Competitive Analysis'
  },
  { 
    icon: DollarSign, 
    text: 'Show me Tesla\'s cash flow trends',
    category: 'Cash Flow'
  },
  { 
    icon: PieChart, 
    text: 'What are the main risks for Amazon?',
    category: 'Risk Factors'
  }
];


const RetroCitationBadge = React.memo(({ 
  number, 
  onClick 
}: { 
  number: number; 
  onClick?: () => void;
}) => {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 text-[10px] font-mono font-bold rounded 
                       bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 
                       hover:bg-emerald-500/30 hover:border-emerald-400 transition-all duration-150
                       shadow-sm shadow-emerald-500/10"
          >
            <span className="text-emerald-500/70">[</span>
            <span>Ref:</span>
            <span>{number}</span>
            <span className="text-emerald-500/70">]</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-slate-900 border-slate-700 p-2 z-50">
          <p className="text-[10px] font-mono text-slate-400">Click to view source chunk</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

RetroCitationBadge.displayName = 'RetroCitationBadge';


const SourcesSection = React.memo(({ 
  citations,
  onCitationClick 
}: { 
  citations: Citation[];
  onCitationClick?: (citation: Citation) => void;
}) => {
  if (!citations || citations.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-slate-800/50">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
          &gt; sources_utilized
        </span>
        <span className="text-[9px] font-mono text-emerald-500/70">
          [{citations.length} refs]
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {citations.map((citation) => (
          <button
            key={citation.number}
            onClick={() => onCitationClick?.(citation)}
            className="group flex items-center gap-1.5 px-2 py-1 rounded 
                       bg-slate-800/50 border border-slate-700 
                       hover:border-cyan-500/50 hover:bg-cyan-500/10 transition-all"
          >
            <span className="text-[9px] font-mono text-cyan-500">[{citation.number}]</span>
            <span className="text-[9px] font-mono text-slate-400 truncate max-w-[120px] group-hover:text-slate-300">
              {citation.chunk?.ticker || 'UNKNOWN'}_{citation.chunk?.section?.slice(0, 15) || 'SECTION'}
            </span>
            {citation.chunk && (
              <span className={cn(
                "text-[8px] font-mono px-1 rounded",
                citation.chunk.similarityScore >= 0.8 ? 'bg-emerald-500/20 text-emerald-400' :
                citation.chunk.similarityScore >= 0.6 ? 'bg-amber-500/20 text-amber-400' :
                'bg-slate-600/30 text-slate-400'
              )}>
                {(citation.chunk.similarityScore * 100).toFixed(0)}%
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
});

SourcesSection.displayName = 'SourcesSection';

==========================================================================

const InferenceLoading = React.memo(() => {
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsedTime(prev => prev + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="py-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="max-w-4xl mx-auto px-6">
        <div className="flex gap-4">
          <div className="flex-shrink-0">
            <div className="w-9 h-9 rounded-lg bg-slate-900 border border-cyan-500/30 flex items-center justify-center">
              <Terminal className="w-4 h-4 text-cyan-400 animate-pulse" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-bold text-cyan-400 font-mono uppercase">
                Fintrack Analyst
              </span>
              <span className="text-[10px] font-mono text-cyan-500/70 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                PROCESSING
              </span>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Loader2 className="w-4 h-4 text-cyan-500 animate-spin" />
                <div>
                  <p className="text-sm font-mono text-slate-200">&gt; inference_in_progress</p>
                  <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                    elapsed: {formatTime(elapsedTime)}
                  </p>
                </div>
              </div>

              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full w-1/3 bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full animate-pulse" />
              </div>

              <p className="text-[10px] font-mono text-slate-500">
                &gt; querying_graphrag_engine...<br/>
                &gt; retrieving_semantic_chunks...<br/>
                &gt; generating_response...
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

InferenceLoading.displayName = 'InferenceLoading';


const Message = React.memo(({ 
  message, 
  onCitationClick 
}: { 
  message: ChatMessage; 
  onCitationClick?: (citation: Citation) => void;
}) => {
  const isUser = message.role === 'user';
  const isStreaming = message.isStreaming;

  // Parse content for inline citations [N] or (N) or [Ref: N]
  const parts = message.content.split(/(\[\d+\]|\(\d+\)|\[Ref:\s*\d+\])/g);
  
  // Check if content has inline citations
  const hasInlineCitations = /\[\d+\]|\(\d+\)|\[Ref:\s*\d+\]/.test(message.content);

  return (
    <div className={cn("py-5 transition-colors", isUser ? 'bg-slate-900/30' : 'bg-transparent')}>
      <div className="max-w-4xl mx-auto px-6">
        <div className="flex gap-4">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {isUser ? (
              <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
                <span className="text-[10px] font-bold font-mono text-slate-500">YOU</span>
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-slate-900 border border-cyan-500/30 flex items-center justify-center">
                <Terminal className="w-4 h-4 text-cyan-400" />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className={cn(
                "text-xs font-bold font-mono uppercase tracking-wide",
                isUser ? 'text-slate-400' : 'text-cyan-400'
              )}>
                {isUser ? 'User' : 'Fintrack_Analyst'}
              </span>
              <span className="text-[9px] font-mono text-slate-600">
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {/* Message Body */}
            <div className="text-sm leading-relaxed text-slate-300 font-mono">
              {parts.map((part, index) => {
                // Match [N] or [Ref: N] or (N)
                const match = part.match(/\[(\d+)\]|\[Ref:\s*(\d+)\]|\((\d+)\)/);
                if (match) {
                  const citationNum = parseInt(match[1] || match[2] || match[3], 10);
                  const citation = message.citations?.find((c) => c.number === citationNum);
                  if (citation) {
                    return (
                      <RetroCitationBadge 
                        key={index} 
                        number={citationNum} 
                        onClick={() => onCitationClick?.(citation)} 
                      />
                    );
                  }
                }
                return <span key={index}>{part}</span>;
              })}
              
              {/* Streaming cursor */}
              {isStreaming && (
                <span className="inline-block w-2 h-4 ml-1 bg-cyan-500 animate-pulse" />
              )}
            </div>

            {/* Sources Section - Show if no inline citations but citations exist */}
            {!isStreaming && !hasInlineCitations && message.citations && message.citations.length > 0 && (
              <SourcesSection citations={message.citations} onCitationClick={onCitationClick} />
            )}

            {/* Error */}
            {message.error && (
              <Alert variant="destructive" className="mt-3 bg-red-950/20 border-red-900/50">
                <AlertCircle className="h-3 w-3 text-red-400" />
                <AlertTitle className="text-[10px] font-mono text-red-300">ERROR</AlertTitle>
                <AlertDescription className="text-[10px] font-mono text-red-400/80">
                  {message.error}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

Message.displayName = 'Message';


export function ChatInterface({ 
  className, 
  onCitationClick 
}: { 
  className?: string; 
  onCitationClick?: (citation: Citation) => void;
}) {
  const messages = useFintrackStore((state) => state.messages);
  const streamingMessage = useFintrackStore((state) => state.streamingMessage);
  const inputValue = useFintrackStore((state) => state.inputValue);
  const isLoading = useFintrackStore((state) => state.isLoading);
  const isInferenceLoading = useFintrackStore((state) => state.isInferenceLoading);
  const setInputValue = useFintrackStore((state) => state.setInputValue);
  const clearChat = useFintrackStore((state) => state.clearChat);

  const { sendQuery } = useFintrackStream();
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Auto-scroll
  useEffect(() => {
    if (isAtBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingMessage?.content, isInferenceLoading, isAtBottom]);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        const { scrollTop, scrollHeight, clientHeight } = viewport as HTMLElement;
        setIsAtBottom(scrollHeight - scrollTop - clientHeight < 50);
      }
    }
  }, []);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    const query = inputValue.trim();
    setInputValue(''); 
    await sendQuery({ query, topK: 5 });
  }, [inputValue, isLoading, sendQuery, setInputValue]);

  const hasMessages = messages.length > 0 || !!streamingMessage;
  const showInferenceLoading = isInferenceLoading && !streamingMessage;

  return (
    <div className={cn("flex flex-col h-full w-full bg-slate-950 overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-950 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-slate-900 border border-cyan-500/30">
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider">
              Fintrack_Analyst
            </h2>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[9px] font-mono text-slate-500">GraphRAG_Engine_Online</span>
            </div>
          </div>
        </div>
        {hasMessages && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearChat} 
            className="h-7 text-[10px] font-mono text-slate-500 hover:text-red-400 hover:bg-red-400/10"
          >
            [clear]
          </Button>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 min-h-0 relative">
        <ScrollArea 
          ref={scrollRef} 
          className="h-full w-full" 
          onScrollCapture={handleScroll}
        >
          <div className="min-h-full flex flex-col">
            {!hasMessages ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-5">
                  <TrendingUp className="w-6 h-6 text-slate-700" />
                </div>
                <p className="text-xs font-mono text-slate-400 mb-1">&gt; system_ready</p>
                <p className="text-[10px] font-mono text-slate-600 mb-8">
                  awaiting_sec_analysis_query...
                </p>
                
                {/* Suggestions */}
                <div className="flex flex-col gap-2 w-full max-w-sm">
                  {SUGGESTED_QUERIES.map((q, i) => (
                    <Button 
                      key={i} 
                      variant="outline" 
                      className="w-full justify-between h-auto py-3 px-4 bg-slate-900/50 border-slate-800 
                                 hover:bg-slate-800 hover:border-cyan-500/40 text-left group"
                      onClick={() => setInputValue(q.text)}
                    >
                      <div className="flex items-center gap-3">
                        <q.icon className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400" />
                        <span className="text-xs font-mono text-slate-400 group-hover:text-slate-200">
                          {q.text}
                        </span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-700 group-hover:text-cyan-500" />
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1">
                {messages.map((m) => (
                  <Message key={m.id} message={m} onCitationClick={onCitationClick} />
                ))}
                {showInferenceLoading && <InferenceLoading />}
                {streamingMessage && (
                  <Message message={streamingMessage} onCitationClick={onCitationClick} />
                )}
                <div ref={messagesEndRef} className="h-4" />
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Scroll to bottom */}
        {!isAtBottom && hasMessages && (
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full h-8 px-3 
                       bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
          >
            <span className="text-[10px] font-mono">[scroll_down]</span>
          </Button>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-slate-950 border-t border-slate-800 shrink-0">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="relative">
            <Input
              ref={inputRef} 
              value={inputValue} 
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={isInferenceLoading ? "> processing..." : "> enter_query..."} 
              disabled={isLoading}
              className="h-12 pl-4 pr-12 bg-slate-900 border-slate-800 text-slate-200 
                         placeholder:text-slate-600 rounded-lg font-mono text-sm
                         focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <Button 
                type="submit" 
                size="icon" 
                disabled={!inputValue.trim() || isLoading} 
                className={cn(
                  "w-8 h-8 rounded-md transition-all",
                  inputValue.trim() && !isLoading
                    ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
                    : 'bg-slate-800 text-slate-600'
                )}
              >
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-center gap-3 text-[9px] font-mono text-slate-600">
            <span>GraphRAG_verified</span>
            <span>•</span>
            <span>SEC_data_stream</span>
          </div>
        </form>
      </div>
    </div>
  );
}
