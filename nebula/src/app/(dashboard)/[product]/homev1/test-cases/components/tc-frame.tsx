"use client";

import type React from "react";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Upload } from "lucide-react";
import {
  GCS_BUCKET_URL,
  GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT,
} from "@/lib/constants";
import Image from "next/image";
import type { testCaseSchema } from "@/lib/types";
import { useUser } from "@clerk/nextjs";
import { isQaiOrgUser, isQaiOrgAnalystUser } from "@/lib/constants";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useProductSwitcher } from "@/providers/product-provider";

interface TCFrameProps {
  testCase: testCaseSchema;
  onImageUpload?: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  isUploading: boolean;
}

export function TCFrame({
  testCase,
  onImageUpload,
  isUploading,
}: TCFrameProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const { user } = useUser();
  const router = useRouter();
  const { productSwitcher } = useProductSwitcher();
  // Get user organization ID
  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;
  // Check if user belongs to QAI organization for production
  const isQaiOrgUserValue =
    isQaiOrgUser(userOrgId) || isQaiOrgAnalystUser(userOrgId);
  const framePath = useMemo(() => {
    if (testCase.screenshot_url?.startsWith(GCS_BUCKET_URL)) {
      return testCase.screenshot_url.substring(GCS_BUCKET_URL.length);
    }
    return null;
  }, [testCase.screenshot_url]);

  useEffect(() => {
    const fetchSignedUri = async () => {
      if (!framePath) {
        if (testCase.screenshot_url) {
          console.log("URL received:", testCase.screenshot_url);
          setError("Invalid screenshot URL");
        }
        return;
      }

      try {
        setIsLoadingImage(true);
        setError(null);

        const response = await fetch(
          `${GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT}${framePath}`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch signed URL");
        }

        const { signedUrl } = await response.json();
        setImageUrl(signedUrl);
        setError(null);
      } catch (error) {
        console.error("Error while fetching the signed URL:", error);
        setError("Failed to load image");
      } finally {
        setIsLoadingImage(false);
      }
    };

    if (testCase.screenshot_url) {
      setImageUrl(null);
      setError(null);
      fetchSignedUri();
    } else {
      setImageUrl(null);
      setError(null);
    }
  }, [framePath, testCase.screenshot_url]);

  const renderScreenshot = () => {
    if (!testCase.screenshot_url) {
      return (
        <div className="h-full w-full flex items-center justify-center bg-gray-200 rounded-lg">
          <p className="text-gray-500 text-sm">No image uploaded</p>
        </div>
      );
    }

    if (isLoadingImage) {
      return (
        <div className="h-full flex items-center justify-center">
          <Skeleton className="w-full h-full rounded-lg" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="h-full flex items-center justify-center bg-gray-200 rounded-lg">
          <p className="text-red-500 text-sm text-center p-4">{error}</p>
        </div>
      );
    }

    if (!imageUrl) {
      return (
        <div className="h-full flex items-center justify-center bg-gray-200 rounded-lg">
          <p className="text-gray-500 text-sm">Failed to load image</p>
        </div>
      );
    }

    return (
      <Image
        unoptimized
        fill={false}
        width={0}
        height={0}
        sizes="100%"
        className="w-full h-full object-contain rounded-lg"
        src={imageUrl || "/placeholder.svg"}
        alt="Test Case Screenshot"
        onError={() => setError("Failed to load image")}
      />
    );
  };

  return (
    <div className="w-1/3 h-full flex-shrink-0 bg-gray-100">
      <div className="h-full p-6 flex flex-col">
        <div className="h-[calc(100%-80px)] flex items-center justify-center flex-col">
          <div className="h-full max-h-[600px] w-full max-w-[320px] relative flex items-center justify-center">
            {renderScreenshot()}
          </div>
          {isQaiOrgUserValue && testCase.flow_id && (
            <div className="mt-2 px-2 py-1 text-xs text-muted-foreground font-mono bg-gray-100 rounded w-full text-center flex items-center justify-center gap-2">
              <a
                className="font-semibold text-primary hover:underline cursor-pointer"
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey) {
                    // Let default behavior happen (open in new tab)
                    return;
                  }
                  e.preventDefault();
                  router.push(
                    `/${productSwitcher.product_id}/editor?flow_id=${testCase.flow_id}`,
                  );
                }}
              >
                {testCase.flow_id}
              </a>
              <button
                type="button"
                className="ml-1 p-1 rounded hover:bg-gray-200 focus:outline-none"
                title="Copy Flow ID"
                onClick={() => {
                  if (typeof testCase.flow_id === "string") {
                    navigator.clipboard.writeText(testCase.flow_id);
                    toast.success("Flow ID copied to clipboard");
                  }
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <rect
                    x="9"
                    y="9"
                    width="13"
                    height="13"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                  />
                  <rect
                    x="3"
                    y="3"
                    width="13"
                    height="13"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Upload button - now visible to all users */}
        {onImageUpload && (
          <div className="h-[60px] hidden flex items-center justify-center w-full">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              id="imageUpload"
              onChange={onImageUpload}
              disabled={isUploading}
            />
            <Button
              variant="outline"
              className="flex items-center gap-2 bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400"
              onClick={() => document.getElementById("imageUpload")?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  {testCase.screenshot_url ? "Change Image" : "Upload Image"}
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
