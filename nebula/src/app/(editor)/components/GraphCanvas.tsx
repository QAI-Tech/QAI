// @ts-nocheck
import React, { useMemo, useRef, useEffect } from "react";
import {
  ReactFlow,
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  SelectionMode,
  BackgroundVariant,
  MarkerType,
  useReactFlow,
} from "@xyflow/react";
import CustomNode from "./CustomNode";
import CustomEdge from "./CustomEdge";
import CommentNode from "./CommentNode";
import { ConvexHull } from "./ConvexHull";
import { Flow } from "./FlowManager";
import { PlanFlowState } from "./PlanFlowManager";
import { getNodeStyle, getEdgeStyle } from "../utils/styleUtils";
import NodePreview from "./NodePreview";
import { useNodePreview } from "../hooks/useNodePreview";
import { useNodeMerge } from "../hooks/useNodeMerge";
import { ConfirmationDialog } from "@/components/global/delete-confirmation-dialog";

const nodeTypes = {
  customNode: CustomNode,
  commentNode: CommentNode,
};

const edgeTypes = {
  customEdge: CustomEdge,
};

interface GraphCanvasProps {
  nodes: Node[];
  edges: Edge[];
  flows: Flow[];
  selectedFlowId: string | null;
  hoveredFlowId?: string | null;
  mode:
    | "select"
    | "addNode"
    | "addEdge"
    | "planFlow"
    | "groupPreview"
    | "addFeature"
    | "addComment"
    | "addWildcardNode"
    | "addBugNode";
  planFlowState: PlanFlowState;
  visibleFeatures?: any[];
  allNodes?: Node[];
  editingFeatureId?: string | null;
  isFlashingUncovered?: boolean;
  isFlashingEntryPoints?: boolean;
  isFlashingSearchResult?: boolean;
  searchResultId?: string | null;
  flowChain?: Flow[];
  screenPreviewEnabled: boolean;
  onNodesChange: (changes: any) => void;
  onNodeDragStart?: (event: React.MouseEvent, node: Node) => void;
  onNodeDragStop?: (event: React.MouseEvent, node: Node) => void;
  onSelectionDragStart?: (
    event: MouseEvent | React.MouseEvent,
    nodes: Node[],
  ) => void;
  onSelectionDragStop?: (
    event: MouseEvent | React.MouseEvent,
    nodes: Node[],
  ) => void;
  onEdgesChange: (changes: any) => void;
  onConnect: (connection: any) => void;
  onReconnect: (oldEdge: Edge, newConnection: any) => void;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onEdgeClick: (event: React.MouseEvent, edge: Edge) => void;
  onCanvasClick: (event: React.MouseEvent) => void;
  onMouseDown: (event: React.MouseEvent) => void;
  onMouseMove: (event: React.MouseEvent) => void;
  onMouseUp: (event: React.MouseEvent) => void;
  onContextMenu: (event: React.MouseEvent) => void;
  setFlows: (flows: Flow[]) => void;
  saveState?: () => void;
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  nodes,
  edges,
  flows,
  setFlows,
  selectedFlowId,
  hoveredFlowId = null,
  mode,
  planFlowState,
  visibleFeatures = [],
  allNodes = [],
  editingFeatureId = null,
  isFlashingUncovered = false,
  isFlashingEntryPoints = false,
  isFlashingSearchResult = false,
  searchResultId = null,
  flowChain = [],
  screenPreviewEnabled,
  onNodesChange,
  onNodeDragStart,
  onNodeDragStop,
  onSelectionDragStart,
  onSelectionDragStop,
  onEdgesChange,
  onConnect,
  onReconnect,
  onNodeClick,
  onEdgeClick,
  onCanvasClick,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onContextMenu,
  saveState = () => {},
}) => {
  const reactFlowWrapperRef = useRef<HTMLDivElement>(null);
  const { getIntersectingNodes } = useReactFlow();

  // Node preview functionality
  const {
    previewNode,
    isPreviewVisible,
    canvasHeight,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
    setCanvasHeight,
  } = useNodePreview(screenPreviewEnabled);

  const {
    mergeState,
    confirmationState,
    beginDrag,
    setDropTarget,
    clearDropTarget,
    finishDrag,
    cancelDrag,
    requestMerge,
    confirmMerge,
    cancelMerge,
  } = useNodeMerge({
    nodes,
    edges,
    flows,
    setFlows,
    saveState,
    onNodesChange,
    onEdgesChange,
  });

  // Calculate entry points
  const entryPointIds = useMemo(() => {
    return nodes
      .filter((node) => {
        const hasIncomingEdges = edges.some((edge) => edge.target === node.id);
        const hasOutgoingEdges = edges.some((edge) => edge.source === node.id);
        return !hasIncomingEdges && hasOutgoingEdges;
      })
      .map((node) => node.id);
  }, [nodes, edges]);

  // Apply flow visualization styles to nodes and edges
  const styledNodes = useMemo(() => {
    return nodes.map((node) => {
      const flowStyle = getNodeStyle(
        node,
        flows,
        selectedFlowId,
        hoveredFlowId,
        mode,
        planFlowState,
        isFlashingUncovered,
        isFlashingEntryPoints,
        entryPointIds,
        flowChain,
        isFlashingSearchResult,
        searchResultId,
      );

      const isDropTarget =
        mergeState.dropTargetId === node.id && mergeState.isValidDropTarget;
      const isBeingDragged = mergeState.draggedNodeId === node.id;

      return {
        ...node,
        data: {
          ...node.data,
          flowStyle: flowStyle, // Pass style info through data
          mergeState: {
            isDropTarget,
            isBeingDragged,
            isDragging: mergeState.isDragging,
          },
        },
        style: {
          ...node.style,
          ...flowStyle,
          ...(isDropTarget && {
            border: "2px solid #10b981",
            boxShadow: "0 0 10px rgba(16, 185, 129, 0.5)",
          }),
          ...(isBeingDragged && {
            opacity: 0.7,
          }),
        },
      };
    });
  }, [
    nodes,
    flows,
    selectedFlowId,
    hoveredFlowId,
    mode,
    planFlowState,
    isFlashingUncovered,
    isFlashingEntryPoints,
    entryPointIds,
    flowChain,
    isFlashingSearchResult,
    searchResultId,
    mergeState,
  ]);

  const styledEdges = useMemo(() => {
    // Sort edges so selected ones come last (rendered on top)
    const sortedEdges = [...edges].sort((a, b) => {
      if (a.selected && !b.selected) return 1; // Selected edges go to end (on top)
      if (!a.selected && b.selected) return -1;
      return 0;
    });

    return sortedEdges.map((edge) => {
      const edgeStyle = getEdgeStyle(
        edge,
        flows,
        selectedFlowId,
        hoveredFlowId,
        mode,
        planFlowState,
        nodes,
        edges,
        isFlashingUncovered,
        isFlashingEntryPoints,
        entryPointIds,
        flowChain,
        isFlashingSearchResult,
        searchResultId,
      );

      // Get the stroke color for the marker
      const strokeColor =
        (edgeStyle as any)?.stroke || (edge.selected ? "#ef4444" : "#6b7280");

      return {
        ...edge,
        style: {
          ...edge.style,
          ...edgeStyle,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
          width: 20,
          height: 20,
        },
      };
    });
  }, [
    edges,
    flows,
    selectedFlowId,
    hoveredFlowId,
    mode,
    planFlowState,
    nodes,
    isFlashingUncovered,
    isFlashingEntryPoints,
    entryPointIds,
    flowChain,
    isFlashingSearchResult,
    searchResultId,
  ]);

  // Check if any edges are selected to conditionally enable reconnection
  const hasSelectedEdges = styledEdges.some((edge) => edge.selected);

  // Get selected nodes for convex hull
  const selectedNodes = styledNodes.filter((node) => node.selected);

  // Update canvas height when component mounts or resizes
  useEffect(() => {
    const updateCanvasHeight = () => {
      if (reactFlowWrapperRef.current) {
        const height = reactFlowWrapperRef.current.clientHeight;

        setCanvasHeight(height);
      }
    };

    updateCanvasHeight();
    window.addEventListener("resize", updateCanvasHeight);

    return () => {
      window.removeEventListener("resize", updateCanvasHeight);
    };
  }, [setCanvasHeight]);

  return (
    <div
      className={`flex-1 relative ${mode === "addComment" || mode === "addWildcardNode" || mode === "addBugNode" ? "cursor-crosshair" : ""}`}
      ref={reactFlowWrapperRef}
      onMouseDown={(e) => onMouseDown?.(e)}
      onMouseMove={(e) => onMouseMove?.(e)}
      onMouseUp={(e) => onMouseUp?.(e)}
    >
      <ConvexHull
        selectedNodes={selectedNodes}
        mode={mode}
        visibleFeatures={visibleFeatures}
        allNodes={allNodes.length > 0 ? allNodes : styledNodes}
        edges={edges}
        flows={flows}
        editingFeatureId={editingFeatureId}
      />
      <ReactFlow
        nodes={styledNodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onNodeDragStart={(event, node) => {
          if (onNodeDragStart) {
            onNodeDragStart(event, node);
          }
          beginDrag(node.id);
        }}
        onNodeDragStop={(event, node) => {
          // First call the collaboration events handler from props
          if (onNodeDragStop) {
            onNodeDragStop(event, node);
          }

          // Then handle node merging logic
          if (mode === "select") {
            const hits = getIntersectingNodes(node) || [];
            const target = hits.find((n) => n.id !== node.id);
            if (target) setDropTarget(target.id);
            else clearDropTarget();

            const shouldConfirm =
              mergeState.isDragging &&
              mergeState.draggedNodeId &&
              (target?.id || mergeState.dropTargetId) &&
              (target?.id
                ? mergeState.draggedNodeId !== target.id
                : mergeState.isValidDropTarget);

            if (shouldConfirm) {
              const finalTargetId = target?.id || mergeState.dropTargetId!;
              requestMerge(mergeState.draggedNodeId, finalTargetId);
            } else {
              finishDrag();
            }
          }
        }}
        onSelectionDragStart={(event, selectionNodes) => {
          if (onSelectionDragStart) {
            onSelectionDragStart(event, selectionNodes);
          }
        }}
        onSelectionDragStop={(event, selectionNodes) => {
          if (onSelectionDragStop) {
            onSelectionDragStop(event, selectionNodes);
          }
          clearDropTarget();
          finishDrag();
        }}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        // Map canvas/pane click/context events to the parent handlers
        onPaneClick={onCanvasClick}
        onPaneContextMenu={onContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        attributionPosition="top-right"
        selectionMode={SelectionMode.Partial}
        panOnDrag={[1, 2]} // Only pan with middle mouse or right mouse, allow left mouse for node dragging
        selectionOnDrag={true} // Enable selection box on drag
        multiSelectionKeyCode="Shift"
        panOnScroll
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
        minZoom={0.01}
        maxZoom={4}
      >
        <Controls />
        <MiniMap zoomable pannable />
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
      </ReactFlow>

      {/* Node Preview */}
      <NodePreview
        node={previewNode}
        canvasHeight={canvasHeight}
        isVisible={isPreviewVisible}
        edges={edges}
      />

      <ConfirmationDialog
        isOpen={confirmationState.isOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) cancelMerge();
        }}
        title="Merge Nodes?"
        description={
          <div>
            <p>
              This will merge the selected nodes and reassign all connected
              edges.
            </p>
            <p className="mt-2 text-sm text-gray-500">
              This action cannot be undone without using Undo (Ctrl+Z).
            </p>
          </div>
        }
        confirmText="Merge"
        onConfirm={confirmMerge}
        confirmButtonClassName="bg-purple-600 hover:bg-purple-700 text-white"
      />
    </div>
  );
};
