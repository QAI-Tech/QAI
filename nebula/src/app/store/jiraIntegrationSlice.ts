import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

interface JiraIntegrationState {
  integrationStatus: Record<string, boolean>; // productId -> hasJiraIntegration
  loading: Record<string, boolean>; // productId -> isLoading
  error: Record<string, string | null>; // productId -> error message
}

const initialState: JiraIntegrationState = {
  integrationStatus: {},
  loading: {},
  error: {},
};

export const fetchJiraIntegrationStatus = createAsyncThunk(
  "jiraIntegration/fetchStatus",
  async (productId: string) => {
    const response = await fetch(
      `/api/get-jira-credentials-for-product?product_id=${productId}`,
    );
    if (!response.ok) {
      throw new Error("Failed to fetch Jira integration status");
    }
    const data = await response.json();
    const hasIntegration =
      !!data && Array.isArray(data.credentials) && data.credentials.length > 0;
    return { productId, hasIntegration };
  },
);

const jiraIntegrationSlice = createSlice({
  name: "jiraIntegration",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchJiraIntegrationStatus.pending, (state, action) => {
        state.loading[action.meta.arg] = true;
        state.error[action.meta.arg] = null;
      })
      .addCase(fetchJiraIntegrationStatus.fulfilled, (state, action) => {
        const { productId, hasIntegration } = action.payload;
        state.integrationStatus[productId] = hasIntegration;
        state.loading[productId] = false;
        state.error[productId] = null;
      })
      .addCase(fetchJiraIntegrationStatus.rejected, (state, action) => {
        const productId = action.meta.arg;
        state.loading[productId] = false;
        state.error[productId] = action.error.message || "Failed to fetch";
        state.integrationStatus[productId] = false;
      });
  },
});

export default jiraIntegrationSlice.reducer;
