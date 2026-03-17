"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Video, Upload, FileText, Edit2 } from "lucide-react";
import { transitions } from "@/lib/animations";
import { useProductSwitcher } from "@/providers/product-provider";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store/store";
import { useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UNASSIGNED_FLOWS_FEATURE_ID } from "@/lib/constants";

interface CaptureNewFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CaptureNewFlowDialog({
  open,
  onOpenChange,
}: CaptureNewFlowDialogProps) {
  const [flowName, setFlowName] = useState("");
  const [textFlowContent, setTextFlowContent] = useState("");
  const { productSwitcher } = useProductSwitcher();
  const isWebProduct = Boolean(productSwitcher?.web_url?.trim());

  const searchParams = useSearchParams();
  const urlFeatureId = searchParams.get("featureId");

  const graphFeatures = useSelector(
    (state: RootState) => state.graphFeatures.features,
  );

  const [selectedFeatureId, setSelectedFeatureId] = useState<string>("");

  useEffect(() => {
    if (open) {
      if (
        urlFeatureId &&
        urlFeatureId !== UNASSIGNED_FLOWS_FEATURE_ID &&
        graphFeatures.some((f) => f.id === urlFeatureId)
      ) {
        setSelectedFeatureId(urlFeatureId);
      } else {
        setSelectedFeatureId("");
      }
    } else {
      setFlowName("");
      setTextFlowContent("");
      setSelectedFeatureId("");
    }
  }, [open, urlFeatureId, graphFeatures]);

  const handleUploadVideoClick = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("graphOpenVideoUpload", {
          detail: {
            flowName: flowName || undefined,
            featureId: selectedFeatureId,
          },
        }),
      );
    }
    onOpenChange(false);
  };

  const handleCaptureLiveFlow = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("graphCaptureLiveFlow", {
          detail: {
            flowName: flowName || undefined,
            featureId: selectedFeatureId,
          },
        }),
      );
    }
    onOpenChange(false);
  };

  const handleTextBasedFlow = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("graphCaptureTextFlow", {
          detail: {
            flowName: flowName || undefined,
            content: textFlowContent,
            featureId: selectedFeatureId,
          },
        }),
      );
    }
    onOpenChange(false);
  };

  const validFeatures = graphFeatures.filter(
    (f) => f.id !== UNASSIGNED_FLOWS_FEATURE_ID,
  );

  const isFeatureSelected = Boolean(selectedFeatureId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">
            Capture New Flow
          </DialogTitle>
        </DialogHeader>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transitions.normalDelayed(0.1)}
          className="space-y-6 pt-4"
        >
          <div className="space-y-4">
            <Input
              placeholder="Flow name (Optional)"
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              className="h-12 text-base md:text-sm"
            />

            <Select
              value={selectedFeatureId}
              onValueChange={setSelectedFeatureId}
            >
              <SelectTrigger className="h-12 w-full text-base md:text-sm">
                <SelectValue placeholder="Select Feature" />
              </SelectTrigger>
              <SelectContent>
                {validFeatures.map((feature) => (
                  <SelectItem key={feature.id} value={feature.id}>
                    {feature.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            {isWebProduct ? (
              <>
                <Button
                  variant="v2"
                  onClick={handleCaptureLiveFlow}
                  className="w-full h-12 text-base"
                  disabled={!isFeatureSelected}
                >
                  <Video className="h-5 w-5 mr-2" />
                  Capture Live Flow
                </Button>

                <div className="flex items-center gap-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-sm text-muted-foreground">OR</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <div className="space-y-2">
                  <Textarea
                    placeholder="Enter flow description or steps here..."
                    value={textFlowContent}
                    onChange={(e) => setTextFlowContent(e.target.value)}
                    className="min-h-[100px] text-base md:text-sm resize-y"
                  />
                  <Button
                    variant="v2-outline"
                    onClick={handleTextBasedFlow}
                    className="w-full h-12 text-base"
                    disabled={!textFlowContent.trim() || !isFeatureSelected}
                  >
                    <FileText className="h-5 w-5 mr-2" />
                    Text Based Flow
                  </Button>
                </div>
              </>
            ) : (
              <Button
                variant="v2"
                onClick={handleUploadVideoClick}
                className="w-full h-12 text-base"
                disabled={!isFeatureSelected}
              >
                <Upload className="h-5 w-5 mr-2" />
                Upload Flow Video
              </Button>
            )}

            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-sm text-muted-foreground">OR</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <Button
              variant="v2-outline"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(
                    new CustomEvent("graphStartManualFlowCreation", {
                      detail: {
                        flowName: flowName || undefined,
                        featureId: selectedFeatureId,
                      },
                    }),
                  );
                }
                onOpenChange(false);
              }}
              className="w-full h-12 text-base"
              disabled={!isFeatureSelected}
            >
              <Edit2 className="h-5 w-5 mr-2" />
              Create Manually
            </Button>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
