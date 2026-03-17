// @ts-nocheck
import React, {
  useMemo,
  useState,
  useEffect,
  memo,
  useCallback,
  useRef,
} from "react";
import { Node, Edge, useReactFlow } from "@xyflow/react";
import {
  convexHull,
  getNodeCornerPoints,
  hullToSVGPath,
} from "../utils/convexHull";
import { Feature, Flow } from "./FlowManager";

interface ConvexHullProps {
  selectedNodes: Node[];
  mode: string;
  visibleFeatures?: Feature[];
  allNodes?: Node[];
  edges?: Edge[];
  flows?: Flow[];
  editingFeatureId?: string | null;
}

const ConvexHull: React.FC<ConvexHullProps> = memo(
  ({
    selectedNodes,
    mode,
    visibleFeatures = [],
    allNodes = [],
    edges = [],
    flows = [],
    editingFeatureId = null,
  }) => {
    const { getViewport } = useReactFlow();
    const [viewport, setViewport] = useState(() => getViewport());
    const lastViewportRef = useRef(getViewport());
    const rafRef = useRef<number | null>(null);
    const isUpdatingRef = useRef(false);

    // High-performance viewport tracking with requestAnimationFrame
    const updateViewport = useCallback(() => {
      if (isUpdatingRef.current) return;

      const currentViewport = getViewport();
      const lastViewport = lastViewportRef.current;

      // Only update if viewport actually changed (with small tolerance)
      const hasChanged =
        Math.abs(currentViewport.x - lastViewport.x) > 0.1 ||
        Math.abs(currentViewport.y - lastViewport.y) > 0.1 ||
        Math.abs(currentViewport.zoom - lastViewport.zoom) > 0.001;

      if (hasChanged) {
        isUpdatingRef.current = true;
        setViewport(currentViewport);
        lastViewportRef.current = currentViewport;

        // Reset the flag after the next frame
        requestAnimationFrame(() => {
          isUpdatingRef.current = false;
        });
      }
    }, [getViewport]);

    // Continuous RAF loop for smooth 60fps updates
    const startRAFLoop = useCallback(() => {
      const loop = () => {
        updateViewport();
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    }, [updateViewport]);

    const stopRAFLoop = useCallback(() => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }, []);

    // Setup viewport tracking
    useEffect(() => {
      startRAFLoop();

      return () => {
        stopRAFLoop();
      };
    }, [startRAFLoop, stopRAFLoop]);

    // Update viewport immediately when dependencies change
    useEffect(() => {
      updateViewport();
    }, [allNodes.length, visibleFeatures.length, updateViewport]);

    const featureColors = useMemo(
      () => [
        "hsl(var(--muted-foreground))", // Use existing grey from design system
        "hsl(var(--flow-start))", // Green
        "hsl(var(--flow-end))", // Red
        "hsl(var(--flow-via))", // Blue
      ],
      [],
    );

    const previewHullPath = useMemo(() => {
      // Only show preview hull in addFeature mode when nodes are selected
      if (mode !== "addFeature" || selectedNodes.length < 1) {
        return "";
      }

      // Get all corner points from selected nodes (in flow coordinates)
      const allPoints = selectedNodes.flatMap((node) =>
        getNodeCornerPoints(node, 20),
      );

      // Calculate convex hull in flow coordinates
      const hull = convexHull(allPoints);

      // Convert to SVG path
      return hullToSVGPath(hull);
    }, [selectedNodes, mode]);

    // Memoize hull calculations separately from # // viewport-dependent operations
    const featureHullData = useMemo(() => {
      if (visibleFeatures.length === 0) {
        return [];
      }

      const hasAnyFlowsWithFeatureId = flows.some((flow) => flow.feature_id);

      return visibleFeatures
        .map((feature, index) => {
          const featureFlows = flows.filter(
            (flow) => flow.feature_id === feature.id,
          );
          const nodeIdsSet = new Set<string>();
          featureFlows.forEach((flow) => {
            (flow.pathNodeIds || []).forEach((nodeId) =>
              nodeIdsSet.add(nodeId),
            );
          });
          let nodeIds = Array.from(nodeIdsSet);

          if (
            !hasAnyFlowsWithFeatureId &&
            nodeIds.length === 0 &&
            feature.nodeIds &&
            feature.nodeIds.length > 0
          ) {
            nodeIds = feature.nodeIds;
          }

          const featureNodes = allNodes.filter((node) =>
            nodeIds.includes(node.id),
          );
          if (featureNodes.length === 0) {
            return null;
          }

          // For collapsed features, create hull around the actual stacked nodes
          if ((feature as any).isCollapsed) {
            const collapsedNodes = featureNodes.filter(
              (node) => (node.data as any)?.isCollapsed,
            );

            if (collapsedNodes.length > 0) {
              // Get actual positions of collapsed nodes and create hull around them
              const allPoints = collapsedNodes.flatMap((node) =>
                getNodeCornerPoints(node, 10),
              );
              const hull = convexHull(allPoints);

              // Find label position at top center (without zoom dependency)
              const minY = Math.min(...hull.map((p) => p.y));
              const hullXCoords = hull.map((p) => p.x);
              const minX = Math.min(...hullXCoords);
              const maxX = Math.max(...hullXCoords);
              const centerX = (minX + maxX) / 2;

              return {
                path: hullToSVGPath(hull),
                color: featureColors[index % featureColors.length],
                featureId: feature.id,
                name: feature.name,
                baseLabelPosition: { x: centerX, y: minY }, // Base position without offset
                totalScreens: nodeIds.length,
                totalFlows: featureFlows.length,
                isCollapsed: true,
              };
            }
          }

          // Calculate statistics
          const totalScreens = nodeIds.length;
          const totalFlows = featureFlows.length;

          // Get all corner points from feature nodes
          const allPoints = featureNodes.flatMap((node) =>
            getNodeCornerPoints(node, 20),
          );

          // Calculate convex hull
          const hull = convexHull(allPoints);

          // Find the top center position for the label (without zoom dependency)
          const minY = Math.min(...hull.map((p) => p.y));
          const hullXCoords = hull.map((p) => p.x);
          const minX = Math.min(...hullXCoords);
          const maxX = Math.max(...hullXCoords);
          const centerX = (minX + maxX) / 2;

          return {
            path: hullToSVGPath(hull),
            color: featureColors[index % featureColors.length],
            featureId: feature.id,
            name: feature.name,
            baseLabelPosition: { x: centerX, y: minY }, // Base position without offset
            totalScreens,
            totalFlows,
            isCollapsed: false,
          };
        })
        .filter(Boolean);
    }, [visibleFeatures, allNodes, flows, featureColors]); // Removed viewport dependency

    // Apply viewport-dependent transformations only when viewport changes
    const featureHulls = useMemo(() => {
      return featureHullData.map((hull) => ({
        ...hull,
        labelPosition: {
          x: hull!.baseLabelPosition.x,
          y: hull!.baseLabelPosition.y - 30 / viewport.zoom, // Apply zoom to the offset, not the position
        },
      }));
    }, [featureHullData, viewport.zoom]);

    if (!previewHullPath && featureHulls.length === 0) {
      return null;
    }

    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: -1 }}
      >
        <style>
          {`
          @keyframes pulse-hull {
            0% { opacity: 0; }
            50% { opacity: 1; }
            100% { opacity: 0; }
          }
          
          .hull-pulse {
            animation: pulse-hull 2s ease-in-out infinite;
          }
        `}
        </style>
        <svg
          className="absolute inset-0 w-full h-full overflow-visible"
          style={{
            zIndex: -1,
            transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
            transformOrigin: "0 0",
            willChange: "transform",
          }}
        >
          {/* Feature hulls */}
          {featureHulls.map((hull) => {
            const isBeingEdited = editingFeatureId === hull!.featureId;
            return (
              <g key={hull!.featureId}>
                <path
                  d={hull!.path}
                  fill={hull!.color.replace(")", ") / 0.15")}
                  stroke={hull!.color.replace(")", ") / 0.4")}
                  strokeWidth={1 / viewport.zoom}
                  className={isBeingEdited ? "hull-pulse" : ""}
                />
                <text
                  x={hull!.labelPosition.x}
                  y={hull!.labelPosition.y}
                  textAnchor="middle"
                  fontSize={14 / viewport.zoom}
                  fontWeight="600"
                  fill={hull!.color.replace(")", ") / 0.8")}
                  className="pointer-events-none select-none"
                >
                  {hull!.name}
                </text>
                <text
                  x={hull!.labelPosition.x}
                  y={hull!.labelPosition.y + 18 / viewport.zoom}
                  textAnchor="middle"
                  fontSize={11 / viewport.zoom}
                  fontWeight="400"
                  fill={hull!.color.replace(")", ") / 0.7")}
                  className="pointer-events-none select-none"
                >
                  {hull!.totalScreens} screens • {hull!.totalFlows} flows
                </text>
              </g>
            );
          })}

          {/* Preview hull (for selection/creation) */}
          {previewHullPath && (
            <path
              d={previewHullPath}
              fill="hsl(var(--primary) / 0.1)"
              stroke="hsl(var(--primary) / 0.3)"
              strokeWidth={2 / viewport.zoom}
              strokeDasharray={`${5 / viewport.zoom},${5 / viewport.zoom}`}
            />
          )}
        </svg>
      </div>
    );
  },
);

ConvexHull.displayName = "ConvexHull";

export { ConvexHull };
