import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  getEdgeDescriptionFormatManager,
  destroyEdgeDescriptionFormatManager,
} from "../services/edgeDescriptionFormatManager";

interface UseEdgeDescriptionFormatProps {
  onEdgeUpdate: (edgeId: string, formattedDescription: string) => void;
  onError?: (edgeId: string) => void;
  enabled?: boolean;
}

export const useEdgeDescriptionFormat = ({
  onEdgeUpdate,
  onError,
  enabled = true,
}: UseEdgeDescriptionFormatProps) => {
  const { toast } = useToast();
  const managerInitialized = useRef(false);

  useEffect(() => {
    if (!enabled || managerInitialized.current) {
      return;
    }

    const handleEdgeUpdate = (edgeId: string, formattedDescription: string) => {
      console.log(
        `[useEdgeDescriptionFormat] Updating edge ${edgeId} with formatted description`,
      );

      onEdgeUpdate(edgeId, formattedDescription);

      toast({
        title: "Description formatted",
        description: "Your edge description has been formatted successfully",
        duration: 3000,
      });
    };

    const handleFormatError = (edgeId: string, metaLogic?: string) => {
      console.error(
        `[useEdgeDescriptionFormat] Formatting failed for edge ${edgeId}:`,
        metaLogic,
      );

      toast({
        title: "Description Formatting Failed",
        description: metaLogic || "The description could not be formatted.",
        variant: "destructive",
      });

      // Call error callback to trigger state update
      if (onError) {
        onError(edgeId);
      }
    };

    try {
      getEdgeDescriptionFormatManager(handleEdgeUpdate, handleFormatError);
      managerInitialized.current = true;
      console.log(
        "[useEdgeDescriptionFormat] Edge description format manager initialized",
      );
    } catch (error) {
      console.error(
        "[useEdgeDescriptionFormat] Failed to initialize edge description format manager:",
        error,
      );
    }

    return () => {
      if (managerInitialized.current) {
        // Note: We don't destroy the singleton here as other components might still be using it
        // The manager will be destroyed when the app unmounts
        console.log(
          "[useEdgeDescriptionFormat] Component unmounting, edge description format manager remains active",
        );
      }
    };
  }, [onEdgeUpdate, onError, toast, enabled]);

  const cleanup = () => {
    destroyEdgeDescriptionFormatManager();
    managerInitialized.current = false;
  };

  return { cleanup };
};
