"use client";
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  ReactNode,
} from "react";
import { Flow } from "@/app/(editor)/components/FlowManager";
import {
  UNASSIGNED_FLOWS_FEATURE_ID,
  UNASSIGNED_FLOWS_FEATURE_NAME,
} from "@/lib/constants";

interface Feature {
  id: string;
  name: string;
  nodeIds: string[];
}

interface TestRunSelectionContextType {
  isSelectionMode: boolean;
  selectedFlowIds: Set<string>;
  features: Feature[];
  startSelection: () => void;
  cancelSelection: () => void;
  toggleFlowSelection: (flowId: string) => void;
  toggleFeatureSelection: (featureId: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  areAllSelected: boolean;
  getFeatureSelectionStatus: (featureId: string) => "all" | "some" | "none";
  getFlowsForFeature: (featureId: string) => Flow[];
  selectedFeature: string;
  setSelectedFeature: (featureId: string) => void;
}

const TestRunSelectionContext =
  createContext<TestRunSelectionContextType | null>(null);

interface TestRunSelectionProviderProps {
  children: ReactNode;
  flows: Flow[];
  features: Feature[];
}

export function TestRunSelectionProvider({
  children,
  flows,
  features,
}: TestRunSelectionProviderProps) {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedFlowIds, setSelectedFlowIds] = useState<Set<string>>(
    new Set(),
  );
  // Only flows with screens (non-draft) can be selected for test runs
  const selectableFlows = useMemo(
    () =>
      flows.filter(
        (flow) =>
          Array.isArray(flow.pathNodeIds) && flow.pathNodeIds.length > 0,
      ),
    [flows],
  );

  const featuresForSelection = useMemo(() => {
    const orphanedSelectableFlows = selectableFlows.filter(
      (flow) => !flow.feature_id || flow.feature_id === "",
    );

    if (orphanedSelectableFlows.length === 0) return features;

    return [
      ...features,
      {
        id: UNASSIGNED_FLOWS_FEATURE_ID,
        name: UNASSIGNED_FLOWS_FEATURE_NAME,
        nodeIds: [],
      },
    ];
  }, [features, selectableFlows]);

  const [selectedFeature, setSelectedFeature] = useState(
    featuresForSelection[0]?.id || "",
  );

  useEffect(() => {
    if (
      featuresForSelection.length > 0 &&
      !featuresForSelection.some((f) => f.id === selectedFeature)
    ) {
      setSelectedFeature(featuresForSelection[0].id);
    }
  }, [featuresForSelection, selectedFeature]);

  const getFlowsForFeature = useCallback(
    (featureId: string) => {
      if (featureId === UNASSIGNED_FLOWS_FEATURE_ID) {
        return selectableFlows.filter(
          (flow) => !flow.feature_id || flow.feature_id === "",
        );
      }

      const hasAnyFlowsWithFeatureId = selectableFlows.some(
        (flow) => flow.feature_id,
      );

      const flowsWithFeatureId = selectableFlows.filter(
        (flow) => flow.feature_id === featureId,
      );

      if (!hasAnyFlowsWithFeatureId) {
        const feature = features.find((f) => f.id === featureId);
        if (feature && feature.nodeIds && feature.nodeIds.length > 0) {
          return selectableFlows.filter((flow) =>
            feature.nodeIds.includes(flow.startNodeId),
          );
        }
      }

      return flowsWithFeatureId;
    },
    [features, selectableFlows],
  );

  const startSelection = useCallback(() => {
    setIsSelectionMode(true);
    // Default: select all selectable flows across all features
    const allFlowIds = new Set(selectableFlows.map((f) => f.id));
    setSelectedFlowIds(allFlowIds);
  }, [selectableFlows]);

  const cancelSelection = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedFlowIds(new Set());
  }, []);

  const toggleFlowSelection = useCallback((flowId: string) => {
    setSelectedFlowIds((prev) => {
      const next = new Set(prev);
      if (next.has(flowId)) {
        next.delete(flowId);
      } else {
        next.add(flowId);
      }
      return next;
    });
  }, []);

  const toggleFeatureSelection = useCallback(
    (featureId: string) => {
      const featureFlows = getFlowsForFeature(featureId);
      const featureFlowIds = featureFlows.map((f) => f.id);

      setSelectedFlowIds((prev) => {
        const allSelected = featureFlowIds.every((id) => prev.has(id));
        const next = new Set(prev);
        if (allSelected) {
          // Deselect all flows in this feature
          featureFlowIds.forEach((id) => next.delete(id));
        } else {
          // Select all flows in this feature
          featureFlowIds.forEach((id) => next.add(id));
        }
        return next;
      });
    },
    [getFlowsForFeature],
  );

  const selectAll = useCallback(() => {
    const allFlowIds = new Set(selectableFlows.map((f) => f.id));
    setSelectedFlowIds(allFlowIds);
  }, [selectableFlows]);

  const deselectAll = useCallback(() => {
    setSelectedFlowIds(new Set());
  }, []);

  const areAllSelected = useMemo(() => {
    return (
      selectableFlows.length > 0 &&
      selectableFlows.every((f) => selectedFlowIds.has(f.id))
    );
  }, [selectableFlows, selectedFlowIds]);

  const getFeatureSelectionStatus = useCallback(
    (featureId: string): "all" | "some" | "none" => {
      const featureFlows = getFlowsForFeature(featureId);
      if (featureFlows.length === 0) return "none";

      const selectedCount = featureFlows.filter((f) =>
        selectedFlowIds.has(f.id),
      ).length;

      if (selectedCount === 0) return "none";
      if (selectedCount === featureFlows.length) return "all";
      return "some";
    },
    [getFlowsForFeature, selectedFlowIds],
  );

  const value = useMemo(
    () => ({
      isSelectionMode,
      selectedFlowIds,
      features: featuresForSelection,
      startSelection,
      cancelSelection,
      toggleFlowSelection,
      toggleFeatureSelection,
      selectAll,
      deselectAll,
      areAllSelected,
      getFeatureSelectionStatus,
      getFlowsForFeature,
      selectedFeature,
      setSelectedFeature,
    }),
    [
      isSelectionMode,
      selectedFlowIds,
      featuresForSelection,
      startSelection,
      cancelSelection,
      toggleFlowSelection,
      toggleFeatureSelection,
      selectAll,
      deselectAll,
      areAllSelected,
      getFeatureSelectionStatus,
      getFlowsForFeature,
      selectedFeature,
      setSelectedFeature,
    ],
  );

  return (
    <TestRunSelectionContext.Provider value={value}>
      {children}
    </TestRunSelectionContext.Provider>
  );
}

export function useTestRunSelection() {
  const context = useContext(TestRunSelectionContext);
  if (!context) {
    throw new Error(
      "useTestRunSelection must be used within TestRunSelectionProvider",
    );
  }
  return context;
}
