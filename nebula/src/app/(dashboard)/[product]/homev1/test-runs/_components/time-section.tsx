"use client";

import { useState } from "react";
import { TestRunCard } from "./test-run-card";
import { ChevronDown } from "lucide-react";
import type { TimeSectionSchema } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TimetestRunProps {
  section: TimeSectionSchema;
}

export function TimeSectionComponent({ section }: TimetestRunProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="space-y-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between  rounded-lg p-2 transition-colors"
      >
        <h2 className="text-lg font-bold text-gray-900">{section.title}</h2>
        <ChevronDown
          className={cn(
            "h-5 w-5 ml-1 text-gray-400 transition-transform duration-200",
            isExpanded && "rotate-180",
          )}
        />
      </button>
      {isExpanded && (
        <div className="grid gap-4 md:grid-cols-2 animate-in fade-in-50 duration-200">
          {section.runs.map((testRun, key) => (
            <TestRunCard key={key} testRun={testRun} />
          ))}
        </div>
      )}
    </div>
  );
}
