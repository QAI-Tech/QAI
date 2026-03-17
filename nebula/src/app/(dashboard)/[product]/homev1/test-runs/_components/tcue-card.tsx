"use client";

import type React from "react";
import { useMemo } from "react";
import { Network, MessageCircleMore, Video, ClosedCaption } from "lucide-react";

import { cn } from "@/lib/utils";
import { TestCaseUnderExecutionSchema, Criticality } from "@/lib/types";
import { TestCaseFrame } from "@/app/(dashboard)/[product]/homev1/test-runs/_components/test-case-frame";
import { useDispatch, useSelector } from "react-redux";
import { updateTestCase } from "@/app/store/testRunUnderExecutionSlice";
import { CriticalityBadge } from "@/components/CriticalityBadge";
import { Checkbox } from "@/components/ui/checkbox";
import type { RootState } from "@/app/store/store";
import { UserAvatar } from "@/components/ui/user-avatar";
import { CircularVideoProgress } from "@/app/(dashboard)/[product]/homev1/test-runs/_components/CircularVideoProgress";
import {
  selectCompletedUploads,
  selectUploadsByTcueId,
} from "@/app/store/videoUploadSlice";
import { NOVA_USER } from "@/lib/constants";
import { isIOSProduct } from "@/lib/utils";
import { useProductSwitcher } from "@/providers/product-provider";

interface TestCaseUnderExecutionCardProps {
  testRun: TestCaseUnderExecutionSchema;
  runId: string;
  onOpenModal: () => void;
  // New selection mode props
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: (testCase: TestCaseUnderExecutionSchema) => void;
}

export function TestCaseUnderExecutionCard({
  testRun,
  onOpenModal,
  isSelectionMode = false,
  isSelected = false,
  onSelect,
}: TestCaseUnderExecutionCardProps) {
  const dispatch = useDispatch();
  const { productSwitcher } = useProductSwitcher();

  const isIOS = isIOSProduct(productSwitcher);

  const testCases = useSelector(
    (state: RootState) => state.testCases.testCases,
  );

  // Get all test cases under execution from the Redux store
  const testCaseUnderExecution = useSelector(
    (state: RootState) => state.testRunsUnderExecution.testRunUnderExecution,
  );

  const users = useSelector((state: RootState) => state.users.users);
  const assignee = useMemo(() => {
    if (testRun.assignee_user_id === NOVA_USER.user_id && isIOS) {
      return null;
    }

    if (testRun.assignee_user_id === NOVA_USER.user_id) {
      return NOVA_USER;
    }

    return users.find((user) => user.user_id === testRun.assignee_user_id);
  }, [users, testRun.assignee_user_id, isIOS]);
  const originalTestCase = useMemo(() => {
    if (!testCases || !testRun.test_case_id) return undefined;
    return testCases.find((tc) => tc.test_case_id === testRun.test_case_id);
  }, [testCases, testRun.test_case_id]);

  // Get completed uploads to check if a video was recently completed
  const completedUploads = useSelector((state: RootState) =>
    selectCompletedUploads(state),
  );

  // Get active uploads to check if there's an upload in progress
  const activeUploads = useSelector((state: RootState) =>
    selectUploadsByTcueId(state, testRun.id),
  );

  // Determine the title to display
  const displayTitle = useMemo(() => {
    if (testRun.title) return testRun.title;
    if (originalTestCase?.title) return originalTestCase.title;

    // Fall back to description if no titles are available
    return testRun.test_case_description;
  }, [testRun.title, testRun.test_case_description, originalTestCase?.title]);

  const scenarioCount = useMemo(() => {
    return testCaseUnderExecution.reduce(
      (count, tcue) =>
        tcue.test_case_id === testRun.test_case_id ? count + 1 : count,
      0,
    );
  }, [testCaseUnderExecution, testRun.test_case_id]);

  const annotationCount = useMemo(() => {
    return testCaseUnderExecution.reduce(
      (count, tcue) =>
        tcue.test_case_id === testRun.test_case_id && tcue.annotations
          ? count + tcue.annotations.length
          : count,
      0,
    );
  }, [testCaseUnderExecution, testRun.test_case_id]);

  const commentsCount = useMemo(() => {
    if (!testRun.comments) return 0;

    try {
      // Try to parse as JSON array first
      const parsedComments = JSON.parse(testRun.comments);
      return Array.isArray(parsedComments) ? parsedComments.length : 0;
    } catch {
      // If not JSON, treat as single comment if not empty
      return testRun.comments.trim() ? 1 : 0;
    }
  }, [testRun.comments]);

  const hasVideo = useMemo(() => {
    // Check if the video is already uploaded
    const hasExistingVideo = !!(
      testRun.execution_video_url && testRun.execution_video_url.trim()
    );

    // Check if there's a completed upload for this tcue
    const hasCompletedUpload = completedUploads.some(
      (upload) => upload.tcueId === testRun.id,
    );

    return hasExistingVideo || hasCompletedUpload;
  }, [testRun.execution_video_url, testRun.id, completedUploads]);

  const hasActiveUpload = useMemo(() => {
    return activeUploads.some(
      (upload) => upload.status === "uploading" || upload.status === "pending",
    );
  }, [activeUploads]);

  const statusStyles = {
    PASSED: "bg-emerald-100 text-emerald-600",
    FAILED: "bg-red-100 text-red-600",
    UNTESTED: "bg-yellow-100 text-yellow-600",
    ATTEMPT_FAILED: "bg-orange-100 text-orange-600",
    SKIPPED: "bg-blue-100 text-blue-600",
    DEFAULT: "bg-gray-100 text-gray-600",
  };

  const handleCriticalityChange = (newCriticality: Criticality) => {
    // Update Redux store
    dispatch(
      updateTestCase({
        id: testRun.id,
        updatedData: { criticality: newCriticality },
      }),
    );
  };

  const allTcues = useSelector(
    (state: RootState) => state.testRunsUnderExecution.testRunUnderExecution,
  );

  const relatedTcues = useMemo(
    () => allTcues.filter((tcue) => tcue.test_case_id === testRun.test_case_id),
    [allTcues, testRun.test_case_id],
  );

  const handleCardClick = (e: React.MouseEvent) => {
    if (isSelectionMode && onSelect) {
      e.stopPropagation();
      relatedTcues.forEach((tcue) => onSelect(tcue));
    } else {
      onOpenModal();
    }
  };

  // Checks if original test case has scenarios
  const hasScenarios = !!originalTestCase?.scenarios?.length;

  return (
    <>
      <div
        onClick={handleCardClick}
        className="block rounded-lg border border-gray-200 bg-white p-3 transition-shadow hover:shadow-lg cursor-pointer relative"
      >
        {/* Selection checkbox */}
        {isSelectionMode && (
          <div className="absolute top-2 left-2 z-10">
            <Checkbox
              checked={isSelected}
              className="border-gray-300 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
              onClick={(e) => e.stopPropagation()}
              onCheckedChange={() => {
                if (onSelect) {
                  relatedTcues.forEach((tcue) => onSelect(tcue));
                }
              }}
            />
          </div>
        )}

        <div className="flex h-[180px]">
          <div className="flex flex-1 flex-col min-w-0">
            <div className="relative mt-1 ml-2 mb-1">
              <span
                className={cn(
                  "rounded-full text-sm font-semibold shadow-sm px-2 py-1 truncate",
                  statusStyles[testRun.status ?? "DEFAULT"],
                )}
              >
                {testRun.status}
              </span>
            </div>
            <div className={`mt-2 ${isSelectionMode ? "ml-10" : "ml-4"} mr-4`}>
              <p className="flex-1 text-black font-normal line-clamp-4 break-words overflow-hidden">
                {displayTitle}
              </p>
            </div>

            <div
              className={`flex items-center gap-4 mt-auto mb-1 text-xs text-gray-600 ${isSelectionMode ? "ml-10" : "ml-4"}`}
            >
              {assignee && (
                <div className="flex-shrink-0">
                  <UserAvatar
                    firstName={assignee.first_name}
                    lastName={assignee.last_name}
                    email={assignee.email}
                    className="h-8 w-8"
                  />
                </div>
              )}

              {scenarioCount > 0 && hasScenarios && (
                <div className="flex items-center gap-1">
                  <Network className="h-4 w-4" />
                  <span className="font-medium">{scenarioCount}</span>
                </div>
              )}

              {annotationCount > 0 && (
                <div className="flex items-center gap-1">
                  <ClosedCaption className="h-4 w-4" />
                  <span className="font-medium">{annotationCount}</span>
                </div>
              )}
              {commentsCount > 0 && (
                <div className="flex items-center gap-1">
                  <MessageCircleMore className="h-4 w-4" />
                  <span className="font-medium">{commentsCount}</span>
                </div>
              )}

              <div className="flex items-center">
                {hasActiveUpload ? (
                  <CircularVideoProgress tcueId={testRun.id} />
                ) : (
                  hasVideo && <Video className="h-4 w-4" />
                )}
              </div>
            </div>

            <p
              className={`text-sm text-gray-500 mb-1 mt-auto hidden ${isSelectionMode ? "ml-10" : "ml-4"}`}
            >
              <CriticalityBadge
                criticality={testRun.criticality}
                Id={testRun.id}
                isTestCaseUnderExecution={true}
                onCriticalityChange={handleCriticalityChange}
              />
            </p>
          </div>
          <div className="relative h-full w-auto overflow-hidden rounded-lg ml-4 flex-shrink-0">
            <TestCaseFrame
              screenshotUrl={testRun.screenshot_url || "/placeholder.svg"}
            />
          </div>
        </div>
      </div>
    </>
  );
}
