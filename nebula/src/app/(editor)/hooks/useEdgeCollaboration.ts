import { useEffect } from "react";
import type { Edge } from "@xyflow/react";
import { ConsoleCollaborationEvents } from "../types/collaborationEvents";
import type { CustomEdgeData } from "../types/graphHandlers";

interface UseEdgeCollaborationProps {
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
}

export const useEdgeCollaboration = ({
  setEdges,
}: UseEdgeCollaborationProps) => {
  useEffect(() => {
    const handleIncomingEdgeEvent = (
      eventName:
        | "edges_create"
        | "edges_update"
        | "edges_delete"
        | "edges_replace",
      payload: any,
    ) => {
      // This handler is registered below via setEdgeEventHandler(). Whenever the
      // socket receives an edge event, collaborationEvents.ts invokes this
      // callback with the event name + payload so we can keep all React state
      // updates inside this hook.
      const upsertRemoteEdges = (remoteEdges: any[]) => {
        if (!Array.isArray(remoteEdges) || remoteEdges.length === 0) return;

        setEdges((currentEdges) => {
          const existingIds = new Set(currentEdges.map((e) => e.id));

          const newEdges: Edge<CustomEdgeData>[] = remoteEdges
            .filter((edge) => edge && edge.id && !existingIds.has(edge.id))
            .map((edge) => ({
              id: edge.id,
              source: edge.source,
              target: edge.target,
              sourceHandle:
                edge.source_anchor ?? edge.sourceHandle ?? "right-source",
              targetHandle:
                edge.target_anchor ?? edge.targetHandle ?? "left-target",
              type: "customEdge",
              data: {
                description: edge.label ?? edge.description ?? "",
                business_logic: edge.business_logic ?? "",
                curvature: edge.curvature ?? 0,
                source: edge.source,
                target: edge.target,
                sourceHandle:
                  edge.source_anchor ?? edge.sourceHandle ?? "right-source",
                targetHandle:
                  edge.target_anchor ?? edge.targetHandle ?? "left-target",
              },
            }));

          if (newEdges.length === 0) {
            return currentEdges;
          }

          return [...currentEdges, ...newEdges];
        });
      };

      const applyRemoteEdgeUpdates = (remoteUpdates: any[]) => {
        if (!Array.isArray(remoteUpdates) || remoteUpdates.length === 0) return;

        setEdges((currentEdges) =>
          currentEdges.map((edge) => {
            const update = remoteUpdates.find((u) => u.id === edge.id);
            if (!update || !update.updates) {
              return edge;
            }

            const next: Edge<CustomEdgeData> = {
              ...edge,
              data: {
                ...(edge.data || {}),
              } as CustomEdgeData,
            };

            const updates = update.updates;

            if (updates.description && "new" in updates.description) {
              (next.data as CustomEdgeData).description =
                updates.description.new;
            }

            if (updates.business_logic && "new" in updates.business_logic) {
              (next.data as CustomEdgeData).business_logic =
                updates.business_logic.new;
            }

            if (updates.curvature && "new" in updates.curvature) {
              (next.data as CustomEdgeData).curvature = updates.curvature.new;
            }

            if (updates.anchors) {
              next.source = updates.anchors.new_source ?? next.source;
              next.target = updates.anchors.new_target ?? next.target;
              next.sourceHandle =
                updates.anchors.new_source_anchor ?? next.sourceHandle;
              next.targetHandle =
                updates.anchors.new_target_anchor ?? next.targetHandle;
            }

            return next;
          }),
        );
      };

      const deleteRemoteEdges = (remote: any) => {
        if (!remote) return;

        const ids: string[] = Array.isArray(remote)
          ? remote
              .map((e) => (typeof e === "string" ? e : e.id))
              .filter(Boolean)
          : [];

        if (ids.length === 0) return;

        setEdges((currentEdges) =>
          currentEdges.filter((edge) => !ids.includes(edge.id)),
        );
      };

      const replaceRemoteEdges = (remoteEdges: any[]) => {
        if (!Array.isArray(remoteEdges)) return;

        setEdges(() => {
          const newEdges: Edge<CustomEdgeData>[] = remoteEdges
            .filter((edge) => edge && edge.id)
            .map((edge) => ({
              id: edge.id,
              source: edge.source,
              target: edge.target,
              sourceHandle:
                edge.source_anchor ?? edge.sourceHandle ?? "right-source",
              targetHandle:
                edge.target_anchor ?? edge.targetHandle ?? "left-target",
              type: "customEdge",
              data: {
                description: edge.label ?? edge.description ?? "",
                business_logic: edge.business_logic ?? "",
                curvature: edge.curvature ?? 0,
                source: edge.source,
                target: edge.target,
                sourceHandle:
                  edge.source_anchor ?? edge.sourceHandle ?? "right-source",
                targetHandle:
                  edge.target_anchor ?? edge.targetHandle ?? "left-target",
              },
            }));

          return newEdges;
        });
      };

      const actualData = payload?.data?.data || payload?.data || payload;

      switch (eventName) {
        case "edges_create":
          upsertRemoteEdges(actualData);
          break;
        case "edges_update":
          applyRemoteEdgeUpdates(actualData);
          break;
        case "edges_delete":
          deleteRemoteEdges(actualData);
          break;
        case "edges_replace":
          replaceRemoteEdges(actualData);
          break;
        default:
          break;
      }
    };

    // Register for incoming socket events. collaborationEvents.ts keeps the
    // socket connection and simply forwards edge events to whatever handler is
    // registered here.
    ConsoleCollaborationEvents.setEdgeEventHandler(handleIncomingEdgeEvent);

    return () => {
      ConsoleCollaborationEvents.setEdgeEventHandler(undefined);
    };
  }, [setEdges]);
};
