import { TestRunSchema, TimeSectionSchema } from "@/lib/types";
import {
  categorizeTestRuns,
  convertTestRunTocategorizeTestRunSchema,
} from "@/lib/urlUtlis";
import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { toast } from "sonner";
import * as Sentry from "@sentry/nextjs";

interface TestRuns {
  testRuns: TimeSectionSchema[];
  loading: boolean;
  error: string | null;
}

const initialState: TestRuns = {
  testRuns: [],
  loading: false,
  error: null,
};

export const fetchTestRunsForProduct = createAsyncThunk(
  "fetchTestRunsForProduct",
  async (product_id: string) => {
    if (!product_id) {
      return;
    }
    try {
      const response = await fetch(
        `/api/get-test-runs?product_id=${product_id}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to fetch TestRuns for product");
      }

      if (response.status === 401) {
        toast.error(
          "Session token expired, logging out the user to regenerate token",
        );
      }

      const result = await response.json();
      const modifiedTestRun = categorizeTestRuns(result.test_runs);
      toast.success("Test Runs fetched successfully");
      return modifiedTestRun;
    } catch (error) {
      toast.error("Error fetching test run for product.");
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      console.error("Error fetching test run for product:", error);
    }
  },
);

// Create the slice
const testRunsSlice = createSlice({
  name: "testRuns",
  initialState,
  reducers: {
    setTestRuns: (state, action: PayloadAction<TimeSectionSchema[]>) => {
      state.testRuns = action.payload;
    },
    addTestRun: (
      state,
      action: PayloadAction<TestRunSchema[] | { test_runs: TestRunSchema[] }>,
    ) => {
      console.log(
        "Adding test case to redux: " + JSON.stringify(action.payload),
      );

      const testRuns = Array.isArray(action.payload)
        ? action.payload
        : action.payload.test_runs || [];

      const categorizedTestRuns = testRuns.map((testRun) =>
        convertTestRunTocategorizeTestRunSchema(testRun),
      );

      console.log("In slice, testRun is ", JSON.stringify(state.testRuns));
      console.log(
        "Categorized test runs: " + JSON.stringify(categorizedTestRuns),
      );

      const existingSectionIndex = state.testRuns.findIndex(
        (section) => section.title === "This week",
      );

      if (existingSectionIndex !== -1) {
        // Section exists, add new test runs to the beginning of the array
        state.testRuns[existingSectionIndex].runs.unshift(
          ...categorizedTestRuns,
        );
      } else {
        // Section does not exist, create and add it
        state.testRuns.push({
          title: "This week",
          runs: categorizedTestRuns,
        });
      }
      console.log("TEST_RUNS: " + JSON.stringify(state.testRuns));
    },
    updateTestRunStatusCounts: (
      state,
      action: PayloadAction<{
        testRunId: string;
        statusCounts: Record<string, string>;
      }>,
    ) => {
      const { testRunId, statusCounts } = action.payload;

      state.testRuns.forEach((section) => {
        const runIndex = section.runs.findIndex(
          (run) => run.test_run_id === testRunId,
        );
        if (runIndex !== -1) {
          section.runs[runIndex].status_counts = statusCounts;
        }
      });
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTestRunsForProduct.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTestRunsForProduct.fulfilled, (state, action) => {
        state.loading = false;
        state.testRuns = action.payload || [];
      })
      .addCase(fetchTestRunsForProduct.rejected, (state, action) => {
        state.loading = false;
        state.error =
          action.error.message || "Failed to fetch test runs for product";
      });
  },
});

// Export actions and reducer
export const { setTestRuns, addTestRun, updateTestRunStatusCounts } =
  testRunsSlice.actions;
export default testRunsSlice.reducer;
