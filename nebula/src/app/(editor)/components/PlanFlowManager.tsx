// @ts-nocheck
import React, { useState } from "react";
import { Node } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, RotateCcw, Plus, Lightbulb, Sparkles } from "lucide-react";
import { InstructionBox } from "./InstructionBox";

export interface PlanFlowState {
  step: "start";

  // Core nodes
  startNode: Node | null;
  flowName: string;
  precondition?: string;
  featureId?: string;

  // Path tracking (manually selected nodes in sequence)
  currentPathNodes: Node[];
}

interface PlanFlowManagerProps {
  planFlowState: PlanFlowState;
  nodes: Node[];
  edges: any[];
  flows: any[];
  onStateChange: (state: Partial<PlanFlowState>) => void;
  onCancel: () => void;
  onReset: () => void;
  onCreateFlow: () => void;
  onFlashUncovered: () => void;
  onAiFlowPlanning?: () => void;
  isAiPlanning?: boolean;
}

export const PlanFlowManager: React.FC<PlanFlowManagerProps> = ({
  planFlowState,
  nodes,
  edges,
  flows,
  onStateChange,
  onCancel,
  onReset,
  onCreateFlow,
  onFlashUncovered,
  onAiFlowPlanning,
  isAiPlanning = false,
}) => {
  const [isFlashing, setIsFlashing] = useState(false);
  const { startNode, flowName, precondition, currentPathNodes } = planFlowState;

  const getInstructionText = () => {
    if (currentPathNodes.length === 0) {
      return "Click on a node to select as start point";
    } else if (currentPathNodes.length === 1) {
      return "Click on connected nodes to build your flow";
    } else {
      return 'Continue adding nodes or click "Create Flow" when ready';
    }
  };

  // Use current path from state - no need to recalculate
  const getCompletePath = (): Node[] => {
    return currentPathNodes;
  };

  const handleFlashClick = () => {
    if (isFlashing) return;
    setIsFlashing(true);
    onFlashUncovered();
    setTimeout(() => setIsFlashing(false), 3000);
  };

  const completePath = getCompletePath();

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Plan Flow</CardTitle>
          <div className="flex gap-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleFlashClick}
              disabled={isFlashing}
              title="Highlight uncovered screens and transitions"
              className="hidden"
            >
              <Lightbulb className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              title="Reset flow"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 space-y-4 overflow-hidden">
        <div>
          <label className="text-xs font-medium">Flow Name</label>
          <Input
            value={flowName}
            onChange={(e) => onStateChange({ flowName: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Backspace") {
                e.stopPropagation();
              }
            }}
            placeholder="Enter flow name"
            className="h-8"
          />
        </div>
        <div>
          <label className="text-xs font-medium">Flow Precondition</label>
          <textarea
            value={precondition}
            onChange={(e) => onStateChange({ precondition: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Backspace") {
                e.stopPropagation();
              }
            }}
            placeholder="Enter flow precondition (optional)"
            className="h-20 min-h-[2.5rem] max-h-48 text-sm w-full resize-vertical rounded-md border border-input bg-background px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <InstructionBox instruction={getInstructionText()} type="planFlow" />

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {completePath.length > 1 && (
            <div className="text-xs flex flex-col flex-1 min-h-0 mb-2">
              <span className="font-medium text-blue-600 mb-2">Flow path:</span>
              <div className="flex-1 overflow-y-auto space-y-1 pr-2">
                {completePath.map((node, index) => (
                  <div
                    key={`${node.id}-${index}`}
                    className="ml-2 flex items-center gap-1"
                  >
                    <span className="text-muted-foreground flex-shrink-0">
                      {index + 1}.
                    </span>
                    <span
                      className={
                        index === 0
                          ? "text-green-600 font-medium"
                          : "text-blue-600 font-medium"
                      }
                    >
                      {(node.data?.description as string) || node.id}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-auto pt-2 border-t">
          {currentPathNodes.length >= 2 && (
            <Button onClick={onCreateFlow} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Create Flow
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
