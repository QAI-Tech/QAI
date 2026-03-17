// @ts-nocheck
import { useState, useCallback } from "react";
import { Node, Edge } from "@xyflow/react";
import { useToast } from "@/hooks/use-toast";
import { generateFlowIdFromPath } from "@/app/(editor)/utils/idGenerator";
import { useProductSwitcher } from "@/providers/product-provider";
import { Flow } from "../components/FlowManager";
import { PlanFlowState } from "../components/PlanFlowManager";
import { ConsoleCollaborationEvents } from "../types/collaborationEvents";
interface UsePlanFlowManagementProps {
  nodes: Node[];
  edges: Edge[];
  setMode: React.Dispatch<
    React.SetStateAction<"select" | "addNode" | "addEdge" | "planFlow">
  >;
  flowManagement: {
    flows: Flow[];
    addFlow: (flow: Flow) => void;
  };
  featureManagement?: {
    features: any[];
    updateFeature: (id: string, updates: any) => void;
    getFeatureById: (id: string) => any;
  };
  selectedFeatureId?: string | null;
}

export const usePlanFlowManagement = ({
  nodes,
  edges,
  setMode,
  flowManagement,
  featureManagement,
  selectedFeatureId,
}: UsePlanFlowManagementProps) => {
  const { toast } = useToast();
  const { productSwitcher } = useProductSwitcher();
  const [planFlowState, setPlanFlowState] = useState<PlanFlowState>({
    step: "start",
    startNode: null,
    flowName: "",
    precondition: "",
    currentPathNodes: [],
  });
  const collaborationEvents = new ConsoleCollaborationEvents();

  const createPlanFlow = useCallback(async () => {
    const { startNode, flowName, currentPathNodes } = planFlowState;

    if (!startNode) {
      toast({
        title: "Invalid flow",
        description: "Start screen is required.",
        variant: "destructive",
      });
      return;
    }

    if (currentPathNodes.length < 2) {
      toast({
        title: "Invalid flow",
        description: "Flow must contain at least 2 screens.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Get the end node (last node in the path)
      const endNode = currentPathNodes[currentPathNodes.length - 1];

      // Get via nodes (all nodes between start and end)
      const viaNodes =
        currentPathNodes.length > 2 ? currentPathNodes.slice(1, -1) : [];

      const pathNodeIds = currentPathNodes.map((n) => n.id);

      const newFlow: Flow = {
        id: generateFlowIdFromPath(pathNodeIds),
        name: flowName,
        startNodeId: startNode.id,
        endNodeId: endNode.id,
        viaNodeIds: viaNodes.map((n) => n.id),
        pathNodeIds,
        precondition: planFlowState.precondition || "",
        autoPlan: false,
        videoUrl: undefined,
        feature_id: selectedFeatureId || undefined,
      };

      flowManagement.addFlow(newFlow);
      collaborationEvents.createFlows([newFlow]);

      if (selectedFeatureId && featureManagement) {
        featureManagement.features.forEach((f) => {
          if (f.id === selectedFeatureId) return;

          const existingNodeIds = f.nodeIds || [];
          const hasOverlappingNodes = existingNodeIds.some((nid: string) =>
            pathNodeIds.includes(nid),
          );

          if (hasOverlappingNodes) {
            const newNodeIds = existingNodeIds.filter(
              (nid: string) => !pathNodeIds.includes(nid),
            );
            featureManagement.updateFeature(f.id, {
              nodeIds: newNodeIds,
            });
          }
        });

        const feature = featureManagement.getFeatureById(selectedFeatureId);
        if (feature) {
          const existingNodeIds = feature.nodeIds || [];
          const allNodeIds = [...existingNodeIds, ...pathNodeIds];
          // Remove duplicates
          const uniqueNodeIds = Array.from(new Set(allNodeIds));

          if (uniqueNodeIds.length > existingNodeIds.length) {
            featureManagement.updateFeature(selectedFeatureId, {
              nodeIds: uniqueNodeIds,
            });
          }
        }
      }

      setPlanFlowState({
        step: "start",
        startNode: null,
        flowName: "",
        currentPathNodes: [],
      });
      setMode("select");

      toast({
        title: "Flow created",
        description: `Flow "${flowName}" with ${currentPathNodes.length} screens has been created.`,
      });
    } catch (error) {
      console.error("Error creating plan flow:", error);
      toast({
        title: "Flow creation failed",
        description:
          error instanceof Error ? error.message : "Unable to create flow.",
        variant: "destructive",
      });
    }
  }, [
    planFlowState,
    flowManagement.addFlow,
    setMode,
    toast,
    productSwitcher.product_id,
    featureManagement,
    selectedFeatureId,
    collaborationEvents,
  ]);

  return {
    planFlowState,
    setPlanFlowState,
    createPlanFlow,
  };
};
