import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface StepMenuProps {
  onDeleteStep: () => void;
  onAddStepBefore: () => void;
  onAddStepAfter: () => void;
  isEditing: boolean;
  inline?: boolean;
  className?: string;
}

export function StepMenu({
  onDeleteStep,
  onAddStepBefore,
  onAddStepAfter,
  isEditing,
  inline = false,
  className,
}: StepMenuProps) {
  if (!isEditing) return null;

  return (
    <div
      className={`${
        inline
          ? "inline-flex items-center"
          : "absolute right-2 top-1 opacity-0 group-hover:opacity-100 transition-opacity"
      }${className ? ` ${className}` : ""}`}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-8 w-8 p-0 hover:bg-gray-100"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <Menu className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onAddStepBefore();
            }}
          >
            Add step before
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onAddStepAfter();
            }}
          >
            Add step after
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDeleteStep();
            }}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            Delete step
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}