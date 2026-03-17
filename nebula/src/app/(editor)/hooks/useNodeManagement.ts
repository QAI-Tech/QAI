import { useCallback, useMemo } from "react";
import { Node } from "@xyflow/react";
import { CollaborationEvents } from "../types/collaborationEvents";
import { NodeOperationsManager } from "../services/NodeOperationsManager";

interface UseNodeManagementProps {
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  collaborationEvents?: CollaborationEvents;
}

export const useNodeManagement = ({
  setNodes,
  collaborationEvents,
}: UseNodeManagementProps) => {
  // Create the NodeOperationsManager instance
  const nodeOperationsManager = useMemo(
    () => new NodeOperationsManager(setNodes, collaborationEvents),
    [setNodes, collaborationEvents],
  );

  const addNewNodes = useCallback(
    (newNodes: Node[], userId?: string) => {
      nodeOperationsManager.createNodes(newNodes, userId || "USER_ID");
    },
    [nodeOperationsManager],
  );

  const deleteNodes = useCallback(
    (nodeIds: string[], userId?: string) => {
      nodeOperationsManager.deleteNodes(nodeIds, userId || "USER_ID");
    },
    [nodeOperationsManager],
  );

  const moveNode = useCallback(
    (
      nodeId: string,
      oldPosition: { x: number; y: number },
      newPosition: { x: number; y: number },
      userId?: string,
    ) => {
      nodeOperationsManager.moveNode(
        nodeId,
        oldPosition,
        newPosition,
        userId || "USER_ID",
      );
    },
    [nodeOperationsManager],
  );

  const moveNodes = useCallback(
    (
      nodeMovements: Array<{
        nodeId: string;
        oldPosition: { x: number; y: number };
        newPosition: { x: number; y: number };
      }>,
      userId?: string,
    ) => {
      nodeOperationsManager.moveNodes(nodeMovements, userId || "USER_ID");
    },
    [nodeOperationsManager],
  );

  const updateNodeDescription = useCallback(
    (nodeId: string, newDescription: string, userId?: string) => {
      nodeOperationsManager.updateNodeDescription(
        nodeId,
        newDescription,
        userId || "USER_ID",
      );
    },
    [nodeOperationsManager],
  );

  const updateNodeImage = useCallback(
    (nodeId: string, newImage: string | undefined, userId?: string) => {
      nodeOperationsManager.updateNodeImage(
        nodeId,
        newImage,
        userId || "USER_ID",
      );
    },
    [nodeOperationsManager],
  );

  return {
    // Original method for backward compatibility
    addNewNodes,
    // New methods through the operations manager
    deleteNodes,
    moveNode,
    moveNodes,
    updateNodeDescription,
    updateNodeImage,
    // Access to the manager itself for advanced usage
    nodeOperationsManager,
  };
};
