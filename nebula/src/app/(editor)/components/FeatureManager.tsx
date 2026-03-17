// @ts-nocheck
import React, { useState, useEffect } from "react";
import {
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Expand,
  Shrink,
  GripVertical,
  MousePointerClick,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "./ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Feature } from "./FlowManager";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface FeatureManagerProps {
  features: Feature[];
  visibleFeatureIds: string[];
  nodes: any[];
  onToggleVisibility: (featureId: string) => void;
  onToggleAllVisibility: () => void;
  onDelete: (featureId: string) => void;
  onRename: (featureId: string, newName: string) => void;
  onEdit: (featureId: string) => void;
  onExport: () => void;
  onImport: (features: Feature[]) => void;
  onToggleCollapse: (featureId: string) => void;
  onReorder: (features: Feature[]) => void;
  onMultiSelectFeatureNodes?: (featureId: string) => void;
}

interface FeatureCardProps {
  feature: Feature;
  isVisible: boolean;
  isExpanded: boolean;
  colorIndex: number;
  nodes: any[];
  onToggleVisibility: () => void;
  onDelete: () => void;
  onRename: (newName: string) => void;
  onEdit: () => void;
  onToggleExpand: () => void;
  onToggleCollapse: () => void;
  onMultiSelectFeatureNodes?: () => void;
}

const SortableFeatureCard: React.FC<FeatureCardProps> = (props) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.feature.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <FeatureCard
        {...props}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
};

const FeatureCard: React.FC<FeatureCardProps & { dragHandleProps?: any }> = ({
  feature,
  isVisible,
  isExpanded,
  colorIndex,
  nodes,
  onToggleVisibility,
  onDelete,
  onRename,
  onEdit,
  onToggleExpand,
  onToggleCollapse,
  onMultiSelectFeatureNodes,
  dragHandleProps,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(feature.name);

  // Update editName when feature.name changes
  useEffect(() => {
    setEditName(feature.name);
  }, [feature.name]);

  const handleSave = () => {
    if (editName.trim() && editName !== feature.name) {
      onRename(editName.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditName(feature.name);
  };

  const featureColors = [
    "hsl(var(--muted-foreground))",
    "hsl(var(--flow-start))",
    "hsl(var(--flow-end))",
    "hsl(var(--flow-via))",
  ];

  const featureNodes = nodes.filter((node) =>
    feature.nodeIds.includes(node.id),
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Card
          className="transition-all cursor-pointer hover:shadow-sm"
          onClick={!isEditing ? onToggleExpand : undefined}
        >
          <CardContent className="p-4">
            {/* Header Section */}
            <div>
              {isEditing ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <div
                      className="w-3 h-3 rounded border border-border shrink-0"
                      style={{
                        backgroundColor: featureColors[colorIndex],
                        borderColor: featureColors[colorIndex],
                      }}
                    />
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSave();
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          handleCancel();
                        }
                        e.stopPropagation();
                      }}
                      onBlur={handleSave}
                      className="h-7 text-sm"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleSave}
                      className="h-7 w-7 p-0"
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCancel}
                      className="h-7 w-7 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-xs">
                      {feature.nodeIds.length} screens
                    </Badge>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleCollapse();
                        }}
                        className="h-6 w-6 p-0"
                        title={
                          feature.isCollapsed
                            ? "Expand feature screens"
                            : "Collapse feature screens"
                        }
                      >
                        {feature.isCollapsed ? (
                          <Expand className="h-3 w-3" />
                        ) : (
                          <Shrink className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleVisibility();
                        }}
                        className="h-6 w-6 p-0"
                        title={isVisible ? "Hide feature" : "Show feature"}
                      >
                        {isVisible ? (
                          <Eye className="h-3 w-3" />
                        ) : (
                          <EyeOff className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleExpand();
                        }}
                        className="h-6 w-6 p-0"
                        title={
                          isExpanded ? "Collapse feature" : "Expand feature"
                        }
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : isExpanded ? (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <button
                      {...dragHandleProps}
                      className="cursor-grab active:cursor-grabbing p-1 -m-1 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <GripVertical className="h-3 w-3" />
                    </button>
                    <div
                      className="w-3 h-3 rounded border border-border shrink-0"
                      style={{
                        backgroundColor: featureColors[colorIndex],
                        borderColor: featureColors[colorIndex],
                      }}
                    />
                    <h3 className="font-medium text-sm leading-tight flex-1 truncate">
                      {feature.name}
                    </h3>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleCollapse();
                        }}
                        className="h-6 w-6 p-0"
                        title={
                          feature.isCollapsed
                            ? "Expand feature screens"
                            : "Collapse feature screens"
                        }
                      >
                        {feature.isCollapsed ? (
                          <Expand className="h-3 w-3" />
                        ) : (
                          <Shrink className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleVisibility();
                        }}
                        className="h-6 w-6 p-0 shrink-0"
                        title={isVisible ? "Hide feature" : "Show feature"}
                      >
                        {isVisible ? (
                          <Eye className="h-3 w-3" />
                        ) : (
                          <EyeOff className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-xs">
                      {feature.nodeIds.length} screens
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleExpand();
                      }}
                      className="h-6 w-6 p-0"
                      title={isExpanded ? "Collapse feature" : "Expand feature"}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      {...dragHandleProps}
                      className="cursor-grab active:cursor-grabbing p-1 -m-1 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <GripVertical className="h-3 w-3" />
                    </button>
                    <div
                      className="w-3 h-3 rounded border border-border shrink-0"
                      style={{
                        backgroundColor: featureColors[colorIndex],
                        borderColor: featureColors[colorIndex],
                      }}
                    />
                    <h3 className="font-medium text-sm leading-tight flex-1 truncate">
                      {feature.name}
                    </h3>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleCollapse();
                        }}
                        className="h-6 w-6 p-0"
                        title={
                          feature.isCollapsed
                            ? "Expand feature screens"
                            : "Collapse feature screens"
                        }
                      >
                        {feature.isCollapsed ? (
                          <Expand className="h-3 w-3" />
                        ) : (
                          <Shrink className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleVisibility();
                        }}
                        className="h-6 w-6 p-0 shrink-0"
                        title={isVisible ? "Hide feature" : "Show feature"}
                      >
                        {isVisible ? (
                          <Eye className="h-3 w-3" />
                        ) : (
                          <EyeOff className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-xs">
                      {feature.nodeIds.length} screens
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleExpand();
                      }}
                      className="h-6 w-6 p-0 shrink-0"
                      title={isExpanded ? "Collapse feature" : "Expand feature"}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Expanded Section */}
            <div
              className={`overflow-hidden transition-all duration-300 ease-out ${
                isExpanded ? "max-h-screen opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <div className="mt-4 pt-3 border-t space-y-2">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-medium text-muted-foreground">
                    Screens in this feature:
                  </h4>
                  {onMultiSelectFeatureNodes && featureNodes.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMultiSelectFeatureNodes();
                      }}
                      className="h-6 text-xs px-2"
                      title="Select all screens in this feature"
                    >
                      <MousePointerClick className="h-3 w-3 mr-1" />
                      Select All
                    </Button>
                  )}
                </div>
                <div className="space-y-3">
                  {featureNodes.map((node, index) => (
                    <div
                      key={`${feature.id}-${node.id}-${index}`}
                      className="space-y-1"
                    >
                      <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
                        <span className="text-xs text-muted-foreground font-mono w-6 shrink-0">
                          {index + 1}.
                        </span>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div
                            className="w-2 h-2 rounded-full border shrink-0"
                            style={{
                              backgroundColor: featureColors[colorIndex],
                              borderColor: featureColors[colorIndex],
                            }}
                          />
                          <div className="text-xs break-words text-foreground">
                            {String(
                              node.data?.description ||
                                node.data?.label ||
                                `Screen ${node.id}`,
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {featureNodes.length === 0 && (
                    <div className="text-xs text-muted-foreground italic text-center py-2">
                      No screens found
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <Edit2 className="h-4 w-4 mr-2" />
          Edit
        </ContextMenuItem>
        <ContextMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Feature
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export const FeatureManager: React.FC<FeatureManagerProps> = ({
  features,
  visibleFeatureIds,
  nodes,
  onToggleVisibility,
  onToggleAllVisibility,
  onDelete,
  onRename,
  onEdit,
  onExport,
  onImport,
  onToggleCollapse,
  onReorder,
  onMultiSelectFeatureNodes,
}) => {
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [featureToDelete, setFeatureToDelete] = useState<Feature | null>(null);
  const [expandedFeatureId, setExpandedFeatureId] = useState<string | null>(
    null,
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const featureColors = [
    "hsl(var(--muted-foreground))",
    "hsl(var(--flow-start))",
    "hsl(var(--flow-end))",
    "hsl(var(--flow-via))",
  ];

  const handleDeleteClick = (feature: Feature) => {
    setFeatureToDelete(feature);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (featureToDelete) {
      onDelete(featureToDelete.id);
      toast({
        title: "Feature deleted",
        description: `Feature "${featureToDelete.name}" has been deleted.`,
      });
      setDeleteDialogOpen(false);
      setFeatureToDelete(null);
    }
  };

  const handleImportClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target?.result as string);
            if (data.features && Array.isArray(data.features)) {
              onImport(data.features);
            }
          } catch (error) {
            console.error("Failed to import features:", error);
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = features.findIndex(
        (feature) => feature.id === active.id,
      );
      const newIndex = features.findIndex((feature) => feature.id === over.id);

      const reorderedFeatures = arrayMove(features, oldIndex, newIndex);
      onReorder(reorderedFeatures);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Features ({features.length})</h3>
          <div className="flex gap-2">
            {features.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={onToggleAllVisibility}
              >
                {visibleFeatureIds.length === features.length ? (
                  <EyeOff className="h-3 w-3" />
                ) : (
                  <Eye className="h-3 w-3" />
                )}
              </Button>
            )}
          </div>
        </div>

        {features.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">
            No features created yet
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={features.map((feature) => feature.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3 focus:outline-none" tabIndex={-1}>
                {features.map((feature, index) => {
                  const isVisible = visibleFeatureIds.includes(feature.id);
                  const colorIndex = index % featureColors.length;

                  return (
                    <SortableFeatureCard
                      key={feature.id}
                      feature={feature}
                      isVisible={isVisible}
                      isExpanded={expandedFeatureId === feature.id}
                      colorIndex={colorIndex}
                      nodes={nodes}
                      onToggleVisibility={() => onToggleVisibility(feature.id)}
                      onDelete={() => handleDeleteClick(feature)}
                      onRename={(newName) => onRename(feature.id, newName)}
                      onEdit={() => onEdit(feature.id)}
                      onToggleExpand={() =>
                        setExpandedFeatureId(
                          expandedFeatureId === feature.id ? null : feature.id,
                        )
                      }
                      onToggleCollapse={() => onToggleCollapse(feature.id)}
                      onMultiSelectFeatureNodes={
                        onMultiSelectFeatureNodes
                          ? () => onMultiSelectFeatureNodes(feature.id)
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Feature</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{featureToDelete?.name}"? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
