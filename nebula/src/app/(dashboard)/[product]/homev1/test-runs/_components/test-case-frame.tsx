import { Skeleton } from "@/components/ui/skeleton";
import {
  GCS_BUCKET_URL,
  GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT,
} from "@/lib/constants";
import Image from "next/image";
import { useState, useEffect, useMemo } from "react";

export const TestCaseFrame = ({
  screenshotUrl,
  isDetailPage = false,
}: {
  screenshotUrl: string;
  isDetailPage?: boolean;
}) => {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isVideo = useMemo(() => {
    return (
      screenshotUrl?.includes("_video.") ||
      screenshotUrl?.includes(".video.mp4") ||
      screenshotUrl?.endsWith(".mp4") ||
      screenshotUrl?.endsWith(".MP4") ||
      screenshotUrl?.endsWith(".mov") ||
      screenshotUrl?.endsWith(".MOV")
    );
  }, [screenshotUrl]);

  const framePath = useMemo(() => {
    if (screenshotUrl?.startsWith(GCS_BUCKET_URL)) {
      return screenshotUrl.substring(GCS_BUCKET_URL.length);
    }
    return null;
  }, [screenshotUrl]);

  useEffect(() => {
    let isCurrent = true; // Track if this fetch is the latest

    setMediaUrl(null);
    setError(null);

    const fetchSignedUri = async () => {
      if (!framePath) {
        setError("No frame path found in the URL");
        return;
      }
      try {
        const response = await fetch(
          `${GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT}${framePath}`,
        );
        if (!response.ok) {
          throw new Error("Failed to fetch signed URL");
        }
        const { signedUrl } = await response.json();
        if (isCurrent) {
          setMediaUrl(signedUrl);
          setError(null);
        }
      } catch (error) {
        if (isCurrent) {
          setError("Failed to fetch signed URL");
        }
      }
    };

    if (framePath) {
      fetchSignedUri();
    }

    return () => {
      isCurrent = false; // Cancel any previous fetches
    };
  }, [framePath, screenshotUrl]);

  if (screenshotUrl && !mediaUrl) {
    return (
      <div className="flex flex-col items-center space-y-3">
        <Skeleton className="rounded-lg w-11/12 h-96" />
        {error && <div className="text-red-500 m-3 p-2">{error}</div>}
      </div>
    );
  }

  if (!mediaUrl) {
    return <div>No media found</div>;
  }

  if (isVideo && isDetailPage) {
    return (
      <div className="relative w-full h-full">
        <video
          className="rounded-md w-full h-full object-contain"
          src={mediaUrl}
          key={mediaUrl}
          controls
          playsInline
          controlsList="nodownload"
          onError={(e) => {
            const videoError = e.currentTarget.error;
            let errorMessage = "Failed to load video";

            if (videoError) {
              switch (videoError.code) {
                case MediaError.MEDIA_ERR_ABORTED:
                  errorMessage = "Video playback was aborted";
                  break;
                case MediaError.MEDIA_ERR_NETWORK:
                  errorMessage = "Network error occurred while loading video";
                  break;
                case MediaError.MEDIA_ERR_DECODE:
                  errorMessage = "Video format is not supported";
                  break;
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                  errorMessage = "Video source is not supported";
                  break;
              }
            }

            console.error("Video error:", videoError);
            setError(errorMessage);
          }}
        >
          Video playback is not supported in your browser
        </video>
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <p className="text-white text-center p-4">{error}</p>
          </div>
        )}
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
      className="h-full w-auto rounded-md"
      style={{ objectFit: "contain" }}
      src={mediaUrl}
      key={mediaUrl}
      alt="Test Case Image"
    />
  );
};
