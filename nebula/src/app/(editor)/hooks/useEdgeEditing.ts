// @ts-nocheck
import { useState, useCallback } from "react";
import { Edge } from "@xyflow/react";
import { useToast } from "@/hooks/use-toast";
import { CollaborationEvents } from "@/app/(editor)/types/collaborationEvents";

interface EdgeEditingState {
  editingEdge: { id: string; data: any } | null;
  editEdgeDescription: string;
  inlineEditingEdges: Set<string>;
}

interface EdgeEditingActions {
  setEditingEdge: (edge: { id: string; data: any } | null) => void;
  setEditEdgeDescription: (description: string) => void;
  setInlineEditingEdges: (updater: (edges: Set<string>) => Set<string>) => void;
  saveEdgeEdit: () => void;
  cancelEdgeEdit: () => void;
}

interface UseEdgeEditingProps {
  edges: Edge[];
  setEdges: (edges: Edge[] | ((edges: Edge[]) => Edge[])) => void;
  saveState: () => void;
  collaborationEvents?: CollaborationEvents | null;
}

export const useEdgeEditing = ({
  edges,
  setEdges,
  saveState,
  collaborationEvents,
}: UseEdgeEditingProps): EdgeEditingState & EdgeEditingActions => {
  const [editingEdge, setEditingEdge] = useState<{
    id: string;
    data: any;
  } | null>(null);
  const [editEdgeDescription, setEditEdgeDescription] = useState("");
  const [inlineEditingEdges, setInlineEditingEdges] = useState<Set<string>>(
    new Set(),
  );

  const { toast } = useToast();

  const saveEdgeEdit = useCallback(() => {
    if (!editingEdge) return;

    saveState(); // Save state before editing

    // Get the current edge to check for changes
    const currentEdge = edges.find((edge) => edge.id === editingEdge.id);
    const oldDescription = currentEdge?.data?.description || "";

    setEdges((eds) =>
      eds.map((edge) =>
        edge.id === editingEdge.id
          ? {
              ...edge,
              data: {
                ...edge.data,
                description: editEdgeDescription,
              },
            }
          : edge,
      ),
    );

    // Emit collaboration event if description changed
    if (collaborationEvents && oldDescription !== editEdgeDescription) {
      collaborationEvents.updateEdge(
        editingEdge.id,
        {
          description: { old: oldDescription, new: editEdgeDescription },
        },
        "USER_ID",
      );
    }

    setEditingEdge(null);
    setEditEdgeDescription("");

    toast({
      title: "Transition updated",
      description: "Transition has been successfully updated.",
    });
  }, [
    editingEdge,
    editEdgeDescription,
    setEdges,
    saveState,
    toast,
    edges,
    collaborationEvents,
  ]);

  const cancelEdgeEdit = useCallback(() => {
    setEditingEdge(null);
    setEditEdgeDescription("");
  }, []);

  return {
    editingEdge,
    editEdgeDescription,
    inlineEditingEdges,
    setEditingEdge,
    setEditEdgeDescription,
    setInlineEditingEdges,
    saveEdgeEdit,
    cancelEdgeEdit,
  };
};
