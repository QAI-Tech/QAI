"use client";

import { useState } from "react";
import { TestCaseUnderExecutionStatusDropdown } from "@/app/(dashboard)/[product]/homev1/test-runs/_components/tcue-status-dropdown";
import { CollapsibleSteps } from "@/components/ui/steps";
import { CollapsiblePreconditions } from "@/components/ui/preconditions";
import { EditableField } from "@/components/ui/editable-field";
import { TestCaseCredentials } from "@/components/ui/test-case-credentials";
import { PreconditionTestCase } from "@/components/ui/precondition-test-case";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { TestCaseUnderExecutionStatus } from "@/lib/types";
import type {
  TestCaseUnderExecutionSchema,
  TestCaseStep,
  testCaseSchema,
  SaveTestCaseUnderExecutionFunction,
} from "@/lib/types";
import { useUser } from "@clerk/nextjs";
import { isQaiOrgUser, isQaiOrgAnalystUser } from "@/lib/constants";
import { toast } from "sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store/store";

export interface TCUEDetailsSectionProps {
  testCase: TestCaseUnderExecutionSchema;
  testCaseWithCredentials?: testCaseSchema;
  onStatusChange: (status: TestCaseUnderExecutionStatus) => Promise<void>;
  onFieldUpdate: (
    field: string,
    value: string | string[] | TestCaseStep[],
  ) => Promise<void>;
  isLoading: { status: boolean; action?: string | null };
  preconditionsCollapsed?: boolean;
  stepsCollapsed?: boolean;
  onSaveTestCase: SaveTestCaseUnderExecutionFunction;
  isCredentialsOpen: boolean;
  setIsCredentialsOpen: (open: boolean) => void;
  credentialsLoading: boolean;
  shouldShowCredentials?: boolean;
}

export function TCUEDetailsSection({
  testCase,
  testCaseWithCredentials,
  onStatusChange,
  onFieldUpdate,
  isLoading,
  preconditionsCollapsed = true,
  stepsCollapsed = true,
  onSaveTestCase,
  isCredentialsOpen,
  setIsCredentialsOpen,
  credentialsLoading,
  shouldShowCredentials,
}: TCUEDetailsSectionProps) {
  const [isPreconditionsCollapsed, setIsPreconditionsCollapsed] = useState(
    preconditionsCollapsed,
  );
  const [isStepsCollapsed, setIsStepsCollapsed] = useState(stepsCollapsed);
  const { user } = useUser();
  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;
  const isQaiUser = isQaiOrgUser(userOrgId) || isQaiOrgAnalystUser(userOrgId);

  // Get all test cases from Redux store for precondition dropdown
  const allTestCases = useSelector(
    (state: RootState) => state.testCases.testCases,
  );

  // Get the related test case that contains precondition_test_case_id
  const relatedTestCase = allTestCases.find(
    (tc) => tc.test_case_id === testCase.test_case_id,
  );

  // Only show notes for non-QAI users if it has content
  const shouldShowNotes =
    isQaiUser || (testCase.notes && testCase.notes.trim() !== "");

  // Field update handlers using the passed save function
  const handleFieldUpdate = async (
    field: string,
    value: string | string[] | TestCaseStep[],
  ) => {
    const updateData: Parameters<typeof onSaveTestCase>[0] = {};

    if (field === "notes") {
      if (
        testCase.status === TestCaseUnderExecutionStatus.FAILED &&
        (!value || (value as string).trim() === "")
      ) {
        toast.error("Cannot clear notes when test case status is FAILED");
        return;
      }
      updateData.notes = value as string;
    } else if (field === "test_case_description") {
      updateData.test_case_description = value as string;
    } else if (field === "preconditions") {
      updateData.preconditions = Array.isArray(value)
        ? (value as string[])
        : [value as string];
    } else if (field === "test_case_steps") {
      updateData.test_case_steps = value as TestCaseStep[];
    }

    const success = await onSaveTestCase(updateData);
    if (success) {
      toast.success("Updated successfully");
      if (onFieldUpdate) {
        await onFieldUpdate(field, value);
      }
    }
  };

  // Dummy handler for precondition test case change (read-only display)
  const handlePreconditionTestCaseChange = () => {};

  // Outcome Section Component
  const OutcomeSection = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-bold py-2">Outcome</h2>
        <div className="w-32">
          <TestCaseUnderExecutionStatusDropdown
            value={testCase.status || TestCaseUnderExecutionStatus.UNTESTED}
            onChange={onStatusChange}
            disabled={isLoading.status || !isQaiUser}
            isLoading={isLoading.status}
          />
        </div>
      </div>

      {/* Notes field */}
      {shouldShowNotes && (
        <div className="mt-4">
          <EditableField
            value={testCase.notes || ""}
            onSave={async (value) => {
              await handleFieldUpdate("notes", value);
            }}
            placeholder="Add notes about the test execution..."
            disabled={isLoading.status || !isQaiUser}
            minHeight="min-h-[80px]"
          />
        </div>
      )}
    </div>
  );

  // Description Section Component
  const DescriptionSection = () => (
    <div className="space-y-3">
      <h3 className="text-lg font-bold py-2">Full Description</h3>
      <EditableField
        value={testCase.test_case_description || ""}
        onSave={async (value) => {
          await handleFieldUpdate("test_case_description", value);
        }}
        placeholder="Test case description..."
        disabled={isLoading.status || !isQaiUser}
        minHeight="min-h-[100px]"
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <DescriptionSection />
      <hr className="border-gray-200" />
      <OutcomeSection />

      {/* Border */}
      <hr className="border-gray-200" />

      {/* Precondition Test Case Section */}
      {relatedTestCase && (
        <>
          <PreconditionTestCase
            testCase={relatedTestCase}
            allTestCases={allTestCases}
            onPreconditionTestCaseChange={handlePreconditionTestCaseChange}
            isEditing={false}
            isLoading={isLoading.status}
          />

          {/* Border */}
          <hr className="border-gray-200" />
        </>
      )}

      {/* Collapsible Preconditions */}
      <CollapsiblePreconditions
        preconditions={testCase.preconditions || []}
        isCollapsed={isPreconditionsCollapsed}
        onToggle={() => setIsPreconditionsCollapsed(!isPreconditionsCollapsed)}
        onSave={
          isQaiUser
            ? async (value) => {
                const preconditionsArray = value
                  .split("\n")
                  .filter((p) => p.trim() !== "");
                await handleFieldUpdate("preconditions", preconditionsArray);
              }
            : undefined
        }
        disabled={isLoading.status || !isQaiUser}
      />

      {/* Border */}
      <hr className="border-gray-200" />

      {/* Collapsible Steps */}
      <CollapsibleSteps
        steps={testCase.test_case_steps || []}
        isCollapsed={isStepsCollapsed}
        onToggle={() => setIsStepsCollapsed(!isStepsCollapsed)}
        onSave={
          isQaiUser
            ? async (steps) => {
                await handleFieldUpdate("test_case_steps", steps);
              }
            : undefined
        }
        disabled={isLoading.status || !isQaiUser}
        readOnly={!isQaiUser}
        isQaiUser={isQaiUser}
      />

      {shouldShowCredentials && (
        <>
          <hr className="border-gray-200" />
          <Collapsible
            open={isCredentialsOpen}
            onOpenChange={setIsCredentialsOpen}
          >
            <CollapsibleTrigger asChild>
              <button className="flex w-full items-center justify-between py-2 text-lg font-bold hover:text-purple-600 transition-colors">
                <span>Credentials</span>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 transition-transform",
                    isCredentialsOpen && "rotate-180",
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="rounded-lg border bg-white p-4">
                <TestCaseCredentials
                  productId={testCase.product_id}
                  credentialIds={
                    testCase.credentials || testCaseWithCredentials?.credentials
                  }
                  testCaseId={testCase.test_case_id}
                  isEditing={false}
                  isSaving={isLoading.status || credentialsLoading}
                  onCredentialRemove={() => {}}
                  onCredentialChange={() => {}}
                  showAddCredentials={false}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}
    </div>
  );
}
