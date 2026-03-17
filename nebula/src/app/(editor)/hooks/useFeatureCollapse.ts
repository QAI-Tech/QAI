// @ts-nocheck
import { useCallback, useRef } from "react";
import { Node } from "@xyflow/react";
import { Feature } from "../components/FlowManager";
import { useToast } from "@/hooks/use-toast";

interface UseFeatureCollapseProps {
  nodes: Node[];
  setNodes: (nodes: Node[] | ((nodes: Node[]) => Node[])) => void;
  features: Feature[];
  updateFeature: (featureId: string, updates: Partial<Feature>) => void;
}

export const useFeatureCollapse = ({
  nodes,
  setNodes,
  features,
  updateFeature,
}: UseFeatureCollapseProps) => {
  const { toast } = useToast();
  const animationRef = useRef<number | null>(null);
  const isCollapsingRef = useRef<boolean>(false);

  // Calculate center position of a group of nodes
  const calculateCenterPosition = useCallback(
    (nodeIds: string[]) => {
      const featureNodes = nodes.filter((node) => nodeIds.includes(node.id));
      if (featureNodes.length === 0) return { x: 0, y: 0 };

      const totalX = featureNodes.reduce(
        (sum, node) => sum + node.position.x,
        0,
      );
      const totalY = featureNodes.reduce(
        (sum, node) => sum + node.position.y,
        0,
      );

      return {
        x: totalX / featureNodes.length,
        y: totalY / featureNodes.length,
      };
    },
    [nodes],
  );

  // Animate nodes between positions
  const animateNodes = useCallback(
    (
      nodeIds: string[],
      startPositions: { [key: string]: { x: number; y: number } },
      endPositions: { [key: string]: { x: number; y: number } },
      onComplete?: () => void,
    ) => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      const startTime = Date.now();
      const duration = 500; // 500ms

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease-out cubic function: t^3 - 3*t^2 + 3*t
        const easeOut = 1 - Math.pow(1 - progress, 3);

        setNodes((prevNodes) =>
          prevNodes.map((node) => {
            if (nodeIds.includes(node.id)) {
              const start = startPositions[node.id];
              const end = endPositions[node.id];

              if (start && end) {
                const x = start.x + (end.x - start.x) * easeOut;
                const y = start.y + (end.y - start.y) * easeOut;

                return {
                  ...node,
                  position: { x, y },
                };
              }
            }
            return node;
          }),
        );

        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          onComplete?.();
        }
      };

      animationRef.current = requestAnimationFrame(animate);
    },
    [setNodes],
  );

  // Preserve original positions and add them to node data
  const preserveOriginalPositions = useCallback(
    (nodeIds: string[]) => {
      setNodes((prevNodes) =>
        prevNodes.map((node) => {
          if (nodeIds.includes(node.id)) {
            // Always use current position as the new original position when collapsing
            return {
              ...node,
              data: {
                ...node.data,
                originalPosition: node.position,
                isCollapsed: true,
              },
            };
          }
          return node;
        }),
      );
    },
    [setNodes],
  );

  // Collapse feature nodes to center position
  const collapseFeature = useCallback(
    (featureId: string) => {
      const feature = features.find((f) => f.id === featureId);
      if (!feature) return;

      console.log(
        "Collapsing feature:",
        featureId,
        "Selected nodes before:",
        nodes.filter((n) => n.selected).map((n) => n.id),
      );

      // Set flag to prevent auto-expand during collapse
      isCollapsingRef.current = true;

      // First clear selection of all feature nodes to prevent auto-expand
      setNodes((prevNodes) =>
        prevNodes.map((node) => {
          if (feature.nodeIds.includes(node.id)) {
            return { ...node, selected: false };
          }
          return node;
        }),
      );

      const centerPosition = calculateCenterPosition(feature.nodeIds);

      // First preserve original positions and mark as collapsed
      preserveOriginalPositions(feature.nodeIds);

      // Get current positions before animation
      const startPositions: { [key: string]: { x: number; y: number } } = {};
      const endPositions: { [key: string]: { x: number; y: number } } = {};

      // Sort nodes by x-position (leftmost first) to determine stacking order
      const sortedNodeIds = feature.nodeIds
        .map((nodeId) => {
          const node = nodes.find((n) => n.id === nodeId);
          return { nodeId, x: node?.position.x || 0 };
        })
        .sort((a, b) => a.x - b.x) // Sort by x position (leftmost first)
        .map((item) => item.nodeId);

      // Get the highest existing z-index
      const maxZIndex = Math.max(0, ...nodes.map((node) => node.zIndex || 0));

      // Set z-index immediately before animation starts
      setNodes((prevNodes) =>
        prevNodes.map((node) => {
          if (feature.nodeIds.includes(node.id)) {
            // Find this node's position in the sorted array (leftmost = index 0 = highest z-index)
            const sortedIndex = sortedNodeIds.indexOf(node.id);
            const zIndex = maxZIndex + sortedNodeIds.length - sortedIndex; // Leftmost gets highest z-index

            return {
              ...node,
              zIndex, // Set z-index immediately
              data: {
                ...node.data,
                isCollapsed: true,
              },
            };
          }
          return node;
        }),
      );

      sortedNodeIds.forEach((nodeId, index) => {
        const node = nodes.find((n) => n.id === nodeId);
        if (node) {
          startPositions[nodeId] = { ...node.position };
          const stackIndex = index;
          endPositions[nodeId] = {
            x: centerPosition.x + stackIndex * 2,
            y: centerPosition.y + stackIndex * 2,
          };
        }
      });

      // Start animation
      animateNodes(feature.nodeIds, startPositions, endPositions, () => {
        // Animation complete - update final state
        setNodes((prevNodes) =>
          prevNodes.map((node) => {
            if (feature.nodeIds.includes(node.id)) {
              return {
                ...node,
                selected: false, // Clear selection when collapsed
                draggable: false, // Disable dragging when collapsed
                data: {
                  ...node.data,
                  isCollapsed: true,
                  collapsedCenterPosition: centerPosition,
                },
              };
            }
            return node;
          }),
        );

        // Clear the collapsing flag
        isCollapsingRef.current = false;
      });

      // Update feature state
      updateFeature(featureId, {
        isCollapsed: true,
        collapsedCenterPosition: centerPosition,
      });

      toast({
        title: "Feature collapsed",
        description: `Feature "${feature.name}" has been collapsed.`,
      });
    },
    [
      features,
      calculateCenterPosition,
      preserveOriginalPositions,
      nodes,
      animateNodes,
      setNodes,
      updateFeature,
      toast,
    ],
  );

  // Expand feature nodes to their original positions
  const expandFeature = useCallback(
    (featureId: string) => {
      const feature = features.find((f) => f.id === featureId);
      if (!feature) return;

      // Get current and target positions
      const startPositions: { [key: string]: { x: number; y: number } } = {};
      const endPositions: { [key: string]: { x: number; y: number } } = {};

      feature.nodeIds.forEach((nodeId) => {
        const node = nodes.find((n) => n.id === nodeId);
        if (node) {
          startPositions[nodeId] = { ...node.position };
          const originalPosition =
            (node.data as any)?.originalPosition || node.position;
          endPositions[nodeId] = originalPosition;
        }
      });

      // Start animation
      animateNodes(feature.nodeIds, startPositions, endPositions, () => {
        // Animation complete - update final state
        setNodes((prevNodes) =>
          prevNodes.map((node) => {
            if (feature.nodeIds.includes(node.id)) {
              return {
                ...node,
                draggable: true, // Re-enable dragging when expanded
                data: {
                  ...node.data,
                  isCollapsed: false,
                  collapsedCenterPosition: undefined,
                },
              };
            }
            return node;
          }),
        );
      });

      // Update feature state
      updateFeature(featureId, {
        isCollapsed: false,
        collapsedCenterPosition: undefined,
      });

      toast({
        title: "Feature expanded",
        description: `Feature "${feature.name}" has been expanded.`,
      });
    },
    [features, nodes, animateNodes, setNodes, updateFeature, toast],
  );

  // Immediate expand (for interactions during collapsed state)
  const expandFeatureImmediate = useCallback(
    (featureId: string) => {
      const feature = features.find((f) => f.id === featureId);
      if (!feature) return;

      // Cancel any ongoing animation
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }

      // Immediately move nodes to their original positions
      setNodes((prevNodes) =>
        prevNodes.map((node) => {
          if (feature.nodeIds.includes(node.id)) {
            const originalPosition =
              (node.data as any)?.originalPosition || node.position;
            return {
              ...node,
              position: originalPosition,
              draggable: true, // Re-enable dragging when expanded
              data: {
                ...node.data,
                isCollapsed: false,
                collapsedCenterPosition: undefined,
              },
            };
          }
          return node;
        }),
      );

      // Update feature state
      updateFeature(featureId, {
        isCollapsed: false,
        collapsedCenterPosition: undefined,
      });
    },
    [features, setNodes, updateFeature],
  );

  // Toggle collapse/expand state
  const toggleFeatureCollapse = useCallback(
    (featureId: string) => {
      const feature = features.find((f) => f.id === featureId);
      if (!feature) return;

      if ((feature as any).isCollapsed) {
        expandFeature(featureId);
      } else {
        collapseFeature(featureId);
      }
    },
    [features, collapseFeature, expandFeature],
  );

  // Handle click on collapsed node to expand feature
  const handleCollapsedNodeClick = useCallback(
    (nodeId: string) => {
      const feature = features.find((f) => f.nodeIds.includes(nodeId));
      if (feature && (feature as any).isCollapsed) {
        expandFeature(feature.id);
        return true; // Indicate that the click was handled
      }
      return false; // Click was not handled
    },
    [features, expandFeature],
  );

  return {
    collapseFeature,
    expandFeature,
    expandFeatureImmediate,
    toggleFeatureCollapse,
    handleCollapsedNodeClick,
    isCollapsing: () => isCollapsingRef.current,
  };
};
