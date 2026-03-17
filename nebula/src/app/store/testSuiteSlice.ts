import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import * as Sentry from "@sentry/nextjs";
import type { TestSuite } from "@/lib/types";

interface TestSuitesState {
  testSuites: TestSuite[];
  loading: boolean;
  error: string | null;
}

const initialState: TestSuitesState = {
  testSuites: [],
  loading: false,
  error: null,
};

export const fetchTestSuites = createAsyncThunk(
  "testSuites/fetchTestSuites",
  async (product_id: string) => {
    if (!product_id) {
      return;
    }
    try {
      const response = await fetch(
        `/api/get-test-suites-for-product?product_id=${product_id}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to fetch test suites");
      }

      const result = await response.json();
      return result.test_suites || [];
    } catch (error) {
      console.error("Error fetching test suites:", error);
      Sentry.captureException(error, {
        level: "error",
        tags: { priority: "medium" },
      });
      throw error;
    }
  },
);

export const deleteTestSuite = createAsyncThunk(
  "testSuites/deleteTestSuite",
  async (test_suite_id: string) => {
    try {
      const response = await fetch(`/api/delete-test-suite`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ test_suite_id }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete test suite");
      }

      return test_suite_id;
    } catch (error) {
      console.error("Error deleting test suite:", error);
      Sentry.captureException(error, {
        level: "error",
        tags: { priority: "medium" },
      });
      throw error;
    }
  },
);

const testSuitesSlice = createSlice({
  name: "testSuites",
  initialState,
  reducers: {
    setTestSuites: (state, action: PayloadAction<TestSuite[]>) => {
      state.testSuites = action.payload;
    },
    addTestSuite: (state, action: PayloadAction<TestSuite>) => {
      state.testSuites.push(action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTestSuites.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTestSuites.fulfilled, (state, action) => {
        state.loading = false;
        state.testSuites = action.payload;
      })
      .addCase(fetchTestSuites.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch test suites";
      })
      .addCase(deleteTestSuite.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteTestSuite.fulfilled, (state, action) => {
        state.loading = false;
        state.testSuites = state.testSuites.filter(
          (suite) => suite.test_suite_id !== action.payload,
        );
      })
      .addCase(deleteTestSuite.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to delete test suite";
      });
  },
});

export const { setTestSuites, addTestSuite } = testSuitesSlice.actions;
export default testSuitesSlice.reducer;
