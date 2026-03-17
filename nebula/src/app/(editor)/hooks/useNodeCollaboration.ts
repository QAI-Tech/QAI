import { useEffect } from "react";
import type { Node } from "@xyflow/react";
import { useNodeManagement } from "./useNodeManagement";
import { ConsoleCollaborationEvents } from "../types/collaborationEvents";
import type { CustomNodeData } from "../types/graphHandlers";
import type { CollaborationEvents } from "../types/collaborationEvents";

interface UseNodeCollaborationProps {
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  collaborationEvents?: CollaborationEvents;
}

export const useNodeCollaboration = ({
  setNodes,
  collaborationEvents,
}: UseNodeCollaborationProps) => {
  const nodeManagement = useNodeManagement({ setNodes, collaborationEvents });

  useEffect(() => {
    const handleIncomingNodeEvent = (
      eventName:
        | "nodes_create"
        | "nodes_update"
        | "nodes_delete"
        | "nodes_replace",
      payload: any,
    ) => {
      const upsertRemoteNodes = (remoteNodes: any[]) => {
        if (!Array.isArray(remoteNodes) || remoteNodes.length === 0) return;

        setNodes((currentNodes) => {
          const existingIds = new Set(currentNodes.map((n) => n.id));

          const newNodes: Node<CustomNodeData>[] = remoteNodes
            .filter((node) => node && node.id && !existingIds.has(node.id))
            .map((node) => {
              // Extract description/title
              const nodeDescription = node.title || node.description || "";

              return {
                id: node.id,
                position: {
                  x: node.x ?? 0,
                  y: node.y ?? 0,
                },
                type: "customNode",
                data: {
                  description: nodeDescription,
                  image: node.metadata?.image,
                  title: nodeDescription,
                  featureId: node.metadata?.featureId,
                  isFeatureNode: node.metadata?.isFeatureNode ?? false,
                  featureType: node.metadata?.featureType,
                  featureData: node.metadata?.featureData,
                } as CustomNodeData,
                width: node.width ?? 150,
                height: node.height ?? 80,
              };
            });

          if (newNodes.length === 0) {
            return currentNodes;
          }

          return [...currentNodes, ...newNodes];
        });
      };

      const applyRemoteNodeUpdates = (remoteUpdates: any[]) => {
        if (!Array.isArray(remoteUpdates) || remoteUpdates.length === 0) return;

        setNodes((currentNodes) =>
          currentNodes.map((node) => {
            const update = remoteUpdates.find((u) => u.id === node.id);
            if (!update || !update.updates) {
              return node;
            }

            const next: Node<CustomNodeData> = {
              ...node,
              data: {
                ...(node.data || {}),
              } as CustomNodeData,
            };

            const updates = update.updates;

            if (updates.description && "new" in updates.description) {
              (next.data as CustomNodeData).description =
                updates.description.new;
              (next.data as CustomNodeData).title = updates.description.new;
            }

            if (updates.image && "new" in updates.image) {
              (next.data as CustomNodeData).image = updates.image.new;
            }

            if (updates.position && "new" in updates.position) {
              next.position = {
                x: updates.position.new.x,
                y: updates.position.new.y,
              };
            }

            return next;
          }),
        );
      };

      const deleteRemoteNodes = (remote: any) => {
        if (!remote) return;

        const ids: string[] = Array.isArray(remote)
          ? remote
              .map((n) => (typeof n === "string" ? n : n.id))
              .filter(Boolean)
          : [];

        if (ids.length === 0) return;

        setNodes((currentNodes) =>
          currentNodes.filter((node) => !ids.includes(node.id)),
        );
      };

      const replaceRemoteNodes = (remoteNodes: any[]) => {
        if (!Array.isArray(remoteNodes)) return;

        setNodes(() => {
          const newNodes: Node<CustomNodeData>[] = remoteNodes
            .filter((node) => node && node.id)
            .map((node) => {
              // Extract description/title
              const nodeDescription = node.title || node.description || "";

              return {
                id: node.id,
                position: {
                  x: node.x ?? 0,
                  y: node.y ?? 0,
                },
                type: "customNode",
                data: {
                  description: nodeDescription,
                  image: node.metadata?.image,
                  title: nodeDescription,
                  featureId: node.metadata?.featureId,
                  isFeatureNode: node.metadata?.isFeatureNode ?? false,
                  featureType: node.metadata?.featureType,
                  featureData: node.metadata?.featureData,
                } as CustomNodeData,
                width: node.width ?? 150,
                height: node.height ?? 80,
              };
            });

          return newNodes;
        });
      };

      const actualData = payload?.data?.data || payload?.data || payload;

      switch (eventName) {
        case "nodes_create":
          upsertRemoteNodes(actualData);
          break;
        case "nodes_update":
          applyRemoteNodeUpdates(actualData);
          break;
        case "nodes_delete":
          deleteRemoteNodes(actualData);
          break;
        case "nodes_replace":
          replaceRemoteNodes(actualData);
          break;
        default:
          break;
      }
    };

    ConsoleCollaborationEvents.setNodeEventHandler(handleIncomingNodeEvent);

    return () => {
      ConsoleCollaborationEvents.setNodeEventHandler(undefined);
    };
  }, [setNodes]);

  return nodeManagement;
};
