// @ts-nocheck
import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { Feature } from "../components/FlowManager";
import { ConsoleCollaborationEvents } from "../types/collaborationEvents";

interface UseFeatureManagementProps {
  // No dependencies needed - this is pure state management
}

export const useFeatureManagement = (props?: UseFeatureManagementProps) => {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [visibleFeatureIds, setVisibleFeatureIds] = useState<string[]>([]);
  const { toast } = useToast();

  // Feature visibility management
  const toggleFeatureVisibility = useCallback((featureId: string) => {
    setVisibleFeatureIds((prev) =>
      prev.includes(featureId)
        ? prev.filter((id) => id !== featureId)
        : [...prev, featureId],
    );
  }, []);

  const hideAllFeatures = useCallback(() => {
    setVisibleFeatureIds([]);
  }, []);

  const toggleAllFeatureVisibility = useCallback(() => {
    if (visibleFeatureIds.length === features.length) {
      // All visible, hide all
      setVisibleFeatureIds([]);
    } else {
      // Some or none visible, show all
      setVisibleFeatureIds(features.map((f) => f.id));
    }
  }, [features, visibleFeatureIds]);

  // Add a new feature
  const addFeature = useCallback(
    (feature: Feature) => {
      setFeatures((prev) => [...prev, feature]);
      setVisibleFeatureIds((prev) => [...prev, feature.id]);

      toast({
        title: "Feature created",
        description: `Feature "${feature.name}" has been created successfully.`,
      });
    },
    [toast],
  );

  // Delete a feature
  const deleteFeature = useCallback(
    (featureId: string) => {
      setFeatures((features) => features.filter((f) => f.id !== featureId));
      setVisibleFeatureIds((prev) => prev.filter((id) => id !== featureId));

      toast({
        title: "Feature deleted",
        description: "Feature has been deleted successfully.",
      });
    },
    [toast],
  );

  // Rename a feature
  const renameFeature = useCallback((featureId: string, newName: string) => {
    setFeatures((features) =>
      features.map((f) => (f.id === featureId ? { ...f, name: newName } : f)),
    );
  }, []);

  // Update a feature (preserves order)
  const updateFeature = useCallback(
    (featureId: string, updates: Partial<Feature>) => {
      setFeatures((features) =>
        features.map((f) => (f.id === featureId ? { ...f, ...updates } : f)),
      );
    },
    [],
  );

  // Reorder features
  const reorderFeatures = useCallback((reorderedFeatures: Feature[]) => {
    setFeatures(reorderedFeatures);
    const collaboarationEvents = new ConsoleCollaborationEvents();
    collaboarationEvents.reorderFeatures(reorderedFeatures);
  }, []);

  // Check if a node belongs to any existing feature
  const getNodeFeature = useCallback(
    (nodeId: string): Feature | null => {
      return (
        features.find((feature) => feature.nodeIds.includes(nodeId)) || null
      );
    },
    [features],
  );

  // Get nodes that belong to existing features from a list
  const getConflictingNodes = useCallback(
    (
      nodeIds: string[],
      excludeFeatureId?: string | null,
    ): { nodeId: string; feature: Feature }[] => {
      const conflicts: { nodeId: string; feature: Feature }[] = [];

      nodeIds.forEach((nodeId) => {
        const existingFeature = getNodeFeature(nodeId);
        if (existingFeature && existingFeature.id !== excludeFeatureId) {
          conflicts.push({ nodeId, feature: existingFeature });
        }
      });

      return conflicts;
    },
    [getNodeFeature],
  );

  // Bulk set features (used for file import)
  const setAllFeatures = useCallback((newFeatures: Feature[]) => {
    setFeatures(newFeatures);
    setVisibleFeatureIds(newFeatures.map((f) => f.id)); // Make imported features visible by default
  }, []);

  // Get feature by ID
  const getFeatureById = useCallback(
    (featureId: string) => {
      return features.find((feature) => feature.id === featureId) || null;
    },
    [features],
  );

  // Get visible features
  const visibleFeatures = features.filter((feature) =>
    visibleFeatureIds.includes(feature.id),
  );

  return {
    // State
    features,
    visibleFeatureIds,
    visibleFeatures,

    // Operations
    addFeature,
    deleteFeature,
    renameFeature,
    updateFeature,
    reorderFeatures,
    toggleFeatureVisibility,
    hideAllFeatures,
    toggleAllFeatureVisibility,
    getNodeFeature,
    getConflictingNodes,
    setAllFeatures,
    getFeatureById,

    // For external state setters (file operations, etc.)
    setFeatures,
    setVisibleFeatureIds,
  };
};
