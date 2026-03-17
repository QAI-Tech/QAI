// @ts-nocheck
import { Node, Edge } from "@xyflow/react";
import { Feature, Flow } from "@/app/(editor)/components/FlowManager";
import { nanoid } from "nanoid";

interface FlowPath {
  nodes: Node[];
  startNode: Node;
  endNode: Node;
  isInterFeature: boolean;
}

interface EntryPointScore {
  node: Node;
  score: number;
  inboundFromOtherFeatures: number;
  outboundToSameFeature: number;
  inboundFromSameFeature: number;
}

/**
 * Helper: Get outgoing edges from a node
 */
const getOutgoingEdges = (nodeId: string, edges: Edge[]): Edge[] => {
  return edges.filter((edge) => edge.source === nodeId);
};

/**
 * Helper: Get inbound edges to a node
 */
const getInboundEdges = (nodeId: string, edges: Edge[]): Edge[] => {
  return edges.filter((edge) => edge.target === nodeId);
};

/**
 * Scores entry points based on connectivity patterns
 * Score = inbound_from_other_features + outbound_to_same_feature - inbound_from_same_feature
 */
export const scoreEntryPoints = (
  entryPoints: Node[],
  feature: Feature,
  nodes: Node[],
  edges: Edge[],
  getNodeFeature: (nodeId: string) => Feature | null,
): EntryPointScore[] => {
  return entryPoints
    .map((node) => {
      let inboundFromOtherFeatures = 0;
      let outboundToSameFeature = 0;
      let inboundFromSameFeature = 0;

      // Single pass through edges for both inbound and outbound counting
      edges.forEach((edge) => {
        // Count inbound edges
        if (edge.target === node.id) {
          const sourceFeature = getNodeFeature(edge.source);
          if (sourceFeature) {
            if (sourceFeature.id === feature.id) {
              inboundFromSameFeature++;
            } else {
              inboundFromOtherFeatures++;
            }
          }
        }

        // Count outbound edges to same feature
        if (edge.source === node.id) {
          const targetFeature = getNodeFeature(edge.target);
          if (targetFeature && targetFeature.id === feature.id) {
            outboundToSameFeature++;
          }
        }
      });

      const score =
        inboundFromOtherFeatures +
        outboundToSameFeature -
        inboundFromSameFeature;

      return {
        node,
        score,
        inboundFromOtherFeatures,
        outboundToSameFeature,
        inboundFromSameFeature,
      };
    })
    .sort((a, b) => b.score - a.score); // Sort by score descending
};

/**
 * Identifies feature entry points - nodes that have incoming edges from other features
 */
export const identifyFeatureEntryPoints = (
  feature: Feature,
  nodes: Node[],
  edges: Edge[],
  getNodeFeature: (nodeId: string) => Feature | null,
): Node[] => {
  const featureNodes = nodes.filter((node) =>
    feature.nodeIds.includes(node.id),
  );
  const entryPoints: Node[] = [];

  featureNodes.forEach((node) => {
    // Check if this node has incoming edges from nodes in other features
    const hasExternalIncomingEdge = edges.some((edge) => {
      if (edge.target !== node.id) return false;

      const sourceNodeFeature = getNodeFeature(edge.source);
      return sourceNodeFeature && sourceNodeFeature.id !== feature.id;
    });

    // Check if this node has no incoming edges at all (global entry point)
    const hasNoIncomingEdges = !edges.some((edge) => edge.target === node.id);

    // A node is an entry point if it has external incoming edges OR no incoming edges at all
    if (hasExternalIncomingEdge || hasNoIncomingEdges) {
      entryPoints.push(node);
    }
  });

  return entryPoints;
};

/**
 * Identifies leaf nodes - nodes with no outgoing edges
 */
export const identifyLeafNodes = (
  feature: Feature,
  nodes: Node[],
  edges: Edge[],
): Node[] => {
  const featureNodes = nodes.filter((node) =>
    feature.nodeIds.includes(node.id),
  );

  return featureNodes.filter((node) => {
    return !edges.some((edge) => edge.source === node.id);
  });
};

/**
 * Identifies entry points of other features that are directly connected to this feature
 */
export const identifyConnectedFeatureEntryPoints = (
  feature: Feature,
  nodes: Node[],
  edges: Edge[],
  allFeatures: Feature[],
  getNodeFeature: (nodeId: string) => Feature | null,
): Node[] => {
  const featureNodes = nodes.filter((node) =>
    feature.nodeIds.includes(node.id),
  );
  const connectedEntryPoints: Node[] = [];

  featureNodes.forEach((node) => {
    // Find all outgoing edges from this feature's nodes
    const outgoingEdges = getOutgoingEdges(node.id, edges);

    outgoingEdges.forEach((edge) => {
      const targetNodeFeature = getNodeFeature(edge.target);
      if (targetNodeFeature && targetNodeFeature.id !== feature.id) {
        // Check if the target node is an entry point of its feature
        const targetNode = nodes.find((n) => n.id === edge.target);
        if (targetNode) {
          const targetFeatureEntryPoints = identifyFeatureEntryPoints(
            targetNodeFeature,
            nodes,
            edges,
            getNodeFeature,
          );

          if (targetFeatureEntryPoints.some((ep) => ep.id === targetNode.id)) {
            connectedEntryPoints.push(targetNode);
          }
        }
      }
    });
  });

  // Remove duplicates using Set for O(n) performance
  const uniqueNodeIds = new Set<string>();
  return connectedEntryPoints.filter((node) => {
    if (uniqueNodeIds.has(node.id)) {
      return false;
    }
    uniqueNodeIds.add(node.id);
    return true;
  });
};

/**
 * Finds all possible paths from a start node to valid end nodes
 */
export const findAllPathsFromEntryPoint = (
  startNode: Node,
  validEndNodes: Node[],
  edges: Edge[],
  visitedNodes: Set<string> = new Set(),
): FlowPath[] => {
  const paths: FlowPath[] = [];

  // If start node is also a valid end node (shouldn't happen in our case, but safety check)
  if (validEndNodes.some((endNode) => endNode.id === startNode.id)) {
    return [
      {
        nodes: [startNode],
        startNode,
        endNode: startNode,
        isInterFeature: false,
      },
    ];
  }

  // Mark current node as visited
  visitedNodes.add(startNode.id);

  // Find all outgoing edges from current node
  const outgoingEdges = getOutgoingEdges(startNode.id, edges);

  for (const edge of outgoingEdges) {
    // Skip if we've already visited this target node (avoid cycles)
    if (visitedNodes.has(edge.target)) continue;

    // Check if target is a valid end node
    const targetEndNode = validEndNodes.find(
      (endNode) => endNode.id === edge.target,
    );
    if (targetEndNode) {
      paths.push({
        nodes: [startNode, targetEndNode],
        startNode,
        endNode: targetEndNode,
        isInterFeature: false,
      });
    } else {
      // Continue exploring from this target node
      const targetNode = { id: edge.target } as Node; // We'll need to find the actual node
      const subPaths = findAllPathsFromEntryPoint(
        targetNode,
        validEndNodes,
        edges,
        new Set(visitedNodes),
      );

      // Add current node to the beginning of each sub-path
      subPaths.forEach((subPath) => {
        paths.push({
          nodes: [startNode, ...subPath.nodes],
          startNode,
          endNode: subPath.endNode,
          isInterFeature: subPath.isInterFeature,
        });
      });
    }
  }

  return paths;
};

/**
 * A simpler path finding algorithm that explores direct connections
 */
export const findDirectPaths = (
  startNode: Node,
  validEndNodes: Node[],
  edges: Edge[],
  nodes: Node[],
  getNodeFeature: (nodeId: string) => Feature | null,
): FlowPath[] => {
  const paths: FlowPath[] = [];
  // Use array with index pointer for efficient queue operations (avoid shift() O(n))
  const queue: { node: Node; path: Node[] }[] = [
    { node: startNode, path: [startNode] },
  ];
  let queueIndex = 0;
  const visited = new Set<string>();
  const maxDepth = 50; // Prevent infinite loops

  while (queueIndex < queue.length) {
    const { node: currentNode, path } = queue[queueIndex++];

    // Skip if path is too long
    if (path.length > maxDepth) continue;

    // Create a path key to avoid duplicate paths
    const pathKey = path.map((n) => n.id).join("-");
    if (visited.has(pathKey)) continue;
    visited.add(pathKey);

    // Check if current node is a valid end node
    const endNode = validEndNodes.find((end) => end.id === currentNode.id);
    if (endNode && path.length > 1) {
      // Determine if this is an inter-feature flow
      const startFeature = getNodeFeature(startNode.id);
      const endFeature = getNodeFeature(endNode.id);
      const isInterFeature =
        startFeature && endFeature && startFeature.id !== endFeature.id;

      paths.push({
        nodes: [...path],
        startNode,
        endNode,
        isInterFeature: isInterFeature || false,
      });
      continue; // Don't explore further from end nodes
    }

    // Find outgoing edges and continue exploration
    const outgoingEdges = getOutgoingEdges(currentNode.id, edges);

    for (const edge of outgoingEdges) {
      const targetNode = nodes.find((n) => n.id === edge.target);
      if (targetNode && !path.some((p) => p.id === targetNode.id)) {
        // SINGLE CHECK: Is this node part of any feature?
        const targetFeature = getNodeFeature(targetNode.id);
        if (!targetFeature) {
          continue; // Skip this orphaned node
        }

        queue.push({
          node: targetNode,
          path: [...path, targetNode],
        });
      }
    }
  }

  return paths;
};

/**
 * Checks if all nodes in the feature and connected entry points are reachable from a given entry point
 * For intra-feature nodes: performs full BFS traversal
 * For inter-feature nodes: only includes direct connections (single hop)
 */
export const getConnectedNodes = (
  entryPoint: Node,
  feature: Feature,
  nodes: Node[],
  edges: Edge[],
  allFeatures: Feature[],
  getNodeFeature: (nodeId: string) => Feature | null,
): Set<string> => {
  const visited = new Set<string>();
  // Use array with index pointer for efficient queue operations
  const queue = [entryPoint.id];
  let queueIndex = 0;

  // Get all inter-feature entry points for comparison
  const connectedEntryPoints = identifyConnectedFeatureEntryPoints(
    feature,
    nodes,
    edges,
    allFeatures,
    getNodeFeature,
  );
  const interFeatureNodeIds = new Set(
    connectedEntryPoints.map((node) => node.id),
  );

  while (queueIndex < queue.length) {
    const currentNodeId = queue[queueIndex++];
    if (visited.has(currentNodeId)) continue;
    visited.add(currentNodeId);

    // Find all outgoing edges from current node
    const outgoingEdges = getOutgoingEdges(currentNodeId, edges);

    outgoingEdges.forEach((edge) => {
      if (!visited.has(edge.target)) {
        // Check if target node is an inter-feature entry point
        const isInterFeatureNode = interFeatureNodeIds.has(edge.target);

        if (isInterFeatureNode) {
          // For inter-feature nodes, only mark as visited but don't continue BFS from them
          visited.add(edge.target);
        } else {
          // For intra-feature nodes, continue BFS traversal
          const targetNodeFeature = getNodeFeature(edge.target);
          const isIntraFeatureNode = targetNodeFeature?.id === feature.id;

          if (isIntraFeatureNode) {
            queue.push(edge.target);
          } else {
            // Mark as visited but don't continue BFS
            visited.add(edge.target);
          }
        }
      }
    });
  }

  return visited;
};

/**
 * Gets all target nodes that should be reachable (feature nodes + connected entry points)
 */
export const getAllTargetNodes = (
  feature: Feature,
  nodes: Node[],
  edges: Edge[],
  allFeatures: Feature[],
  getNodeFeature: (nodeId: string) => Feature | null,
): Set<string> => {
  const featureNodes = nodes.filter((node) =>
    feature.nodeIds.includes(node.id),
  );
  const connectedEntryPoints = identifyConnectedFeatureEntryPoints(
    feature,
    nodes,
    edges,
    allFeatures,
    getNodeFeature,
  );

  const targetNodes = new Set<string>();
  featureNodes.forEach((node) => targetNodes.add(node.id));
  connectedEntryPoints.forEach((node) => targetNodes.add(node.id));

  return targetNodes;
};

/**
 * Generates flows for a single feature using prioritized entry points
 */
export const generateFlowsForFeature = (
  feature: Feature,
  nodes: Node[],
  edges: Edge[],
  allFeatures: Feature[],
  getNodeFeature: (nodeId: string) => Feature | null,
): FlowPath[] => {
  const entryPoints = identifyFeatureEntryPoints(
    feature,
    nodes,
    edges,
    getNodeFeature,
  );

  if (entryPoints.length === 0) {
    return []; // No entry points, no flows
  }

  // Score and prioritize entry points
  const scoredEntryPoints = scoreEntryPoints(
    entryPoints,
    feature,
    nodes,
    edges,
    getNodeFeature,
  );

  const leafNodes = identifyLeafNodes(feature, nodes, edges);
  const connectedEntryPoints = identifyConnectedFeatureEntryPoints(
    feature,
    nodes,
    edges,
    allFeatures,
    getNodeFeature,
  );

  const validEndNodes = [...leafNodes, ...connectedEntryPoints];

  if (validEndNodes.length === 0) {
    return []; // No valid end points
  }

  const allPaths: FlowPath[] = [];
  const allTargetNodes = getAllTargetNodes(
    feature,
    nodes,
    edges,
    allFeatures,
    getNodeFeature,
  );
  let remainingTargets = new Set(allTargetNodes);

  // Process entry points in priority order
  for (const { node: entryPoint } of scoredEntryPoints) {
    if (remainingTargets.size === 0) break;

    // Generate paths from this entry point
    const paths = findDirectPaths(
      entryPoint,
      validEndNodes,
      edges,
      nodes,
      getNodeFeature,
    );
    allPaths.push(...paths);
    // Remove nodes that are now connected from remaining targets
    const connectedNodes = getConnectedNodes(
      entryPoint,
      feature,
      nodes,
      edges,
      allFeatures,
      getNodeFeature,
    );
    connectedNodes.forEach((nodeId) => remainingTargets.delete(nodeId));
  }

  return allPaths;
};

/**
 * Gets the description of the last edge in a flow path
 */
export const getLastEdgeDescription = (
  pathNodeIds: string[],
  edges: Edge[],
): string => {
  if (pathNodeIds.length < 2) return "";

  const secondToLastNodeId = pathNodeIds[pathNodeIds.length - 2];
  const lastNodeId = pathNodeIds[pathNodeIds.length - 1];

  const lastEdge = edges.find(
    (edge) => edge.source === secondToLastNodeId && edge.target === lastNodeId,
  );

  return String(lastEdge?.data?.description || lastEdge?.label || "");
};

/**
 * Plans all flows across all features with proper ordering
 */
export const planAllFlows = (
  features: Feature[],
  nodes: Node[],
  edges: Edge[],
  getNodeFeature: (nodeId: string) => Feature | null,
  existingFlows: Flow[],
): Flow[] => {
  const plannedFlows: Flow[] = [];
  let flowCounter = existingFlows.length + 1;

  // Sort features by their leftmost node position (left to right processing)
  // Cache node positions to avoid repeated lookups
  const nodePositionMap = new Map<string, number>();
  nodes.forEach((node) => {
    nodePositionMap.set(node.id, node.position.x);
  });

  // Cache leftmost X for each feature
  const featureLeftmostX = new Map<string, number>();
  features.forEach((feature) => {
    const leftmostX = Math.min(
      ...feature.nodeIds.map(
        (nodeId) => nodePositionMap.get(nodeId) ?? Infinity,
      ),
    );
    featureLeftmostX.set(feature.id, leftmostX);
  });

  const sortedFeatures = [...features].sort((a, b) => {
    const aLeftmostX = featureLeftmostX.get(a.id) ?? Infinity;
    const bLeftmostX = featureLeftmostX.get(b.id) ?? Infinity;
    return aLeftmostX - bLeftmostX;
  });

  // Process each feature in left-to-right order
  sortedFeatures.forEach((feature) => {
    const featurePaths = generateFlowsForFeature(
      feature,
      nodes,
      edges,
      features,
      getNodeFeature,
    );

    // Separate inter-feature and intra-feature flows
    const interFeaturePaths = featurePaths.filter(
      (path) => path.isInterFeature,
    );
    const intraFeaturePaths = featurePaths.filter(
      (path) => !path.isInterFeature,
    );

    // Process inter-feature flows first
    const processFlows = (paths: FlowPath[]) => {
      paths.forEach((flowPath) => {
        const pathNodeIds = flowPath.nodes.map((n) => n.id);
        const lastEdgeDescription = getLastEdgeDescription(pathNodeIds, edges);
        const flowName = lastEdgeDescription
          ? `Flow ${flowCounter} - ${lastEdgeDescription}`
          : `Flow ${flowCounter}`;
        const flow: Flow = {
          id: nanoid(),
          name: flowName,
          startNodeId: flowPath.startNode.id,
          endNodeId: flowPath.endNode.id,
          viaNodeIds: flowPath.nodes.slice(1, -1).map((n) => n.id), // All nodes between start and end
          pathNodeIds,
          videoUrl: undefined,
          feature_id: feature.id,
        };

        plannedFlows.push(flow);
        flowCounter++;
      });
    };

    // Process inter-feature flows first, then intra-feature flows
    processFlows(interFeaturePaths);
    processFlows(intraFeaturePaths);
  });

  return plannedFlows;
};
