"use client";

import type React from "react";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import type { testCaseSchema } from "@/lib/types";
import { useProductSwitcher } from "@/providers/product-provider";
import { useUser } from "@clerk/nextjs";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/app/store/store";
import {
  GCS_BUCKET_URL,
  PRODUCTION_ORGANISATION_ID,
  PRODUCT_DESIGN_ASSETS_BUCKET_NAME,
} from "@/lib/constants";
import { updateTestCase } from "@/app/store/testCaseSlice";
import * as Sentry from "@sentry/nextjs";

interface MultipleScreenshotUpdateDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  selectedTestCases: testCaseSchema[];
  onComplete: () => void;
}

export function MultipleScreenshotUpdateDialog({
  isOpen,
  onOpenChange,
  selectedTestCases,
  onComplete,
}: MultipleScreenshotUpdateDialogProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);

  const { productSwitcher } = useProductSwitcher();
  const { user } = useUser();
  const dispatch = useDispatch<AppDispatch>();
  const organisationId =
    user?.publicMetadata?.organisation_id || PRODUCTION_ORGANISATION_ID;

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    try {
      setIsUploading(true);
      const image = files[0];
      const product_id = productSwitcher.product_id;

      if (!product_id) {
        toast.error("No product selected");
        return;
      }

      // Store the selected image for later use
      setSelectedImage(image);

      // Create a temporary preview URL for the selected image
      const tempPreviewUrl = URL.createObjectURL(image);
      setPreviewUrl(tempPreviewUrl);

      toast.success("Image selected successfully");
    } catch (error) {
      Sentry.captureException(error, {
        level: "error",
        tags: { priority: "medium" },
      });
      console.error("Error selecting image:", error);
      toast.error("Failed to select image");
    } finally {
      setIsUploading(false);
    }
  };

  const uploadImageForTestCase = async (
    testCase: testCaseSchema,
    image: File,
  ) => {
    const extension = image.type.split("/")[1];
    const product_id = productSwitcher.product_id;

    // Use the same path structure as individual test case updates
    const uploadPath = `${organisationId}/${product_id}/${testCase.feature_id}/${testCase.test_case_id}_frame.${extension}`;

    console.log(
      "Uploading image for test case:",
      testCase.test_case_id,
      "with path:",
      uploadPath,
    );

    // Get signed URL for upload (same as individual updates)
    const signedUrlResponse = await fetch(
      `/api/generate-instructions?getSignedUrl=true&bucketName=${PRODUCT_DESIGN_ASSETS_BUCKET_NAME}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: uploadPath,
          contentType: image.type,
        }),
      },
    );

    if (!signedUrlResponse.ok) {
      throw new Error(
        `Failed to get signed URL for test case ${testCase.test_case_id}`,
      );
    }

    const { signedUrl, fileName: imageFileName } =
      await signedUrlResponse.json();
    const fileName = imageFileName.replace("gs://", "");

    // Upload the image
    const uploadResponse = await fetch(signedUrl, {
      method: "PUT",
      body: image,
      headers: {
        "Content-Type": image.type,
      },
      mode: "cors",
    });

    if (!uploadResponse.ok) {
      throw new Error(
        `Failed to upload image for test case ${testCase.test_case_id}: ${uploadResponse.status}`,
      );
    }

    return `${GCS_BUCKET_URL}${fileName}`;
  };

  const handleConfirmUpdate = async () => {
    if (!selectedImage) {
      toast.error("Please select an image first");
      return;
    }

    try {
      setIsUpdating(true);

      // Upload the same image to individual paths for each test case
      const uploadPromises = selectedTestCases.map(async (testCase) => {
        try {
          // Upload image to the test case's individual path
          const screenshotUrl = await uploadImageForTestCase(
            testCase,
            selectedImage,
          );

          // Update the test case with the new screenshot URL
          const updatedTestCase = {
            ...testCase,
            screenshot_url: screenshotUrl,
          };

          const response = await fetch("/api/update-test-case", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ testCase: updatedTestCase }),
          });

          if (!response.ok) {
            throw new Error(
              `Failed to update test case ${testCase.test_case_id}`,
            );
          }

          // Update individual test case in Redux store
          dispatch(
            updateTestCase({
              id: testCase.test_case_id,
              updatedData: { screenshot_url: screenshotUrl },
            }),
          );

          return {
            testCaseId: testCase.test_case_id,
            screenshotUrl,
            success: true,
          };
        } catch (error) {
          console.error(
            `Error updating test case ${testCase.test_case_id}:`,
            error,
          );
          return { testCaseId: testCase.test_case_id, success: false, error };
        }
      });

      // Wait for all uploads and updates to complete
      const results = await Promise.all(uploadPromises);

      // Check results
      const successful = results.filter((result) => result.success);
      const failed = results.filter((result) => !result.success);

      if (successful.length > 0) {
        toast.success(
          `Screenshots updated for ${successful.length} test cases`,
        );
      }

      if (failed.length > 0) {
        Sentry.captureMessage(
          `Failed to update ${failed.length} test cases in multiple screenshot update`,
          {
            level: "error",
            tags: { priority: "high" },
          },
        );
        toast.error(`Failed to update ${failed.length} test cases`);
        console.error("Failed updates:", failed);
      }

      // Only close dialog if at least some updates were successful
      if (successful.length > 0) {
        onComplete();
        onOpenChange(false);

        // Reset state
        setPreviewUrl(null);
        setSelectedImage(null);
      }
    } catch (error) {
      console.error("Error updating screenshots:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error("Failed to update screenshots. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClose = () => {
    if (isUploading || isUpdating) return;

    // Clean up preview URL if it exists
    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(null);
    setSelectedImage(null);
    onOpenChange(false);
  };

  const removePreview = () => {
    // Clean up preview URL if it exists
    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(null);
    setSelectedImage(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Update Screenshots</DialogTitle>
          <DialogDescription>
            Upload a screenshot that will be applied to all{" "}
            {selectedTestCases.length} selected test cases. Each test case will
            get its own copy of the image.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Selected Test Cases Summary */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-medium text-sm mb-2">
              Selected Test Cases ({selectedTestCases.length})
            </h3>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {selectedTestCases.map((testCase) => (
                <div
                  key={testCase.test_case_id}
                  className="text-sm text-gray-600"
                >
                  {testCase.test_case_id} -{" "}
                  {testCase.test_case_description.substring(0, 50)}
                  {testCase.test_case_description.length > 50 ? "..." : ""}
                </div>
              ))}
            </div>
          </div>

          {/* Upload Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-center">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                id="multipleImageUpload"
                onChange={handleImageUpload}
                disabled={isUploading || isUpdating}
              />
              <Button
                variant="outline"
                className="flex items-center gap-2 bg-transparent"
                onClick={() =>
                  document.getElementById("multipleImageUpload")?.click()
                }
                disabled={isUploading || isUpdating}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Selecting...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Select Screenshot
                  </>
                )}
              </Button>
            </div>

            {/* Preview Section */}
            {previewUrl && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm">Preview</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={removePreview}
                    disabled={isUploading || isUpdating}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="border rounded-lg p-4 bg-gray-50">
                  <div className="relative aspect-[9/16] w-full max-w-xs mx-auto max-h-80 overflow-hidden rounded-lg">
                    <div className="h-full overflow-auto flex justify-center">
                      <img
                        src={previewUrl || "/placeholder.svg"}
                        alt="Screenshot preview"
                        className="h-full w-auto rounded-md object-contain"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isUploading || isUpdating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmUpdate}
            disabled={!selectedImage || isUploading || isUpdating}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isUpdating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating Screenshots...
              </>
            ) : (
              `Update ${selectedTestCases.length} Screenshots`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
