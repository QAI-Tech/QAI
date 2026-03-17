"use client";

import { cn } from "@/lib/utils";
import { Criticality } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CriticalitySelectProps {
  value: Criticality | "";
  onValueChange: (value: Criticality) => void;
  disabled?: boolean;
  className?: string;
}

export function CriticalitySelect({
  value,
  onValueChange,
  disabled = false,
  className,
}: CriticalitySelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        className={cn(
          "w-15 h-8 text-base font-medium rounded-xl",
          value === Criticality.HIGH
            ? "text-red-600 bg-red-100"
              : value === Criticality.LOW
                ? "text-green-600 bg-green-100"
                : "text-gray-600 bg-gray-100",
          className
        )}
      >
        <SelectValue placeholder="Criticality" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={Criticality.HIGH}>HIGH</SelectItem>
        <SelectItem value={Criticality.LOW}>LOW</SelectItem>
      </SelectContent>
    </Select>
  );
} 