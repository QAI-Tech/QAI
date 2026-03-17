"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { testCaseSchema } from "@/lib/types";

interface ConfiremUpdateLinkedDialogBox {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  selectedTestCases: string[];
  testCase: testCaseSchema;
  saveTestCase: () => void;
  cancelSaveTestCase: () => void; // Added this to exit from the selection mode after the task is completed.
}

export function ConfirmLinkedUpdateDialogBox({
  isOpen,
  onOpenChange,
  selectedTestCases,
  testCase,
  saveTestCase,
}: ConfiremUpdateLinkedDialogBox) {
  const [isSaving, setIsSaving] = useState(false);
  const handleSaveTestCase = async () => {
    setIsSaving(true);
    await saveTestCase();
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Update Test Case</DialogTitle>
          <DialogDescription>
            Following test cases will also be updated with this test case
          </DialogDescription>
        </DialogHeader>
        {testCase.mirrored_test_cases &&
          testCase.mirrored_test_cases.length > 0 && (
            <ul className="my-2 ml-6 list-disc text-sm text-gray-700">
              {testCase.mirrored_test_cases
                .filter((tc) => selectedTestCases.includes(tc.test_case_id))
                .map((tc) => (
                  <li key={tc.test_case_id}>
                    {tc.test_case_id} - {tc.product_name}
                  </li>
                ))}
            </ul>
          )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveTestCase}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Test Case"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
