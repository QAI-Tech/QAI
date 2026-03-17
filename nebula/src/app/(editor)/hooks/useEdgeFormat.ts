import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  getEdgeFormatManager,
  destroyEdgeFormatManager,
} from "../services/edgeFormatManager";

interface UseEdgeFormatProps {
  onEdgeUpdate: (edgeId: string, formattedBusinessLogic: string) => void;
  onError?: (edgeId: string) => void;
  enabled?: boolean;
}

export const useEdgeFormat = ({
  onEdgeUpdate,
  onError,
  enabled = true,
}: UseEdgeFormatProps) => {
  const { toast } = useToast();
  const managerInitialized = useRef(false);

  useEffect(() => {
    if (!enabled || managerInitialized.current) {
      return;
    }

    const handleEdgeUpdate = (
      edgeId: string,
      formattedBusinessLogic: string,
    ) => {
      console.log(
        `[useEdgeFormat] Updating edge ${edgeId} with formatted business logic`,
      );

      onEdgeUpdate(edgeId, formattedBusinessLogic);

      toast({
        title: "Business logic formatted",
        description: "Your business logic has been formatted successfully",
        duration: 3000,
      });
    };

    const handleFormatError = (edgeId: string, metaLogic?: string) => {
      console.error(
        `[useEdgeFormat] Formatting failed for edge ${edgeId}:`,
        metaLogic,
      );

      toast({
        title: "Business Logic Formatting Failed",
        description: metaLogic || "The business logic could not be formatted.",
        variant: "destructive",
      });

      // Call error callback to trigger state update
      if (onError) {
        onError(edgeId);
      }
    };

    try {
      getEdgeFormatManager(handleEdgeUpdate, handleFormatError);
      managerInitialized.current = true;
      console.log("[useEdgeFormat] Edge format manager initialized");
    } catch (error) {
      console.error(
        "[useEdgeFormat] Failed to initialize edge format manager:",
        error,
      );
    }

    return () => {
      if (managerInitialized.current) {
        // Note: We don't destroy the singleton here as other components might still be using it
        // The manager will be destroyed when the app unmounts
        console.log(
          "[useEdgeFormat] Component unmounting, edge format manager remains active",
        );
      }
    };
  }, [onEdgeUpdate, onError, toast, enabled]);

  const cleanup = () => {
    destroyEdgeFormatManager();
    managerInitialized.current = false;
  };

  return { cleanup };
};
