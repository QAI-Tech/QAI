"use client";

import type React from "react";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Edit2, Loader2, Trash2 } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { isQaiOrgUser, isQaiOrgAnalystUser } from "@/lib/constants";
import ReactMarkdown from "react-markdown";
import type { CommentsSectionProps, CommentType } from "@/lib/types";
import { DeleteConfirmationDialog } from "@/app/(dashboard)/[product]/homev1/test-cases/components/delete-confirmation-dialog";

export function CommentsSection({
  comments,
  isLoading,
  onSaveTestCase,
  readOnly = false,
}: CommentsSectionProps & { readOnly?: boolean }) {
  const [commentText, setCommentText] = useState("");
  const [isCommentInputActive, setIsCommentInputActive] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(
    null,
  );
  const [deleteDialog, setDeleteDialog] = useState({
    isOpen: false,
    commentId: "",
    isLoading: false,
  });
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const { user } = useUser();
  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;
  const isQaiUser = isQaiOrgUser(userOrgId) || isQaiOrgAnalystUser(userOrgId);

  // Comment handlers using the passed save function
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || isLoading.status || !user) return;

    const userName =
      typeof user.publicMetadata?.name === "string"
        ? user.publicMetadata.name
        : user.fullName || user.username || "User";

    const newComment: CommentType = {
      id: Date.now().toString(),
      userId: user.id,
      userName,
      userImageUrl: user.imageUrl,
      text: commentText.trim(),
      createdAt: new Date().toISOString(),
    };

    const updatedComments = [...comments, newComment];
    const success = await onSaveTestCase({
      comments: updatedComments,
    });

    if (success) {
      setCommentText("");
      setIsCommentInputActive(false);
    }
  };

  const handleEditComment = (commentId: string, text: string) => {
    setEditingCommentId(commentId);
    setEditCommentText(text);
  };

  const handleSaveEdit = async (commentId: string) => {
    if (!editCommentText.trim() || isLoading.status) return;

    const updatedComments = comments.map((comment) =>
      comment.id === commentId
        ? { ...comment, text: editCommentText.trim() }
        : comment,
    );

    const success = await onSaveTestCase({
      comments: updatedComments,
    });

    if (success) {
      setEditingCommentId(null);
      setEditCommentText("");
    }
  };

  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditCommentText("");
  };

  const handleFocusCommentInput = () => {
    setIsCommentInputActive(true);
    setTimeout(() => {
      commentInputRef.current?.focus();
    }, 10);
  };

  const handleBlurCommentInput = () => {
    if (!commentText.trim()) {
      setIsCommentInputActive(false);
    }
  };

  const handleShowDeleteConfirm = (commentId: string) => {
    setDeleteDialog({
      isOpen: true,
      commentId,
      isLoading: false,
    });
  };

  const handleDeleteComment = async (commentId: string) => {
    if (isLoading.status) return;

    setDeleteDialog((prev) => ({ ...prev, isLoading: true }));
    setDeletingCommentId(commentId);

    const updatedComments = comments.filter(
      (comment) => comment.id !== commentId,
    );
    const success = await onSaveTestCase({
      comments: updatedComments,
    });

    if (success) {
      setDeletingCommentId(null);
      setDeleteDialog((prev) => ({ ...prev, isOpen: false }));
    }

    setDeleteDialog((prev) => ({ ...prev, isLoading: false }));
  };

  // Get user initials for avatar
  const getUserInitials = (name: string) => {
    if (!name) return "U";
    const parts = name.split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (
      parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
    ).toUpperCase();
  };

  // Generate avatar color based on user ID
  const getUserAvatarColor = (userId: string) => {
    if (!userId) return "bg-gray-500";
    const colors = [
      "bg-blue-600",
      "bg-purple-600",
      "bg-green-600",
      "bg-red-600",
      "bg-pink-600",
      "bg-yellow-600",
      "bg-indigo-600",
      "bg-teal-600",
    ];
    const hash = userId
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  return (
    <div className="space-y-4">
      <DeleteConfirmationDialog
        isOpen={deleteDialog.isOpen}
        isDeleting={deleteDialog.isLoading}
        title="Delete comment?"
        description="Are you sure you want to delete this comment?"
        onConfirm={() => handleDeleteComment(deleteDialog.commentId)}
        onCancel={() => setDeleteDialog((prev) => ({ ...prev, isOpen: false }))}
      />

      <h3 className="text-sm font-semibold text-foreground">Comments</h3>

      {!readOnly && (
        <div className="flex items-center gap-3">
          {/* Profile picture outside the input */}
          <div
            className={`h-[26px] w-[26px] rounded-full text-white flex items-center justify-center text-xs flex-shrink-0 ${
              user?.imageUrl ? "" : getUserAvatarColor(user?.id || "")
            }`}
            style={
              user?.imageUrl
                ? {
                    backgroundImage: `url(${user.imageUrl})`,
                    backgroundSize: "cover",
                  }
                : {}
            }
          >
            {!user?.imageUrl &&
              getUserInitials(user?.fullName || user?.username || "")}
          </div>

          {/* Input content - no borders, no speech bubble tail */}
          <div className="flex-1">
            <form onSubmit={handleAddComment}>
              {isCommentInputActive ? (
                <div>
                  <Textarea
                    ref={commentInputRef}
                    placeholder="Write a comment..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className="min-h-[60px] w-[98%] border border-gray-200 rounded-[4px] px-4 py-2 text-sm focus:ring-1 focus:ring-purple-500 bg-white"
                    disabled={isLoading.status}
                    onBlur={handleBlurCommentInput}
                    autoFocus
                  />
                  <div className="flex justify-end mt-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsCommentInputActive(false);
                        setCommentText("");
                      }}
                      disabled={isLoading.status}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="bg-purple-600 hover:bg-purple-700 text-white h-8 w-8 p-0 rounded-full"
                      disabled={!commentText.trim() || isLoading.status}
                      title="Send comment"
                    >
                      {isLoading.status && isLoading.action === "saving" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="h-[41px] w-full border border-gray-200 rounded-[4px] px-4 text-gray-500 bg-white cursor-pointer hover:bg-gray-50 transition-colors flex items-center text-sm"
                  onClick={handleFocusCommentInput}
                >
                  Leave a Comment
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {!readOnly && <div className="border-t border-gray-200"></div>}

      {/* Comments list */}
      <div className="space-y-3">
        {comments.length > 0 ? (
          [...comments]
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            )
            .map((comment) => (
              <div key={comment.id} className="flex items-start gap-3">
                {/* Profile picture outside the comment */}
                <div
                  className={`h-[26px] w-[26px] rounded-full text-white flex items-center justify-center text-xs flex-shrink-0 ${
                    comment.userImageUrl
                      ? ""
                      : getUserAvatarColor(comment.userId)
                  }`}
                  style={
                    comment.userImageUrl
                      ? {
                          backgroundImage: `url(${comment.userImageUrl})`,
                          backgroundSize: "cover",
                        }
                      : {}
                  }
                >
                  {!comment.userImageUrl && getUserInitials(comment.userName)}
                </div>

                {/* Comment content */}
                <div className="flex-1">
                  <div className="relative w-[90%] min-h-[101px] rounded-lg border border-black/10 bg-transparent hover:bg-white transition-colors p-3 group">
                    {/* Speech bubble tail */}
                    <div className="absolute left-0 top-3 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[8px] border-r-black/10 -translate-x-[8px]"></div>
                    <div className="absolute left-0 top-3 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[8px] border-r-gray-50 group-hover:border-r-white -translate-x-[7px]"></div>

                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="font-medium text-sm">
                          {comment.userName}
                        </span>
                        <span className="text-xs text-gray-500 ml-2">
                          Just now
                        </span>
                      </div>
                      {!readOnly &&
                        user?.id === comment.userId &&
                        isQaiUser && (
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                handleEditComment(comment.id, comment.text)
                              }
                              className="text-gray-500 hover:text-gray-700"
                              disabled={isLoading.status}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() =>
                                handleShowDeleteConfirm(comment.id)
                              }
                              className="text-gray-500 hover:text-red-600"
                              disabled={
                                isLoading.status ||
                                deletingCommentId === comment.id
                              }
                            >
                              {deletingCommentId === comment.id &&
                              isLoading.status ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 size={14} />
                              )}
                            </button>
                          </div>
                        )}
                    </div>

                    {!readOnly && editingCommentId === comment.id ? (
                      <div>
                        <Textarea
                          value={editCommentText}
                          onChange={(e) => setEditCommentText(e.target.value)}
                          className="min-h-[60px] w-full border border-gray-200 rounded-md p-2 focus:ring-1 focus:ring-purple-500 bg-white"
                          disabled={isLoading.status}
                          autoFocus
                        />
                        <div className="flex justify-end mt-2 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCancelEdit}
                            disabled={isLoading.status}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={() => handleSaveEdit(comment.id)}
                            size="sm"
                            className="bg-purple-600 hover:bg-purple-700 text-white"
                            disabled={
                              !editCommentText.trim() || isLoading.status
                            }
                          >
                            {isLoading.status &&
                            isLoading.action === "saving" ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              "Save"
                            )}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown>{comment.text}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
        ) : (
          <p className="text-center text-gray-500 italic text-sm">
            No comments yet
          </p>
        )}
      </div>
    </div>
  );
}
