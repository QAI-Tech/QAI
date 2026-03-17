"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Monitor,
  Play,
  Loader2,
  Trash2,
  Video,
} from "lucide-react";
import type {
  testCaseSchema,
  TestCaseUnderExecutionSchema,
  UpdateTestCaseUnderExecutionSchema,
} from "@/lib/types";
import {
  Criticality,
  TestCaseUnderExecutionStatus,
  CommentType,
  TestCaseStepStatus,
} from "@/lib/types";
import {
  GCS_BUCKET_URL,
  GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT,
} from "@/lib/constants";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/app/store/store";
import { fetchTestCases as fetchTestCasesAction } from "@/app/store/testCaseSlice";
import { fetchFeatures as fetchFeaturesAction } from "@/app/store/featuresSlice";
import { Header as TcueHeader } from "../../_components/tcue-header";
import { TCHeader } from "@/app/(dashboard)/[product]/homev1/test-cases/components/tc-header";
import { TCDetailsSection } from "@/app/(dashboard)/[product]/homev1/test-cases/components/tc-details-section";
import ScenariosDropdown from "../../_components/scenarios-dropdown";
import { orderTcueByScenarioMeta } from "@/lib/scenarioMatching";
import {
  TestCaseStepsViewer,
  type ViewerStep,
} from "@/components/ui/test-case-steps-viewer";
import { toast } from "sonner";
import { useUser } from "@clerk/nextjs";
import { isQaiOrgUser, isQaiOrgAnalystUser } from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";
import { TestCaseUnderExecutionStatusDropdown } from "../../_components/tcue-status-dropdown";
import { EditableField } from "@/components/ui/editable-field";
import { CommentsSection } from "@/app/(dashboard)/[product]/homev1/test-runs/_components/tcue-comments-section";
import { ConfirmationDialog } from "@/components/global/delete-confirmation-dialog";
import { VideoPlayer } from "@/components/ui/video-player";
import { uploadVideo } from "@/app/services/videoUploadService";
import { selectUploadsByTcueId } from "@/app/store/videoUploadSlice";
import { VideoUploadProgress } from "@/app/(dashboard)/[product]/homev1/test-runs/_components/video-upload-progress";
import {
  updateTestCase as updateTestCaseInStore,
  deleteTestCaseUnderExecution as deleteTestCaseFromStore,
} from "@/app/store/testRunUnderExecutionSlice";
import { useFinalSlide } from "@/hooks/use-final-slide";
import { useRouter } from "next/navigation";

interface TestCaseUnderExecutionDetailsExecutorModeProps {
  onClose: () => void;
  onNextTestCase?: () => void;
  onPrevTestCase?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  currentPosition?: number;
  totalCount?: number;
  inline?: boolean;
  handleAddTestRun?: () => void;
  testRunId?: string;
  productId?: string;
  isTestRunLoading?: boolean;
  onCriticalityChange?: (value: Criticality) => void;
  onTestCaseUpdate?: (testCase: testCaseSchema) => Promise<boolean>;
  isEditing?: boolean;
  isSaving?: boolean;
  testCaseUnderExecutionId?: string;
  testCaseUnderExecutionDetail?: TestCaseUnderExecutionSchema | null;
  // Mode selection props
  viewMode?: "viewer" | "executor" | "reviewer";
  onViewModeChange?: (mode: "viewer" | "executor" | "reviewer") => void;
  showModeSelector?: boolean;
}

const FlowImage: React.FC<{
  stepIndex: number;
  testCase: testCaseSchema;
  fallbackSrc: string | null;
  getStepImageFromMetadata: (stepIdx: number) => Promise<string | null>;
  stepImageHttpUrls: Map<number, string | null>;
  stepImageLoadingStates: Map<number, boolean>;
}> = ({
  stepIndex,
  fallbackSrc,
  getStepImageFromMetadata,
  stepImageHttpUrls,
  stepImageLoadingStates,
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadImage = async () => {
      // Check if image is already cached
      const cached = stepImageHttpUrls.get(stepIndex);
      if (cached !== undefined) {
        setImageSrc(cached);
        return;
      }

      // Check if already loading
      if (stepImageLoadingStates.get(stepIndex)) {
        setIsLoading(true);
        return;
      }

      setIsLoading(true);
      try {
        const src = await getStepImageFromMetadata(stepIndex);
        setImageSrc(src || fallbackSrc);
      } catch (error) {
        console.error(`Failed to load image for step ${stepIndex}:`, error);
        setImageSrc(fallbackSrc);
      } finally {
        setIsLoading(false);
      }
    };

    loadImage();
  }, [
    stepIndex,
    getStepImageFromMetadata,
    fallbackSrc,
    stepImageHttpUrls,
    stepImageLoadingStates,
  ]);

  // Update when cached URL becomes available
  useEffect(() => {
    const cached = stepImageHttpUrls.get(stepIndex);
    if (cached !== undefined) {
      setImageSrc(cached);
      setIsLoading(false);
    }
  }, [stepImageHttpUrls, stepIndex]);

  if (isLoading || stepImageLoadingStates.get(stepIndex)) {
    return (
      <div className="w-80 h-full bg-gray-100 flex items-center justify-center flex-shrink-0">
        <span className="text-gray-400 text-sm">Loading...</span>
      </div>
    );
  }

  if (!imageSrc) {
    return (
      <div className="w-80 h-[calc(100vh-200px)] bg-gray-100 flex items-center justify-center flex-shrink-0">
        <span className="text-gray-400 text-sm">No image available</span>
      </div>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={`Step ${stepIndex + 1}`}
      className="w-80 h-full object-contain bg-white flex-shrink-0"
    />
  );
};

export function TestCaseUnderExecutionDetailsExecutorMode({
  onClose,
  onNextTestCase = () => {},
  onPrevTestCase = () => {},
  hasNext = false,
  hasPrev = false,
  inline = false,
  productId,
  testCaseUnderExecutionId,
  testRunId,
  testCaseUnderExecutionDetail,
  viewMode = "executor",
  onViewModeChange,
  showModeSelector = false,
}: TestCaseUnderExecutionDetailsExecutorModeProps) {
  const dispatch = useDispatch<AppDispatch>();
  const [localTestCase, setLocalTestCase] = useState<testCaseSchema | null>(
    null,
  );
  const [isVisible, setIsVisible] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [flowIndex, setFlowIndex] = useState(0);
  const [isFlowSynced, setIsFlowSynced] = useState(false);
  const [isAutoPlay, setIsAutoPlay] = useState(false);
  const [mode, setMode] = useState<"flow" | "video">("flow");
  const [executionVideoUrl, setExecutionVideoUrl] = useState<string | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [comments, setComments] = useState<CommentType[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showVideoDeleteDialog, setShowVideoDeleteDialog] = useState(false);
  const [showAdhocDeleteDialog, setShowAdhocDeleteDialog] = useState(false);
  const [adhocStepToDelete, setAdhocStepToDelete] = useState<number | null>(
    null,
  );
  const [isAdhocStepLoading, setIsAdhocStepLoading] = useState(false);

  const [isDeleting, setIsDeleting] = useState(false);

  // Get user data for QAI user check
  const { user } = useUser();
  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;
  const isQaiUser = isQaiOrgUser(userOrgId) || isQaiOrgAnalystUser(userOrgId);
  const router = useRouter();

  const allTestCases = useSelector(
    (state: RootState) => state.testCases.testCases,
  );
  const features = useSelector((state: RootState) => state.features.features);
  const tcueList = useSelector(
    (state: RootState) => state.testRunsUnderExecution.testRunUnderExecution,
  );

  const testCase = useMemo(() => {
    if (!testCaseUnderExecutionDetail?.test_case_id) return null;
    return allTestCases.find(
      (tc) => tc.test_case_id === testCaseUnderExecutionDetail.test_case_id,
    );
  }, [allTestCases, testCaseUnderExecutionDetail?.test_case_id]);

  // Load comments from the passed testCaseUnderExecutionDetail prop
  useEffect(() => {
    if (testCaseUnderExecutionDetail?.comments) {
      try {
        const parsedComments = JSON.parse(
          testCaseUnderExecutionDetail.comments,
        );
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
  }, [testCaseUnderExecutionDetail?.comments]);

  const [selectedScenarioIndex, setSelectedScenarioIndex] = useState(0);
  const scenarios = useMemo(() => {
    const sourceTestCaseId =
      testCase?.test_case_id || testCaseUnderExecutionDetail?.test_case_id;

    if (!sourceTestCaseId) {
      const sourceFlowId =
        testCase?.flow_id || testCaseUnderExecutionDetail?.flow_id;
      if (sourceFlowId) {
        const sameFlowTcueList = tcueList.filter(
          (tcue) => tcue.flow_id === sourceFlowId,
        );
        return sameFlowTcueList;
      }
      return [] as TestCaseUnderExecutionSchema[];
    }

    const sameTestCaseTcueList = tcueList.filter(
      (tcue) => tcue.test_case_id === sourceTestCaseId,
    );
    if (!testCase?.scenarios || testCase.scenarios.length === 0) {
      return sameTestCaseTcueList;
    }
    return orderTcueByScenarioMeta(sameTestCaseTcueList, testCase.scenarios);
  }, [
    tcueList,
    testCase?.test_case_id,
    testCase?.scenarios,
    testCase?.flow_id,
    testCaseUnderExecutionDetail?.test_case_id,
    testCaseUnderExecutionDetail?.flow_id,
  ]);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const uploadsForThisTcue = useSelector((state: RootState) =>
    testCaseUnderExecutionId
      ? selectUploadsByTcueId(state, testCaseUnderExecutionId)
      : [],
  );
  const isUploading = useMemo(
    () =>
      uploadsForThisTcue.some(
        (u) => u.status === "uploading" || u.status === "pending",
      ),
    [uploadsForThisTcue],
  );

  const handleVideoUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    try {
      const file = files[0];
      if (!testCaseUnderExecutionId || !productId || !testRunId) {
        toast.error("Required details not found");
        return;
      }

      const organisationId =
        (user?.publicMetadata?.organisation_id as string | undefined) || "";

      await uploadVideo(
        file,
        testCaseUnderExecutionId,
        productId,
        testRunId,
        organisationId,
        async (videoUrl: string) => {
          const response = await fetch(
            "/api/update-test-case-under-execution",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                updateTestCaseUnderExecution: {
                  test_case_under_execution_id: testCaseUnderExecutionId,
                  execution_video_url: videoUrl,
                },
              }),
            },
          );

          if (!response.ok) {
            throw new Error("Failed to update test case with video URL");
          }

          const data = await response.json();
          const updatedTestCase = data.updated_test_case_under_execution;

          // Set the URL and let the effect handle signed URL fetching
          setExecutionVideoUrl(videoUrl);

          // update redux store with complete response data
          dispatch(
            updateTestCaseInStore({
              id: testCaseUnderExecutionId,
              updatedData: updatedTestCase,
            }),
          );

          toast.success("Video uploaded successfully");
        },
      );
    } catch (error) {
      console.error("Error during file upload:", error);
      Sentry.captureException(error, {
        level: "error",
        tags: { priority: "high" },
      });
      toast.error(
        error instanceof Error ? error.message : "Failed to upload video",
      );
    } finally {
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  };

  const handleDeleteVideo = async () => {
    if (!testCaseUnderExecutionId) return;

    setIsDeleting(true);

    try {
      const response = await fetch("/api/update-test-case-under-execution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updateTestCaseUnderExecution: {
            test_case_under_execution_id: testCaseUnderExecutionId,
            execution_video_url: "", // Empty string to delete the video
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete video");
      }

      const data = await response.json();
      const updatedTestCase = data.updated_test_case_under_execution;

      setExecutionVideoUrl(null);
      // update redux store with complete response data
      dispatch(
        updateTestCaseInStore({
          id: testCaseUnderExecutionId,
          updatedData: updatedTestCase,
        }),
      );
      toast.success("Video deleted successfully");
    } catch (error) {
      console.error("Error deleting video:", error);
      Sentry.captureException(error, {
        level: "error",
        tags: { priority: "high" },
      });
      toast.error("Failed to delete video");
    } finally {
      setIsDeleting(false);
      setShowVideoDeleteDialog(false);
    }
  };

  const steps: ViewerStep[] = useMemo(() => {
    if (!localTestCase?.test_case_steps) return [];
    let regularStepCounter = 1;
    let adhocStepCounter = 1000;
    return localTestCase.test_case_steps.map((s, idx) => {
      const isAdhoc = s.type === "ADHOC_STEP";
      return {
        id: isAdhoc ? adhocStepCounter++ : regularStepCounter++,
        description: s.step_description,
        expectedResults: Array.isArray(s.expected_results)
          ? s.expected_results
          : [],
        status: s.status || TestCaseStepStatus.INCOMPLETE,
        type: s.type,
        originalIndex: idx,
      };
    });
  }, [localTestCase]);

  const flowSteps: ViewerStep[] = useMemo(() => {
    if (!localTestCase?.test_case_steps) return [];
    const regularSteps = localTestCase.test_case_steps.filter(
      (s) => s.type !== "ADHOC_STEP",
    );
    return regularSteps.map((s, idx) => ({
      id: idx + 1,
      description: s.step_description,
      expectedResults: Array.isArray(s.expected_results)
        ? s.expected_results
        : [],
      status: s.status || TestCaseStepStatus.INCOMPLETE,
      type: s.type,
      originalIndex: localTestCase.test_case_steps.findIndex(
        (original) => original === s,
      ),
    }));
  }, [localTestCase]);

  const buildLocalTestCaseFromTcue = useCallback(
    (
      tcue: TestCaseUnderExecutionSchema,
      base: testCaseSchema | null,
      scenarioIndex?: number,
    ): testCaseSchema => {
      const result: testCaseSchema = {
        ...(base || ({} as testCaseSchema)),
        test_case_id: tcue?.test_case_id,

        title: tcue?.title || "",
        test_case_description: tcue?.test_case_description || "",
        test_case_steps:
          tcue?.test_case_steps && tcue?.test_case_steps.length > 0
            ? tcue?.test_case_steps
            : [],
        preconditions:
          tcue?.preconditions && tcue?.preconditions.length > 0
            ? tcue?.preconditions
            : [],
        screenshot_url: tcue?.screenshot_url || "",

        feature_id: tcue?.feature_id || "",

        metadata: tcue?.metadata || "",
        scenarios: base?.scenarios,
        sort_index: base?.sort_index,
        criticality: tcue?.criticality || "",
      } as testCaseSchema;

      if (base?.scenarios && typeof scenarioIndex === "number") {
        const scenarioDefinition = base.scenarios[scenarioIndex];
        if (scenarioDefinition?.params?.length) {
          // Description
          if (result.test_case_description) {
            let desc = result.test_case_description;
            scenarioDefinition.params.forEach((param) => {
              desc = desc
                .split(param.parameter_name)
                .join(param.parameter_value);
            });
            result.test_case_description = desc;
          }
          // Steps
          if (result.test_case_steps && result.test_case_steps.length > 0) {
            result.test_case_steps = result.test_case_steps.map((step) => {
              const newStep = { ...step } as typeof step;
              scenarioDefinition.params.forEach((param) => {
                newStep.step_description = newStep.step_description
                  .split(param.parameter_name)
                  .join(param.parameter_value);
                if (newStep.expected_results) {
                  newStep.expected_results = newStep.expected_results.map(
                    (er) =>
                      er
                        .split(param.parameter_name)
                        .join(param.parameter_value),
                  );
                }
              });
              return newStep;
            });
          }
          // Preconditions
          if (result.preconditions && result.preconditions.length > 0) {
            result.preconditions = result.preconditions.map((pre) => {
              let p = pre;
              scenarioDefinition.params.forEach((param) => {
                p = p.split(param.parameter_name).join(param.parameter_value);
              });
              return p;
            });
          }
        }
      }

      return result;
    },
    [],
  );

  // Generic update function for TCUE
  const updateTcue = async (
    updateData: Partial<UpdateTestCaseUnderExecutionSchema>,
    successMessage: string,
    onSuccess?: () => void,
  ): Promise<boolean> => {
    if (!testCaseUnderExecutionId || isSaving) return false;

    setIsSaving(true);

    try {
      const fullUpdateData: UpdateTestCaseUnderExecutionSchema = {
        test_case_under_execution_id: testCaseUnderExecutionId,
        status:
          updateData.status ||
          testCaseUnderExecutionDetail?.status ||
          TestCaseUnderExecutionStatus.UNTESTED,
        notes:
          updateData.notes !== undefined
            ? updateData.notes
            : testCaseUnderExecutionDetail?.notes || "",
        comments:
          updateData.comments !== undefined
            ? typeof updateData.comments === "string"
              ? updateData.comments
              : JSON.stringify(updateData.comments)
            : JSON.stringify(comments),
        execution_video_url:
          updateData.execution_video_url !== undefined
            ? updateData.execution_video_url
            : testCaseUnderExecutionDetail?.execution_video_url || "",
        criticality:
          updateData.criticality || testCaseUnderExecutionDetail?.criticality,
        screenshot_url:
          updateData.screenshot_url !== undefined
            ? updateData.screenshot_url
            : testCaseUnderExecutionDetail?.screenshot_url || "",
        test_case_id: testCaseUnderExecutionDetail?.test_case_id || "",
        test_case_description:
          updateData.test_case_description ||
          testCaseUnderExecutionDetail?.test_case_description,
        test_case_steps:
          updateData.test_case_steps ||
          testCaseUnderExecutionDetail?.test_case_steps,
        preconditions:
          updateData.preconditions ||
          testCaseUnderExecutionDetail?.preconditions,
        feature_id: testCaseUnderExecutionDetail?.feature_id || "",
      };

      if (updateData.is_synced !== undefined) {
        fullUpdateData.is_synced = updateData.is_synced;
      }

      const response = await fetch("/api/update-test-case-under-execution", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          updateTestCaseUnderExecution: fullUpdateData,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message ||
            `Failed to ${successMessage.toLowerCase().replace(" successfully", "")}`,
        );
      }

      const data = await response.json();
      const updatedTestCase = data.updated_test_case_under_execution;

      toast.success(successMessage);

      // Update Redux store with the complete response data
      try {
        if (testCaseUnderExecutionId) {
          dispatch(
            updateTestCaseInStore({
              id: testCaseUnderExecutionId,
              updatedData: updatedTestCase,
            }),
          );
        }
      } catch (e) {
        // non-fatal
        console.warn("Failed to update local store:", e);
      }
      onSuccess?.();
      return true;
    } catch (error) {
      console.error(`Error updating:`, error);
      Sentry.captureException(error, {
        level: "error",
        tags: { priority: "high" },
      });
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to ${successMessage.toLowerCase().replace(" successfully", "")}`,
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Status change handler
  const handleStatusChange = async (status: TestCaseUnderExecutionStatus) => {
    if (
      status === TestCaseUnderExecutionStatus.FAILED &&
      (!testCaseUnderExecutionDetail?.notes ||
        testCaseUnderExecutionDetail.notes.trim() === "")
    ) {
      toast.error("Please add notes before changing the status to FAILED");
      return;
    }

    await updateTcue({ status }, "Status updated successfully");
  };

  // Notes update handler
  const handleNotesUpdate = async (notes: string) => {
    await updateTcue({ notes }, "Notes updated successfully");
  };

  // Comments save handler
  const handleSaveTestCase = async (updateData: {
    comments?: CommentType[];
    notes?: string;
    status?: TestCaseUnderExecutionStatus;
  }) => {
    const processedUpdateData: Partial<UpdateTestCaseUnderExecutionSchema> = {
      notes: updateData.notes,
      status: updateData.status,
      ...(updateData.comments && {
        comments: JSON.stringify(updateData.comments),
      }),
    };

    const success = await updateTcue(
      processedUpdateData,
      "Test case updated successfully",
      () => {
        // Update local state
        if (updateData.comments) {
          setComments(updateData.comments);
        }
      },
    );

    return success;
  };

  // Delete test case handler
  const handleShowDeleteTestCaseConfirm = () => {
    setShowDeleteDialog(true);
  };

  const handleShowVideoDeleteConfirm = () => {
    setShowVideoDeleteDialog(true);
  };

  const handleDeleteTestCase = async () => {
    if (!testCaseUnderExecutionId || isSaving) return;

    setIsSaving(true);

    try {
      const response = await fetch(
        "/api/delete-test-case-under-execution-from-test-run",
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            test_case_under_execution_ids: [testCaseUnderExecutionId],
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to delete test case under execution");
      }

      toast.success("Test case removed from test run successfully");
      // update redux store
      try {
        dispatch(deleteTestCaseFromStore(testCaseUnderExecutionId));
      } catch (e) {
        console.warn("Failed to update store after delete", e);
      }
      onClose();
    } catch (error) {
      console.error("Error deleting test case under execution:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error("Failed to delete test case under execution");
    } finally {
      setIsSaving(false);
      setShowDeleteDialog(false);
    }
  };

  // Sync changes handler
  const handleSyncChanges = async () => {
    await updateTcue({ is_synced: true }, "Test case synced successfully");
  };

  const handleStepStatusChange = async (
    stepIndex: number,
    status: TestCaseStepStatus,
  ) => {
    if (!localTestCase?.test_case_steps || isSaving) return;

    const originalTestCase = localTestCase;
    const updatedSteps = [...localTestCase.test_case_steps];
    updatedSteps[stepIndex] = {
      ...updatedSteps[stepIndex],
      status: status,
    };

    const updatedTestCase = {
      ...originalTestCase,
      test_case_steps: updatedSteps,
    };
    setLocalTestCase(updatedTestCase);

    const success = await updateTcue(
      { test_case_steps: updatedSteps },
      "Step status updated successfully",
    );

    if (!success) {
      setLocalTestCase(originalTestCase);
    }
  };

  const handleAdhocStepSave = async (
    stepIndex: number,
    stepDescription: string,
  ) => {
    if (!testCaseUnderExecutionId || !localTestCase?.test_case_steps) {
      toast.error("Test case under execution ID not found");
      return;
    }

    const newAdhocStep = {
      test_step_id: `adhoc-${crypto.randomUUID()}`,
      step_description: stepDescription,
      expected_results: [],
      status: TestCaseStepStatus.INCOMPLETE,
      type: "ADHOC_STEP",
    };

    const updatedSteps = [...localTestCase.test_case_steps];
    const insertIndex = stepIndex === -1 ? 0 : stepIndex + 1;
    updatedSteps.splice(insertIndex, 0, newAdhocStep);

    try {
      const success = await updateTcue(
        { test_case_steps: updatedSteps },
        "Adhoc step saved successfully",
      );

      if (success) {
        const updatedTestCase = {
          ...localTestCase,
          test_case_steps: updatedSteps,
        };
        setLocalTestCase(updatedTestCase);
      }
    } catch (error) {
      console.error("Error saving adhoc step:", error);
      toast.error("Failed to save adhoc step");
    }
  };

  const handleAdhocStepEdit = async (
    stepIndex: number,
    stepDescription: string,
  ) => {
    if (
      !testCaseUnderExecutionId ||
      !localTestCase?.test_case_steps ||
      isAdhocStepLoading
    ) {
      toast.error("Test case under execution ID not found");
      return;
    }

    setIsAdhocStepLoading(true);

    const updatedSteps = [...localTestCase.test_case_steps];
    updatedSteps[stepIndex] = {
      ...updatedSteps[stepIndex],
      step_description: stepDescription,
    };

    try {
      const success = await updateTcue(
        { test_case_steps: updatedSteps },
        "Adhoc step updated successfully",
      );

      if (success) {
        const updatedTestCase = {
          ...localTestCase,
          test_case_steps: updatedSteps,
        };
        setLocalTestCase(updatedTestCase);
      }
    } catch (error) {
      console.error("Error updating adhoc step:", error);
      toast.error("Failed to update adhoc step");
    } finally {
      setIsAdhocStepLoading(false);
    }
  };

  const handleAdhocStepDeleteClick = async (stepIndex: number) => {
    setAdhocStepToDelete(stepIndex);
    setShowAdhocDeleteDialog(true);
  };

  const handleAdhocStepDelete = async () => {
    if (
      !testCaseUnderExecutionId ||
      !localTestCase?.test_case_steps ||
      adhocStepToDelete === null ||
      isAdhocStepLoading
    ) {
      toast.error("Test case under execution ID not found");
      return;
    }

    setIsAdhocStepLoading(true);

    const updatedSteps = localTestCase.test_case_steps.filter(
      (_, index) => index !== adhocStepToDelete,
    );

    try {
      const success = await updateTcue(
        { test_case_steps: updatedSteps },
        "Adhoc step deleted successfully",
      );

      if (success) {
        const updatedTestCase = {
          ...localTestCase,
          test_case_steps: updatedSteps,
        };
        setLocalTestCase(updatedTestCase);
      }
    } catch (error) {
      console.error("Error deleting adhoc step:", error);
      toast.error("Failed to delete adhoc step");
    } finally {
      setIsAdhocStepLoading(false);
      setShowAdhocDeleteDialog(false);
      setAdhocStepToDelete(null);
    }
  };

  useEffect(() => {
    if (inline) {
      setIsVisible(true);
      return;
    }
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, [inline]);

  useEffect(() => {
    if (productId && (!allTestCases || allTestCases.length === 0)) {
      dispatch(fetchTestCasesAction(productId));
    }
  }, [productId, allTestCases?.length, dispatch]);

  useEffect(() => {
    if (productId && (!features || features.length === 0)) {
      dispatch(fetchFeaturesAction(productId));
    }
  }, [productId, features?.length, dispatch]);

  useEffect(() => {
    setCurrentStepIndex(-1);
    setFlowIndex(0);
    setIsFlowSynced(false);
    setIsAutoPlay(false);
    // Clear image cache when test case changes
    setStepImageHttpUrls(new Map());
    setStepImageLoadingStates(new Map());
  }, [localTestCase?.test_case_id]);

  useEffect(() => {
    // Build local test case from TCUE snapshot when base testCase is unavailable
    if (testCaseUnderExecutionDetail) {
      const built = buildLocalTestCaseFromTcue(
        testCaseUnderExecutionDetail,
        testCase || null,
      );
      setLocalTestCase(built);
    } else {
      setLocalTestCase(testCase || null);
    }
  }, [
    testCase?.test_case_id,
    testCaseUnderExecutionDetail,
    buildLocalTestCaseFromTcue,
  ]);

  // Initialize execution video URL from testCaseUnderExecutionDetail
  useEffect(() => {
    if (testCaseUnderExecutionDetail?.execution_video_url) {
      setExecutionVideoUrl(testCaseUnderExecutionDetail.execution_video_url);
    } else {
      setExecutionVideoUrl(null);
      setExecutionVideoHttp(null);
    }
  }, [testCaseUnderExecutionDetail?.execution_video_url]);

  useEffect(() => {
    if (!testCaseUnderExecutionId || scenarios.length === 0) return;
    const idx = scenarios.findIndex((s) => s.id === testCaseUnderExecutionId);
    if (idx >= 0 && testCaseUnderExecutionDetail) {
      setSelectedScenarioIndex(idx);
      const built = buildLocalTestCaseFromTcue(
        testCaseUnderExecutionDetail,
        testCase || null,
        idx,
      );
      setLocalTestCase(built);
    }
  }, [
    testCaseUnderExecutionId,
    scenarios,
    testCaseUnderExecutionDetail,
    buildLocalTestCaseFromTcue,
    testCase,
  ]);

  const handleClose = useCallback(() => {
    if (inline) {
      onClose();
      return;
    }
    setIsVisible(false);
    setTimeout(() => onClose(), 300);
  }, [onClose, inline]);

  const [screenshotHttp, setScreenshotHttp] = useState<string | null>(null);
  const [executionVideoHttp, setExecutionVideoHttp] = useState<string | null>(
    null,
  );
  const [isScreenshotLoading, setIsScreenshotLoading] = useState(false);
  const [stepImageHttpUrls, setStepImageHttpUrls] = useState<
    Map<number, string | null>
  >(new Map());
  const [stepImageLoadingStates, setStepImageLoadingStates] = useState<
    Map<number, boolean>
  >(new Map());
  const [flowNodeHttpUrls, setFlowNodeHttpUrls] = useState<
    Map<number, string | null>
  >(new Map());
  const [flowNodeLoadingStates, setFlowNodeLoadingStates] = useState<
    Map<number, boolean>
  >(new Map());
  const [currentFlowIndex, setCurrentFlowIndex] = useState(0);

  useEffect(() => {
    if (!localTestCase?.screenshot_url) {
      setScreenshotHttp(null);
      setIsScreenshotLoading(false);
      return;
    }

    const fetchSignedUrl = async () => {
      const raw = localTestCase.screenshot_url;
      setIsScreenshotLoading(true);

      try {
        const response = await fetch(
          raw?.startsWith(GCS_BUCKET_URL)
            ? `${GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT}${raw.substring(GCS_BUCKET_URL.length)}`
            : `${GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT}${raw}`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch screenshot signed URL");
        }

        const { signedUrl } = await response.json();
        setScreenshotHttp(signedUrl);
      } catch (error) {
        console.error("Error while fetching the screenshot signed URL:", error);
        setScreenshotHttp(null);
      } finally {
        setIsScreenshotLoading(false);
      }
    };

    fetchSignedUrl();
  }, [localTestCase?.screenshot_url]);

  useEffect(() => {
    if (!executionVideoUrl) {
      setExecutionVideoHttp(null);
      return;
    }

    const fetchVideoSignedUrl = async () => {
      try {
        // Clean the URL - remove any existing query parameters for signed URL generation
        const baseUrl = executionVideoUrl.split("?")[0];
        const path = baseUrl.startsWith(GCS_BUCKET_URL)
          ? baseUrl.substring(GCS_BUCKET_URL.length)
          : baseUrl;

        const response = await fetch(
          `${GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT}${path}`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch video signed URL");
        }

        const { signedUrl } = await response.json();
        setExecutionVideoHttp(signedUrl);
      } catch (error) {
        console.error("Error while fetching the video signed URL:", error);
        setExecutionVideoHttp(null);
      }
    };

    fetchVideoSignedUrl();
  }, [executionVideoUrl]);

  const metaGraphs = useMemo(() => {
    try {
      if (!localTestCase?.metadata)
        return {
          nodesById: null as Record<string, unknown> | null,
          edgesById: null as Record<string, unknown> | null,
        };
      const meta = JSON.parse(localTestCase.metadata);
      const graph = meta?.tc_graph_json;
      if (!graph?.nodes || !graph?.edges)
        return {
          nodesById: null as Record<string, unknown> | null,
          edgesById: null as Record<string, unknown> | null,
        };
      const nodesById = graph.nodes.reduce(
        (acc: Record<string, unknown>, n: { id?: string }) => {
          if (n?.id) acc[n.id] = n;
          return acc;
        },
        {} as Record<string, unknown>,
      );
      const edgesById = graph.edges.reduce(
        (acc: Record<string, unknown>, e: { id?: string }) => {
          if (e?.id) acc[e.id] = e;
          return acc;
        },
        {} as Record<string, unknown>,
      );
      return { nodesById, edgesById };
    } catch (error) {
      console.error("Failed to parse test case metadata:", error);
      return {
        nodesById: null as Record<string, unknown> | null,
        edgesById: null as Record<string, unknown> | null,
      };
    }
  }, [localTestCase?.metadata]);

  const toHttpUrl = (src: string): string =>
    src?.startsWith("gs://")
      ? `${GCS_BUCKET_URL}${src.replace("gs://", "")}`
      : src;

  const flowNodeRawImages: string[] = useMemo(() => {
    try {
      if (!localTestCase?.metadata) return [];
      const meta = JSON.parse(localTestCase.metadata);
      const graph = meta?.tc_graph_json;
      if (!graph?.nodes || !Array.isArray(graph.nodes)) return [];
      const images: string[] = graph.nodes
        .map(
          (n: {
            data?: {
              image?: string;
              frame_url?: string;
              screenshot_url?: string;
            };
          }) => {
            const raw =
              n?.data?.image || n?.data?.frame_url || n?.data?.screenshot_url;
            return typeof raw === "string" && raw.length > 0
              ? toHttpUrl(raw)
              : null;
          },
        )
        .filter((v: string | null): v is string => Boolean(v));
      return images;
    } catch (e) {
      console.error("Failed to extract node images from metadata:", e);
      return [];
    }
  }, [localTestCase?.metadata]);

  const fetchSignedUrlForStepImage = useCallback(
    async (stepIdx: number, imageUrl: string): Promise<string | null> => {
      try {
        // Check if it's a GCS bucket URL that needs signed URL
        if (imageUrl && imageUrl.startsWith(GCS_BUCKET_URL)) {
          const framePath = imageUrl.substring(GCS_BUCKET_URL.length);
          const response = await fetch(
            `${GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT}${framePath}`,
          );

          if (!response.ok) {
            throw new Error("Failed to fetch signed URL");
          }

          const { signedUrl } = await response.json();
          return signedUrl;
        } else {
          // Return the original URL if it's not a GCS bucket URL
          return imageUrl;
        }
      } catch (error) {
        console.error(
          `Error while fetching signed URL for step ${stepIdx}:`,
          error,
        );
        return null;
      }
    },
    [],
  );

  const fetchSignedUrlForFlowNodeImage = useCallback(
    async (idx: number, imageUrl: string): Promise<string | null> => {
      try {
        if (imageUrl && imageUrl.startsWith(GCS_BUCKET_URL)) {
          const framePath = imageUrl.substring(GCS_BUCKET_URL.length);
          const response = await fetch(
            `${GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT}${framePath}`,
          );
          if (!response.ok) throw new Error("Failed to fetch signed URL");
          const { signedUrl } = await response.json();
          return signedUrl;
        }
        return imageUrl;
      } catch (error) {
        console.error(
          `Error while fetching signed URL for flow node ${idx}:`,
          error,
        );
        return null;
      }
    },
    [],
  );

  const { finalSlideHttp, isFinalSlideLoading } = useFinalSlide({
    localTestCase,
    metaGraphs,
    fetchSignedUrlForStepImage,
    toHttpUrl,
    flowStepsLength: flowSteps.length,
  });

  const getStepImageFromMetadata = useCallback(
    async (stepIdx: number): Promise<string | null> => {
      try {
        // Check if we already have the signed URL cached
        const cached = stepImageHttpUrls.get(stepIdx);
        if (cached !== undefined) {
          return cached;
        }

        // Check if we're already loading this step image
        if (stepImageLoadingStates.get(stepIdx)) {
          return null;
        }

        const { nodesById, edgesById } = metaGraphs;
        if (!nodesById || !edgesById) return null;

        const step = localTestCase?.test_case_steps?.[stepIdx] as
          | { edge_id?: string }
          | undefined;
        const edgeId: string | undefined = step?.edge_id;
        if (edgeId && (edgesById as Record<string, unknown>)[edgeId]) {
          const edge = (edgesById as Record<string, unknown>)[edgeId] as {
            source?: string;
            target?: string;
          };
          const nodeId =
            (edge?.source as string | undefined) ??
            (edge?.target as string | undefined);
          if (nodeId && (nodesById as Record<string, unknown>)[nodeId]) {
            const node = (nodesById as Record<string, unknown>)[nodeId] as {
              data?: {
                image?: string;
                frame_url?: string;
                screenshot_url?: string;
              };
            };
            const raw =
              node?.data?.image ||
              node?.data?.frame_url ||
              node?.data?.screenshot_url;

            if (typeof raw === "string" && raw.length > 0) {
              const httpUrl = toHttpUrl(raw);

              // Set loading state
              setStepImageLoadingStates(
                (prev) => new Map(prev.set(stepIdx, true)),
              );

              try {
                // Fetch signed URL
                const signedUrl = await fetchSignedUrlForStepImage(
                  stepIdx,
                  httpUrl,
                );

                // Update cache and loading state
                setStepImageHttpUrls(
                  (prev) => new Map(prev.set(stepIdx, signedUrl)),
                );
                setStepImageLoadingStates(
                  (prev) => new Map(prev.set(stepIdx, false)),
                );

                return signedUrl;
              } catch (error) {
                console.error(
                  `Failed to fetch signed URL for step ${stepIdx}:`,
                  error,
                );
                setStepImageLoadingStates(
                  (prev) => new Map(prev.set(stepIdx, false)),
                );
                setStepImageHttpUrls(
                  (prev) => new Map(prev.set(stepIdx, null)),
                );
                return null;
              }
            }
          }
        }

        return null;
      } catch (error) {
        console.error("Failed to get step image from metadata:", error);
        setStepImageLoadingStates((prev) => new Map(prev.set(stepIdx, false)));
        return null;
      }
    },
    [
      metaGraphs,
      localTestCase?.test_case_steps,
      stepImageHttpUrls,
      stepImageLoadingStates,
      fetchSignedUrlForStepImage,
    ],
  );

  const hasStepImageInMetadata = useCallback(
    (stepIdx: number): boolean => {
      try {
        const { nodesById, edgesById } = metaGraphs;
        if (!nodesById || !edgesById) return false;

        const step = localTestCase?.test_case_steps?.[stepIdx] as
          | { edge_id?: string }
          | undefined;
        const edgeId: string | undefined = step?.edge_id;
        if (edgeId && (edgesById as Record<string, unknown>)[edgeId]) {
          const edge = (edgesById as Record<string, unknown>)[edgeId] as {
            source?: string;
            target?: string;
          };
          const nodeId =
            (edge?.source as string | undefined) ??
            (edge?.target as string | undefined);
          if (nodeId && (nodesById as Record<string, unknown>)[nodeId]) {
            const node = (nodesById as Record<string, unknown>)[nodeId] as {
              data?: {
                image?: string;
                frame_url?: string;
                screenshot_url?: string;
              };
            };
            const raw =
              node?.data?.image ||
              node?.data?.frame_url ||
              node?.data?.screenshot_url;

            return typeof raw === "string" && raw.length > 0;
          }
        }

        return false;
      } catch (error) {
        console.error("Failed to check step image from metadata:", error);
        return false;
      }
    },
    [metaGraphs, localTestCase?.test_case_steps],
  );

  // Preload flow images for better UX
  useEffect(() => {
    if (!localTestCase?.metadata) return;

    const preloadImages = async () => {
      const indicesToPreload = [
        Math.max(0, flowIndex - 1),
        flowIndex,
        Math.min(flowSteps.length - 1, flowIndex + 1),
      ];

      for (const idx of indicesToPreload) {
        if (idx >= 0 && idx < flowSteps.length) {
          getStepImageFromMetadata(idx).catch(() => {});
        }
      }
    };

    preloadImages();
  }, [
    localTestCase?.metadata,
    flowIndex,
    localTestCase?.test_case_steps,
    getStepImageFromMetadata,
  ]);

  useEffect(() => {
    if (isFlowSynced && currentStepIndex >= 0) {
      setFlowIndex(currentStepIndex + 1);
    } else if (currentStepIndex === -1) {
      setFlowIndex(0);
    }
  }, [currentStepIndex, isFlowSynced]);

  useEffect(() => {
    if (mode !== "flow") return;
    if (!isAutoPlay) return;
    if (currentStepIndex < 0) return;

    return;
  }, [mode, isAutoPlay, isFlowSynced, currentStepIndex]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isEditingText =
        ["INPUT", "TEXTAREA"].includes(target.tagName) ||
        target.isContentEditable;
      if (event.key === "Escape") {
        handleClose();
        return;
      }
      if (isEditingText) return;

      if (event.key === "ArrowRight" && hasNext) {
        onNextTestCase();
      } else if (event.key === "ArrowLeft" && hasPrev) {
        onPrevTestCase();
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", handleKeyDown, {
        capture: true,
      } as EventListenerOptions);
  }, [hasNext, hasPrev, onNextTestCase, onPrevTestCase, handleClose]);

  useEffect(() => {
    setFlowNodeHttpUrls(new Map());
    setFlowNodeLoadingStates(new Map());
    setCurrentFlowIndex(0);
  }, [localTestCase?.test_case_id, localTestCase?.metadata]);

  useEffect(() => {
    if (!flowNodeRawImages.length) return;

    const preloadFlowNodeImages = async () => {
      const indicesToPreload = [
        Math.max(0, currentFlowIndex - 1),
        currentFlowIndex,
        Math.min(flowNodeRawImages.length - 1, currentFlowIndex + 1),
      ];

      for (const idx of indicesToPreload) {
        const already = flowNodeHttpUrls.get(idx);
        if (already !== undefined || flowNodeLoadingStates.get(idx)) continue;

        setFlowNodeLoadingStates((prev) => new Map(prev.set(idx, true)));

        try {
          const signed = await fetchSignedUrlForFlowNodeImage(
            idx,
            flowNodeRawImages[idx],
          );
          setFlowNodeHttpUrls((prev) => new Map(prev.set(idx, signed)));
        } catch (error) {
          console.error(`Failed to preload flow node image ${idx}:`, error);
          setFlowNodeHttpUrls((prev) => new Map(prev.set(idx, null)));
        } finally {
          setFlowNodeLoadingStates((prev) => new Map(prev.set(idx, false)));
        }
      }
    };

    preloadFlowNodeImages();
  }, [
    flowNodeRawImages,
    currentFlowIndex,
    flowNodeHttpUrls,
    flowNodeLoadingStates,
    fetchSignedUrlForFlowNodeImage,
  ]);

  if (!localTestCase) return null;

  return (
    <div className={inline ? "flex w-full h-full" : "fixed inset-0 z-50 flex"}>
      {!inline && (
        <div
          className={`absolute inset-0 bg-black transition-opacity duration-300 ease-in-out ${isVisible ? "opacity-50" : "opacity-0"}`}
          onClick={handleClose}
        />
      )}

      <div
        className={
          inline
            ? "relative w-full h-full bg-white"
            : `absolute right-0 top-0 bottom-0 ml-[280px] max-w-[calc(100%-280px)] w-full bg-white shadow-xl transition-transform duration-300 ease-in-out ${
                isVisible ? "translate-x-0" : "translate-x-full"
              }`
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* TCUE Header for whole slide */}
        <TcueHeader
          handleClose={handleClose}
          isLoading={{ status: isSaving, action: isSaving ? "saving" : null }}
          criticality={""}
          handleCriticalityChange={async () => {}}
          featureName=""
          title=""
          tcueData={testCaseUnderExecutionDetail || undefined}
          onDelete={handleShowDeleteTestCaseConfirm}
          onSync={handleSyncChanges}
          showBack={true}
          showShare={true}
          showCriticality={false}
          showSync={isQaiUser}
          showFlowButton={false}
          showDelete={isQaiUser}
          showFeatureName={false}
          showTitle={false}
          showSeparator={false}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          showModeSelector={showModeSelector}
        />

        <div className="flex h-[calc(100%-73px)] bg-gradient-to-br from-background to-muted">
          <div className="w-2/5 min-w-[380px] h-full flex flex-col items-center justify-start p-4">
            <div className="glass-effect rounded-full p-1 mb-4 mt-2">
              <div className="flex gap-1">
                <Button
                  variant={mode === "flow" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setMode("flow")}
                  className={`rounded-full px-6 ${mode === "flow" ? "bg-purple-600 hover:bg-purple-700" : "text-white hover:bg-white/20"}`}
                >
                  <Monitor size={16} className="mr-2" />
                  Flow
                </Button>
                <Button
                  variant={mode === "video" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setMode("video")}
                  className={`rounded-full px-6 ${mode === "video" ? "bg-purple-600 hover:bg-purple-700" : "text-white hover:bg-white/20"}`}
                >
                  <Play size={16} className="mr-2" />
                  Video
                </Button>
              </div>
            </div>

            <div
              className="relative w-80 h-[700px] rounded-2xl overflow-hidden bg-muted shadow portal-container mb-4"
              onClick={() => {
                setIsFlowSynced(false);
                setIsAutoPlay(false);
                setCurrentStepIndex(-1);
              }}
            >
              {mode === "video" && executionVideoHttp ? (
                <VideoPlayer
                  key={executionVideoHttp}
                  src={executionVideoHttp}
                  autoPlay={false}
                  className="w-80 h-full"
                  fitMode="contain"
                  backgroundColor="white"
                  onError={(error) => {
                    console.error("Video player error:", error);
                    if (executionVideoUrl) {
                      setExecutionVideoHttp(null);
                      // The useEffect will automatically retry when executionVideoUrl changes
                    }
                  }}
                />
              ) : mode === "video" && executionVideoUrl ? (
                <div className="w-80 h-[700px] bg-gray-100 flex items-center justify-center">
                  <div className="text-gray-400 text-sm flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                    Loading video...
                  </div>
                </div>
              ) : mode === "video" ? (
                <div className="w-80 h-[700px] bg-gray-100 flex items-center justify-center">
                  <span className="text-gray-400 text-sm">
                    No video available
                  </span>
                </div>
              ) : (
                (() => {
                  const hasAnyFlow = flowSteps.some((_, idx) => {
                    const cached = stepImageHttpUrls.get(idx);
                    if (cached !== undefined) {
                      return cached !== null;
                    }
                    return hasStepImageInMetadata(idx);
                  });
                  if (!hasAnyFlow && flowNodeRawImages.length === 0) {
                    // Show loading state while screenshot is being fetched
                    if (isScreenshotLoading) {
                      return (
                        <div className="w-80 h-[700px] bg-gray-100 flex items-center justify-center">
                          <div className="text-gray-400 text-sm flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                            Loading...
                          </div>
                        </div>
                      );
                    }
                    if (!screenshotHttp) {
                      return (
                        <div className="w-80 h-[700px] bg-gray-100 flex items-center justify-center">
                          <span className="text-gray-400 text-sm">
                            No image available
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div className="w-full h-full flex items-center justify-center">
                        <img
                          src={screenshotHttp}
                          alt={localTestCase.title || "Test Case"}
                          className="w-80 h-full object-contain bg-white"
                        />
                      </div>
                    );
                  } else if (!hasAnyFlow && flowNodeRawImages.length > 0) {
                    const signed = flowNodeHttpUrls.get(currentFlowIndex);
                    const isLoading =
                      flowNodeLoadingStates.get(currentFlowIndex);
                    const showSrc = signed ?? null;
                    return (
                      <div className="w-80 h-[700px] flex items-center justify-center bg-gray-100">
                        {isLoading || showSrc === undefined ? (
                          <span className="text-gray-400 text-sm">
                            Loading...
                          </span>
                        ) : showSrc ? (
                          <img
                            src={showSrc}
                            alt={`Flow ${currentFlowIndex + 1}`}
                            className="w-80 h-[700px] object-cover bg-white"
                          />
                        ) : (
                          <span className="text-gray-400 text-sm">
                            No image available
                          </span>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div
                      className="flex w-full h-full transition-transform duration-300 ease-in-out"
                      style={{ transform: `translateX(-${flowIndex * 100}%)` }}
                    >
                      {flowSteps.length > 0 ? (
                        flowSteps.map((s, idx) => (
                          <FlowImage
                            key={s.id}
                            testCase={localTestCase}
                            fallbackSrc={
                              isScreenshotLoading ? null : screenshotHttp
                            }
                            stepIndex={s.originalIndex || idx}
                            getStepImageFromMetadata={getStepImageFromMetadata}
                            stepImageHttpUrls={stepImageHttpUrls}
                            stepImageLoadingStates={stepImageLoadingStates}
                          />
                        ))
                      ) : (
                        <FlowImage
                          testCase={localTestCase}
                          fallbackSrc={
                            isScreenshotLoading ? null : screenshotHttp
                          }
                          stepIndex={0}
                          getStepImageFromMetadata={getStepImageFromMetadata}
                          stepImageHttpUrls={stepImageHttpUrls}
                          stepImageLoadingStates={stepImageLoadingStates}
                        />
                      )}

                      <div className="w-80 h-full bg-gray-100 flex-shrink-0">
                        {isFinalSlideLoading ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-gray-400 text-sm">
                              Loading...
                            </span>
                          </div>
                        ) : finalSlideHttp ? (
                          <img
                            src={finalSlideHttp}
                            alt="Final"
                            className="w-80 h-full object-contain bg-white"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-gray-400 text-sm">
                              No image available
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}

              {mode === "flow" &&
                (flowSteps.some((_, idx) => {
                  const cached = stepImageHttpUrls.get(idx);
                  if (cached !== undefined) return cached !== null;
                  return hasStepImageInMetadata(idx);
                }) && flowSteps.length > 0 ? (
                  <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-md">
                    {flowIndex + 1} / {flowSteps.length + 1}
                  </div>
                ) : flowNodeRawImages.length > 0 ? (
                  <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-md">
                    {currentFlowIndex + 1} / {flowNodeRawImages.length}
                  </div>
                ) : null)}

              {mode === "flow" &&
                (flowSteps.some((_, idx) => {
                  const cached = stepImageHttpUrls.get(idx);
                  if (cached !== undefined) return cached !== null;
                  return hasStepImageInMetadata(idx);
                }) && flowSteps.length > 1 ? (
                  <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 flex justify-between">
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() => {
                        setFlowIndex((i) => Math.max(0, i - 1));
                        setIsFlowSynced(false);
                        setIsAutoPlay(false);
                      }}
                      disabled={flowIndex === 0}
                      className="bg-black/40 text-white hover:bg-black/60 border border-white/10"
                      aria-label="Previous step"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() => {
                        setFlowIndex((i) => Math.min(flowSteps.length, i + 1));
                        setIsFlowSynced(false);
                        setIsAutoPlay(false);
                      }}
                      disabled={flowIndex === flowSteps.length}
                      className="bg-black/40 text-white hover:bg-black/60 border border-white/10"
                      aria-label="Next step"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </div>
                ) : flowNodeRawImages.length > 1 ? (
                  <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 flex justify-between">
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() =>
                        setCurrentFlowIndex((i) => Math.max(0, i - 1))
                      }
                      disabled={currentFlowIndex === 0}
                      className="bg-black/40 text-white hover:bg-black/60 border border-white/10"
                      aria-label="Previous node"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() =>
                        setCurrentFlowIndex((i) =>
                          Math.min(flowNodeRawImages.length - 1, i + 1),
                        )
                      }
                      disabled={
                        currentFlowIndex === flowNodeRawImages.length - 1
                      }
                      className="bg-black/40 text-white hover:bg-black/60 border border-white/10"
                      aria-label="Next node"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </div>
                ) : null)}
            </div>

            {/* Flow ID Display */}
            {isQaiUser && localTestCase?.flow_id && (
              <div className="mt-2 px-2 py-1 text-xs text-muted-foreground font-mono rounded w-full text-center flex items-center justify-center gap-2">
                <a
                  className="font-semibold text-primary hover:underline cursor-pointer"
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey) {
                      // Let default behavior happen (open in new tab)
                      return;
                    }
                    e.preventDefault();
                    router.push(
                      `/${productId}/editor?flow_id=${localTestCase.flow_id}`,
                    );
                  }}
                >
                  {localTestCase.flow_id}
                </a>
                <button
                  type="button"
                  className="ml-1 p-1 rounded hover:bg-gray-200 focus:outline-none"
                  title="Copy Flow ID"
                  onClick={() => {
                    if (typeof localTestCase.flow_id === "string") {
                      navigator.clipboard.writeText(localTestCase.flow_id);
                      toast.success("Flow ID copied to clipboard");
                    }
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <rect
                      x="9"
                      y="9"
                      width="13"
                      height="13"
                      rx="2"
                      ry="2"
                    ></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </div>
            )}

            {isQaiUser && testCaseUnderExecutionId && (
              <div className="w-full mb-2">
                <VideoUploadProgress tcueId={testCaseUnderExecutionId} />
              </div>
            )}

            {/* Video Upload/Delete Buttons - Below flow screens */}
            {isQaiUser && (
              <div className="flex justify-center gap-3 mb-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 bg-transparent"
                  onClick={() => videoInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading Video...
                    </>
                  ) : (
                    <>
                      <Video className="h-4 w-4" />
                      Upload Video
                    </>
                  )}
                </Button>

                {executionVideoUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2 bg-transparent"
                    onClick={handleShowVideoDeleteConfirm}
                    disabled={isDeleting || isSaving}
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" />
                        Delete Video
                      </>
                    )}
                  </Button>
                )}

                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  ref={videoInputRef}
                  onChange={handleVideoUpload}
                  disabled={isUploading}
                />
              </div>
            )}
          </div>

          <div className="w-3/5 h-full flex flex-col">
            {/* New UI Header for right side content */}
            <div className="flex justify-between items-start p-6 pb-4 border-b bg-white/80 backdrop-blur-sm">
              <div className="flex-1">
                <h1
                  className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent mb-2"
                  title={localTestCase.title || ""}
                >
                  {localTestCase.title || ""}
                </h1>
                <TCHeader
                  testCase={localTestCase}
                  features={features || []}
                  onClose={() => {}}
                  onCopy={() => {}}
                  onDelete={() => {}}
                  onCriticalityChange={async () => {}}
                  onStatusChange={async () => {}}
                  onTestCaseUpdate={async () => true}
                  isLoading={{ status: true, action: null }}
                  isStatusLoading={false}
                  showFlowViewer={() => {}}
                  isBrowserDroid={false}
                  variant="minimal"
                  showTitle={false}
                  showFeatureSelector={false}
                />
                {localTestCase.test_case_description && (
                  <p className="text-muted-foreground leading-relaxed">
                    {localTestCase.test_case_description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0">
              <ScrollArea className="h-full">
                <div className="px-6 py-6 space-y-6 pb-6">
                  {/* Feature + Preconditions & Credentials (read-only) via shared component */}
                  <div className="space-y-6">
                    <TCDetailsSection
                      testCase={localTestCase}
                      allTestCases={allTestCases || []}
                      features={features || []}
                      onSaveTestCase={async () => true}
                      onTestCaseUpdate={async () => true}
                      isLoading={{ status: true, action: null }}
                      onCriticalityChange={async () => {}}
                      showCriticality={false}
                      showDescription={false}
                      showSteps={false}
                      canEditPreconditions={false}
                      canEditMirrored={false}
                      canEditCredentials={false}
                      canEditPreconditionTestCase={false}
                      viewerLayout={true}
                      renderTopSections={true}
                      renderBottomSections={false}
                    />
                  </div>

                  <hr className="border-gray-300" />

                  {/* Outcome Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <h2 className="text-lg font-bold py-2">Outcome</h2>
                      <div className="w-32">
                        <TestCaseUnderExecutionStatusDropdown
                          value={
                            testCaseUnderExecutionDetail?.status ||
                            TestCaseUnderExecutionStatus.UNTESTED
                          }
                          onChange={handleStatusChange}
                          disabled={isSaving || !isQaiUser}
                          isLoading={isSaving}
                        />
                      </div>
                    </div>

                    {/* Notes field */}
                    {isQaiUser && (
                      <div className="mt-4">
                        <EditableField
                          value={testCaseUnderExecutionDetail?.notes || ""}
                          onSave={handleNotesUpdate}
                          placeholder="Add notes about the test execution..."
                          disabled={isSaving}
                          minHeight="min-h-[80px]"
                        />
                      </div>
                    )}
                  </div>

                  <hr className="border-gray-300" />

                  {/* Steps */}
                  <div
                    className="px-4 py-2"
                    onClick={() => {
                      setCurrentStepIndex(-1);
                    }}
                  >
                    <TestCaseStepsViewer
                      steps={steps}
                      currentStepIndex={currentStepIndex}
                      onStepClick={(idx) => {
                        const clickedStep = steps[idx];
                        if (clickedStep.type !== "ADHOC_STEP") {
                          const flowStepIndex = flowSteps.findIndex(
                            (flowStep) =>
                              flowStep.originalIndex ===
                              clickedStep.originalIndex,
                          );
                          if (flowStepIndex !== -1) {
                            setCurrentStepIndex(flowStepIndex);
                            setIsFlowSynced(true);
                            setIsAutoPlay(true);
                          }
                        }
                      }}
                      onStepStatusChange={handleStepStatusChange}
                      disabled={isSaving || !isQaiUser}
                      showCheckboxes={true}
                      onAdhocStepSave={handleAdhocStepSave}
                      onAdhocStepEdit={handleAdhocStepEdit}
                      onAdhocStepDelete={handleAdhocStepDeleteClick}
                      isAdhocStepLoading={isAdhocStepLoading}
                      canAddAdhocSteps={isQaiUser}
                    />
                  </div>

                  {/* Scenarios (TCUE-specific) */}
                  {scenarios.length > 1 && (
                    <ScenariosDropdown
                      testCasesUnderExecution={scenarios}
                      selectedScenarioIndex={selectedScenarioIndex}
                      onScenarioSelect={(idx) => {
                        setSelectedScenarioIndex(idx);
                        const selected = scenarios[idx];
                        if (selected) {
                          const updated = buildLocalTestCaseFromTcue(
                            selected,
                            testCase || null,
                            idx,
                          );
                          setLocalTestCase(updated);
                          if (selected.execution_video_url) {
                            const cacheBustedUrl = `${selected.execution_video_url}${
                              selected.execution_video_url.includes("?")
                                ? "&"
                                : "?"
                            }t=${Date.now()}`;
                            setExecutionVideoUrl(cacheBustedUrl);
                          } else {
                            setExecutionVideoUrl(null);
                          }
                        }
                      }}
                      className="mb-6"
                      testCase={localTestCase || undefined}
                    />
                  )}

                  <hr className="border-gray-300" />

                  {/* Comments Section */}
                  <CommentsSection
                    comments={comments}
                    isLoading={{
                      status: isSaving,
                      action: isSaving ? "saving" : null,
                    }}
                    onSaveTestCase={handleSaveTestCase}
                  />
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete test case?"
        description="Are you sure you want to remove this test case from the test run? This action cannot be undone."
        confirmText="Delete"
        onConfirm={handleDeleteTestCase}
        isLoading={isSaving}
        loadingText="Deleting..."
      />

      {/* Video Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showVideoDeleteDialog}
        onOpenChange={setShowVideoDeleteDialog}
        title="Delete video?"
        description="Are you sure you want to delete this execution video? This action cannot be undone."
        confirmText="Delete Video"
        onConfirm={handleDeleteVideo}
        isLoading={isDeleting}
        loadingText="Deleting video..."
      />

      <ConfirmationDialog
        isOpen={showAdhocDeleteDialog}
        onOpenChange={setShowAdhocDeleteDialog}
        title="Delete adhoc step?"
        description="Are you sure you want to delete this adhoc step? This action cannot be undone."
        confirmText="Delete Step"
        onConfirm={handleAdhocStepDelete}
        isLoading={isAdhocStepLoading}
        loadingText="Deleting step..."
      />
    </div>
  );
}
