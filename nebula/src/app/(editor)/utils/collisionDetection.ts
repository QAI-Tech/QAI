import { Node } from "@xyflow/react";
import { Feature } from "../components/FlowManager";
import { getNodeCornerPoints } from "./convexHull";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getNodeBoundingBox(
  node: Node,
  margin: number = 20,
): BoundingBox {
  const x = node.position.x;
  const y = node.position.y;

  let width = 100;
  let height = 50;

  if (node.measured?.width && node.measured?.height) {
    width = node.measured.width;
    height = node.measured.height;
  } else if (node.style?.width && node.style?.height) {
    width =
      typeof node.style.width === "string"
        ? parseFloat(node.style.width)
        : node.style.width;
    height =
      typeof node.style.height === "string"
        ? parseFloat(node.style.height)
        : node.style.height;
  } else if (node.data?.width && node.data?.height) {
    width = node.data.width as number;
    height = node.data.height as number;
  } else if (node.height) {
    height = node.height;
  }

  return {
    x: x - margin,
    y: y - margin,
    width: width + margin * 2,
    height: height + margin * 2,
  };
}

/**
 * Get bounding box for a feature (all nodes in the feature)
 */
export function getFeatureBoundingBox(
  feature: Feature,
  nodes: Node[],
  margin: number = 40,
): BoundingBox | null {
  const featureNodes = nodes.filter((node) =>
    feature.nodeIds.includes(node.id),
  );

  if (featureNodes.length === 0) {
    return null;
  }

  const allPoints = featureNodes.flatMap((node) =>
    getNodeCornerPoints(node, margin),
  );

  if (allPoints.length === 0) {
    return null;
  }

  const minX = Math.min(...allPoints.map((p) => p.x));
  const maxX = Math.max(...allPoints.map((p) => p.x));
  const minY = Math.min(...allPoints.map((p) => p.y));
  const maxY = Math.max(...allPoints.map((p) => p.y));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Check if two bounding boxes overlap
 */
export function boxesOverlap(box1: BoundingBox, box2: BoundingBox): boolean {
  return (
    box1.x < box2.x + box2.width &&
    box1.x + box1.width > box2.x &&
    box1.y < box2.y + box2.height &&
    box1.y + box1.height > box2.y
  );
}

/**
 * Check if a node overlaps with any existing nodes
 */
export function nodeOverlapsWithNodes(
  node: Node,
  existingNodes: Node[],
  margin: number = 20,
): boolean {
  const nodeBox = getNodeBoundingBox(node, margin);

  return existingNodes.some((existingNode) => {
    if (existingNode.id === node.id) return false;
    const existingBox = getNodeBoundingBox(existingNode, margin);
    return boxesOverlap(nodeBox, existingBox);
  });
}

/**
 * Check if a position would cause a node to overlap with existing nodes
 */
export function positionOverlapsWithNodes(
  position: { x: number; y: number },
  nodeWidth: number,
  nodeHeight: number,
  existingNodes: Node[],
  margin: number = 20,
): boolean {
  const testNode: Node = {
    id: "test",
    position,
    data: {},
    type: "customNode",
  };

  // Override dimensions for test
  const testBox: BoundingBox = {
    x: position.x - margin,
    y: position.y - margin,
    width: nodeWidth + margin * 2,
    height: nodeHeight + margin * 2,
  };

  return existingNodes.some((existingNode) => {
    const existingBox = getNodeBoundingBox(existingNode, margin);
    return boxesOverlap(testBox, existingBox);
  });
}

/**
 * Find a non-overlapping position for a new node
 * Uses a spiral search pattern starting from the preferred position
 */
export function findNonOverlappingPosition(
  preferredPosition: { x: number; y: number },
  nodeWidth: number,
  nodeHeight: number,
  existingNodes: Node[],
  options: {
    margin?: number;
    maxAttempts?: number;
    spacing?: number;
  } = {},
): { x: number; y: number } {
  const { margin = 20, maxAttempts = 50, spacing = 50 } = options;

  if (
    !positionOverlapsWithNodes(
      preferredPosition,
      nodeWidth,
      nodeHeight,
      existingNodes,
      margin,
    )
  ) {
    return preferredPosition;
  }

  let radius = spacing;
  let angle = 0;
  const angleStep = Math.PI / 4;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    for (let i = 0; i < 8; i++) {
      const x = preferredPosition.x + radius * Math.cos(angle);
      const y = preferredPosition.y + radius * Math.sin(angle);

      if (
        !positionOverlapsWithNodes(
          { x, y },
          nodeWidth,
          nodeHeight,
          existingNodes,
          margin,
        )
      ) {
        return { x, y };
      }

      angle += angleStep;
    }

    radius += spacing;
    angle = 0;
  }

  const maxX = Math.max(
    ...existingNodes.map((n) => n.position.x + (n.width || 100)),
    preferredPosition.x,
  );
  return {
    x: maxX + spacing * 2,
    y: preferredPosition.y,
  };
}

/**
 * Check if two features overlap
 */
export function featuresOverlap(
  feature1: Feature,
  feature2: Feature,
  nodes: Node[],
  margin: number = 40,
): boolean {
  const box1 = getFeatureBoundingBox(feature1, nodes, margin);
  const box2 = getFeatureBoundingBox(feature2, nodes, margin);

  if (!box1 || !box2) {
    return false;
  }

  return boxesOverlap(box1, box2);
}

/**
 * Get all overlapping feature pairs
 */
export function getOverlappingFeatures(
  features: Feature[],
  nodes: Node[],
  margin: number = 40,
): Array<{ feature1: Feature; feature2: Feature }> {
  const overlapping: Array<{ feature1: Feature; feature2: Feature }> = [];

  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      if (featuresOverlap(features[i], features[j], nodes, margin)) {
        overlapping.push({
          feature1: features[i],
          feature2: features[j],
        });
      }
    }
  }

  return overlapping;
}

/**
 * Calculate the minimum distance needed to separate two features
 */
export function calculateFeatureSeparation(
  feature1: Feature,
  feature2: Feature,
  nodes: Node[],
  margin: number = 40,
): { dx: number; dy: number } | null {
  const box1 = getFeatureBoundingBox(feature1, nodes, margin);
  const box2 = getFeatureBoundingBox(feature2, nodes, margin);

  if (!box1 || !box2) {
    return null;
  }

  if (!boxesOverlap(box1, box2)) {
    return { dx: 0, dy: 0 };
  }

  const overlapX = Math.min(
    box1.x + box1.width - box2.x,
    box2.x + box2.width - box1.x,
  );
  const overlapY = Math.min(
    box1.y + box1.height - box2.y,
    box2.y + box2.height - box1.y,
  );

  const center1X = box1.x + box1.width / 2;
  const center2X = box2.x + box2.width / 2;
  const center1Y = box1.y + box1.height / 2;
  const center2Y = box2.y + box2.height / 2;

  const dx =
    overlapX < overlapY
      ? center2X > center1X
        ? overlapX + margin
        : -(overlapX + margin)
      : 0;
  const dy =
    overlapX < overlapY
      ? 0
      : center2Y > center1Y
        ? overlapY + margin
        : -(overlapY + margin);

  return { dx, dy };
}

/**
 * Auto-adjust feature positions to prevent overlaps
 * Returns a map of feature IDs to their new positions (as offsets)
 */
export function autoAdjustFeaturePositions(
  features: Feature[],
  nodes: Node[],
  margin: number = 40,
): Map<string, { dx: number; dy: number }> {
  const adjustments = new Map<string, { dx: number; dy: number }>();

  const overlapping = getOverlappingFeatures(features, nodes, margin);

  for (const { feature1, feature2 } of overlapping) {
    const separation = calculateFeatureSeparation(
      feature1,
      feature2,
      nodes,
      margin,
    );

    if (separation) {
      const existing = adjustments.get(feature2.id) || { dx: 0, dy: 0 };
      adjustments.set(feature2.id, {
        dx: existing.dx + separation.dx,
        dy: existing.dy + separation.dy,
      });
    }
  }

  return adjustments;
}

/**
 * Apply feature position adjustments to nodes
 * This moves all nodes in a feature by the specified offset
 */
export function applyFeatureAdjustmentsToNodes(
  nodes: Node[],
  adjustments: Map<string, { dx: number; dy: number }>,
  featureNodeMap: Map<string, string>,
): Node[] {
  return nodes.map((node) => {
    const featureId = featureNodeMap.get(node.id);
    if (!featureId) {
      return node;
    }

    const adjustment = adjustments.get(featureId);
    if (!adjustment || (adjustment.dx === 0 && adjustment.dy === 0)) {
      return node;
    }

    return {
      ...node,
      position: {
        x: node.position.x + adjustment.dx,
        y: node.position.y + adjustment.dy,
      },
    };
  });
}

/**
 * Create a map from node IDs to feature IDs
 */
export function createNodeToFeatureMap(
  features: Feature[],
): Map<string, string> {
  const map = new Map<string, string>();

  features.forEach((feature) => {
    feature.nodeIds.forEach((nodeId) => {
      map.set(nodeId, feature.id);
    });
  });

  return map;
}
