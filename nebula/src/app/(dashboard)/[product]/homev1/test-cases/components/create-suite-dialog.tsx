"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useProductSwitcher } from "@/providers/product-provider";
import type { testCaseSchema } from "@/lib/types";
import * as Sentry from "@sentry/nextjs";
import { validateInputWithMessage, ValidationPatterns } from "@/lib/utils";
import { addTestSuite } from "@/app/store/testSuiteSlice";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/app/store/store";

interface CreateSuiteDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  selectedTestCases: testCaseSchema[];
  exitSelectionMode: () => void;
}

export function CreateSuiteDialog({
  isOpen,
  onOpenChange,
  selectedTestCases,
  exitSelectionMode,
}: CreateSuiteDialogProps) {
  const { productSwitcher } = useProductSwitcher();
  const [isCreating, setIsCreating] = useState(false);
  const [suiteName, setSuiteName] = useState("");
  const [suiteNameError, setSuiteNameError] = useState<string | undefined>(
    undefined,
  );

  const dispatch = useDispatch<AppDispatch>();

  // Reset suite name when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setSuiteName("");
      setSuiteNameError(undefined);
    }
  }, [isOpen]);

  // Validate suite name
  const validateSuiteName = () => {
    const validationResult = validateInputWithMessage(
      ValidationPatterns.generalName,
      suiteName,
      "Please enter a valid suite name",
    );

    setSuiteNameError(
      validationResult.isValid ? undefined : validationResult.errorMessage,
    );
    return validationResult.isValid;
  };

  // Handler for input change
  const handleSuiteNameChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSuiteName(e.target.value);

    // Clear error when typing or validate immediately if there was an error
    if (suiteNameError) {
      validateSuiteName();
    }
  };

  const handleCreateSuite = async () => {
    // Validate the suite name before proceeding
    if (!validateSuiteName()) {
      return;
    }

    if (selectedTestCases.length === 0) {
      toast.error("Please select at least one test case");
      return;
    }

    setIsCreating(true);
    try {
      const requestBody = {
        product_id: productSwitcher.product_id,
        name: suiteName.trim(),
        test_case_ids: selectedTestCases.map((tc) => String(tc.test_case_id)),
      };

      const response = await fetch("/api/create-test-suite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Backend error:", errorText);
        throw new Error(`Failed to create test suite: ${errorText}`);
      }

      const result = await response.json();
      console.log("Suite created successfully:", result);

      dispatch(addTestSuite(result));

      toast.success(
        `Test suite "${suiteName}" created successfully with ${selectedTestCases.length} test cases`,
      );

      onOpenChange(false);
      exitSelectionMode();
    } catch (error) {
      console.error("Error creating test suite:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error(
        error instanceof Error ? error.message : "Failed to create test suite",
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Test Suite</DialogTitle>
          <DialogDescription>
            Create a new test suite with the selected test cases.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="suiteName">Suite Name</Label>
            <Textarea
              id="suiteName"
              placeholder="Enter suite name..."
              value={suiteName}
              onChange={handleSuiteNameChange}
              onBlur={validateSuiteName}
              disabled={isCreating}
              className={`min-h-[80px] resize-none ${suiteNameError ? "border-red-500" : ""}`}
            />
            {suiteNameError && (
              <p className="text-sm text-red-500 mt-1">{suiteNameError}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Selected Test Cases</Label>
            <div className="p-3 border rounded-md bg-gray-50">
              <p className="text-sm text-gray-600">
                {selectedTestCases.length} test case
                {selectedTestCases.length !== 1 ? "s" : ""} selected
              </p>
              {selectedTestCases.length > 0 && (
                <div className="mt-2 max-h-20 overflow-y-auto">
                  <p className="text-xs text-gray-500">
                    Test case IDs:{" "}
                    {selectedTestCases.map((tc) => tc.test_case_id).join(", ")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateSuite}
            className="bg-purple-600 hover:bg-purple-700 text-white"
            disabled={
              !suiteName.trim() ||
              isCreating ||
              selectedTestCases.length === 0 ||
              !!suiteNameError
            }
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Suite...
              </>
            ) : (
              "Create Suite"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
