// @ts-nocheck
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { generateFeatureId } from "@/app/(editor)/utils/idGenerator";
import { useProductSwitcher } from "@/providers/product-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Route,
  Play,
  Undo,
  Redo,
  Download,
  Upload,
  Sparkles,
  MessageSquarePlus,
  Menu,
  Globe,
} from "lucide-react";
import { GraphStats } from "./GraphStats";
import { VideoFlowQueue } from "./VideoFlowQueue";
import { NodeEdgeControls } from "./NodeEdgeControls";
import {
  FlowManager,
  Flow,
  Feature,
  Scenario,
  TestCasePlanningRequest,
} from "./FlowManager";
import { ConsoleCollaborationEvents } from "../types/collaborationEvents";
import { PlanFlowManager, PlanFlowState } from "./PlanFlowManager";
import { FeatureManager } from "./FeatureManager";
import { AddFeatureManager } from "./AddFeatureManager";
import { toast } from "sonner";
import { isQaiOrgUser } from "@/lib/constants";
import { useUser } from "@clerk/nextjs";

interface GraphSidebarProps {
  mode:
    | "select"
    | "addNode"
    | "addEdge"
    | "planFlow"
    | "addFeature"
    | "addComment"
    | "addWildcardNode"
    | "addBugNode";
  editingFeatureId: string | null;
  nodes: any[];
  edges: any[];
  flows: Flow[];
  selectedFlowId: string | null;
  planFlowState: PlanFlowState;
  features: Feature[];
  visibleFeatureIds: string[];
  nodeImages: string[];
  nodeDescription: string;
  edgeSource: string | null;
  selectedEdge: any;
  canUndo: boolean;
  canRedo: boolean;
  screenPreviewEnabled: boolean;
  onModeChange: (
    mode:
      | "select"
      | "addNode"
      | "addEdge"
      | "planFlow"
      | "addFeature"
      | "addComment",
  ) => void;
  onEditFeature: (featureId: string) => void;
  onFlowSelect: (flowId: string | null) => void;
  onFlowDelete: (flowId: string) => void;
  onFlowBulkDelete?: (flowIds: string[]) => void;
  onFlowExport: () => void;
  onFlowImport: () => void;
  onFlowRename: (flowId: string, newName: string) => void;
  onFlowPreconditionRename: (flowId: string, newPrecondition: string) => void;
  onFlowScenariosUpdate: (flowId: string, scenarios: Scenario[]) => void;
  onFlowCredentialsUpdate: (flowId: string, credentials: string[]) => void;
  onFlowReorder: (flows: Flow[]) => void;
  onSelectedFlowChainChange?: (flowChain: Flow[]) => void;
  onPlanFlowStateChange: (state: Partial<PlanFlowState>) => void;
  onCreatePlanFlow: () => void;
  onNodeDescriptionChange: (description: string) => void;
  onImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onExportGraph: () => void;
  onImportGraph: () => void;
  onUndo: () => void;
  onRedo: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  importInputRef: React.RefObject<HTMLInputElement>;
  featureManagement: any;
  selectedNodes: any[];
  onClearSelection?: () => void;
  onFlashUncovered: () => void;
  onFlashEntryPoints: () => void;
  onFindElementById: (id: string) => void;
  onEdgeDetailsChange: (
    edgeId: string,
    details: {
      description: string;
      paramValues: string[];
      business_logic?: string;
    },
  ) => void;
  setNodes?: React.Dispatch<React.SetStateAction<any[]>>;
  onToggleFeatureCollapse?: (featureId: string) => void;
  onAiFlowPlanning?: () => void;
  isAiPlanning?: boolean;
  onScreenPreviewToggle: (enabled: boolean) => void;
  onAutoFormatEnabledChange?: (enabled: boolean) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isFlowsPanelVisible?: boolean;
  onOpenWebRecorder?: () => void;
  addNewNodes?: (nodes: any[]) => void;
  onFlowStepClick?: (sourceNodeId: string, targetNodeId: string) => void;
  updateNodeDescription?: (nodeId: string, newDescription: string) => void;
  handleTestCasePlanning?: (
    isForcePlanning: boolean,
    specificFlowsToPlan: string[],
  ) => void;
  failedVideoToFlowRequests?: TestCasePlanningRequest[];
  onClearFailedVideoRequests?: () => void;
  onRetryFailedRequest?: (request: TestCasePlanningRequest) => void;
}

export const GraphSidebar: React.FC<GraphSidebarProps> = ({
  mode,
  editingFeatureId,
  nodes,
  edges,
  flows,
  selectedFlowId,
  planFlowState,
  features,
  visibleFeatureIds,
  nodeImages,
  nodeDescription,
  edgeSource,
  selectedEdge,
  canUndo,
  canRedo,
  screenPreviewEnabled,
  onModeChange,
  onEditFeature,
  onFlowSelect,
  onFlowDelete,
  onFlowBulkDelete,
  onFlowExport,
  onFlowImport,
  onFlowRename,
  onFlowPreconditionRename,
  onFlowScenariosUpdate,
  onFlowCredentialsUpdate,
  onFlowReorder,
  onSelectedFlowChainChange,
  onPlanFlowStateChange,
  onCreatePlanFlow,
  onNodeDescriptionChange,
  onImageUpload,
  onExportGraph,
  onImportGraph,
  onUndo,
  onRedo,
  fileInputRef,
  importInputRef,
  featureManagement,
  selectedNodes,
  onClearSelection,
  onFlashUncovered,
  onFlashEntryPoints,
  onFindElementById,
  onEdgeDetailsChange,
  setNodes,
  onToggleFeatureCollapse,
  onAiFlowPlanning,
  isAiPlanning = false,
  onScreenPreviewToggle,
  onAutoFormatEnabledChange,
  onAddFlowsFromVideo,
  videoQueueItems,
  isCollapsed = false,
  onToggleCollapse,
  isFlowsPanelVisible = false,
  addNewNodes,
  onFlowStepClick,
  updateNodeDescription,
  handleTestCasePlanning,
  failedVideoToFlowRequests,
  onClearFailedVideoRequests,
  onRetryFailedRequest,
  onOpenWebRecorder,
}) => {
  const [activeTab, setActiveTab] = useState("screens");
  const videoInputRef = React.useRef<HTMLInputElement>(null);
  const { user } = useUser();

  // Get user organization ID
  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;
  // Check if user belongs to QAI organization
  const isQaiOrgUserValue = isQaiOrgUser(userOrgId);

  const handleAddFromVideoClick = () => {
    videoInputRef.current?.click();
  };
  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0 && onAddFlowsFromVideo) {
      onAddFlowsFromVideo(files);
    }
    if (videoInputRef.current) {
      videoInputRef.current.value = "";
    }
  };
  const [previousFlowCount, setPreviousFlowCount] = useState(flows.length);
  const { productSwitcher } = useProductSwitcher();
  const [autoFormatEnabled, setAutoFormatEnabled] = useState(false);

  // Switch to flows tab when a new flow is added
  useEffect(() => {
    if (flows.length > previousFlowCount) {
      setActiveTab("flows");
    }
    setPreviousFlowCount(flows.length);
  }, [flows.length, previousFlowCount]);

  // Switch to screens tab when an edge is selected
  useEffect(() => {
    if (selectedEdge) {
      setActiveTab("screens");
    }
  }, [selectedEdge]);

  const handleAddNodeClick = () => {
    onModeChange(mode === "addNode" ? "select" : "addNode");
  };

  const handleWildcardNodeClick = () => {
    onModeChange(mode === "addWildcardNode" ? "select" : "addWildcardNode");
  };

  const handleBugNodeClick = () => {
    onModeChange(mode === "addBugNode" ? "select" : "addBugNode");
  };

  const handleAddEdgeClick = () => {
    onModeChange(mode === "addEdge" ? "select" : "addEdge");
  };

  const handlePlanFlowClick = () => {
    onModeChange(mode === "planFlow" ? "select" : "planFlow");
  };

  const handleCancelPlanFlow = () => {
    // First reset the plan flow state
    onPlanFlowStateChange({
      step: "start",
      startNode: null,
      endNode: null,
      flowName: "",
      currentPathNodes: [],
      userChosenNodes: [],
      currentViaChoiceNodes: [],
    });
    // Then exit the plan flow mode
    onModeChange("select");
  };

  const handleResetPlanFlow = () => {
    onPlanFlowStateChange({
      step: "start",
      startNode: null,
      endNode: null,
      flowName: "",
      currentPathNodes: [],
      userChosenNodes: [],
      currentViaChoiceNodes: [],
    });
  };

  const handleAddFeatureClick = () => {
    onModeChange(mode === "addFeature" ? "select" : "addFeature");
  };

  const handleAddCommentClick = () => {
    onModeChange(mode === "addComment" ? "select" : "addComment");
  };

  const handleEditFeature = (featureId: string) => {
    onEditFeature(featureId);
  };

  const handleCreateFeature = (name: string) => {
    if (editingFeatureId) {
      // Update existing feature (preserves order)
      featureManagement?.updateFeature(editingFeatureId, {
        name,
        nodeIds: selectedNodes.map((node: any) => node.id),
      });
    } else {
      // Create new feature
      const featureId = generateFeatureId(
        undefined,
        productSwitcher.product_id,
      );
      const feature: Feature = {
        id: featureId,
        name,
        nodeIds: selectedNodes.map((node: any) => node.id),
      };
      featureManagement?.addFeature(feature);
    }

    // Only clear selection and exit mode when the feature is actually saved
    onModeChange("select");
    if (onClearSelection) {
      onClearSelection();
    }
  };

  const handleResetFeature = () => {
    if (editingFeatureId && featureManagement && setNodes) {
      // In edit mode, restore the original feature's nodes without clearing editing context
      const feature = featureManagement.getFeatureById(editingFeatureId);
      if (feature) {
        // Directly set node selections to match the original feature (only customNode types)
        setNodes((nds: any[]) =>
          nds.map((node: any) => ({
            ...node,
            selected:
              node.type === "customNode" && feature.nodeIds.includes(node.id),
          })),
        );
      }
    } else {
      // In create mode, clear everything
      if (onClearSelection) {
        onClearSelection();
      }
    }
  };

  const handleMultiSelectFeatureNodes = (featureId: string) => {
    const feature = features.find((f) => f.id === featureId);
    if (feature && setNodes) {
      // Multiselect all nodes in the feature (similar to holding Shift) - only customNode types
      setNodes((nodes) =>
        nodes.map((node) => ({
          ...node,
          selected:
            node.type === "customNode" && feature.nodeIds.includes(node.id),
        })),
      );
    }
  };

  const handleEdgeDetailsChange = (
    edgeId: string,
    details: {
      description: string;
      paramValues: string[];
      business_logic?: string;
    },
  ) => {
    onEdgeDetailsChange(edgeId, details);
  };

  const conflictingNodes =
    featureManagement?.getConflictingNodes?.(
      selectedNodes.map((node: any) => node.id),
      editingFeatureId, // Exclude the feature being edited from conflicts
    ) || [];

  const handleFeatureExport = () => {
    const data = {
      features: featureManagement.features,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "features.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFeatureImport = (importedFeatures: Feature[]) => {
    const existingIds = new Set(featureManagement.features.map((f) => f.id));

    for (const feature of importedFeatures) {
      if (existingIds.has(feature.id)) {
        console.warn(
          `Feature with ID ${feature.id} already exists. Skipping import.`,
        );
        return; // abort import on duplicate
      }
    }

    // Combine existing and imported features, then update state
    featureManagement.setAllFeatures([
      ...featureManagement.features,
      ...importedFeatures,
    ]);
    const collaborationEvents = new ConsoleCollaborationEvents();
    collaborationEvents.createFeatures(importedFeatures);
  };

  return (
    <div
      className={`bg-background border-r border-border p-4 flex flex-col h-full overflow-hidden transition-all duration-200 ${
        isCollapsed ? "w-12" : "w-80"
      }`}
    >
      {/* Hamburger menu toggle button */}
      <div className="flex justify-end mb-4">
        <Button
          onClick={onToggleCollapse}
          variant="ghost"
          size="sm"
          className="p-1"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {!isCollapsed &&
        (mode !== "planFlow" || isFlowsPanelVisible) &&
        mode !== "addFeature" && (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <GraphStats
              nodes={nodes}
              edges={edges}
              flows={flows}
              features={features}
              onExportGraph={onExportGraph}
              onImportGraph={onImportGraph}
              importInputRef={importInputRef}
              mode={mode}
              onFlashUncovered={onFlashUncovered}
              autoFormatEnabled={autoFormatEnabled}
              onAutoFormatToggle={(enabled) => {
                setAutoFormatEnabled(Boolean(enabled));
                onAutoFormatEnabledChange?.(Boolean(enabled));
              }}
            />

            {/* Undo/Redo Controls */}
            <div className="flex gap-2 mb-4">
              <Button
                onClick={onUndo}
                disabled={!canUndo}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                <Undo className="h-4 w-4 mr-2" />
                Undo
              </Button>
              <Button
                onClick={onRedo}
                disabled={!canRedo}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                <Redo className="h-4 w-4 mr-2" />
                Redo
              </Button>
            </div>

            <Tabs
              value={activeTab}
              onValueChange={(tab) => {
                setActiveTab(tab);
                // Clear selected flow when switching away from flows tab
                if (tab !== "flows" && selectedFlowId) {
                  onFlowSelect(null);
                }
              }}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="screens">Data</TabsTrigger>
                <TabsTrigger value="features">Features</TabsTrigger>
                <TabsTrigger value="flows">Flows</TabsTrigger>
              </TabsList>

              <TabsContent value="screens" className="space-y-4">
                <NodeEdgeControls
                  mode={mode}
                  nodeImages={nodeImages}
                  nodeDescription={nodeDescription}
                  edgeSource={edgeSource}
                  nodes={nodes}
                  edges={edges}
                  selectedEdge={selectedEdge}
                  screenPreviewEnabled={screenPreviewEnabled}
                  onModeChange={onModeChange}
                  onNodeDescriptionChange={onNodeDescriptionChange}
                  onImageUpload={onImageUpload}
                  onAddNodeClick={handleAddNodeClick}
                  onWildcardNodeClick={handleWildcardNodeClick}
                  onBugNodeClick={handleBugNodeClick}
                  onAddEdgeClick={handleAddEdgeClick}
                  onAddCommentClick={handleAddCommentClick}
                  onHighlightEntryPoints={onFlashEntryPoints}
                  onFindElementById={onFindElementById}
                  onEdgeDetailsChange={handleEdgeDetailsChange}
                  onScreenPreviewToggle={onScreenPreviewToggle}
                  fileInputRef={fileInputRef}
                  autoFormatEnabled={autoFormatEnabled}
                />
              </TabsContent>

              <TabsContent value="features" className="space-y-4">
                <Button
                  onClick={handleAddFeatureClick}
                  className="w-full"
                  variant="default"
                >
                  Add Feature
                </Button>

                {isQaiOrgUserValue && (
                  <div className="flex gap-2">
                    <Button
                      onClick={handleFeatureExport}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled={features.length === 0}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = ".json";
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement)
                            .files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              try {
                                const data = JSON.parse(
                                  event.target?.result as string,
                                );
                                if (
                                  data.features &&
                                  Array.isArray(data.features)
                                ) {
                                  handleFeatureImport(data.features);
                                }
                              } catch (error) {
                                console.error(
                                  "Failed to import features:",
                                  error,
                                );
                              }
                            };
                            reader.readAsText(file);
                          }
                        };
                        input.click();
                      }}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Import
                    </Button>
                  </div>
                )}

                <FeatureManager
                  features={features}
                  visibleFeatureIds={visibleFeatureIds}
                  nodes={nodes}
                  onToggleVisibility={
                    featureManagement?.toggleFeatureVisibility
                  }
                  onToggleAllVisibility={
                    featureManagement?.toggleAllFeatureVisibility
                  }
                  onDelete={featureManagement?.deleteFeature}
                  onRename={featureManagement?.renameFeature}
                  onEdit={handleEditFeature}
                  onExport={handleFeatureExport}
                  onImport={handleFeatureImport}
                  onToggleCollapse={onToggleFeatureCollapse || (() => {})}
                  onReorder={featureManagement?.reorderFeatures || (() => {})}
                  onMultiSelectFeatureNodes={handleMultiSelectFeatureNodes}
                />
              </TabsContent>

              <TabsContent value="flows" className="space-y-4">
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button
                      onClick={handlePlanFlowClick}
                      variant="outline"
                      className="flex-1"
                    >
                      <Route className="h-4 w-4 mr-2" />
                      Plan Flow
                    </Button>

                    <Button
                      onClick={onAiFlowPlanning}
                      variant="default"
                      className="flex-1"
                      disabled={isAiPlanning}
                    >
                      {isAiPlanning ? (
                        <>
                          <div className="animate-spin h-4 w-4 mr-2 border-2 border-current border-t-transparent rounded-full" />
                          Planning...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Auto Plan
                        </>
                      )}
                    </Button>
                  </div>
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    multiple
                    onChange={handleVideoChange}
                    className="hidden"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={handleAddFromVideoClick}
                      variant="outline"
                      className="flex-1"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Video
                    </Button>
                    {onOpenWebRecorder && productSwitcher.web_url && (
                      <Button
                        onClick={onOpenWebRecorder}
                        variant="outline"
                        className="flex-1"
                      >
                        <Globe className="h-4 w-4 mr-2" />
                        Web Recorder
                      </Button>
                    )}
                  </div>
                </div>

                <FlowManager
                  flows={flows}
                  features={features}
                  selectedFlowId={selectedFlowId}
                  onFlowSelect={onFlowSelect}
                  onFlowDelete={onFlowDelete}
                  onFlowBulkDelete={onFlowBulkDelete}
                  onFlowExport={onFlowExport}
                  onFlowImport={onFlowImport}
                  onFlowRename={onFlowRename}
                  onFlowPreconditionRename={onFlowPreconditionRename}
                  onFlowScenariosUpdate={onFlowScenariosUpdate}
                  onFlowCredentialsUpdate={onFlowCredentialsUpdate}
                  onFlowReorder={onFlowReorder}
                  onSelectedFlowChainChange={onSelectedFlowChainChange}
                  edges={edges}
                  nodes={nodes}
                  addNewNodes={addNewNodes}
                  onFlowStepClick={onFlowStepClick}
                  updateNodeDescription={updateNodeDescription}
                  onEdgeDetailsChange={onEdgeDetailsChange}
                  handleTestCasePlanning={handleTestCasePlanning}
                  failedVideoToFlowRequests={failedVideoToFlowRequests}
                  onClearFailedVideoRequests={onClearFailedVideoRequests}
                  onRetryFailedRequest={onRetryFailedRequest}
                  autoFormatEnabled={autoFormatEnabled}
                />
                <VideoFlowQueue items={videoQueueItems || []} />
              </TabsContent>
            </Tabs>
          </div>
        )}

      {!isFlowsPanelVisible && mode === "planFlow" && !isCollapsed && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <PlanFlowManager
            planFlowState={planFlowState}
            nodes={nodes}
            edges={edges}
            flows={flows}
            onStateChange={onPlanFlowStateChange}
            onCancel={handleCancelPlanFlow}
            onReset={handleResetPlanFlow}
            onCreateFlow={onCreatePlanFlow}
            onFlashUncovered={onFlashUncovered}
            onAiFlowPlanning={onAiFlowPlanning}
            isAiPlanning={isAiPlanning}
          />
        </div>
      )}

      {mode === "addFeature" && !isCollapsed && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <AddFeatureManager
            selectedNodes={selectedNodes}
            conflictingNodes={conflictingNodes}
            onCreateFeature={handleCreateFeature}
            onCancel={() => {
              onModeChange("select");
              if (onClearSelection) {
                onClearSelection();
              }
            }}
            onReset={handleResetFeature}
            editingFeatureId={editingFeatureId}
            editingFeatureName={
              editingFeatureId
                ? featureManagement?.getFeatureById(editingFeatureId)?.name
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
};
