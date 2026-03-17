import React from "react";
import { Node } from "@xyflow/react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

interface NodePreviewProps {
  node: Node | null;
  canvasHeight: number;
  isVisible: boolean;
  edges?: any[];
}

const NodePreview: React.FC<NodePreviewProps> = ({
  node,
  canvasHeight,
  isVisible,
  edges = [],
}) => {
  if (!node || !isVisible) {
    return null;
  }

  const nodeData = node.data as any;
  const flowStyle = nodeData?.flowStyle || {};

  // Calculate preview dimensions - 60% of the canvas height
  const previewHeight = Math.max(canvasHeight * 0.6, 300); // Minimum height of 300px
  const previewWidth = (previewHeight * 9) / 16; // Maintain aspect ratio (16:9)

  return (
    <div
      className="fixed z-[9999] pointer-events-none transition-all duration-300 ease-out"
      style={{
        right: "20px",
        top: "50%",
        transform: `translateY(-50%) translateX(${isVisible ? "0" : "20px"})`,
        width: `${previewWidth}px`,
        height: `${previewHeight}px`,
        opacity: isVisible ? 1 : 0,
        maxWidth: "400px", // Maximum width to prevent it from getting too large
        maxHeight: "600px", // Maximum height
      }}
    >
      <Card
        className="w-full h-full shadow-2xl border-2 backdrop-blur-sm"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.98)",
          borderColor: flowStyle.borderColor || "#e5e7eb",
          animation: flowStyle.animation || "none",
        }}
      >
        <CardContent className="p-4 h-full flex flex-col">
          {/* Image */}
          <div className="flex-1 overflow-hidden rounded flex items-center justify-center bg-gray-100 mb-3">
            {nodeData?.image ? (
              <img
                src={nodeData.image}
                alt="Node Preview"
                className="max-h-full max-w-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="text-gray-400 text-sm">No image</div>
            )}
          </div>

          {/* Exclamation icon if needed */}
          {flowStyle.showExclamationIcon && (
            <div className="absolute top-2 left-2">
              <div className="w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
          )}

          {/* Description */}
          <div className="text-xs text-gray-700 leading-tight break-words text-center min-h-[2rem] flex items-center justify-center">
            {nodeData?.description || "No description"}
          </div>

          {/* Connection info */}
          <div className="text-xs text-gray-400 mt-1 text-center">
            {(() => {
              const incomingEdges = edges.filter(
                (edge: any) => edge.target === node.id,
              );
              const outgoingEdges = edges.filter(
                (edge: any) => edge.source === node.id,
              );
              return `${incomingEdges.length} in, ${outgoingEdges.length} out`;
            })()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default NodePreview;
