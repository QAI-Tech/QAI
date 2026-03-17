"use client";

import { useWebRecorderExtension } from "@/hooks/use-web-recorder-extension";
import { useProductSwitcher } from "@/providers/product-provider";
import { cn, isWebProduct } from "@/lib/utils";

export function WebRecorderIndicator() {
  const { isInstalled, isCapturing, actionCount } = useWebRecorderExtension();
  const { productSwitcher } = useProductSwitcher();

  if (!isInstalled || !isWebProduct(productSwitcher)) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-green-600">
      <span
        className={cn(
          "w-2 h-2 rounded-full bg-green-600",
          isCapturing && "animate-pulse",
        )}
      />

      <span className="text-xs">{isCapturing ? "⏹️" : ""}</span>

      <span className="hidden md:inline text-xs">
        {isCapturing ? "Recording" : "Connected to QAI plugin"}
      </span>

      {isCapturing && actionCount > 0 && (
        <span className="inline-flex items-center justify-center ml-2 min-w-[20px] h-5 px-1.5 bg-purple-600 text-white text-[10px] font-bold rounded-full">
          {actionCount > 99 ? "99+" : actionCount}
        </span>
      )}
    </div>
  );
}
