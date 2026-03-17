"use client";
import { motion } from "framer-motion";
import { Checkbox } from "@/components/ui/checkbox";
import { useTestRunSelection } from "../contexts/TestRunSelectionContext";
import { cn } from "@/lib/utils";

interface Feature {
  id: string;
  name: string;
  nodeIds: string[];
}

interface FeatureSelectionListProps {
  features: Feature[];
}

export function FeatureSelectionList({ features }: FeatureSelectionListProps) {
  const {
    selectedFlowIds,
    getFlowsForFeature,
    getFeatureSelectionStatus,
    toggleFeatureSelection,
    setSelectedFeature,
    selectedFeature,
    selectAll,
    deselectAll,
    areAllSelected,
  } = useTestRunSelection();

  // Check if some but not all flows are selected across all features
  const totalFlows = features.reduce(
    (acc, f) => acc + getFlowsForFeature(f.id).length,
    0,
  );
  const totalSelected = selectedFlowIds.size;
  const hasSomeSelected = totalSelected > 0 && totalSelected < totalFlows;

  const getSelectAllCheckedState = (): boolean | "indeterminate" => {
    if (areAllSelected) return true;
    if (hasSomeSelected) return "indeterminate";
    return false;
  };

  return (
    <div className="p-4 space-y-2">
      <div
        className="flex items-center gap-2 px-1 py-1.5 mb-2 cursor-pointer hover:bg-accent/20 rounded transition-colors"
        onClick={areAllSelected ? deselectAll : selectAll}
      >
        <Checkbox
          checked={getSelectAllCheckedState()}
          onCheckedChange={(checked) => (checked ? selectAll() : deselectAll())}
          onClick={(e) => e.stopPropagation()}
          className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
        />
        <span className="text-xs font-medium">
          {areAllSelected ? "Deselect All Features" : "Select All Features"}
        </span>
      </div>

      {features.map((feature, index) => {
        const flows = getFlowsForFeature(feature.id);
        const selectedCount = flows.filter((f) =>
          selectedFlowIds.has(f.id),
        ).length;
        const status = getFeatureSelectionStatus(feature.id);
        const isActive = selectedFeature === feature.id;

        const getSelectionText = () => {
          if (selectedCount === 0) {
            return "No flows selected";
          }
          return `${selectedCount}/${flows.length} flows selected`;
        };

        const getCheckedState = (): boolean | "indeterminate" => {
          if (status === "all") return true;
          if (status === "some") return "indeterminate";
          return false;
        };

        return (
          <motion.div
            key={feature.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-normal ease-default bg-background border-2",
              isActive
                ? "border-primary shadow-lg shadow-primary/10 bg-card"
                : "border-border bg-card hover:border-primary/30 hover:shadow-md",
            )}
            onClick={() => setSelectedFeature(feature.id)}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={getCheckedState()}
                onCheckedChange={() => toggleFeatureSelection(feature.id)}
                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div
                className={cn(
                  "font-medium text-sm truncate transition-colors duration-fast ease-default",
                  isActive ? "text-primary" : "text-foreground",
                )}
              >
                {feature.name}
              </div>
              <div className="text-xs text-muted-foreground">
                {getSelectionText()}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
