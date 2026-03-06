/**
 * Fintrack GraphRAG SEC Analytics Platform - Zustand Store
 * 
 * Features:
 * - Schema adapter: Maps backend {cik, score} -> frontend {ticker, similarityScore}
 * - Chat history management
 * - FIXED: Proper parent node creation for graph hierarchy
 */

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { applyDagreLayout } from '@/lib/layoutUtils';
import type {
  ChatMessage,
  SemanticChunk,
  GraphNode,
  GraphEdge,
  Citation,
  ChatState,
  GraphState,
  UIState,
  ConversationHistoryItem,
} from '@/types';



interface FintrackState extends ChatState, GraphState, UIState {
 
  setInputValue: (value: string) => void;
  sendMessage: (content: string) => void;
  appendToken: (token: string) => void;
  addCitation: (citation: Citation) => void;
  finalizeMessage: (semanticChunks: SemanticChunk[]) => void;
  setError: (error: string | null) => void;
  clearChat: () => void;
  retryLastMessage: () => void;
  setInferenceLoading: (loading: boolean) => void;
  
  
  conversationHistory: ConversationHistoryItem[];
  loadConversation: (conversationId: string) => void;
  deleteConversation: (conversationId: string) => void;

 
  buildGraphFromChunks: (chunks: SemanticChunk[]) => void;
  selectNode: (nodeId: string | null) => void;
  toggleNodeExpansion: (nodeId: string) => void;
  expandAllChunks: () => void;
  collapseAllChunks: () => void;
  setLayout: (layout: GraphState['layout']) => void;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  resetGraphView: () => void;

 
  toggleSidebar: () => void;
  setActivePanel: (panel: UIState['activePanel']) => void;
  toggleTheme: () => void;
  setPanelSizes: (sizes: { left: number; right: number }) => void;
}


const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
const generateConversationId = () => `conv-${Date.now()}`;



const initialChatState: ChatState = {
  messages: [],
  streamingMessage: null,
  inputValue: '',
  isLoading: false,
  error: null,
  conversationId: generateConversationId(),
  isInferenceLoading: false,
};

const initialGraphState: GraphState = {
  nodes: [],
  edges: [],
  selectedNodeId: null,
  expandedNodeIds: [],
  layout: 'hierarchical',
  isLoading: false,
};

const initialUIState: UIState = {
  sidebarCollapsed: false,
  activePanel: 'chat',
  theme: 'dark',
  panelSizes: { left: 45, right: 55 },
};



export const useFintrackStore = create<FintrackState>()(
  subscribeWithSelector(
    devtools(
      immer((set, get) => ({
        ...initialChatState,
        ...initialGraphState,
        ...initialUIState,
        conversationHistory: [],

        setInputValue: (value) => {
          set((state) => { state.inputValue = value; });
        },

        sendMessage: (content) => {
          const userMessage: ChatMessage = {
            id: generateId(),
            role: 'user',
            content,
            timestamp: new Date(),
          };

          const assistantMessage: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            isStreaming: true,
            citations: [],
            semanticChunks: [],
          };

          set((state) => {
            state.messages.push(userMessage);
            state.streamingMessage = assistantMessage;
            state.isLoading = true;
            state.error = null;
            state.inputValue = '';
          });
        },

        appendToken: (token) => {
          set((state) => {
            if (state.streamingMessage) {
              state.streamingMessage.content += token;
            }
          });
        },

        addCitation: (citation: Citation) => {
          set((state) => {
            if (state.streamingMessage?.citations) {
              const exists = state.streamingMessage.citations.some(
                (c: Citation) => c.chunkId === citation.chunkId
              );
              if (!exists) {
                state.streamingMessage.citations.push(citation);
              }
            }
          });
        },

        finalizeMessage: (semanticChunks) => {
          console.log("🛠 Finalizing with Chunks:", semanticChunks);
          set((state) => {
            if (state.streamingMessage) {
              state.streamingMessage.isStreaming = false;
              state.streamingMessage.semanticChunks = semanticChunks;
              state.messages.push({ ...state.streamingMessage });
              state.streamingMessage = null;
            }
            state.isLoading = false;
            state.isInferenceLoading = false;

          
            const lastUserMessage = [...state.messages]
              .reverse()
              .find((m: ChatMessage) => m.role === 'user');
            
            if (lastUserMessage) {
              const existingIndex = state.conversationHistory.findIndex(
                (h) => h.id === state.conversationId
              );
              
              if (existingIndex >= 0) {
                state.conversationHistory[existingIndex].messageCount = state.messages.length;
              } else {
                state.conversationHistory.unshift({
                  id: state.conversationId,
                  query: lastUserMessage.content.slice(0, 50) + (lastUserMessage.content.length > 50 ? '...' : ''),
                  timestamp: new Date(),
                  messageCount: state.messages.length,
                });
              }
              
            
              if (state.conversationHistory.length > 20) {
                state.conversationHistory = state.conversationHistory.slice(0, 20);
              }
            }
          });
        },

        setError: (error) => {
          set((state) => {
            state.error = error;
            state.isLoading = false;
            state.isInferenceLoading = false;
            if (state.streamingMessage) {
              state.streamingMessage.error = error || undefined;
              state.streamingMessage.isStreaming = false;
              state.messages.push({ ...state.streamingMessage });
              state.streamingMessage = null;
            }
          });
        },

        setInferenceLoading: (loading) => {
          set((state) => {
            state.isInferenceLoading = loading;
          });
        },

        clearChat: () => {
          set((state) => {
            state.messages = [];
            state.streamingMessage = null;
            state.error = null;
            state.conversationId = generateConversationId();
          });
          get().resetGraphView();
        },

        retryLastMessage: () => {
          const state = get();
          const lastUserMessage = [...state.messages]
            .reverse()
            .find((m: ChatMessage) => m.role === 'user');
          
          if (lastUserMessage) {
            set((s) => {
              const userMsgIndex = s.messages.findIndex(
                (m: ChatMessage) => m.id === lastUserMessage.id
              );
              s.messages = s.messages.slice(0, userMsgIndex + 1);
            });
            get().sendMessage(lastUserMessage.content);
          }
        },

      
        buildGraphFromChunks: (chunks) => {
          console.log("Building Graph from chunks:", chunks);
          
          if (!chunks || chunks.length === 0) {
            console.warn("Graph build skipped: No chunks provided.");
            return;
          }

          
          const validChunks = chunks.filter(c => c && c.id && c.ticker);
          if (validChunks.length === 0) {
            console.error("No valid chunks to build graph");
            return;
          }

          const ticker = validChunks[0].ticker;
          const year = validChunks[0].year || new Date().getFullYear();
          const docType = validChunks[0].documentType || '10-K';
          
          const companyId = `company-${ticker}`;
          const docId = `doc-${ticker}-${year}-${docType}`;

          console.log("Creating hierarchy:", { companyId, docId, ticker, year, docType });

          const newNodes: GraphNode[] = [];
          const newEdges: GraphEdge[] = [];

        
          newNodes.push({
            id: companyId,
            type: 'company',
            label: ticker,
            position: { x: 0, y: 0 },
            data: { ticker, label: ticker }
          });
          console.log("Created company node:", companyId);

          newNodes.push({
            id: docId,
            type: 'document',
            label: `${ticker} ${year} ${docType}`,
            position: { x: 0, y: 0 },
            data: { ticker, year, documentType: docType, label: `${ticker} ${year} ${docType}` }
          });
          console.log("Created document node:", docId);

    
          newEdges.push({ 
            id: `edge-${companyId}-${docId}`, 
            source: companyId, 
            target: docId,
            type: 'FILED',
            weight: 1
          });

        
          validChunks.forEach((chunk, index) => {
            newNodes.push({
              id: chunk.id,
              type: 'chunk',
              label: `Section ${index + 1}`,
              content: chunk.text,
              position: { x: 0, y: 0 },
              data: {
                ticker: chunk.ticker,
                year: chunk.year,
                documentType: chunk.documentType,
                section: chunk.section,
                similarityScore: chunk.similarityScore,
                preview: chunk.text ? chunk.text.slice(0, 120) + '...' : 'No preview',
              }
            });
            
        
            newEdges.push({ 
              id: `edge-${docId}-${chunk.id}`, 
              source: docId, 
              target: chunk.id,
              type: 'CONTAINS_CONTENT',
              weight: chunk.similarityScore || 0.5
            });
          });
          
          console.log(`Created ${validChunks.length} chunk nodes`);
          console.log("Total nodes:", newNodes.length, "Total edges:", newEdges.length);

     
          set((state) => { state.isLoading = true; });

          try {
            const { nodes: layoutedNodes, edges: layoutedEdges } = applyDagreLayout(
              newNodes as any, 
              newEdges as any
            );
            
            console.log("Layout applied successfully");

            set((state) => {
              state.nodes = layoutedNodes as any;
              state.edges = layoutedEdges as any;
              state.isLoading = false;
              state.expandedNodeIds = [];
            });
          } catch (err) {
            console.error(" Layout engine crashed, falling back to un-layouted nodes:", err);
            
       
            set((state) => {
              state.nodes = newNodes;
              state.edges = newEdges;
              state.isLoading = false;
              state.expandedNodeIds = [];
            });
          }
        },

        selectNode: (nodeId) => {
          set((state) => { state.selectedNodeId = nodeId; });
        },

        toggleNodeExpansion: (nodeId) => {
          set((state) => {
            const index = state.expandedNodeIds.indexOf(nodeId);
            if (index > -1) {
              state.expandedNodeIds.splice(index, 1);
            } else {
              state.expandedNodeIds.push(nodeId);
            }
          });
        },

        expandAllChunks: () => {
          set((state) => {
            state.expandedNodeIds = state.nodes
              .filter((n: GraphNode) => n.type === 'chunk')
              .map((n: GraphNode) => n.id);
          });
        },

        collapseAllChunks: () => {
          set((state) => { state.expandedNodeIds = []; });
        },

        setLayout: (layout) => {
          set((state) => { state.layout = layout; });
          const { streamingMessage, messages } = get();
          const lastMsgChunks = streamingMessage?.semanticChunks || 
                               messages[messages.length - 1]?.semanticChunks;
          if (lastMsgChunks) get().buildGraphFromChunks(lastMsgChunks);
        },

        updateNodePosition: (nodeId: string, position: { x: number; y: number }) => {
          set((state) => {
            const node = state.nodes.find((n: GraphNode) => n.id === nodeId);
            if (node) { node.position = position; }
          });
        },

        resetGraphView: () => {
          set((state) => {
            state.nodes = [];
            state.edges = [];
            state.selectedNodeId = null;
            state.expandedNodeIds = [];
          });
        },

        loadConversation: (conversationId) => {
          set((state) => {
            state.conversationId = conversationId;
            state.messages = [];
            state.streamingMessage = null;
          });
        },

        deleteConversation: (conversationId) => {
          set((state) => {
            state.conversationHistory = state.conversationHistory.filter(
              (h) => h.id !== conversationId
            );
          });
        },

        toggleSidebar: () => {
          set((state) => { state.sidebarCollapsed = !state.sidebarCollapsed; });
        },

        setActivePanel: (panel) => {
          set((state) => { state.activePanel = panel; });
        },

        toggleTheme: () => {
          set((state) => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; });
        },

        setPanelSizes: (sizes) => {
          set((state) => { state.panelSizes = sizes; });
        },
      })),
      { name: 'FintrackStore' } 
    )
  )
);
