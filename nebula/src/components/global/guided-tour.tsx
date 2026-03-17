"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type GuidedTourStep = {
  target: string;
  title: string;
  description: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getTooltipPosition(params: {
  rect: DOMRect | null;
  tooltipWidth: number;
  tooltipHeight: number;
  gap: number;
  viewportPadding: number;
}) {
  const { rect, tooltipWidth, tooltipHeight, gap, viewportPadding } = params;

  const vw = typeof window !== "undefined" ? window.innerWidth : 0;
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;

  if (!rect || vw === 0 || vh === 0) {
    return {
      left: viewportPadding,
      top: viewportPadding,
    };
  }

  const rightLeft = rect.right + gap;
  const leftLeft = rect.left - tooltipWidth - gap;
  const topTop = rect.top - tooltipHeight - gap;
  const bottomTop = rect.bottom + gap;

  const canPlaceRight = rightLeft + tooltipWidth + viewportPadding <= vw;
  const canPlaceLeft = leftLeft >= viewportPadding;
  const canPlaceBottom = bottomTop + tooltipHeight + viewportPadding <= vh;
  const canPlaceTop = topTop >= viewportPadding;

  let left = viewportPadding;
  let top = viewportPadding;

  if (canPlaceRight) {
    left = rightLeft;
    top = clamp(
      rect.top,
      viewportPadding,
      vh - tooltipHeight - viewportPadding,
    );
  } else if (canPlaceLeft) {
    left = leftLeft;
    top = clamp(
      rect.top,
      viewportPadding,
      vh - tooltipHeight - viewportPadding,
    );
  } else if (canPlaceBottom) {
    left = clamp(
      rect.left,
      viewportPadding,
      vw - tooltipWidth - viewportPadding,
    );
    top = bottomTop;
  } else if (canPlaceTop) {
    left = clamp(
      rect.left,
      viewportPadding,
      vw - tooltipWidth - viewportPadding,
    );
    top = topTop;
  } else {
    left = clamp(
      rect.left,
      viewportPadding,
      vw - tooltipWidth - viewportPadding,
    );
    top = clamp(
      rect.bottom + gap,
      viewportPadding,
      vh - tooltipHeight - viewportPadding,
    );
  }

  return { left, top };
}

export function GuidedTour({
  open,
  steps,
  onOpenChange,
  initialStep = 0,
  className,
}: {
  open: boolean;
  steps: GuidedTourStep[];
  onOpenChange: (open: boolean) => void;
  initialStep?: number;
  className?: string;
}) {
  const [stepIndex, setStepIndex] = useState(initialStep);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const step = steps[stepIndex];

  useEffect(() => {
    if (!open) return;
    setStepIndex(initialStep);
  }, [open, initialStep]);

  useLayoutEffect(() => {
    if (!open) return;
    if (!step) return;

    const update = () => {
      const el = document.querySelector(step.target) as HTMLElement | null;
      if (!el) {
        setTargetRect(null);
        return;
      }
      setTargetRect(el.getBoundingClientRect());
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, step?.target]);

  useEffect(() => {
    if (!open) return;
    if (!step) return;

    const el = document.querySelector(step.target) as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [open, step?.target]);

  const overlayRects = useMemo(() => {
    if (!targetRect) return null;

    const padding = 10;
    const left = Math.max(0, targetRect.left - padding);
    const top = Math.max(0, targetRect.top - padding);
    const right = Math.min(window.innerWidth, targetRect.right + padding);
    const bottom = Math.min(window.innerHeight, targetRect.bottom + padding);

    return {
      padding,
      highlight: {
        left,
        top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      },
      top: { left: 0, top: 0, width: window.innerWidth, height: top },
      left: { left: 0, top, width: left, height: bottom - top },
      right: {
        left: right,
        top,
        width: window.innerWidth - right,
        height: bottom - top,
      },
      bottom: {
        left: 0,
        top: bottom,
        width: window.innerWidth,
        height: window.innerHeight - bottom,
      },
    };
  }, [targetRect]);

  const tooltipSize = { width: 320, height: 150 };
  const tooltipPos = useMemo(() => {
    return getTooltipPosition({
      rect: overlayRects?.highlight
        ? ({
            left: overlayRects.highlight.left,
            top: overlayRects.highlight.top,
            right: overlayRects.highlight.left + overlayRects.highlight.width,
            bottom: overlayRects.highlight.top + overlayRects.highlight.height,
          } as DOMRect)
        : null,
      tooltipWidth: tooltipSize.width,
      tooltipHeight: tooltipSize.height,
      gap: 16,
      viewportPadding: 16,
    });
  }, [overlayRects]);

  const canGoBack = stepIndex > 0;
  const canGoNext = stepIndex < steps.length - 1;

  if (!open || !step) return null;

  return createPortal(
    <div className={cn("fixed inset-0 z-[1000]", className)}>
      {overlayRects && (
        <>
          <div
            className="fixed bg-black/40"
            style={{
              left: overlayRects.top.left,
              top: overlayRects.top.top,
              width: overlayRects.top.width,
              height: overlayRects.top.height,
            }}
          />
          <div
            className="fixed bg-black/40"
            style={{
              left: overlayRects.left.left,
              top: overlayRects.left.top,
              width: overlayRects.left.width,
              height: overlayRects.left.height,
            }}
          />
          <div
            className="fixed bg-black/40"
            style={{
              left: overlayRects.right.left,
              top: overlayRects.right.top,
              width: overlayRects.right.width,
              height: overlayRects.right.height,
            }}
          />
          <div
            className="fixed bg-black/40"
            style={{
              left: overlayRects.bottom.left,
              top: overlayRects.bottom.top,
              width: overlayRects.bottom.width,
              height: overlayRects.bottom.height,
            }}
          />

          <div
            className="fixed pointer-events-none border-2 border-primary rounded-lg"
            style={{
              left: overlayRects.highlight.left,
              top: overlayRects.highlight.top,
              width: overlayRects.highlight.width,
              height: overlayRects.highlight.height,
            }}
          />
        </>
      )}

      <div
        className="fixed"
        style={{ left: tooltipPos.left, top: tooltipPos.top, width: 320 }}
      >
        <div className="bg-card border border-border rounded-lg shadow-lg p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Step {stepIndex + 1} of {steps.length}
            </span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted transition-colors"
              aria-label="Close tutorial"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-1 text-sm font-medium text-foreground">
            {step.title}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {step.description}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <Button
              type="button"
              variant="v2-outline"
              size="sm"
              disabled={!canGoBack}
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="v2"
              size="sm"
              onClick={() => {
                if (canGoNext)
                  setStepIndex((i) => Math.min(steps.length - 1, i + 1));
                else onOpenChange(false);
              }}
            >
              {canGoNext ? "Next" : "Done"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
