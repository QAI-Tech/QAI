// @ts-nocheck
import React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, MousePointer2, Target, Route, Group } from "lucide-react";

interface InstructionBoxProps {
  instruction: string;
  type?: "addNode" | "addEdge" | "planFlow" | "groupPreview" | "default";
}

export const InstructionBox: React.FC<InstructionBoxProps> = ({
  instruction,
  type = "default",
}) => {
  const getIcon = () => {
    switch (type) {
      case "addNode":
        return <MousePointer2 className="h-4 w-4" />;
      case "addEdge":
        return <Target className="h-4 w-4" />;
      case "planFlow":
        return <Route className="h-4 w-4" />;
      case "groupPreview":
        return <Group className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getVariant = () => {
    switch (type) {
      case "addNode":
        return "default" as const;
      case "addEdge":
        return "default" as const;
      case "planFlow":
        return "default" as const;
      case "groupPreview":
        return "default" as const;
      default:
        return "default" as const;
    }
  };

  return (
    <Alert
      variant={getVariant()}
      className="border-primary/20 bg-primary/5 text-primary-foreground"
    >
      {getIcon()}
      <AlertDescription className="text-sm font-medium text-primary">
        {instruction}
      </AlertDescription>
    </Alert>
  );
};
