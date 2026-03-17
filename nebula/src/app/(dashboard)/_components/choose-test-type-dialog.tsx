"use client";

import { motion } from "framer-motion";
import { FlaskConical, Monitor, Users, Compass, GitBranch } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { transitions } from "@/lib/animations";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TestTypeOption {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  available: boolean;
}

const testTypes: TestTypeOption[] = [
  {
    id: "functional",
    title: "Functional Testing",
    description: "Verify flows work correctly end-to-end",
    icon: <FlaskConical className="h-5 w-5" />,
    available: true,
  },
  {
    id: "ui-review",
    title: "UI Review",
    description: "Review UI across multiple devices",
    icon: <Monitor className="h-5 w-5" />,
    available: false,
  },
  {
    id: "ux-review",
    title: "UX Review",
    description: "Evaluate UX with different personas",
    icon: <Users className="h-5 w-5" />,
    available: false,
  },
  {
    id: "exploratory",
    title: "Exploratory Testing",
    description: "Discover issues through unplanned testing",
    icon: <Compass className="h-5 w-5" />,
    available: false,
  },
  {
    id: "ab-testing",
    title: "A/B Testing Recommendations",
    description: "Get suggestions for A/B test variants",
    icon: <GitBranch className="h-5 w-5" />,
    available: false,
  },
];

interface ChooseTestTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTestType: (testType: string) => void;
}

export function ChooseTestTypeDialog({
  open,
  onOpenChange,
  onSelectTestType,
}: ChooseTestTypeDialogProps) {
  const handleSelect = (type: TestTypeOption) => {
    if (type.available) {
      onOpenChange(false);
      onSelectTestType(type.id);
    } else {
      toast.info(`${type.title} coming soon!`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">
            Choose Test Type
          </DialogTitle>
        </DialogHeader>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transitions.normalDelayed(0.1)}
          className="grid gap-3 pt-4"
        >
          {testTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => handleSelect(type)}
              className={cn(
                "flex items-start gap-4 p-4 rounded-lg border-2 text-left transition-all duration-normal ease-default",
                type.available
                  ? "border-border hover:border-primary/30 hover:shadow-md cursor-pointer"
                  : "border-border/50 opacity-50 cursor-not-allowed",
              )}
            >
              <div
                className={cn(
                  "p-2 rounded-md",
                  type.available
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {type.icon}
              </div>
              <div className="flex-1">
                <div className="font-medium flex items-center gap-2">
                  {type.title}
                  {!type.available && (
                    <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">
                      Coming soon
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {type.description}
                </p>
              </div>
            </button>
          ))}
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
