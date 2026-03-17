import { useState, useCallback } from "react";
import { Node, Edge } from "@xyflow/react";
import { CustomEdgeData } from "@/app/(editor)/types/graphHandlers";
import { ConsoleCollaborationEvents } from "@/app/(editor)/types/collaborationEvents";
import { Flow } from "../components/FlowManager";

interface NodeMergeState {
  isDragging: boolean;
  draggedNodeId: string | null;
  dropTargetId: string | null;
  isValidDropTarget: boolean;
  draggedNodeOriginalPosition: { x: number; y: number } | null;
}

interface MergeConfirmationState {
  isOpen: boolean;
  draggedNodeId: string | null;
  targetNodeId: string | null;
}

interface UseNodeMergeProps {
  nodes: Node[];
  edges: Edge[];
  flows: Flow[];
  setFlows: (flows: Flow[]) => void;
  saveState: () => void;
  onNodesChange: (changes: any) => void;
  onEdgesChange: (changes: any) => void;
}

export const useNodeMerge = ({
  nodes,
  edges,
  flows,
  setFlows,
  saveState,
  onNodesChange,
  onEdgesChange,
}: UseNodeMergeProps) => {
  const [mergeState, setMergeState] = useState<NodeMergeState>({
    isDragging: false,
    draggedNodeId: null,
    dropTargetId: null,
    isValidDropTarget: false,
    draggedNodeOriginalPosition: null,
  });

  const [confirmationState, setConfirmationState] =
    useState<MergeConfirmationState>({
      isOpen: false,
      draggedNodeId: null,
      targetNodeId: null,
    });

  const canMergeNodes = useCallback(
    (draggedNodeId: string, targetNodeId: string) => {
      if (draggedNodeId === targetNodeId) return false;

      const draggedNode = nodes.find((n) => n.id === draggedNodeId);
      const targetNode = nodes.find((n) => n.id === targetNodeId);

      if (!draggedNode || !targetNode) return false;

      if (
        draggedNode.type !== "customNode" ||
        targetNode.type !== "customNode"
      ) {
        return false;
      }

      return true;
    },
    [nodes],
  );

  const getConnectedEdges = useCallback(
    (nodeId: string) => {
      return edges.filter(
        (edge) => edge.source === nodeId || edge.target === nodeId,
      );
    },
    [edges],
  );

  const mergeNodes = useCallback(
    (draggedNodeId: string, targetNodeId: string) => {
      if (!canMergeNodes(draggedNodeId, targetNodeId)) {
        console.warn("Cannot merge nodes:", draggedNodeId, targetNodeId);
        return false;
      }

      saveState();

      const connectedEdges = getConnectedEdges(draggedNodeId);

      const edgeChanges: any[] = [];
      const nodeChanges: any[] = [];
      const createdEdges: Edge[] = [];
      const deletedEdgeIds: string[] = [];

      connectedEdges.forEach((edge) => {
        const isOutgoing = edge.source === draggedNodeId;
        const isIncoming = edge.target === draggedNodeId;

        if (isOutgoing) {
          edgeChanges.push({
            type: "remove",
            id: edge.id,
          });

          const newEdge: Edge = {
            ...edge,
            id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            source: targetNodeId,
          };
          edgeChanges.push({
            type: "add",
            item: newEdge,
          });
          createdEdges.push(newEdge);
          deletedEdgeIds.push(edge.id);
        } else if (isIncoming) {
          edgeChanges.push({
            type: "remove",
            id: edge.id,
          });

          const newEdge: Edge = {
            ...edge,
            id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            target: targetNodeId,
          };
          edgeChanges.push({
            type: "add",
            item: newEdge,
          });
          createdEdges.push(newEdge);
          deletedEdgeIds.push(edge.id);
        }
      });

      const existingEdges = edges.filter(
        (edge) =>
          edge.source !== draggedNodeId && edge.target !== draggedNodeId,
      );

      const filteredNewEdges = edgeChanges
        .filter((change) => change.type === "add")
        .map((change) => change.item)
        .filter((newEdge) => {
          if ((newEdge as any).source === (newEdge as any).target) return false;
          return !existingEdges.some(
            (existingEdge) =>
              existingEdge.source === newEdge.source &&
              existingEdge.target === newEdge.target,
          );
        });

      const addChanges = edgeChanges.filter((change) => change.type !== "add");
      filteredNewEdges.forEach((edge) => {
        addChanges.push({
          type: "add",
          item: edge,
        });
      });

      edgeChanges.length = 0;
      edgeChanges.push(...addChanges);

      nodeChanges.push({
        type: "remove",
        id: draggedNodeId,
      });

      if (edgeChanges.length > 0) {
        onEdgesChange(edgeChanges);
      }
      if (nodeChanges.length > 0) {
        onNodesChange(nodeChanges);
      }

      // Update flows
      const updatedFlows = flows.map((flow) => {
        let hasChanges = false;
        const newFlow = { ...flow };

        if (newFlow.startNodeId === draggedNodeId) {
          newFlow.startNodeId = targetNodeId;
          hasChanges = true;
        }
        if (newFlow.endNodeId === draggedNodeId) {
          newFlow.endNodeId = targetNodeId;
          hasChanges = true;
        }
        if (newFlow.viaNodeIds.includes(draggedNodeId)) {
          newFlow.viaNodeIds = newFlow.viaNodeIds.filter(
            (id) => id !== draggedNodeId,
          );
          hasChanges = true;
        }
        if (newFlow.pathNodeIds.includes(draggedNodeId)) {
          newFlow.pathNodeIds = newFlow.pathNodeIds.reduce(
            (acc: string[], id) => {
              if (id === draggedNodeId) {
                if (
                  flow.startNodeId === draggedNodeId ||
                  flow.endNodeId === draggedNodeId
                ) {
                  acc.push(targetNodeId);
                } else {
                  acc.push(targetNodeId);
                }
              } else {
                acc.push(id);
              }
              return acc;
            },
            [],
          );
          newFlow.pathNodeIds = Array.from(new Set(newFlow.pathNodeIds));
          hasChanges = true;
        }

        return hasChanges ? newFlow : flow;
      });
      const changedFlows = updatedFlows.filter(
        (flow, index) => flow !== flows[index],
      );

      if (changedFlows.length > 0) {
        setFlows(updatedFlows);
      }

      // --- Emit collaboration events ---
      const collab = new ConsoleCollaborationEvents();
      if (changedFlows.length > 0) {
        collab.updateFlows(updatedFlows);
      }
      if (createdEdges.length > 0) {
        collab.createEdges(
          createdEdges.map((edge) => ({
            edgeId: edge.id,
            sourceNodeId: edge.source,
            targetNodeId: edge.target,
            sourceHandle: edge.sourceHandle || undefined,
            targetHandle: edge.targetHandle || undefined,
            data: (edge.data || {}) as CustomEdgeData,
          })),
        );
      }
      if (deletedEdgeIds.length > 0) {
        collab.deleteEdges(
          deletedEdgeIds.map((id) => ({
            edgeId: id,
            sourceNodeId: "",
            targetNodeId: "",
            sourceHandle: undefined,
            targetHandle: undefined,
            data: {},
          })),
        );
      }
      collab.deleteNodes([
        {
          nodeId: draggedNodeId,
          position: { x: 0, y: 0 }, // Position is not relevant for deletion
          data: { description: "" }, // Provide required property for CustomNodeData
        },
      ]);
      // --- End collaboration events ---

      console.log(
        `Successfully merged node ${draggedNodeId} into ${targetNodeId}`,
      );
      console.log(
        `Removed ${connectedEdges.length} edges and created ${filteredNewEdges.length} new edges`,
      );

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("showToast", {
            detail: {
              title: "Nodes Merged",
              description: `Successfully merged nodes and reassigned ${filteredNewEdges.length} connections`,
              type: "success",
            },
          }),
        );
      }

      return true;
    },
    [
      canMergeNodes,
      getConnectedEdges,
      onNodesChange,
      onEdgesChange,
      saveState,
      edges,
      flows,
      setFlows,
    ],
  );

  const beginDrag = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      setMergeState({
        isDragging: true,
        draggedNodeId: nodeId,
        dropTargetId: null,
        isValidDropTarget: false,
        draggedNodeOriginalPosition: node?.position || null,
      });
    },
    [nodes],
  );

  const setDropTarget = useCallback(
    (targetNodeId: string | null) => {
      if (!mergeState.isDragging || !mergeState.draggedNodeId) return;

      if (!targetNodeId) {
        setMergeState((prev) => ({
          ...prev,
          dropTargetId: null,
          isValidDropTarget: false,
        }));
        return;
      }

      const canMerge = canMergeNodes(mergeState.draggedNodeId, targetNodeId);
      setMergeState((prev) => ({
        ...prev,
        dropTargetId: targetNodeId,
        isValidDropTarget: canMerge,
      }));
    },
    [mergeState.isDragging, mergeState.draggedNodeId, canMergeNodes],
  );

  const clearDropTarget = useCallback(() => {
    setMergeState((prev) => ({
      ...prev,
      dropTargetId: null,
      isValidDropTarget: false,
    }));
  }, []);

  const restoreOriginalPosition = useCallback(() => {
    if (mergeState.draggedNodeId && mergeState.draggedNodeOriginalPosition) {
      onNodesChange([
        {
          type: "position",
          id: mergeState.draggedNodeId,
          position: mergeState.draggedNodeOriginalPosition,
        },
      ]);
    }
  }, [
    mergeState.draggedNodeId,
    mergeState.draggedNodeOriginalPosition,
    onNodesChange,
  ]);

  const finishDrag = useCallback(() => {
    setMergeState({
      isDragging: false,
      draggedNodeId: null,
      dropTargetId: null,
      isValidDropTarget: false,
      draggedNodeOriginalPosition: null,
    });
  }, []);

  const cancelDrag = finishDrag;

  const requestMerge = useCallback(
    (draggedNodeId: string, targetNodeId: string) => {
      if (!canMergeNodes(draggedNodeId, targetNodeId)) {
        return;
      }

      setConfirmationState({
        isOpen: true,
        draggedNodeId,
        targetNodeId,
      });
    },
    [canMergeNodes],
  );

  const confirmMerge = useCallback(() => {
    if (confirmationState.draggedNodeId && confirmationState.targetNodeId) {
      mergeNodes(
        confirmationState.draggedNodeId,
        confirmationState.targetNodeId,
      );
    }
    setConfirmationState({
      isOpen: false,
      draggedNodeId: null,
      targetNodeId: null,
    });
    finishDrag();
  }, [
    confirmationState.draggedNodeId,
    confirmationState.targetNodeId,
    mergeNodes,
    finishDrag,
  ]);

  const cancelMerge = useCallback(() => {
    restoreOriginalPosition();
    setConfirmationState({
      isOpen: false,
      draggedNodeId: null,
      targetNodeId: null,
    });
    finishDrag();
  }, [restoreOriginalPosition, finishDrag]);

  return {
    mergeState,
    confirmationState,
    canMergeNodes,
    mergeNodes,
    beginDrag,
    setDropTarget,
    clearDropTarget,
    finishDrag,
    cancelDrag,
    requestMerge,
    confirmMerge,
    cancelMerge,
  };
};
