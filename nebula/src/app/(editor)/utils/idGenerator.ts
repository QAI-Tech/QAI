// @ts-nocheck
import { nanoid } from "nanoid";

export type EntityType = "node" | "edge" | "feature" | "flow";

/**
 * Generates a unique ID for a specific entity type with optional prefix
 * @param entityType - The type of entity (node, edge, feature, flow)
 * @param prefix - Optional prefix (e.g., productId)
 * @returns Formatted ID string
 */
export const generateId = (
  entityType: EntityType,
  prefix?: string,
  productId?: string,
): string => {
  const id = nanoid(12); // 12 characters for excellent uniqueness
  const parts = [entityType];

  if (prefix) {
    parts.push(prefix); // Add prefix after entityType
  }
  if (productId) {
    parts.push(productId); // Add productId after prefix (if present)
  }
  parts.push(id); // Add the random id at the end

  return parts.join("-");
};

/**
 * Generates a deterministic flow ID based on the path of nodes
 * @param pathNodeIds - Array of node IDs that form the flow path
 * @returns Hash-based flow ID
 */
export const generateFlowIdFromPath = (pathNodeIds: string[]): string => {
  const pathString = pathNodeIds.join(",");
  let hash = 0;
  for (let i = 0; i < pathString.length; i++) {
    const char = pathString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `flow-${Math.abs(hash).toString(36)}`;
};

// Convenience functions for each entity type
export const generateNodeId = (prefix?: string, productId?: string) =>
  generateId("node", prefix, productId);
export const generateEdgeId = (prefix?: string, productId?: string) =>
  generateId("edge", prefix, productId);
export const generateFeatureId = (prefix?: string, productId?: string) =>
  generateId("feature", prefix, productId);
export const generateFlowId = (prefix?: string, productId?: string) =>
  generateId("flow", prefix, productId);
