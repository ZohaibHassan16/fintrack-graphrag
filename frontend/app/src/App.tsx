/**
 * Fintrack GraphRAG SEC Analytics Platform
 * 
 * Main Application Component
 * 
 * Enterprise-grade frontend for the GraphRAG SEC Analytics platform.
 * Features a split-pane dashboard with:
 * - Left: Streaming chat interface with inline citations
 * - Right: Interactive Knowledge Graph visualization
 * 
 * Architecture:
 * - Zustand for state management
 * - React Flow for graph visualization
 * - Custom streaming hook for SSE handling
 * - Premium financial UI (dark mode, glassmorphism)
 */

import { SplitPaneLayout } from '@/components/layout/SplitPaneLayout';
import { Toaster } from '@/components/ui/sonner';

function App() {
  return (
    <>
      <SplitPaneLayout />
      <Toaster 
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'hsl(222 47% 6%)',
            border: '1px solid hsl(217 33% 17%)',
            color: 'hsl(210 40% 98%)',
          },
        }}
      />
    </>
  );
}

export default App;
