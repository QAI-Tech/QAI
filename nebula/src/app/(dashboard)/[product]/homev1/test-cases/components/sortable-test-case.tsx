"use client";

import type React from "react";
import { useMemo } from "react";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Checkbox } from "@/components/ui/checkbox";
import { TestCaseFrame } from "./test-case-frame";
import type { testCaseSchema, Criticality } from "@/lib/types";
import { CriticalityBadge } from "@/components/CriticalityBadge";
import { useDispatch } from "react-redux";
import { updateTestCase } from "@/app/store/testCaseSlice";
import { useUser } from "@clerk/nextjs";
import { isQaiOrgAnalystUser, isQaiOrgUser } from "@/lib/constants";
import { Network, MessageCircleMore } from "lucide-react";

interface SortableTestCaseProps {
  testCase: testCaseSchema;
  featureId: string;
  onClick: (testCase: testCaseSchema) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: (testCase: testCaseSchema) => void;
}

export function SortableTestCase({
  testCase,
  featureId,
  onClick,
  isSelectionMode = false,
  isSelected = false,
  onSelect,
}: SortableTestCaseProps) {
  const dispatch = useDispatch();

  const { user } = useUser();

  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;

  const isQaiUser = isQaiOrgUser(userOrgId) || isQaiOrgAnalystUser(userOrgId);
  const showCustomerBadge = testCase.created_by && isQaiUser;

  // Set up sortable functionality for the test case
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: testCase.test_case_id.toString(),
    data: {
      type: "test-case",
      featureId,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition, // Remove transition during drag
    zIndex: isDragging ? 1000 : "auto",
    opacity: isDragging ? 0.8 : 1,
    cursor: isDragging ? "grabbing" : "grab",
    touchAction: "none",
  } as const;

  const handleClick = (e: React.MouseEvent) => {
    // Prevent drag handlers from interfering with click functionality
    if (isSelectionMode && onSelect) {
      e.stopPropagation();
      onSelect(testCase);
    } else {
      onClick(testCase);
    }
  };

  const scenariosCount = testCase.scenarios?.length || 0;
  const commentsCount = useMemo(() => {
    if (!testCase.comments) return 0;

    try {
      // Try to parse as JSON array first
      const parsedComments = JSON.parse(testCase.comments);
      return Array.isArray(parsedComments) ? parsedComments.length : 0;
    } catch {
      // If not JSON, treat as single comment if not empty
      return testCase.comments.trim() ? 1 : 0;
    }
  }, [testCase.comments]);

  const handleCriticalityChange = (newCriticality: Criticality) => {
    dispatch(
      updateTestCase({
        id: testCase.test_case_id,
        updatedData: { criticality: newCriticality },
      }),
    );
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`block rounded-lg border border-gray-200 bg-white p-3 transition-shadow hover:shadow-lg cursor-pointer relative ${
        isDragging ? "shadow-2xl border-purple-300 transform scale-105" : ""
      } select-none touch-none`}
      {...attributes}
      {...listeners}
      onClick={handleClick}
    >
      {isSelectionMode && (
        <div className="absolute top-2 left-2 z-10">
          <Checkbox
            checked={isSelected}
            className="border-gray-300 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
            onClick={(e) => e.stopPropagation()}
            onCheckedChange={() => onSelect && onSelect(testCase)}
          />
        </div>
      )}

      <div className="flex h-[180px]">
        <div className="flex flex-1 flex-col min-w-0">
          <div className={`mt-2 ${isSelectionMode ? "ml-10" : "ml-4"}`}>
            <p className="flex-1 text-black font-normal line-clamp-4 break-words overflow-hidden">
              {testCase.title || testCase.test_case_description}
            </p>
          </div>
          <div className={`mt-auto mb-4 ${isSelectionMode ? "ml-10" : "ml-4"}`}>
            <div className="flex items-center gap-3 flex-wrap">
              {showCustomerBadge && (
                <span className="rounded-full text-sm font-semibold shadow-sm px-2 py-1 truncate bg-blue-100 text-blue-600">
                  Added by customer
                </span>
              )}

              {/* Scenarios count */}
              {scenariosCount > 0 && (
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <Network className="w-4 h-4" />
                  <span className="font-medium">{scenariosCount}</span>
                </div>
              )}

              {/* Comments count */}
              {isQaiUser && commentsCount > 0 && (
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <MessageCircleMore className="w-4 h-4" />
                  <span className="font-medium">{commentsCount}</span>
                </div>
              )}
            </div>

            <span className="rounded-full text-sm font-semibold shadow-sm px-2 py-1 truncate bg-purple-100 text-purple-600 ml-2 hidden">
              {testCase.test_case_type}
            </span>
          </div>
          <p
            className={`text-sm text-gray-500 hidden ${isSelectionMode ? "ml-10" : "ml-4"}`}
          >
            <CriticalityBadge
              criticality={testCase.criticality}
              Id={testCase.test_case_id}
              testCase={testCase}
              onCriticalityChange={handleCriticalityChange}
            />
          </p>
        </div>
        <div className="relative h-full w-auto overflow-hidden rounded-lg ml-4 flex-shrink-0">
          <TestCaseFrame screenshotUrl={testCase.screenshot_url || ""} />
        </div>
      </div>
    </div>
  );
}
