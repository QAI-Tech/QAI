"use client";

import { TestCaseStatus } from "@/lib/types";
import {
  GenericDropdown,
  type DropdownOption,
} from "@/components/ui/generic-dropdown";

interface TestCaseStatusDropdownProps {
  value: TestCaseStatus;
  onChange: (status: TestCaseStatus) => Promise<void>;
  disabled?: boolean;
  isLoading?: boolean;
}

const statusOptions: DropdownOption[] = [
  {
    value: TestCaseStatus.RAW,
    label: "RAW",
    className: "text-gray-600 bg-gray-100",
  },
  {
    value: TestCaseStatus.VERIFIED,
    label: "VERIFIED",
    className: "text-emerald-600 bg-emerald-100",
  },
  {
    value: TestCaseStatus.UNVERIFIED,
    label: "UNVERIFIED",
    className: "text-red-600 bg-red-100",
  },
];

export function TestCaseStatusDropdown({
  value,
  onChange,
  disabled = false,
  isLoading = false,
}: TestCaseStatusDropdownProps) {
  const handleChange = async (newStatus: string) => {
    await onChange(newStatus as TestCaseStatus);
  };

  return (
    <GenericDropdown
      value={value}
      options={statusOptions}
      onChange={handleChange}
      disabled={disabled}
      isLoading={isLoading}
      placeholder="Status"
      className="w-28 h-8 text-sm font-medium"
    />
  );
}

export { TestCaseStatus };
