"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { EditableField } from "./editable-field";
import { CollapsiblePreconditionsProps } from "@/lib/types";

export function CollapsiblePreconditions({
  preconditions,
  isCollapsed,
  onToggle,
  onSave,
  disabled = false,
}: CollapsiblePreconditionsProps) {
  const preconditionsText = Array.isArray(preconditions)
    ? preconditions.join("\n")
    : preconditions || "";

  return (
    <div className="space-y-3">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between py-2 text-lg font-bold hover:text-purple-600 transition-colors"
      >
        <span>Preconditions</span>
        <ChevronDown
          className={cn(
            "h-5 w-5 transition-transform",
            !isCollapsed && "rotate-180",
          )}
        />
      </button>

      {!isCollapsed && (
        <div className="pl-0">
          {onSave ? (
            <EditableField
              value={preconditionsText}
              onSave={onSave}
              placeholder="Enter preconditions (one per line)..."
              disabled={disabled}
              minHeight="min-h-[80px]"
            />
          ) : (
            <div className="min-h-[80px] w-full border border-gray-200 rounded-md p-3 bg-white">
              {preconditionsText ? (
                <div className="whitespace-pre-wrap text-gray-700">
                  {preconditionsText.split('\n').map((precondition, index) => (
                    <div key={index} className="flex items-start gap-2 mb-1">
                      <span className="text-gray-700 font-medium">•</span>
                      <span>{precondition}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-gray-500 italic">
                  No preconditions specified
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
