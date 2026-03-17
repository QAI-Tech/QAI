import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { testCaseSchema } from "@/lib/types";
import { BulkUpdateDialog } from "@/components/global/bulk-update-dialog";

interface BulkPreconditionsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTestCases: testCaseSchema[];
  exitSelectionMode: () => void;
}

export function BulkPreconditionsDialog({
  isOpen,
  onOpenChange,
  selectedTestCases,
  exitSelectionMode,
}: BulkPreconditionsDialogProps) {
  const [preconditionsText, setPreconditionsText] = useState("");

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setPreconditionsText("");
    }
    onOpenChange(open);
  };

  const getPreconditionsList = (text: string): string[] => {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  };

  return (
    <BulkUpdateDialog
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      selectedTestCases={selectedTestCases}
      exitSelectionMode={exitSelectionMode}
      title="Update Preconditions"
      description="Enter each precondition on a new line."
      updateField="preconditions"
      updateFieldValue={getPreconditionsList(preconditionsText)}
      isValid={getPreconditionsList(preconditionsText).length > 0}
      validationMessage="Please enter at least one precondition"
    >
      <div className="space-y-2">
        <Label>Preconditions</Label>
        <Textarea
          value={preconditionsText}
          onChange={(e) => setPreconditionsText(e.target.value)}
          placeholder="Enter each precondition on a new line..."
          className="min-h-[100px]"
        />
      </div>
    </BulkUpdateDialog>
  );
}
