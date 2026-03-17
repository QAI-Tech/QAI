// @ts-nocheck
import React, { useState } from "react";
import { Node, Edge } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Download,
  Upload,
  Lightbulb,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { isEdgeInAnyFlow } from "../utils/flowUtils";
import { isQaiOrgUser } from "@/lib/constants";
import { useUser } from "@clerk/nextjs";
import { Switch } from "@/components/ui/switch";

interface GraphStatsProps {
  nodes: Node[];
  edges: Edge[];
  flows: any[];
  features: any[];
  onExportGraph: () => void;
  onImportGraph: () => void;
  importInputRef: React.RefObject<HTMLInputElement>;
  mode: string;
  onFlashUncovered: () => void;
  autoFormatEnabled: boolean;
  onAutoFormatToggle: (enabled: boolean) => void;
}

export const GraphStats: React.FC<GraphStatsProps> = ({
  nodes,
  edges,
  flows,
  features,
  onExportGraph,
  onImportGraph,
  importInputRef,
  mode,
  onFlashUncovered,
  autoFormatEnabled,
  onAutoFormatToggle,
}) => {
  const { user } = useUser();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Get user organization ID
  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;
  // Check if user belongs to QAI organization
  const isQaiOrgUserValue = isQaiOrgUser(userOrgId);

  const calculateCoverage = () => {
    if (edges.length === 0) return 0;

    const coveredEdges = edges.filter((edge) => isEdgeInAnyFlow(edge, flows));

    return Math.round((coveredEdges.length / edges.length) * 100);
  };

  const coverage = calculateCoverage();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-lg font-bold">{nodes.length}</div>
            <div className="text-xs text-muted-foreground">Screens</div>
          </div>
          <div>
            <div className="text-lg font-bold">{edges.length}</div>
            <div className="text-xs text-muted-foreground">Transitions</div>
          </div>
          <div>
            <div className="text-lg font-bold">{features.length}</div>
            <div className="text-xs text-muted-foreground">Features</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center">
          <div>
            <div className="text-lg font-bold">{flows.length}</div>
            <div className="text-xs text-muted-foreground">Flows</div>
          </div>
          <div className="flex items-center gap-1">
            <div className="text-center">
              <div className="text-lg font-bold">{coverage}%</div>
              <div className="text-xs text-muted-foreground">Coverage</div>
            </div>
            <Button
              onClick={onFlashUncovered}
              variant="secondary"
              size="sm"
              title="Highlight uncovered screens and transitions"
            >
              <Lightbulb className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {mode === "select" && isQaiOrgUserValue && (
          <div className="space-y-2">
            <Button
              onClick={() => setAdvancedOpen(!advancedOpen)}
              variant="outline"
              size="sm"
              className="w-full flex justify-between items-center"
            >
              <span>Advanced</span>
              {advancedOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>

            {advancedOpen && (
              <div className="space-y-3 mt-0 w-full p-3 bg-slate-50 rounded-md border border-slate-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-left">
                    <div className="text-sm font-medium">Autoformat logic</div>
                  </div>
                  <Switch
                    checked={autoFormatEnabled}
                    onCheckedChange={(checked) =>
                      onAutoFormatToggle(Boolean(checked))
                    }
                    aria-label="Toggle auto formatting"
                  />
                </div>
                <Button
                  onClick={onExportGraph}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export Graph
                </Button>
                <Button
                  onClick={onImportGraph}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import Graph
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
