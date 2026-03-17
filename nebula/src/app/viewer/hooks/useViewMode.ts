import { useState, useCallback } from "react";

export type ViewMode = "flow" | "feature";

export function useViewMode() {
  const [viewMode, setViewMode] = useState<ViewMode>("flow");

  const switchToFlow = useCallback(() => {
    setViewMode("flow");
  }, []);

  const switchToFeature = useCallback(() => {
    setViewMode("feature");
  }, []);

  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => (prev === "flow" ? "feature" : "flow"));
  }, []);

  const isFlowMode = viewMode === "flow";
  const isFeatureMode = viewMode === "feature";

  return {
    viewMode,
    setViewMode,
    switchToFlow,
    switchToFeature,
    toggleViewMode,
    isFlowMode,
    isFeatureMode,
  };
}
