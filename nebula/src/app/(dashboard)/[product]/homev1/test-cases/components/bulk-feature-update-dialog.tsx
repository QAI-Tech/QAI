"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useProductSwitcher } from "@/providers/product-provider";
import { Combobox } from "@/components/ui/combobox-pop-search";
import type { testCaseSchema, Feature } from "@/lib/types";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/app/store/store";
import { addFeature } from "@/app/store/featuresSlice";
import { updateTestCase } from "@/app/store/testCaseSlice";
import * as Sentry from "@sentry/nextjs";

interface BulkFeatureUpdateDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  selectedTestCases: testCaseSchema[];
  features: Feature[];
  exitSelectionMode: () => void;
}

interface ComboboxOption {
  value: string;
  label: string;
  isFeature?: boolean;
}

export function BulkFeatureUpdateDialog({
  isOpen,
  onOpenChange,
  selectedTestCases,
  features,
  exitSelectionMode,
}: BulkFeatureUpdateDialogProps) {
  const { productSwitcher } = useProductSwitcher();
  const dispatch = useDispatch<AppDispatch>();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isAddingFeature, setIsAddingFeature] = useState(false);
  const [showAddFeatureInput, setShowAddFeatureInput] = useState(false);
  const [newFeatureName, setNewFeatureName] = useState("");
  const [selectedFeatureId, setSelectedFeatureId] = useState<string>("");
  const newFeatureInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedFeatureId("");
      setShowAddFeatureInput(false);
      setNewFeatureName("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (showAddFeatureInput && newFeatureInputRef.current) {
      newFeatureInputRef.current.focus();
    }
  }, [showAddFeatureInput]);

  const mapFeaturesToOptions = (features: Feature[]): ComboboxOption[] => {
    const options = features.map((feature) => ({
      value: feature.id,
      label: feature.name,
      isFeature: true,
    }));

    options.unshift({
      value: "add_new_feature",
      label: "Add a feature",
      isFeature: false,
    });

    return options;
  };

  const handleFeatureChange = (value: string) => {
    if (value === "add_new_feature") {
      setShowAddFeatureInput(true);
      return;
    }
    setSelectedFeatureId(value);
  };

  const handleAddFeature = async () => {
    if (!productSwitcher.product_id || !newFeatureName.trim()) return;

    try {
      setIsAddingFeature(true);

      const featureData = {
        product_id: productSwitcher.product_id,
        name: newFeatureName,
      };

      const response = await fetch("/api/add-feature", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(featureData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `Failed to add feature: ${errorData.error || "Unknown error"}`,
        );
      }

      const newFeature: Feature = await response.json();
      dispatch(addFeature(newFeature));

      setSelectedFeatureId(newFeature.id);
      setShowAddFeatureInput(false);
      setNewFeatureName("");

      toast.success("Feature added successfully");
    } catch (error) {
      console.error("Error adding feature:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error(
        error instanceof Error ? error.message : "Failed to add feature",
      );
    } finally {
      setIsAddingFeature(false);
    }
  };

  const handleCancelAddFeature = () => {
    setShowAddFeatureInput(false);
    setNewFeatureName("");
  };

  const updateTestCaseFeatures = async () => {
    if (!selectedFeatureId) {
      toast.error("Please select/add a feature first");
      return;
    }

    try {
      setIsUpdating(true);

      const updatePromises = selectedTestCases.map(async (testCase) => {
        try {
          const updatedTestCase = {
            ...testCase,
            feature_id: selectedFeatureId,
          };

          const response = await fetch("/api/update-test-case", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ testCase: updatedTestCase }),
          });

          if (!response.ok) {
            throw new Error(
              `Failed to update test case ${testCase.test_case_id}`,
            );
          }

          dispatch(
            updateTestCase({
              id: testCase.test_case_id,
              updatedData: { feature_id: selectedFeatureId },
            }),
          );

          return { testCaseId: testCase.test_case_id, success: true };
        } catch (error) {
          console.error(
            `Error updating test case ${testCase.test_case_id}:`,
            error,
          );
          return { testCaseId: testCase.test_case_id, success: false, error };
        }
      });

      const results = await Promise.all(updatePromises);

      const successful = results.filter((result) => result.success);
      const failed = results.filter((result) => !result.success);

      if (successful.length > 0) {
        const feature = features.find((f) => f.id === selectedFeatureId);
        toast.success(
          `${successful.length} test cases updated to feature '${feature?.name || "selected feature"}'`,
        );
      }

      if (failed.length > 0) {
        toast.error(`Failed to update ${failed.length} test cases`);
        Sentry.captureMessage(
          `Failed to update ${failed.length} test cases in bulk feature update`,
          {
            level: "error",
            tags: { priority: "high" },
          },
        );
        console.error("Failed updates:", failed);
      }

      if (successful.length > 0) {
        onOpenChange(false);
        exitSelectionMode();
      }
    } catch (error) {
      console.error("Error updating features:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error("Failed to update features");
    } finally {
      setIsUpdating(false);
    }
  };

  const renderFeatureOption = (option: ComboboxOption) => {
    if (!option.isFeature) {
      return (
        <div className="flex items-center text-purple-600 font-medium">
          <Plus className="h-4 w-4 mr-2" />
          {option.label}
        </div>
      );
    }
    return <span>{option.label}</span>;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Update Features</DialogTitle>
          <DialogDescription>
            Select a feature to assign to the selected test cases.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>Feature</Label>
            {showAddFeatureInput ? (
              <div className="flex items-center gap-2">
                <Input
                  ref={newFeatureInputRef}
                  value={newFeatureName}
                  onChange={(e) => setNewFeatureName(e.target.value)}
                  placeholder="Enter feature name"
                  className="flex-1"
                  disabled={isAddingFeature}
                />
                <Button
                  onClick={handleAddFeature}
                  disabled={!newFeatureName.trim() || isAddingFeature}
                  className="bg-purple-500 hover:bg-purple-600 text-white"
                >
                  {isAddingFeature ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Add"
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCancelAddFeature}
                  disabled={isAddingFeature}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Combobox
                options={mapFeaturesToOptions(features)}
                value={selectedFeatureId}
                onChange={handleFeatureChange}
                placeholder="Search features..."
                emptyMessage="No features found."
                buttonLabel="Select feature..."
                disabled={isUpdating}
                renderOption={renderFeatureOption}
                popoverClassName="w-[var(--radix-popover-trigger-width)] min-w-full"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Selected Test Cases</Label>
            <div className="p-3 border rounded-md bg-gray-50">
              <p className="text-sm text-gray-600">
                {selectedTestCases.length} test case
                {selectedTestCases.length !== 1 ? "s" : ""} selected
              </p>
              {selectedTestCases.length > 0 && (
                <div className="mt-2 max-h-20 overflow-y-auto">
                  <p className="text-xs text-gray-500">
                    Test cases:{" "}
                    {selectedTestCases.map((tc) => tc.test_case_id).join(", ")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isUpdating}
          >
            Cancel
          </Button>
          <Button
            onClick={updateTestCaseFeatures}
            className="bg-purple-600 hover:bg-purple-700 text-white"
            disabled={
              showAddFeatureInput ||
              !selectedFeatureId ||
              isUpdating ||
              selectedTestCases.length === 0
            }
          >
            {isUpdating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              "Update Features"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
