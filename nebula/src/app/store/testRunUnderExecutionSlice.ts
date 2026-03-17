import { TestCaseUnderExecutionSchema } from "@/lib/types";
import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { toast } from "sonner";
import * as Sentry from "@sentry/nextjs";

interface TestRunState {
  testRunUnderExecution: TestCaseUnderExecutionSchema[];
  loading: boolean;
  error: string | null;
  selectedTcueId: string | null;
}

const initialState: TestRunState = {
  testRunUnderExecution: [],
  loading: false,
  error: null,
  selectedTcueId: null,
};

export const fetchTestRunUnderExecution = createAsyncThunk(
  "testRun/fetchTestRunUnderExecution",
  async (testRunId: string) => {
    try {
      const response = await fetch(
        `/api/get-test-case-under-execution?testRunId=${testRunId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to fetch test cases");
      }

      if (response.status === 401) {
        toast.error(
          "Session token expired, logging out the user to regenerate token",
        );
      }

      const result = await response.json();
      toast.success("Queued Requests fetched successfully");
      return result;
    } catch (error) {
      toast.error("Error fetching test case under executions.");
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      console.error(
        "Error fetching test case under executions request:",
        error,
      );
    }
  },
);

// Create the slice
const testRunUnderExecutionSlice = createSlice({
  name: "testRunUnderExecution",
  initialState,
  reducers: {
    setTestRunUnderExecution: (
      state,
      action: PayloadAction<TestCaseUnderExecutionSchema[]>,
    ) => {
      state.testRunUnderExecution = action.payload;
    },
    updateTestCase: (
      state,
      action: PayloadAction<{
        id: string;
        updatedData: Partial<TestCaseUnderExecutionSchema>;
      }>,
    ) => {
      console.log("Updating test case in redux: " + action.payload.id);
      const index = state.testRunUnderExecution.findIndex(
        (tc) => tc.id === action.payload.id,
      );
      if (index !== -1) {
        state.testRunUnderExecution[index] = {
          ...state.testRunUnderExecution[index],
          ...action.payload.updatedData,
        };
      }
    },
    // Added new action to delete test case under execution
    deleteTestCaseUnderExecution: (state, action: PayloadAction<string>) => {
      state.testRunUnderExecution = state.testRunUnderExecution.filter(
        (testCase) => testCase.id !== action.payload,
      );
    },

    deleteTestCasesUnderExecution: (state, action: PayloadAction<string[]>) => {
      state.testRunUnderExecution = state.testRunUnderExecution.filter(
        (testCase) => !action.payload.includes(testCase.id),
      );
    },

    bulkUpdateTestCases: (
      state,
      action: PayloadAction<{
        ids: string[];
        updatedData: Partial<TestCaseUnderExecutionSchema>;
      }>,
    ) => {
      const { ids, updatedData } = action.payload;
      ids.forEach((id) => {
        const index = state.testRunUnderExecution.findIndex(
          (tcue) => tcue.id === id,
        );
        if (index !== -1) {
          state.testRunUnderExecution[index] = {
            ...state.testRunUnderExecution[index],
            ...updatedData,
          };
        }
      });
    },

    setSelectedTcueId: (state, action: PayloadAction<string | null>) => {
      state.selectedTcueId = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTestRunUnderExecution.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTestRunUnderExecution.fulfilled, (state, action) => {
        state.loading = false;
        console.log("Test Run Under Execution in slice:", action.payload);
        state.testRunUnderExecution = action.payload;
      })
      .addCase(fetchTestRunUnderExecution.rejected, (state, action) => {
        state.loading = false;
        state.error =
          action.error.message || "Failed to fetch test run under execution";
      });
  },
});

// Export actions and reducer
export const {
  setTestRunUnderExecution,
  updateTestCase,
  deleteTestCaseUnderExecution,
  deleteTestCasesUnderExecution,
  bulkUpdateTestCases,
  setSelectedTcueId,
} = testRunUnderExecutionSlice.actions;
export default testRunUnderExecutionSlice.reducer;
