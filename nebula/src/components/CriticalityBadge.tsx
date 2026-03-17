import { Criticality } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import type { testCaseSchema } from "@/lib/types";
import * as Sentry from "@sentry/nextjs";

interface CriticalityBadgeProps {
  criticality: Criticality;
  className?: string;
  Id: string;
  isTestCaseUnderExecution?: boolean;
  testCase?: testCaseSchema;
  onCriticalityChange?: (newCriticality: Criticality) => void;
}

/**
 * Configuration for different criticality levels
 * Each level has an emoji indicator, background color, and alignment settings
 */
const criticalityConfig = {
  HIGH: {
    indicator: "🔥🔥🔥",
    bgColor: "bg-red-200/80",
    alignment: "justify-center",
  },
  LOW: {
    indicator: "🔥",
    bgColor: "bg-yellow-200/80",
    alignment: "justify-center",
  },
};

export function CriticalityBadge({
  criticality: initialCriticality,
  className,
  Id,
  isTestCaseUnderExecution = false,
  testCase,
  onCriticalityChange,
}: CriticalityBadgeProps) {
  // State for managing the expanded/collapsed view of options
  const [isExpanded, setIsExpanded] = useState(false);
  // State for tracking the current criticality level
  const [currentCriticality, setCurrentCriticality] =
    useState(initialCriticality);
  // State for tracking update operations
  const [isUpdating, setIsUpdating] = useState(false);
  // Ref for handling click-outside behavior
  const badgeRef = useRef<HTMLDivElement>(null);

  // Update local state when prop changes
  useEffect(() => {
    setCurrentCriticality(initialCriticality);
  }, [initialCriticality]);
  // Handle clicks outside the badge to collapse options
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        badgeRef.current &&
        !badgeRef.current.contains(event.target as Node)
      ) {
        setIsExpanded(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const config =
    criticalityConfig[currentCriticality] || criticalityConfig.HIGH;

  // Toggle expanded state when badge is clicked
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const handleApiUpdate = async (newCriticality: Criticality) => {
    try {
      const endpoint = isTestCaseUnderExecution
        ? "/api/update-test-case-under-execution"
        : "/api/update-test-case";

      const payload = isTestCaseUnderExecution
        ? {
            updateTestCaseUnderExecution: {
              test_case_under_execution_id: Id,
              criticality: newCriticality,
            },
          }
        : {
            testCase: {
              ...testCase,
              criticality: newCriticality,
            },
          };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to update criticality");
      }

      toast.success("Criticality updated successfully");
      return true;
    } catch (error) {
      console.error("Error updating criticality:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error("Failed to update criticality");
      throw error;
    }
  };

  // Handle selection of a new criticality level
  const handleOptionClick =
    (newCriticality: Criticality) => async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isUpdating) return;

      try {
        setIsUpdating(true);
        // Optimistically update the UI
        setCurrentCriticality(newCriticality);

        // Call API to update
        await handleApiUpdate(newCriticality);

        // Call the change handler if provided
        if (onCriticalityChange) {
          onCriticalityChange(newCriticality);
        }
      } catch (error) {
        // Revert on error
        setCurrentCriticality(initialCriticality);
        console.error("Error updating criticality:", error);
      } finally {
        setIsUpdating(false);
        setIsExpanded(false);
      }
    };

  return (
    <div
      ref={badgeRef}
      className="relative inline-block"
      onClick={(e) => e.stopPropagation()}
    >
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute left-1/2 bottom-full mb-2 flex gap-2 z-50 -translate-x-1/2 whitespace-nowrap"
          >
            {Object.entries(criticalityConfig).map(([key, value]) => (
              <motion.div
                key={key}
                onClick={handleOptionClick(key as Criticality)}
                className={cn(
                  "inline-flex items-center px-4 py-1 rounded-full w-[75px] cursor-pointer",
                  value.bgColor,
                  value.alignment,
                  "hover:opacity-90 transition-opacity",
                  key === currentCriticality &&
                    "ring-2 ring-white ring-opacity-50",
                  isUpdating && "opacity-50 cursor-not-allowed",
                )}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <span>{value.indicator}</span>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        onClick={handleClick}
        className={cn(
          "inline-flex items-center px-4 py-1 rounded-full w-[75px] cursor-pointer hover:opacity-90 transition-opacity",
          config.bgColor,
          config.alignment,
          className,
          isUpdating && "opacity-50 cursor-not-allowed",
        )}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <span>{config.indicator}</span>
      </motion.div>
    </div>
  );
}
