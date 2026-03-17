"use client"

import { Textarea } from "@/components/ui/textarea"
import type { GenericFieldProps } from "@/lib/types"

export function GenericField({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  readOnly = false,
  className = "",
  minHeight = "min-h-[100px]",
}: GenericFieldProps) {
  if (readOnly) {
    return (
      <div className={`space-y-2 ${className}`}>
        {label && <h3 className="text-lg font-medium">{label}</h3>}
        <div className={`rounded-lg border p-3 bg-gray-50 ${minHeight}`}>
          {value || <span className="text-gray-500">No content available</span>}
        </div>
      </div>
    )
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {label && <h3 className="text-lg font-medium">{label}</h3>}
      <Textarea
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`${minHeight} w-full border border-gray-200 rounded-md p-3 focus:ring-1 focus:ring-purple-500`}
      />
    </div>
  )
}
