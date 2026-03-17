"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProductSwitcher } from "@/providers/product-provider";
import { useDispatch } from "react-redux";
import { AppDispatch } from "@/app/store/store";
import { addGraphFeature } from "@/app/store/graphFeaturesSlice";
import { Feature } from "@/lib/types";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { GRAPH_COLLABORATION_SERVER_URL } from "@/lib/constants";

interface AddFeatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFeatureCreated?: (feature: Feature) => void;
}

export function AddFeatureDialog({
  open,
  onOpenChange,
  onFeatureCreated,
}: AddFeatureDialogProps) {
  const { productSwitcher } = useProductSwitcher();
  const dispatch = useDispatch<AppDispatch>();

  const [featureName, setFeatureName] = useState("");
  const [prdLink, setPrdLink] = useState("");
  const [prdFile, setPrdFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setFeatureName("");
      setPrdLink("");
      setPrdFile(null);
      setIsSubmitting(false);
    }
  }, [open]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setPrdFile(file ?? null);
  };

  const handleFileButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleAddFeature = async () => {
    if (!featureName.trim()) {
      toast.error("Feature name is required");
      return;
    }

    if (!productSwitcher.product_id) {
      toast.error("Please select a product first");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: { product_id: string; name: string; prd_link?: string } = {
        product_id: productSwitcher.product_id,
        name: featureName.trim(),
      };

      if (prdLink.trim()) {
        payload.prd_link = prdLink.trim();
      }

      const response = await fetch(
        `${GRAPH_COLLABORATION_SERVER_URL}/api/graph-events/features/create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            product_id: productSwitcher.product_id,
            name: featureName,
            description: prdLink,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || "Failed to add feature");
      }

      const responseData = await response.json();

      const newFeature: Feature = responseData.feature || responseData;

      dispatch(
        addGraphFeature({
          id: newFeature.id,
          name: newFeature.name,
          nodeIds: [],
          isCollapsed: false,
        }),
      );

      onFeatureCreated?.(newFeature);
      toast.success("Feature added successfully");
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to add feature";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            Add New Feature
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="space-y-2">
            <Label htmlFor="feature-name">Feature name</Label>
            <Input
              id="feature-name"
              placeholder="Feature name"
              value={featureName}
              onChange={(e) => setFeatureName(e.target.value)}
              className="w-full"
            />
          </div>

          <div className="space-y-3">
            <span className="text-sm font-medium text-gray-700">Optional</span>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleFileButtonClick}
                  className="border-purple-600 text-purple-600 hover:bg-purple-50"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload PRD file
                </Button>
                {prdFile && (
                  <span className="text-xs text-gray-500 truncate">
                    {prdFile.name}
                  </span>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>

              <span className="text-sm text-gray-500 text-center md:text-left">
                OR
              </span>

              <Input
                placeholder="Feature PRD"
                value={prdLink}
                onChange={(e) => setPrdLink(e.target.value)}
                className="w-full md:max-w-xs"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleAddFeature}
              disabled={isSubmitting}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {isSubmitting ? "Adding..." : "Add Feature"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
