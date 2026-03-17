// Comment related types and interfaces

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommentState {
  comments: Comment[];
  selectedCommentId: string | null;
}

export interface CommentNodeData {
  content: string;
  commentId: string;
}
