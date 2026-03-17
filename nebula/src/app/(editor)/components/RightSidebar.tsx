import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface RightSidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  children?: React.ReactNode;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  isCollapsed,
  onToggleCollapse,
  children,
}) => {
  return (
    <div
      className={`bg-background border-l border-border transition-all duration-200 relative ${
        isCollapsed ? "w-0" : "w-96"
      }`}
    >
      <Button
        onClick={onToggleCollapse}
        variant="secondary"
        size="sm"
        className="absolute -left-4 top-1/2 transform -translate-y-1/2 h-16 w-8 rounded-l-md rounded-r-none p-0 z-50 border border-r-0 border-border shadow-md"
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {isCollapsed ? (
          <ChevronLeft className="h-6 w-6" />
        ) : (
          <ChevronRight className="h-6 w-6" />
        )}
      </Button>

      <div
        className={`h-full overflow-y-auto p-4 ${isCollapsed ? "hidden" : "block"}`}
      >
        {children}
      </div>
    </div>
  );
};
