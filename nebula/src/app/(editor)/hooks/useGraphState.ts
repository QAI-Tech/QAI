// @ts-nocheck
import { useState } from "react";
import { useNodesState, useEdgesState, Node, Edge } from "@xyflow/react";

export const useGraphState = () => {
  // Editor mode state
  const [mode, setMode] = useState<
    | "select"
    | "addNode"
    | "addEdge"
    | "planFlow"
    | "addFeature"
    | "addComment"
    | "addWildcardNode"
    | "addBugNode"
  >("select");

  // Core graph state
  const [nodes, setNodes, originalOnNodesChange] = useNodesState([]);

  // Helper to check if a change should be logged
  const shouldLogNodeChange = (change: any) => change.type !== "position";

  // Handle node drag stop for position logging
  const onNodeDragStop = (event: React.MouseEvent, node: any, nodes: any[]) => {
    console.log("Node repositioned:", {
      id: node.id,
      newPosition: node.position,
      description: node.data?.description,
    });
  };

  // Wrap onNodesChange to filter out selection changes in feature mode
  const onNodesChange = (changes: any) => {
    // Log non-position changes (position changes are logged in onNodeDragStop)
    const loggableChanges = changes.filter(shouldLogNodeChange);
    if (loggableChanges.length > 0) {
      console.log(
        "onNodesChange:",
        loggableChanges.map((c: any) => ({
          type: c.type,
          id: c.id,
          ...(c.selected !== undefined && { selected: c.selected }),
        })),
      );
    }

    // Check for node data changes (description or image)
    changes.forEach((change: any) => {
      if (change.type === "replace" && change.item?.data) {
        const nodeId = change.item.id;
        const newData = change.item.data;

        // Get current node to compare changes
        const currentNode = nodes.find((n) => n.id === nodeId);
        if (currentNode) {
          // Check for description changes
          if (currentNode.data?.description !== newData.description) {
            console.log(
              "Description change detected:",
              nodeId,
              newData.description,
            );
            // Import collaboration events dynamically to avoid circular dependency
            import("../types/collaborationEvents").then(
              ({ ConsoleCollaborationEvents }) => {
                // Use static method to get singleton instance
                const collaborationEvents =
                  ConsoleCollaborationEvents.initializeForProduct("");
                collaborationEvents.updateNode(
                  nodeId,
                  {
                    description: {
                      old: currentNode.data?.description || "",
                      new: newData.description || "",
                    },
                  },
                  "USER_ID",
                );
              },
            );
          }

          // Check for image changes
          if (currentNode.data?.image !== newData.image) {
            console.log("Image change detected:", nodeId, newData.image);
            // Import collaboration events dynamically to avoid circular dependency
            import("../types/collaborationEvents").then(
              ({ ConsoleCollaborationEvents }) => {
                // Get the current product ID from the singleton instance
                const currentProductId =
                  ConsoleCollaborationEvents.getCurrentProductId();
                // Use static method to get singleton instance with current product ID
                const collaborationEvents =
                  ConsoleCollaborationEvents.initializeForProduct(
                    currentProductId || "",
                  );
                const oldImage = currentNode.data?.image || "";
                const newImage = newData.image || "";
                collaborationEvents.updateNode(
                  nodeId,
                  {
                    image: { old: oldImage, new: newImage },
                  },
                  "USER_ID",
                );
              },
            );
          }
        }
      }
    });

    // Update originalPosition when nodes are dragged
    const positionChanges = changes.filter(
      (change: any) => change.type === "position" && change.position,
    );
    if (positionChanges.length > 0) {
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          const positionChange = positionChanges.find(
            (change: any) => change.id === node.id,
          );
          if (positionChange) {
            return {
              ...node,
              data: {
                ...node.data,
                originalPosition: positionChange.position, // Set originalPosition for all nodes, even if they don't have it
              },
            };
          }
          return node;
        }),
      );
    }

    // In feature mode, ignore selection changes from ReactFlow to prevent conflicts
    if (mode === "addFeature") {
      const filteredChanges = changes.filter(
        (change: any) => change.type !== "select",
      );
      originalOnNodesChange(filteredChanges);
    } else {
      originalOnNodesChange(changes);
    }
  };

  const [edges, setEdges, originalOnEdgesChange] = useEdgesState([]);

  // Wrap onEdgesChange to emit collaboration events for edge deletions
  const onEdgesChange = (changes: any) => {
    changes.forEach((change: any) => {
      if (change.type === "remove") {
        const edgeToDelete = edges.find((e) => e.id === change.id);
        if (edgeToDelete) {
          console.log("Edge deletion detected:", edgeToDelete.id);
          // Import collaboration events dynamically to avoid circular dependency
          import("../types/collaborationEvents").then(
            ({ ConsoleCollaborationEvents }) => {
              const collaborationEvents = new ConsoleCollaborationEvents();
              const edgeData = {
                description: edgeToDelete.data?.description || "",
                source: edgeToDelete.source,
                target: edgeToDelete.target,
              };
              collaborationEvents.deleteEdge(
                edgeToDelete.id,
                edgeToDelete.source,
                edgeToDelete.target,
                edgeToDelete.sourceHandle,
                edgeToDelete.targetHandle,
                edgeData as any,
                "USER_ID",
              );
            },
          );
        }
      }
    });

    originalOnEdgesChange(changes);
  };

  // Edge creation state
  const [edgeSource, setEdgeSource] = useState<string | null>(null);
  const [edgeCounter, setEdgeCounter] = useState(0);

  // Edge selection state
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);

  // Cursor tracking
  const [cursorPosition, setCursorPosition] = useState<{
    x: number;
    y: number;
  }>({ x: 0, y: 0 });

  return {
    // Core graph state
    nodes,
    setNodes,
    onNodesChange,
    edges,
    setEdges,
    onEdgesChange,

    // Editor mode
    mode,
    setMode,

    // Edge creation
    edgeSource,
    setEdgeSource,
    edgeCounter,
    setEdgeCounter,

    // Edge selection
    selectedEdge,
    setSelectedEdge,

    // Cursor tracking
    cursorPosition,
    setCursorPosition,
  };
};
