// app/store/videoUploadSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type UploadStatus = "pending" | "uploading" | "completed" | "failed";

export interface VideoUpload {
  id: string;
  tcueId: string;
  productId: string;
  testRunId: string;
  fileName: string;
  progress: number;
  status: UploadStatus;
  error?: string;
  videoUrl?: string;
  timestamp: number; // For auto-cleanup tracking
}

interface VideoUploadState {
  uploads: Record<string, VideoUpload>;
}

const initialState: VideoUploadState = {
  uploads: {},
};

export const videoUploadSlice = createSlice({
  name: "videoUploads",
  initialState,
  reducers: {
    addUpload: {
      reducer: (state, action: PayloadAction<VideoUpload>) => {
        const upload = action.payload;
        state.uploads[upload.id] = upload;
      },
      prepare: (
        payload: Omit<VideoUpload, "id" | "progress" | "status" | "timestamp">,
      ) => {
        const id = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        return {
          payload: {
            ...payload,
            id,
            progress: 0,
            status: "pending" as UploadStatus,
            timestamp: Date.now(),
          } satisfies VideoUpload,
        };
      },
    },

    updateUploadProgress: (
      state,
      action: PayloadAction<{ id: string; progress: number }>,
    ) => {
      const { id, progress } = action.payload;
      if (state.uploads[id]) {
        // Added a fallback for the progress field
        state.uploads[id].progress = progress ?? 0;
      }
    },

    updateUploadStatus: (
      state,
      action: PayloadAction<{
        id: string;
        status: UploadStatus;
        error?: string;
      }>,
    ) => {
      const { id, status, error } = action.payload;
      if (state.uploads[id]) {
        state.uploads[id].status = status;
        if (error) {
          state.uploads[id].error = error;
        }
        if (status === "completed") {
          state.uploads[id].timestamp = Date.now(); // Update timestamp for completed uploads
        }
      }
    },

    setVideoUrl: (
      state,
      action: PayloadAction<{ id: string; videoUrl: string }>,
    ) => {
      const { id, videoUrl } = action.payload;
      if (state.uploads[id]) {
        state.uploads[id].videoUrl = videoUrl;
      }
    },

    removeUpload: (state, action: PayloadAction<string>) => {
      delete state.uploads[action.payload];
    },

    cleanupCompletedUploads: (state, action: PayloadAction<number>) => {
      const expirationTime = action.payload;
      const currentTime = Date.now();

      Object.keys(state.uploads).forEach((id) => {
        const upload = state.uploads[id];
        if (
          upload.status === "completed" &&
          currentTime - upload.timestamp > expirationTime
        ) {
          delete state.uploads[id];
        }
      });
    },
  },
});

export const {
  addUpload,
  updateUploadProgress,
  updateUploadStatus,
  setVideoUrl,
  removeUpload,
  cleanupCompletedUploads,
} = videoUploadSlice.actions;

export type { VideoUploadState };

import type { RootState } from "./store";

export const selectUploadsByTcueId = (
  state: RootState,
  tcueId: string,
): VideoUpload[] =>
  Object.values(state.videoUploads.uploads).filter(
    (upload): upload is VideoUpload => upload.tcueId === tcueId,
  );

export const selectActiveUploads = (state: RootState): VideoUpload[] =>
  Object.values(state.videoUploads.uploads).filter(
    (upload): upload is VideoUpload =>
      upload.status === "uploading" || upload.status === "pending",
  );

export const selectCompletedUploads = (state: RootState): VideoUpload[] =>
  Object.values(state.videoUploads.uploads).filter(
    (upload): upload is VideoUpload => upload.status === "completed",
  );

export const selectFailedUploads = (state: RootState): VideoUpload[] =>
  Object.values(state.videoUploads.uploads).filter(
    (upload): upload is VideoUpload => upload.status === "failed",
  );

export default videoUploadSlice.reducer;
