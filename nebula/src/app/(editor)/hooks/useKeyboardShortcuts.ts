// @ts-nocheck
import { useEffect, useCallback, useState } from "react";
import { Node, Edge } from "@xyflow/react";
import { useToast } from "@/hooks/use-toast";
import {
  generateNodeId,
  generateEdgeId,
} from "@/app/(editor)/utils/idGenerator";
import { useProductSwitcher } from "@/providers/product-provider";

interface UseKeyboardShortcutsProps {
  nodes: Node[];
  edges: Edge[];
  setNodes: (updater: (nodes: Node[]) => Node[]) => void;
  setEdges: (updater: (edges: Edge[]) => Edge[]) => void;
  addNewNodes: (nodes: Node[]) => void;
  nodeCounter: number;
  setNodeCounter: (updater: (count: number) => number) => void;
  cursorPosition: { x: number; y: number };
  editingNode: any;
  editingEdge: any;
  inlineEditingEdges: Set<string>;
  undo: () => void;
  redo: () => void;
  saveState: () => void;
  onDelete: (selectedNodes: Node[], selectedEdges: Edge[]) => void;
  getViewport: () => { x: number; y: number; zoom: number };
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  // Flow navigation props
  flows?: Array<{ id: string; name: string; pathNodeIds: string[] }>;
  selectedFlowId?: string | null;
  selectFlow?: (flowId: string | null) => void;
  // Comment management props
  commentManagement?: {
    createComment: (content: string) => any;
  };
  // Collaboration events for edge creation
  collaborationEvents?: any;
}

export const useKeyboardShortcuts = ({
  nodes,
  edges,
  setNodes,
  setEdges,
  addNewNodes,
  nodeCounter,
  setNodeCounter,
  cursorPosition,
  editingNode,
  editingEdge,
  inlineEditingEdges,
  undo,
  redo,
  saveState,
  onDelete,
  getViewport,
  setViewport,
  flows,
  selectedFlowId,
  selectFlow,
  commentManagement,
  collaborationEvents,
}: UseKeyboardShortcutsProps) => {
  const [copiedData, setCopiedData] = useState<{
    nodes: Node[];
    edges: Edge[];
  } | null>(null);
  const { toast } = useToast();
  const { productSwitcher } = useProductSwitcher();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Skip all keyboard shortcuts if edit dialog is open OR any edge is being edited inline OR any input field is focused
      const activeElement = document.activeElement;
      const isInputFocused =
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          (activeElement as HTMLElement).contentEditable === "true");

      if (
        editingNode ||
        editingEdge ||
        inlineEditingEdges.size > 0 ||
        isInputFocused
      ) {
        return;
      }

      // Undo (Ctrl+Z)
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "z" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        undo();
        return;
      }

      // Redo (Ctrl+Shift+Z or Ctrl+Y)
      if (
        (event.ctrlKey || event.metaKey) &&
        ((event.key === "z" && event.shiftKey) || event.key === "y")
      ) {
        event.preventDefault();
        redo();
        return;
      }

      // Delete key
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        const selectedNodes = nodes.filter((node) => node.selected);
        const selectedEdges = edges.filter((edge) => edge.selected);

        if (selectedNodes.length > 0 || selectedEdges.length > 0) {
          onDelete(selectedNodes, selectedEdges);
        }
        return;
      }

      // Arrow keys for flow navigation or canvas panning - DISABLED
      // if (
      //   ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      // ) {
      //   // If a flow is selected, use up/down arrows for flow navigation
      //   if (
      //     selectedFlowId &&
      //     flows &&
      //     selectFlow &&
      //     (event.key === "ArrowUp" || event.key === "ArrowDown")
      //   ) {
      //     event.preventDefault();

      //     const currentIndex = flows.findIndex(
      //       (flow) => flow.id === selectedFlowId,
      //     );
      //     if (currentIndex !== -1) {
      //       let newIndex;
      //       if (event.key === "ArrowUp") {
      //         newIndex = currentIndex > 0 ? currentIndex - 1 : flows.length - 1;
      //       } else {
      //         newIndex = currentIndex < flows.length - 1 ? currentIndex + 1 : 0;
      //       }
      //       selectFlow(flows[newIndex].id);
      //     }
      //     return;
      //   }

      //   // Canvas panning (only when no flow is selected or using left/right arrows)
      //   event.preventDefault();
      //   const viewport = getViewport();
      //   const panAmount = event.shiftKey ? 50 : 20; // Hold shift for faster panning

      //   let deltaX = 0;
      //   let deltaY = 0;

      //   if (event.key === "ArrowLeft") deltaX = panAmount;
      //   if (event.key === "ArrowRight") deltaX = -panAmount;
      //   if (event.key === "ArrowUp") deltaY = panAmount;
      //   if (event.key === "ArrowDown") deltaY = -panAmount;

      //   setViewport({
      //     x: viewport.x + deltaX,
      //     y: viewport.y + deltaY,
      //     zoom: viewport.zoom,
      //   });
      //   return;
      // }

      // Copy nodes and edges (Ctrl+C)
      if ((event.ctrlKey || event.metaKey) && event.key === "c") {
        const selectedNodes = nodes.filter((node) => node.selected);
        if (selectedNodes.length >= 1) {
          // Find edges that connect the selected nodes
          const selectedNodeIds = new Set(selectedNodes.map((node) => node.id));
          const connectedEdges = edges.filter(
            (edge) =>
              selectedNodeIds.has(edge.source) &&
              selectedNodeIds.has(edge.target),
          );

          const dataToCopy = { nodes: selectedNodes, edges: connectedEdges };
          setCopiedData(dataToCopy);

          // Write serialized data to system clipboard for cross-tab/window support
          try {
            navigator.clipboard.writeText(
              JSON.stringify({ nebulaGraphCopy: dataToCopy }),
            );
          } catch (e) {
            // Fallback if clipboard API is not available
          }

          toast({
            title: `${selectedNodes.length} Screen(s) copied`,
            description: `${selectedNodes.length} screen(s) and ${connectedEdges.length} transition(s) copied to clipboard. Press Ctrl+V to paste.`,
          });
        } else {
          toast({
            title: "No screens selected",
            description: "Please select one or more screens to copy.",
            variant: "destructive",
          });
        }
        return;
      }

      // Paste nodes and edges (Ctrl+V) - prioritize image pasting
      if ((event.ctrlKey || event.metaKey) && event.key === "v") {
        // Check clipboard for images first
        navigator.clipboard
          .read()
          .then((clipboardItems) => {
            const hasImage = clipboardItems.some((item) =>
              item.types.some((type) => type.startsWith("image/")),
            );
            if (hasImage) {
              setCopiedData(null); // Let useClipboard handle image pasting
              event.preventDefault(); // Prevent any further paste handling
              return; // Do NOT paste nodes/edges if image is present
            }
            // If no image, try to read JSON from clipboard
            navigator.clipboard.readText().then((text) => {
              let parsed: any = null;
              try {
                parsed = JSON.parse(text);
              } catch {
                parsed = null;
              }
              const graphData = parsed?.nebulaGraphCopy;
              if (graphData && graphData.nodes && graphData.edges) {
                event.preventDefault();
                saveState();
                const maxZIndex = Math.max(
                  0,
                  ...nodes.map((node) => node.zIndex || 0),
                );
                const minX = Math.min(
                  ...graphData.nodes.map((node: Node) => node.position.x),
                );
                const minY = Math.min(
                  ...graphData.nodes.map((node: Node) => node.position.y),
                );
                const offsetX = cursorPosition.x - minX - 75;
                const offsetY = cursorPosition.y - minY - 50;
                const nodeIdMap = new Map<string, string>();
                const newNodes: Node[] = [];
                graphData.nodes.forEach((node: Node, index: number) => {
                  if (node.type === "commentNode") {
                    const commentContent = node.data?.content || "New comment";
                    const newComment =
                      commentManagement?.createComment(commentContent);
                    if (newComment) {
                      newNodes.push({
                        ...node,
                        id: `comment-${newComment.id}`,
                        data: { ...node.data, commentId: newComment.id },
                        position: {
                          x: node.position.x + offsetX,
                          y: node.position.y + offsetY,
                        },
                        zIndex: maxZIndex + 1 + index,
                        selected: false,
                      });
                    }
                  } else {
                    const newNodeId = generateNodeId(
                      undefined,
                      productSwitcher.product_id,
                    );
                    nodeIdMap.set(node.id, newNodeId);
                    newNodes.push({
                      ...node,
                      id: newNodeId,
                      position: {
                        x: node.position.x + offsetX,
                        y: node.position.y + offsetY,
                      },
                      zIndex: maxZIndex + 1 + index,
                      selected: false,
                    });
                  }
                });
                const newEdges: Edge[] = graphData.edges.map((edge: Edge) => ({
                  ...edge,
                  id: generateEdgeId(undefined, productSwitcher.product_id),
                  source: nodeIdMap.get(edge.source) || edge.source,
                  target: nodeIdMap.get(edge.target) || edge.target,
                  selected: false,
                  data: {
                    ...edge.data,
                    source: nodeIdMap.get(edge.source) || edge.source,
                    target: nodeIdMap.get(edge.target) || edge.target,
                  },
                }));

                // Use addNewNodes for proper collaboration event emission
                addNewNodes(newNodes);
                setEdges((eds) => [...eds, ...newEdges]);

                // Emit collaboration events for edges
                if (collaborationEvents && newEdges.length > 0) {
                  const collaborationEdges = newEdges.map((edge) => ({
                    edgeId: edge.id,
                    sourceNodeId: edge.source,
                    targetNodeId: edge.target,
                    sourceHandle: edge.sourceHandle,
                    targetHandle: edge.targetHandle,
                    data: edge.data,
                  }));
                  collaborationEvents.createEdges(collaborationEdges);
                }

                setNodeCounter((c) => c + graphData.nodes.length);
                toast({
                  title: `${newNodes.length} Screen(s) pasted`,
                  description: `${newNodes.length} screen(s) and ${newEdges.length} transition(s) pasted.`,
                });
              }
            });
          })
          .catch(() => {
            // Fallback for browsers that don't support clipboard.read()
            navigator.clipboard.readText().then((text) => {
              let parsed: any = null;
              try {
                parsed = JSON.parse(text);
              } catch {
                parsed = null;
              }
              const graphData = parsed?.nebulaGraphCopy;
              if (graphData && graphData.nodes && graphData.edges) {
                event.preventDefault();
                saveState();
                const maxZIndex = Math.max(
                  0,
                  ...nodes.map((node) => node.zIndex || 0),
                );
                const minX = Math.min(
                  ...graphData.nodes.map((node: Node) => node.position.x),
                );
                const minY = Math.min(
                  ...graphData.nodes.map((node: Node) => node.position.y),
                );
                const offsetX = cursorPosition.x - minX - 75;
                const offsetY = cursorPosition.y - minY - 50;
                const nodeIdMap = new Map<string, string>();
                const newNodes: Node[] = [];
                graphData.nodes.forEach((node: Node, index: number) => {
                  if (node.type === "commentNode") {
                    const commentContent = node.data?.content || "New comment";
                    const newComment =
                      commentManagement?.createComment(commentContent);
                    if (newComment) {
                      newNodes.push({
                        ...node,
                        id: `comment-${newComment.id}`,
                        data: { ...node.data, commentId: newComment.id },
                        position: {
                          x: node.position.x + offsetX,
                          y: node.position.y + offsetY,
                        },
                        zIndex: maxZIndex + 1 + index,
                        selected: false,
                      });
                    }
                  } else {
                    const newNodeId = generateNodeId(
                      undefined,
                      productSwitcher.product_id,
                    );
                    nodeIdMap.set(node.id, newNodeId);
                    newNodes.push({
                      ...node,
                      id: newNodeId,
                      position: {
                        x: node.position.x + offsetX,
                        y: node.position.y + offsetY,
                      },
                      zIndex: maxZIndex + 1 + index,
                      selected: false,
                    });
                  }
                });
                const newEdges: Edge[] = graphData.edges.map((edge: Edge) => ({
                  ...edge,
                  id: generateEdgeId(undefined, productSwitcher.product_id),
                  source: nodeIdMap.get(edge.source) || edge.source,
                  target: nodeIdMap.get(edge.target) || edge.target,
                  selected: false,
                  data: {
                    ...edge.data,
                    source: nodeIdMap.get(edge.source) || edge.source,
                    target: nodeIdMap.get(edge.target) || edge.target,
                  },
                }));

                // Use addNewNodes for proper collaboration event emission
                addNewNodes(newNodes);
                setEdges((eds) => [...eds, ...newEdges]);

                // Emit collaboration events for edges
                if (collaborationEvents && newEdges.length > 0) {
                  const collaborationEdges = newEdges.map((edge) => ({
                    edgeId: edge.id,
                    sourceNodeId: edge.source,
                    targetNodeId: edge.target,
                    sourceHandle: edge.sourceHandle,
                    targetHandle: edge.targetHandle,
                    data: edge.data,
                  }));
                  collaborationEvents.createEdges(collaborationEdges);
                }

                setNodeCounter((c) => c + graphData.nodes.length);
                toast({
                  title: `${newNodes.length} Screen(s) pasted`,
                  description: `${newNodes.length} screen(s) and ${newEdges.length} transition(s) pasted.`,
                });
                // Clear clipboard after pasting nodes/edges
                // try {
                //   navigator.clipboard.writeText("");
                // } catch (e) {
                //   // Ignore clipboard clear errors
                // }
              }
            });
          });
      }
    },
    [
      editingNode,
      editingEdge,
      inlineEditingEdges,
      undo,
      redo,
      nodes,
      edges,
      copiedData,
      cursorPosition,
      nodeCounter,
      setNodes,
      setEdges,
      addNewNodes,
      setNodeCounter,
      saveState,
      onDelete,
      getViewport,
      setViewport,
      flows,
      selectedFlowId,
      selectFlow,
      toast,
      productSwitcher,
      commentManagement,
      collaborationEvents,
    ],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return { copiedData, setCopiedData };
};
