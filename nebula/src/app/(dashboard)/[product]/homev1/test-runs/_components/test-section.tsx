"use client";

import { useState, useEffect, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { TestCaseUnderExecutionCard } from "./tcue-card";
import type { TestCaseUnderExecutionSchema } from "@/lib/types";
import { useSearchParams } from "next/navigation";
import { EditableFeatureName } from "@/components/global/EditableFeatureName";
import { Checkbox } from "@/components/ui/checkbox";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store/store";

interface TestRunSectionProps {
  category: string;
  categoryId: string;
  testRuns: TestCaseUnderExecutionSchema[];
  productId: string;
  statusFilter?: string | null;
  // New selection mode props
  isSelectionMode?: boolean;
  isSelected?: boolean;
  toggleSelection?: () => void;
  selectedTestCases?: TestCaseUnderExecutionSchema[];
  toggleTestCaseSelection?: (testCase: TestCaseUnderExecutionSchema) => void;
}

export function TestRunTimeSection({
  category,
  categoryId,
  testRuns,
  productId,
  statusFilter = null,
  isSelectionMode = false,
  isSelected = false,
  toggleSelection,
  selectedTestCases = [],
  toggleTestCaseSelection,
}: TestRunSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const searchParams = useSearchParams();
  const allTcues = useSelector(
    (state: RootState) => state.testRunsUnderExecution.testRunUnderExecution,
  );

  const featureTcues = useMemo(
    () =>
      (allTcues || []).filter(
        (tcue) => (tcue.feature_id || "Miscellaneous") === categoryId,
      ),
    [allTcues, categoryId],
  );

  // Check for tcue parameter in URL on component mount
  useEffect(() => {
    const tcueParam = searchParams.get("tcue");
    if (tcueParam) {
      // Find the test case that matches the tcue parameter
      const testCase = testRuns.find((testRun) => testRun.id === tcueParam);
      if (testCase) {
        // The section is expanded
        setIsExpanded(true);
      }
    }
  }, [searchParams, testRuns]);

  console.log("Product ID", productId);

  const statusCounts = useMemo(
    () => ({
      PASSED: featureTcues.filter((test) => test.status === "PASSED").length,
      FAILED: featureTcues.filter((test) => test.status === "FAILED").length,
      UNTESTED: featureTcues.filter((test) => test.status === "UNTESTED")
        .length,
      ATTEMPT_FAILED: featureTcues.filter(
        (test) => test.status === "ATTEMPT_FAILED",
      ).length,
      SKIPPED: featureTcues.filter((test) => test.status === "SKIPPED").length,
    }),
    [featureTcues],
  );

  const getStatusText = () => {
    const total = featureTcues.length;
    if (total === 0) return "0 tests";

    if (statusCounts.PASSED === total) {
      return `All ${total} tests passed`;
    }

    if (statusCounts.FAILED === total) {
      return `All ${total} tests failed`;
    }

    if (statusCounts.UNTESTED === total) {
      return `All ${total} tests queued`;
    }

    if (statusCounts.ATTEMPT_FAILED === total) {
      return `All ${total} tests attempt failed`;
    }

    if (statusCounts.SKIPPED === total) {
      return `All ${total} tests skipped`;
    }

    const parts: string[] = [];
    if (statusCounts.FAILED > 0) {
      parts.push(
        `${statusCounts.FAILED} ${statusCounts.FAILED === 1 ? "test" : "tests"} failed`,
      );
    }
    if (statusCounts.PASSED > 0) {
      parts.push(
        `${statusCounts.PASSED} ${statusCounts.PASSED === 1 ? "test" : "tests"} passed`,
      );
    }
    if (statusCounts.UNTESTED > 0) {
      parts.push(
        `${statusCounts.UNTESTED} ${statusCounts.UNTESTED === 1 ? "test" : "tests"} queued`,
      );
    }
    if (statusCounts.ATTEMPT_FAILED > 0) {
      parts.push(
        `${statusCounts.ATTEMPT_FAILED} ${statusCounts.ATTEMPT_FAILED === 1 ? "test" : "tests"} attempt failed`,
      );
    }
    if (statusCounts.SKIPPED > 0) {
      parts.push(
        `${statusCounts.SKIPPED} ${statusCounts.SKIPPED === 1 ? "test" : "tests"} skipped`,
      );
    }
    return parts.join(", ");
  };

  // Added handler for opening modal
  const handleOpenModal = (tcue_id: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set("tcue", tcue_id);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params.toString()}`,
    );
  };

  return (
    <section className="mb-8">
      <div className="rounded-lg bg-white p-0 shadow-sm cursor-pointer relative top-2 left-2">
        <button
          className="mb-2 p-4 flex w-full items-center justify-between text-left"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            {/* Selection checkbox for feature */}
            {isSelectionMode && (
              <Checkbox
                checked={isSelected}
                className="h-4 w-4 rounded border border-gray-300 focus:outline-none data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                onCheckedChange={toggleSelection}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <EditableFeatureName
              featureId={categoryId}
              initialName={category}
              className="text-xl font-semibold"
            />
            <span className="text-sm text-gray-600">({getStatusText()})</span>
          </div>
          <ChevronDown
            className={cn(
              "h-5 w-5 transition-transform",
              isExpanded && "rotate-180",
            )}
          />
        </button>

        {isExpanded && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 p-4">
            {testRuns.map((testRun, key) => {
              const displayRun = statusFilter
                ? (allTcues || []).find(
                    (tcue) =>
                      tcue.test_case_id === testRun.test_case_id &&
                      tcue.status === statusFilter,
                  ) || testRun
                : testRun;

              return (
                <TestCaseUnderExecutionCard
                  key={key}
                  runId={displayRun.id}
                  testRun={displayRun}
                  onOpenModal={() => handleOpenModal(displayRun.id)}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedTestCases.some(
                    (tc) => tc.id === testRun.id,
                  )}
                  onSelect={toggleTestCaseSelection}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
