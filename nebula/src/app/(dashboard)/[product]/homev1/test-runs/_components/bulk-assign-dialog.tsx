"use client";

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
import { TestCaseUnderExecutionSchema } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "@/app/store/store";
import { bulkUpdateTestCases } from "@/app/store/testRunUnderExecutionSlice";
import { NOVA_USER } from "@/lib/constants";
import { isIOSProduct } from "@/lib/utils";
import { useProductSwitcher } from "@/providers/product-provider";

interface BulkAssignDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTcues: TestCaseUnderExecutionSchema[];
  onAssignComplete?: () => void;
  variant?: "test-cases" | "flows";
}

export function BulkAssignDialog({
  isOpen,
  onOpenChange,
  selectedTcues,
  onAssignComplete,
  variant = "test-cases",
}: BulkAssignDialogProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [isAssigning, setIsAssigning] = useState(false);
  const users = useSelector((state: RootState) => state.users.users);
  const dispatch = useDispatch();
  const { productSwitcher } = useProductSwitcher();

  const isIOS = isIOSProduct(productSwitcher);

  const labelSingular = variant === "flows" ? "flow" : "test case";
  const labelPlural = variant === "flows" ? "flows" : "test cases";
  const labelPluralUnderExecution =
    variant === "flows"
      ? "flows under execution"
      : "test cases under execution";

  const handleAssign = async () => {
    if (selectedTcues.length === 0) {
      toast.error(`No ${labelPluralUnderExecution} selected`);
      return;
    }

    if (!selectedUserId) {
      toast.error("Please select a user to assign");
      return;
    }

    setIsAssigning(true);
    try {
      const response = await fetch("/api/assign-tcue-to-users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          test_case_under_execution_ids: selectedTcues.map((tcue) => tcue.id),
          assignee_user_id: selectedUserId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `Failed to assign ${labelPluralUnderExecution}`,
        );
      }

      const result = await response.json();
      console.log("Test cases under execution assigned successfully:", result);

      dispatch(
        bulkUpdateTestCases({
          ids: selectedTcues.map((tcue) => tcue.id),
          updatedData: { assignee_user_id: selectedUserId },
        }),
      );

      toast.success(
        `Successfully assigned ${selectedTcues.length} ${labelPluralUnderExecution}`,
      );

      if (onAssignComplete) {
        onAssignComplete();
      }

      onOpenChange(false);
    } catch (error) {
      console.error(`Error assigning ${labelPluralUnderExecution}:`, error);
      toast.error(`Failed to assign ${labelPluralUnderExecution}`);
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{`Assign ${labelPlural.charAt(0).toUpperCase() + labelPlural.slice(1)}`}</DialogTitle>
          <DialogDescription>
            {`Select a team member to assign the selected ${labelPlural} to.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>Assign to</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a team member" />
              </SelectTrigger>
              <SelectContent>
                {!isIOS && (
                  <SelectItem key={NOVA_USER.user_id} value={NOVA_USER.user_id}>
                    {NOVA_USER.first_name} {NOVA_USER.last_name}
                  </SelectItem>
                )}
                {users.map((user) => (
                  <SelectItem key={user.user_id} value={user.user_id}>
                    {user.first_name} {user.last_name} ({user.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{`Selected ${labelPlural.charAt(0).toUpperCase() + labelPlural.slice(1)}`}</Label>
            <div className="p-3 border rounded-md bg-gray-50">
              <p className="text-sm text-gray-600">
                {selectedTcues.length} {labelSingular}
                {selectedTcues.length !== 1 ? "s" : ""} selected
              </p>
              {selectedTcues.length > 0 && (
                <div className="mt-2 max-h-20 overflow-y-auto">
                  <p className="text-xs text-gray-500">
                    {`${labelPlural.charAt(0).toUpperCase() + labelPlural.slice(1)}:`}{" "}
                    {selectedTcues.map((tcue) => tcue.id).join(", ")}
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
            disabled={isAssigning}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            className="bg-purple-600 hover:bg-purple-700 text-white"
            disabled={
              isAssigning || selectedTcues.length === 0 || !selectedUserId
            }
          >
            {isAssigning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Assigning...
              </>
            ) : (
              "Assign"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
