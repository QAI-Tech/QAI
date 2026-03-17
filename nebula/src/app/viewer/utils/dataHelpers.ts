import type { GraphData } from "../types/carousel";

/**
 * Gets the outgoing edge description for the current node
 */
export function getOutgoingEdgeDescription(
  graphData: GraphData,
  currentNodeIndex: number,
): string {
  const currentNode = graphData.nodes[currentNodeIndex];

  if (!currentNode) {
    return "Next";
  }

  // Find edge where source is current node
  const outgoingEdge = graphData.edges.find(
    (edge) => edge.source === currentNode.id,
  );

  return outgoingEdge ? outgoingEdge.data.description : "Next";
}

/**
 * Gets the description of the current node
 */
export function getCurrentNodeDescription(
  graphData: GraphData,
  currentNodeIndex: number,
): string {
  return graphData.nodes[currentNodeIndex]?.data.description || "";
}
