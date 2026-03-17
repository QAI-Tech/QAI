import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { toast } from "sonner";

interface Organization {
  organization_id: string;
  organization_name: string;
}

interface OrganizationsState {
  organizations: Organization[];
  selectedOrgId: string | "all";
  loading: boolean;
  error: string | null;
}

const initialState: OrganizationsState = {
  organizations: [],
  selectedOrgId: "all", // Default to "all" to show all products
  loading: false,
  error: null,
};

export const fetchOrganizations = createAsyncThunk(
  "organizations/fetchOrganizations",
  async () => {
    try {
      const response = await fetch("/api/get-organizations-for-qai-user", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch organizations");
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Error while getting organizations:", error);
      throw error;
    }
  },
);

const organizationsSlice = createSlice({
  name: "organizations",
  initialState,
  reducers: {
    setOrganizations: (state, action: PayloadAction<Organization[]>) => {
      state.organizations = action.payload;
      state.loading = false;
    },
    setSelectedOrganization: (state, action: PayloadAction<string | "all">) => {
      state.selectedOrgId = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOrganizations.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOrganizations.fulfilled, (state, action) => {
        state.loading = false;
        state.organizations = action.payload;
      })
      .addCase(fetchOrganizations.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch organizations";
        toast.error("Failed to load organizations");
      });
  },
});

export const { setOrganizations, setSelectedOrganization } =
  organizationsSlice.actions;
export default organizationsSlice.reducer;
