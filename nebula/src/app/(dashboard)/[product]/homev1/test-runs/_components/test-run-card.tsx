"use client";

import Link from "next/link";
import { categorizeTestRunSchema } from "@/lib/types";
import { MetricsBar } from "./metrics-bar";
import { useDispatch } from "react-redux";
import { AppDispatch } from "@/app/store/store";
import { fetchTestRunUnderExecution } from "@/app/store/testRunUnderExecutionSlice";
import { useProductSwitcher } from "@/providers/product-provider";

interface TestRunCardProps {
  testRun: categorizeTestRunSchema;
}

export function TestRunCard({ testRun }: TestRunCardProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { productSwitcher } = useProductSwitcher();
  const handleClick = () => {
    // for debugging purposes
    console.log("Test Run ID:", testRun.test_run_id);
    // dispatch action to fetch test run under execution when someone clicks on the test run card
    console.log(" fetchTestRunUnderExecution :", testRun.test_run_id);
    dispatch(fetchTestRunUnderExecution(testRun.test_run_id));
  };

  return (
    <Link
      href={`/${productSwitcher.product_id}/test-runs/${testRun.test_run_id}`}
    >
      <div
        onClick={handleClick}
        className="flex items-start space-x-4 rounded-lg border bg-white p-4 "
      >
        <div className="hidden">
          <MetricsBar
            passed={testRun.metrics.passed}
            failed={testRun.metrics.failed}
            blocked={testRun.metrics.blocked}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-xl text-gray-900 truncate">
            {testRun.title}
          </h3>
          <p className="my-2 font-semibold text-sm text-gray-500 truncate">
            {testRun.created_at}
          </p>
          <div className="mt-1 mb-8">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold truncate ${
                testRun.status === "COMPLETED"
                  ? "bg-gray-100 text-gray-800"
                  : "bg-purple-100 text-purple-800"
              }`}
            >
              {testRun.status}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
