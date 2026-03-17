// @ts-nocheck
import { useState, useCallback } from "react";
import { Node, Edge } from "@xyflow/react";
import { useToast } from "@/hooks/use-toast";
import { ConsoleCollaborationEvents } from "../types/collaborationEvents";

interface GraphState {
  nodes: Node[];
  edges: Edge[];
}

export const useUndoRedo = (
  nodes: Node[],
  edges: Edge[],
  setNodes: (nodes: Node[]) => void,
  setEdges: (edges: Edge[]) => void,
  productId: string,
) => {
  const [previousState, setPreviousState] = useState<GraphState | null>(null);
  const [redoState, setRedoState] = useState<GraphState | null>(null);
  const { toast } = useToast();

  // Helper function to emit collaboration events for state changes
  const emitStateChangeEvents = useCallback(
    (
      oldNodes: Node[],
      newNodes: Node[],
      oldEdges: Edge[],
      newEdges: Edge[],
      action: "undo" | "redo",
    ) => {
      if (!productId) {
        console.warn("No productId available for collaboration events");
        return;
      }

      console.log(`🔍 ${action.toUpperCase()} - Analyzing state differences:`);
      console.log(
        `  Old nodes: ${oldNodes.length}, New nodes: ${newNodes.length}`,
      );
      console.log(
        `  Old edges: ${oldEdges.length}, New edges: ${newEdges.length}`,
      );

      const collaborationEvents =
        ConsoleCollaborationEvents.initializeForProduct(productId);

      // Calculate node differences
      const oldNodeMap = new Map(oldNodes.map((n) => [n.id, n]));
      const newNodeMap = new Map(newNodes.map((n) => [n.id, n]));

      // Nodes to delete (in old but not in new)
      const nodesToDelete = oldNodes.filter((n) => !newNodeMap.has(n.id));
      if (nodesToDelete.length > 0) {
        const deleteData = nodesToDelete.map((node) => ({
          nodeId: node.id,
          position: node.position,
          data: node.data,
        }));
        collaborationEvents.deleteNodes(
          deleteData,
          `${action.toUpperCase()}_USER`,
        );
      }

      // Nodes to create (in new but not in old)
      const nodesToCreate = newNodes.filter((n) => !oldNodeMap.has(n.id));
      if (nodesToCreate.length > 0) {
        const createData = nodesToCreate.map((node) => ({
          nodeId: node.id,
          position: node.position,
          data: node.data,
        }));
        collaborationEvents.createNodes(
          createData,
          `${action.toUpperCase()}_USER`,
        );
      }

      // Nodes to update (in both but different)
      const nodesToUpdate = newNodes.filter((newNode) => {
        const oldNode = oldNodeMap.get(newNode.id);
        return (
          oldNode &&
          (JSON.stringify(oldNode.position) !==
            JSON.stringify(newNode.position) ||
            JSON.stringify(oldNode.data) !== JSON.stringify(newNode.data))
        );
      });
      if (nodesToUpdate.length > 0) {
        const updateData = nodesToUpdate.map((newNode) => {
          const oldNode = oldNodeMap.get(newNode.id)!;
          return {
            nodeId: newNode.id,
            updates: {
              ...(JSON.stringify(oldNode.position) !==
                JSON.stringify(newNode.position) && {
                position: { old: oldNode.position, new: newNode.position },
              }),
              ...(JSON.stringify(oldNode.data) !==
                JSON.stringify(newNode.data) && {
                description: {
                  old: oldNode.data?.description || "",
                  new: newNode.data?.description || "",
                },
              }),
            },
          };
        });
        collaborationEvents.updateNodes(
          updateData,
          `${action.toUpperCase()}_USER`,
        );
      }

      // Calculate edge differences
      const oldEdgeMap = new Map(oldEdges.map((e) => [e.id, e]));
      const newEdgeMap = new Map(newEdges.map((e) => [e.id, e]));

      // Edges to delete (in old but not in new)
      const edgesToDelete = oldEdges.filter((e) => !newEdgeMap.has(e.id));
      if (edgesToDelete.length > 0) {
        const deleteData = edgesToDelete.map((edge) => ({
          edgeId: edge.id,
          sourceNodeId: edge.source,
          targetNodeId: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          data: edge.data,
        }));
        collaborationEvents.deleteEdges(
          deleteData,
          `${action.toUpperCase()}_USER`,
        );
      }

      // Edges to create (in new but not in old)
      const edgesToCreate = newEdges.filter((e) => !oldEdgeMap.has(e.id));
      if (edgesToCreate.length > 0) {
        const createData = edgesToCreate.map((edge) => ({
          edgeId: edge.id,
          sourceNodeId: edge.source,
          targetNodeId: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          data: edge.data,
        }));
        collaborationEvents.createEdges(
          createData,
          `${action.toUpperCase()}_USER`,
        );
      }
    },
    [productId],
  );

  const saveState = useCallback(() => {
    setPreviousState({ nodes: [...nodes], edges: [...edges] });
    setRedoState(null); // Clear redo when new action is performed
  }, [nodes, edges]);

  const undo = useCallback(() => {
    if (previousState) {
      console.log("🔙 Undo operation triggered - state change detected");

      // Save current state for redo
      setRedoState({ nodes: [...nodes], edges: [...edges] });

      // Emit collaboration events for the changes
      emitStateChangeEvents(
        nodes,
        previousState.nodes,
        edges,
        previousState.edges,
        "undo",
      );

      // Restore previous state
      setNodes(previousState.nodes);
      setEdges(previousState.edges);
      setPreviousState(null);

      toast({
        title: "Undone",
        description: "Last action has been undone.",
      });
    }
  }, [
    previousState,
    nodes,
    edges,
    setNodes,
    setEdges,
    toast,
    emitStateChangeEvents,
  ]);

  const redo = useCallback(() => {
    if (redoState) {
      console.log("🔄 Redo operation triggered - state change detected");

      // Save current state as previous
      setPreviousState({ nodes: [...nodes], edges: [...edges] });

      // Emit collaboration events for the changes
      emitStateChangeEvents(
        nodes,
        redoState.nodes,
        edges,
        redoState.edges,
        "redo",
      );

      // Restore redo state
      setNodes(redoState.nodes);
      setEdges(redoState.edges);
      setRedoState(null);

      toast({
        title: "Redone",
        description: "Last undone action has been redone.",
      });
    }
  }, [
    redoState,
    nodes,
    edges,
    setNodes,
    setEdges,
    toast,
    emitStateChangeEvents,
  ]);

  return {
    saveState,
    undo,
    redo,
    canUndo: previousState !== null,
    canRedo: redoState !== null,
  };
};
