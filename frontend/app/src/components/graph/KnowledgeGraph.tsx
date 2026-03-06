/**
 * Fintrack GraphRAG - Clean Knowledge Graph Visualization
 * 
 * Visual Design:
 * - Retro-terminal aesthetic
 * - Clean 3-level hierarchy: Company → Document → Chunks
 * - No overlapping cards
 * - Elegant edge routing
 * - Deep slate/navy backgrounds
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  BackgroundVariant,
  type Node,
  type Edge,
  BaseEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { 
  Building2, 
  FileText, 
  Expand, 
  Maximize2,
  Minimize2,
  ZoomIn,
  Target,
  Terminal,
} from 'lucide-react';
import { useFintrackStore } from '@/store';
import { applyDagreLayout } from '@/lib/layoutUtils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { SemanticChunk } from '@/types';


const RetroEdge = React.memo(({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  data?: { type?: string; weight?: number };
}) => {
  const edgeType = data?.type || 'CONTAINS';
  

  const edgeColor = edgeType === 'FILED' ? '#10b981' : '#06b6d4';
  
 
  const verticalGap = Math.abs(targetY - sourceY);
  const controlOffset = Math.max(verticalGap * 0.4, 50);
  
  const cp1x = sourceX;
  const cp1y = sourceY + controlOffset;
  const cp2x = targetX;
  const cp2y = targetY - controlOffset;
  
  const path = `M ${sourceX} ${sourceY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetX} ${targetY}`;
  
  return (
    <BaseEdge
      path={path}
      style={{
        stroke: edgeColor,
        strokeWidth: 2,
        opacity: 0.8,
      }}
      className="transition-all"
    />
  );
});

RetroEdge.displayName = 'RetroEdge';


const CompanyNode = React.memo((props: { 
  data?: Record<string, unknown>; 
  selected?: boolean;
}) => {
  const data = props.data || {};
  const label = (data.label as string) || 'COMPANY';
  
  return (
    <div className="relative">
      {/* Target handle (top) */}
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-emerald-500 !border-0 opacity-0" />
      
      {/* Node content - Retro terminal style */}
      <div
        className={cn(
          "relative px-6 py-3 rounded-lg border-2 transition-all duration-200",
          "min-w-[160px] text-center cursor-pointer",
          "bg-slate-900 border-emerald-500/60",
          "shadow-lg shadow-emerald-500/10",
          props.selected 
            ? 'border-emerald-400 shadow-emerald-500/30 ring-1 ring-emerald-400/40' 
            : 'hover:border-emerald-400'
        )}
      >
        {/* Retro terminal header bar */}
        <div className="absolute -top-3 left-4 px-2 bg-slate-950">
          <span className="text-[9px] font-mono text-emerald-500/70 uppercase tracking-widest">[entity]</span>
        </div>
        
        <div className="flex items-center justify-center gap-2">
          <Building2 className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-bold text-emerald-100 font-mono tracking-wide">
            {label}
          </span>
        </div>
      </div>
      
      {/* Source handle (bottom) */}
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-emerald-500 !border-0 opacity-0" />
    </div>
  );
});

CompanyNode.displayName = 'CompanyNode';


const DocumentNode = React.memo((props: { 
  data?: Record<string, unknown>; 
  selected?: boolean;
}) => {
  const data = props.data || {};
  const documentType = (data.documentType as string) || '10-K';
  const year = (data.year as number);
  
  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-cyan-500 !border-0 opacity-0" />
      
      <div
        className={cn(
          "relative px-6 py-3 rounded-lg border-2 transition-all duration-200",
          "min-w-[180px] text-center cursor-pointer",
          "bg-slate-900 border-cyan-500/60",
          "shadow-lg shadow-cyan-500/10",
          props.selected 
            ? 'border-cyan-400 shadow-cyan-500/30 ring-1 ring-cyan-400/40' 
            : 'hover:border-cyan-400'
        )}
      >
        <div className="absolute -top-3 left-4 px-2 bg-slate-950">
          <span className="text-[9px] font-mono text-cyan-500/70 uppercase tracking-widest">[doc]</span>
        </div>
        
        <div className="flex items-center justify-center gap-2">
          <FileText className="w-4 h-4 text-cyan-400" />
          <div className="flex flex-col items-start">
            <span className="text-sm font-bold text-cyan-100 font-mono">
              {documentType}
            </span>
            {year && (
              <span className="text-[10px] text-cyan-400/60 font-mono">{year}</span>
            )}
          </div>
        </div>
      </div>
      
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-cyan-500 !border-0 opacity-0" />
    </div>
  );
});

DocumentNode.displayName = 'DocumentNode';


const ChunkNode = React.memo((props: { 
  id: string; 
  data?: Record<string, unknown>; 
  selected?: boolean;
}) => {
  const toggleNodeExpansion = useFintrackStore((state) => state.toggleNodeExpansion);
  const expandedNodeIds = useFintrackStore((state) => state.expandedNodeIds);
  
  const isExpanded = expandedNodeIds.includes(props.id);
  const data = props.data || {};
  const section = (data.section as string) || 'SECTION';
  const similarityScore = (data.similarityScore as number) || 0;
  const preview = (data.preview as string) || '';
  const content = (data.content as string) || '';
  const ticker = (data.ticker as string) || 'UNKNOWN';

  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-slate-400 !border-0 opacity-0" />
      
      <div
        className={cn(
          "relative rounded-lg border-2 transition-all duration-200 cursor-pointer",
          "w-[260px] overflow-hidden",
          "bg-slate-900 border-slate-600/60",
          "shadow-lg",
          props.selected 
            ? 'border-amber-400 shadow-amber-500/20 ring-1 ring-amber-400/30' 
            : 'hover:border-slate-500'
        )}
      >
        {/* Retro terminal header */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700/50 bg-slate-800/50">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-amber-500/80">&gt;_</span>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider truncate max-w-[120px]">
              {section}
            </span>
          </div>
          <span className={cn(
            "text-[9px] font-mono px-1.5 py-0.5 rounded",
            similarityScore >= 0.8 ? 'bg-emerald-500/20 text-emerald-400' :
            similarityScore >= 0.6 ? 'bg-amber-500/20 text-amber-400' :
            'bg-slate-600/30 text-slate-400'
          )}>
            {(similarityScore * 100).toFixed(0)}%
          </span>
        </div>

        {/* Content */}
        <div className="px-3 py-2">
          <p className={cn(
            "text-[11px] text-slate-300 leading-relaxed font-mono",
            isExpanded ? '' : 'line-clamp-3'
          )}>
            {isExpanded ? content : preview}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-slate-700/50 bg-slate-800/30">
          <span className="text-[9px] font-mono text-slate-500">[{ticker}]</span>
          <button
            onClick={() => toggleNodeExpansion(props.id)}
            className="flex items-center gap-1 text-[9px] font-mono text-slate-400 hover:text-amber-400 transition-colors"
          >
            {isExpanded ? (
              <><Minimize2 className="w-3 h-3" /> [collapse]</>
            ) : (
              <><Expand className="w-3 h-3" /> [expand]</>
            )}
          </button>
        </div>
      </div>
      
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-slate-400 !border-0 opacity-0" />
    </div>
  );
});

ChunkNode.displayName = 'ChunkNode';


const nodeTypes = {
  company: CompanyNode,
  document: DocumentNode,
  chunk: ChunkNode,
};

const edgeTypes = {
  retro: RetroEdge,
};



interface KnowledgeGraphProps {
  className?: string;
}

function KnowledgeGraphInner({ className }: KnowledgeGraphProps) {
  const storeNodes = useFintrackStore((state) => state.nodes);
  const storeEdges = useFintrackStore((state) => state.edges);
  const isLoading = useFintrackStore((state) => state.isLoading);
  const expandAllChunks = useFintrackStore((state) => state.expandAllChunks);
  const collapseAllChunks = useFintrackStore((state) => state.collapseAllChunks);
  
  const [selectedChunk, setSelectedChunk] = useState<SemanticChunk | null>(null);
  const { fitView } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);


  useEffect(() => {
    if (storeNodes.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }


    const rfNodes: Node[] = storeNodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position || { x: 0, y: 0 },
      data: { 
        label: n.label, 
        content: n.content,
        ...n.data
      },
      selected: false,
    }));

    const rfEdges: Edge[] = storeEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'retro',
      animated: true,
      data: { type: e.type, weight: e.weight },
      style: { stroke: e.type === 'FILED' ? '#10b981' : '#06b6d4', strokeWidth: 2 },
    }));


    const { nodes: positionedNodes, edges: positionedEdges } = applyDagreLayout(
      rfNodes, 
      rfEdges
    );

    setNodes(positionedNodes);
    setEdges(positionedEdges);

    
    setTimeout(() => {
      fitView({ 
        padding: 0.15,
        duration: 500,
        minZoom: 0.3,
        maxZoom: 1.2,
      });
    }, 100);
  }, [storeNodes, storeEdges, setNodes, setEdges, fitView]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'chunk') {
      const chunkData = storeNodes.find(n => n.id === node.id);
      if (chunkData?.data) {
        const data = chunkData.data as Record<string, unknown>;
        setSelectedChunk({
          id: node.id,
          text: (node.data?.content as string) || '',
          documentType: (data.documentType as string) || '',
          ticker: (data.ticker as string) || '',
          year: (data.year as number) || 0,
          section: (data.section as string) || '',
          similarityScore: (data.similarityScore as number) || 0,
        });
      }
    }
  }, [storeNodes]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.15, duration: 400 });
  }, [fitView]);

  return (
    <div className={cn("relative w-full h-full bg-slate-950", className)}>
      {/* Subtle grid background */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgb(100 116 139) 1px, transparent 1px),
            linear-gradient(to bottom, rgb(100 116 139) 1px, transparent 1px)
          `,
          backgroundSize: '32px 32px',
        }}
      />

      {/* Toolbar */}
      <Panel position="top-right" className="m-4 z-10">
        <div className="flex flex-col gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={handleFitView}
                  className="h-9 w-9 bg-slate-900 border-slate-700 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/50"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="font-mono text-xs">
                <p>[fit_view]</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={expandAllChunks}
                  className="h-9 w-9 bg-slate-900 border-slate-700 text-slate-400 hover:text-amber-400 hover:border-amber-500/50"
                >
                  <Maximize2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="font-mono text-xs">
                <p>[expand_all]</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={collapseAllChunks}
                  className="h-9 w-9 bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-300 hover:border-slate-500/50"
                >
                  <Target className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="font-mono text-xs">
                <p>[collapse_all]</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </Panel>

      {/* Legend */}
      <Panel position="bottom-left" className="m-4 z-10">
        <div className="bg-slate-900/95 border border-slate-700 rounded-lg p-3 shadow-xl">
          <div className="flex items-center gap-2 mb-2">
            <Terminal className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[10px] font-mono text-slate-500 uppercase">graph_legend</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
              <span className="text-[10px] font-mono text-slate-400">[company_entity]</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-sm bg-cyan-500" />
              <span className="text-[10px] font-mono text-slate-400">[sec_filing]</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-sm bg-slate-400" />
              <span className="text-[10px] font-mono text-slate-400">[semantic_chunk]</span>
            </div>
          </div>
        </div>
      </Panel>

      {/* React Flow Canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.15, duration: 500, minZoom: 0.3, maxZoom: 1.2 }}
        minZoom={0.2}
        maxZoom={1.5}
        className="bg-transparent"
        defaultEdgeOptions={{ type: 'retro', animated: true }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={32} size={1} color="#1e293b" className="opacity-30" />
        <Controls className="!bg-slate-900 !border-slate-700 m-4" showInteractive={false} />
        <MiniMap
          nodeStrokeWidth={2}
          nodeColor={(node) => {
            switch (node.type) {
              case 'company': return '#10b981';
              case 'document': return '#06b6d4';
              case 'chunk': return '#94a3b8';
              default: return '#64748b';
            }
          }}
          className="!bg-slate-900 !border-slate-700 rounded-lg m-4"
          maskColor="rgba(15, 23, 42, 0.9)"
        />
      </ReactFlow>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse delay-75" />
              <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse delay-150" />
            </div>
            <span className="text-xs font-mono text-emerald-400">&gt; building_knowledge_graph...</span>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center p-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center">
              <Terminal className="w-8 h-8 text-slate-700" />
            </div>
            <p className="text-xs font-mono text-slate-500">&gt; awaiting_query...</p>
            <p className="text-[10px] font-mono text-slate-600 mt-2">submit a query to visualize data</p>
          </div>
        </div>
      )}

      {/* Chunk Detail Dialog */}
      <Dialog open={!!selectedChunk} onOpenChange={() => setSelectedChunk(null)}>
        <DialogContent className="max-w-2xl bg-slate-900 border-slate-700 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-100 font-mono text-sm">
              <span className="text-amber-500">&gt;_</span>
              <span>semantic_chunk_details</span>
            </DialogTitle>
            <DialogDescription className="text-slate-500 font-mono text-xs">
              [{selectedChunk?.ticker}] [{selectedChunk?.year}] [{selectedChunk?.documentType}]
            </DialogDescription>
          </DialogHeader>
          
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-mono text-amber-500/80 px-2 py-1 bg-amber-500/10 rounded">
                {selectedChunk?.section}
              </span>
              <span className="text-[10px] font-mono text-emerald-400/80 px-2 py-1 bg-emerald-500/10 rounded">
                match: {((selectedChunk?.similarityScore || 0) * 100).toFixed(1)}%
              </span>
            </div>
            
            <ScrollArea className="h-[300px] rounded border border-slate-800 bg-slate-950 p-4">
              <p className="text-xs text-slate-300 leading-relaxed font-mono whitespace-pre-wrap">
                {selectedChunk?.text}
              </p>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function KnowledgeGraphWrapper(props: KnowledgeGraphProps) {
  return (
    <ReactFlowProvider>
      <KnowledgeGraphInner {...props} />
    </ReactFlowProvider>
  );
}
