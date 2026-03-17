// @ts-nocheck
import { useState, useCallback } from "react";
import { Node } from "@xyflow/react";

interface UseCameraControlsProps {
  getViewport: () => { x: number; y: number; zoom: number };
  setViewport: (
    viewport: { x: number; y: number; zoom: number },
    options?: { duration: number },
  ) => void;
}

export const useCameraControls = ({
  getViewport,
  setViewport,
}: UseCameraControlsProps) => {
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPosition, setLastPanPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Right-click panning handlers
  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    if (event.button === 2) {
      // Right click
      event.preventDefault();
      setIsPanning(true);
      setLastPanPosition({ x: event.clientX, y: event.clientY });
    }
  }, []);

  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (isPanning && lastPanPosition) {
        const deltaX = event.clientX - lastPanPosition.x;
        const deltaY = event.clientY - lastPanPosition.y;

        const viewport = getViewport();
        setViewport({
          x: viewport.x + deltaX,
          y: viewport.y + deltaY,
          zoom: viewport.zoom,
        });

        setLastPanPosition({ x: event.clientX, y: event.clientY });
      }
    },
    [isPanning, lastPanPosition, getViewport, setViewport],
  );

  const handleMouseUp = useCallback((event: React.MouseEvent) => {
    if (event.button === 2) {
      // Right click
      setIsPanning(false);
      setLastPanPosition(null);
    }
  }, []);

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault(); // Prevent right-click context menu
  }, []);

  // Camera control function for choice nodes during flow planning
  const panToChoiceNodes = useCallback(
    (branchNode: Node, choiceNodes: Node[]) => {
      const allNodes = [branchNode, ...choiceNodes];

      // Calculate bounds of all nodes
      const bounds = allNodes.reduce(
        (acc, node) => ({
          minX: Math.min(acc.minX, node.position.x),
          maxX: Math.max(acc.maxX, node.position.x + 150), // node width
          minY: Math.min(acc.minY, node.position.y),
          maxY: Math.max(acc.maxY, node.position.y + 100), // node height
        }),
        {
          minX: Infinity,
          maxX: -Infinity,
          minY: Infinity,
          maxY: -Infinity,
        },
      );

      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;
      const width = bounds.maxX - bounds.minX;
      const height = bounds.maxY - bounds.minY;

      // Calculate zoom level to fit content only (without padding)
      const viewportWidth = window.innerWidth * 0.75; // Account for sidebar
      const viewportHeight = window.innerHeight;
      const contentZoomX = viewportWidth / width;
      const contentZoomY = viewportHeight / height;
      const contentZoom = Math.min(contentZoomX, contentZoomY);

      // Apply padding by reducing zoom level, accounting for MiniMap position
      const basePadding = 40; // Base padding in pixels
      const miniMapWidth = 200; // Approximate MiniMap width
      const miniMapHeight = 150; // Approximate MiniMap height

      // Add extra padding on right and bottom sides to avoid MiniMap
      const paddingLeft = basePadding;
      const paddingRight = basePadding + miniMapWidth + 20; // Extra space for MiniMap
      const paddingTop = basePadding;
      const paddingBottom = basePadding + miniMapHeight + 20; // Extra space for MiniMap

      const paddingFactorX =
        (viewportWidth - paddingLeft - paddingRight) / viewportWidth;
      const paddingFactorY =
        (viewportHeight - paddingTop - paddingBottom) / viewportHeight;
      const paddingFactor = Math.min(paddingFactorX, paddingFactorY);
      const zoom = Math.min(contentZoom * paddingFactor, 0.8); // Cap at 0.8x

      // Adjust center position to account for asymmetric padding
      const centerOffsetX = (paddingLeft - paddingRight) / 2;
      const centerOffsetY = (paddingTop - paddingBottom) / 2;

      setViewport(
        {
          x: viewportWidth / 2 - centerX * zoom + centerOffsetX,
          y: viewportHeight / 2 - centerY * zoom + centerOffsetY,
          zoom,
        },
        { duration: 800 },
      );
    },
    [setViewport],
  );

  // Camera control function for complete flow path
  const panToFlowPath = useCallback(
    (flowNodes: Node[]) => {
      if (flowNodes.length === 0) return;

      // Calculate bounds of all flow nodes
      const bounds = flowNodes.reduce(
        (acc, node) => ({
          minX: Math.min(acc.minX, node.position.x),
          maxX: Math.max(acc.maxX, node.position.x + 150), // node width
          minY: Math.min(acc.minY, node.position.y),
          maxY: Math.max(acc.maxY, node.position.y + 100), // node height
        }),
        {
          minX: Infinity,
          maxX: -Infinity,
          minY: Infinity,
          maxY: -Infinity,
        },
      );

      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;
      const width = bounds.maxX - bounds.minX;
      const height = bounds.maxY - bounds.minY;

      // Calculate zoom level to fit content only (without padding)
      const viewportWidth = window.innerWidth * 0.75; // Account for sidebar
      const viewportHeight = window.innerHeight;
      const contentZoomX = viewportWidth / width;
      const contentZoomY = viewportHeight / height;
      const contentZoom = Math.min(contentZoomX, contentZoomY);

      // Apply padding by reducing zoom level, accounting for MiniMap position
      const basePadding = 40; // Base padding in pixels
      const miniMapWidth = 200; // Approximate MiniMap width
      const miniMapHeight = 150; // Approximate MiniMap height

      // Add extra padding on right and bottom sides to avoid MiniMap
      const paddingLeft = basePadding;
      const paddingRight = basePadding + miniMapWidth + 20; // Extra space for MiniMap
      const paddingTop = basePadding;
      const paddingBottom = basePadding + miniMapHeight + 20; // Extra space for MiniMap

      const paddingFactorX =
        (viewportWidth - paddingLeft - paddingRight) / viewportWidth;
      const paddingFactorY =
        (viewportHeight - paddingTop - paddingBottom) / viewportHeight;
      const paddingFactor = Math.min(paddingFactorX, paddingFactorY);
      const zoom = Math.min(contentZoom * paddingFactor, 1.0); // Cap at 1.0x

      // Adjust center position to account for asymmetric padding
      const centerOffsetX = (paddingLeft - paddingRight) / 2;
      const centerOffsetY = (paddingTop - paddingBottom) / 2;

      setViewport(
        {
          x: viewportWidth / 2 - centerX * zoom + centerOffsetX,
          y: viewportHeight / 2 - centerY * zoom + centerOffsetY,
          zoom,
        },
        { duration: 800 },
      );
    },
    [setViewport],
  );

  return {
    isPanning,
    lastPanPosition,
    setIsPanning,
    setLastPanPosition,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleContextMenu,
    panToChoiceNodes,
    panToFlowPath,
  };
};
