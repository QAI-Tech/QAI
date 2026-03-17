// @ts-nocheck
import { useEffect, useCallback } from "react";
import { Node, Edge } from "@xyflow/react";
import { useToast } from "@/hooks/use-toast";
import { generateNodeId } from "@/app/(editor)/utils/idGenerator";
import { generateEdgeId } from "@/app/(editor)/utils/idGenerator";
import { useProductSwitcher } from "@/providers/product-provider";
import { getNodeAutoTitleManager } from "../services/nodeAutoTitleManager";

interface UseClipboardProps {
  cursorPosition: { x: number; y: number };
  nodeCounter: number;
  nodes: Node[];
  edges: any[];
  setNodes: (updater: (nodes: Node[]) => Node[]) => void;
  setEdges: (updater: (edges: any[]) => any[]) => void;
  addNewNodes: (nodes: Node[]) => void;
  setNodeCounter: (updater: (count: number) => number) => void;
  editingNode: any;
  editingEdge: any;
  inlineEditingEdges: Set<string>;
  saveState: () => void;
}

export const useClipboard = ({
  cursorPosition,
  nodeCounter,
  nodes,
  edges,
  setNodes,
  setEdges,
  addNewNodes,
  setNodeCounter,
  editingNode,
  editingEdge,
  inlineEditingEdges,
  saveState,
}: UseClipboardProps) => {
  const { toast } = useToast();
  const { productSwitcher } = useProductSwitcher();

  function fileToCompressedJpegDataUrl(
    file: File,
    quality = 0.8,
    maxSize = 800,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new window.Image();
        img.onload = () => {
          // Resize if needed
          let width = img.width;
          let height = img.height;
          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = Math.round((maxSize * height) / width);
              width = maxSize;
            } else {
              width = Math.round((maxSize * width) / height);
              height = maxSize;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            // Compress and output JPEG
            const jpegDataUrl = canvas.toDataURL("image/jpeg", quality);
            resolve(jpegDataUrl);
          } else {
            reject(new Error("Could not get canvas context"));
          }
        };
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      // Skip if we're in editing mode or focused on an input
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

      const clipboardItems = event.clipboardData?.items;
      if (!clipboardItems) return;

      const imageItems = Array.from(clipboardItems).filter((item) =>
        item.type.startsWith("image/"),
      );

      // Priority 1: Handle image paste
      if (imageItems.length > 0) {
        event.preventDefault();

        const imagePromises = imageItems.map((item) => {
          const file = item.getAsFile();
          if (!file)
            return Promise.reject(
              new Error("Failed to get file from clipboard"),
            );
          return fileToCompressedJpegDataUrl(file, 0.8, 800); // 80% quality, max 800px
        });

        try {
          const images = await Promise.all(imagePromises);

          // Find the highest z-index among all nodes
          const maxZIndex = Math.max(
            0,
            ...nodes.map((node) => node.zIndex || 0),
          );

          // Create nodes for all pasted images
          const newNodes = images.map((image, index) => {
            const nodePosition = {
              x: cursorPosition.x + index * 160 - 75, // Spread nodes horizontally and center
              y: cursorPosition.y - 100, // Offset for better positioning
            };

            return {
              id: generateNodeId(undefined, productSwitcher.product_id),
              type: "customNode",
              position: nodePosition,
              data: {
                image,
                description: `Pasted image ${nodeCounter + index + 1}`,
              },
              zIndex: maxZIndex + 1 + index, // Ensure pasted nodes are on top
              deletable: true,
            } as Node;
          });

          addNewNodes(newNodes);
          setNodeCounter((c) => c + images.length);

          // Trigger auto-title generation for each pasted node
          try {
            const handleNodeUpdate = (
              nodeId: string,
              title: string,
              description: string,
            ) => {
              setNodes((nodes) =>
                nodes.map((node) =>
                  node.id === nodeId
                    ? {
                        ...node,
                        data: {
                          ...node.data,
                          description: title, // Put the title into description field, discard detailed description
                        },
                      }
                    : node,
                ),
              );

              toast({
                title: "Node updated",
                description: `Auto-generated title: "${title}"`,
                duration: 3000,
              });
            };

            const autoTitleManager = getNodeAutoTitleManager(handleNodeUpdate);

            newNodes.forEach((node) => {
              const nodeData = node.data;
              if (nodeData.image) {
                console.log(
                  `[useClipboard] Triggering auto-title for pasted node: ${node.id}`,
                );
                autoTitleManager.generateTitleForNode(node.id, nodeData.image);
              }
            });
          } catch (error) {
            console.error(
              "[useClipboard] Failed to trigger auto-title generation:",
              error,
            );
          }

          toast({
            title: "Images pasted",
            description: `${images.length} image(s) have been pasted from clipboard.`,
          });
        } catch (error) {
          toast({
            title: "Paste failed",
            description: "Failed to paste images from clipboard.",
            variant: "destructive",
          });
        }
        return; // Early return to prevent node pasting
      }

      // Priority 2: Handle node paste (only if no images)
      // NOTE: Node pasting via copiedData is now handled by useKeyboardShortcuts hook
      // to prevent duplicate pasting. This hook should only handle image pasting.
      // Removed the copiedData handling to fix the duplicate node creation issue.
    },
    [
      cursorPosition,
      nodeCounter,
      nodes,
      edges,
      addNewNodes,
      setEdges,
      setNodeCounter,
      toast,
      editingNode,
      editingEdge,
      inlineEditingEdges,
      saveState,
      productSwitcher.product_id,
    ],
  );

  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("paste", handlePaste);
    };
  }, [handlePaste]);
};
