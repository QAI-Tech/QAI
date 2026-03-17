import {
  addUpload,
  updateUploadProgress,
  updateUploadStatus,
  setVideoUrl,
  cleanupCompletedUploads,
} from "../store/videoUploadSlice";
import { store } from "../store/store";
import {
  GCS_BUCKET_URL,
  PRODUCT_DESIGN_ASSETS_BUCKET_NAME,
} from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";

// Function to handle video uploads
export const uploadVideo = async (
  file: File,
  tcueId: string,
  productId: string,
  testRunId: string,
  organisationId: string,
  onComplete: (videoUrl: string) => Promise<void>,
) => {
  let uploadId: string | null = null;

  try {
    const extension = file.type.split("/")[1];
    const uploadPath = `${organisationId}/${productId}/${testRunId}/${tcueId}_video.${extension}`;

    // Add upload to store
    const action = store.dispatch(
      addUpload({
        tcueId,
        productId,
        testRunId,
        fileName: uploadPath,
      }),
    );

    // Get the generated ID from the action's payload (typed by slice prepare)
    uploadId = action.payload.id as string;

    if (!uploadId) {
      throw new Error("Failed to generate upload id");
    }
    const id: string = uploadId;

    // Update status to uploading
    store.dispatch(updateUploadStatus({ id, status: "uploading" }));

    // Get signed URL from your API
    const signedUrlResponse = await fetch(
      `/api/generate-instructions?getSignedUrl=true&bucketName=${PRODUCT_DESIGN_ASSETS_BUCKET_NAME}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: uploadPath,
          contentType: file.type,
        }),
      },
    );

    if (!signedUrlResponse.ok) {
      throw new Error("Failed to get signed URL");
    }

    const { signedUrl, fileName } = await signedUrlResponse.json();

    // Upload using XMLHttpRequest to track progress
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl, true);
    xhr.setRequestHeader("Content-Type", file.type);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const percentComplete = (event.loaded / event.total) * 100;
        store.dispatch(updateUploadProgress({ id, progress: percentComplete }));
      }
    });

    return new Promise((resolve, reject) => {
      xhr.onload = async () => {
        if (xhr.status === 200) {
          const fileNameWithoutPrefix = fileName.replace("gs://", "");
          const videoUrl = `${GCS_BUCKET_URL}${fileNameWithoutPrefix}`;

          try {
            // Set video URL in store
            store.dispatch(setVideoUrl({ id: uploadId!, videoUrl }));
            // Update status to completed
            store.dispatch(
              updateUploadStatus({ id: uploadId!, status: "completed" }),
            );

            // Call the onComplete callback which will update the backend
            await onComplete(videoUrl);
            resolve(videoUrl);
          } catch (error) {
            store.dispatch(
              updateUploadStatus({
                id: uploadId!,
                status: "failed",
                error: "Failed to update test case",
              }),
            );
            Sentry.captureException(error, {
              level: "error",
              tags: { priority: "high" },
            });
            reject(error);
          }
        } else {
          store.dispatch(
            updateUploadStatus({
              id,
              status: "failed",
              error: `Upload failed with status: ${xhr.status}`,
            }),
          );
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      };

      xhr.onerror = () => {
        store.dispatch(
          updateUploadStatus({
            id,
            status: "failed",
            error: "Network error during upload",
          }),
        );
        reject(new Error("Network error during upload"));
      };

      xhr.send(file);
    });
  } catch (error) {
    if (uploadId) {
      store.dispatch(
        updateUploadStatus({
          id: uploadId,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
    Sentry.captureException(error, {
      level: "error",
      tags: { priority: "high" },
    });
    throw error;
  }
};

export const setupAutoCleanup = (expirationTime = 15000) => {
  setInterval(() => {
    store.dispatch(cleanupCompletedUploads(expirationTime));
  }, 5000); // Check every 5 seconds
};
