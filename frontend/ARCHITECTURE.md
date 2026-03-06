# Fintrack GraphRAG SEC Analytics Platform
## Frontend Architecture Documentation

---

## 1. Frontend Architecture Plan

### Folder Structure

```
/src
├── components/
│   ├── chat/
│   │   └── ChatInterface.tsx      # Streaming chat with citations
│   ├── graph/
│   │   └── KnowledgeGraph.tsx     # React Flow visualization
│   ├── layout/
│   │   └── SplitPaneLayout.tsx    # Resizable split-pane dashboard
│   └── ui/                        # shadcn/ui components
├── hooks/
│   └── useFintrackStream.ts       # SSE streaming hook
├── store/
│   └── index.ts                   # Zustand store with slices
├── types/
│   └── index.ts                   # TypeScript definitions
├── lib/
│   └── utils.ts                   # Utility functions
├── App.tsx                        # Root component
└── index.css                      # Global styles
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | React 18 + Vite | UI rendering & build |
| Language | TypeScript | Type safety |
| Styling | Tailwind CSS | Utility-first CSS |
| Components | shadcn/ui + Radix | Accessible UI primitives |
| State | Zustand | Lightweight global state |
| Graph Viz | React Flow | Interactive node graphs |
| Layout | react-resizable-panels | Split-pane layout |

---

## 2. Critical Technical Challenges - Solutions

### Challenge 1: Consuming a Streaming API

**Problem:** How to handle chunked streaming responses from Java Netty backend without React hydration errors or UI tearing.

**Solution:**

```typescript
// useFintrackStream.ts - Key implementation details

// 1. Use native fetch with ReadableStream for maximum control
const response = await fetch(`${API_BASE_URL}/api/v1/query`, {
  method: 'POST',
  headers: { 'Accept': 'text/event-stream' },
  body: JSON.stringify(request),
});

// 2. Process stream with TextDecoder
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  const chunk = decoder.decode(value, { stream: true });
  // Parse SSE events and update store
}

// 3. Token buffering for smooth UI updates (16ms = 1 frame)
const TOKEN_BUFFER_MS = 16;
const tokenBufferRef = useRef<string>('');

// 4. AbortController for cancellation
const abortControllerRef = useRef<AbortController | null>(null);
```

**Key Patterns:**
- SSE (Server-Sent Events) parsing with buffer management
- Token batching to prevent excessive re-renders
- Proper cleanup on unmount and cancellation
- Error handling with retry logic

---

### Challenge 2: Synchronizing Chat and Graph

**Problem:** How to architect Zustand store so graph updates when streaming completes.

**Solution:**

```typescript
// store/index.ts - Slice architecture with cross-slice actions

interface FintrackState extends ChatState, GraphState, UIState {
  // Chat actions
  appendToken: (token: string) => void;
  finalizeMessage: (semanticChunks: SemanticChunk[]) => void;
  
  // Graph actions
  buildGraphFromChunks: (chunks: SemanticChunk[]) => void;
}

// Cross-slice action - triggers graph update when streaming completes
finalizeMessage: (semanticChunks) => {
  set((state) => {
    state.streamingMessage.isStreaming = false;
    state.messages.push({ ...state.streamingMessage });
    state.streamingMessage = null;
  });
  // Trigger graph update
  get().buildGraphFromChunks(semanticChunks);
}

// Graph building from semantic chunks
buildGraphFromChunks: (chunks) => {
  const nodes = buildNodesFromChunks(chunks);  // Company -> Document -> Chunk
  const edges = buildEdgesFromChunks(chunks);  // Relationships
  const positionedNodes = applyForceLayout(nodes, edges);
  set((state) => {
    state.nodes = positionedNodes;
    state.edges = edges;
  });
}
```

**Key Patterns:**
- Single store with slices for related state
- Cross-slice actions for coordination
- Selectors to prevent unnecessary re-renders
- Immer for immutable updates

---

### Challenge 3: Performance - Preventing Graph Re-renders During Streaming

**Problem:** How to ensure React Flow graph doesn't re-render while chat text streams.

**Solution:**

```typescript
// 1. Selective state subscription
const { nodes, edges } = useFintrackStore(selectGraphState);
// Only subscribes to graph state, not chat state

// 2. React.memo for node components
const CompanyNode = React.memo(({ data, selected }: NodeProps) => {
  return <div>...</div>;
});

// 3. Separate state slices
export const selectChatState = (state) => ({
  messages: state.messages,
  streamingMessage: state.streamingMessage,
  // ...chat only
});

export const selectGraphState = (state) => ({
  nodes: state.nodes,
  edges: state.edges,
  // ...graph only
});

// 4. Zustand subscribeWithSelector middleware
import { subscribeWithSelector } from 'zustand/middleware';

export const useFintrackStore = create<FintrackState>()(
  subscribeWithSelector(immer((set, get) => ({ ... })))
);
```

**Key Patterns:**
- Selector-based subscriptions
- React.memo for expensive components
- State slice separation
- Zustand's built-in selector support

---

## 3. Component Architecture

### ChatInterface Component

```typescript
interface ChatInterfaceProps {
  className?: string;
  onCitationClick?: (citation: Citation) => void;
}

// Features:
// - Message history with user/assistant differentiation
// - Streaming text with cursor animation
// - Inline citation badges with hover tooltips
// - Suggested queries for empty state
// - Error handling with retry
```

### KnowledgeGraph Component

```typescript
interface KnowledgeGraphProps {
  className?: string;
}

// Features:
// - Three node types: Company, Document, Chunk
// - Interactive selection and expansion
// - Force-directed layout
// - MiniMap and Controls
// - Loading states
```

### SplitPaneLayout Component

```typescript
// Features:
// - Resizable panels (30%-70% range)
// - Mobile-responsive (tab switching)
// - Panel size persistence (localStorage)
// - Keyboard shortcuts (Ctrl+B toggle)
```

---

## 4. Data Flow

```
User Query
    ↓
[ChatInterface] → sendQuery() → [useFintrackStream]
    ↓                                    ↓
[Zustand Store] ← SSE chunks ← [Java Netty API]
    ↓
[Streaming Display] ← appendToken()
    ↓
[finalizeMessage()] → buildGraphFromChunks()
    ↓
[KnowledgeGraph] ← nodes/edges update
```

---

## 5. Backend Integration

### API Endpoint

```
POST http://localhost:8080/api/v1/query
Content-Type: application/json
Accept: text/event-stream

{
  "query": "What was Apple's revenue in 2023?",
  "ticker": "AAPL",
  "topK": 5,
  "conversationId": "conv-123"
}
```

### SSE Response Format

```
data: {"type": "token", "token": "Based"}
data: {"type": "token", "token": " on"}
data: {"type": "citation", "citation": {"number": 1, "chunkId": "...", "preview": "..."}}
data: {"type": "chunk", "semanticChunk": {"id": "...", "text": "...", ...}}
data: {"type": "complete"}
```

---

## 6. Environment Configuration

```bash
# .env
VITE_API_URL=http://localhost:8080
VITE_WS_URL=ws://localhost:8080
VITE_ENABLE_MOCK=true  # Use mock stream for development
```

---

## 7. Next Steps for Production

1. **Authentication**: Add JWT token handling to API requests
2. **Error Boundaries**: Wrap components with React Error Boundaries
3. **Analytics**: Add telemetry for query patterns
4. **Caching**: Implement SWR or React Query for chunk caching
5. **Virtualization**: Use react-window for long message lists
6. **Testing**: Add Jest + React Testing Library tests
7. **Accessibility**: Run axe-core audits and fix issues

---

## 8. Performance Budget

| Metric | Target | Current |
|--------|--------|---------|
| First Contentful Paint | < 1.5s | TBD |
| Time to Interactive | < 3s | TBD |
| Bundle Size | < 500KB | TBD |
| Graph Render (100 nodes) | < 100ms | TBD |
| Stream Latency | < 50ms/token | ~30ms |
