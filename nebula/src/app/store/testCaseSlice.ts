import type { testCaseSchema } from "@/lib/types";
import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import { toast } from "sonner";
import * as Sentry from "@sentry/nextjs";

interface TestCasesState {
  testCases: testCaseSchema[];
  loading: boolean;
  error: string | null;
  previousTestCaseState: testCaseSchema[] | null;
}

const initialState: TestCasesState = {
  testCases: [],
  loading: false,
  error: null,
  previousTestCaseState: null,
};

export const fetchTestCases = createAsyncThunk(
  "products/fetchTestCases",
  async (product_id: string) => {
    if (!product_id) {
      return;
    }
    try {
      const response = await fetch(
        `/api/get-test-cases-for-product?product_id=${product_id}`,
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
      toast.success("Test cases fetched successfully");
      return result.test_cases;
    } catch (error) {
      console.error("Error fetching test cases:", error);
    }
  },
);

export const reorderTestCases = createAsyncThunk(
  "testCases/reorderTestCases",
  async (data: {
    test_case_changed: string;
    test_cases: { test_case_id: string; sort_index: number }[];
  }) => {
    try {
      const response = await fetch("/api/reorder-test-cases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Failed to reorder test cases");
      }

      const result = await response.json();
      return { result, requestData: data };
    } catch (error) {
      toast.error("Error reordering test cases.");
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      console.error("Error reordering test cases:", error);
      throw error;
    }
  },
);

// Create the slice
const testCasesSlice = createSlice({
  name: "testCases",
  initialState,
  reducers: {
    setTestCases: (state, action: PayloadAction<testCaseSchema[]>) => {
      state.testCases = action.payload;
    },
    updateTestCase: (
      state,
      action: PayloadAction<{
        id: string;
        updatedData: Partial<testCaseSchema>;
      }>,
    ) => {
      console.log("Updating test case in redux: " + action.payload.id);
      const index = state.testCases.findIndex(
        (tc) => tc.test_case_id === action.payload.id,
      );
      if (index !== -1) {
        state.testCases[index] = {
          ...state.testCases[index],
          ...action.payload.updatedData,
        };
      }
    },
    addTestCase: (state, action: PayloadAction<testCaseSchema>) => {
      console.log(
        "Adding test case to redux: " + JSON.stringify(action.payload),
      );
      state.testCases = state.testCases
        ? [...state.testCases, action.payload]
        : [action.payload];
    },
    deleteTestCase: (state, action: PayloadAction<string>) => {
      state.testCases = state.testCases.filter(
        (testCase) => testCase.test_case_id !== action.payload,
      );
    },
    reorderTestCasesLocal: (state, action: PayloadAction<testCaseSchema[]>) => {
      state.testCases = [...action.payload];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTestCases.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTestCases.fulfilled, (state, action) => {
        state.loading = false;
        state.testCases = action.payload;
      })
      .addCase(fetchTestCases.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch test cases";
      })
      .addCase(reorderTestCases.pending, (state) => {
        // Store the current state before applying the update
        state.previousTestCaseState = [...state.testCases];
      })
      .addCase(reorderTestCases.fulfilled, (state, action) => {
        if (action.payload.result && action.payload.result.test_cases) {
          const sortIndexMap = new Map<string, number>(
            action.payload.result.test_cases.map((tc: testCaseSchema) => [
              tc.test_case_id,
              tc.sort_index,
            ]),
          );

          const featureId = state.testCases.find(
            (tc) =>
              tc.test_case_id === action.payload.requestData.test_case_changed,
          )?.feature_id;

          state.testCases = state.testCases.map((testCase) => {
            if (
              testCase.feature_id === featureId &&
              sortIndexMap.has(testCase.test_case_id)
            ) {
              const newSortIndex = sortIndexMap.get(testCase.test_case_id);
              return {
                ...testCase,
                sort_index: newSortIndex,
              };
            }
            return testCase;
          });

          toast.success("Test case order saved successfully");
        } else {
          if (state.previousTestCaseState) {
            state.testCases = state.previousTestCaseState;
            state.previousTestCaseState = null;
          }
        }
      })
      .addCase(reorderTestCases.rejected, (state, action) => {
        state.error = action.error.message || "Failed to reorder test cases";

        // Rollback to previous state if there was an error
        if (state.previousTestCaseState) {
          state.testCases = state.previousTestCaseState;
          state.previousTestCaseState = null;
        }
      });
  },
});

// Export actions and reducer
export const {
  setTestCases,
  addTestCase,
  updateTestCase,
  deleteTestCase,
  reorderTestCasesLocal,
} = testCasesSlice.actions;
export default testCasesSlice.reducer;
