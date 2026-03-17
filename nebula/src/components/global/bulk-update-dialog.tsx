import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { testCaseSchema } from "@/lib/types";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/app/store/store";
import { updateTestCase } from "@/app/store/testCaseSlice";
import * as Sentry from "@sentry/nextjs";

interface BulkUpdateDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTestCases: testCaseSchema[];
  exitSelectionMode: () => void;
  title: string;
  description: string;
  updateField: string;
  updateFieldValue: string | string[] | number | boolean;
  children: React.ReactNode;
  onUpdateComplete?: () => void;
  isValid?: boolean;
  validationMessage?: string;
}

export function BulkUpdateDialog({
  isOpen,
  onOpenChange,
  selectedTestCases,
  exitSelectionMode,
  title,
  description,
  updateField,
  updateFieldValue,
  children,
  onUpdateComplete,
  isValid = true,
  validationMessage = "Please make a selection",
}: BulkUpdateDialogProps) {
  const dispatch = useDispatch<AppDispatch>();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleSave = async () => {
    if (selectedTestCases.length === 0) {
      toast.error("No test cases selected");
      return;
    }

    if (!isValid) {
      toast.error(validationMessage);
      return;
    }

    setIsUpdating(true);
    try {
      const updatePromises = selectedTestCases.map(async (testCase) => {
        try {
          const updatedTestCase = {
            ...testCase,
            [updateField]: updateFieldValue,
          };

          const response = await fetch("/api/update-test-case", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ testCase: updatedTestCase }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(
              errorData.error ||
                `Failed to update test case ${testCase.test_case_id}`,
            );
          }

          await response.json();

          dispatch(
            updateTestCase({
              id: testCase.test_case_id,
              updatedData: { [updateField]: updateFieldValue },
            }),
          );

          return { testCaseId: testCase.test_case_id, success: true };
        } catch (error) {
          console.error(
            `Error updating test case ${testCase.test_case_id}:`,
            error,
          );
          return { testCaseId: testCase.test_case_id, success: false, error };
        }
      });

      const results = await Promise.all(updatePromises);

      const successful = results.filter((result) => result.success);
      const failed = results.filter((result) => !result.success);

      if (successful.length > 0) {
        toast.success(`Successfully updated ${successful.length} test cases`);
      }

      if (failed.length > 0) {
        Sentry.captureMessage(
          `Failed to update ${failed.length} test cases: ${failed
            .map((f) => f.testCaseId)
            .join(", ")}`,
          {
            level: "error",
            tags: { priority: "high" },
          },
        );
        toast.error(`Failed to update ${failed.length} test cases`);
        console.error("Failed updates:", failed);
      }

      if (successful.length > 0) {
        onUpdateComplete?.();
        onOpenChange(false);
        exitSelectionMode();
      }
    } catch (error) {
      console.error("Error updating test cases:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error(
        error instanceof Error ? error.message : "Failed to update test cases",
      );
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {children}

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
                    Test cases:{" "}
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
            disabled={isUpdating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="bg-purple-600 hover:bg-purple-700 text-white"
            disabled={isUpdating || selectedTestCases.length === 0 || !isValid}
          >
            {isUpdating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              "Update"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
