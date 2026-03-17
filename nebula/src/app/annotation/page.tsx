"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  BookmarkIcon,
  DownloadIcon,
  UploadIcon,
  XIcon,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import * as Sentry from "@sentry/nextjs";

interface Annotation {
  id: string; // Unique identifier for each annotation
  timestamp: number; // Video time in seconds
  formattedTime: string; // Human-readable time (MM:SS)
}

export default function VideoAnnotationPage() {
  const [videoUrl] = useState<string>("");
  const [currentTime, setCurrentTime] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const searchParams = useSearchParams();
  const tcue_id = searchParams.get("tcue_id");

  // --- Use signed video URL from localStorage if available ---
  const [signedVideoUrl, setSignedVideoUrl] = useState<string>("");

  useEffect(() => {
    const storedUrl = localStorage.getItem("executionVideo");
    if (storedUrl) {
      setSignedVideoUrl(storedUrl);
    }
    // Load annotations from localStorage if present
    const storedAnnotations = localStorage.getItem("annotations");
    if (storedAnnotations) {
      try {
        const parsed = JSON.parse(storedAnnotations);
        if (Array.isArray(parsed)) {
          // Validate and normalize each annotation object
          const normalized: Annotation[] = parsed.map((ann: string) => {
            let timestampNum = Number(ann);
            if (isNaN(timestampNum)) timestampNum = 0;
            return {
              id: crypto.randomUUID(),
              timestamp: timestampNum,
              formattedTime: formatTime(timestampNum),
            };
          });
          setAnnotations(normalized);
        }
      } catch (e) {
        console.error("Failed to parse annotations from localStorage", e);
      }
    }
  }, []);

  // Only show the video player if a signedVideoUrl is available
  const showSignedVideo = Boolean(signedVideoUrl);

  // Cleanup URL when component unmounts or when a new video is uploaded
  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleVideoLoad = () => {
    setIsLoading(false);
  };

  const handleVideoError = () => {
    setIsLoading(false);
    toast.error("Failed to load video. Please try a different file.");
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const addAnnotation = useCallback(() => {
    const newAnnotation: Annotation = {
      id: crypto.randomUUID(),
      timestamp: currentTime,
      formattedTime: formatTime(currentTime),
    };

    // Sort annotations by timestamp for chronological order
    setAnnotations((prev) =>
      [...prev, newAnnotation].sort((a, b) => a.timestamp - b.timestamp),
    );
    toast.success("Annotation added");
  }, [currentTime]);

  const removeAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((ann) => ann.id !== id));
    toast.success("Annotation removed");
  };

  const seekToAnnotation = (timestamp: number) => {
    if (videoRef.current && !isLoading) {
      // Pause before seeking for accuracy
      videoRef.current.pause();

      // Delay seek to ensure pause completes
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.currentTime = timestamp;
          // Update state immediately for UI responsiveness
          setCurrentTime(timestamp);
        }
      }, 50);

      toast.success(`Jumped to ${formatTime(timestamp)}`);
    } else if (isLoading) {
      toast.error("Please wait for the video to finish loading");
    }
  };

  const exportAnnotations = async () => {
    setIsExporting(true);
    const annotationTimestamps = annotations.map((a) => a.timestamp.toString());
    if (!tcue_id) {
      toast.error("No tcue_id found in URL");
      setIsExporting(false);
      return;
    }
    try {
      const res = await fetch("/api/update-test-case-under-execution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updateTestCaseUnderExecution: {
            test_case_under_execution_id: tcue_id,
            annotations: annotationTimestamps,
          },
        }),
      });
      if (!res.ok) throw new Error("API error");
      toast.success("Timestamps saved to TCUE");
    } catch (err) {
      toast.error("Failed to send timestamps");
      Sentry.captureException(err, {
        level: "fatal",
        tags: { priority: "high" },
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Video Annotation
            </h1>
            <p className="text-muted-foreground">
              Upload a video and add timestamped annotations
            </p>
          </div>
          <div className="flex items-center gap-4">
            {annotations.length > 0 && (
              <Button
                onClick={exportAnnotations}
                className="gap-2"
                disabled={isExporting}
              >
                {isExporting ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Exporting...
                  </>
                ) : (
                  <>
                    <DownloadIcon className="h-4 w-4" />
                    Export Annotations
                  </>
                )}
              </Button>
            )}
            <Button onClick={() => window.close()} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to TestCase
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Video Player Section */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="h-[672px] flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Video Player</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                {showSignedVideo || videoUrl ? (
                  <div className="space-y-4 flex-1 flex flex-col">
                    <div className="aspect-video bg-black rounded-lg overflow-hidden relative flex-shrink-0">
                      {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white">
                          Loading video...
                        </div>
                      )}
                      <video
                        ref={videoRef}
                        src={showSignedVideo ? signedVideoUrl : videoUrl}
                        className="w-full h-full"
                        controls
                        autoPlay
                        onLoadedData={handleVideoLoad}
                        onError={handleVideoError}
                        onTimeUpdate={handleTimeUpdate}
                        onSeeked={() => {
                          if (videoRef.current) {
                            setCurrentTime(videoRef.current.currentTime);
                          }
                        }}
                      />
                    </div>
                    {/* Annotation controls */}
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg mt-auto">
                      <Badge variant="secondary">
                        {annotations.length} annotations
                      </Badge>
                      <Button onClick={addAnnotation} className="gap-2">
                        <BookmarkIcon className="h-4 w-4" />
                        Add Annotation at {formatTime(currentTime)}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 bg-muted rounded-lg flex items-center justify-center">
                    <div className="text-center space-y-2">
                      <div className="text-muted-foreground">
                        No video loaded
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        className="gap-2"
                      >
                        <UploadIcon className="h-4 w-4" />
                        Upload a video to get started
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Annotations Sidebar */}
          <div className="space-y-4">
            <Card className="h-[672px] flex flex-col">
              <CardHeader>
                <CardTitle>Annotations ({annotations.length})</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  {annotations.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      No annotations yet. Add one to get started.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {annotations.map((annotation, index) => (
                        <div key={annotation.id}>
                          <div
                            className="p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() =>
                              seekToAnnotation(annotation.timestamp)
                            }
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <BookmarkIcon className="h-4 w-4 text-muted-foreground" />
                                <div className="font-medium">
                                  {annotation.formattedTime}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeAnnotation(annotation.id);
                                }}
                                className="h-auto p-1 text-muted-foreground hover:text-destructive"
                              >
                                <XIcon className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          {index < annotations.length - 1 && (
                            <Separator className="my-2" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
