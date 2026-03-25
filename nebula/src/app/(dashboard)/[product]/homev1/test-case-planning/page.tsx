"use client";

import type React from "react";

import { useState, useRef, useEffect } from "react";
import { Film, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { useBackend } from "@/hooks/use-backend";
import Loading from "@/components/global/loading";
// import { useRouter } from "next/navigation";
import { useProductSwitcher } from "@/providers/product-provider";
import { cn, ValidationHelpers } from "@/lib/utils";
import { useUser } from "@clerk/nextjs";
import { isQaiOrgUser, isQaiOrgAnalystUser } from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";
import ProductLoadingScreen from "@/components/global/ProductLoadingScreen";
import GraphEditor from "@/app/(editor)/components/GraphEditor";

type FormValues = {
  video: File;
};

type MaintainerAgentData = {
  product_id: string;
  user_flow_video_urls: string[];
};

export default function TestPlanning() {
  const [requirements, setRequirements] = useState("");
  const [video, setVideo] = useState<File | null>(null);
  const { loading } = useBackend();
  const [localLoading, setLocalLoading] = useState(false);
  const { control, handleSubmit, setValue, watch } = useForm<FormValues>();
  const [isFlowGenerating, setIsFlowGenerating] = useState<boolean>(false);
  const [planningRequestId, setPlanningRequestId] = useState<string | null>(
    null,
  );
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(
    null,
  );
  const [graphPath, setGraphPath] = useState<string | null>(null);
  const [flowPath, setFlowPath] = useState<string | null>(null);
  const [flowGenerated, setFlowGenerated] = useState<boolean>(false);
  const { productSwitcher } = useProductSwitcher();

  // Validation error states
  const [requirementsError, setRequirementsError] = useState("");

  // Get user data from Clerk
  const { user } = useUser();

  // Get user organization ID
  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;

  // Check if user belongs to QAI organization for production
  const isQaiUser = isQaiOrgUser(userOrgId) || isQaiOrgAnalystUser(userOrgId);

  // Check if environment is production
  const isProduction = process.env.NEXT_PUBLIC_APP_ENV === "production";

  // Default is Contact Sales button for everyone
  const showAIPlanningFeatures = (isProduction && isQaiUser) || !isProduction;
  const showContactSalesButton = !showAIPlanningFeatures; // Default for everyone else

  // Validation functions
  const validateRequirements = (value: string) => {
    if (value.trim() && !ValidationHelpers.isValidOptionalText(value)) {
      return "Must have at least 1 character";
    }
    return "";
  };

  // const router = useRouter();
  const watchedVideo = watch("video");
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  // Setup polling when we have a request ID
  useEffect(() => {
    // Clear any existing polling interval
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }

    // Start new polling if we have a request ID and are generating flow
    if (planningRequestId && isFlowGenerating) {
      const interval = setInterval(checkPlanningRequestStatus, 10000); // Poll every 10 seconds
      setPollingInterval(interval);

      // Clean up interval on unmount
      return () => {
        clearInterval(interval);
      };
    }
  }, [planningRequestId, isFlowGenerating]);

  // Check the status of the planning request
  const checkPlanningRequestStatus = async () => {
    if (!planningRequestId) return;

    try {
      const response = await fetch(
        `/api/get-planning-request-status?requestId=${planningRequestId}`,
      );

      if (!response.ok) {
        console.error(
          "Failed to check planning request status:",
          response.statusText,
        );
        return;
      }

      const data = await response.json();
      console.log("Planning request status:", data);

      // If request is complete
      if (data.status === "COMPLETED") {
        toast.success("Flow generation completed successfully!");
        setIsFlowGenerating(false);
        setFlowGenerated(true);

        // Clear polling interval
        if (pollingInterval) {
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }

        // Set both the graph and flow paths
        const generatedGraphPath = `qai-upload-temporary/productId_${productSwitcher.product_id}/${planningRequestId}/generated-graph.json`;
        const generatedFlowPath = `qai-upload-temporary/productId_${productSwitcher.product_id}/${planningRequestId}/generated-flow.json`;

        setGraphPath(generatedGraphPath);
        setFlowPath(generatedFlowPath);
      } else if (data.status === "FAILED") {
        toast.error("Flow generation failed");
        setIsFlowGenerating(false);

        // Clear polling interval
        if (pollingInterval) {
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }
      }
      // For other statuses (QUEUED, PROCESSING), keep polling
    } catch (error) {
      console.error("Error checking planning request status:", error);
    }
  };

  // Function to clear video
  const clearVideo = (e: React.MouseEvent) => {
    e.stopPropagation();
    setVideo(null);
    setValue("video", undefined as unknown as File);
    if (videoInputRef.current) {
      videoInputRef.current.value = "";
    }
    toast.success("Video cleared");
  };

  // Function to truncate filename for display
  const truncateFilename = (filename: string, maxLength = 20): string => {
    if (!filename) return "";
    if (filename.length <= maxLength) return filename;

    const extension = filename.split(".").pop() || "";
    const nameWithoutExt = filename.substring(0, filename.lastIndexOf("."));

    return `${nameWithoutExt.substring(0, maxLength - extension.length - 3)}...${extension}`;
  };

  const handleVideoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setVideo(file);
      setValue("video", file);
      toast.success("Video selected");
    }
  };

  const callMaintainerAgent = async (jsonFormdata: MaintainerAgentData) => {
    console.log("Calling Maintainer Agent with formData:", jsonFormdata);

    try {
      const response = await fetch(
        "/api/generate-instructions?maintainerAgent=true",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ payload: jsonFormdata }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to request Maintainer Agent");
      }

      const result = await response.json();
      console.log("Maintainer Agent response:", result);

      // Get the request ID from the response
      const requestId = result.message?.request_id;
      if (requestId) {
        setPlanningRequestId(requestId);
        // Set loading state to show the loading screen
        setIsFlowGenerating(true);
        toast.success("Flow generation started");
        return result;
      } else {
        throw new Error("No request ID returned from Maintainer Agent");
      }
    } catch (error) {
      console.error("Error when calling Maintainer Agent:", error);
      toast.error("Failed to start flow generation");
      throw error;
    }
  };

  const onSubmit = async () => {
    setLocalLoading(true);

    // Validate requirements (optional field)
    const requirementsValidation = validateRequirements(requirements);
    setRequirementsError(requirementsValidation);

    if (!video) {
      toast.error("Please upload a video");
      setLocalLoading(false);
      return;
    }

    if (!productSwitcher.product_id) {
      toast.error("Please select ProductId");
      setLocalLoading(false);
      return;
    }

    if (requirementsValidation) {
      setLocalLoading(false);
      return;
    }

    try {
      let fileName;
      const uploadedVideoUrls: string[] = [];

      // Handle video upload if present
      if (video) {
        console.log("Generating signed URL for video");
        const signedUrlResponse = await fetch(
          "/api/generate-instructions?getSignedUrl=true",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: watchedVideo.name,
              contentType: watchedVideo.type,
            }),
          },
        );

        if (!signedUrlResponse.ok) {
          throw new Error("Failed to get signed URL for video");
        }

        console.log("Got signed URL, starting video upload");
        const response = await signedUrlResponse.json();
        const { signedUrl, fileName: videoFileName } = response;
        fileName = videoFileName;

        const uploadResponse = await fetch(signedUrl, {
          method: "PUT",
          body: watchedVideo,
          headers: {
            "Content-Type": watchedVideo.type,
          },
          mode: "cors",
        });

        if (!uploadResponse.ok) {
          throw new Error(`Failed to upload video: ${uploadResponse.status}`);
        }

        uploadedVideoUrls.push(fileName);
        console.log("Video uploaded successfully with URI:", fileName);
      }

      // Create payload for Maintainer Agent
      const jsonFormData = {
        product_id: productSwitcher.product_id,
        user_flow_video_urls: uploadedVideoUrls,
      };

      // Call the Maintainer Agent API
      await callMaintainerAgent(jsonFormData);

      // Reset form fields
      setVideo(null);
      setRequirements("");
    } catch (error) {
      console.error("Error during file upload:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error(
        error instanceof Error ? error.message : "Failed to upload files",
      );
    } finally {
      setLocalLoading(false);
    }
  };

  // If flow is generated, render the Graph Editor
  if (flowGenerated && graphPath && flowPath) {
    return (
      <div className="h-screen w-full">
        <GraphEditor path={graphPath} flowPath={flowPath} />
      </div>
    );
  }

  // Shows loading screen when flow is being generated
  if (isFlowGenerating) {
    return (
      <div className="fixed inset-0 z-50 bg-white">
        <ProductLoadingScreen message="Please wait while we generate the flow" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl py-8 mt-12">
      <h1 className="text-3xl font-bold mb-2">AI Flow creation</h1>
      <p className="text-gray-600 mb-4">
        Use AI to generate Flows for your product.
      </p>

      {graphPath && (
        <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-6">
          <h2 className="text-lg font-semibold text-green-800 mb-2">
            Flow Generation Complete!
          </h2>

          <p className="text-green-700 mt-3">Path to Graph:</p>
          <div className="bg-white rounded p-3 mt-1 border border-green-200 font-mono text-sm overflow-x-auto">
            {graphPath}
          </div>

          <p className="text-green-700 mt-3">Path to Flow:</p>
          <div className="bg-white rounded p-3 mt-1 border border-green-200 font-mono text-sm overflow-x-auto">
            {flowPath}
          </div>
        </div>
      )}

      {showContactSalesButton ? (
        // Contact Sales Button (default for everyone except QAI users in production)
        <div className="flex justify-center mt-10">
          <a
            href="https://calendar.app.google/DrGcuEM8C6nhaKQc6"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              className="inline-flex items-center px-8 py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 shadow-lg hover:shadow-xl transition-all"
              size="lg"
            >
              Contact Sales
            </Button>
          </a>
        </div>
      ) : (
        <div>
          {/* AI TEST CASE PLANNING INPUTS */}
          <div className="space-y-8">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-4">
                <div className="flex flex-col h-full">
                  {/* Video Upload Card */}
                  <Card
                    className={`border-dashed border-2 cursor-pointer hover:border-purple-700 relative h-25`}
                    onClick={() => videoInputRef.current?.click()}
                  >
                    <CardContent className="flex flex-col items-center justify-center p-4 h-full relative">
                      {/* Clear button for video */}
                      {video && (
                        <button
                          onClick={clearVideo}
                          className="absolute top-2 right-2 p-1 rounded-full bg-purple-500 text-white hover:bg-purple-600 transition-colors z-10"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                      <Film className="h-6 w-6 text-purple-500 mb-2" />
                      <h3 className="font-medium text-center text-purple-500 text-sm">
                        {video
                          ? truncateFilename(video.name)
                          : "Upload App Video"}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">mp4, mov</p>
                      <Controller
                        name="video"
                        control={control}
                        render={() => (
                          <input
                            ref={videoInputRef}
                            type="file"
                            accept="video/*"
                            className="hidden"
                            onChange={handleVideoChange}
                          />
                        )}
                      />
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="col-span-8 hidden">
                <div className="h-full flex flex-col">
                  <label className="text-md font-medium mb-2 block">
                    Additional Information About the Flow
                  </label>
                  <Textarea
                    value={requirements}
                    onChange={(e) => {
                      setRequirements(e.target.value);
                      if (requirementsError) setRequirementsError("");
                    }}
                    placeholder="Describe any specific Business Logic ..."
                    className={cn(
                      "flex-grow min-h-[200px] w-full text-md border border-gray-300 rounded-lg focus:ring-2",
                      requirementsError
                        ? "border-red-500 focus-visible:ring-red-500"
                        : "",
                    )}
                  />
                  {requirementsError && (
                    <p className="text-red-500 text-sm font-medium mt-1">
                      {requirementsError}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <Button
                className="inline-flex items-center px-8 py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 shadow-lg hover:shadow-xl transition-all"
                size="lg"
                onClick={handleSubmit(onSubmit)}
                disabled={!video || loading || localLoading}
              >
                {loading || localLoading ? (
                  <Loading />
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    Generate Flow
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
