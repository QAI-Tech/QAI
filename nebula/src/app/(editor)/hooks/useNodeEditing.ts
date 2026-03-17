// @ts-nocheck
import { useState, useCallback, useRef } from "react";
import { Node } from "@xyflow/react";
import { useToast } from "@/hooks/use-toast";

interface UseNodeEditingProps {
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  saveState: () => void;
}

export const useNodeEditing = ({
  setNodes,
  saveState,
}: UseNodeEditingProps) => {
  const [editingNode, setEditingNode] = useState<{
    id: string;
    data: any;
  } | null>(null);
  const [editNodeDescription, setEditNodeDescription] = useState("");
  const [editNodeImage, setEditNodeImage] = useState("");
  const editImageInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();

  const handleEditImageUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setEditNodeImage(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      }
    },
    [],
  );

  const saveNodeEdit = useCallback(() => {
    if (!editingNode) return;

    saveState(); // Save state before editing

    setNodes((nds) =>
      nds.map((node) =>
        node.id === editingNode.id
          ? {
              ...node,
              data: {
                ...node.data,
                description: editNodeDescription,
                image: editNodeImage,
              },
              selected: true, // Reselect the node after editing
            }
          : node,
      ),
    );

    setEditingNode(null);
    setEditNodeDescription("");
    setEditNodeImage("");

    toast({
      title: "Screen updated",
      description: "Screen has been successfully updated.",
    });
  }, [
    editingNode,
    editNodeDescription,
    editNodeImage,
    setNodes,
    saveState,
    toast,
  ]);

  const cancelNodeEdit = useCallback(() => {
    setEditingNode(null);
    setEditNodeDescription("");
    setEditNodeImage("");
  }, []);

  return {
    editingNode,
    editNodeDescription,
    editNodeImage,
    editImageInputRef,
    setEditingNode,
    setEditNodeDescription,
    setEditNodeImage,
    handleEditImageUpload,
    saveNodeEdit,
    cancelNodeEdit,
  };
};
