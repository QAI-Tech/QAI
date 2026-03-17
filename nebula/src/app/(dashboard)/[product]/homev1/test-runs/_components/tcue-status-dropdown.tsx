"use client";

import { TestCaseUnderExecutionStatus } from "@/lib/types";
import {
  GenericDropdown,
  type DropdownOption,
} from "@/components/ui/generic-dropdown";

interface TestCaseUnderExecutionStatusDropdownProps {
  value: TestCaseUnderExecutionStatus;
  onChange: (status: TestCaseUnderExecutionStatus) => Promise<void> | void;
  disabled?: boolean;
  isLoading?: boolean;
}

const statusOptions: DropdownOption[] = [
  {
    value: TestCaseUnderExecutionStatus.UNTESTED,
    label: "UNTESTED",
    className: "text-blue-600 bg-blue-100",
  },
  {
    value: TestCaseUnderExecutionStatus.PASSED,
    label: "PASSED",
    className: "text-emerald-600 bg-emerald-100",
  },
  {
    value: TestCaseUnderExecutionStatus.FAILED,
    label: "FAILED",
    className: "text-red-600 bg-red-100",
  },
  {
    value: TestCaseUnderExecutionStatus.ATTEMPT_FAILED,
    label: "ATTEMPT FAILED",
    className: "text-orange-600 bg-orange-100",
  },
  {
    value: TestCaseUnderExecutionStatus.SKIPPED,
    label: "SKIPPED",
    className: "text-gray-600 bg-gray-100",
  },
];

export function TestCaseUnderExecutionStatusDropdown({
  value,
  onChange,
  disabled = false,
  isLoading = false,
}: TestCaseUnderExecutionStatusDropdownProps) {
  const handleChange = async (newStatus: string) => {
    await onChange(newStatus as TestCaseUnderExecutionStatus);
  };

  return (
    <GenericDropdown
      value={value}
      options={statusOptions}
      onChange={handleChange}
      disabled={disabled}
      isLoading={isLoading}
      placeholder="Select status"
      className="w-30 h-8 text-base font-medium rounded-xl"
    />
  );
}
