"use client";

import { useState, useEffect, useRef } from "react";
import { useProductSwitcher } from "@/providers/product-provider";
import { useLoading } from "@/app/context/loading-context";
import { useGraphFlows } from "@/app/context/graph-flows-context";
import { useExtensionCheck } from "@/hooks/use-extension-check";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CaptureNewFlowDialog } from "@/components/navigation/capture-new-flow-dialog";
import { WebExtensionInstallDialog } from "@/components/navigation/web-extension-install-dialog";

export default function HomeV2() {
  const { productSwitcher } = useProductSwitcher();
  const { isAppLoading } = useLoading();
  const {
    flows,
    nodesCount,
    isLoading: isGraphLoading,
    videoQueueItems,
  } = useGraphFlows();
  const { isInstalled: isExtensionInstalled, isChecking: isCheckingExtension } =
    useExtensionCheck();
  const [isCaptureNewFlowDialogOpen, setIsCaptureNewFlowDialogOpen] =
    useState(false);
  const [isWebExtensionInstallDialogOpen, setIsWebExtensionInstallDialogOpen] =
    useState(false);
  const [
    hasClosedWebExtensionInstallDialog,
    setHasClosedWebExtensionInstallDialog,
  ] = useState(false);
  const [isLiveCaptureRequested, setIsLiveCaptureRequested] = useState(false);
  const [hasGraphLoadFinished, setHasGraphLoadFinished] = useState(false);
  const wasGraphLoading = useRef(isGraphLoading);

  useEffect(() => {
    const handleCaptureLiveFlow = () => setIsLiveCaptureRequested(true);
    const handleStartManualFlow = () => setIsLiveCaptureRequested(true);
    window.addEventListener(
      "graphCaptureLiveFlow",
      handleCaptureLiveFlow as EventListener,
    );
    window.addEventListener(
      "graphStartManualFlowCreation",
      handleStartManualFlow as EventListener,
    );
    return () => {
      window.removeEventListener(
        "graphCaptureLiveFlow",
        handleCaptureLiveFlow as EventListener,
      );
      window.removeEventListener(
        "graphStartManualFlowCreation",
        handleStartManualFlow as EventListener,
      );
    };
  }, []);

  const isWebProduct = Boolean(productSwitcher.web_url);

  useEffect(() => {
    if (wasGraphLoading.current && !isGraphLoading) {
      setHasGraphLoadFinished(true);
    }
    wasGraphLoading.current = isGraphLoading;
  }, [isGraphLoading]);

  useEffect(() => {
    if (
      isWebProduct &&
      hasGraphLoadFinished &&
      !isCheckingExtension &&
      !isExtensionInstalled &&
      !hasClosedWebExtensionInstallDialog
    ) {
      setIsWebExtensionInstallDialogOpen(true);
    }
  }, [
    isWebProduct,
    hasGraphLoadFinished,
    isCheckingExtension,
    isExtensionInstalled,
    hasClosedWebExtensionInstallDialog,
  ]);

  // Don't render if still loading
  if (isAppLoading) {
    return null;
  }

  if (!productSwitcher.product_id) {
    return (
      <div className="flex justify-center items-center h-screen p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Please select a product</h2>
          <p className="text-gray-600 mb-6">
            To continue, please select a product from the dropdown menu in the
            sidebar
          </p>
        </div>
      </div>
    );
  }

  const hasActiveVideoUpload = videoQueueItems.some(
    (item) =>
      item.status === "queued" ||
      item.status === "uploading" ||
      item.status === "processing",
  );

  const hasNoGraphAndFlows =
    !isGraphLoading &&
    flows.length === 0 &&
    nodesCount === 0 &&
    !hasActiveVideoUpload &&
    !isLiveCaptureRequested;

  return (
    <div className="h-full w-full relative pointer-events-none">
      {hasNoGraphAndFlows && (!isWebProduct || isExtensionInstalled) && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-50 pointer-events-auto">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">
              No flows yet
            </h2>
            <p className="text-gray-600 mb-6">
              Create your first flow to start documenting user journeys
            </p>
            <Button
              onClick={() => setIsCaptureNewFlowDialogOpen(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white"
              size="lg"
            >
              <Plus className="mr-2 h-5 w-5" />
              Create First Flow
            </Button>
          </div>
        </div>
      )}
      <CaptureNewFlowDialog
        open={isCaptureNewFlowDialogOpen}
        onOpenChange={setIsCaptureNewFlowDialogOpen}
      />
      <WebExtensionInstallDialog
        open={isWebExtensionInstallDialogOpen}
        onOpenChange={(open) => {
          setIsWebExtensionInstallDialogOpen(open);
          if (!open) {
            setHasClosedWebExtensionInstallDialog(true);
          }
        }}
      />
    </div>
  );
}
