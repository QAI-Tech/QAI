import { useCallback } from "react";
import { Node } from "@xyflow/react";
import { useToast } from "@/hooks/use-toast";
import { PlanFlowHandlerProps } from "../types/graphHandlers";
import { canAddNodeToFlow } from "../utils/edgeValidation";

export const usePlanFlowHandlers = ({
  nodes,
  edges,
  planFlowState,
  setPlanFlowState,
  flowManagement,
}: PlanFlowHandlerProps) => {
  const { toast } = useToast();

  const handlePlanFlowNodeClick = useCallback(
    (node: Node) => {
      // Only allow customNode types to be selected for flow planning
      if (node.type !== "customNode") {
        toast({
          title: "Invalid node type",
          description:
            "Only screens can be used for flow planning. Comments cannot be included in flows.",
          variant: "destructive",
        });
        return;
      }

      const { startNode, currentPathNodes } = planFlowState;

      console.log("Plan flow node click:", {
        clickedNodeId: node.id,
        startNodeId: startNode?.id,
        currentPathLength: currentPathNodes.length,
      });

      // Check if this is the first node (start node)
      if (currentPathNodes.length === 0) {
        setPlanFlowState((prev) => ({
          ...prev,
          startNode: node,
          flowName: prev.flowName || `Flow ${flowManagement.flows.length + 1}`,
          currentPathNodes: [node],
        }));
        toast({
          title: "Start screen selected",
          description: "Now click on connected screens to build your flow.",
        });
        return;
      }

      // Check if node is already in the path
      if (currentPathNodes.some((pathNode) => pathNode.id === node.id)) {
        toast({
          title: "Node already in flow",
          description: "This screen is already part of your flow.",
          variant: "destructive",
        });
        return;
      }

      // Validate that the new node is connected to the last node in the path
      const currentPathNodeIds = currentPathNodes.map((n) => n.id);
      const canAdd = canAddNodeToFlow(node.id, currentPathNodeIds, edges);

      if (!canAdd) {
        toast({
          title: "No connection",
          description:
            "This screen is not connected to the last screen in your flow.",
          variant: "destructive",
        });
        return;
      }

      // Add the node to the flow
      const updatedPath = [...currentPathNodes, node];
      setPlanFlowState((prev) => ({
        ...prev,
        currentPathNodes: updatedPath,
      }));

      toast({
        title: "Screen added",
        description: `Screen added to flow (${updatedPath.length} screens total).`,
      });
    },
    [planFlowState, flowManagement.flows, toast, edges, setPlanFlowState],
  );

  return {
    handlePlanFlowNodeClick,
  };
};
