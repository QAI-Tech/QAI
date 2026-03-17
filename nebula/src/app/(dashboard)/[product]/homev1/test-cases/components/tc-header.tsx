"use client";

import type React from "react";
import { useState, useRef, useEffect } from "react";
import {
  ChevronLeft,
  Copy,
  Trash2,
  Plus,
  Loader2,
  Share2,
  Workflow,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TestCaseStatusDropdown } from "@/app/(dashboard)/[product]/homev1/test-cases/components/test-case-status-dropdown";
import { Combobox } from "@/components/ui/combobox-pop-search";
import { ConfirmationDialog } from "@/components/global/delete-confirmation-dialog";
import { useUser } from "@clerk/nextjs";
import { useDispatch } from "react-redux";
import { toast } from "sonner";
import { isQaiOrgUser, isQaiOrgAnalystUser } from "@/lib/constants";
import { useProductSwitcher } from "@/providers/product-provider";
import { addFeature, deleteFeature } from "@/app/store/featuresSlice";
import { updateTestCase } from "@/app/store/testCaseSlice";
import type {
  testCaseSchema,
  Feature,
  Criticality,
  TestCaseStatus,
} from "@/lib/types";
import type { AppDispatch } from "@/app/store/store";
import * as Sentry from "@sentry/nextjs";
import { useRouter } from "next/navigation";

interface TCHeaderProps {
  testCase: testCaseSchema;
  features: Feature[];
  onClose: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onCriticalityChange: (value: Criticality) => Promise<void>;
  onStatusChange: (status: TestCaseStatus) => Promise<void>;
  onTestCaseUpdate: (updatedTestCase: testCaseSchema) => Promise<boolean>;
  isLoading: {
    status: boolean;
    action?: string | null;
  };
  isStatusLoading: boolean;
  currentPosition?: number;
  totalCount?: number;
  showFlowViewer: () => void;
  isBrowserDroid: boolean;
  handleAddTestRun?: () => void;
  testRunId?: string;
  variant?: "default" | "minimal";
  titleClassName?: string;
  showTitle?: boolean;
  showFeatureSelector?: boolean;
}

export interface ComboboxOption {
  value: string;
  label: string;
  isAddFeature?: boolean;
}

export function TCHeader({
  testCase,
  features,
  onClose,
  onCopy,
  onDelete,
  onStatusChange,
  onTestCaseUpdate,
  isLoading,
  isStatusLoading,
  showFlowViewer,
  isBrowserDroid = false,
  handleAddTestRun,
  testRunId,
  variant = "default",
  titleClassName,
  showTitle = true,
  showFeatureSelector = true,
}: TCHeaderProps) {
  const { user } = useUser();
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const { productSwitcher } = useProductSwitcher();
  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;
  const isQaiUser = isQaiOrgUser(userOrgId) || isQaiOrgAnalystUser(userOrgId);
  const isDisabled = isLoading.status;

  // Add feature states
  const [showAddFeatureInput, setShowAddFeatureInput] = useState(false);
  const [newFeatureName, setNewFeatureName] = useState("");
  const [isAddingFeature, setIsAddingFeature] = useState(false);
  const newFeatureInputRef = useRef<HTMLInputElement>(null);

  const [showTitleInput, setShowTitleInput] = useState(false);
  const [titleValue, setTitleValue] = useState(testCase.title || "");
  const [isUpdatingTitle, setIsUpdatingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [showFeatureDeleteConfirmation, setShowFeatureDeleteConfirmation] =
    useState(false);
  const [featureToDelete, setFeatureToDelete] = useState<string | null>(null);
  const [featureNameToDelete, setFeatureNameToDelete] = useState<string>("");
  const [isDeletingFeature, setIsDeletingFeature] = useState(false);

  useEffect(() => {
    if (showAddFeatureInput && newFeatureInputRef.current) {
      newFeatureInputRef.current.focus();
    }
  }, [showAddFeatureInput]);

  useEffect(() => {
    if (showTitleInput && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [showTitleInput]);

  useEffect(() => {
    if (!showTitleInput) {
      setTitleValue(testCase.title || "");
    }
  }, [testCase.title, testCase.test_case_id, showTitleInput]);

  const getFeatureName = (featureId: string) => {
    const feature = features.find((f) => f.id === featureId);
    return feature?.name || "Select/Add feature...";
  };

  const getTitle = () => {
    return testCase.title || " ";
  };

  const handleTitleClick = () => {
    if (!isDisabled) {
      setShowTitleInput(true);
    }
  };

  const handleTitleSave = async () => {
    if (!testCase?.test_case_id || isUpdatingTitle) return;

    try {
      setIsUpdatingTitle(true);

      const updatedTestCase = {
        ...testCase,
        title: titleValue.trim(),
      } as testCaseSchema;

      const success = await onTestCaseUpdate(updatedTestCase);

      if (success) {
        toast.success("Title updated successfully");
        setShowTitleInput(false);
      }
    } catch (error) {
      console.error("Error updating title:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error("Failed to update title");
    } finally {
      setIsUpdatingTitle(false);
    }
  };

  const handleTitleCancel = () => {
    setTitleValue(testCase.title || "");
    setShowTitleInput(false);
  };

  const handleTitleInputBlur = () => {
    if (titleValue.trim() !== (testCase.title || "")) {
      handleTitleSave();
    } else {
      handleTitleCancel();
    }
  };

  const handleTitleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleTitleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleTitleCancel();
    }
  };

  const renderFeatureOption = (option: ComboboxOption) => {
    if (option.isAddFeature) {
      return (
        <div className="flex items-center text-purple-600 font-medium">
          <Plus className="h-4 w-4 mr-2" />
          {option.label}
        </div>
      );
    }

    return (
      <div className="flex justify-between items-center w-full group">
        <span>{option.label}</span>
        <Button
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => handleFeatureDeleteClick(e, option.value)}
          variant="ghost"
          className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Delete feature"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  // Feature options for dropdown
  const featureOptions: ComboboxOption[] = [
    {
      value: "add_new_feature",
      label: "Add a feature",
      isAddFeature: true,
    },
    ...features.map((feature) => ({
      value: feature.id,
      label: feature.name,
      isAddFeature: false,
    })),
  ];

  const handleFeatureChange = async (featureId: string) => {
    if (featureId === "add_new_feature") {
      setShowAddFeatureInput(true);
      return;
    }

    if (!testCase?.test_case_id || isLoading.status) return;

    const updatedTestCase = {
      ...testCase,
      feature_id: featureId,
    } as testCaseSchema;

    const success = await onTestCaseUpdate(updatedTestCase);

    if (success) {
      toast.success("Feature updated successfully");
    }
  };

  const handleFeatureDeleteClick = (e: React.MouseEvent, featureId: string) => {
    e.stopPropagation();

    const feature = features.find((f) => f.id === featureId);
    setFeatureToDelete(featureId);
    setFeatureNameToDelete(feature?.name || "");
    setShowFeatureDeleteConfirmation(true);
  };

  const handleConfirmFeatureDelete = async () => {
    if (!featureToDelete || isLoading.status || !productSwitcher.product_id)
      return;

    try {
      setIsDeletingFeature(true);
      const deleteData = {
        id: featureToDelete,
        product_id: productSwitcher.product_id,
      };

      const response = await fetch("/api/delete-feature", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(deleteData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `Failed to delete feature: ${errorData.error || "Unknown error"}`,
        );
      }

      // Update Redux store
      dispatch(deleteFeature(featureToDelete));

      // If current test case uses the deleted feature, reset the feature_id
      if (testCase?.feature_id === featureToDelete) {
        const updatedTestCase = {
          ...testCase,
          feature_id: "",
        } as testCaseSchema;
        await onTestCaseUpdate(updatedTestCase);
      }

      toast.success(`Feature "${featureNameToDelete}" deleted successfully`);
    } catch (error) {
      console.error("Error deleting feature:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to delete feature",
      );
    } finally {
      setIsDeletingFeature(false);
      setFeatureToDelete(null);
      setFeatureNameToDelete("");
      setShowFeatureDeleteConfirmation(false);
    }
  };

  const handleCancelFeatureDelete = () => {
    setFeatureToDelete(null);
    setShowFeatureDeleteConfirmation(false);
  };

  const handleAddFeature = async () => {
    if (
      !newFeatureName.trim() ||
      !productSwitcher.product_id ||
      isAddingFeature
    )
      return;

    try {
      setIsAddingFeature(true);

      const featureData = {
        product_id: productSwitcher.product_id,
        name: newFeatureName.trim(),
      };

      // Call the API to add the feature
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

      // Update Redux store
      dispatch(addFeature(newFeature));

      // Update the test case with the new feature
      const updatedTestCase = {
        ...testCase,
        feature_id: newFeature.id,
      } as testCaseSchema;

      const success = await onTestCaseUpdate(updatedTestCase);

      if (success) {
        // Update Redux store with the test case change
        dispatch(
          updateTestCase({
            id: testCase.test_case_id,
            updatedData: { feature_id: newFeature.id },
          }),
        );

        toast.success("Feature added and assigned successfully");
        setNewFeatureName("");
        setShowAddFeatureInput(false);
      }
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

  const handleInputBlur = () => {
    // Only add feature if there's a name entered
    if (newFeatureName.trim()) {
      handleAddFeature();
    } else {
      handleCancelAddFeature();
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddFeature();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancelAddFeature();
    }
  };

  const handleShare = () => {
    // navigator.clipboard.writeText(window.location.href);
    const domain = window.location.origin; // e.g. "https://example.com"

    // Build your own URL
    const customUrl = `${domain}/${productSwitcher.product_id}/test-cases?test_case_id=${testCase.test_case_id}`;

    // Copy to clipboard
    navigator.clipboard.writeText(customUrl);
    toast.success("Test case link copied");
  };

  const FeatureSelector = ({ className = "" }: { className?: string }) => (
    <div className={className}>
      {showAddFeatureInput ? (
        <div className="flex items-center gap-2">
          <input
            ref={newFeatureInputRef}
            value={newFeatureName}
            onChange={(e) => setNewFeatureName(e.target.value)}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
            placeholder="Enter feature name"
            className="font-instrument text-[15px] w-9/12 px-2 py-1.5 bg-transparent border-0 border-b border-gray-300 focus:outline-none focus:border-purple-500 placeholder:text-gray-400 placeholder:font-normal"
            autoFocus
            disabled={isAddingFeature}
          />
          {isAddingFeature && (
            <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
          )}
        </div>
      ) : (
        <div className="w-full overflow-hidden">
          <Combobox
            options={featureOptions}
            value={testCase.feature_id || ""}
            onChange={handleFeatureChange}
            placeholder="Select feature..."
            emptyMessage="No feature found."
            buttonLabel={getFeatureName(testCase.feature_id || "")}
            disabled={isDisabled}
            popoverClassName="w-[300px]"
            className="font-instrument text-[16px] font-semibold leading-[20px] tracking-[-0.01em] align-middle tabular-nums border-0 bg-transparent p-0 h-auto hover:bg-transparent focus:ring-0 truncate"
            renderOption={renderFeatureOption}
          />
        </div>
      )}
    </div>
  );

  const renderTitleEditor = (
    className = "",
    titleClassName = "",
    showTitle = true,
  ) => {
    if (!showTitle) return null;

    return (
      <div className={className}>
        {showTitleInput ? (
          <div className="flex items-center gap-2">
            <input
              ref={titleInputRef}
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleInputBlur}
              onKeyDown={handleTitleInputKeyDown}
              placeholder="Enter title"
              className="w-full px-2 py-1.5 bg-transparent border-0 border-b-2 border-gray-300 focus:outline-none focus:border-purple-500 placeholder:text-gray-400 placeholder:font-normal"
              disabled={isUpdatingTitle}
            />
            {isUpdatingTitle && (
              <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
            )}
          </div>
        ) : (
          <h1
            className={
              titleClassName ||
              "font-instrument text-[18px] font-medium leading-[22px] tracking-[-0.01em] text-gray-800 break-words"
            }
            title={getTitle()}
            onClick={handleTitleClick}
          >
            {testCase.title || "Add New Title"}
          </h1>
        )}
      </div>
    );
  };

  return (
    <>
      <ConfirmationDialog
        isOpen={showFeatureDeleteConfirmation}
        onOpenChange={(open) => {
          if (!open) {
            if (isDeletingFeature) return;
            handleCancelFeatureDelete();
          } else {
            setShowFeatureDeleteConfirmation(true);
          }
        }}
        title="Delete Feature"
        description={`Are you sure you want to delete the feature "${featureNameToDelete}"?`}
        confirmText="Delete"
        onConfirm={handleConfirmFeatureDelete}
        isLoading={isDeletingFeature}
      />

      {variant === "minimal" ? (
        <div className="flex w-full items-start">
          {showFeatureSelector && (
            <FeatureSelector className="min-w-[200px] max-w-[300px] flex-shrink-0 mr-4" />
          )}
          {renderTitleEditor("flex-1 min-w-0", titleClassName, showTitle)}
        </div>
      ) : (
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
          <div className="flex items-center">
            <Button
              variant="link"
              onClick={onClose}
              className="flex items-center gap-2 text-purple-600 hover:text-purple-700 w-[120px] h-[40px] py-3 px-4 gap-x-2 rounded-(--radius-button) opacity-100 shrink-0"
              disabled={isDisabled}
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="font-instrument font-normal text-[14px] leading-[16px]">
                Back
              </span>
            </Button>

            <div className="flex w-full items-center pl-4">
              <FeatureSelector className="min-w-[200px] max-w-[300px] flex-shrink-0" />
              <div className="h-6 border-l-2 border-gray-300 mx-4 flex-shrink-0"></div>
              {renderTitleEditor(
                "flex-1 min-w-0 pr-4",
                `font-instrument text-[18px] font-medium leading-[22px] tracking-[-0.01em] align-middle tabular-nums lining-nums text-gray-800 break-words ${
                  !testCase.title
                    ? "text-gray-400 cursor-pointer hover:text-gray-600"
                    : "cursor-pointer hover:bg-gray-50 px-2 py-1 rounded"
                }`,
                true,
              )}
            </div>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center gap-1 shrink-0 ml-3">
            {isQaiUser && !isBrowserDroid && (
              <div className="w-32">
                <TestCaseStatusDropdown
                  value={testCase.status as TestCaseStatus}
                  onChange={onStatusChange}
                  disabled={isDisabled}
                  isLoading={isStatusLoading}
                />
              </div>
            )}

            {testCase.metadata &&
              (() => {
                try {
                  const metadata = JSON.parse(testCase.metadata);
                  return (
                    metadata.flow_json &&
                    metadata.tc_graph_json && (
                      <Button
                        variant="outline"
                        size="icon"
                        className="flex items-center gap-2 h-[40px] rounded-[8px] border border-[#6B6A6A] bg-transparent"
                        onClick={showFlowViewer}
                        title="View Flow"
                        disabled={isDisabled}
                      >
                        <Workflow className="h-4 w-4" />
                      </Button>
                    )
                  );
                } catch (error) {
                  return null;
                }
              })()}

            <Button
              variant="outline"
              size="icon"
              className="flex items-center gap-2 h-[40px] rounded-[8px] border border-[#6B6A6A] bg-transparent"
              onClick={handleShare}
              title="Share test case link"
              disabled={isDisabled}
            >
              <Share2 className="h-4 w-4" />
            </Button>
            {!isBrowserDroid && (
              <Button
                variant="outline"
                className="flex items-center gap-2 h-[40px] rounded-[8px] border border-[#6B6A6A] bg-transparent whitespace-nowrap"
                onClick={onCopy}
                disabled={isDisabled}
                title="Copy test case"
              >
                <Copy className="h-4 w-4" />
              </Button>
            )}
            {isBrowserDroid && (
              <Button
                variant="outline"
                className="flex items-center gap-2 h-[40px] rounded-[8px] border border-[#6B6A6A] bg-transparent whitespace-nowrap"
                onClick={handleAddTestRun}
                disabled={isDisabled}
                title="Send to Nova"
              >
                <Play className="h-4 w-4" />
              </Button>
            )}
            {isBrowserDroid && testRunId && (
              <Button
                variant="outline"
                className="flex items-center gap-2 h-[40px] rounded-[8px] border border-[#6B6A6A] bg-transparent whitespace-nowrap"
                onClick={() => {
                  router.push(
                    `/${productSwitcher.product_id}/test-runs/${testRunId}`,
                  );
                }}
                disabled={isDisabled}
                title="View test run"
              >
                View Test Run
              </Button>
            )}

            <Button
              variant="outline"
              className="flex items-center gap-2 h-[40px] rounded-[8px] border-[#6B6A6A] bg-transparent whitespace-nowrap"
              onClick={onDelete}
              disabled={isDisabled}
            >
              <Trash2 className="h-4 w-4" />
              Delete Test
            </Button>
          </div>
        </header>
      )}
    </>
  );
}
