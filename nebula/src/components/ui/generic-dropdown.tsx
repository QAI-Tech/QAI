"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export interface DropdownOption {
  value: string
  label: string
  className?: string
}

interface GenericDropdownProps {
  value: string
  options: DropdownOption[]
  onChange: (value: string) => Promise<void> | void
  disabled?: boolean
  isLoading?: boolean
  placeholder?: string
  className?: string
  triggerClassName?: string
  getOptionClassName?: (value: string) => string
}

export function GenericDropdown({
  value,
  options,
  onChange,
  disabled = false,
  isLoading = false,
  placeholder = "Select option",
  className = "w-32 h-8 text-sm font-medium",
  triggerClassName,
  getOptionClassName,
}: GenericDropdownProps) {
  const handleValueChange = async (newValue: string) => {
    if (newValue !== value && !isLoading && !disabled) {
      await onChange(newValue)
    }
  }

  const getTriggerClassName = () => {
    if (triggerClassName) return triggerClassName
    if (getOptionClassName) return cn(className, getOptionClassName(value))

    //  the option and use will be from its className
    const selectedOption = options.find((opt) => opt.value === value)
    return cn(className, selectedOption?.className)
  }

  return (
    <div className="flex items-center gap-2">
      {isLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-500 shrink-0" />}

      <Select value={value} onValueChange={handleValueChange} disabled={disabled || isLoading}>
        <SelectTrigger className={getTriggerClassName()}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
