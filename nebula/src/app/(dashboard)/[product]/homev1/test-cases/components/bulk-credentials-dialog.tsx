import { useState, useEffect } from "react";
import { useDispatch } from "react-redux";
import { Label } from "@/components/ui/label";
import { testCaseSchema } from "@/lib/types";
import { TestCaseCredentials } from "@/components/ui/test-case-credentials";
import { fetchCredentials } from "@/app/store/credentialsSlice";
import type { AppDispatch } from "@/app/store/store";
import { BulkUpdateDialog } from "@/components/global/bulk-update-dialog";

interface BulkCredentialsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTestCases: testCaseSchema[];
  exitSelectionMode: () => void;
}

export function BulkCredentialsDialog({
  isOpen,
  onOpenChange,
  selectedTestCases,
  exitSelectionMode,
}: BulkCredentialsDialogProps) {
  const dispatch = useDispatch<AppDispatch>();
  const [selectedCredentials, setSelectedCredentials] = useState<string[]>([]);

  useEffect(() => {
    if (
      isOpen &&
      selectedTestCases.length > 0 &&
      selectedTestCases[0].product_id
    ) {
      dispatch(fetchCredentials(selectedTestCases[0].product_id));
    }
  }, [isOpen, selectedTestCases, dispatch]);

  const handleCredentialChange = (credentialId: string) => {
    setSelectedCredentials((prev) => {
      const isSelected = prev.includes(credentialId);
      if (isSelected) {
        return prev.filter((id) => id !== credentialId);
      } else {
        return [...prev, credentialId];
      }
    });
  };

  const handleCredentialRemove = (credentialId: string) => {
    setSelectedCredentials((prev) => prev.filter((id) => id !== credentialId));
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedCredentials([]);
    }
    onOpenChange(open);
  };

  return (
    <BulkUpdateDialog
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      selectedTestCases={selectedTestCases}
      exitSelectionMode={exitSelectionMode}
      title="Update Credentials"
      description="Select credentials to assign to the selected test cases."
      updateField="credentials"
      updateFieldValue={selectedCredentials}
      isValid={selectedCredentials.length > 0}
      validationMessage="Please select at least one credential"
    >
      <div className="space-y-2">
        <Label>Credentials</Label>
        <TestCaseCredentials
          productId={selectedTestCases[0]?.product_id}
          credentialIds={selectedCredentials}
          testCaseId={undefined}
          isEditing={true}
          isSaving={false}
          onCredentialRemove={handleCredentialRemove}
          onCredentialChange={handleCredentialChange}
          showAddCredentials={false}
          showDefaultCredentials={false}
          isBulkMode={true}
        />
      </div>
    </BulkUpdateDialog>
  );
}
