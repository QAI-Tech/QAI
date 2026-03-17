"use client";

import { Skeleton } from "@/components/ui/skeleton";
import {
  GCS_BUCKET_URL,
  GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT,
  ORG_PREFIX,
  PRODUCT_PREFIX,
  TEST_RUN_PREFIX,
  TEST_CASE_UNDER_EXECUTION_PREFIX,
  PRODUCT_DESIGN_ASSETS_BUCKET_NAME,
  PRODUCTION_ORGANISATION_ID,
  isQaiOrgUser,
  isQaiOrgAnalystUser,
} from "@/lib/constants";
import { useState, useEffect, useMemo, useRef } from "react";
import { Play, Video, Loader2, Image as ImageIcon, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import * as Sentry from "@sentry/nextjs";

import { uploadVideo } from "@/app/services/videoUploadService";
import { VideoUploadProgress } from "@/app/(dashboard)/[product]/homev1/test-runs/_components/video-upload-progress";
import { VideoControls } from "./video-controls";

interface TestCaseFrameProps {
  screenshotUrl?: string;
  isDetailPage?: boolean;
  execution_completed_at?: string;
  testCaseUnderExecutionId?: string;
  productId?: string;
  testRunId?: string;
  onVideoUpload?: (videoUrl: string) => Promise<boolean>;
  onScreenshotUpload?: (screenshotUrl: string) => Promise<boolean>;
  isLoading: {
    status: boolean;
    action?: string | null;
  };
  staticScreenshotUrl?: string;
  annotations?: string[];
}

export const TestCaseFrame = ({
  screenshotUrl,
  execution_completed_at,
  testCaseUnderExecutionId,
  productId,
  testRunId,
  onVideoUpload,
  onScreenshotUpload,
  isLoading,
  staticScreenshotUrl,
  annotations = [],
}: TestCaseFrameProps) => {
  const [mediaUrl, setMediaUrl] = useState<string | undefined>(undefined);
  const [screenshotMediaUrl, setScreenshotMediaUrl] = useState<
    string | undefined
  >(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [displayMode, setDisplayMode] = useState<"video" | "screen">("video");
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingScreenshot, setIsUploadingScreenshot] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  }, [mediaUrl]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditingText =
        ["INPUT", "TEXTAREA"].includes(target.tagName) ||
        target.isContentEditable;

      if (e.code === "Space" && !isEditingText && videoRef.current) {
        e.preventDefault();
        if (videoRef.current.paused) {
          videoRef.current.play();
          setIsPlaying(true);
        } else {
          videoRef.current.pause();
          setIsPlaying(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  useEffect(() => {
    // Reset upload states when switching between TCUEs
    setIsUploading(false);
    setIsUploadingScreenshot(false);
  }, [testCaseUnderExecutionId]);

  const { user } = useUser();
  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;
  const isQaiUser = isQaiOrgUser(userOrgId) || isQaiOrgAnalystUser(userOrgId);

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

  // Set default display mode based on available media
  useEffect(() => {
    if (isVideo) {
      setDisplayMode("video");
    } else {
      setDisplayMode("screen");
    }
  }, [isVideo]);

  const framePath = useMemo(() => {
    if (screenshotUrl?.startsWith(GCS_BUCKET_URL)) {
      return screenshotUrl.substring(GCS_BUCKET_URL.length);
    }
    return null;
  }, [screenshotUrl]);

  const screenshotPath = useMemo(() => {
    if (staticScreenshotUrl?.startsWith(GCS_BUCKET_URL)) {
      return staticScreenshotUrl.substring(GCS_BUCKET_URL.length);
    }
    return null;
  }, [staticScreenshotUrl]);

  useEffect(() => {
    let isCurrent = true;

    const fetchSignedUri = async () => {
      if (!framePath) {
        if (!screenshotUrl) {
          return;
        }
        console.log("URL received:", screenshotUrl);
        console.error("No frame path found in the URL");
        if (isCurrent) setError("No frame path found in the URL");
        return;
      }

      try {
        console.log("Fetching signed URL for:", framePath);
        const response = await fetch(
          `${GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT}${framePath}`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch signed URL");
        }

        const { signedUrl } = await response.json();
        console.log("Received signed URL:", signedUrl);
        if (isCurrent) {
          setMediaUrl(signedUrl);
          setError(null);
        }
      } catch (error) {
        console.error("Error while fetching the signed URL:", error);
        if (isCurrent) {
          setError("Failed to fetch signed URL");
        }
      }
    };

    if (screenshotUrl) {
      setMediaUrl(undefined);
      setError(null);
      fetchSignedUri();
    }

    return () => {
      isCurrent = false;
    };
  }, [framePath, screenshotUrl]);

  useEffect(() => {
    const fetchScreenshotSignedUri = async () => {
      if (!screenshotPath) {
        return;
      }

      try {
        const response = await fetch(
          `${GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT}${screenshotPath}`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch screenshot signed URL");
        }

        const { signedUrl } = await response.json();
        setScreenshotMediaUrl(signedUrl);
      } catch (error) {
        console.error("Error while fetching the screenshot signed URL:", error);
      }
    };

    if (staticScreenshotUrl) {
      setScreenshotMediaUrl(undefined);
      fetchScreenshotSignedUri();
    }
  }, [screenshotPath, staticScreenshotUrl]);

  const handleVideoUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0 || isUploading || !onVideoUpload) return;

    setIsUploading(true);

    try {
      const video = files[0];

      if (!testCaseUnderExecutionId || !productId || !testRunId) {
        toast.error("Required details not found");
        return;
      }

      const organisationId: string = userOrgId ?? PRODUCTION_ORGANISATION_ID;

      // Inform parent component that upload is starting
      await onVideoUpload("");

      // Start upload without blocking UI
      uploadVideo(
        video,
        testCaseUnderExecutionId,
        productId,
        testRunId,
        organisationId,
        async (videoUrl) => {
          try {
            // This callback will be called when the upload completes
            // Even if component has unmounted, we still want to update the backend
            const success = await onVideoUpload(videoUrl);
            if (success) {
              toast.success("Video uploaded successfully");
              setMediaUrl(videoUrl);
              setDisplayMode("video");
            }
          } catch (error) {
            console.error("Error updating test case with video:", error);
            toast.error("Failed to update test case with video URL");
          } finally {
            setIsUploading(false);
          }
        },
      ).catch((error) => {
        console.error("Error during file upload:", error);
        Sentry.captureException(error, {
          level: "fatal",
          tags: { priority: "high" },
        });
        toast.error(
          error instanceof Error ? error.message : "Failed to upload video",
        );

        // Reset loading state in parent
        onVideoUpload("");
        setIsUploading(false);
      });
      // Clear input
      if (videoInputRef.current) {
        videoInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Error preparing file upload:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to prepare upload",
      );
      // Reset loading state in parent
      await onVideoUpload("");
      setIsUploading(false);
    }
  };

  const handleScreenshotUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (
      !files ||
      files.length === 0 ||
      isUploadingScreenshot ||
      !onScreenshotUpload
    )
      return;

    setIsUploadingScreenshot(true);
    await onScreenshotUpload("");

    try {
      const screenshot = files[0];
      const extension = screenshot.name.split(".").pop() || "png";

      if (!testCaseUnderExecutionId || !productId || !testRunId) {
        toast.error("Required details not found");
        return;
      }

      const organisationId =
        user?.publicMetadata?.organisation_id || PRODUCTION_ORGANISATION_ID;
      const uploadPath = `${ORG_PREFIX}${organisationId}/${PRODUCT_PREFIX}${productId}/${TEST_RUN_PREFIX}${testRunId}/${TEST_CASE_UNDER_EXECUTION_PREFIX}${testCaseUnderExecutionId}_screenshot.${extension}`;

      console.log("Uploading screenshot with path:", uploadPath);

      const signedUrlResponse = await fetch(
        `/api/generate-instructions?getSignedUrl=true&bucketName=${PRODUCT_DESIGN_ASSETS_BUCKET_NAME}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: uploadPath,
            contentType: screenshot.type,
          }),
        },
      );

      if (!signedUrlResponse.ok) {
        throw new Error("Failed to get signed URL");
      }

      const { signedUrl, fileName: screenshotFileName } =
        await signedUrlResponse.json();
      const fileName = screenshotFileName.replace("gs://", "");

      const uploadResponse = await fetch(signedUrl, {
        method: "PUT",
        body: screenshot,
        headers: {
          "Content-Type": screenshot.type,
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

      const screenshotUrl = `${GCS_BUCKET_URL}${fileName}`;
      const success = await onScreenshotUpload(screenshotUrl);

      if (success) {
        toast.success("Screenshot uploaded successfully");
        setScreenshotMediaUrl(screenshotUrl);
        setDisplayMode("screen");
      }
    } catch (error) {
      console.error("Error during file upload:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to upload screenshot",
      );
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      await onScreenshotUpload("");
    } finally {
      setIsUploadingScreenshot(false);
      if (screenshotInputRef.current) {
        screenshotInputRef.current.value = "";
      }
    }
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (videoRef.current && !isNaN(videoRef.current.duration)) {
      const rect = e.currentTarget.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      videoRef.current.currentTime = pos * videoRef.current.duration;
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        if (videoRef.current.ended) {
          videoRef.current.currentTime = 0;
        }
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleForwardReplay = async () => {
    if (videoRef.current) {
      const newTime = Math.min(
        videoRef.current.duration,
        videoRef.current.currentTime + 10,
      );
      videoRef.current.currentTime = newTime;
      try {
        await videoRef.current.play();
        setIsPlaying(true);
      } catch (error) {
        console.error("Error playing video:", error);
      }
    }
  };

  const handleBackwardReplay = async () => {
    if (videoRef.current) {
      const newTime = Math.max(0, videoRef.current.currentTime - 10);
      videoRef.current.currentTime = newTime;
      try {
        await videoRef.current.play();
        setIsPlaying(true);
      } catch (error) {
        console.error("Error playing video:", error);
      }
    }
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      videoRef.current.requestFullscreen();
    }
  };

  const hasValidScreenshot = useMemo(() => {
    return Boolean(staticScreenshotUrl) && Boolean(screenshotMediaUrl);
  }, [staticScreenshotUrl, screenshotMediaUrl]);

  const hasValidVideo = useMemo(() => {
    return isVideo && Boolean(mediaUrl);
  }, [isVideo, mediaUrl]);

  const showToggleButton = useMemo(() => {
    return isQaiUser && hasValidScreenshot && hasValidVideo;
  }, [isQaiUser, hasValidScreenshot, hasValidVideo]);

  if (!screenshotUrl && !staticScreenshotUrl) {
    return (
      <div className="lg:col-span-2 h-full flex flex-col">
        <div className="flex-grow flex items-center justify-center bg-white">
          {isQaiUser ? (
            <div className="flex flex-col items-center gap-4">
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={() => videoInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading Video...
                  </>
                ) : (
                  <>
                    <Video className="h-4 w-4" />
                    Upload Video
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={() => screenshotInputRef.current?.click()}
                disabled={isUploadingScreenshot}
              >
                {isUploadingScreenshot ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading Screenshot...
                  </>
                ) : (
                  <>
                    <ImageIcon className="h-4 w-4" />
                    Upload Screenshot
                  </>
                )}
              </Button>
              <input
                type="file"
                accept="video/*"
                className="hidden"
                ref={videoInputRef}
                onChange={handleVideoUpload}
                disabled={isUploading}
              />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={screenshotInputRef}
                onChange={handleScreenshotUpload}
                disabled={isUploadingScreenshot}
              />
            </div>
          ) : (
            <div className="text-gray-500">No media available</div>
          )}
        </div>
      </div>
    );
  }

  if (!mediaUrl && !screenshotMediaUrl) {
    return (
      <div className="lg:col-span-2 h-full flex flex-col">
        <div className="flex-grow">
          <div className="flex flex-col items-center space-y-3 pt-4">
            <Skeleton className="rounded-lg w-11/12 h-96" />
            {error && <div className="text-red-500 m-3 p-2">{error}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lg:col-span-2 h-full flex flex-col" ref={containerRef}>
      {/* Section 1: Toggle Button (Top) - Fixed */}
      {showToggleButton && (
        <div className="sticky top-0 z-20 w-full bg-white border-b shadow-sm p-2 flex justify-center">
          <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
            <Button
              variant={displayMode === "screen" ? "default" : "ghost"}
              size="sm"
              onClick={() => setDisplayMode("screen")}
              className={`text-sm font-medium ${displayMode === "screen" ? "bg-purple-600 text-white" : "text-gray-700"}`}
            >
              Screen
            </Button>
            <Button
              variant={displayMode === "video" ? "default" : "ghost"}
              size="sm"
              onClick={() => setDisplayMode("video")}
              className={`text-sm font-medium ${displayMode === "video" ? "bg-purple-600 text-white" : "text-gray-700"}`}
            >
              Video
            </Button>
          </div>
        </div>
      )}

      {/* Section 2: Media Content (Middle) */}
      <div
        className="flex-grow flex flex-col justify-center"
        style={{ minHeight: "250px" }}
      >
        {/* Main media container */}
        <div className="p-4 flex justify-center items-center h-full">
          <div
            className="relative rounded-lg overflow-hidden shadow-lg"
            style={{
              width: "100%",
              height: "auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Video Display */}
            {hasValidVideo &&
              (displayMode === "video" || !hasValidScreenshot) && (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ maxHeight: "calc(100vh - 250px)" }}
                >
                  <video
                    ref={videoRef}
                    style={{
                      width: "auto",
                      height: "auto",
                      maxWidth: "100%",
                      maxHeight: "calc(100vh - 250px)",
                    }}
                    src={mediaUrl}
                    playsInline
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onEnded={() => setIsPlaying(false)}
                    onError={(e) => {
                      const videoError = e.currentTarget.error;
                      let errorMessage = "Failed to load video";
                      if (videoError) {
                        switch (videoError.code) {
                          case MediaError.MEDIA_ERR_ABORTED:
                            errorMessage = "Video playback was aborted";
                            break;
                          case MediaError.MEDIA_ERR_NETWORK:
                            errorMessage =
                              "Network error occurred while loading video";
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
                  />
                  {!isPlaying && !error && (
                    <div
                      className="absolute inset-0 flex items-center justify-center cursor-pointer"
                      onClick={handlePlayPause}
                    >
                      <div className="w-14 h-14 rounded-full bg-purple-600/40 flex items-center justify-center">
                        <Play className="w-7 h-7 text-white/90" />
                      </div>
                    </div>
                  )}
                  {error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <p className="text-white text-center p-4">{error}</p>
                    </div>
                  )}
                </div>
              )}

            {/* Screenshot Display */}
            {hasValidScreenshot && displayMode === "screen" && (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ maxHeight: "calc(100vh - 250px)" }}
              >
                <img
                  src={screenshotMediaUrl}
                  alt="Test case screenshot"
                  style={{
                    width: "auto",
                    height: "auto",
                    maxWidth: "100%",
                    maxHeight: "calc(100vh - 250px)",
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload Progress  */}
      <div className="w-full bg-white border-t">
        <VideoUploadProgress tcueId={testCaseUnderExecutionId || ""} />
      </div>

      {/* Section 3: Video Controls & Action Buttons (Bottom) */}
      <div className="sticky bottom-0 z-20 w-full bg-white border-t shadow-sm">
        {/* Video Controls */}
        {hasValidVideo && displayMode === "video" && (
          <VideoControls
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            playbackSpeed={playbackSpeed}
            isDisabled={isLoading.status}
            executionTime={execution_completed_at}
            onPlayPause={handlePlayPause}
            onBackward={handleBackwardReplay}
            onForward={handleForwardReplay}
            onSpeedChange={setPlaybackSpeed}
            onFullscreen={handleFullscreen}
            onSeek={handleProgressBarClick}
          />
        )}

        {/* Action Buttons */}
        <div className="px-4 py-3">
          {hasValidVideo && displayMode === "video" ? (
            <div>
              {/* Video Mode Buttons */}
              {isQaiUser && (
                <div className="flex justify-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-white border-gray-300 text-gray-700 hover:bg-gray-50 shadow-sm"
                    onClick={() => videoInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        Changing...
                      </>
                    ) : (
                      <>
                        <Video className="h-4 w-4 mr-1" />
                        Change Video
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-white border-gray-300 text-gray-700 hover:bg-gray-50 shadow-sm"
                    onClick={() => {
                      if (mediaUrl) {
                        localStorage.setItem("executionVideo", mediaUrl);
                        localStorage.setItem(
                          "annotations",
                          JSON.stringify(annotations),
                        );
                        window.open(
                          `/annotation?tcue_id=${testCaseUnderExecutionId}`,
                          "_blank",
                        );
                      } else {
                        toast.error("No video URL to annotate");
                      }
                    }}
                    disabled={isUploading}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    Annotate Video
                  </Button>
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    ref={videoInputRef}
                    onChange={handleVideoUpload}
                    disabled={isUploading}
                  />
                </div>
              )}

              {/* Execution Time */}
              {!execution_completed_at && (
                <div className="text-xs text-gray-500 mt-2 text-center">
                  Executed on {execution_completed_at}
                </div>
              )}
            </div>
          ) : (
            <div>
              {/* Screenshot Mode Display */}
              {execution_completed_at && (
                <div className="text-xs text-gray-500 mb-2 text-center">
                  Executed on {execution_completed_at}
                </div>
              )}

              {/* Screenshot Mode Buttons */}
              {isQaiUser && (
                <div className="flex justify-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-white border-gray-300 text-gray-700 hover:bg-gray-50 shadow-sm"
                    onClick={() => screenshotInputRef.current?.click()}
                    disabled={isUploadingScreenshot}
                  >
                    {isUploadingScreenshot ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        Changing...
                      </>
                    ) : (
                      <>
                        <ImageIcon className="h-4 w-4 mr-1" />
                        Change Screenshot
                      </>
                    )}
                  </Button>
                  {!isVideo && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-white border-gray-300 text-gray-700 hover:bg-gray-50 shadow-sm"
                      onClick={() => videoInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          Uploading Video...
                        </>
                      ) : (
                        <>
                          <Video className="h-4 w-4 mr-1" />
                          Upload Video
                        </>
                      )}
                    </Button>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={screenshotInputRef}
                    onChange={handleScreenshotUpload}
                    disabled={isUploadingScreenshot}
                  />
                  {!isVideo && (
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      ref={videoInputRef}
                      onChange={handleVideoUpload}
                      disabled={isUploading}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
