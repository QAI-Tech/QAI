// @ts-nocheck
import { useState, useCallback } from "react";
import { Node, Edge } from "@xyflow/react";
import { Feature, Flow } from "@/app/(editor)/components/FlowManager";
import {
  planAllFlows,
  getLastEdgeDescription,
} from "@/app/(editor)/utils/aiFlowPlanning";
import { useToast } from "@/hooks/use-toast";
import { generateFlowIdFromPath } from "@/app/(editor)/utils/idGenerator";
import { ConsoleCollaborationEvents } from "../types/collaborationEvents";

interface UseAiFlowPlanningProps {
  features: Feature[];
  nodes: Node[];
  edges: Edge[];
  getNodeFeature: (nodeId: string) => Feature | null;
  existingFlows: Flow[];
  onFlowsCreated: (flows: Flow[]) => void;
}

/**
 * Optimized flow comparison that returns early for performance
 */
const areFlowsEquivalent = (flow1: Flow, flow2: Flow): boolean => {
  // 1. Start node comparison - cheapest check first
  if (flow1.startNodeId !== flow2.startNodeId) {
    return false;
  }

  // 2. End node comparison
  if (flow1.endNodeId !== flow2.endNodeId) {
    return false;
  }

  // 3. Path length comparison
  if (flow1.pathNodeIds.length !== flow2.pathNodeIds.length) {
    return false;
  }

  // 4. Full path comparison - most expensive, only if all above match
  for (let i = 0; i < flow1.pathNodeIds.length; i++) {
    if (flow1.pathNodeIds[i] !== flow2.pathNodeIds[i]) {
      return false;
    }
  }

  return true;
};

export const useAiFlowPlanning = ({
  features,
  nodes,
  edges,
  getNodeFeature,
  existingFlows,
  onFlowsCreated,
}: UseAiFlowPlanningProps) => {
  const [isPlanning, setIsPlanning] = useState(false);
  const [plannedFlows, setPlannedFlows] = useState<Flow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const executePlanning = useCallback(async () => {
    setIsPlanning(true);
    setError(null);

    try {
      // Add a small delay to show loading state
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Separate flows into auto-plannable and preserved flows
      // Preserved flows: flows without autoPlan field (old flows) OR autoPlan=false (manual flows)
      // These are NEVER modified and returned exactly as-is
      const flowsToPreserve = existingFlows.filter(
        (flow) => flow.autoPlan === undefined || flow.autoPlan === false,
      );
      // Auto-plannable flows: flows with autoPlan=true (created by auto-planning)
      // These will be re-evaluated and invalid ones removed
      const flowsToReplan = existingFlows.filter(
        (flow) => flow.autoPlan === true,
      );

      const plannedFlows = planAllFlows(
        features,
        nodes,
        edges,
        getNodeFeature,
        flowsToReplan,
      );

      // Filter out flows that already exist in ANY existing flows (manual, legacy, or auto-planned)
      const newFlows = plannedFlows.filter((plannedFlow) => {
        return !existingFlows.some((existingFlow) =>
          areFlowsEquivalent(plannedFlow, existingFlow),
        );
      });

      // Renumber the new flows to have sequential IDs based on existing flow count
      const renumberedFlows = newFlows.map((flow, index) => {
        const nextFlowNumber = existingFlows.length + index + 1;
        const lastEdgeDescription = getLastEdgeDescription(
          flow.pathNodeIds,
          edges,
        );
        const flowName = lastEdgeDescription
          ? `Flow ${nextFlowNumber} - ${lastEdgeDescription}`
          : `Flow ${nextFlowNumber}`;
        return {
          ...flow,
          id: generateFlowIdFromPath(flow.pathNodeIds),
          name: flowName,
          autoPlan: true,
        };
      });

      // Keep only the flows that still match their paths in the replanned flows
      // Also ensure they have autoPlan field and hash-based ID
      const validReplannedFlows = flowsToReplan
        .filter((existingFlow) =>
          plannedFlows.some((plannedFlow) =>
            areFlowsEquivalent(plannedFlow, existingFlow),
          ),
        )
        .map((flow) => ({
          ...flow,
          id: generateFlowIdFromPath(flow.pathNodeIds),
          autoPlan: true,
        }));

      // Merge all flows:
      // 1. flowsToPreserve: Old flows (autoPlan=undefined) and manual flows (autoPlan=false) - RETURNED AS-IS
      // 2. validReplannedFlows: Existing auto-planned flows that are still valid
      // 3. renumberedFlows: New auto-planned flows
      const finalFlows = [
        ...flowsToPreserve,
        ...validReplannedFlows,
        ...renumberedFlows,
      ];

      setPlannedFlows(renumberedFlows);

      if (
        renumberedFlows.length === 0 &&
        flowsToReplan.length === validReplannedFlows.length
      ) {
        if (plannedFlows.length > 0) {
          toast({
            title: "No new flows to add",
            description:
              "All planned flows already exist in your current flow list.",
          });
        } else {
          toast({
            title: "No flows planned",
            description:
              "No valid flow paths could be identified. Make sure you have features with entry points and valid end points.",
            variant: "destructive",
          });
        }
      } else {
        // Update flows with the final merged list
        onFlowsCreated(finalFlows);
        const collaborationEvents = new ConsoleCollaborationEvents();
        collaborationEvents.createAiPlannedFlows(finalFlows);
        const removedCount = flowsToReplan.length - validReplannedFlows.length;
        const addedCount = renumberedFlows.length;
        const preservedCount = flowsToPreserve.length;

        let message = "";
        if (addedCount > 0 && removedCount > 0) {
          message = `Added ${addedCount} new flow${addedCount === 1 ? "" : "s"}, removed ${removedCount} invalid flow${removedCount === 1 ? "" : "s"}, preserved ${preservedCount} manual flow${preservedCount === 1 ? "" : "s"}.`;
        } else if (addedCount > 0) {
          message = `Added ${addedCount} new flow${addedCount === 1 ? "" : "s"}, preserved ${preservedCount} manual flow${preservedCount === 1 ? "" : "s"}.`;
        } else if (removedCount > 0) {
          message = `Removed ${removedCount} invalid flow${removedCount === 1 ? "" : "s"}, preserved ${preservedCount} manual flow${preservedCount === 1 ? "" : "s"}.`;
        } else {
          message = `All flows are up to date. Preserved ${preservedCount} manual flow${preservedCount === 1 ? "" : "s"}.`;
        }

        toast({
          title: "AI Flow Planning Complete",
          description: message,
        });
      }

      return renumberedFlows;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);

      toast({
        title: "Planning failed",
        description: errorMessage,
        variant: "destructive",
      });

      return [];
    } finally {
      setIsPlanning(false);
    }
  }, [
    features,
    nodes,
    edges,
    getNodeFeature,
    existingFlows,
    onFlowsCreated,
    toast,
  ]);

  const createPlannedFlows = useCallback(() => {
    if (plannedFlows.length > 0) {
      onFlowsCreated(plannedFlows);
      setPlannedFlows([]);

      toast({
        title: "Flows created",
        description: `Successfully created ${plannedFlows.length} flow${plannedFlows.length === 1 ? "" : "s"}.`,
      });
    }
  }, [plannedFlows, onFlowsCreated, toast]);

  const clearPlannedFlows = useCallback(() => {
    setPlannedFlows([]);
    setError(null);
  }, []);

  return {
    isPlanning,
    plannedFlows,
    error,
    executePlanning,
    createPlannedFlows,
    clearPlannedFlows,
  };
};
