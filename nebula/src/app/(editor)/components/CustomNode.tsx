// @ts-nocheck

import React, { memo, useState, useRef, useEffect, useCallback } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "@xyflow/react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Image, Trash2, Sparkles } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { fileToCompressedJpegFile } from "@/app/(editor)/utils/imageCompressor";
import { getNodeAutoTitleManager } from "@/app/(editor)/services/nodeAutoTitleManager";
import { useToast } from "@/hooks/use-toast";
import { useProductSwitcher } from "@/providers/product-provider";

const CustomNode = memo(
  ({ data, selected, id, position, ...nodeProps }: NodeProps) => {
    const { setNodes } = useReactFlow();
    const { toast } = useToast();
    const { productSwitcher } = useProductSwitcher();
    const [isEditingText, setIsEditingText] = useState(false);
    const [editValue, setEditValue] = useState(
      (data as any)?.title || (data as any)?.description || "Untitled",
    );
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const isWebProduct = Boolean(productSwitcher?.web_url?.trim());

    // Get flow style from data
    const flowStyle = (data as any)?.flowStyle || {};
    // Used for disabling text edit in linear view, across CustomNode.tsx
    const isLinearView = (data as any)?.isLinearView;
    const isReadOnly = (data as any)?.isReadOnly ?? isLinearView;

    const mergeState = (data as any)?.mergeState || {};
    const { isDropTarget, isBeingDragged, isDragging } = mergeState;

    // Create the full node object for preview
    const fullNode = {
      id,
      data,
      selected,
      position: (nodeProps as any)?.position || { x: 0, y: 0 },
      ...nodeProps,
    };

    const handleTextEdit = useCallback(() => {
      if (isReadOnly) return;
      setIsEditingText(true);
      setEditValue(
        (data as any)?.title || (data as any)?.description || "Untitled",
      );
    }, [data]);

    const handleSaveText = useCallback(() => {
      // Persist changes
      const oldDescription = (data as any)?.description || "";
      if (oldDescription !== editValue) {
        import("../types/collaborationEvents").then(
          ({ ConsoleCollaborationEvents }) => {
            const events = new ConsoleCollaborationEvents();
            events.updateNode(
              id,
              { description: { old: oldDescription, new: editValue } },
              "USER_ID",
            );
          },
        );
      }

      if (isLinearView) {
        window.dispatchEvent(
          new CustomEvent("nodeDataUpdate", {
            detail: {
              nodeId: id,
              data: {
                description: editValue,
                title: undefined,
              },
            },
          }),
        );
      } else {
        setNodes((nodes) =>
          nodes.map((node) =>
            node.id === id
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    description: editValue,
                    // Remove title field if it exists to standardize on description
                    title: undefined,
                  },
                }
              : node,
          ),
        );
      }
      setIsEditingText(false);
    }, [setNodes, id, editValue, data]); // Added data dependency

    const handleCancelText = useCallback(() => {
      setIsEditingText(false);
      setEditValue(
        (data as any)?.title || (data as any)?.description || "Untitled",
      );
    }, [data]);

    const handleTextKeyDown = (e: React.KeyboardEvent) => {
      e.stopPropagation(); // Prevent global keyboard handlers
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSaveText();
      } else if (e.key === "Escape") {
        handleCancelText();
      }
    };

    const handleReplaceImage = () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          // Compress the image to JPEG
          const compressedFile = await fileToCompressedJpegFile(file, 0.8, 800);
          // If you want a dataURL for preview or local storage:
          const reader = new FileReader();
          reader.onload = (event) => {
            const imageUrl = event.target?.result as string;

            // Persist image change
            import("../types/collaborationEvents").then(
              ({ ConsoleCollaborationEvents }) => {
                const events = new ConsoleCollaborationEvents();
                // Assuming updateNode handles simple property updates or we need specific structure
                // Logic based on Edge update pattern. If backend expects specific "image" field or "data" delta
                // Usually updateNode(id, partialNode, userId) or (id, delta, userId)
                // updateEdge uses { description: { old, new } }.
                // I'll try similar pattern or direct value if supported.
                // Safest is likely { image: imageUrl }. If delta required: { image: { old: ..., new: ... } }
                // Given I don't see updateNode signature, I will assume it handles standard data updates
                // or I'll look at how other nodes do it.
                // Checking CustomNode again... it didn't use it.
                // I'll guess { image: { new: imageUrl } } or just { image: imageUrl }.
                // Let's use { image: imageUrl } and hope backend handles merge, or { image: { old: (data as any).image, new: imageUrl } }
                events.updateNode(
                  id,
                  {
                    image: {
                      old: (data as any)?.image,
                      new: imageUrl,
                    },
                  },
                  "USER_ID",
                );
              },
            );

            if (isLinearView) {
              window.dispatchEvent(
                new CustomEvent("nodeDataUpdate", {
                  detail: { nodeId: id, data: { image: imageUrl } },
                }),
              );
            } else {
              setNodes((nodes) =>
                nodes.map((node) =>
                  node.id === id
                    ? { ...node, data: { ...node.data, image: imageUrl } }
                    : node,
                ),
              );
            }

            // Trigger auto-title generation for the updated image
            try {
              const handleNodeUpdate = (
                nodeId: string,
                title: string,
                description: string,
              ) => {
                if (isLinearView) {
                  window.dispatchEvent(
                    new CustomEvent("nodeDataUpdate", {
                      detail: { nodeId: nodeId, data: { description: title } },
                    }),
                  );
                } else {
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
                }

                // Persist auto-generated title
                import("../types/collaborationEvents").then(
                  ({ ConsoleCollaborationEvents }) => {
                    const events = new ConsoleCollaborationEvents();
                    events.updateNode(
                      nodeId,
                      { description: title },
                      "USER_ID",
                    );
                  },
                );

                toast({
                  title: "Node updated",
                  description: `Auto-generated title: "${title}"`,
                  duration: 3000,
                });
              };

              const autoTitleManager =
                getNodeAutoTitleManager(handleNodeUpdate);
              autoTitleManager.generateTitleForNode(id, imageUrl);

              console.log(
                `[CustomNode] Triggered auto-title for node: ${id} after image replacement`,
              );
            } catch (error) {
              console.error(
                "[CustomNode] Failed to trigger auto-title generation:",
                error,
              );
            }
          };
          reader.readAsDataURL(compressedFile);

          // If you want to upload to GCP, use compressedFile with your upload logic instead!
          // Example:
          // await uploadToGCP(compressedFile);
          // set node image to resulting URL if needed.
        }
      };
      input.click();
    };

    const handleRenameWithAI = useCallback(() => {
      const nodeImage = data?.image;

      if (!nodeImage) {
        toast({
          title: "No image found",
          description:
            "Please add an image to the node before renaming with AI.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      try {
        const handleNodeUpdate = (
          nodeId: string,
          title: string,
          description: string,
        ) => {
          if (isLinearView) {
            window.dispatchEvent(
              new CustomEvent("nodeDataUpdate", {
                detail: { nodeId: nodeId, data: { description: title } },
              }),
            );
          } else {
            setNodes((nodes) =>
              nodes.map((node) =>
                node.id === nodeId
                  ? {
                      ...node,
                      data: {
                        ...node.data,
                        description: title,
                      },
                    }
                  : node,
              ),
            );
          }

          // Persist auto-generated title
          import("../types/collaborationEvents").then(
            ({ ConsoleCollaborationEvents }) => {
              const events = new ConsoleCollaborationEvents();
              events.updateNode(nodeId, { description: title }, "USER_ID");
            },
          );

          toast({
            title: "Node renamed",
            description: `AI-generated title: "${title}"`,
            duration: 3000,
          });
        };

        const autoTitleManager = getNodeAutoTitleManager(handleNodeUpdate);
        autoTitleManager.generateTitleForNode(id, nodeImage);

        toast({
          title: "Generating title...",
          description: "AI is generating a new title for this node.",
          duration: 2000,
        });

        console.log(`[CustomNode] Triggered AI rename for node: ${id}`);
      } catch (error) {
        console.error("[CustomNode] Failed to trigger AI rename:", error);
        toast({
          title: "Error",
          description: "Failed to generate AI title. Please try again.",
          variant: "destructive",
          duration: 3000,
        });
      }
    }, [data, id, setNodes, toast]);

    const handleDelete = () => {
      // Select this node first
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? { ...node, selected: true }
            : { ...node, selected: false },
        ),
      );

      // Dispatch a custom event to trigger delete functionality
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("nodeDelete", { detail: { nodeId: id } }),
        );
      }, 0);
    };

    useEffect(() => {
      if (isEditingText && textareaRef.current) {
        textareaRef.current.focus();
      }
    }, [isEditingText]);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          isEditingText &&
          textareaRef.current &&
          !textareaRef.current.contains(event.target as Node)
        ) {
          handleSaveText();
        }
      };

      if (isEditingText) {
        document.addEventListener("mousedown", handleClickOutside);
      }

      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, [isEditingText, handleSaveText]);

    return (
      <ContextMenu>
        <ContextMenuTrigger>
          <Card
            className={`${isWebProduct ? "w-56" : "w-36"} shadow-lg ${selected ? "ring-2 ring-blue-500" : ""} ${
              (data as any)?.isCollapsed ? "cursor-pointer hover:scale-105" : ""
            } hover:shadow-xl transition-shadow duration-200 ${
              isDropTarget ? "ring-2 ring-green-500" : ""
            } ${isBeingDragged ? "opacity-70" : ""}`}
            // title={id} // Temporarily removed to prevent browser tooltip
            style={{
              backgroundColor: flowStyle.backgroundColor || "white",
              animation: flowStyle.animation || "none",
              transform: (data as any)?.isCollapsed ? "scale(0.9)" : "scale(1)",
              transition:
                "transform 800ms cubic-bezier(0.25, 0.46, 0.45, 0.94), all 0.2s",
            }}
          >
            <CardContent className="p-3 text-center">
              <div className="relative">
                <div
                  className={`w-full mb-2 overflow-hidden rounded flex items-center justify-center bg-gray-100 ${
                    isWebProduct ? "aspect-video" : "h-64"
                  }`}
                >
                  <img
                    src={(data as any)?.image || ""}
                    alt="Node"
                    className={
                      isWebProduct
                        ? "w-full h-full object-contain"
                        : "max-h-full object-contain"
                    }
                    style={
                      isWebProduct ? {} : { width: "auto", height: "100%" }
                    }
                  />
                </div>
                {flowStyle.showExclamationIcon && (
                  <div className="absolute -top-1 -left-1">
                    <div className="w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
                      <AlertTriangle className="w-3 h-3 text-white" />
                    </div>
                  </div>
                )}
              </div>

              {/* Title/Description */}
              <div className="mt-2">
                {/* Show title if exists, otherwise description */}
                {((data as any)?.title || (data as any)?.description) && (
                  <div className="mb-1">
                    {isEditingText ? (
                      <textarea
                        ref={textareaRef}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleTextKeyDown}
                        className="w-full p-1 text-xs font-semibold text-gray-800 border border-gray-300 rounded resize-none leading-tight min-h-[2rem] focus:outline-none focus:border-blue-500"
                        rows={2}
                      />
                    ) : (
                      <p
                        className={`text-xs font-semibold text-gray-800 leading-tight break-words p-1 rounded min-h-[2rem] flex items-center justify-center ${
                          isReadOnly
                            ? "cursor-default"
                            : "cursor-pointer hover:bg-gray-50"
                        }`}
                        onClick={!isReadOnly ? handleTextEdit : undefined}
                        title={!isReadOnly ? "Click to edit" : undefined}
                      >
                        {(data as any)?.title ||
                          (data as any)?.description ||
                          "Untitled"}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Connection handles - bidirectional like working test node */}
              {/* Top */}
              <Handle
                type="target"
                position={Position.Top}
                id="top-target"
                className="w-3 h-3 bg-blue-500 border-2 border-white"
              />
              <Handle
                type="source"
                position={Position.Top}
                id="top-source"
                className="w-3 h-3 bg-blue-500 border-2 border-white"
                style={{ opacity: 0 }}
              />

              {/* Bottom */}
              <Handle
                type="target"
                position={Position.Bottom}
                id="bottom-target"
                className="w-3 h-3 bg-blue-500 border-2 border-white"
              />
              <Handle
                type="source"
                position={Position.Bottom}
                id="bottom-source"
                className="w-3 h-3 bg-blue-500 border-2 border-white"
                style={{ opacity: 0 }}
              />

              {/* Left */}
              <Handle
                type="target"
                position={Position.Left}
                id="left-target"
                className="w-3 h-3 bg-blue-500 border-2 border-white"
              />
              <Handle
                type="source"
                position={Position.Left}
                id="left-source"
                className="w-3 h-3 bg-blue-500 border-2 border-white"
                style={{ opacity: 0 }}
              />

              {/* Right */}
              <Handle
                type="target"
                position={Position.Right}
                id="right-target"
                className="w-3 h-3 bg-blue-500 border-2 border-white"
              />
              <Handle
                type="source"
                position={Position.Right}
                id="right-source"
                className="w-3 h-3 bg-blue-500 border-2 border-white"
                style={{ opacity: 0 }}
              />
            </CardContent>
          </Card>
        </ContextMenuTrigger>

        <ContextMenuContent>
          <ContextMenuItem onClick={handleReplaceImage} disabled={isReadOnly}>
            <Image className="w-4 h-4 mr-2" />
            Replace Image
          </ContextMenuItem>
          <ContextMenuItem onClick={handleRenameWithAI} disabled={isReadOnly}>
            <Sparkles className="w-4 h-4 mr-2" />
            Rename with AI
          </ContextMenuItem>
          <ContextMenuItem
            onClick={handleDelete}
            className="text-red-600"
            disabled={isReadOnly}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  },
);

CustomNode.displayName = "CustomNode";

export default CustomNode;
