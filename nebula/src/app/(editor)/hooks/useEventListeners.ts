// @ts-nocheck
import { useEffect, useCallback } from "react";
import { Node, Edge } from "@xyflow/react";

interface UseEventListenersProps {
  nodes: Node[];
  edges: Edge[];
  setNodes: (updater: (nodes: Node[]) => Node[]) => void;
  setEdges: (updater: (edges: Edge[]) => Edge[]) => void;
  setEditingNode: (node: { id: string; data: any } | null) => void;
  setEditingEdge: (edge: { id: string; data: any } | null) => void;
  setEditNodeDescription: (description: string) => void;
  setEditNodeImage: (image: string) => void;
  setEditEdgeDescription: (description: string) => void;
  setInlineEditingEdges: (updater: (edges: Set<string>) => Set<string>) => void;
  setCursorPosition: (position: { x: number; y: number }) => void;
  setIsPanning: (panning: boolean) => void;
  setLastPanPosition: (position: { x: number; y: number } | null) => void;
  screenToFlowPosition: (screenPosition: { x: number; y: number }) => {
    x: number;
    y: number;
  };
  saveState: () => void;
  onDelete: (selectedNodes: Node[], selectedEdges: Edge[]) => void;
  commentManagement?: {
    deleteComment: (commentId: string) => void;
    updateComment: (commentId: string, content: string) => void;
  };
}

export const useEventListeners = ({
  nodes,
  edges,
  setNodes,
  setEdges,
  setEditingNode,
  setEditingEdge,
  setEditNodeDescription,
  setEditNodeImage,
  setEditEdgeDescription,
  setInlineEditingEdges,
  setCursorPosition,
  setIsPanning,
  setLastPanPosition,
  screenToFlowPosition,
  saveState,
  onDelete,
  commentManagement,
}: UseEventListenersProps) => {
  // Custom event handlers for node/edge editing
  useEffect(() => {
    const handleEditNode = (event: CustomEvent) => {
      const { nodeId, data } = event.detail;

      console.log(
        "handleEditNode triggered for node:",
        nodeId,
        "clearing all selections",
      );

      // Store which node was selected before editing and unselect all nodes
      const selectedNode = nodes.find((node) => node.selected);
      if (selectedNode) {
        setNodes((nds) => nds.map((node) => ({ ...node, selected: false })));
      }

      setEditingNode({ id: nodeId, data });
      setEditNodeDescription(data?.description || "");
      setEditNodeImage(data?.image || "");
    };

    const handleEditEdge = (event: CustomEvent) => {
      const { edgeId, data } = event.detail;
      setEditingEdge({ id: edgeId, data });
      setEditEdgeDescription(data?.description || "");
    };

    const handleInlineEdgeEditStart = (event: CustomEvent) => {
      const { edgeId } = event.detail;
      setInlineEditingEdges((prev) => new Set(prev).add(edgeId));
    };

    const handleInlineEdgeEditEnd = (event: CustomEvent) => {
      const { edgeId } = event.detail;
      setInlineEditingEdges((prev) => {
        const newSet = new Set(prev);
        newSet.delete(edgeId);
        return newSet;
      });
    };

    const handleSaveStateBeforeEdit = () => {
      saveState();
    };

    const handleNodeDelete = (event: CustomEvent) => {
      const { nodeId } = event.detail;
      const selectedNodes = nodes.filter((node) => node.id === nodeId);
      const selectedEdges = edges.filter((edge) => edge.selected);

      if (selectedNodes.length > 0) {
        onDelete(selectedNodes, selectedEdges);
      }
    };

    const handleCommentDelete = (event: CustomEvent) => {
      const { commentId } = event.detail;
      if (commentId && commentManagement?.deleteComment) {
        console.log("Deleting comment from state:", commentId);
        commentManagement.deleteComment(commentId);
      }
    };

    const handleCommentUpdate = (event: CustomEvent) => {
      const { commentId, content } = event.detail;
      if (
        commentId &&
        content !== undefined &&
        commentManagement?.updateComment
      ) {
        console.log("Updating comment in state:", commentId, content);
        commentManagement.updateComment(commentId, content);
      }
    };

    // Register event listeners
    window.addEventListener("editNode", handleEditNode as EventListener);
    window.addEventListener("editEdge", handleEditEdge as EventListener);
    window.addEventListener(
      "inlineEdgeEditStart",
      handleInlineEdgeEditStart as EventListener,
    );
    window.addEventListener(
      "inlineEdgeEditEnd",
      handleInlineEdgeEditEnd as EventListener,
    );
    window.addEventListener(
      "saveStateBeforeEdit",
      handleSaveStateBeforeEdit as EventListener,
    );
    window.addEventListener("nodeDelete", handleNodeDelete as EventListener);
    window.addEventListener(
      "commentDelete",
      handleCommentDelete as EventListener,
    );
    window.addEventListener(
      "commentUpdate",
      handleCommentUpdate as EventListener,
    );

    return () => {
      window.removeEventListener("editNode", handleEditNode as EventListener);
      window.removeEventListener("editEdge", handleEditEdge as EventListener);
      window.removeEventListener(
        "inlineEdgeEditStart",
        handleInlineEdgeEditStart as EventListener,
      );
      window.removeEventListener(
        "inlineEdgeEditEnd",
        handleInlineEdgeEditEnd as EventListener,
      );
      window.removeEventListener(
        "saveStateBeforeEdit",
        handleSaveStateBeforeEdit as EventListener,
      );
      window.removeEventListener(
        "nodeDelete",
        handleNodeDelete as EventListener,
      );
      window.removeEventListener(
        "commentDelete",
        handleCommentDelete as EventListener,
      );
      window.removeEventListener(
        "commentUpdate",
        handleCommentUpdate as EventListener,
      );
    };
  }, [
    nodes,
    edges,
    setNodes,
    setEditingNode,
    setEditingEdge,
    setEditNodeDescription,
    setEditNodeImage,
    setEditEdgeDescription,
    setInlineEditingEdges,
    saveState,
    onDelete,
    commentManagement,
  ]);

  // Global mouse tracking for paste functionality and panning
  useEffect(() => {
    const handleGlobalMouseMove = (event: MouseEvent) => {
      // Use screenToFlowPosition to get the correct flow coordinates for pasting
      const flowPosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setCursorPosition(flowPosition);
    };

    const handleGlobalMouseUp = () => {
      setIsPanning(false);
      setLastPanPosition(null);
    };

    document.addEventListener("mousemove", handleGlobalMouseMove);
    document.addEventListener("mouseup", handleGlobalMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleGlobalMouseMove);
      document.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [
    screenToFlowPosition,
    setCursorPosition,
    setIsPanning,
    setLastPanPosition,
  ]);
};
