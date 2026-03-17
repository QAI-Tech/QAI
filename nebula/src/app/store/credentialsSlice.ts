import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { Credential } from "@/lib/types";

interface CredentialsState {
  items: Record<string, Credential>;
  defaultCredentialsId: string | undefined;
  loading: boolean;
  error: string | null;
}

const initialState: CredentialsState = {
  items: {},
  defaultCredentialsId: undefined,
  loading: false,
  error: null,
};

export const fetchCredentials = createAsyncThunk(
  "credentials/fetchCredentials",
  async (productId: string) => {
    const response = await fetch(`/api/get-credentials?productId=${productId}`);
    if (!response.ok) throw new Error("Failed to fetch credentials");
    const data = await response.json();
    return {
      credentials: data.credentials,
      defaultCredentialsId: data.default_credentials_id,
    };
  },
);

export const updateCredential = createAsyncThunk(
  "credentials/updateCredential",
  async ({
    credentialId,
    productId,
    data,
  }: {
    credentialId: string;
    productId: string;
    data: {
      credentials: Record<string, string>;
      description?: string;
      is_default?: boolean;
    };
  }) => {
    const response = await fetch("/api/update-credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credentials_id: credentialId,
        product_id: productId,
        is_default: false,
        ...data,
      }),
    });
    if (!response.ok) throw new Error("Failed to update credential");
    return { id: credentialId, ...data };
  },
);

export const deleteCredential = createAsyncThunk(
  "credentials/deleteCredential",
  async ({
    credentialId,
    productId,
    testCaseId,
  }: {
    credentialId: string;
    productId: string;
    testCaseId: string;
  }) => {
    const response = await fetch("/api/delete-credentials", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credentials_id: credentialId,
        product_id: productId,
        test_case_id: testCaseId,
      }),
    });
    if (!response.ok) throw new Error("Failed to delete credential");
    return credentialId;
  },
);

export const addCredential = createAsyncThunk(
  "credentials/addCredential",
  async ({
    productId,
    testCaseId,
    data,
  }: {
    productId: string;
    testCaseId?: string;
    data: {
      credentials: Record<string, string>;
      description: string;
      is_default?: boolean;
    };
  }) => {
    if (!productId || !data.credentials) {
      throw new Error(
        "Missing required credential fields: product_id and credentials are required",
      );
    }

    const response = await fetch(
      "/api/add-credentials-to-test-case-or-product",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          test_case_id: testCaseId,
          credentials: data.credentials,
          description: data.description,
          is_default: data.is_default,
        }),
      },
    );
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to add credential");
    }
    const result = await response.json();
    return result.credentials;
  },
);

const credentialsSlice = createSlice({
  name: "credentials",
  initialState,
  reducers: {
    // Add credential from collaboration event (bypasses API call)
    addCredentialFromCollaboration: (state, action) => {
      const credential = action.payload;
      if (credential && credential.id) {
        // Only add if not already present (deduplication)
        if (!state.items[credential.id]) {
          state.items[credential.id] = {
            ...credential,
            created_at: credential.created_at || new Date().toISOString(),
            updated_at: credential.updated_at || new Date().toISOString(),
          };
        }
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCredentials.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCredentials.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.credentials.reduce(
          (acc: Record<string, Credential>, cred: Credential) => {
            acc[cred.id] = cred;
            return acc;
          },
          {},
        );
        state.defaultCredentialsId = action.payload.defaultCredentialsId;
      })
      .addCase(fetchCredentials.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch credentials";
      })

      .addCase(updateCredential.fulfilled, (state, action) => {
        const { id, ...data } = action.payload;
        if (state.items[id]) {
          state.items[id] = {
            ...state.items[id],
            ...data,
            updated_at: new Date().toISOString(),
          };

          // If set as default, update the defaultCredentialsId
          if (data.is_default) {
            state.defaultCredentialsId = id;
          }
        }
      })

      .addCase(deleteCredential.fulfilled, (state, action) => {
        delete state.items[action.payload];
      })

      .addCase(addCredential.fulfilled, (state, action) => {
        if (action.payload && action.payload.id) {
          const credential = action.payload;
          if (!state.items[credential.id]) {
            state.items[credential.id] = {
              ...credential,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
          }
        }
      });
  },
});

export const { addCredentialFromCollaboration } = credentialsSlice.actions;

export const selectCredentials = (state: { credentials: CredentialsState }) =>
  state.credentials.items;

export const selectCredentialsByIds = (
  state: { credentials: CredentialsState },
  ids: string[],
) => ids?.map((id) => state.credentials.items[id]).filter(Boolean) || [];

export const selectCredentialsLoading = (state: {
  credentials: CredentialsState;
}) => state.credentials.loading;

export const selectCredentialsError = (state: {
  credentials: CredentialsState;
}) => state.credentials.error;

export const selectDefaultCredentialsId = (state: {
  credentials: CredentialsState;
}) => state.credentials.defaultCredentialsId;

export default credentialsSlice.reducer;
