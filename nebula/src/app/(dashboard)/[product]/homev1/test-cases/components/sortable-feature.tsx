"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { SortableTestCase } from "./sortable-test-case";
import type { testCaseSchema } from "@/lib/types";
import { EditableFeatureName } from "@/components/global/EditableFeatureName";

interface SortableFeatureProps {
  id: string;
  name: string;
  cases: testCaseSchema[];
  isExpanded: boolean;
  toggleSection: () => void;
  isSelectionMode: boolean;
  isSelected: boolean;
  toggleSelection: () => void;
  selectedTestCases: testCaseSchema[];
  toggleTestCaseSelection: (testCase: testCaseSchema) => void;
  handleTestCaseClick: (testCase: testCaseSchema) => void;
}

export function SortableFeature({
  id,
  name,
  cases,
  isExpanded,
  toggleSection,
  isSelectionMode,
  isSelected,
  toggleSelection,
  selectedTestCases,
  toggleTestCaseSelection,
  handleTestCaseClick,
}: SortableFeatureProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `feature-${id}`,
    data: {
      type: "feature",
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border bg-white ${isDragging ? "shadow-lg opacity-70 z-10" : ""}`}
    >
      <div
        className="flex w-full items-center justify-between p-4 cursor-pointer"
        onClick={toggleSection}
        {...attributes}
        {...listeners}
      >
        <div className="flex items-center">
          {isSelectionMode && (
            <Checkbox
              checked={isSelected}
              className="mr-4 h-4 w-4 rounded border border-gray-300 focus:outline-none data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
              onClick={(e) => {
                e.stopPropagation();
                toggleSelection();
              }}
            />
          )}
          <div className="flex items-center">
            <EditableFeatureName
              featureId={id}
              initialName={name}
              className="text-lg font-semibold"
            />
            <span className="ml-3 text-sm text-gray-500">
              ({cases.length} test cases)
            </span>
          </div>
        </div>
        <div className="focus:outline-none">
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-gray-500" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-500" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="p-4">
          {/* Used rectSortingStrategy for grid-based sorting */}
          <SortableContext
            items={cases.map((tc) => tc.test_case_id.toString())}
            strategy={rectSortingStrategy}
          >
            <div className="md:grid md:grid-cols-2 gap-4 flex flex-col">
              {cases.map((testCase) => (
                <SortableTestCase
                  key={testCase.test_case_id.toString()}
                  testCase={testCase}
                  featureId={id}
                  onClick={handleTestCaseClick}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedTestCases.some(
                    (tc) => tc.test_case_id === testCase.test_case_id,
                  )}
                  onSelect={toggleTestCaseSelection}
                />
              ))}
            </div>
          </SortableContext>
        </div>
      )}
    </div>
  );
}
