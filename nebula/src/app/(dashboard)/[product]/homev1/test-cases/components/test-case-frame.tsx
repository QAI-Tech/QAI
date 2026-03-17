import { Skeleton } from "@/components/ui/skeleton";
import {
  GCS_BUCKET_URL,
  GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT,
} from "@/lib/constants";
import Image from "next/image";
import { useState, useEffect, useMemo } from "react";

export const TestCaseFrame = ({ screenshotUrl }: { screenshotUrl: string }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const framePath = useMemo(() => {
    if (screenshotUrl?.startsWith(GCS_BUCKET_URL)) {
      return screenshotUrl.substring(GCS_BUCKET_URL.length);
    }
    return null;
  }, [screenshotUrl]);

  useEffect(() => {
    const fetchSignedUri = async () => {
      if (!framePath) {
        console.error("No frame path found in the screenshot URL");
        setError("No frame path found in the screenshot URL");
        return;
      }

      try {
        const response = await fetch(
          GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT + framePath,
        );
        if (!response.ok) {
          throw new Error("Failed to fetch signed URL");
        }

        const { signedUrl } = await response.json();
        setImageUrl(signedUrl);
        setError(null);
      } catch (error) {
        console.error("Error while fetching the signed URL:", error);
        setError("Failed to fetch signed URL");
      }
    };

    if (screenshotUrl) {
      setImageUrl(null);
      setError(null);
      fetchSignedUri();
    }
  }, [framePath, screenshotUrl]);

  if (screenshotUrl && !imageUrl) {
    return (
      <div className="flex flex-col items-center space-y-3">
        <Skeleton className="rounded-lg w-11/12 h-96" />
        {error && <div className="text-red-500 m-3 p-2 ">{error}</div>}
      </div>
    );
  }

  if (!imageUrl) {
    return null;
  }

  return (
    <Image
      unoptimized
      fill={false}
      width={0}
      height={0}
      sizes="100%"
      className="h-full w-auto rounded-md"
      style={{ objectFit: "contain" }}
      src={imageUrl}
      alt="Test Case Image"
    />
  );
};
