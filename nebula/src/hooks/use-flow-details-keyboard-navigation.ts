"use client";

import { useEffect } from "react";

export function useFlowDetailsKeyboardNavigation(options: {
  enabled: boolean;
  onStepPrevious?: () => void;
  onStepNext?: () => void;
  onFlowPrevious?: () => void;
  onFlowNext?: () => void;
  onClose?: () => void;
  canGoToPreviousStep?: boolean;
  canGoToNextStep?: boolean;
  canGoToPreviousFlow?: boolean;
  canGoToNextFlow?: boolean;
  isDialogOpen?: boolean;
}) {
  const {
    enabled,
    onStepPrevious,
    onStepNext,
    onFlowPrevious,
    onFlowNext,
    onClose,
    canGoToPreviousStep = false,
    canGoToNextStep = false,
    canGoToPreviousFlow = false,
    canGoToNextFlow = false,
    isDialogOpen = false,
  } = options;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const isFromDialog =
        target.closest('[role="dialog"]') !== null ||
        target.closest('[role="alertdialog"]') !== null;

      if (e.key === "Escape") {
        if (isDialogOpen || isFromDialog || e.defaultPrevented) {
          return;
        }
        if (onClose) {
          e.preventDefault();
          onClose();
        }
        return;
      }

      if (isDialogOpen) {
        return;
      }

      if (!e.shiftKey) {
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          if (canGoToPreviousStep && onStepPrevious) {
            onStepPrevious();
          }
        } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          if (canGoToNextStep && onStepNext) {
            onStepNext();
          }
        }
        return;
      }

      if (e.shiftKey) {
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          if (canGoToPreviousFlow && onFlowPrevious) {
            onFlowPrevious();
          }
        } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          if (canGoToNextFlow && onFlowNext) {
            onFlowNext();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [
    enabled,
    onStepPrevious,
    onStepNext,
    onFlowPrevious,
    onFlowNext,
    onClose,
    canGoToPreviousStep,
    canGoToNextStep,
    canGoToPreviousFlow,
    canGoToNextFlow,
    isDialogOpen,
  ]);
}
