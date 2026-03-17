// @ts-nocheck
import { useCallback } from "react";
import { Node, Edge } from "@xyflow/react";
import { UseGraphEventHandlersProps } from "../types/graphHandlers";
import { usePlanFlowHandlers } from "./usePlanFlowHandlers";
import { useFeatureHandlers } from "./useFeatureHandlers";
import { useEdgeHandlers } from "./useEdgeHandlers";
import { useDeletionHandlers } from "./useDeletionHandlers";

export const useGraphEventHandlers = ({
  nodes,
  edges,
  setNodes,
  setEdges,
  mode,
  setMode,
  edgeSource,
  setEdgeSource,
  edgeCounter,
  setEdgeCounter,
  planFlowState,
  setPlanFlowState,
  flowManagement,
  undoRedo,
  camera,
  deleteManagement,
  featureManagement,
  editingFeatureId,
  selectedEdge,
  setSelectedEdge,
}: UseGraphEventHandlersProps) => {
  // Initialize all handler hooks
  const planFlowHandlers = usePlanFlowHandlers({
    nodes,
    edges,
    setNodes,
    setEdges,
    mode,
    setMode,
    undoRedo,
    planFlowState,
    setPlanFlowState,
    flowManagement,
  });

  const featureHandlers = useFeatureHandlers({
    nodes,
    edges,
    setNodes,
    setEdges,
    mode,
    setMode,
    undoRedo,
    featureManagement,
    editingFeatureId,
  });

  const edgeHandlers = useEdgeHandlers({
    nodes,
    edges,
    setNodes,
    setEdges,
    mode,
    setMode,
    undoRedo,
    edgeSource,
    setEdgeSource,
    edgeCounter,
    setEdgeCounter,
    setSelectedEdge,
  });

  const deletionHandlers = useDeletionHandlers({
    nodes,
    edges,
    setNodes,
    setEdges,
    mode,
    setMode,
    undoRedo,
    deleteManagement,
  });

  // Main node click orchestrator
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.stopPropagation();

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("graphCanvasInteraction"));
      }

      // Clear edge selection when clicking on a node
      setSelectedEdge(null);

      // Check if this is a collapsed node that should expand the feature
      if ((node.data as any)?.isCollapsed) {
        // Find the feature this node belongs to and expand it
        const feature = featureManagement?.features.find((f) =>
          f.nodeIds.includes(node.id),
        );
        if (feature && (feature as any).isCollapsed) {
          // Dispatch event to expand the feature
          window.dispatchEvent(
            new CustomEvent("expandCollapsedFeature", {
              detail: { featureId: feature.id },
            }),
          );
          return;
        }
      }

      if (mode === "planFlow") {
        planFlowHandlers.handlePlanFlowNodeClick(node);
        return;
      }

      if (mode === "addFeature") {
        featureHandlers.handleFeatureNodeClick(node);
        return;
      }

      if (mode === "addEdge") {
        edgeHandlers.handleEdgeNodeClick(node);
        return;
      }
    },
    [
      mode,
      planFlowHandlers.handlePlanFlowNodeClick,
      featureHandlers.handleFeatureNodeClick,
      edgeHandlers.handleEdgeNodeClick,
      featureManagement,
      setSelectedEdge,
    ],
  );

  // Edge click handler
  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.stopPropagation();

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("graphCanvasInteraction"));
      }

      setSelectedEdge(edge);
    },
    [setSelectedEdge],
  );

  // Canvas click handler to clear edge selection and handle node creation
  const onCanvasClick = useCallback(
    (event: React.MouseEvent) => {
      // Clear edge selection when clicking on canvas
      setSelectedEdge(null);
    },
    [setSelectedEdge],
  );

  return {
    onNodeClick,
    onEdgeClick,
    onCanvasClick,
    onConnect: edgeHandlers.onConnect,
    onReconnect: edgeHandlers.onReconnect,
    confirmDeletion: deletionHandlers.confirmDeletion,
    handlePlanFlowNodeClick: planFlowHandlers.handlePlanFlowNodeClick,
  };
};
