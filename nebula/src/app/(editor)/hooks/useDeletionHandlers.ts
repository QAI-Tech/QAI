// @ts-nocheck
import { useCallback } from "react";
import { DeletionHandlerProps } from "../types/graphHandlers";

export const useDeletionHandlers = ({
  deleteManagement,
}: DeletionHandlerProps) => {
  const confirmDeletion = useCallback(() => {
    // Simply delegate to the delete management hook's confirm method
    deleteManagement.confirmDelete();
  }, [deleteManagement]);

  return {
    confirmDeletion,
  };
};
