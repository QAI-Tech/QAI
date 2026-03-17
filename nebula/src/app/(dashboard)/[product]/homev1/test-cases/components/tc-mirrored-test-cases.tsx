"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Check, Smartphone, X, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import type {
  testCaseSchema,
  SaveTestCaseFunction,
  MirroredTestCase,
} from "@/lib/types";
import * as Sentry from "@sentry/nextjs";

interface TCMirroredTestCasesProps {
  testCase: testCaseSchema;
  isEditing: boolean;
  onSaveTestCase: SaveTestCaseFunction;
  isLoading: boolean;
  isQaiUser: boolean;
}

export function TCMirroredTestCases({
  testCase,
  isEditing,
  onSaveTestCase,
  isLoading,
  isQaiUser,
}: TCMirroredTestCasesProps) {
  const [selectedMirroredTestCases, setSelectedMirroredTestCases] = useState<
    string[]
  >([]);
  const [isDeviceDropdownOpen, setIsDeviceDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Ensure mirroredTestCases is always an array
  const mirroredTestCases: MirroredTestCase[] =
    testCase.mirrored_test_cases || [];

  // Initialize selected mirrored test cases from props
  useEffect(() => {
    setSelectedMirroredTestCases(
      mirroredTestCases.map((tc) => tc.test_case_id),
    );
  }, [mirroredTestCases]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDeviceDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleDeviceToggle = (test_case_id: string) => {
    setSelectedMirroredTestCases((prev) => {
      if (prev.includes(test_case_id)) {
        return prev.filter((id) => id !== test_case_id);
      } else {
        return [...prev, test_case_id];
      }
    });
  };

  const handleRemoveLinkedTestCase = (test_case_id: string) => {
    setSelectedMirroredTestCases((prev) =>
      prev.filter((id) => id !== test_case_id),
    );
  };

  const handleSelectAll = () => {
    setSelectedMirroredTestCases(
      mirroredTestCases.map((tc) => tc.test_case_id),
    );
  };

  const handleDeselectAll = () => {
    setSelectedMirroredTestCases([]);
  };

  // Filter options by search
  const filteredDeviceOptions = mirroredTestCases.filter(
    (linked_test_case) =>
      linked_test_case.product_name
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      (linked_test_case.test_case_id?.toLowerCase() || "").includes(
        searchQuery.toLowerCase(),
      ),
  );

  // Save changes to parent test case
  const handleSaveMirroredTestCases = useCallback(async () => {
    if (isLoading) return;

    // Filter the original mirroredTestCases array based on selected IDs
    const linkedSaveTestCasesToSave: MirroredTestCase[] =
      mirroredTestCases.filter((tc) =>
        selectedMirroredTestCases.includes(tc.test_case_id),
      );

    const success = await onSaveTestCase({
      mirrored_test_cases: linkedSaveTestCasesToSave,
    });
    if (success) {
      toast.success("Mirrored test cases updated successfully");
    } else {
      Sentry.captureMessage("Failed to update mirrored test cases", {
        level: "error", // or "fatal"
        tags: { priority: "high" },
      });
      toast.error("Failed to update mirrored test cases");
    }
    setIsDeviceDropdownOpen(false);
  }, [isLoading, mirroredTestCases, selectedMirroredTestCases, onSaveTestCase]);

  // Only render for QAI users
  if (!isQaiUser) {
    return null;
  }

  return (
    <div className="space-y-1">
      <Label className="text-sm font-medium">Mirrored Test Case(s)</Label>
      <div className="relative" ref={dropdownRef}>
        {/* Chips for selected test cases */}
        <div className="relative">
          <div
            className={cn(
              "flex flex-wrap gap-1 min-h-[38px] p-2 border rounded-md cursor-pointer pr-10",
              "border-gray-200",
              selectedMirroredTestCases.length > 0 ? "pb-1" : "",
              !isEditing ? "bg-gray-100 cursor-not-allowed" : "",
            )}
            onClick={() => {
              if (isEditing) {
                setIsDeviceDropdownOpen(!isDeviceDropdownOpen);
              }
            }}
            aria-disabled={!isEditing}
          >
            {selectedMirroredTestCases.length === 0 ? (
              <span className="text-gray-500 text-sm py-0.5">
                No Mirrored Test Case
              </span>
            ) : (
              <>
                {selectedMirroredTestCases.map((test_case_id) => {
                  const mirrored_test_case = mirroredTestCases.find(
                    (tc) => tc.test_case_id === test_case_id,
                  );
                  if (!mirrored_test_case) return null;
                  return (
                    <div
                      key={mirrored_test_case.test_case_id}
                      className="bg-purple-100 text-purple-800 text-xs rounded-full py-1 px-3 flex items-center gap-1"
                    >
                      <Smartphone className="h-3 w-3" />
                      <span>
                        {mirrored_test_case.test_case_id} -{" "}
                        {mirrored_test_case.product_name}
                      </span>
                      {isEditing && (
                        <X
                          className="h-3 w-3 cursor-pointer hover:text-purple-950"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveLinkedTestCase(
                              mirrored_test_case.test_case_id,
                            );
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
          {/* Down arrow button */}
          <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
            <ChevronDown className="h-5 w-5 text-gray-400" />
          </div>
        </div>
        {/* Dropdown menu */}
        {isDeviceDropdownOpen && isEditing && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
            {/* Search input */}
            <div className="p-2 border-b">
              <Input
                type="text"
                placeholder="Search devices..."
                className="w-full text-sm border-gray-200"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            {/* Select/Deselect all */}
            <div className="flex justify-between items-center px-3 py-2 border-b">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleSelectAll}
                className="mr-2 bg-transparent"
              >
                Select All
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleDeselectAll}
              >
                Deselect All
              </Button>
            </div>
            {/* Device list */}
            <div className="max-h-60 overflow-y-auto py-1">
              {filteredDeviceOptions.length > 0 ? (
                filteredDeviceOptions.map((mirrored_test_case) => (
                  <div
                    key={mirrored_test_case.test_case_id}
                    className="flex items-center px-3 py-2 hover:bg-purple-50 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeviceToggle(mirrored_test_case.test_case_id);
                    }}
                  >
                    <div
                      className={`w-5 h-5 rounded border flex-none flex items-center justify-center mr-2 ${
                        selectedMirroredTestCases.includes(
                          mirrored_test_case.test_case_id,
                        )
                          ? "bg-purple-600 border-purple-600"
                          : "border-gray-300"
                      }`}
                    >
                      {selectedMirroredTestCases.includes(
                        mirrored_test_case.test_case_id,
                      ) && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div className="flex-1 flex flex-col">
                      <span className="text-sm font-medium">
                        {mirrored_test_case.test_case_id}
                      </span>
                      <span className="text-xs text-gray-500">
                        {mirrored_test_case.product_name}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-3 py-2 text-sm text-gray-500">
                  No test case(s) match your search
                </div>
              )}
            </div>
            {/* Done button */}
            <div className="p-2 border-t flex justify-between">
              <span className="text-xs text-gray-500 flex items-center">
                {selectedMirroredTestCases.length} test case(s) selected
              </span>
              <Button
                type="button"
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 h-8 px-3"
                onClick={handleSaveMirroredTestCases}
                disabled={isLoading}
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
