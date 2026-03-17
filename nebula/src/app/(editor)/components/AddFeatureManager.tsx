// @ts-nocheck
import React, { useState } from "react";
import { Save, X, AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Node } from "@xyflow/react";
import { Feature } from "./FlowManager";

interface AddFeatureManagerProps {
  selectedNodes: Node[];
  conflictingNodes: { nodeId: string; feature: Feature }[];
  onCreateFeature: (name: string) => void;
  onCancel: () => void;
  onReset?: () => void;

  editingFeatureId?: string | null;
  editingFeatureName?: string;
}

export const AddFeatureManager: React.FC<AddFeatureManagerProps> = ({
  selectedNodes,
  conflictingNodes,
  onCreateFeature,
  onCancel,
  onReset,

  editingFeatureId,
  editingFeatureName,
}) => {
  const [featureName, setFeatureName] = useState("");

  // Update feature name when editingFeatureId changes (for editing existing features)
  React.useEffect(() => {
    if (editingFeatureId && editingFeatureName) {
      setFeatureName(editingFeatureName);
    } else if (!editingFeatureId) {
      // Only clear the name when switching to create mode, not when resetting
      setFeatureName("");
    }
    // Don't change featureName when just the selectedNodes change during reset
  }, [editingFeatureId, editingFeatureName]);

  const handleCreateFeature = () => {
    if (featureName.trim() && conflictingNodes.length === 0) {
      onCreateFeature(featureName.trim());
      setFeatureName("");
    }
  };

  const handleReset = () => {
    if (onReset) {
      onReset();
    }
    // Reset feature name to original when editing, or clear when creating
    if (editingFeatureId && editingFeatureName) {
      setFeatureName(editingFeatureName);
    } else {
      setFeatureName("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleCreateFeature();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  const canCreate =
    featureName.trim() &&
    selectedNodes.length > 0 &&
    conflictingNodes.length === 0;

  return (
    <div className="space-y-4">
      {/* Header with Reset and Close buttons */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {editingFeatureId ? "Edit Feature" : "Create Feature"}
        </h2>
        <div className="flex gap-1">
          {onReset && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card className="w-full">
        <CardHeader>
          <CardDescription>
            {editingFeatureId
              ? "Click on screens to add/remove them from this feature. Selected screens will pulse with a blue animation."
              : "Click on screens to add them to your feature. Selected screens will pulse with a blue animation."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Feature Name</label>
            <Input
              value={featureName}
              onChange={(e) => setFeatureName(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Enter feature name..."
              className="mt-1"
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-medium">Selected Screens</label>
            <div className="mt-2 space-y-2">
              {selectedNodes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No screens selected. Click on screens to select them.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selectedNodes.map((node) => (
                    <Badge key={node.id} variant="secondary">
                      {String(
                        node.data?.description ||
                          node.data?.label ||
                          `Screen ${node.id}`,
                      )}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {conflictingNodes.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">
                    Some screens already belong to other features:
                  </p>
                  <div className="space-y-1">
                    {conflictingNodes.map(({ nodeId, feature }) => {
                      const node = selectedNodes.find((n) => n.id === nodeId);
                      return (
                        <p key={nodeId} className="text-sm">
                          •{" "}
                          <strong>
                            {String(
                              node?.data?.description ||
                                node?.data?.label ||
                                `Screen ${nodeId}`,
                            )}
                          </strong>{" "}
                          belongs to feature &quot;
                          <strong>{feature.name}</strong>&quot;
                        </p>
                      );
                    })}
                  </div>
                  <p className="text-sm">
                    Please deselect these screens or remove them from their
                    current features first.
                  </p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end">
            <Button onClick={handleCreateFeature} disabled={!canCreate}>
              <Save className="h-4 w-4 mr-2" />
              {editingFeatureId ? "Update Feature" : "Create Feature"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
