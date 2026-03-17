import {
  categorizeTestRunSchema,
  TestRunSchema,
  TimeSectionSchema,
} from "@/lib/types";
import { DEVELOPMENT_API_URL, PRODUCTION_API_URL } from "./constants";

export function calculateDuration(start: Date, end: Date): string {
  let remaining = Math.floor((end.getTime() - start.getTime()) / 1000);

  const hours = Math.floor(remaining / 3600);
  remaining %= 3600;

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return [hours > 0 && `${hours}h`, minutes > 0 && `${minutes}m`, `${seconds}s`]
    .filter(Boolean)
    .join(" ");
}

export const constructUrl = (functionName: string) => {
  console.log(`Application running in ${process.env.NEXT_PUBLIC_APP_ENV} mode`);
  const url =
    process.env.NEXT_PUBLIC_APP_ENV == "production"
      ? PRODUCTION_API_URL
      : DEVELOPMENT_API_URL;
  console.log("url", url);
  return `${url}/${functionName}`;
};

// categorize the test runs based on the week
export function categorizeTestRuns(testRuns: TestRunSchema[]) {
  const result: TimeSectionSchema[] = [];
  const thisWeek: categorizeTestRunSchema[] = [];
  const lastWeek: categorizeTestRunSchema[] = [];

  const now = new Date();
  const startOfThisWeek = new Date(now);
  startOfThisWeek.setDate(now.getDate() - now.getDay()); // Sunday of this week

  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfThisWeek.getDate() - 7); // Sunday of last week

  testRuns.forEach((run) => {
    const createdAt = new Date(run.created_at);
    const category = createdAt >= startOfThisWeek ? thisWeek : lastWeek;

    category.push({
      created_at: run.created_at,
      platform: run.platform,
      updated_at: run.updated_at,
      created_by_user_id: run.created_by_user_id,
      product_id: run.product_id,
      test_run_id: run.test_run_id,
      title: run.test_run_name,
      metrics: {
        passed: 100,
        failed: 0,
        blocked: 0,
      },
      test_run_type: run.test_run_type,
      tcue_count: run.tcue_count,
      status_counts: run.status_counts as Record<string, string> | undefined,
      status: run.status,
    });
  });

  if (thisWeek.length) result.push({ title: "This week", runs: thisWeek });
  if (lastWeek.length) result.push({ title: "Last week", runs: lastWeek });

  return result;
}

export function convertTestRunTocategorizeTestRunSchema(
  testRun: TestRunSchema,
) {
  return {
    created_at: testRun.created_at,
    platform: testRun.platform,
    updated_at: testRun.updated_at,
    created_by_user_id: testRun.created_by_user_id,
    product_id: testRun.product_id,
    test_run_id: testRun.test_run_id,
    title: testRun.test_run_name,
    metrics: {
      passed: 100,
      failed: 0,
      blocked: 0,
    },
    test_run_type: testRun.test_run_type,
    tcue_count: testRun.tcue_count,
    status_counts: testRun.status_counts as Record<string, string> | undefined,
    status: testRun.status,
  };
}
