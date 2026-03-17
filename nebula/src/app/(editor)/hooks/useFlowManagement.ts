// @ts-nocheck
import { useState, useCallback, useEffect, useRef } from "react";
import { Edge } from "@xyflow/react";
import { useToast } from "@/hooks/use-toast";
import { Flow, TestCasePlanningRequest } from "../components/FlowManager";
import { ConsoleCollaborationEvents } from "../types/collaborationEvents";

interface UseFlowManagementProps {
  panToFlowPath?: (flowNodes: import("@xyflow/react").Node[]) => void;
  nodes?: import("@xyflow/react").Node[];
}

export const useFlowManagement = (props?: UseFlowManagementProps) => {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [failedVideoToFlowRequests, setFailedVideoToFlowRequests] = useState<
    TestCasePlanningRequest[]
  >([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const { toast } = useToast();
  const { panToFlowPath, nodes = [] } = props || {};
  const collaboarationEvents = new ConsoleCollaborationEvents();

  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const lastAutoPanKeyRef = useRef<string | null>(null);
  const autoPanTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!selectedFlowId || !panToFlowPath) return;

    const selectedFlow = flows.find((flow) => flow.id === selectedFlowId);
    const pathNodeIds = Array.isArray(selectedFlow?.pathNodeIds)
      ? selectedFlow!.pathNodeIds
      : [];
    if (pathNodeIds.length === 0) return;

    const autoPanKey = `${selectedFlowId}:${pathNodeIds.join(",")}`;
    if (lastAutoPanKeyRef.current === autoPanKey) return;

    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 25;
    const RETRY_MS = 150;

    const cleanup = () => {
      if (autoPanTimerRef.current) {
        clearTimeout(autoPanTimerRef.current);
        autoPanTimerRef.current = null;
      }
    };

    const tryPan = () => {
      if (cancelled) return;

      const currentNodes = nodesRef.current || [];
      if (!Array.isArray(currentNodes) || currentNodes.length === 0) {
        if (attempts++ < MAX_ATTEMPTS) {
          autoPanTimerRef.current = setTimeout(tryPan, RETRY_MS);
        }
        return;
      }

      const flowNodes = pathNodeIds
        .map((nodeId) => currentNodes.find((n) => n.id === nodeId))
        .filter(Boolean);

      if (flowNodes.length > 0) {
        lastAutoPanKeyRef.current = autoPanKey;
        panToFlowPath(flowNodes);
        cleanup();
        return;
      }

      if (attempts++ < MAX_ATTEMPTS) {
        autoPanTimerRef.current = setTimeout(tryPan, RETRY_MS);
      }
    };

    tryPan();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [selectedFlowId, flows, panToFlowPath]);

  // Flow selection (now just sets the ID, panning is handled by useEffect)
  const selectFlow = useCallback((flowId: string | null) => {
    setSelectedFlowId(flowId);
  }, []);

  // Add a new flow
  const addFlow = useCallback(
    (flow: Flow, autoSelect: boolean = true, showToast: boolean = true) => {
      setFlows((prev) => [...prev, flow]);
      if (autoSelect) {
        setSelectedFlowId(flow.id);
      }

      if (showToast) {
        toast({
          title: "Flow created",
          description: `Flow "${flow.name}" has been created successfully.`,
        });
      }
    },
    [toast],
  );

  // Delete a flow
  const deleteFlow = useCallback(
    (flowId: string, showToast: boolean = true) => {
      setFlows((flows) => flows.filter((f) => f.id !== flowId));
      if (selectedFlowId === flowId) {
        setSelectedFlowId(null);
      }
      try {
        collaboarationEvents.deleteFlows?.([{ id: flowId } as any]);
      } catch (err) {
        console.warn("Failed to notify collaboration about deleted flow:", err);
      }
      if (showToast) {
        toast({
          title: "Flow deleted",
          description: "Flow has been deleted successfully.",
        });
      }
    },
    [selectedFlowId, toast],
  );

  // Bulk delete flows
  const deleteFlows = useCallback(
    (
      flowIds: string[],
      shouldSendEvent: boolean = true,
      showToast: boolean = true,
    ) => {
      setFlows((flows) => flows.filter((f) => !flowIds.includes(f.id)));
      if (selectedFlowId && flowIds.includes(selectedFlowId)) {
        setSelectedFlowId(null);
      }
      if (shouldSendEvent == true) {
        try {
          collaboarationEvents.deleteFlows?.(
            flowIds.map((id) => ({ id }) as any),
          );
        } catch (err) {
          console.warn(
            "Failed to notify collaboration about bulk deleted flows:",
            err,
          );
        }
      }
      if (showToast) {
        toast({
          title: `${flowIds.length} flow${flowIds.length > 1 ? "s" : ""} deleted`,
          description: "Selected flows have been deleted successfully.",
        });
      }
    },
    [selectedFlowId, toast],
  );

  // Rename a flow
  const renameFlow = useCallback((flowId: string, newName: string) => {
    setFlows((prev) => {
      const updated = prev.map((f) =>
        f.id === flowId ? { ...f, name: newName } : f,
      );
      try {
        collaboarationEvents.updateFlows?.(updated);
      } catch (err) {
        console.warn("Failed to sync renamed flows to collaboration:", err);
      }
      return updated;
    });
  }, []);

  //Rename flow precondition
  const renameFlowPrecondition = useCallback(
    (flowId: string, newPrecondition: string) => {
      setFlows((prev) => {
        const updated = prev.map((f) =>
          f.id === flowId ? { ...f, precondition: newPrecondition } : f,
        );
        try {
          collaboarationEvents.updateFlows?.(updated);
        } catch (err) {
          console.warn(
            "Failed to sync precondition update to collaboration:",
            err,
          );
        }
        return updated;
      });
    },
    [],
  );

  const renameFlowDescription = useCallback(
    (flowId: string, description: string) => {
      setFlows((prev) => {
        const updated = prev.map((f) =>
          f.id === flowId ? { ...f, description } : f,
        );
        try {
          collaboarationEvents.updateFlows?.(updated);
        } catch (err) {
          console.warn(
            "Failed to sync description update to collaboration:",
            err,
          );
        }
        return updated;
      });
    },
    [],
  );

  const updateFlowScenarios = useCallback(
    (flowId: string, scenarios: Scenario[]) => {
      setFlows((prev) => {
        const updated = prev.map((f) =>
          f.id === flowId ? { ...f, scenarios } : f,
        );
        try {
          collaboarationEvents.updateFlows?.(updated);
        } catch (err) {
          console.warn("Failed to sync flow scenarios to collaboration:", err);
        }
        return updated;
      });
      console.log("Flow scenarios updated:", flowId, scenarios);
    },
    [],
  );

  // Update flow credentials
  const updateFlowCredentials = useCallback(
    (flowId: string, credentials: string[]) => {
      setFlows((prev) => {
        const updated = prev.map((f) =>
          f.id === flowId ? { ...f, credentials } : f,
        );
        try {
          collaboarationEvents.updateFlows?.(updated);
        } catch (err) {
          console.warn(
            "Failed to sync flow credentials to collaboration:",
            err,
          );
        }
        return updated;
      });
      console.log("Flow credentials updated:", flowId, credentials);
    },
    [],
  );

  const updateFlow = useCallback((updatedFlow: Flow) => {
    setFlows((prev) => {
      const updated = prev.map((f) =>
        f.id === updatedFlow.id ? updatedFlow : f,
      );
      try {
        collaboarationEvents.updateFlows?.(updated);
      } catch (err) {
        console.warn("Failed to sync flow update to collaboration:", err);
      }
      return updated;
    });
  }, []);

  // Reorder flows
  const reorderFlows = useCallback((reorderedFlows: Flow[]) => {
    setFlows(() => {
      try {
        collaboarationEvents.updateFlows?.(reorderedFlows);
      } catch (err) {
        console.warn("Failed to sync reordered flows to collaboration:", err);
      }
      return reorderedFlows;
    });
  }, []);

  // Delete flows by affected node IDs (used during node deletion)
  const deleteFlowsByNodeIds = useCallback(
    (nodeIds: string[]) => {
      const affectedFlows = flows.filter((flow) =>
        nodeIds.some((nodeId) => flow.pathNodeIds.includes(nodeId)),
      );

      if (affectedFlows.length > 0) {
        setFlows((flows) =>
          flows.filter(
            (flow) =>
              !nodeIds.some((nodeId) => flow.pathNodeIds.includes(nodeId)),
          ),
        );

        try {
          collaboarationEvents.deleteFlows?.(affectedFlows);
        } catch (err) {
          console.warn(
            "Failed to notify collaboration about flows deleted by node ids:",
            err,
          );
        }

        // Clear selected flow if it was affected
        if (
          selectedFlowId &&
          affectedFlows.some((f) => f.id === selectedFlowId)
        ) {
          setSelectedFlowId(null);
        }

        return affectedFlows;
      }

      return [];
    },
    [flows, selectedFlowId],
  );

  // Delete flows by affected edge IDs (used during edge deletion)
  const deleteFlowsByEdgeIds = useCallback(
    (edgeIds: string[], edges: Edge[]) => {
      const affectedFlows = flows.filter((flow) => {
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
      });
      try {
        collaboarationEvents.deleteFlows?.(affectedFlows);
      } catch (err) {
        console.warn(
          "Failed to notify collaboration about flows deleted by edge ids:",
          err,
        );
      }
      if (affectedFlows.length > 0) {
        setFlows((flows) =>
          flows.filter(
            (flow) => !affectedFlows.some((af) => af.id === flow.id),
          ),
        );

        // Clear selected flow if it was affected
        if (
          selectedFlowId &&
          affectedFlows.some((f) => f.id === selectedFlowId)
        ) {
          setSelectedFlowId(null);
        }

        return affectedFlows;
      }

      return [];
    },
    [flows, selectedFlowId],
  );

  // Bulk set flows (used for file import)
  const setAllFlows = useCallback((newFlows: Flow[]) => {
    setFlows(newFlows);
    setSelectedFlowId(null); // Clear selection when importing
  }, []);

  // Get flow by ID
  const getFlowById = useCallback(
    (flowId: string) => {
      return flows.find((flow) => flow.id === flowId) || null;
    },
    [flows],
  );

  // Get selected flow
  const selectedFlow = selectedFlowId ? getFlowById(selectedFlowId) : null;

  const clearFailedVideoToFlowRequests = useCallback(() => {
    setFailedVideoToFlowRequests([]);
  }, []);

  const removeFailedVideoToFlowRequest = useCallback((requestId: string) => {
    setFailedVideoToFlowRequests((prev) =>
      prev.filter((req) => req.request_id !== requestId),
    );
  }, []);

  const addFailedVideoToFlowRequest = useCallback(
    (request: TestCasePlanningRequest) => {
      setFailedVideoToFlowRequests((prev) => {
        if (prev.some((req) => req.request_id === request.request_id)) {
          return prev;
        }
        return [...prev, request];
      });
    },
    [],
  );

  return {
    // State
    flows,
    selectedFlowId,
    selectedFlow,

    // Operations
    selectFlow,
    addFlow,
    deleteFlow,
    deleteFlows,
    renameFlow,
    renameFlowPrecondition,
    renameFlowDescription,
    updateFlowScenarios,
    updateFlowCredentials,
    updateFlow,
    reorderFlows,
    deleteFlowsByNodeIds,
    deleteFlowsByEdgeIds,
    setAllFlows,
    getFlowById,
    clearFailedVideoToFlowRequests,
    removeFailedVideoToFlowRequest,
    addFailedVideoToFlowRequest,

    // For external state setters (file operations, etc.)
    setFlows,
    setSelectedFlowId,
    setFailedVideoToFlowRequests,
    failedVideoToFlowRequests,
  };
};
