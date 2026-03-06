/**
 * Fintrack GraphRAG - Clean Hierarchy Layout Utility
 * 
 * Visual Design:
 * - Company node: Top center, isolated
 * - Document node: Below company, connected by clean line
 * - Chunk nodes: Horizontal row below document, evenly spaced, no overlap
 * - Generous vertical spacing between levels
 * - Edges route elegantly around nodes
 */

import type { Node, Edge } from '@xyflow/react';




const NODE_DIMENSIONS = {
  company: { width: 180, height: 70 },
  document: { width: 220, height: 70 },
  chunk: { width: 260, height: 140 },
};


const LEVEL_SPACING = 180;    
const CHUNK_SPACING = 40;    
const TOP_PADDING = 80;     

/**
 * Clean hierarchical layout
 * 
 * Layout Structure:
 *                    [COMPANY]
 *                        |
 *                        | 120px
 *                        |
 *                   [DOCUMENT]
 *                        |
 *                        | 180px
 *                        |
 *    [CHUNK 1]  [CHUNK 2]  [CHUNK 3]  [CHUNK 4]  ...
 *      40px gap between chunks, all centered under document
 */
export function applyDagreLayout(
  nodes: Node[],
  edges: Edge[]
): { nodes: Node[]; edges: Edge[] } {

  
  if (!nodes || nodes.length === 0) {
    return { nodes: [], edges: edges || [] };
  }

  const validNodes = nodes.filter(n => n && n.id && n.type);
  if (validNodes.length === 0) {
    return { nodes: [], edges: [] };
  }


  const companyNodes = validNodes.filter(n => n.type === 'company');
  const documentNodes = validNodes.filter(n => n.type === 'document');
  const chunkNodes = validNodes.filter(n => n.type === 'chunk');

  console.log(`[Layout] Company: ${companyNodes.length}, Document: ${documentNodes.length}, Chunks: ${chunkNodes.length}`);


  const canvasWidth = 1200; 
  const centerX = canvasWidth / 2;

  const positionedNodes: Node[] = [];


  const companyY = TOP_PADDING;
  companyNodes.forEach((node) => {
    positionedNodes.push({
      ...node,
      position: {
        x: centerX - NODE_DIMENSIONS.company.width / 2,
        y: companyY,
      },
    });
  });

 
  const documentY = companyY + NODE_DIMENSIONS.company.height + LEVEL_SPACING;
  documentNodes.forEach((node) => {
    positionedNodes.push({
      ...node,
      position: {
        x: centerX - NODE_DIMENSIONS.document.width / 2,
        y: documentY,
      },
    });
  });

  if (chunkNodes.length > 0) {
    const chunkY = documentY + NODE_DIMENSIONS.document.height + LEVEL_SPACING;
    
   
    const totalChunksWidth = (chunkNodes.length * NODE_DIMENSIONS.chunk.width) + 
                             ((chunkNodes.length - 1) * CHUNK_SPACING);
    
  
    const startX = centerX - (totalChunksWidth / 2);

    chunkNodes.forEach((node, idx) => {
      positionedNodes.push({
        ...node,
        position: {
          x: startX + idx * (NODE_DIMENSIONS.chunk.width + CHUNK_SPACING),
          y: chunkY,
        },
      });
    });
  }

  
  const positionedEdges = (edges || []).map((edge) => {
    const sourceNode = positionedNodes.find(n => n.id === edge.source);
    const targetNode = positionedNodes.find(n => n.id === edge.target);

    if (!sourceNode || !targetNode) {
      return edge;
    }

    const sourceDims = NODE_DIMENSIONS[sourceNode.type as keyof typeof NODE_DIMENSIONS] || NODE_DIMENSIONS.company;
    const targetDims = NODE_DIMENSIONS[targetNode.type as keyof typeof NODE_DIMENSIONS] || NODE_DIMENSIONS.chunk;

   
    const sourceX = sourceNode.position.x + sourceDims.width / 2;
    const sourceY = sourceNode.position.y + sourceDims.height;
    const targetX = targetNode.position.x + targetDims.width / 2;
    const targetY = targetNode.position.y;

   
    const verticalGap = targetY - sourceY;
    const controlOffset = Math.max(verticalGap * 0.4, 60);
    
    const cp1x = sourceX;
    const cp1y = sourceY + controlOffset;
    const cp2x = targetX;
    const cp2y = targetY - controlOffset;
    
    const path = `M ${sourceX} ${sourceY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetX} ${targetY}`;

    return {
      ...edge,
      type: 'default',
      path,
    };
  });

  console.log(`[Layout] Positioned ${positionedNodes.length} nodes`);
  return { nodes: positionedNodes, edges: positionedEdges };
}

/**
 * Get layout bounds for fitView
 */
export function getLayoutBounds(nodes: Node[]) {
  if (!nodes || nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 800, maxY: 600, width: 800, height: 600, centerX: 400, centerY: 300 };
  }

  const validNodes = nodes.filter(n => n?.position);
  if (validNodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 800, maxY: 600, width: 800, height: 600, centerX: 400, centerY: 300 };
  }

  const minX = Math.min(...validNodes.map(n => n.position.x));
  const minY = Math.min(...validNodes.map(n => n.position.y));
  
  const maxX = Math.max(...validNodes.map(n => {
    const dims = NODE_DIMENSIONS[n.type as keyof typeof NODE_DIMENSIONS];
    return n.position.x + (dims?.width || 200);
  }));
  
  const maxY = Math.max(...validNodes.map(n => {
    const dims = NODE_DIMENSIONS[n.type as keyof typeof NODE_DIMENSIONS];
    return n.position.y + (dims?.height || 100);
  }));

  return {
    minX: minX - 100,
    minY: minY - 50,
    maxX: maxX + 100,
    maxY: maxY + 100,
    width: maxX - minX + 200,
    height: maxY - minY + 150,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}
