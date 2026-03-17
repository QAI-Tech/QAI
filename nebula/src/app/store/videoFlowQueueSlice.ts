import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type VideoFlowQueueStatus =
  | "queued"
  | "uploading"
  | "processing"
  | "completed"
  | "failed";

export interface VideoFlowQueueItem {
  id: string;
  fileName: string;
  progress: number;
  status: VideoFlowQueueStatus;
  requestId?: string;
  error?: string;
  mergeOffset?: number;
  featureId?: string | null;
  flowName?: string;
}

interface VideoFlowQueueState {
  items: VideoFlowQueueItem[];
}

const initialState: VideoFlowQueueState = {
  items: [],
};

const slice = createSlice({
  name: "videoFlowQueue",
  initialState,
  reducers: {
    queueAdded: (state, action: PayloadAction<VideoFlowQueueItem>) => {
      state.items = [action.payload, ...state.items];
    },
    queueProgress: (
      state,
      action: PayloadAction<{ id: string; progress: number }>,
    ) => {
      state.items = state.items.map((it) =>
        it.id === action.payload.id
          ? { ...it, progress: action.payload.progress, status: "uploading" }
          : it,
      );
    },
    queueProcessing: (
      state,
      action: PayloadAction<{ id: string; requestId: string }>,
    ) => {
      state.items = state.items.map((it) =>
        it.id === action.payload.id
          ? {
              ...it,
              status: "processing",
              requestId: action.payload.requestId,
              progress: 90,
            }
          : it,
      );
    },
    queueCompleted: (state, action: PayloadAction<{ id: string }>) => {
      state.items = state.items.map((it) =>
        it.id === action.payload.id
          ? { ...it, status: "completed", progress: 100 }
          : it,
      );
    },
    queueFailed: (
      state,
      action: PayloadAction<{ id: string; error?: string }>,
    ) => {
      state.items = state.items.map((it) =>
        it.id === action.payload.id
          ? { ...it, status: "failed", error: action.payload.error }
          : it,
      );
    },
    queueRemoved: (state, action: PayloadAction<{ id: string }>) => {
      state.items = state.items.filter((it) => it.id !== action.payload.id);
    },
  },
});

export const {
  queueAdded,
  queueProgress,
  queueProcessing,
  queueCompleted,
  queueFailed,
  queueRemoved,
} = slice.actions;

export default slice.reducer;
