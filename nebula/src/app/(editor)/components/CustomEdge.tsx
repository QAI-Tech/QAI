// @ts-nocheck
import React, { memo, useState, useRef, useEffect, useCallback } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  EdgeProps,
  useReactFlow,
  MarkerType,
} from "@xyflow/react";
import { X, Check, AlertTriangle, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatEdgeDescription } from "../services/edgeDescriptionFormatManager";

const CustomEdge = memo(
  ({
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    sourceHandle,
    targetHandle,
    data,
    markerEnd,
    selected,
    style,
  }: EdgeProps) => {
    const { setEdges } = useReactFlow();
    const { toast } = useToast();
    const [isEditing, setIsEditing] = useState(
      (data as any)?.isNewEdge || false,
    );
    const [editValue, setEditValue] = useState(
      (data as any)?.description || "",
    );
    const [isDraggingCurve, setIsDraggingCurve] = useState(false);
    const [isFormattingDescription, setIsFormattingDescription] =
      useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const formatClickRef = useRef(false);

    // Sync with sidebar changes
    useEffect(() => {
      setEditValue((data as any)?.description || "");
    }, [(data as any)?.description]);

    // Track formatting completion
    useEffect(() => {
      if (isFormattingDescription && (data as any)?.description) {
        const currentDescription = (data as any)?.description;
        if (currentDescription !== editValue && currentDescription.trim()) {
          setIsFormattingDescription(false);
          setEditValue(currentDescription);
        }
      }
    }, [(data as any)?.description, editValue, isFormattingDescription]);

    // Clear formatting state after timeout to handle errors
    useEffect(() => {
      if (isFormattingDescription) {
        const timer = setTimeout(() => {
          setIsFormattingDescription(false);
        }, 30000); // 30 second timeout
        return () => clearTimeout(timer);
      }
    }, [isFormattingDescription]);

    const isNewEdge = (data as any)?.isNewEdge;
    const hasDescription =
      (data as any)?.description &&
      (data as any)?.description.trim().length > 0;

    // Effect to dispatch edit start event for new edges
    useEffect(() => {
      if (isNewEdge && isEditing) {
        window.dispatchEvent(
          new CustomEvent("inlineEdgeEditStart", {
            detail: { edgeId: id },
          }),
        );
      }
    }, [isNewEdge, isEditing, id]);

    // Get curvature from edge data, default to 0
    const curvature = (data as any)?.curvature || 0;

    // Calculate the basic bezier path first
    const [basePath, baseLabelX, baseLabelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });

    // Calculate custom curve if curvature is applied
    let edgePath = basePath;
    let finalLabelX = baseLabelX;
    let finalLabelY = baseLabelY;

    if (curvature !== 0) {
      // Calculate midpoint
      const midX = (sourceX + targetX) / 2;
      const midY = (sourceY + targetY) / 2;

      // Calculate perpendicular offset for curvature
      const dx = targetX - sourceX;
      const dy = targetY - sourceY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Perpendicular vector (normalized)
      const perpX = -dy / distance;
      const perpY = dx / distance;

      // Apply curvature offset to get control point
      const controlX = midX + perpX * curvature;
      const controlY = midY + perpY * curvature;

      // Create custom bezier path with control point
      edgePath = `M ${sourceX} ${sourceY} Q ${controlX} ${controlY} ${targetX} ${targetY}`;

      // Calculate the actual point on the curve at t=0.5 (middle) for label positioning
      // For quadratic Bezier: B(t) = (1-t)²*P0 + 2*(1-t)*t*P1 + t²*P2
      // At t=0.5: B(0.5) = 0.25*P0 + 0.5*P1 + 0.25*P2
      finalLabelX = 0.25 * sourceX + 0.5 * controlX + 0.25 * targetX;
      finalLabelY = 0.25 * sourceY + 0.5 * controlY + 0.25 * targetY;
    }

    const handleDelete = () => {
      setEdges((edges) => edges.filter((edge) => edge.id !== id));
    };

    const handleAutoDeleteEdge = useCallback(() => {
      setEdges((edges) => edges.filter((edge) => edge.id !== id));

      // Emit collaboration event for edge deletion
      import("../types/collaborationEvents").then(
        ({ ConsoleCollaborationEvents }) => {
          // Use existing singleton instance - should already be connected to correct room
          const collaborationEvents = new ConsoleCollaborationEvents();
          const edgeData = {
            description: (data as any)?.description || "",
            source: source,
            target: target,
          };
          collaborationEvents.deleteEdge(
            id,
            source,
            target,
            sourceHandle,
            targetHandle,
            edgeData as any,
            "USER_ID",
          );
        },
      );

      toast({
        title: "Transition Deleted",
        description:
          "Transition was automatically deleted because it had no description.",
        variant: "destructive",
      });
      // Dispatch event to notify that editing ended
      window.dispatchEvent(
        new CustomEvent("inlineEdgeEditEnd", {
          detail: { edgeId: id },
        }),
      );
    }, [setEdges, id, data, toast]);

    const handleFormatDescription = useCallback(() => {
      formatClickRef.current = false;
      const trimmedValue = editValue.trim();

      if (!trimmedValue) {
        toast({
          title: "Add description",
          description: "Enter a description before requesting formatting.",
          variant: "destructive",
        });
        return;
      }

      setIsFormattingDescription(true);
      const enqueued = formatEdgeDescription(id, trimmedValue);
      if (!enqueued) {
        toast({
          title: "Formatting queued",
          description:
            "We'll format this description as soon as the formatter is ready.",
        });
      }
    }, [editValue, id, toast]);

    const handleSaveEdit = useCallback(() => {
      const trimmedValue = editValue.trim();

      // If description is empty, delete the edge
      if (!trimmedValue) {
        handleAutoDeleteEdge();
        return;
      }

      // Dispatch event to save state before editing
      window.dispatchEvent(new CustomEvent("saveStateBeforeEdit"));

      const oldDescription = (data as any)?.description || "";
      const hasDescriptionChanged = oldDescription !== trimmedValue;

      const isLinearView = (data as any)?.isLinearView;

      if (isLinearView) {
        window.dispatchEvent(
          new CustomEvent("edgeDataUpdate", {
            detail: {
              edgeId: id,
              data: {
                description: trimmedValue,
                isNewEdge: false,
              },
            },
          }),
        );
      } else {
        setEdges((edges) =>
          edges.map((edge) =>
            edge.id === id
              ? {
                  ...edge,
                  data: {
                    ...edge.data,
                    description: trimmedValue,
                    isNewEdge: false,
                  },
                }
              : edge,
          ),
        );
      }

      // Check if this is a new edge and emit appropriate collaboration event
      const isNewEdge = (data as any)?.isNewEdge;

      import("../types/collaborationEvents").then(
        ({ ConsoleCollaborationEvents }) => {
          const collaborationEvents = new ConsoleCollaborationEvents();
          if (isNewEdge) {
            // Emit edge creation for new edges with description
            const edgeData = {
              description: trimmedValue,
              source: source,
              target: target,
              isNewEdge: false,
            };
            // Get handles from edge data since React Flow doesn't pass them as props to custom edges
            const currentEdgeData = data as any;
            let finalSourceHandle = currentEdgeData?.sourceHandle;
            let finalTargetHandle = currentEdgeData?.targetHandle;
            collaborationEvents.createEdge(
              id,
              source,
              target,
              finalSourceHandle,
              finalTargetHandle,
              edgeData as any,
              "USER_ID",
            );
          } else if (oldDescription !== trimmedValue) {
            // Emit edge update for existing edges with changed descriptions
            collaborationEvents.updateEdge(
              id,
              {
                description: { old: oldDescription, new: trimmedValue },
              },
              "USER_ID",
            );
          }
        },
      );

      setIsEditing(false);

      // Auto-format the description if it changed and auto-format is enabled
      const autoFormatEnabled = (data as any)?.autoFormatEnabled ?? false;
      if (autoFormatEnabled && hasDescriptionChanged && trimmedValue) {
        setIsFormattingDescription(true);
        const enqueued = formatEdgeDescription(id, trimmedValue);
        if (!enqueued) {
          // Silently queue - no toast needed for auto-format
          console.log(
            "[CustomEdge] Description formatting queued for edge:",
            id,
          );
        }
      }

      // Dispatch event to notify GraphEditor
      window.dispatchEvent(
        new CustomEvent("inlineEdgeEditEnd", {
          detail: { edgeId: id },
        }),
      );
    }, [
      setEdges,
      id,
      editValue,
      toast,
      handleAutoDeleteEdge,
      data,
      source,
      target,
    ]);

    const handleStartEdit = () => {
      setIsEditing(true);
      setEditValue((data as any)?.description || "");

      // Dispatch event to notify GraphEditor
      window.dispatchEvent(
        new CustomEvent("inlineEdgeEditStart", {
          detail: { edgeId: id },
        }),
      );
    };

    const handleCancelEdit = () => {
      // If it's a new edge without description and not selected, delete it
      if (isNewEdge && !hasDescription && !selected) {
        handleAutoDeleteEdge();
        return;
      }

      setIsEditing(false);
      setEditValue((data as any)?.description || "");

      // Dispatch event to notify GraphEditor
      window.dispatchEvent(
        new CustomEvent("inlineEdgeEditEnd", {
          detail: { edgeId: id },
        }),
      );
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSaveEdit();
      } else if (e.key === "Escape") {
        handleCancelEdit();
      } else if (e.key === "Backspace") {
        // Prevent the global backspace handler from deleting the edge
        e.stopPropagation();
      }
    };

    useEffect(() => {
      if (isEditing && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, [isEditing]);

    // Curve dragging handlers
    const handleCurveMouseDown = useCallback(
      (e: React.MouseEvent) => {
        if (isEditing) return;

        e.preventDefault();
        e.stopPropagation();
        setIsDraggingCurve(true);

        // Dispatch event to save state before editing
        window.dispatchEvent(new CustomEvent("saveStateBeforeEdit"));

        const startMouseX = e.clientX;
        const startMouseY = e.clientY;
        const startCurvature = curvature;

        // Calculate perpendicular vectors for this edge
        const dx = targetX - sourceX;
        const dy = targetY - sourceY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const perpX = -dy / distance;
        const perpY = dx / distance;

        let finalCurvature = startCurvature;

        const handleMouseMove = (moveEvent: MouseEvent) => {
          const deltaX = moveEvent.clientX - startMouseX;
          const deltaY = moveEvent.clientY - startMouseY;

          // Calculate perpendicular distance for curvature (fix direction)
          const perpDelta = deltaX * perpX + deltaY * perpY;
          const newCurvature = Math.max(
            -1000,
            Math.min(1000, startCurvature + perpDelta),
          );

          finalCurvature = newCurvature;

          setEdges((edges) =>
            edges.map((edge) =>
              edge.id === id
                ? { ...edge, data: { ...edge.data, curvature: newCurvature } }
                : edge,
            ),
          );
        };

        const handleMouseUp = () => {
          setIsDraggingCurve(false);
          document.removeEventListener("mousemove", handleMouseMove);
          document.removeEventListener("mouseup", handleMouseUp);

          // Emit collaboration event for curvature change if it actually changed
          if (finalCurvature !== startCurvature) {
            import("../types/collaborationEvents").then(
              ({ ConsoleCollaborationEvents }) => {
                const collaborationEvents = new ConsoleCollaborationEvents();
                collaborationEvents.updateEdge(
                  id,
                  {
                    curvature: { old: startCurvature, new: finalCurvature },
                  },
                  "USER_ID",
                );
              },
            );
          }
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
      },
      [isEditing, curvature, sourceX, sourceY, targetX, targetY, setEdges, id],
    );

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          isEditing &&
          inputRef.current &&
          !inputRef.current.contains(event.target as Node)
        ) {
          // Check if format button was clicked
          if (formatClickRef.current) {
            formatClickRef.current = false;
            return;
          }

          const trimmedValue = editValue.trim();

          // If description is empty and edge is not selected, delete the edge
          // Don't auto-delete if the edge is selected (being edited in sidebar)
          if (!trimmedValue && !selected) {
            handleAutoDeleteEdge();
            return;
          }

          handleSaveEdit();
        }
      };

      if (isEditing) {
        document.addEventListener("mousedown", handleClickOutside);
      }

      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, [isEditing, handleSaveEdit, editValue, handleAutoDeleteEdge, selected]);

    return (
      <>
        <BaseEdge
          path={edgePath}
          markerEnd={markerEnd}
          style={{
            // If this edge is flashing, use the flash styles directly
            ...((style as any)?.isFlashing
              ? {
                  stroke: (style as any).stroke,
                  strokeWidth: (style as any).strokeWidth,
                  opacity: (style as any).opacity,
                  animation: (style as any).animation,
                }
              : {
                  stroke:
                    (style as any)?.stroke ||
                    (selected ? "#ef4444" : "#6b7280"),
                  strokeWidth:
                    (style as any)?.strokeWidth || (selected ? 3 : 2),
                  opacity: (style as any)?.opacity ?? 1,
                  animation: (style as any)?.animation,
                }),
          }}
        />
        <EdgeLabelRenderer>
          <div
            className={`absolute text-xs bg-white px-2 py-1 rounded shadow-sm border pointer-events-auto transform -translate-x-1/2 -translate-y-1/2 ${
              selected ? "border-red-500 bg-red-50" : "border-gray-300"
            } ${isDraggingCurve ? "cursor-grabbing" : "cursor-grab"}`}
            title={id}
            style={{
              transform: `translate(-50%, -50%) translate(${finalLabelX}px, ${finalLabelY}px)`,
            }}
            onMouseDown={handleCurveMouseDown}
          >
            {(style as any)?.showExclamationIcon && (
              <div className="absolute -top-1 -left-1">
                <div className="w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-2.5 h-2.5 text-white" />
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              {isEditing ? (
                <div className="flex items-start gap-1">
                  <textarea
                    ref={inputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-48 px-1 py-0.5 text-lg border border-gray-300 rounded focus:outline-none focus:border-blue-500 resize-none min-h-[4rem] leading-tight"
                    rows={3}
                    placeholder="Description is mandatory"
                  />
                  <div className="flex flex-col gap-1">
                    <button
                      onMouseDown={() => {
                        formatClickRef.current = true;
                      }}
                      onClick={handleFormatDescription}
                      disabled={isFormattingDescription || !editValue.trim()}
                      className="w-4 h-4 rounded-full bg-purple-500 text-white flex items-center justify-center hover:bg-purple-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                      title={
                        isFormattingDescription
                          ? "Formatting..."
                          : "Auto format description"
                      }
                    >
                      <Wand2 className="w-2 h-2" />
                    </button>
                  </div>
                </div>
              ) : (
                <span
                  className={`max-w-48 cursor-pointer hover:text-blue-600 line-clamp-4 leading-tight text-lg ${
                    hasDescription ? "text-gray-700" : "text-red-500 italic"
                  }`}
                  onClick={handleStartEdit}
                  title="Click to edit"
                >
                  {hasDescription
                    ? (data as any)?.description
                    : "No description - click to add"}
                </span>
              )}
              {selected && !isEditing && (
                <button
                  onClick={handleDelete}
                  className="w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                >
                  <X className="w-2 h-2" />
                </button>
              )}
            </div>
          </div>
        </EdgeLabelRenderer>
      </>
    );
  },
);

CustomEdge.displayName = "CustomEdge";

export default CustomEdge;
