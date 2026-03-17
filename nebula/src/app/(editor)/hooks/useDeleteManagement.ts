// @ts-nocheck
import { useState, useCallback } from "react";
import { Node, Edge } from "@xyflow/react";
import { useToast } from "@/hooks/use-toast";
import { Flow } from "../components/FlowManager";
import { CollaborationEvents } from "../types/collaborationEvents";
import { CustomNodeData, CustomEdgeData } from "../types/graphHandlers";
import { updateFeatureViaApi } from "../utils/updatefeatureApi";

export interface DeleteConfirmation {
  nodes: Node[];
  edges: Edge[];
  affectedFlows: Array<{ id: string; name: string }>;
}

interface UseDeleteManagementProps {
  flows: Flow[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  saveState: () => void;
  deleteFlowsByNodeIds: (nodeIds: string[]) => Flow[];
  deleteFlowsByEdgeIds: (edgeIds: string[], edges: Edge[]) => Flow[];
  featureManagement?: {
    features: any[];
    setFeatures: React.Dispatch<React.SetStateAction<any[]>>;
  };
  collaborationEvents?: CollaborationEvents;
  productId?: string | null;
  isNewUI?: boolean;
}

export const useDeleteManagement = ({
  flows,
  edges,
  setNodes,
  setEdges,
  saveState,
  deleteFlowsByNodeIds,
  deleteFlowsByEdgeIds,
  featureManagement,
  collaborationEvents,
  productId,
  isNewUI = false,
}: UseDeleteManagementProps) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeletion, setPendingDeletion] =
    useState<DeleteConfirmation | null>(null);
  const { toast } = useToast();

  // Helper function to find affected flows by nodes
  const findAffectedFlowsByNodes = useCallback(
    (nodeIds: string[]) => {
      return flows
        .filter((flow) =>
          nodeIds.some((nodeId) => flow.pathNodeIds.includes(nodeId)),
        )
        .map((flow) => ({ id: flow.id, name: flow.name }));
    },
    [flows],
  );

  // Helper function to find affected flows by edges
  const findAffectedFlowsByEdges = useCallback(
    (edgeIds: string[]) => {
      return flows
        .filter((flow) => {
          // Check if any edge in the flow path would be broken by deleting these edges
          for (let i = 0; i < flow.pathNodeIds.length - 1; i++) {
            const sourceNodeId = flow.pathNodeIds[i];
            const targetNodeId = flow.pathNodeIds[i + 1];

            // Check if any of the edges being deleted connects these consecutive nodes
            const hasConnectingEdge = edgeIds.some((edgeId) => {
              const edge = edges.find((e) => e.id === edgeId);
              return (
                edge &&
                edge.source === sourceNodeId &&
                edge.target === targetNodeId
              );
            });

            if (hasConnectingEdge) {
              return true;
            }
          }
          return false;
        })
        .map((flow) => ({ id: flow.id, name: flow.name }));
    },
    [flows, edges],
  );

  // Execute the actual deletion
  const executeDelete = useCallback(
    (deleteData: DeleteConfirmation) => {
      saveState();

      if (deleteData.nodes.length > 0) {
        // Emit batch collaboration events for nodes being deleted (if provided)
        if (collaborationEvents) {
          const batchNodeDeleteData = deleteData.nodes.map((node) => ({
            nodeId: node.id,
            position: node.position,
            data: node.data as unknown as CustomNodeData,
          }));
          collaborationEvents.deleteNodes(batchNodeDeleteData, "USER_ID");
        }

        const selectedNodeIds = deleteData.nodes.map((node) => node.id);
        setNodes((nds) =>
          nds.filter((node) => !selectedNodeIds.includes(node.id)),
        );
        setEdges((eds) =>
          eds.filter(
            (edge) =>
              !selectedNodeIds.includes(edge.source) &&
              !selectedNodeIds.includes(edge.target),
          ),
        );

        // Remove deleted nodes from features
        if (featureManagement) {
          const updatedFeatures: Array<{
            featureId: string;
            updates: {
              nodeIds: { old: string[]; new: string[] };
            };
          }> = [];

          const featuresToUpdate: Array<{
            featureId: string;
            featureName: string;
            newNodeIds: string[];
          }> = [];

          // First, collect all the updates by examining current features
          featureManagement.features.forEach((feature) => {
            const oldNodeIds = feature.nodeIds;
            const newNodeIds = feature.nodeIds.filter(
              (nodeId) => !selectedNodeIds.includes(nodeId),
            );

            // If nodeIds changed, track for collaboration event and API call
            if (oldNodeIds.length !== newNodeIds.length) {
              updatedFeatures.push({
                featureId: feature.id,
                updates: {
                  nodeIds: { old: oldNodeIds, new: newNodeIds },
                },
              });

              featuresToUpdate.push({
                featureId: feature.id,
                featureName: feature.name,
                newNodeIds: newNodeIds,
              });
            }
          });

          // Old UI: Only emit collaboration events, no API calls
          if (!isNewUI && collaborationEvents && updatedFeatures.length > 0) {
            collaborationEvents.updateFeatures(updatedFeatures, "USER_ID");
          }

          // Now update the features state
          featureManagement.setFeatures((features) =>
            features.map((feature) => ({
              ...feature,
              nodeIds: feature.nodeIds.filter(
                (nodeId) => !selectedNodeIds.includes(nodeId),
              ),
            })),
          );

          // New UI: Only call API, no collaboration events
          if (isNewUI && featuresToUpdate.length > 0 && productId) {
            featuresToUpdate.forEach(
              async ({ featureId, featureName, newNodeIds }) => {
                try {
                  await updateFeatureViaApi(
                    featureId,
                    { name: featureName, nodeIds: newNodeIds },
                    productId,
                  );
                } catch (error) {
                  console.error(
                    `Failed to update feature ${featureId} via API:`,
                    error,
                  );
                }
              },
            );
          }
        }

        // Delete affected flows
        const deletedFlows = deleteFlowsByNodeIds(selectedNodeIds);
      }

      if (deleteData.edges.length > 0) {
        // Emit batch collaboration events for edges being deleted (if provided)
        if (collaborationEvents) {
          const batchEdgeDeleteData = deleteData.edges.map((edge) => ({
            edgeId: edge.id,
            sourceNodeId: edge.source,
            targetNodeId: edge.target,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
            data: edge.data as unknown as CustomEdgeData,
          }));

          collaborationEvents.deleteEdges(batchEdgeDeleteData, "USER_ID");
        }

        const selectedEdgeIds = deleteData.edges.map((edge) => edge.id);
        setEdges((eds) =>
          eds.filter((edge) => !selectedEdgeIds.includes(edge.id)),
        );

        // Delete affected flows
        const deletedFlows = deleteFlowsByEdgeIds(selectedEdgeIds, edges);
      }

      toast({
        title: "Items deleted",
        description: `${deleteData.nodes.length} screen(s) and ${deleteData.edges.length} transition(s) deleted.`,
      });
    },
    [
      saveState,
      setNodes,
      setEdges,
      deleteFlowsByNodeIds,
      deleteFlowsByEdgeIds,
      featureManagement,
      collaborationEvents,
      productId,
      toast,
    ],
  );

  // Delete handler for keyboard shortcuts and context menu
  const handleDelete = useCallback(
    (selectedNodes: Node[], selectedEdges: Edge[]) => {
      if (selectedNodes.length === 0 && selectedEdges.length === 0) return;

      // Find all edges that will be deleted due to node deletion
      const selectedNodeIds = selectedNodes.map((n) => n.id);
      const edgesToDeleteFromNodes = edges.filter(
        (edge) =>
          selectedNodeIds.includes(edge.source) ||
          selectedNodeIds.includes(edge.target),
      );

      // Combine explicitly selected edges with edges that will be deleted due to node deletion
      // Remove duplicates
      const allEdgesToDelete = [
        ...selectedEdges,
        ...edgesToDeleteFromNodes,
      ].filter(
        (edge, index, self) =>
          index === self.findIndex((e) => e.id === edge.id),
      );

      const nodeAffectedFlows = findAffectedFlowsByNodes(selectedNodeIds);
      const edgeAffectedFlows = findAffectedFlowsByEdges(
        allEdgesToDelete.map((e) => e.id),
      );

      // Combine affected flows and remove duplicates
      const allAffectedFlows = [
        ...nodeAffectedFlows,
        ...edgeAffectedFlows,
      ].filter(
        (flow, index, self) =>
          index === self.findIndex((f) => f.id === flow.id),
      );

      const totalItems = selectedNodes.length + allEdgesToDelete.length;

      const deleteData: DeleteConfirmation = {
        nodes: selectedNodes,
        edges: allEdgesToDelete,
        affectedFlows: allAffectedFlows,
      };

      // Show confirmation dialog if:
      // 1. There are affected flows, OR
      // 2. Multiple items are being deleted (more than 1 node/edge total)
      if (allAffectedFlows.length > 0 || totalItems > 1) {
        setPendingDeletion(deleteData);
        setShowDeleteConfirm(true);
      } else {
        // Delete immediately for single item with no flows
        executeDelete(deleteData);
      }
    },
    [findAffectedFlowsByNodes, findAffectedFlowsByEdges, executeDelete],
  );

  // Confirm deletion from dialog
  const confirmDelete = useCallback(() => {
    if (pendingDeletion) {
      executeDelete(pendingDeletion);
      setPendingDeletion(null);
      setShowDeleteConfirm(false);
    }
  }, [pendingDeletion, executeDelete]);

  // Cancel deletion
  const cancelDelete = useCallback(() => {
    setPendingDeletion(null);
    setShowDeleteConfirm(false);
  }, []);

  return {
    showDeleteConfirm,
    pendingDeletion,
    handleDelete,
    confirmDelete,
    cancelDelete,
    findAffectedFlowsByNodes,
    findAffectedFlowsByEdges,
  };
};
