/**
 * Fintrack GraphRAG SEC Analytics Platform - Split Pane Layout
 * 
 * Features:
 * - Fixed h-screen viewport constraints to prevent graph cutoff
 * - Internal pane scrolling for Chat
 * - Dynamic Resizable Panels (Desktop)
 * - Tabbed navigation (Mobile)
 * - Chat History Sidebar wired to Zustand store
 */

import React, { useEffect, useCallback } from 'react';
import { 
  PanelLeft, 
  PanelRight, 
  LayoutTemplate,
  Menu,
  X,
  History,
  MessageSquare,
  Trash2,
  Clock,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { useFintrackStore } from '@/store';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { KnowledgeGraphWrapper } from '@/components/graph/KnowledgeGraph';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ConversationHistoryItem } from '@/types';



const HistoryItem = React.memo(({
  item,
  isActive,
  onClick,
  onDelete,
}: {
  item: ConversationHistoryItem;
  isActive: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) => {
  const timeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200",
        isActive 
          ? 'bg-cyan-500/15 border border-cyan-500/30' 
          : 'hover:bg-slate-800/60 border border-transparent'
      )}
      onClick={onClick}
    >
      <div className={cn(
        "p-1.5 rounded-md transition-colors shrink-0",
        isActive ? 'bg-cyan-500/20' : 'bg-slate-800 group-hover:bg-slate-700'
      )}>
        <MessageSquare className={cn(
          "w-3.5 h-3.5",
          isActive ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-400'
        )} />
      </div>
      
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-xs font-medium truncate transition-colors",
          isActive ? 'text-cyan-100' : 'text-slate-300 group-hover:text-slate-200'
        )}>
          {item.query}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <Clock className="w-2.5 h-2.5 text-slate-600" />
          <span className="text-[10px] text-slate-500">{timeAgo(item.timestamp)}</span>
          <span className="text-[10px] text-slate-600">•</span>
          <span className="text-[10px] text-slate-500">{item.messageCount} msgs</span>
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20 hover:text-red-400"
        onClick={onDelete}
      >
        <Trash2 className="w-3 h-3" />
      </Button>
    </div>
  );
});

HistoryItem.displayName = 'HistoryItem';



function SidebarContent() {
  const conversationHistory = useFintrackStore((state) => state.conversationHistory);
  const conversationId = useFintrackStore((state) => state.conversationId);
  const loadConversation = useFintrackStore((state) => state.loadConversation);
  const deleteConversation = useFintrackStore((state) => state.deleteConversation);
  const clearChat = useFintrackStore((state) => state.clearChat);
  const setActivePanel = useFintrackStore((state) => state.setActivePanel);

  const handleNewChat = () => {
    clearChat();
  };

  return (
    <div className="flex flex-col h-full">
      {/* New Chat Button */}
      <div className="p-4">
        <Button
          onClick={handleNewChat}
          className="w-full justify-between h-11 px-4 bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-500/20 transition-all hover:shadow-cyan-500/30"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            New Chat
          </span>
          <ChevronRight className="w-4 h-4 opacity-70" />
        </Button>
      </div>

      <ScrollArea className="flex-1 px-3">
        <div className="space-y-6 pb-4">
          {/* Navigation */}
          <div>
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em] mb-3 px-2">
              Workspace
            </h3>
            <nav className="space-y-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      onClick={() => setActivePanel('chat')}
                      className="w-full justify-start text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 h-10 px-3 transition-all"
                    >
                      <PanelLeft className="w-4 h-4 mr-3" /> 
                      <span className="text-sm">Analyst Chat</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>Open Chat Panel</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      onClick={() => setActivePanel('graph')}
                      className="w-full justify-start text-slate-400 hover:text-violet-400 hover:bg-violet-500/10 h-10 px-3 transition-all"
                    >
                      <PanelRight className="w-4 h-4 mr-3" /> 
                      <span className="text-sm">Knowledge Graph</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>Open Graph Panel</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </nav>
          </div>

          {/* Conversation History */}
          <div>
            <div className="flex items-center justify-between px-2 mb-3">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">
                History
              </h3>
              {conversationHistory.length > 0 && (
                <span className="text-[10px] text-slate-600">
                  {conversationHistory.length} conversation{conversationHistory.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            
            {conversationHistory.length === 0 ? (
              <div className="text-center py-6 px-4">
                <History className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                <p className="text-xs text-slate-600">No conversations yet</p>
                <p className="text-[10px] text-slate-700 mt-1">Start a new analysis to see history</p>
              </div>
            ) : (
              <div className="space-y-1">
                {conversationHistory.map((item) => (
                  <HistoryItem
                    key={item.id}
                    item={item}
                    isActive={item.id === conversationId}
                    onClick={() => loadConversation(item.id)}
                    onDelete={(e) => {
                      e.stopPropagation();
                      deleteConversation(item.id);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800/50">
        <div className="flex items-center gap-3 px-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] text-slate-500">GraphRAG Engine Online</span>
        </div>
      </div>
    </div>
  );
}



function MobileLayout() {
  const activePanel = useFintrackStore((state) => state.activePanel);
  const setActivePanel = useFintrackStore((state) => state.setActivePanel);

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-slate-950">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/50 bg-slate-900/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-500 shadow-lg shadow-cyan-500/20">
            <LayoutTemplate className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold tracking-tight text-slate-200">FINTRACK</span>
        </div>
        
        <Tabs value={activePanel} onValueChange={(v) => setActivePanel(v as 'chat' | 'graph')}>
          <TabsList className="bg-slate-800/80">
            <TabsTrigger 
              value="chat" 
              className="data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400 text-xs"
            >
              <PanelLeft className="w-3.5 h-3.5 mr-1.5" />
              Chat
            </TabsTrigger>
            <TabsTrigger 
              value="graph"
              className="data-[state=active]:bg-slate-700 data-[state=active]:text-violet-400 text-xs"
            >
              <PanelRight className="w-3.5 h-3.5 mr-1.5" />
              Graph
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 min-h-0 relative overflow-hidden">
        {activePanel === 'chat' ? (
          <ChatInterface className="h-full" />
        ) : (
          <KnowledgeGraphWrapper className="h-full" />
        )}
      </div>
    </div>
  );
}



function DesktopLayout() {
  const panelSizes = useFintrackStore((state) => state.panelSizes);
  const sidebarCollapsed = useFintrackStore((state) => state.sidebarCollapsed);
  const setPanelSizes = useFintrackStore((state) => state.setPanelSizes);
  const toggleSidebar = useFintrackStore((state) => state.toggleSidebar);

  useEffect(() => {
    const saved = localStorage.getItem('fintrack-panel-sizes');
    if (saved) {
      try {
        const sizes = JSON.parse(saved);
        setPanelSizes(sizes);
      } catch { /* ignore */ }
    }
  }, [setPanelSizes]);

  const handleResize = useCallback((leftWidth: number) => {
    const newSizes = { left: leftWidth, right: 100 - leftWidth };
    setPanelSizes(newSizes);
    localStorage.setItem('fintrack-panel-sizes', JSON.stringify(newSizes));
  }, [setPanelSizes]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  return (
    <div className="flex h-screen w-full bg-slate-950 overflow-hidden">
      {/* SIDEBAR */}
      <div
        className={cn(
          'flex-shrink-0 flex flex-col bg-slate-900/50 border-r border-slate-800/50 transition-all duration-300 h-full',
          sidebarCollapsed ? 'w-16' : 'w-72'
        )}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800/50 shrink-0">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-500 shadow-lg shadow-cyan-500/20">
                <LayoutTemplate className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold tracking-tight text-slate-200">FINTRACK</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className={cn(
              "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-all",
              sidebarCollapsed && 'mx-auto'
            )}
          >
            {sidebarCollapsed ? <Menu className="w-4 h-4" /> : <X className="w-4 h-4" />}
          </Button>
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 overflow-hidden">
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center py-4 space-y-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={toggleSidebar}
                      className="h-10 w-10 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10"
                    >
                      <PanelLeft className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>Expand Sidebar</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={toggleSidebar}
                      className="h-10 w-10 text-slate-400 hover:text-violet-400 hover:bg-violet-500/10"
                    >
                      <PanelRight className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>Knowledge Graph</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          ) : (
            <SidebarContent />
          )}
        </div>
      </div>

      {/* MAIN WORKSPACE */}
      <main className="flex-1 flex overflow-hidden h-full">
        {/* CHAT PANEL */}
        <div 
          className="flex flex-col border-r border-slate-800/50 h-full relative bg-slate-950/30"
          style={{ width: `${panelSizes.left}%` }}
        >
          <ChatInterface className="h-full" />
        </div>
        
        {/* DRAG HANDLE */}
        <div 
          className="w-1.5 bg-slate-900 hover:bg-cyan-500/50 cursor-col-resize transition-all flex items-center justify-center group z-50 shrink-0"
          onMouseDown={(e) => {
            const startX = e.clientX;
            const startWidth = panelSizes.left;
            const handleMouseMove = (e: MouseEvent) => {
              const delta = e.clientX - startX;
              const containerWidth = window.innerWidth - (sidebarCollapsed ? 64 : 288);
              const newWidth = startWidth + (delta / containerWidth) * 100;
              handleResize(Math.max(25, Math.min(75, newWidth)));
            };
            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
        >
          <div className="w-px h-12 bg-slate-700 group-hover:bg-cyan-400 transition-colors" />
        </div>
        
        {/* GRAPH PANEL */}
        <div 
          className="flex flex-col h-full bg-slate-950/30 relative min-w-0"
          style={{ width: `${panelSizes.right}%` }}
        >
          <KnowledgeGraphWrapper className="h-full w-full" />
        </div>
      </main>
    </div>
  );
}

export function SplitPaneLayout() {
  const [isMobile, setIsMobile] = React.useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile ? <MobileLayout /> : <DesktopLayout />;
}
