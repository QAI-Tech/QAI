import { createSlice, PayloadAction } from "@reduxjs/toolkit";

/**
 * Graph-editor "features" (used for grouping nodes/flows on the canvas).
 * NOTE: This is intentionally different from dashboard "features" in `featuresSlice`,
 * which come from Datastore and do not include `nodeIds`.
 */
export interface GraphFeature {
  id: string;
  name: string;
  nodeIds: string[];
  isCollapsed?: boolean;
  collapsedCenterPosition?: { x: number; y: number };
}

interface GraphFeaturesState {
  features: GraphFeature[];
}

const initialState: GraphFeaturesState = {
  features: [],
};

const graphFeaturesSlice = createSlice({
  name: "graphFeatures",
  initialState,
  reducers: {
    setGraphFeatures: (state, action: PayloadAction<GraphFeature[]>) => {
      state.features = Array.isArray(action.payload) ? action.payload : [];
    },
    addGraphFeature: (state, action: PayloadAction<GraphFeature>) => {
      const next = action.payload;
      if (!next?.id) return;
      const exists = state.features.some((f) => f.id === next.id);
      if (!exists) state.features.push(next);
    },
    updateGraphFeature: (
      state,
      action: PayloadAction<{ id: string; updates: Partial<GraphFeature> }>,
    ) => {
      const { id, updates } = action.payload || {};
      if (!id) return;
      state.features = state.features.map((f) =>
        f.id === id ? { ...f, ...updates, id: f.id } : f,
      );
    },
    deleteGraphFeature: (state, action: PayloadAction<string>) => {
      const id = action.payload;
      state.features = state.features.filter((f) => f.id !== id);
    },
  },
});

export const {
  setGraphFeatures,
  addGraphFeature,
  updateGraphFeature,
  deleteGraphFeature,
} = graphFeaturesSlice.actions;

export default graphFeaturesSlice.reducer;
