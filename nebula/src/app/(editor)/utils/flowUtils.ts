// @ts-nocheck
import { Node, Edge } from "@xyflow/react";
import { Flow } from "../components/FlowManager";

// Shared edge coverage utilities
export const isEdgeInFlowPath = (
  edge: Edge,
  pathNodeIds: string[],
): boolean => {
  // Defensive: pathNodeIds must be a non-null array with at least 2 elements
  if (!Array.isArray(pathNodeIds) || pathNodeIds.length < 2) {
    return false;
  }
  // Check all consecutive pairs in the path
  for (let i = 0; i < pathNodeIds.length - 1; i++) {
    if (pathNodeIds[i] === edge.source && pathNodeIds[i + 1] === edge.target) {
      return true;
    }
  }
  return false;
};

export const isEdgeInAnyFlow = (edge: Edge, flows: Flow[]): boolean => {
  return flows.some((flow) => isEdgeInFlowPath(edge, flow.pathNodeIds));
};
