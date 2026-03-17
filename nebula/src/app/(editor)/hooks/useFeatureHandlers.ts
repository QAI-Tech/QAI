import { useCallback } from "react";
import { Node } from "@xyflow/react";
import { useToast } from "@/hooks/use-toast";
import { FeatureHandlerProps } from "../types/graphHandlers";

export const useFeatureHandlers = ({
  setNodes,
  featureManagement,
  editingFeatureId,
}: FeatureHandlerProps) => {
  const { toast } = useToast();

  const handleFeatureNodeClick = useCallback(
    (node: Node) => {
      // Only allow customNode types to be selected for feature creation/editing
      if (node.type !== "customNode") {
        toast({
          title: "Invalid node type",
          description:
            "Only screens can be added to features. Comments cannot be included in features.",
          variant: "destructive",
        });
        return;
      }

      // In feature creation/edit mode, check for conflicts before toggling selection
      console.log(
        "Toggling node selection for node:",
        node.id,
        "current selected:",
        node.selected,
      );

      // If we're trying to select a node (not deselect), check if it belongs to another feature
      if (!node.selected && featureManagement) {
        const existingFeature = featureManagement.getNodeFeature(node.id);
        if (existingFeature && existingFeature.id !== editingFeatureId) {
          toast({
            title: "Screen already in feature",
            description: `This screen already belongs to the feature "${existingFeature.name}". Remove it from that feature first.`,
            variant: "destructive",
          });
          return;
        }
      }

      setNodes((nds) =>
        nds.map((n) =>
          n.id === node.id ? { ...n, selected: !n.selected } : n,
        ),
      );
    },
    [setNodes, featureManagement, editingFeatureId, toast],
  );

  return {
    handleFeatureNodeClick,
  };
};
