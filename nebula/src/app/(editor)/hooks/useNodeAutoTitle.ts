// Hook for managing the node auto-title system lifecycle
import { useEffect, useRef } from "react";
import { Node } from "@xyflow/react";
import { useToast } from "@/hooks/use-toast";
import {
  getNodeAutoTitleManager,
  destroyNodeAutoTitleManager,
} from "../services/nodeAutoTitleManager";

interface UseNodeAutoTitleProps {
  setNodes: (updater: (nodes: Node[]) => Node[]) => void;
  enabled?: boolean;
}

export const useNodeAutoTitle = ({
  setNodes,
  enabled = true,
}: UseNodeAutoTitleProps) => {
  const { toast } = useToast();
  const managerInitialized = useRef(false);

  useEffect(() => {
    if (!enabled || managerInitialized.current) {
      return;
    }

    const handleNodeUpdate = (
      nodeId: string,
      title: string,
      description: string,
    ) => {
      console.log(
        `[useNodeAutoTitle] Updating node ${nodeId} with title: "${title}"`,
      );

      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  title,
                  description: description || (node.data as any)?.description,
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

    try {
      getNodeAutoTitleManager(handleNodeUpdate);
      managerInitialized.current = true;
      console.log("[useNodeAutoTitle] Auto-title manager initialized");
    } catch (error) {
      console.error(
        "[useNodeAutoTitle] Failed to initialize auto-title manager:",
        error,
      );
    }

    // Cleanup function
    return () => {
      if (managerInitialized.current) {
        // Note: We don't destroy the singleton here as other components might still be using it
        // The manager will be destroyed when the app unmounts
        console.log(
          "[useNodeAutoTitle] Component unmounting, auto-title manager remains active",
        );
      }
    };
  }, [setNodes, toast, enabled]);

  // Return cleanup function for manual cleanup if needed
  const cleanup = () => {
    destroyNodeAutoTitleManager();
    managerInitialized.current = false;
  };

  return { cleanup };
};
