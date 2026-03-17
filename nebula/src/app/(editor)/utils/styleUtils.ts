import { Node, Edge } from "@xyflow/react";
import { isEdgeInAnyFlow as checkEdgeInAnyFlow } from "./flowUtils";
import { Flow } from "../components/FlowManager";
import { PlanFlowState } from "../components/PlanFlowManager";

// Constants for styling
const COLORS = {
  BLUE: "rgb(59, 130, 246)",
  PURPLE: "rgb(139, 92, 246)",
  GREEN: "rgb(16, 185, 129)",
  RED: "#ef4444",
  RED_DARK: "rgb(220, 38, 38)",
  YELLOW_DARK: "rgb(202, 138, 4)",
  ORANGE: "#f59e0b",
} as const;

const ANIMATIONS = {
  FLASH_UNCOVERED: "flash-uncovered-node 3s ease-in-out 1",
  FLASH_ENTRY_POINTS: "flash-entry-points 3s ease-in-out 1",
  BACKGROUND_PULSE: "background-pulse 2s ease-in-out infinite",
  BACKGROUND_PULSE_FAST: "background-pulse 1.5s ease-in-out infinite",
  PURPLE_PULSE: "purple-background-pulse 1.5s ease-in-out infinite",
  PURPLE_PULSE_SLOW: "purple-background-pulse 2s ease-in-out infinite",
  GREEN_PULSE: "green-background-pulse 1.5s ease-in-out infinite",
  GREEN_PULSE_SLOW: "green-background-pulse 2s ease-in-out infinite",
  ORANGE_PULSE: "orange-background-pulse 1.5s ease-in-out infinite",
  FLOW_PULSE: "flow-pulse 2s ease-in-out infinite",
} as const;

const BORDER_WIDTH = "3px solid";

// Helper to create base style with exclamation icon
const createBaseStyle = (
  isInAnyFlow: boolean,
  additionalStyle: Record<string, any> = {},
) => ({
  ...additionalStyle,
  showExclamationIcon: !isInAnyFlow,
});

export const getNodeStyle = (
  node: Node,
  flows: Flow[],
  selectedFlowId: string | null,
  hoveredFlowId: string | null = null,
  mode: string,
  planFlowState: PlanFlowState,
  isFlashingUncovered: boolean = false,
  isFlashingEntryPoints: boolean = false,
  entryPointIds: string[] = [],
  flowChain: Flow[] = [],
  isFlashingSearchResult: boolean = false,
  searchResultId: string | null = null,
) => {
  const isInAnyFlow = flows.some(
    (flow) =>
      Array.isArray(flow.pathNodeIds) && flow.pathNodeIds.includes(node.id),
  );

  // Flash red for uncovered customNode types when requested
  if (isFlashingUncovered && !isInAnyFlow && node.type === "customNode") {
    return createBaseStyle(isInAnyFlow, {
      animation: ANIMATIONS.FLASH_UNCOVERED,
    });
  }

  // Flash green for entry points when requested
  if (isFlashingEntryPoints && entryPointIds.includes(node.id)) {
    return createBaseStyle(isInAnyFlow, {
      animation: ANIMATIONS.FLASH_ENTRY_POINTS,
      borderColor: "#10b981", // green color for entry points
    });
  }

  // Flash green for search result when requested
  if (isFlashingSearchResult && searchResultId === node.id) {
    return createBaseStyle(isInAnyFlow, {
      animation: ANIMATIONS.FLASH_ENTRY_POINTS,
      borderColor: "#10b981", // green color for search result
    });
  }

  // Feature creation/edit mode highlighting
  if (mode === "addFeature" && node.selected) {
    return createBaseStyle(isInAnyFlow, {
      border: `${BORDER_WIDTH} ${COLORS.BLUE}`,
      animation: ANIMATIONS.BACKGROUND_PULSE,
    });
  }

  // Plan flow mode highlighting
  if (mode === "planFlow") {
    return getPlanFlowNodeStyle(node, planFlowState, isInAnyFlow);
  }

  // Regular selection mode
  if (node.selected && mode !== "addFeature" && mode !== "planFlow") {
    return createBaseStyle(isInAnyFlow, {
      border: `${BORDER_WIDTH} ${COLORS.BLUE}`,
      animation: ANIMATIONS.BACKGROUND_PULSE,
    });
  }

  if (hoveredFlowId && !selectedFlowId) {
    const hoveredFlow = flows.find((f) => f.id === hoveredFlowId);
    if (hoveredFlow) {
      const pathNodeIds = hoveredFlow.pathNodeIds || [];
      if (pathNodeIds.includes(node.id)) {
        return createBaseStyle(isInAnyFlow, {
          border: `${BORDER_WIDTH} ${COLORS.PURPLE}`,
          opacity: 1,
        });
      }

      return createBaseStyle(isInAnyFlow, {
        opacity: 0.3,
      });
    }
  }

  if (!selectedFlowId) {
    return createBaseStyle(isInAnyFlow);
  }

  const selectedFlow = flows.find((f) => f.id === selectedFlowId);
  if (!selectedFlow) return createBaseStyle(isInAnyFlow);

  return getSelectedFlowNodeStyle(node, selectedFlow, isInAnyFlow, flowChain);
};

// Helper function for plan flow node styling
const getPlanFlowNodeStyle = (
  node: Node,
  planFlowState: PlanFlowState,
  isInAnyFlow: boolean,
) => {
  const { startNode, currentPathNodes } = planFlowState;

  // Show confirmed start node
  if (startNode && startNode.id === node.id) {
    return createBaseStyle(isInAnyFlow, {
      border: `${BORDER_WIDTH} ${COLORS.PURPLE}`,
      animation: ANIMATIONS.PURPLE_PULSE,
    });
  }

  // Show nodes in current flow path (except start node)
  const isInCurrentPath = currentPathNodes.some(
    (pathNode) => pathNode.id === node.id,
  );
  if (isInCurrentPath && node.id !== startNode?.id) {
    return createBaseStyle(isInAnyFlow, {
      border: `${BORDER_WIDTH} ${COLORS.BLUE}`,
      animation: ANIMATIONS.BACKGROUND_PULSE_FAST,
    });
  }

  return createBaseStyle(isInAnyFlow);
};

// Helper function for selected flow node styling
const getSelectedFlowNodeStyle = (
  node: Node,
  selectedFlow: Flow,
  isInAnyFlow: boolean,
  flowChain: Flow[] = [],
) => {
  // Skip flow chain node highlighting - we only highlight edges

  // Apply selected flow styling
  if (selectedFlow.startNodeId === node.id) {
    return createBaseStyle(isInAnyFlow, {
      border: `${BORDER_WIDTH} ${COLORS.PURPLE}`,
      animation: ANIMATIONS.PURPLE_PULSE_SLOW,
    });
  }

  if (selectedFlow.endNodeId === node.id) {
    return createBaseStyle(isInAnyFlow, {
      border: `${BORDER_WIDTH} ${COLORS.GREEN}`,
      animation: ANIMATIONS.GREEN_PULSE_SLOW,
    });
  }

  if (selectedFlow.viaNodeIds.includes(node.id)) {
    return createBaseStyle(isInAnyFlow, {
      border: `${BORDER_WIDTH} ${COLORS.BLUE}`,
      animation: ANIMATIONS.BACKGROUND_PULSE,
    });
  }

  if (selectedFlow.pathNodeIds.includes(node.id)) {
    return createBaseStyle(isInAnyFlow, {
      animation: ANIMATIONS.FLOW_PULSE,
    });
  }

  // Fade out nodes not in the selected flow
  return createBaseStyle(isInAnyFlow, {
    opacity: 0.25,
  });
};

const EDGE_STYLES = {
  HIGHLIGHTED: {
    strokeWidth: 6,
    opacity: 1,
  },
  FLOW: {
    strokeWidth: 3,
    opacity: 1,
  },
  FADED: {
    opacity: 0.25,
  },
  BRANCH_PREVIEW: {
    opacity: 0.3,
  },
} as const;

const EDGE_ANIMATIONS = {
  FLASH_UNCOVERED: "flash-uncovered-edge 3s ease-in-out 1",
  PLAN_FLOW_PULSE: "plan-flow-pulse 1s ease-in-out infinite",
} as const;

// Helper to check if edge is in any flow path
const isEdgeInAnyFlow = checkEdgeInAnyFlow;

// Helper to check if edge connects consecutive path nodes
const isEdgeInPath = (edge: Edge, pathNodeIds: string[]): boolean => {
  for (let i = 0; i < pathNodeIds.length - 1; i++) {
    if (edge.source === pathNodeIds[i] && edge.target === pathNodeIds[i + 1]) {
      return true;
    }
  }
  return false;
};

// Helper to get preview path for plan flow mode
const getPreviewPath = (planFlowState: PlanFlowState): Node[] => {
  const { startNode, currentPathNodes } = planFlowState;

  if (!startNode) return [];

  return currentPathNodes;
};

export const getEdgeStyle = (
  edge: Edge,
  flows: Flow[],
  selectedFlowId: string | null,
  hoveredFlowId: string | null = null,
  mode?: string,
  planFlowState?: PlanFlowState,
  nodes?: Node[],
  edges?: Edge[],
  isFlashingUncovered: boolean = false,
  isFlashingEntryPoints: boolean = false,
  entryPointIds: string[] = [],
  flowChain: Flow[] = [],
  isFlashingSearchResult: boolean = false,
  searchResultId: string | null = null,
) => {
  const isInAnyFlow = isEdgeInAnyFlow(edge, flows);

  // Flash red for uncovered edges when requested
  if (isFlashingUncovered && !isInAnyFlow) {
    return {
      stroke: COLORS.RED,
      ...EDGE_STYLES.HIGHLIGHTED,
      animation: EDGE_ANIMATIONS.FLASH_UNCOVERED,
    };
  }

  // Flash green for search result when requested
  if (isFlashingSearchResult && searchResultId === edge.id) {
    return {
      stroke: "#10b981", // green color for search result
      strokeWidth: 3,
      animation: ANIMATIONS.FLASH_ENTRY_POINTS,
    };
  }

  // Plan flow mode preview highlighting
  if (mode === "planFlow" && planFlowState && nodes) {
    return getPlanFlowEdgeStyle(edge, planFlowState, isInAnyFlow);
  }

  if (hoveredFlowId && !selectedFlowId) {
    const hoveredFlow = flows.find((f) => f.id === hoveredFlowId);
    if (hoveredFlow) {
      const pathNodeIds = hoveredFlow.pathNodeIds || [];
      if (isEdgeInPath(edge, pathNodeIds)) {
        return createBaseStyle(isInAnyFlow, {
          stroke: COLORS.PURPLE,
          strokeWidth: 4,
          opacity: 1,
        });
      }

      return createBaseStyle(isInAnyFlow, {
        opacity: 0.3,
      });
    }
  }

  if (!selectedFlowId) return createBaseStyle(isInAnyFlow);

  const selectedFlow = flows.find((f) => f.id === selectedFlowId);
  if (!selectedFlow) return createBaseStyle(isInAnyFlow);

  return getSelectedFlowEdgeStyle(edge, selectedFlow, isInAnyFlow, flowChain);
};

// Helper function for plan flow edge styling
const getPlanFlowEdgeStyle = (
  edge: Edge,
  planFlowState: PlanFlowState,
  isInAnyFlow: boolean,
) => {
  const previewPath = getPreviewPath(planFlowState);

  // Check if this edge is part of the current flow path
  if (previewPath.length > 1) {
    const pathNodeIds = previewPath.map((n) => n.id);

    if (isEdgeInPath(edge, pathNodeIds)) {
      return createBaseStyle(isInAnyFlow, {
        stroke: COLORS.PURPLE,
        ...EDGE_STYLES.HIGHLIGHTED,
        animation: EDGE_ANIMATIONS.PLAN_FLOW_PULSE,
      });
    }
  }

  // Return default style for non-preview edges in plan flow mode
  return createBaseStyle(isInAnyFlow, EDGE_STYLES.BRANCH_PREVIEW);
};

// Helper function for selected flow edge styling
const getSelectedFlowEdgeStyle = (
  edge: Edge,
  selectedFlow: Flow,
  isInAnyFlow: boolean,
  flowChain: Flow[] = [],
) => {
  // First check if edge is part of flow chain (other flows leading to selected flow)
  if (flowChain.length > 1) {
    for (let i = 0; i < flowChain.length - 1; i++) {
      const chainFlow = flowChain[i];
      const chainPathNodeIds = chainFlow.pathNodeIds;

      if (isEdgeInPath(edge, chainPathNodeIds)) {
        // Use alternating dark yellow and dark red shades for flow chain visualization
        const isEvenIndex = i % 2 === 0;
        const chainColor = isEvenIndex ? COLORS.YELLOW_DARK : COLORS.RED_DARK;

        return createBaseStyle(isInAnyFlow, {
          stroke: chainColor,
          ...EDGE_STYLES.FLOW,
        });
      }
    }
  }

  // Then apply selected flow styling (takes precedence)
  const pathNodeIds = selectedFlow.pathNodeIds;

  if (isEdgeInPath(edge, pathNodeIds)) {
    return createBaseStyle(isInAnyFlow, {
      stroke: COLORS.PURPLE,
      ...EDGE_STYLES.FLOW,
    });
  }

  // Fade out edges not in the selected flow or flow chain
  return createBaseStyle(isInAnyFlow, EDGE_STYLES.FADED);
};
