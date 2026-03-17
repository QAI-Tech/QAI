"use client";

import { useState, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import * as Sentry from "@sentry/nextjs";
import {
  GCS_BUCKET_URL,
  PRODUCT_DESIGN_ASSETS_BUCKET_NAME,
  PRODUCTION_ORGANISATION_ID,
  ORG_PREFIX,
  PRODUCT_PREFIX,
  TEST_RUN_PREFIX,
  TEST_CASE_UNDER_EXECUTION_PREFIX,
} from "@/lib/constants";

interface UseVideoUploadProps {
  testCaseUnderExecutionId?: string;
  productId?: string;
  testRunId?: string;
  onVideoUpload?: (videoUrl: string) => Promise<boolean>;
  onVideoDelete?: () => Promise<boolean>;
}

export function useVideoUpload({
  testCaseUnderExecutionId,
  productId,
  testRunId,
  onVideoUpload,
  onVideoDelete,
}: UseVideoUploadProps) {
  const { user } = useUser();
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleVideoUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0 || isUploading || !onVideoUpload) return;

    setIsUploading(true);
    await onVideoUpload("");

    try {
      const video = files[0];
      const extension = video.type.split("/")[1];

      if (!testCaseUnderExecutionId || !productId || !testRunId) {
        toast.error("Required details not found");
        return;
      }

      const organisationId =
        user?.publicMetadata?.organisation_id || PRODUCTION_ORGANISATION_ID;
      const uploadPath = `${ORG_PREFIX}${organisationId}/${PRODUCT_PREFIX}${productId}/${TEST_RUN_PREFIX}${testRunId}/${TEST_CASE_UNDER_EXECUTION_PREFIX}${testCaseUnderExecutionId}_video.${extension}`;

      console.log("Uploading video with path:", uploadPath);

      const signedUrlResponse = await fetch(
        `/api/generate-instructions?getSignedUrl=true&bucketName=${PRODUCT_DESIGN_ASSETS_BUCKET_NAME}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: uploadPath,
            contentType: video.type,
          }),
        },
      );

      if (!signedUrlResponse.ok) {
        throw new Error("Failed to get signed URL");
      }

      const { signedUrl, fileName: videoFileName } =
        await signedUrlResponse.json();
      const fileName = videoFileName.replace("gs://", "");
      console.log("File Name:", fileName);

      const uploadResponse = await fetch(signedUrl, {
        method: "PUT",
        body: video,
        headers: {
          "Content-Type": video.type,
        },
        mode: "cors",
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse
          .text()
          .catch(() => "Unknown error");
        console.error("Upload failed:", errorText);
        throw new Error(`Failed to upload file: ${uploadResponse.status}`);
      }

      const videoUrl = `${GCS_BUCKET_URL}${fileName}`;
      const success = await onVideoUpload(videoUrl);

      if (success) {
        toast.success("Video uploaded successfully");
      }
    } catch (error) {
      console.error("Error during file upload:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error(
        error instanceof Error ? error.message : "Failed to upload video",
      );
      await onVideoUpload("");
    } finally {
      setIsUploading(false);
      if (videoInputRef.current) {
        videoInputRef.current.value = "";
      }
    }
  };

  const handleVideoDelete = async () => {
    if (isDeleting || !onVideoDelete) return;

    setIsDeleting(true);

    try {
      const success = await onVideoDelete();
      if (success) {
        toast.success("Video deleted successfully");
      }
    } catch (error) {
      console.error("Error deleting video:", error);
      Sentry.captureException(error, {
        level: "error",
        tags: { priority: "high" },
      });
      toast.error("Failed to delete video");
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    isUploading,
    isDeleting,
    videoInputRef,
    handleVideoUpload,
    handleVideoDelete,
  };
}
