"use client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import PIMViewer from "@/app/viewer/PIMViewer";

interface TestCaseFlowViewerProps {
  metadata: string;
  open: boolean;
  onClose: () => void;
}

export default function TestCaseFlowViewer({
  metadata,
  open,
  onClose,
}: TestCaseFlowViewerProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="w-full max-w-[98vw] h-[98vh] max-h-[98vh] p-0 flex flex-col items-center justify-center overflow-hidden"
        style={{
          width: "98vw",
          height: "98vh",
          maxWidth: "98vw",
          maxHeight: "98vh",
          padding: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <DialogHeader className="w-full">
          <DialogTitle className="mt-3 ml-4">Flow Viewer</DialogTitle>
        </DialogHeader>
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            flex: 1,
            position: "relative",
            overflow: "visible",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "calc(100% - 56px)",
              maxWidth: 900,
              maxHeight: 700,
              minWidth: 320,
              minHeight: 240,
              background: "rgba(20,20,20,0.12)",
              borderRadius: 18,
              boxShadow: "0 4px 32px rgba(0,0,0,0.18)",
              padding: 32,
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "visible",
              margin: "auto",
            }}
          >
            <PIMViewer metadata={metadata} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
