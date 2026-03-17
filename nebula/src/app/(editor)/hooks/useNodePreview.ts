import { useState, useCallback, useRef, useEffect } from "react";
import { Node } from "@xyflow/react";

interface UseNodePreviewReturn {
  previewNode: Node | null;
  isPreviewVisible: boolean;
  canvasHeight: number;
  handleNodeMouseEnter: (node: Node) => void;
  handleNodeMouseLeave: () => void;
  setCanvasHeight: (height: number) => void;
}

export const useNodePreview = (
  enabled: boolean = false,
): UseNodePreviewReturn => {
  const [previewNode, setPreviewNode] = useState<Node | null>(null);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [canvasHeight, setCanvasHeight] = useState(0);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isOverAnyNodeRef = useRef(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleNodeMouseEnter = useCallback(
    (node: Node) => {
      // Only proceed if preview is enabled
      if (!enabled) {
        return;
      }

      // Cancel any pending hide operation
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }

      // Clear any existing timeout
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }

      // Mark that we're over a node
      isOverAnyNodeRef.current = true;

      // Immediately show the preview for the new node
      setPreviewNode(node);
      setIsPreviewVisible(true);
    },
    [enabled],
  );

  const handleNodeMouseLeave = useCallback(() => {
    // Mark that we're no longer over a node
    isOverAnyNodeRef.current = false;

    // Clear any existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    // Set a timeout to hide the preview, but store it in hideTimeoutRef so it can be cancelled
    hideTimeoutRef.current = setTimeout(() => {
      // Only hide if we're still not over any node
      if (!isOverAnyNodeRef.current) {
        setIsPreviewVisible(false);
        // Clear the node after the fade out animation
        setTimeout(() => {
          setPreviewNode(null);
        }, 200);
      }
      hideTimeoutRef.current = null;
    }, 100); // Reduced delay since we can now cancel it
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  return {
    previewNode,
    isPreviewVisible,
    canvasHeight,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
    setCanvasHeight,
  };
};
