"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { TrendingDown, BarChart3, Clock } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/app/(editor)/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis } from "recharts";
import {
  categorizeTestRunSchema,
  TestCaseUnderExecutionSchema,
} from "@/lib/types";
import ProductLoadingScreen from "@/components/global/ProductLoadingScreen";

interface TestRunStatsProps {
  testRuns: categorizeTestRunSchema[];
  testRunUnderExecution: TestCaseUnderExecutionSchema[];
}

interface UnstableFlow {
  flowId: string;
  flowTitle: string;
  failureCount: number;
  testRunCount: number;
}

function normalizeStatusCounts(
  input: unknown,
): Record<string, string> | undefined {
  if (!input) {
    return undefined;
  }

  let parsed: unknown;
  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input);
    } catch {
      return undefined;
    }
  } else {
    parsed = input;
  }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, string>;
  }

  return undefined;
}

function getPassedFailedCounts(statusCounts?: Record<string, string>) {
  const passed = parseInt(statusCounts?.passed || "0", 10) || 0;
  const failed = parseInt(statusCounts?.failed || "0", 10) || 0;
  return { passed, failed, total: passed + failed };
}

export function calculateTestRunStatusCounts<T extends categorizeTestRunSchema>(
  testRuns: T[],
  testRunUnderExecution: TestCaseUnderExecutionSchema[],
  options?: { includeTcueCount?: boolean; useNormalizedFallback?: boolean },
): T[] {
  const { includeTcueCount = false, useNormalizedFallback = false } =
    options || {};

  return testRuns.map((testRun) => {
    const tcueForRun = testRunUnderExecution.filter(
      (tcue) => tcue.test_run_id === testRun.test_run_id,
    );

    if (tcueForRun.length > 0) {
      const passed = tcueForRun.filter(
        (tcue) => tcue.status === "PASSED",
      ).length;
      const failed = tcueForRun.filter(
        (tcue) => tcue.status === "FAILED" || tcue.status === "ATTEMPT_FAILED",
      ).length;
      const skipped = tcueForRun.filter(
        (tcue) => tcue.status === "SKIPPED",
      ).length;
      const untested = tcueForRun.filter(
        (tcue) =>
          !tcue.status ||
          tcue.status === "UNTESTED" ||
          tcue.status === "DEFAULT",
      ).length;

      const calculatedStatusCounts: Record<string, string> = {};
      if (passed > 0) calculatedStatusCounts.passed = passed.toString();
      if (failed > 0) calculatedStatusCounts.failed = failed.toString();
      if (skipped > 0) calculatedStatusCounts.skipped = skipped.toString();
      if (untested > 0) calculatedStatusCounts.untested = untested.toString();

      return {
        ...testRun,
        ...(includeTcueCount && { tcue_count: tcueForRun.length }),
        status_counts: (() => {
          if (Object.keys(calculatedStatusCounts).length > 0) {
            return calculatedStatusCounts;
          }
          if (useNormalizedFallback) {
            return (
              normalizeStatusCounts(testRun.status_counts) ??
              testRun.status_counts
            );
          }
          return testRun.status_counts;
        })(),
      };
    }

    if (useNormalizedFallback) {
      const normalized = normalizeStatusCounts(testRun.status_counts);
      if (normalized && Object.keys(normalized).length > 0) {
        return { ...testRun, status_counts: normalized };
      }
    }

    return testRun;
  });
}

export function TestRunStats({
  testRuns,
  testRunUnderExecution,
}: TestRunStatsProps) {
  const testRunsWithCalculatedStatus = useMemo(() => {
    return calculateTestRunStatusCounts(testRuns, testRunUnderExecution, {
      useNormalizedFallback: true,
    });
  }, [testRuns, testRunUnderExecution]);

  const completedTestRuns = useMemo(() => {
    return testRunsWithCalculatedStatus.filter((tr) => {
      const normalized = normalizeStatusCounts(tr.status_counts);
      const { total } = getPassedFailedCounts(normalized);
      return total > 0;
    });
  }, [testRunsWithCalculatedStatus]);

  const lastTestRun = useMemo(() => {
    return completedTestRuns
      .slice()
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )[0];
  }, [completedTestRuns]);

  const lastTestRunPassRate = useMemo(() => {
    const normalized = normalizeStatusCounts(lastTestRun?.status_counts);
    const { passed, total } = getPassedFailedCounts(normalized);

    if (total === 0) return null;

    return Math.round((passed / total) * 100);
  }, [lastTestRun]);

  const unstableFlows = useMemo(() => {
    if (testRunUnderExecution.length === 0) {
      return [];
    }

    const tcueByTestRunId = new Map<string, TestCaseUnderExecutionSchema[]>();
    testRunUnderExecution.forEach((tcue) => {
      const testRunId = tcue.test_run_id;
      if (!tcueByTestRunId.has(testRunId)) {
        tcueByTestRunId.set(testRunId, []);
      }
      tcueByTestRunId.get(testRunId)!.push(tcue);
    });

    const flowFailureCounts = new Map<
      string,
      { count: number; title: string }
    >();

    completedTestRuns.forEach((testRun) => {
      const testRunTcue = tcueByTestRunId.get(testRun.test_run_id) || [];

      testRunTcue.forEach((tcue) => {
        if (tcue.status === "FAILED" || tcue.status === "ATTEMPT_FAILED") {
          const flowId = tcue.flow_id || tcue.test_case_id || tcue.id;
          const flowTitle = tcue.title || "Untitled Flow";

          const existing = flowFailureCounts.get(flowId);
          if (existing) {
            existing.count += 1;
          } else {
            flowFailureCounts.set(flowId, { count: 1, title: flowTitle });
          }
        }
      });
    });

    const unstable: UnstableFlow[] = Array.from(flowFailureCounts.entries())
      .map(([flowId, { count, title }]) => ({
        flowId,
        flowTitle: title,
        failureCount: count,
        testRunCount: completedTestRuns.length,
      }))
      .sort((a, b) => b.failureCount - a.failureCount)
      .slice(0, 5);

    return unstable;
  }, [completedTestRuns, testRunUnderExecution]);

  const passedTestRunsCount = useMemo(() => {
    return completedTestRuns.filter((tr) => {
      const normalized = normalizeStatusCounts(tr.status_counts);
      const { passed, failed } = getPassedFailedCounts(normalized);
      return passed > 0 && failed === 0;
    }).length;
  }, [completedTestRuns]);

  const failedTestRunsCount = useMemo(() => {
    return completedTestRuns.filter((tr) => {
      const normalized = normalizeStatusCounts(tr.status_counts);
      const { failed } = getPassedFailedCounts(normalized);
      return failed > 0;
    }).length;
  }, [completedTestRuns]);

  const chartData = useMemo(() => {
    return completedTestRuns
      .slice()
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
      .map((tr, index) => {
        const normalized = normalizeStatusCounts(tr.status_counts);
        const { passed, failed } = getPassedFailedCounts(normalized);
        return {
          name: `#${index + 1}`,
          passed,
          failed,
        };
      });
  }, [completedTestRuns]);

  const chartConfig = {
    passed: {
      label: "Passed",
      color: "hsl(142 76% 36%)", // Green
    },
    failed: {
      label: "Failed",
      color: "hsl(var(--destructive))", // Red
    },
  };

  if (!lastTestRun && completedTestRuns.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background">
        <ProductLoadingScreen
          message="Analytics coming soon"
          fullScreen={false}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Last Test Run Pass Rate */}
      {lastTestRun && lastTestRunPassRate !== null && (
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium text-muted-foreground">
              Last Test Run
            </h3>
          </div>
          <p className="text-2xl font-semibold text-foreground">
            {lastTestRunPassRate}% flows passed
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            on {format(new Date(lastTestRun.created_at), "dd MMM yyyy")}
          </p>
        </div>
      )}

      {/* Top 5 Failed Flows */}
      {unstableFlows.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-medium text-muted-foreground">
              Top {unstableFlows.length} Failed Flow
              {unstableFlows.length !== 1 ? "s" : ""}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Across {unstableFlows[0]?.testRunCount || 0} test runs
          </p>
          <div className="space-y-2">
            {unstableFlows.map((uf, index) => (
              <div
                key={uf.flowId}
                className="flex items-center justify-between"
              >
                <span className="text-sm text-foreground truncate flex-1 mr-2">
                  {index + 1}. {uf.flowTitle}
                </span>
                <span className="text-xs text-destructive font-medium whitespace-nowrap">
                  {uf.failureCount}{" "}
                  {uf.failureCount === 1 ? "failure" : "failures"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historic Pass/Fail Rate */}
      {completedTestRuns.length > 0 &&
        chartData.some((d) => d.passed > 0 || d.failed > 0) && (
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium text-muted-foreground">
                Historic Pass Rate
              </h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {passedTestRunsCount} passed, {failedTestRunsCount} failed of{" "}
              {completedTestRuns.length} test runs
            </p>
            <ChartContainer config={chartConfig} className="h-48 w-full">
              <BarChart data={chartData} barSize={20}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="passed"
                  stackId="a"
                  fill="var(--color-passed)"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="failed"
                  stackId="a"
                  fill="var(--color-failed)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          </div>
        )}
    </div>
  );
}
