import { useState, useCallback } from "react";
import { Comment, CommentState } from "../types/commentTypes";
import {
  ConsoleCollaborationEvents,
  Position,
} from "../types/collaborationEvents";

export const useCommentManagement = () => {
  const collaboarationEvents = new ConsoleCollaborationEvents();
  const [commentState, setCommentState] = useState<CommentState>({
    comments: [],
    selectedCommentId: null,
  });

  const createComment = useCallback(
    (content: string, position: Position): Comment => {
      const newComment: Comment = {
        id: `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setCommentState((prev) => ({
        ...prev,
        comments: [...prev.comments, newComment],
      }));

      collaboarationEvents.addComments([newComment], [position]);
      return newComment;
    },
    [collaboarationEvents],
  );

  const updateComment = useCallback(
    (commentId: string, content: string) => {
      setCommentState((prev) => {
        const existing = prev.comments.find((c) => c.id === commentId);
        const oldContent = existing ? existing.content : "";

        // Emit collaboration event with old and new content
        try {
          collaboarationEvents.updateComments([
            {
              commentId,
              updates: {
                content: { old: oldContent, new: content },
              },
            },
          ]);
        } catch (err) {
          console.error("Failed to emit updateComments:", err);
        }

        return {
          ...prev,
          comments: prev.comments.map((comment) =>
            comment.id === commentId
              ? { ...comment, content, updatedAt: new Date().toISOString() }
              : comment,
          ),
        };
      });
    },
    [collaboarationEvents],
  );

  const deleteComment = useCallback(
    (commentId: string) => {
      setCommentState((prev) => {
        const toDelete = prev.comments.find((c) => c.id === commentId);

        try {
          collaboarationEvents.deleteComments([{ commentId }]);
        } catch (err) {
          console.error("Failed to emit deleteComments:", err);
        }

        return {
          ...prev,
          comments: prev.comments.filter((comment) => comment.id !== commentId),
          selectedCommentId:
            prev.selectedCommentId === commentId
              ? null
              : prev.selectedCommentId,
        };
      });
    },
    [collaboarationEvents],
  );

  const selectComment = useCallback((commentId: string | null) => {
    setCommentState((prev) => ({
      ...prev,
      selectedCommentId: commentId,
    }));
  }, []);

  const getCommentById = useCallback(
    (commentId: string) => {
      return commentState.comments.find((comment) => comment.id === commentId);
    },
    [commentState.comments],
  );

  const exportComments = useCallback(() => {
    return JSON.stringify(commentState.comments, null, 2);
  }, [commentState.comments]);

  const importComments = useCallback((jsonString: string) => {
    try {
      const parsedData = JSON.parse(jsonString) as unknown;

      // Validate that the parsed data is an array
      if (!Array.isArray(parsedData)) {
        throw new Error("Imported data is not an array");
      }

      // Validate that each item has the required Comment properties
      const validatedComments: Comment[] = parsedData.map((item, index) => {
        if (typeof item !== "object" || item === null) {
          throw new Error(`Invalid comment at index ${index}: not an object`);
        }

        const comment = item as Record<string, unknown>;

        if (typeof comment.id !== "string") {
          throw new Error(
            `Invalid comment at index ${index}: missing or invalid id`,
          );
        }
        if (typeof comment.content !== "string") {
          throw new Error(
            `Invalid comment at index ${index}: missing or invalid content`,
          );
        }
        if (typeof comment.createdAt !== "string") {
          throw new Error(
            `Invalid comment at index ${index}: missing or invalid createdAt`,
          );
        }
        if (typeof comment.updatedAt !== "string") {
          throw new Error(
            `Invalid comment at index ${index}: missing or invalid updatedAt`,
          );
        }

        return {
          id: comment.id,
          content: comment.content,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
        } as Comment;
      });

      setCommentState((prev) => ({
        ...prev,
        comments: validatedComments,
      }));
    } catch (error) {
      console.error("Failed to import comments:", error);
      throw new Error(
        `Failed to import comments: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }, []);

  return {
    comments: commentState.comments,
    selectedCommentId: commentState.selectedCommentId,
    createComment,
    updateComment,
    deleteComment,
    selectComment,
    getCommentById,
    exportComments,
    importComments,
  };
};
