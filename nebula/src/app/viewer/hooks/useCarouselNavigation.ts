import { useState, useCallback } from "react";

interface UseCarouselNavigationProps {
  totalNodes: number;
  onNavigate?: (newIndex: number) => void;
}

interface UseCarouselNavigationReturn {
  currentNodeIndex: number;
  canGoNext: boolean;
  canGoPrevious: boolean;
  moveToNext: () => void;
  moveToPrevious: () => void;
  setCurrentIndex: (index: number) => void;
}

export function useCarouselNavigation({
  totalNodes,
  onNavigate,
}: UseCarouselNavigationProps): UseCarouselNavigationReturn {
  const [currentNodeIndex, setCurrentNodeIndex] = useState(0);

  // Calculate navigation constraints
  const canGoNext = currentNodeIndex < totalNodes - 1;
  const canGoPrevious = currentNodeIndex > 0;

  // Navigation functions
  const moveToNext = useCallback(() => {
    if (!canGoNext) return;

    const newIndex = currentNodeIndex + 1;
    setCurrentNodeIndex(newIndex);
    onNavigate?.(newIndex);
  }, [currentNodeIndex, canGoNext, onNavigate]);

  const moveToPrevious = useCallback(() => {
    if (!canGoPrevious) return;

    const newIndex = currentNodeIndex - 1;
    setCurrentNodeIndex(newIndex);
    onNavigate?.(newIndex);
  }, [currentNodeIndex, canGoPrevious, onNavigate]);

  const setCurrentIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < totalNodes) {
        setCurrentNodeIndex(index);
        onNavigate?.(index);
      }
    },
    [totalNodes, onNavigate],
  );

  return {
    currentNodeIndex,
    canGoNext,
    canGoPrevious,
    moveToNext,
    moveToPrevious,
    setCurrentIndex,
  };
}
