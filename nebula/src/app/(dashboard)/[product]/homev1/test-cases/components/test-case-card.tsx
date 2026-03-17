"use client";

import type React from "react";
import { TestCaseFrame } from "@/app/(dashboard)/[product]/homev1/test-cases/components/test-case-frame";
import type { testCaseSchema } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import { forwardRef } from "react";

interface TestCaseCardProps {
  testCase: testCaseSchema;
  onClick: (testCase: testCaseSchema) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: (testCase: testCaseSchema) => void;
  isDragging?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

export const TestCaseCard = forwardRef<HTMLDivElement, TestCaseCardProps>(
  (
    {
      testCase,
      onClick,
      isSelectionMode = false,
      isSelected = false,
      onSelect,
      isDragging = false,
      dragHandleProps,
    },
    ref,
  ) => {
    const handleClick = (e: React.MouseEvent) => {
      if (isSelectionMode && onSelect) {
        e.stopPropagation();
        onSelect(testCase);
      } else {
        onClick(testCase);
      }
    };

    return (
      <div
        ref={ref}
        className={`block rounded-lg border border-gray-200 bg-white p-0 transition-shadow hover:shadow-lg cursor-pointer relative ${
          isDragging ? "shadow-lg opacity-70" : "opacity-100"
        }`}
        onClick={handleClick}
        {...dragHandleProps}
      >
        <div className="absolute top-2 left-2 z-10">
          {isSelectionMode && (
            <Checkbox
              checked={isSelected}
              className="border-gray-300 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
              onClick={(e) => e.stopPropagation()}
              onCheckedChange={() => onSelect && onSelect(testCase)}
            />
          )}
        </div>

        <div className="mb-4 flex items-start justify-between hidden">
          <div className="flex justify-end">
            <span className="rounded-full bg-purple-100 px-3 py-1 text-sm font-semibold text-purple-600">
              {testCase.test_case_type}
            </span>
          </div>
        </div>

        <div className="flex gap-4 h-[160px]">
          <div className="flex flex-1 flex-col min-w-0">
            <div className={`mt-2 ${isSelectionMode ? "ml-10" : "ml-4"} mr-4`}>
              <p className="flex-1 text-black font-semibold line-clamp-4 break-words overflow-hidden">
                {testCase.test_case_description}
              </p>
            </div>
            <p
              className={`text-sm text-gray-500 mb-4 mt-auto ${isSelectionMode ? "ml-10" : "ml-4"} truncate`}
            >
              id: {testCase.test_case_id}
            </p>
          </div>
          <div className="relative h-full w-auto overflow-hidden rounded-lg flex-shrink-0">
            <TestCaseFrame screenshotUrl={testCase.screenshot_url || ""} />
          </div>
        </div>
      </div>
    );
  },
);

TestCaseCard.displayName = "TestCaseCard";
