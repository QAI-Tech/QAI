import { useEffect, useCallback } from "react";
import { Feature } from "../components/FlowManager";
import { ConsoleCollaborationEvents } from "../types/collaborationEvents";

interface UseFeatureCollaborationProps {
  setFeatures: React.Dispatch<React.SetStateAction<Feature[]>>;
  setVisibleFeatureIds: React.Dispatch<React.SetStateAction<string[]>>;
}

export const useFeatureCollaboration = ({
  setFeatures,
  setVisibleFeatureIds,
}: UseFeatureCollaborationProps) => {
  const upsertRemoteFeatures = useCallback(
    (incomingFeatures: any[]) => {
      if (!incomingFeatures || !Array.isArray(incomingFeatures)) return;

      setFeatures((currentFeatures) => {
        const updatedFeatures = [...currentFeatures];
        const newFeatureIds: string[] = [];

        incomingFeatures.forEach((incomingFeature) => {
          const existingIndex = updatedFeatures.findIndex(
            (f) => f.id === incomingFeature.id,
          );

          const newFeature: Feature = {
            id: incomingFeature.id,
            name: incomingFeature.name,
            nodeIds: incomingFeature.nodeIds || incomingFeature.node_ids || [],
            isCollapsed: incomingFeature.collapsed || false,
          };

          if (existingIndex !== -1) {
            updatedFeatures[existingIndex] = newFeature;
          } else {
            updatedFeatures.push(newFeature);
            newFeatureIds.push(incomingFeature.id);
          }
        });

        if (newFeatureIds.length > 0) {
          setVisibleFeatureIds((prev) => {
            const combined = [...prev, ...newFeatureIds];
            return Array.from(new Set(combined));
          });
        }

        return updatedFeatures;
      });
    },
    [setFeatures, setVisibleFeatureIds],
  );

  const applyRemoteFeatureUpdates = useCallback(
    (updates: any[]) => {
      if (!updates || !Array.isArray(updates)) return;

      setFeatures((currentFeatures) => {
        return currentFeatures.map((feature) => {
          const update = updates.find(
            (u) => (u?.id ?? u?.featureId ?? u?.feature_id) === feature.id,
          );
          if (!update || !update.updates) return feature;

          const rawName = update.updates?.name;
          const nextName =
            typeof rawName === "string"
              ? rawName
              : typeof rawName?.new === "string"
                ? rawName.new
                : undefined;

          const rawNodeIds =
            update.updates?.nodeIds ?? update.updates?.node_ids;
          const nextNodeIds = Array.isArray(rawNodeIds)
            ? rawNodeIds
            : Array.isArray(rawNodeIds?.new)
              ? rawNodeIds.new
              : undefined;

          const rawCollapsed = update.updates?.collapsed;
          const nextCollapsed =
            typeof rawCollapsed === "boolean"
              ? rawCollapsed
              : typeof rawCollapsed?.new === "boolean"
                ? rawCollapsed.new
                : undefined;

          return {
            ...feature,
            ...(nextName !== undefined && { name: nextName }),
            ...(nextNodeIds !== undefined && { nodeIds: nextNodeIds }),
            ...(nextCollapsed !== undefined && { isCollapsed: nextCollapsed }),
          };
        });
      });
    },
    [setFeatures],
  );

  const deleteRemoteFeatures = useCallback(
    (featuresToDelete: any[]) => {
      if (!featuresToDelete || !Array.isArray(featuresToDelete)) return;

      const idsToDelete = featuresToDelete.map((f) => f.id);

      setFeatures((currentFeatures) => {
        return currentFeatures.filter((f) => !idsToDelete.includes(f.id));
      });

      setVisibleFeatureIds((prev) =>
        prev.filter((id) => !idsToDelete.includes(id)),
      );
    },
    [setFeatures, setVisibleFeatureIds],
  );

  const reorderRemoteFeatures = useCallback(
    (reorderedFeatures: any[]) => {
      if (!reorderedFeatures || !Array.isArray(reorderedFeatures)) return;

      setFeatures((currentFeatures) => {
        const featureMap = new Map(currentFeatures.map((f) => [f.id, f]));
        const newFeatureIds: string[] = [];

        const newFeatures: Feature[] = [];
        reorderedFeatures.forEach((f) => {
          const existingFeature = featureMap.get(f.id);
          if (existingFeature) {
            newFeatures.push({
              ...existingFeature,
              name: f.name || existingFeature.name,
              nodeIds: f.nodeIds || f.node_ids || existingFeature.nodeIds,
              isCollapsed: f.collapsed ?? existingFeature.isCollapsed,
            });
            featureMap.delete(f.id);
          } else {
            newFeatures.push({
              id: f.id,
              name: f.name,
              nodeIds: f.nodeIds || f.node_ids || [],
              isCollapsed: f.collapsed || false,
            });
            newFeatureIds.push(f.id);
          }
        });

        featureMap.forEach((feature) => {
          newFeatures.push(feature);
        });

        if (newFeatureIds.length > 0) {
          setVisibleFeatureIds((prev) => {
            const combined = [...prev, ...newFeatureIds];
            return Array.from(new Set(combined));
          });
        }

        return newFeatures;
      });
    },
    [setFeatures, setVisibleFeatureIds],
  );

  const handleFeatureEvent = useCallback(
    (
      eventName:
        | "features_create"
        | "features_update"
        | "features_delete"
        | "reorder_features",
      payload: any,
    ) => {
      console.log(
        "[useFeatureCollaboration] Received event:",
        eventName,
        payload,
      );
      const actualData = payload?.data?.data || payload?.data || payload;
      console.log("[useFeatureCollaboration] Extracted data:", actualData);

      switch (eventName) {
        case "features_create":
          upsertRemoteFeatures(actualData);
          break;
        case "features_update":
          applyRemoteFeatureUpdates(actualData);
          break;
        case "features_delete":
          deleteRemoteFeatures(actualData);
          break;
        case "reorder_features":
          console.log(
            "[useFeatureCollaboration] Calling reorderRemoteFeatures with:",
            actualData,
          );
          reorderRemoteFeatures(actualData);
          break;
        default:
          break;
      }
    },
    [
      upsertRemoteFeatures,
      applyRemoteFeatureUpdates,
      deleteRemoteFeatures,
      reorderRemoteFeatures,
    ],
  );

  useEffect(() => {
    ConsoleCollaborationEvents.setFeatureEventHandler(handleFeatureEvent);

    return () => {
      ConsoleCollaborationEvents.setFeatureEventHandler(undefined);
    };
  }, [handleFeatureEvent]);
};
