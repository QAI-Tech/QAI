import React, { memo, useState, useRef, useCallback } from "react";
import { NodeProps, useReactFlow } from "@xyflow/react";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, MessageSquare } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

const CommentNode = memo(({ data, selected, id, ...nodeProps }: NodeProps) => {
  const { setNodes } = useReactFlow();
  const [isEditingText, setIsEditingText] = useState(false);
  const [editValue, setEditValue] = useState(
    (data as any)?.content || "New comment",
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTextEdit = useCallback(() => {
    setIsEditingText(true);
    setEditValue((data as any)?.content || "New comment");
  }, [data]);

  const handleSaveText = useCallback(() => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, content: editValue } }
          : node,
      ),
    );

    // Update the comment in the comment management state
    const commentId = (data as any)?.commentId;
    if (commentId) {
      window.dispatchEvent(
        new CustomEvent("commentUpdate", {
          detail: {
            commentId: commentId,
            content: editValue,
          },
        }),
      );
    }

    setIsEditingText(false);
  }, [setNodes, id, editValue, data]);

  const handleCancelText = useCallback(() => {
    setIsEditingText(false);
    setEditValue((data as any)?.content || "New comment");
  }, [data]);

  const handleTextKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSaveText();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancelText();
    }
  };

  const handleDelete = useCallback(() => {
    // Remove the ReactFlow node
    setNodes((nodes) => nodes.filter((node) => node.id !== id));
    // Dispatch a custom event to notify the parent component to delete the comment from state
    const commentId = (data as any)?.commentId;
    if (commentId) {
      window.dispatchEvent(
        new CustomEvent("commentDelete", {
          detail: {
            commentId: commentId,
            nodeId: id,
          },
        }),
      );
    }
  }, [setNodes, id, data]);

  // Handle click outside to save changes (consistent with CustomNode and CustomEdge)
  React.useEffect(() => {
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
          className={`min-w-[200px] max-w-[300px] cursor-pointer transition-all duration-200 ${
            selected
              ? "ring-2 ring-blue-500 shadow-lg"
              : "hover:shadow-md border-gray-200"
          }`}
          style={{
            backgroundColor: selected ? "#f8fafc" : "white",
          }}
        >
          <CardContent className="p-3 text-center">
            {/* Small comment icon header */}
            <div className="flex items-center justify-center mb-2">
              <MessageSquare className="w-5 h-5 text-blue-500 fill-blue-500" />
            </div>

            {/* Editable text area */}
            <div>
              {isEditingText ? (
                <textarea
                  ref={textareaRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleTextKeyDown}
                  className="w-full p-2 text-sm text-gray-700 border border-gray-300 rounded resize-none leading-tight min-h-[4rem] focus:outline-none focus:border-blue-500"
                  rows={4}
                  placeholder="Enter your comment here..."
                />
              ) : (
                <p
                  className="text-sm text-gray-700 leading-tight break-words cursor-pointer hover:bg-gray-50 p-2 rounded min-h-[4rem] flex items-center justify-center text-center"
                  onClick={handleTextEdit}
                  title="Click to edit"
                >
                  {(data as any)?.content || "New comment"}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onClick={handleDelete}>
          <Trash2 className="w-4 h-4 mr-2" />
          Delete Comment
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

CommentNode.displayName = "CommentNode";

export default CommentNode;
