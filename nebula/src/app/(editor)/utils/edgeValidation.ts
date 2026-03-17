import { Edge } from "@xyflow/react";

/**
 * Check if there is a direct edge between two nodes
 */
export const hasDirectEdge = (
  fromNodeId: string,
  toNodeId: string,
  edges: Edge[],
): boolean => {
  return edges.some(
    (edge) => edge.source === fromNodeId && edge.target === toNodeId,
  );
};

/**
 * Check if a node can be added to the current flow path
 * (i.e., if there's an edge from the last node in the path to the new node)
 */
export const canAddNodeToFlow = (
  newNodeId: string,
  currentPathNodeIds: string[],
  edges: Edge[],
): boolean => {
  // If this is the first node (start node), it can always be added
  if (currentPathNodeIds.length === 0) {
    return true;
  }

  // Check if there's an edge from the last node in the path to the new node
  const lastNodeId = currentPathNodeIds[currentPathNodeIds.length - 1];
  return hasDirectEdge(lastNodeId, newNodeId, edges);
};
