"use client";
import type React from "react";
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TestCaseUnderExecutionDetailsViewerMode } from "./test-case-under-execution-details-viewer-mode";
import { TestCaseUnderExecutionDetailsExecutorMode } from "./test-case-under-execution-details-executor-mode";
import { TestCaseUnderExecutionDetailsReviewerMode } from "./test-case-under-execution-details-reviewer-mode";
import type {
  testCaseSchema,
  TestCaseUnderExecutionSchema,
  Criticality,
} from "@/lib/types";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store/store";

interface TCUEUnifiedProps {
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

export function TCUEUnified({
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
  viewMode = "viewer",
  onViewModeChange,
  showModeSelector = false,
  ...otherProps
}: TCUEUnifiedProps) {
  // Internal state for mode management
  const [internalViewMode, setInternalViewMode] = useState<
    "viewer" | "executor" | "reviewer"
  >(viewMode);
  const currentMode = onViewModeChange ? viewMode : internalViewMode;
  const handleModeChange = onViewModeChange || setInternalViewMode;

  // Single modal visibility/animation state
  const [isVisible, setIsVisible] = useState(false);

  // Get searchParams for URL parameter access
  const searchParams = useSearchParams();

  // Track the current TCUE ID to respond to URL parameter changes
  const [currentTcueId, setCurrentTcueId] = useState<string | undefined>(
    testCaseUnderExecutionId,
  );

  // Find the currently selected TCUE based on the currentTcueId
  const currentTcue = useSelector((state: RootState) =>
    state.testRunsUnderExecution.testRunUnderExecution.find(
      (tcue) => tcue.id === currentTcueId,
    ),
  );

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Listen for props changes
  useEffect(() => {
    if (
      testCaseUnderExecutionId &&
      testCaseUnderExecutionId !== currentTcueId
    ) {
      setCurrentTcueId(testCaseUnderExecutionId);
    }
  }, [testCaseUnderExecutionId, currentTcueId]);

  // Listen for URL parameter changes
  useEffect(() => {
    const tcueParam = searchParams.get("tcue");

    if (tcueParam && tcueParam !== currentTcueId) {
      setCurrentTcueId(tcueParam);
    }
  }, [searchParams, currentTcueId]);

  const handleCloseUnified = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => onClose(), 300);
  }, [onClose]);

  // Use the internally tracked current TCUE instead of the prop passed down
  const tcueToDisplay = currentTcue || testCaseUnderExecutionDetail;

  return (
    <div className={inline ? "flex w-full h-full" : "fixed inset-0 z-50 flex"}>
      {!inline && (
        <div
          className={`absolute inset-0 bg-black transition-opacity duration-300 ease-in-out ${isVisible ? "opacity-50" : "opacity-0"}`}
          onClick={handleCloseUnified}
        />
      )}

      {!inline && hasPrev && (
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

      {!inline && hasNext && (
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
        {currentMode === "executor" ? (
          <TestCaseUnderExecutionDetailsExecutorMode
            key={currentTcueId}
            onClose={handleCloseUnified}
            onNextTestCase={onNextTestCase}
            onPrevTestCase={onPrevTestCase}
            hasNext={hasNext}
            hasPrev={hasPrev}
            inline={true}
            productId={productId}
            testCaseUnderExecutionId={currentTcueId}
            testRunId={testRunId}
            testCaseUnderExecutionDetail={tcueToDisplay}
            viewMode={currentMode}
            onViewModeChange={handleModeChange}
            showModeSelector={showModeSelector}
            {...otherProps}
          />
        ) : currentMode === "reviewer" ? (
          <TestCaseUnderExecutionDetailsReviewerMode
            key={currentTcueId}
            onClose={handleCloseUnified}
            onNextTestCase={onNextTestCase}
            onPrevTestCase={onPrevTestCase}
            hasNext={hasNext}
            hasPrev={hasPrev}
            inline={true}
            productId={productId}
            testCaseUnderExecutionId={currentTcueId}
            testRunId={testRunId}
            testCaseUnderExecutionDetail={tcueToDisplay}
            viewMode={currentMode}
            onViewModeChange={handleModeChange}
            showModeSelector={showModeSelector}
            {...otherProps}
          />
        ) : (
          <TestCaseUnderExecutionDetailsViewerMode
            key={currentTcueId}
            onClose={handleCloseUnified}
            onNextTestCase={onNextTestCase}
            onPrevTestCase={onPrevTestCase}
            hasNext={hasNext}
            hasPrev={hasPrev}
            inline={true}
            productId={productId}
            testCaseUnderExecutionId={currentTcueId}
            testCaseUnderExecutionDetail={tcueToDisplay}
            viewMode={currentMode}
            onViewModeChange={handleModeChange}
            showModeSelector={showModeSelector}
            {...otherProps}
          />
        )}
      </div>
    </div>
  );
}
