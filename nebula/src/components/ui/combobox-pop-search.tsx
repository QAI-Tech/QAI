"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ComboboxOption {
  value: string;
  label: string;
  isFeature?: boolean;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string; // The currently selected value
  onChange: (value: string) => void; // Callback when an option is selected
  placeholder?: string; // Placeholder for the search input
  emptyMessage?: string; // Message when no options are found
  buttonLabel?: string; // Default label for the trigger button when nothing is selected
  disabled?: boolean;
  className?: string; // Optional className for the trigger button
  popoverClassName?: string; // Optional className for the popover content
  renderOption?: (option: ComboboxOption) => React.ReactNode // Custom render function for options
  buttonVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | null; // Optional button variant, null to remove variant
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Search...",
  emptyMessage = "No item found.",
  buttonLabel = "Select...",
  disabled = false,
  className,
  popoverClassName,
  renderOption,
  buttonVariant = "outline",
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const selectedOption = options.find((option) => option.value === value);

  const optionsWithIds = React.useMemo(() =>
    {
    return options.map((option, index) => ({
      ...option,
      uniqueKey: `${option.value}-${index}`,
    }))
  },
    [options]
  );

  // Reset search query when dropdown closes
  React.useEffect(() => {
    if (!open) {
      setSearchQuery("");
    }
  }, [open]);

  // filter function copied from command component
  const filterFunction = React.useCallback(
    (value: string, search: string) => {
      if (!search) return 1;

      const labelMatch = value.match(/(.*?)-/);
      const itemLabel = labelMatch ? labelMatch[1] : value;

      search = search.toLowerCase();
      const label = itemLabel.toLowerCase();

      if (label === search) return 100;

      if (label.startsWith(search)) return 75;

      if (label.includes(search)) return 50;

      const searchChars = search.split('');
      let prevMatchIndex = -1;
      const hasAllChars = searchChars.every(char => {
        const index = label.indexOf(char, prevMatchIndex + 1);
        if (index > prevMatchIndex) {
          prevMatchIndex = index;
          return true;
        }
        return false;
      });
      return hasAllChars ? 25 : 0;
    },
    []
  );

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        {buttonVariant === null ? (
          <button
            role="combobox"
            aria-expanded={open}
            className={cn("w-full justify-between", className)}
            disabled={disabled}
            title={selectedOption ? selectedOption.label : ""}
          >
            <span className="flex-1 min-w-0 truncate text-left mr-2 text-foreground">{selectedOption ? selectedOption.label : buttonLabel}</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        ) : (
        <Button
            variant={buttonVariant || undefined}
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          disabled={disabled}
          title={selectedOption ? selectedOption.label : ""}
        >
            <span className="flex-1 min-w-0 truncate text-left mr-2">{selectedOption ? selectedOption.label : buttonLabel}</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
       className={cn("w-full p-0", popoverClassName)}
       align="start"
       >
        <Command filter={filterFunction}>
          <CommandInput placeholder={placeholder} value={searchQuery} onValueChange={setSearchQuery} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup className="max-h-[300px] overflow-y-auto">
              {optionsWithIds.map((option) => (
                <CommandItem
                  key={option.uniqueKey}
                  value={`${option.label}-${option.uniqueKey}`}
                  onSelect={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  {renderOption ? (
                    renderOption(option)
                  ) : (
                    <>
                      <Check className={cn("mr-2 h-4 w-4", value === option.value ? "opacity-100" : "opacity-0")} />
                      {option.label}
                    </>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
