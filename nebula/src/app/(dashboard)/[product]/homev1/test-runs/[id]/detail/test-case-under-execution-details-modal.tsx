"use client";

import { useState, useEffect, useCallback } from "react";
import { TestCaseFrame } from "../../_components/tcue-frame";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type {
  TestCaseUnderExecutionSchema,
  TestCaseUnderExecutionStatus,
  Criticality,
  CommentType,
  TestCaseStep,
  UpdateTestCaseUnderExecutionSchema,
} from "@/lib/types";
import { useSelector, useDispatch } from "react-redux";
import type { RootState, AppDispatch } from "@/app/store/store";
import {
  fetchCredentials,
  selectCredentialsLoading,
} from "@/app/store/credentialsSlice";
import { toast } from "sonner";
import { Header } from "../../_components/tcue-header";
import { TCUEDetailsSection } from "../../_components/tcue-details-section";
import { CommentsSection } from "../../_components/tcue-comments-section";
import { ConfirmationDialog } from "@/components/global/delete-confirmation-dialog";
import {
  deleteTestCaseUnderExecution,
  updateTestCase,
} from "@/app/store/testRunUnderExecutionSlice";
import { useMemo } from "react";
import { orderTcueByScenarioMeta } from "@/lib/scenarioMatching";
import { useUser } from "@clerk/nextjs";
import { isQaiOrgUser, isQaiOrgAnalystUser } from "@/lib/constants";
import ScenariosDropdown from "../../_components/scenarios-dropdown";
import TestCaseFlowViewer from "@/components/global/show-flow-viewer";
import * as Sentry from "@sentry/nextjs";

interface TestCaseUnderExecutionDetailsModalProps {
  testCaseId: string;
  onClose: () => void;
  onNextTestCase?: () => void;
  onPrevTestCase?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  testCaseUnderExecutionId?: string;
}

type LoadingState = {
  status: boolean;
  action?: "saving" | "deleting" | "uploading" | null;
};

export function TestCaseUnderExecutionDetailsModal({
  testCaseId,
  onClose,
  onNextTestCase = () => {},
  onPrevTestCase = () => {},
  hasNext = false,
  hasPrev = false,
  testCaseUnderExecutionId,
}: TestCaseUnderExecutionDetailsModalProps) {
  const { user } = useUser();
  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;
  const isQaiUser = isQaiOrgUser(userOrgId) || isQaiOrgAnalystUser(userOrgId);

  const [testCaseUnderExecutionDetail, setTestRunDetail] =
    useState<TestCaseUnderExecutionSchema | null>(null);
  const [isCredentialsOpen, setIsCredentialsOpen] = useState(true);
  const [selectedScenarioIndex, setSelectedScenarioIndex] = useState(0);
  const [showFlowViewer, setShowFlowViewer] = useState(false);

  const dispatch = useDispatch<AppDispatch>();

  const substituteScenarioParameters = (
    scenario: TestCaseUnderExecutionSchema,
    scenarioIndex: number,
  ): TestCaseUnderExecutionSchema => {
    const scenarioDefinition = testCase?.scenarios?.[scenarioIndex];

    if (!scenarioDefinition?.params?.length || !testCase) {
      return scenario;
    }

    const updatedScenario = { ...scenario };

    const sourceDescription =
      scenario.test_case_description || testCase?.test_case_description;
    if (sourceDescription) {
      let description = sourceDescription;
      scenarioDefinition.params.forEach((param) => {
        const placeholder = param.parameter_name;
        description = description
          .split(placeholder)
          .join(param.parameter_value);
      });
      updatedScenario.test_case_description = description;
    }

    const sourceSteps = scenario.test_case_steps || testCase?.test_case_steps;
    if (sourceSteps) {
      updatedScenario.test_case_steps = sourceSteps.map((originalStep) => {
        const updatedStep = { ...originalStep };
        scenarioDefinition.params.forEach((param) => {
          const placeholder = param.parameter_name;
          updatedStep.step_description = updatedStep.step_description
            .split(placeholder)
            .join(param.parameter_value);
          if (updatedStep.expected_results) {
            updatedStep.expected_results = updatedStep.expected_results.map(
              (result) => result.split(placeholder).join(param.parameter_value),
            );
          }
        });
        return updatedStep;
      });
    }

    const sourcePreconditions =
      scenario.preconditions || testCase?.preconditions;
    if (sourcePreconditions) {
      updatedScenario.preconditions = sourcePreconditions.map(
        (originalPrecondition) => {
          let updatedPrecondition = originalPrecondition;
          scenarioDefinition.params.forEach((param) => {
            const placeholder = param.parameter_name;
            updatedPrecondition = updatedPrecondition
              .split(placeholder)
              .join(param.parameter_value);
          });
          return updatedPrecondition;
        },
      );
    }

    return updatedScenario;
  };

  const testCasesUnderExecution = useSelector(
    (state: RootState) => state.testRunsUnderExecution.testRunUnderExecution,
  );
  const testCases = useSelector(
    (state: RootState) => state.testCases.testCases,
  );
  const testCase = useMemo(() => {
    return testCases.find(
      (tc) => tc.test_case_id === testCaseUnderExecutionDetail?.test_case_id,
    );
  }, [testCases, testCaseUnderExecutionDetail?.test_case_id]);

  const credentialsLoading = useSelector(selectCredentialsLoading);
  const credentialItems = useSelector(
    (state: RootState) => state.credentials.items,
  );
  const hasCredentials = Object.keys(credentialItems).length > 0;
  const shouldShowCredentials = isQaiUser || hasCredentials;

  const scenarios = useMemo(() => {
    if (!testCaseUnderExecutionDetail?.test_case_id) return [];
    const sameTestCaseTcueList = testCasesUnderExecution.filter(
      (tcue) => tcue.test_case_id === testCaseUnderExecutionDetail.test_case_id,
    );

    if (!testCase?.scenarios || testCase.scenarios.length === 0) {
      return sameTestCaseTcueList;
    }

    return orderTcueByScenarioMeta(sameTestCaseTcueList, testCase.scenarios);
  }, [
    testCasesUnderExecution,
    testCaseUnderExecutionDetail?.test_case_id,
    testCase?.scenarios,
  ]);

  useEffect(() => {
    if (testCaseUnderExecutionDetail?.product_id) {
      dispatch(fetchCredentials(testCaseUnderExecutionDetail.product_id));
    }
  }, [testCaseUnderExecutionDetail?.product_id, dispatch]);

  const [isLoading, setIsLoading] = useState<LoadingState>({
    status: false,
    action: null,
  });
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [criticality, setCriticality] = useState<Criticality | "">(
    (testCaseUnderExecutionDetail?.criticality as Criticality) || "",
  );
  const [comments, setComments] = useState<CommentType[]>([]);

  const features = useSelector((state: RootState) => state.features.features);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsModalVisible(true);
    }, 50);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (testCaseUnderExecutionDetail?.criticality) {
      setCriticality(testCaseUnderExecutionDetail.criticality as Criticality);
    }
  }, [testCaseUnderExecutionDetail]);

  useEffect(() => {
    if (!testCasesUnderExecution || !testCaseId) return;

    const foundTcue = testCasesUnderExecution.find(
      (tc: TestCaseUnderExecutionSchema) => tc.id == testCaseUnderExecutionId,
    );

    if (foundTcue) {
      const currentIndex = scenarios.findIndex(
        (tcue) => tcue.id === foundTcue.id,
      );
      setSelectedScenarioIndex(currentIndex >= 0 ? currentIndex : 0);

      if (currentIndex >= 0) {
        const updatedTcue = substituteScenarioParameters(
          foundTcue,
          currentIndex,
        );
        setTestRunDetail(updatedTcue);
      } else {
        setTestRunDetail(foundTcue);
      }

      // Load comments
      if (foundTcue.comments) {
        try {
          const parsedComments = JSON.parse(foundTcue.comments);
          if (Array.isArray(parsedComments)) {
            setComments(parsedComments);
          } else {
            setComments([]);
          }
        } catch (error) {
          console.error("Error parsing comments:", error);
          setComments([]);
        }
      } else {
        setComments([]);
      }
    } else {
      setTestRunDetail(null);
      setComments([]);
    }
  }, [
    testCaseId,
    testCasesUnderExecution,
    testCaseUnderExecutionId,
    testCase,
    scenarios,
  ]);

  const handleScenarioSelect = (index: number) => {
    const selectedScenario = scenarios[index];
    if (selectedScenario) {
      setSelectedScenarioIndex(index);

      const updatedScenario = substituteScenarioParameters(
        selectedScenario,
        index,
      );

      setTestRunDetail(updatedScenario);

      if (updatedScenario.comments) {
        try {
          const parsedComments = JSON.parse(updatedScenario.comments);
          if (Array.isArray(parsedComments)) {
            setComments(parsedComments);
          }
        } catch (error) {
          console.error("Error parsing comments:", error);
        }
      }

      const params = new URLSearchParams(window.location.search);
      params.set("tcue", updatedScenario.id);
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?${params.toString()}`,
      );
    }
  };

  const handleClose = () => {
    if (isLoading.status && isLoading.action !== "uploading") return;

    setIsModalVisible(false);

    setTimeout(() => {
      onClose();
    }, 300);
  };

  const handleKeyboardNavigation = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isEditingText =
        ["INPUT", "TEXTAREA"].includes(target.tagName) ||
        target.isContentEditable;

      if (event.key === "Escape") {
        if (showFlowViewer) {
          setShowFlowViewer(false);
        } else {
          handleClose();
        }
      } else if (!isEditingText && !showFlowViewer) {
        if (event.key === "ArrowRight" && hasNext) {
          onNextTestCase();
        } else if (event.key === "ArrowLeft" && hasPrev) {
          onPrevTestCase();
        }
      }
    },
    [hasNext, hasPrev, onNextTestCase, onPrevTestCase, showFlowViewer],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyboardNavigation);
    return () => {
      window.removeEventListener("keydown", handleKeyboardNavigation);
    };
  }, [handleKeyboardNavigation]);

  useEffect(() => {
    // Reset loading state when switching between TCUEs
    setIsLoading({
      status: false,
      action: null,
    });
  }, [testCaseUnderExecutionId]); // Reset when TCUE ID changes

  const handleCriticalityChange = async (value: Criticality) => {
    if (!testCaseUnderExecutionDetail || isLoading.status) return;

    const originalCriticality =
      testCaseUnderExecutionDetail.criticality as Criticality;

    try {
      setIsLoading({ status: true, action: "saving" });
      setCriticality(value);
      setTestRunDetail((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          criticality: value,
        };
      });

      const success = await SaveTestCaseUnderExecution({ criticality: value });

      if (success) {
        dispatch(
          updateTestCase({
            id: testCaseUnderExecutionDetail.id,
            updatedData: {
              criticality: value,
              status: testCaseUnderExecutionDetail.status,
            },
          }),
        );

        toast.success("Criticality updated successfully");
      } else {
        throw new Error("Save operation failed");
      }
    } catch (error) {
      console.error("Error updating criticality:", error);
      Sentry.captureException(error, {
        level: "error",
        tags: { priority: "high" },
      });
      toast.error("Failed to update criticality");

      setCriticality(originalCriticality || "");
      setTestRunDetail((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          criticality: originalCriticality || "",
        };
      });
    } finally {
      setIsLoading({ status: false, action: null });
    }
  };

  const getFeatureName = (feature_id: string) => {
    const feature = features.find((feature) => feature?.id === feature_id);
    return feature?.name || "";
  };

  // Centralized save function that can be passed to components
  const SaveTestCaseUnderExecution = async (
    overrideData?: Partial<{
      notes: string;
      status: TestCaseUnderExecutionStatus;
      criticality: Criticality;
      execution_video_url: string;
      screenshot_url: string;
      comments: CommentType[];
      test_case_description: string;
      preconditions: string[];
      test_case_steps: TestCaseStep[];
      is_synced?: boolean;
    }>,
  ) => {
    if (!testCaseUnderExecutionDetail) return false;

    // For video upload start (empty string indicates starting an upload)
    if (overrideData?.execution_video_url === "") {
      return true;
    }

    // For video upload completion (we have a URL)
    if (
      overrideData?.execution_video_url &&
      overrideData.execution_video_url !== ""
    ) {
      try {
        // Save the URL to the backend without blocking the UI
        const updateData: UpdateTestCaseUnderExecutionSchema = {
          test_case_under_execution_id: testCaseUnderExecutionDetail.id,
          status: testCaseUnderExecutionDetail.status,
          notes: testCaseUnderExecutionDetail.notes || "",
          comments: testCaseUnderExecutionDetail.comments || "[]",
          execution_video_url: overrideData.execution_video_url,
          criticality: testCaseUnderExecutionDetail.criticality,
          screenshot_url: testCaseUnderExecutionDetail.screenshot_url || "",
          test_case_id: testCaseUnderExecutionDetail.test_case_id,
          test_case_description:
            testCaseUnderExecutionDetail.test_case_description,
          test_case_steps: testCaseUnderExecutionDetail.test_case_steps,
          preconditions: testCaseUnderExecutionDetail.preconditions,
          feature_id: testCaseUnderExecutionDetail.feature_id,
        };

        const response = await fetch("/api/update-test-case-under-execution", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            updateTestCaseUnderExecution: updateData,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to update test case under execution");
        }

        const data = await response.json();
        const updatedTestCase = data.updated_test_case_under_execution;

        // Update the Redux store with the new video URL
        dispatch(
          updateTestCase({
            id: testCaseUnderExecutionDetail.id,
            updatedData: updatedTestCase,
          }),
        );

        return true;
      } catch (error) {
        console.error("Error saving video URL:", error);
        Sentry.captureException(error, {
          level: "error",
          tags: { priority: "high" },
        });
        return false;
      }
    }

    // For other regular updates (non-video)
    try {
      setIsLoading({ status: true, action: "saving" });

      const updateData: UpdateTestCaseUnderExecutionSchema = {
        test_case_under_execution_id: testCaseUnderExecutionDetail.id,
        status: overrideData?.status || testCaseUnderExecutionDetail.status,
        notes:
          overrideData?.notes !== undefined
            ? overrideData.notes
            : testCaseUnderExecutionDetail.notes || "",
        comments: overrideData?.comments
          ? JSON.stringify(overrideData.comments)
          : JSON.stringify(comments),
        execution_video_url:
          overrideData?.execution_video_url ||
          testCaseUnderExecutionDetail.execution_video_url ||
          "",
        criticality:
          overrideData?.criticality || testCaseUnderExecutionDetail.criticality,
        screenshot_url:
          overrideData?.screenshot_url ||
          testCaseUnderExecutionDetail.screenshot_url ||
          "",
        test_case_id: testCaseUnderExecutionDetail.test_case_id,
        test_case_description:
          overrideData?.test_case_description ||
          testCaseUnderExecutionDetail.test_case_description,
        test_case_steps:
          overrideData?.test_case_steps ||
          testCaseUnderExecutionDetail.test_case_steps,
        preconditions:
          overrideData?.preconditions ||
          testCaseUnderExecutionDetail.preconditions,
        feature_id: testCaseUnderExecutionDetail.feature_id,
      };

      if (overrideData?.is_synced !== undefined) {
        updateData.is_synced = overrideData.is_synced;
      }

      const response = await fetch("/api/update-test-case-under-execution", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          updateTestCaseUnderExecution: updateData,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update test case under execution");
      }

      const data = await response.json();
      const updatedTestCase = data.updated_test_case_under_execution;

      setTestRunDetail((prev) => {
        if (!prev) return null;
        const merged = {
          ...prev,
          ...updateData,
        } as TestCaseUnderExecutionSchema;

        return substituteScenarioParameters(merged, selectedScenarioIndex);
      });

      // Update comments state if comments were updated
      if (overrideData?.comments) {
        setComments(overrideData.comments);
      }

      dispatch(
        updateTestCase({
          id: testCaseUnderExecutionDetail.id,
          updatedData: updatedTestCase,
        }),
      );

      return true;
    } catch (error) {
      console.error("Error saving test case under execution:", error);
      Sentry.captureException(error, {
        level: "error",
        tags: { priority: "high" },
      });
      toast.error("Failed to update test case under execution");
      return false;
    } finally {
      setIsLoading({ status: false, action: null });
    }
  };

  const handleShowDeleteTestCaseConfirm = () => {
    setIsLoading({ status: false, action: "deleting" });
  };

  const handleDeleteTestCase = async () => {
    if (!testCaseUnderExecutionDetail || isLoading.status) return;

    try {
      setIsLoading({ status: true, action: "deleting" });
      const response = await fetch(
        "/api/delete-test-case-under-execution-from-test-run",
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            test_case_under_execution_ids: [testCaseUnderExecutionDetail.id],
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to delete test case under execution");
      }

      dispatch(deleteTestCaseUnderExecution(testCaseUnderExecutionDetail.id));

      toast.success("Test case removed from test run successfully");
      handleClose();
    } catch (error) {
      console.error("Error deleting test case under execution:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error("Failed to delete test case under execution");
    } finally {
      setIsLoading({ status: false, action: null });
    }
  };

  const handleStatusChange = async (status: TestCaseUnderExecutionStatus) => {
    if (isLoading.status) return;

    if (
      status === "FAILED" &&
      (!testCaseUnderExecutionDetail?.notes ||
        testCaseUnderExecutionDetail.notes.trim() === "")
    ) {
      toast.error("Please add notes before changing the status to FAILED");
      return;
    }

    const success = await SaveTestCaseUnderExecution({ status });
    if (success) {
      toast.success("Status updated successfully");
    }
  };

  const handleSyncChanges = async () => {
    if (!testCaseUnderExecutionDetail) return;

    const success = await SaveTestCaseUnderExecution({
      is_synced: true,
    });

    if (!success) {
      toast.error("Failed to sync test case");
      Sentry.captureMessage("Failed to sync test case", {
        level: "error",
        tags: { priority: "high" },
      });
    } else {
      toast.success("Test case synced successfully");
    }
  };

  // Simplified handlers - logic moved to components
  const handleFieldUpdate = async () => {
    // This is handled by the TCUEDetailsSection component
  };

  if (!testCaseUnderExecutionDetail) {
    return (
      <div className="fixed inset-0 z-50 flex">
        <div
          className={`absolute inset-0 bg-black transition-opacity duration-300 ease-in-out ${
            isModalVisible ? "opacity-50" : "opacity-0"
          }`}
          onClick={isLoading.status ? undefined : handleClose}
        ></div>
        <div
          className={`absolute right-0 top-0 bottom-0 ml-[280px] max-w-[calc(100%-280px)] w-full bg-white shadow-xl overflow-y-auto transition-transform duration-300 ease-in-out ${
            isModalVisible ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-center justify-center h-screen">
            <p>Loading test case details...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className={`absolute inset-0 bg-black transition-opacity duration-300 ease-in-out ${
          isModalVisible ? "opacity-50" : "opacity-0"
        }`}
        onClick={isLoading.status ? undefined : handleClose}
      ></div>

      {hasPrev && (
        <div
          className="absolute left-64 top-1/2 transform -translate-y-1/2 z-50"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onPrevTestCase}
            className="flex items-center justify-center w-12 h-12 rounded-full bg-white shadow-lg hover:bg-gray-100 transition-all duration-200 border border-gray-200"
            aria-label="Previous test case"
            disabled={isLoading.status && isLoading.action !== "uploading"}
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
            disabled={isLoading.status && isLoading.action !== "uploading"}
          >
            <ChevronRight className="h-6 w-6 text-gray-600" />
          </button>
        </div>
      )}

      <div
        className={`absolute right-0 top-0 bottom-0 ml-[280px] max-w-[calc(100%-280px)] w-full bg-white shadow-xl transition-transform duration-300 ease-in-out ${
          isModalVisible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="min-h-screen bg-gray-50">
          <Header
            handleClose={handleClose}
            isLoading={isLoading}
            criticality={criticality}
            handleCriticalityChange={handleCriticalityChange}
            featureName={
              testCaseUnderExecutionDetail?.feature_id
                ? getFeatureName(testCaseUnderExecutionDetail.feature_id)
                : ""
            }
            title={testCaseUnderExecutionDetail.title || ""}
            onDelete={handleShowDeleteTestCaseConfirm}
            onSync={handleSyncChanges}
            showFlowViewer={() => setShowFlowViewer(true)}
            tcueData={testCaseUnderExecutionDetail}
          />

          <div className="flex h-[calc(100vh-65px)]">
            {/* Fixed Left side - Video frame */}
            <div className="w-1/3 h-full flex-shrink-0 flex flex-col">
              <div className="flex-1 min-h-0">
                <TestCaseFrame
                  isDetailPage={true}
                  screenshotUrl={
                    testCaseUnderExecutionDetail.execution_video_url
                  }
                  staticScreenshotUrl={
                    testCaseUnderExecutionDetail.screenshot_url
                  }
                  execution_completed_at={
                    testCaseUnderExecutionDetail.execution_completed_at
                  }
                  testCaseUnderExecutionId={testCaseUnderExecutionDetail.id}
                  productId={testCaseUnderExecutionDetail.product_id}
                  testRunId={testCaseUnderExecutionDetail.test_run_id}
                  isLoading={isLoading}
                  annotations={testCaseUnderExecutionDetail.annotations}
                  onVideoUpload={async (videoUrl) => {
                    return await SaveTestCaseUnderExecution({
                      execution_video_url: videoUrl,
                    });
                  }}
                  onScreenshotUpload={async (screenshotUrl) => {
                    return await SaveTestCaseUnderExecution({
                      screenshot_url: screenshotUrl,
                    });
                  }}
                />
              </div>
            </div>

            {/* Scrollable Right side - Details and comments */}
            <div className="flex-1 h-full bg-gray-50">
              <div className="h-full overflow-y-auto px-6 py-6">
                <div className="space-y-6">
                  <section>
                    <div className="space-y-4"></div>
                  </section>

                  <TCUEDetailsSection
                    testCase={testCaseUnderExecutionDetail}
                    testCaseWithCredentials={testCase}
                    onStatusChange={handleStatusChange}
                    onFieldUpdate={handleFieldUpdate}
                    isLoading={isLoading}
                    preconditionsCollapsed={true}
                    stepsCollapsed={!isQaiUser}
                    onSaveTestCase={SaveTestCaseUnderExecution}
                    isCredentialsOpen={isCredentialsOpen}
                    setIsCredentialsOpen={setIsCredentialsOpen}
                    credentialsLoading={credentialsLoading}
                    shouldShowCredentials={shouldShowCredentials}
                  />

                  {scenarios.length > 1 && (
                    <ScenariosDropdown
                      testCasesUnderExecution={scenarios}
                      selectedScenarioIndex={selectedScenarioIndex}
                      onScenarioSelect={handleScenarioSelect}
                      className="mb-6"
                      testCase={testCase}
                    />
                  )}

                  <hr className="border-gray-300" />

                  <CommentsSection
                    comments={comments}
                    isLoading={isLoading}
                    onSaveTestCase={SaveTestCaseUnderExecution}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showFlowViewer && (
        <TestCaseFlowViewer
          metadata={
            typeof testCaseUnderExecutionDetail?.metadata === "string"
              ? testCaseUnderExecutionDetail?.metadata || ""
              : JSON.stringify(testCaseUnderExecutionDetail?.metadata || "")
          }
          open={showFlowViewer}
          onClose={() => setShowFlowViewer(false)}
        />
      )}

      <ConfirmationDialog
        isOpen={isLoading.action === "deleting"}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setIsLoading({ status: false, action: null });
          }
        }}
        title="Delete Test Case"
        description="Are you sure you want to remove this test case under execution from the test run?"
        confirmText="Delete"
        onConfirm={handleDeleteTestCase}
        isLoading={isLoading.status}
      />
    </div>
  );
}
