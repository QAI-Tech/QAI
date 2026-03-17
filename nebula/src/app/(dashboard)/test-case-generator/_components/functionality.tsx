"use client";

import Loading from "@/components/global/loading";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import React, { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useBackend } from "@/hooks/use-backend";
import RequestCard from "./RequestCard";
import { useProductSwitcher } from "@/providers/product-provider";

type FormValues = {
  video: File;
};

const Functionality = () => {
  const [video, setVideo] = useState<File | null>(null);
  const { data, error, loading, generateInstructions } = useBackend();
  const { control, handleSubmit, setValue, watch } = useForm<FormValues>();
  const { productSwitcher } = useProductSwitcher();
  // Watch the video field
  const watchedVideo = watch("video");

  const onSubmit = async () => {
    if (!video) {
      toast.error("Please upload a video");
      return;
    }
    try {
      // This I have used to Get signed URL
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
        throw new Error("Failed to get signed URL");
      }

      const { signedUrl, fileName } = await signedUrlResponse.json();
      console.log("Signed URL:", signedUrl);

      // Upload to GCS using signed URL
      const uploadResponse = await fetch(signedUrl, {
        method: "PUT",
        body: watchedVideo,
        headers: {
          "Content-Type": watchedVideo.type,
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

      // Process the uploaded file
      const processFormData = new FormData();
      processFormData.append("gcsPath", fileName);

      processFormData.append("product_id", productSwitcher.product_id);
      console.log("product_id ID:", productSwitcher.product_id);

      try {
        await generateInstructions(processFormData);
        toast.success("Video uploaded and processed successfully");
      } catch (error) {
        throw new Error("Failed to process video");
      }
    } catch (error) {
      console.error("Error during file upload:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to upload video",
      );
    }
  };

  const generateTestRun = async () => {
    try {
      if (
        !data ||
        !data.message ||
        !data.message["structured-test-cases"] ||
        data.message["structured-test-cases"].length === 0
      ) {
        toast.error(
          "No test cases available. Please generate test cases first.",
        );
        return;
      }

      const response = await fetch("/api/generate-test-run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          testCases: data.message["structured-test-cases"],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate test run");
      }

      if (response.status === 401) {
        toast.error(
          "Session token expired, logging out the user to regenerate token",
        );
      }

      const result = await response.json();
      toast.success("Test run generated successfully");
      console.log("Test run result:", result);
    } catch (error) {
      toast.error("Error generating test run");
      console.error("Error generating test run:", error);
    }
  };

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  useEffect(() => {
    if (data) {
      console.log("Data received:", data);
    }
  }, [data]);

  console.log("productSwitcher:", productSwitcher);
  return (
    <div className="!bg-transparent !shadow-none mx-auto w-[90%] sm:w-[60%] min-w-[300px]">
      <Card className="container">
        <CardHeader>
          <CardTitle>Generate Test Cases</CardTitle>
          <CardDescription>
            Provide the necessary information below to generate test cases!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="mb-6">
              <label className="block text-lg font-medium mb-2">
                Upload Video
              </label>
              <Controller
                name="video"
                control={control}
                render={() => (
                  <Input
                    type="file"
                    accept="video/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setVideo(e.target.files[0]);
                        setValue("video", e.target.files[0]);
                      }
                    }}
                    className="sm:w-fit w-full !bg-primary-background"
                  />
                )}
              />
            </div>
            <Button
              type="submit"
              className={cn(
                "mt-4 mr-4",
                !video ? "bg-muted-foreground" : "bg-primary",
              )}
            >
              {!loading ? "Describe Testing Instructions" : <Loading />}
            </Button>

            <Button
              onClick={generateTestRun}
              className={cn(
                "mt-4 mr-4",
                !video ? "bg-muted-foreground" : "bg-primary",
              )}
            >
              Generate Test Run
            </Button>
          </form>
        </CardContent>
      </Card>
      <RequestCard />
    </div>
  );
};

export default Functionality;
