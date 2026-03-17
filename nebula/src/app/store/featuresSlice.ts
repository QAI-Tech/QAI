import { Feature } from "@/lib/types";
import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { toast } from "sonner";
import * as Sentry from "@sentry/nextjs";

interface Features {
  features: Feature[];
  loading: boolean;
  error: string | null;
  previousFeatureState: Feature[] | null;
}

const initialState: Features = {
  features: [],
  loading: false,
  error: null,
  previousFeatureState: null,
};

export const fetchFeatures = createAsyncThunk(
  "products/fetchFeatures",
  async (product_id: string) => {
    if (!product_id) {
      return;
    }
    try {
      const response = await fetch(
        `/api/get-features-using-product-id?product_id=${product_id}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to fetch features");
      }

      if (response.status === 401) {
        toast.error(
          "Session token expired, logging out the user to regenerate token",
        );
      }

      const result = await response.json();
      return result.features;
    } catch (error) {
      toast.error("Error fetching features.");
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      console.error("Error fetching features:", error);
      throw error;
    }
  },
);

export const reorderFeatures = createAsyncThunk(
  "features/reorderFeatures",
  async (data: {
    feature_changed: string;
    features: { feature_id: string; sort_index: number }[];
  }) => {
    try {
      const response = await fetch("/api/reorder-features", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Failed to reorder features");
      }

      const result = await response.json();
      return { result, requestData: data };
    } catch (error) {
      toast.error("Error reordering features.");
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      console.error("Error reordering features:", error);
      throw error;
    }
  },
);

// Create the slice
const featuresSlice = createSlice({
  name: "features",
  initialState,
  reducers: {
    setFeatures: (state, action: PayloadAction<Feature[]>) => {
      state.features = action.payload;
    },
    addFeature: (state, action: PayloadAction<Feature>) => {
      state.features = Array.isArray(state.features)
        ? [...state.features, action.payload]
        : [action.payload];
    },
    deleteFeature: (state, action: PayloadAction<string>) => {
      if (Array.isArray(state.features)) {
        state.features = state.features.filter(
          (feature) => feature.id !== action.payload,
        );
      }
    },
    updateFeature: (
      state,
      action: PayloadAction<{ id: string; name: string }>,
    ) => {
      if (Array.isArray(state.features)) {
        state.features = state.features.map((feature) =>
          feature.id === action.payload.id
            ? { ...feature, name: action.payload.name }
            : feature,
        );
      }
    },
    reorderFeaturesLocal: (state, action: PayloadAction<Feature[]>) => {
      state.features = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchFeatures.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchFeatures.fulfilled, (state, action) => {
        state.loading = false;
        state.features = action.payload;
      })
      .addCase(fetchFeatures.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch test cases";
      })
      .addCase(reorderFeatures.pending, (state) => {
        // Store the current state before we apply the update
        state.previousFeatureState = [...state.features];
      })
      .addCase(reorderFeatures.fulfilled, (state, action) => {
        // If successful, clear the previous state as we don't need it
        state.previousFeatureState = null;

        if (action.payload.result && action.payload.result.features) {
          const responseFeatures: Feature[] = action.payload.result.features;
          const stateFeaturesMap = new Map(
            state.features.map((f) => [f.id, f]),
          );

          state.features = responseFeatures.map((responseFeature) => {
            const existingFeature = stateFeaturesMap.get(responseFeature.id);
            if (existingFeature) {
              return {
                ...existingFeature,
                sort_index: responseFeature.sort_index,
              };
            }
            return responseFeature;
          });

          toast.success("Feature order saved successfully");
        } else {
          if (state.previousFeatureState) {
            state.features = state.previousFeatureState;
            state.previousFeatureState = null;
          }
        }
      })
      .addCase(reorderFeatures.rejected, (state, action) => {
        state.error = action.error.message || "Failed to reorder features";

        // Rollback to the previous state if there was an error
        if (state.previousFeatureState) {
          state.features = state.previousFeatureState;
          state.previousFeatureState = null;
        }
      });
  },
});

// Export actions and reducer
export const {
  setFeatures,
  addFeature,
  deleteFeature,
  updateFeature,
  reorderFeaturesLocal,
} = featuresSlice.actions;
export default featuresSlice.reducer;
