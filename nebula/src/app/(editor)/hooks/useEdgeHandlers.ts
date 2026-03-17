// @ts-nocheck
import { useCallback } from "react";
import { Node, Edge, Connection, MarkerType } from "@xyflow/react";
import { useToast } from "@/hooks/use-toast";
import { generateEdgeId } from "@/app/(editor)/utils/idGenerator";
import { useProductSwitcher } from "@/providers/product-provider";
import { EdgeHandlerProps } from "../types/graphHandlers";
import { getClosestConnectionHandles } from "../utils/edgeUtils";

export const useEdgeHandlers = ({
  nodes,
  edges,
  setEdges,
  mode,
  setMode,
  edgeSource,
  setEdgeSource,
  edgeCounter,
  setEdgeCounter,
  undoRedo,
  setSelectedEdge,
}: EdgeHandlerProps) => {
  const { toast } = useToast();
  const { productSwitcher } = useProductSwitcher();

  const handleEdgeNodeClick = useCallback(
    (node: Node) => {
      // Only allow edge creation to/from customNodes
      if (node.type !== "customNode") {
        toast({
          title: "Invalid connection",
          description: "Transitions can only be created between screen nodes.",
          variant: "destructive",
        });
        return;
      }

      if (!edgeSource) {
        setEdgeSource(node.id);
        toast({
          title: "Source selected",
          description: "Now click on the destination screen.",
        });
      } else if (edgeSource !== node.id) {
        // Check if edge already exists in this direction
        const existingEdge = edges.find(
          (edge) => edge.source === edgeSource && edge.target === node.id,
        );

        if (existingEdge) {
          setEdgeSource(null);
          setMode("select");
          toast({
            title: "Transition already exists",
            description:
              "A transition from this source to this target already exists.",
            variant: "destructive",
          });
          return;
        }

        // Create edge immediately with default description, then prompt for editing
        const sourceNode = nodes.find((n) => n.id === edgeSource);
        const targetNode = node;

        if (sourceNode && targetNode) {
          undoRedo.saveState(); // Save state before creating edge

          const { sourceHandle, targetHandle } = getClosestConnectionHandles(
            sourceNode,
            targetNode,
          );

          const newEdge: Edge = {
            id: generateEdgeId(undefined, productSwitcher.product_id),
            source: edgeSource,
            target: node.id,
            sourceHandle,
            targetHandle,
            type: "customEdge",
            data: {
              description: "",
              business_logic: "",
              curvature: 0,
              source: edgeSource,
              target: node.id,
              isNewEdge: true,
              autoFormatEnabled: false,
              // Store handles in both formats for compatibility
              source_anchor: sourceHandle,
              target_anchor: targetHandle,
              sourceHandle,
              targetHandle,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
            },
          } as Edge;

          setEdges((eds) => [...eds, newEdge]);
          setEdgeCounter((c) => c + 1);
          setEdgeSource(null);
          setMode("select");

          // Automatically select the newly created edge to show the edge table
          setSelectedEdge(newEdge);

          toast({
            title: "Transition created",
            description:
              "Enter a description or the transition will be deleted.",
          });
        }
      } else {
        setEdgeSource(null);
        setMode("select");
        toast({
          title: "Invalid selection",
          description: "Please select a different destination screen.",
          variant: "destructive",
        });
      }
    },
    [
      edgeSource,
      edgeCounter,
      nodes,
      edges,
      setEdges,
      setEdgeSource,
      setMode,
      setEdgeCounter,
      toast,
      undoRedo,
    ],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (mode === "select") {
        const sourceNode = nodes.find((n) => n.id === params.source);
        const targetNode = nodes.find((n) => n.id === params.target);

        // Only allow connections between customNodes
        if (
          sourceNode?.type !== "customNode" ||
          targetNode?.type !== "customNode"
        ) {
          toast({
            title: "Invalid connection",
            description:
              "Transitions can only be created between screen nodes.",
            variant: "destructive",
          });
          return;
        }

        // Check if edge already exists in this direction
        const existingEdge = edges.find(
          (edge) =>
            edge.source === params.source && edge.target === params.target,
        );

        if (existingEdge) {
          toast({
            title: "Transition already exists",
            description:
              "A transition from this source to this target already exists.",
            variant: "destructive",
          });
          return;
        }

        if (sourceNode && targetNode) {
          undoRedo.saveState(); // Save state before creating edge

          const newEdge: Edge = {
            ...params,
            id: generateEdgeId(undefined, productSwitcher.product_id),
            type: "customEdge",
            data: {
              description: "",
              source: params.source,
              target: params.target,
              isNewEdge: true,
              autoFormatEnabled: false,
              // Store handles in both formats for compatibility
              source_anchor: params.sourceHandle,
              target_anchor: params.targetHandle,
              sourceHandle: params.sourceHandle,
              targetHandle: params.targetHandle,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
            },
          } as Edge;

          setEdges((eds) => [...eds, newEdge]);
          setEdgeCounter((c) => c + 1);

          // Automatically select the newly created edge to show the edge table
          setSelectedEdge(newEdge);

          toast({
            title: "Transition created",
            description:
              "Enter a description or the transition will be deleted.",
          });
        }
      }
    },
    [
      mode,
      edges,
      nodes,
      edgeCounter,
      setEdges,
      setEdgeCounter,
      toast,
      undoRedo,
      productSwitcher.product_id,
    ],
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (mode === "select") {
        // Check if the new connection would create a duplicate
        const existingEdge = edges.find(
          (edge) =>
            edge.id !== oldEdge.id &&
            edge.source === newConnection.source &&
            edge.target === newConnection.target &&
            edge.sourceHandle === newConnection.sourceHandle &&
            edge.targetHandle === newConnection.targetHandle,
        );

        if (existingEdge) {
          toast({
            title: "Transition already exists",
            description:
              "A transition with this exact connection already exists.",
            variant: "destructive",
          });
          return;
        }

        const sourceNode = nodes.find((n) => n.id === newConnection.source);
        const targetNode = nodes.find((n) => n.id === newConnection.target);

        if (sourceNode && targetNode) {
          undoRedo.saveState(); // Save state before reconnecting edge

          const updatedEdge: Edge = {
            ...oldEdge,
            source: newConnection.source,
            target: newConnection.target,
            sourceHandle: newConnection.sourceHandle,
            targetHandle: newConnection.targetHandle,
            data: {
              ...oldEdge.data,
              source: newConnection.source,
              target: newConnection.target,
              curvature: 0, // Reset curvature when reconnecting
              // Update both the data anchors and keep handles in data for consumers
              source_anchor: newConnection.sourceHandle,
              target_anchor: newConnection.targetHandle,
              sourceHandle: newConnection.sourceHandle,
              targetHandle: newConnection.targetHandle,
            },
          };

          setEdges((eds) =>
            eds.map((edge) => (edge.id === oldEdge.id ? updatedEdge : edge)),
          );

          // Emit collaboration event for anchor change
          import("../types/collaborationEvents").then(
            ({ ConsoleCollaborationEvents }) => {
              // Use existing singleton or initialize with product ID
              const collaborationEvents =
                ConsoleCollaborationEvents.initializeForProduct(
                  productSwitcher.product_id || "",
                );

              collaborationEvents.updateEdge(
                oldEdge.id,
                {
                  anchors: {
                    oldSourceNodeId: oldEdge.source,
                    newSourceNodeId: updatedEdge.source,
                    oldTargetNodeId: oldEdge.target,
                    newTargetNodeId: updatedEdge.target,
                    oldSourceHandle: oldEdge.sourceHandle,
                    newSourceHandle: updatedEdge.sourceHandle,
                    oldTargetHandle: oldEdge.targetHandle,
                    newTargetHandle: updatedEdge.targetHandle,
                  },
                },
                "USER_ID",
              );
            },
          );
        }
      }
    },
    [mode, edges, nodes, setEdges, toast, undoRedo],
  );

  return {
    handleEdgeNodeClick,
    onConnect,
    onReconnect,
  };
};
