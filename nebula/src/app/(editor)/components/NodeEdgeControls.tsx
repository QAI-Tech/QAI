// @ts-nocheck
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus,
  Image as ImageIcon,
  ArrowRight,
  MapPin,
  Search,
  MessageSquarePlus,
} from "lucide-react";
import { InstructionBox } from "./InstructionBox";
import { EdgeTable } from "./EdgeTable";
import { Edge } from "@xyflow/react";

interface NodeEdgeControlsProps {
  mode:
    | "select"
    | "addNode"
    | "addEdge"
    | "planFlow"
    | "addFeature"
    | "addComment"
    | "addWildcardNode"
    | "addBugNode";
  nodeImages: string[];
  nodeDescription: string;
  edgeSource: string | null;
  nodes: any[];
  edges: any[];
  selectedEdge: Edge | null;
  screenPreviewEnabled: boolean;
  onModeChange: (
    mode:
      | "select"
      | "addNode"
      | "addEdge"
      | "planFlow"
      | "addFeature"
      | "addComment"
      | "addWildcardNode"
      | "addBugNode",
  ) => void;
  onNodeDescriptionChange: (description: string) => void;
  onImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onAddNodeClick: () => void;
  onWildcardNodeClick: () => void;
  onBugNodeClick: () => void;
  onAddEdgeClick: () => void;
  onAddCommentClick: () => void;
  onHighlightEntryPoints: () => void;
  onFindElementById: (id: string) => void;
  onEdgeDetailsChange: (
    edgeId: string,
    details: {
      description: string;
      paramValues: string[];
      business_logic?: string;
    },
  ) => void;
  onScreenPreviewToggle: (enabled: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  autoFormatEnabled: boolean;
}

export const NodeEdgeControls: React.FC<NodeEdgeControlsProps> = ({
  mode,
  nodeImages,
  nodeDescription,
  edgeSource,
  nodes,
  edges,
  selectedEdge,
  screenPreviewEnabled,
  onModeChange,
  onNodeDescriptionChange,
  onImageUpload,
  onAddNodeClick,
  onWildcardNodeClick,
  onBugNodeClick,
  onAddEdgeClick,
  onAddCommentClick,
  onHighlightEntryPoints,
  onFindElementById,
  onEdgeDetailsChange,
  onScreenPreviewToggle,
  fileInputRef,
  autoFormatEnabled,
}) => {
  const [searchId, setSearchId] = useState("");
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Screens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="screen-preview"
                checked={screenPreviewEnabled}
                onCheckedChange={onScreenPreviewToggle}
              />
              <label
                htmlFor="screen-preview"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Show screen previews on hover
              </label>
            </div>

            <Button
              onClick={onHighlightEntryPoints}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <MapPin className="h-4 w-4 mr-2" />
              Highlight Entry Points
            </Button>

            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Find element by ID"
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  className="flex-1 text-sm h-9"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && searchId.trim()) {
                      onFindElementById(searchId.trim());
                    }
                  }}
                />
                <Button
                  onClick={() =>
                    searchId.trim() && onFindElementById(searchId.trim())
                  }
                  variant="outline"
                  size="sm"
                  disabled={!searchId.trim()}
                  className="h-9 px-3"
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Button
              onClick={onAddNodeClick}
              variant={mode === "addNode" ? "default" : "outline"}
              size="sm"
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Screen
            </Button>

            <Button
              onClick={onBugNodeClick}
              variant={mode === "addBugNode" ? "default" : "outline"}
              size="sm"
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Bug Node
            </Button>

            <Button
              onClick={onWildcardNodeClick}
              variant={mode === "addWildcardNode" ? "default" : "outline"}
              size="sm"
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Wildcard Node
            </Button>

            <Button
              onClick={onAddEdgeClick}
              variant={mode === "addEdge" ? "default" : "outline"}
              size="sm"
              className="w-full"
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              Add Transition
            </Button>

            <Button
              onClick={onAddCommentClick}
              variant={mode === "addComment" ? "default" : "outline"}
              size="sm"
              className="w-full"
            >
              <MessageSquarePlus className="h-4 w-4 mr-2" />
              Add Comment
            </Button>
          </div>

          {mode === "addNode" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium">Description</label>
                <Textarea
                  placeholder="Enter screen description"
                  value={nodeDescription}
                  onChange={(e) => onNodeDescriptionChange(e.target.value)}
                  className="h-20 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium">Images</label>
                <div className="flex gap-2">
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    <ImageIcon className="h-4 w-4 mr-2" />
                    Upload Images
                  </Button>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={onImageUpload}
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                />
                {nodeImages.length > 0 && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {nodeImages.length} image(s) selected
                  </div>
                )}
              </div>

              <InstructionBox
                instruction={
                  nodeImages.length > 0
                    ? "Click on the canvas to place the screen(s)"
                    : "Select screenshots for the screens you want to add"
                }
                type="addNode"
              />
            </div>
          )}

          {mode === "addEdge" && (
            <div className="space-y-2">
              <InstructionBox
                instruction={
                  edgeSource
                    ? "Source selected. Click on destination screen."
                    : "Click on source screen first."
                }
                type="addEdge"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edge Table - shows when an edge is selected */}
      <EdgeTable
        selectedEdge={selectedEdge}
        nodes={nodes}
        onEdgeDetailsChange={onEdgeDetailsChange}
        autoFormatEnabled={autoFormatEnabled}
      />
    </div>
  );
};
