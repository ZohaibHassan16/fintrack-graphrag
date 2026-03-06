declare module 'dagre' {
  export interface GraphNode {
    id: string;
    width: number;
    height: number;
    x?: number;
    y?: number;
  }

  export interface GraphEdge {
    v: string;
    w: string;
  }

  export interface GraphConfig {
    rankdir?: 'TB' | 'BT' | 'LR' | 'RL';
    ranksep?: number;
    nodesep?: number;
    align?: 'UL' | 'UR' | 'DL' | 'DR' | 'C';
    marginx?: number;
    marginy?: number;
  }

  export class Graph {
    constructor();
    setGraph(config: GraphConfig): void;
    setDefaultEdgeLabel(callback: () => Record<string, unknown>): void;
    setNode(id: string, node: { width: number; height: number }): void;
    setEdge(source: string, target: string): void;
    node(id: string): GraphNode;
    nodes(): string[];
    edges(): GraphEdge[];
  }

  export namespace graphlib {
    export class Graph {
      constructor();
      setGraph(config: GraphConfig): void;
      setDefaultEdgeLabel(callback: () => Record<string, unknown>): void;
      setNode(id: string, node: { width: number; height: number }): void;
      setEdge(source: string, target: string): void;
      node(id: string): GraphNode;
      nodes(): string[];
      edges(): GraphEdge[];
    }
  }

  export function layout(graph: Graph): void;
}
