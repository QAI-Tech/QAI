"use client";

import type React from "react";
import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useDispatch, useSelector } from "react-redux";
import { useUser } from "@clerk/nextjs";
import type { AppDispatch, RootState } from "@/app/store/store";
import { TCHeader } from "../components/tc-header";
import { TCFrame } from "../components/tc-frame";
import { TCDetailsSection } from "../components/tc-details-section";
import { TCCommentsSection } from "../components/tc-comments-section";
import { DeleteConfirmationDialog } from "../components/delete-confirmation-dialog";
import AddTestCaseManually from "../components/add-test-case-manually";

import type {
  Feature,
  testCaseSchema,
  Criticality,
  TestCaseStatus,
  CommentType,
} from "@/lib/types";
import { useProductSwitcher } from "@/providers/product-provider";
import {
  GCS_BUCKET_URL,
  PRODUCTION_ORGANISATION_ID,
  PRODUCT_DESIGN_ASSETS_BUCKET_NAME,
} from "@/lib/constants";
import { deleteTestCase, updateTestCase } from "@/app/store/testCaseSlice";
import TestCaseFlowViewer from "@/components/global/show-flow-viewer";
import * as Sentry from "@sentry/nextjs";

interface TestCaseDetailsModalProps {
  testCase: testCaseSchema | null;
  features: Feature[];
  allTestCases: testCaseSchema[];
  onClose: () => void;
  onNextTestCase?: () => void;
  onPrevTestCase?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  currentPosition?: number;
  totalCount?: number;
}

type LoadingState = {
  status: boolean;
  action?: string | null;
};

export function TestCaseDetailsModal({
  testCase,
  features,
  allTestCases,
  onClose,
  onNextTestCase = () => {},
  onPrevTestCase = () => {},
  hasNext = false,
  hasPrev = false,
  currentPosition = 0,
  totalCount = 0,
}: TestCaseDetailsModalProps) {
  // Add selector to get updated test case from Redux
  const updatedTestCaseFromRedux = useSelector((state: RootState) =>
    state.testCases.testCases.find(
      (tc) => tc.test_case_id === testCase?.test_case_id,
    ),
  );

  const [filteredTestCase, setFilteredTestCase] =
    useState<testCaseSchema | null>(testCase);
  const [isLoading, setIsLoading] = useState<LoadingState>({
    status: false,
    action: null,
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [showFlowViewer, setshowFlowViewer] = useState(false);
  const { user } = useUser();
  const organisationId =
    user?.publicMetadata?.organisation_id || PRODUCTION_ORGANISATION_ID;
  const dispatch = useDispatch<AppDispatch>();
  const [isVisible, setIsVisible] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [comments, setComments] = useState<CommentType[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [criticality, setCriticality] = useState<Criticality | "">(
    (testCase?.criticality as Criticality) || "",
  );

  const { productSwitcher } = useProductSwitcher();

  // URL parameter management functions
  const updateUrlParameter = useCallback((testCaseId: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set("test_case_id", testCaseId);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", newUrl);
  }, []);

  const removeUrlParameter = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete("test_case_id");
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  }, []);

  useEffect(() => {
    if (testCase) {
      setFilteredTestCase(testCase);
      setCriticality(testCase.criticality);
      updateUrlParameter(testCase.test_case_id);
    }
  }, [testCase, updateUrlParameter]);

  useEffect(() => {
    if (testCase?.criticality) {
      setCriticality(testCase.criticality as Criticality);
    }
  }, [testCase]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    removeUrlParameter();
    setTimeout(() => {
      onClose();
    }, 300);
  }, [onClose, removeUrlParameter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isEditingText =
        ["INPUT", "TEXTAREA"].includes(target.tagName) ||
        target.isContentEditable;

      // Check if a scenarios dialog is open
      const isScenariosDialogOpen =
        document.querySelector("[data-radix-dialog-content]") !== null;

      // Check if the event is within Handsontable
      const isInHandsontable =
        target.closest(".handsontable") || target.closest(".htContextMenu");

      if (event.key === "Escape") {
        handleClose();
      } else if (
        !isEditingText &&
        !isScenariosDialogOpen &&
        !isInHandsontable
      ) {
        // Only navigate between test cases if:
        // 1. Not editing text
        // 2. Not in a scenarios dialog
        // 3. Not interacting with Handsontable
        if (event.key === "ArrowRight" && hasNext && !showFlowViewer) {
          onNextTestCase();
        } else if (event.key === "ArrowLeft" && hasPrev && !showFlowViewer) {
          onPrevTestCase();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", handleKeyDown, {
        capture: true,
      } as EventListenerOptions);
  }, [
    onNextTestCase,
    onPrevTestCase,
    hasNext,
    hasPrev,
    handleClose,
    showFlowViewer,
  ]);

  // Load comments
  useEffect(() => {
    if (filteredTestCase) {
      let existingComments: CommentType[] = [];
      if (filteredTestCase.comments) {
        try {
          const parsedComments = JSON.parse(filteredTestCase.comments);
          if (Array.isArray(parsedComments)) {
            existingComments = parsedComments;
          }
        } catch (error) {
          console.error("Error parsing comments:", error);
        }
      }
      setComments(existingComments);
    }
  }, [filteredTestCase]);

  // Update local state when Redux state changes (eg, after adding a feature)
  useEffect(() => {
    if (
      updatedTestCaseFromRedux &&
      updatedTestCaseFromRedux.feature_id !== filteredTestCase?.feature_id
    ) {
      setFilteredTestCase(updatedTestCaseFromRedux);
    }
  }, [updatedTestCaseFromRedux, filteredTestCase?.feature_id]);

  useEffect(() => {
    if (
      updatedTestCaseFromRedux &&
      updatedTestCaseFromRedux.screenshot_url !==
        filteredTestCase?.screenshot_url
    ) {
      setFilteredTestCase((prevState) => ({
        ...prevState!,
        screenshot_url: updatedTestCaseFromRedux.screenshot_url,
      }));
    }
  }, [updatedTestCaseFromRedux, filteredTestCase]);

  useEffect(() => {
    if (updatedTestCaseFromRedux?.title) {
      setFilteredTestCase((prevState) => {
        if (prevState && prevState.title !== updatedTestCaseFromRedux.title) {
          return {
            ...prevState,
            title: updatedTestCaseFromRedux.title,
          };
        }
        return prevState;
      });
    }
  }, [updatedTestCaseFromRedux?.title]);

  const handleUpdateTestCase = async (testCaseToUpdate?: testCaseSchema) => {
    try {
      setIsLoading({ status: true, action: "saving" });
      const testCaseData =
        testCaseToUpdate || (filteredTestCase as testCaseSchema);

      const cleanedTestCase = cleanTestCase(testCaseData);

      // Handles comments
      if (testCaseToUpdate?.comments) {
        if (typeof testCaseToUpdate.comments === "string") {
          try {
            JSON.parse(testCaseToUpdate.comments);
            cleanedTestCase.comments = testCaseToUpdate.comments;
          } catch {
            cleanedTestCase.comments = JSON.stringify([
              testCaseToUpdate.comments,
            ]);
          }
        } else {
          cleanedTestCase.comments = JSON.stringify(testCaseToUpdate.comments);
        }
      } else if (comments.length > 0) {
        cleanedTestCase.comments = JSON.stringify(comments);
      } else {
        cleanedTestCase.comments = null;
      }

      const response = await fetch("/api/update-test-case", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ testCase: cleanedTestCase }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `Failed to save test case: ${errorData.error || response.statusText}`,
        );
      }
      // Update Redux AFTER successful API call
      dispatch(
        updateTestCase({
          id: cleanedTestCase?.test_case_id as string,
          updatedData: cleanedTestCase as testCaseSchema,
        }),
      );

      setFilteredTestCase(cleanedTestCase as testCaseSchema);

      if (!testCaseToUpdate) {
        toast.success("Test case updated successfully");
      }

      return true;
    } catch (error) {
      console.error("Error saving test case:", error);
      Sentry.captureException(error, {
        level: "error",
        tags: { priority: "high" },
      });
      toast.error("Failed to update test case");
      return false;
    } finally {
      setIsLoading({ status: false, action: null });
    }
  };

  const handleCriticalityChange = async (value: Criticality) => {
    if (!filteredTestCase?.test_case_id || isLoading.status) return;
    setCriticality(value);

    const updatedTestCase = {
      ...filteredTestCase,
      criticality: value,
    } as testCaseSchema;

    setFilteredTestCase(updatedTestCase);
    await handleUpdateTestCase(updatedTestCase);
  };

  const handleStatusChange = async (newStatus: TestCaseStatus) => {
    if (!filteredTestCase?.test_case_id || isLoading.status) return;

    const updatedTestCase = {
      ...filteredTestCase,
      status: newStatus,
    } as testCaseSchema;

    setFilteredTestCase(updatedTestCase);
    const success = await handleUpdateTestCase(updatedTestCase);

    if (success) {
      toast.success(`Test case status updated to ${newStatus}`);
    }
  };

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    try {
      setIsUploading(true);
      const images = Array.from(files);
      const image = images[0];

      const extension = image.type.split("/")[1];
      const product_id = productSwitcher.product_id;

      if (!product_id) {
        toast.error("No product selected");
        return;
      }

      const uploadPath = `${organisationId}/${product_id}/${filteredTestCase?.feature_id}/${filteredTestCase?.test_case_id}_frame.${extension}`;

      const signedUrlResponse = await fetch(
        `/api/generate-instructions?getSignedUrl=true&bucketName=${PRODUCT_DESIGN_ASSETS_BUCKET_NAME}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: uploadPath,
            contentType: image.type,
          }),
        },
      );

      if (!signedUrlResponse.ok) {
        throw new Error("Failed to get signed URL for image");
      }

      const { signedUrl, fileName: imageFileName } =
        await signedUrlResponse.json();
      const fileName = imageFileName.replace("gs://", "");

      const uploadResponse = await fetch(signedUrl, {
        method: "PUT",
        body: image,
        headers: {
          "Content-Type": image.type,
        },
        mode: "cors",
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload image: ${uploadResponse.status}`);
      }

      // Update local state
      setFilteredTestCase((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          screenshot_url: `${GCS_BUCKET_URL}${fileName}`,
        };
      });

      // Update the test case in the database
      const updatedTestCase = {
        ...filteredTestCase,
        screenshot_url: `${GCS_BUCKET_URL}${fileName}`,
      } as testCaseSchema;

      await handleUpdateTestCase(updatedTestCase);

      // Update Redux store
      dispatch(
        updateTestCase({
          id: filteredTestCase!.test_case_id,
          updatedData: { screenshot_url: `${GCS_BUCKET_URL}${fileName}` },
        }),
      );

      toast.success("Image uploaded successfully");
    } catch (error) {
      console.error("Error uploading image:", error);
      Sentry.captureException(error, {
        level: "error",
        tags: { priority: "high" },
      });
      toast.error(
        error instanceof Error ? error.message : "Failed to upload image",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirmation(true);
  };

  const handleConfirmDelete = async () => {
    if (!filteredTestCase?.test_case_id || isLoading.status || isDeleting)
      return;

    try {
      setIsDeleting(true);

      const response = await fetch("/api/delete-test-cases", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          test_case_ids: [String(filteredTestCase.test_case_id)],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete test case");
      }

      dispatch(deleteTestCase(filteredTestCase.test_case_id));
      toast.success("Test Case deleted successfully");
      handleClose();
    } catch (error) {
      console.error("Error deleting test case:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error("Failed to delete test case");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirmation(false);
    }
  };

  const cleanTestCase = (testCase: testCaseSchema) => {
    return {
      ...testCase,
      test_case_steps: testCase.test_case_steps,
      comments: testCase.comments || null,
      preconditions: testCase.preconditions || [],
      credentials: testCase.credentials || [],
      scenarios: testCase.scenarios || [],
      mirrored_test_cases: testCase.mirrored_test_cases || [],
    };
  };

  if (!filteredTestCase) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={showDeleteConfirmation}
        isDeleting={isDeleting}
        title="Delete Test Case"
        description={`Are you sure you want to delete the test case ${filteredTestCase?.test_case_id}?`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirmation(false)}
      />

      {/* Semi-transparent backdrop */}
      <div
        className={`absolute inset-0 bg-black transition-opacity duration-300 ease-in-out ${
          isVisible ? "opacity-50" : "opacity-0"
        }`}
        onClick={handleClose}
      ></div>

      {/* Navigation arrows */}
      {hasPrev && (
        <div
          className="absolute left-64 top-1/2 transform -translate-y-1/2 z-50"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onPrevTestCase}
            className="flex items-center justify-center w-12 h-12 rounded-full bg-white shadow-lg hover:bg-gray-100 transition-all duration-200 border border-gray-200"
            aria-label="Previous test case"
          >
            <ChevronLeft className="h-6 w-6 text-gray-600" />
          </button>
        </div>
      )}

      {hasNext && (
        <div
          className="absolute right-5 top-1/2 transform -translate-y-1/2 z-50"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onNextTestCase}
            className="flex items-center justify-center w-12 h-12 rounded-full bg-white shadow-lg hover:bg-gray-100 transition-all duration-200 border border-gray-200"
            aria-label="Next test case"
          >
            <ChevronRight className="h-6 w-6 text-gray-600" />
          </button>
        </div>
      )}

      {/* Modal content */}
      <div
        className={`absolute right-0 top-0 bottom-0 ml-[280px] max-w-[calc(100%-280px)] w-full bg-white shadow-xl transition-transform duration-300 ease-in-out ${
          isVisible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="min-h-screen bg-gray-50">
          <TCHeader
            testCase={filteredTestCase}
            features={features}
            onClose={handleClose}
            onDelete={handleDeleteClick}
            onCopy={() => setShowCopyDialog(true)}
            onCriticalityChange={handleCriticalityChange}
            onStatusChange={handleStatusChange}
            onTestCaseUpdate={handleUpdateTestCase}
            isLoading={isLoading}
            isStatusLoading={false}
            currentPosition={currentPosition}
            totalCount={totalCount}
            showFlowViewer={() => setshowFlowViewer(true)}
            isBrowserDroid={false}
          />

          <div className="flex h-[calc(100vh-65px)]">
            {/* Fixed Left side - Frame */}
            <TCFrame
              testCase={filteredTestCase}
              onImageUpload={handleImageUpload}
              isUploading={isUploading}
            />

            {/* Scrollable Right side - Details and comments */}
            <div className="flex-1 h-full bg-gray-50">
              <div className="h-full overflow-y-auto px-6 py-6">
                <div className="space-y-6">
                  <TCDetailsSection
                    testCase={filteredTestCase}
                    allTestCases={allTestCases}
                    onSaveTestCase={async (updateData) => {
                      const updatedTestCase = {
                        ...filteredTestCase,
                        ...updateData,
                      };
                      setFilteredTestCase(updatedTestCase);
                      return await handleUpdateTestCase(updatedTestCase);
                    }}
                    isLoading={isLoading}
                    onCriticalityChange={handleCriticalityChange}
                  />

                  <hr className="border-gray-300" />

                  <TCCommentsSection
                    testCase={filteredTestCase}
                    comments={comments}
                    onSaveTestCase={async (updateData) => {
                      const updatedTestCase = {
                        ...filteredTestCase,
                        ...updateData,
                      };
                      setFilteredTestCase(updatedTestCase);
                      return await handleUpdateTestCase(updatedTestCase);
                    }}
                    isLoading={isLoading}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Copy dialog */}
      {showCopyDialog && (
        <AddTestCaseManually
          open={showCopyDialog}
          onClose={() => setShowCopyDialog(false)}
          prefillData={filteredTestCase}
        />
      )}

      {/* Flow Viewer */}
      {showFlowViewer && (
        <TestCaseFlowViewer
          metadata={filteredTestCase.metadata || ""}
          open={showFlowViewer}
          onClose={() => setshowFlowViewer(false)}
        />
      )}
    </div>
  );
}
