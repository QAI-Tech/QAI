import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, GripVertical, Wand2 } from "lucide-react";
import { Edge, Node } from "@xyflow/react";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
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
import { CustomEdgeData, CustomNodeData } from "../types/graphHandlers";
import { formatEdgeBusinessLogic } from "../services/edgeFormatManager";
import { formatEdgeDescription } from "../services/edgeDescriptionFormatManager";

interface EdgeTableProps {
  selectedEdge: Edge | null;
  nodes: Node[];
  onEdgeDetailsChange: (
    edgeId: string,
    details: {
      description: string;
      paramValues: string[];
      business_logic?: string | null;
    },
  ) => void;
  autoFormatEnabled?: boolean;
}

export const EdgeTable: React.FC<EdgeTableProps> = ({
  selectedEdge,
  nodes,
  onEdgeDetailsChange,
  autoFormatEnabled = false,
}) => {
  const [editValue, setEditValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [paramValues, setParamValues] = useState<string[]>([]);
  const [newValue, setNewValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [businessLogic, setBusinessLogic] = useState("");

  const [formattingEdgeId, setFormattingEdgeId] = useState<string | null>(null);
  const [formattingDescriptionEdgeId, setFormattingDescriptionEdgeId] =
    useState<string | null>(null);

  const formatClickRef = useRef(false);
  const descriptionFormatClickRef = useRef(false);

  const selectedEdgeRef = useRef(selectedEdge);
  selectedEdgeRef.current = selectedEdge;

  // Set up sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const isFormatting =
    formattingEdgeId !== null && selectedEdge?.id === formattingEdgeId;

  const isFormattingDescription =
    formattingDescriptionEdgeId !== null &&
    selectedEdge?.id === formattingDescriptionEdgeId;

  // Helper function to extract placeholder name. Returns null if not found.
  const getPlaceholderName = (text: string): string | null => {
    const match = text.match(/\{\{(.*?)\}\}/);
    if (match && match[1] !== undefined) {
      // match[1] is the content inside {{...}}
      return match[1].trim() || null;
    }
    return null;
  };

  // Helper function to safely access edge data
  const getEdgeData = (edge: Edge): CustomEdgeData => {
    return (edge.data as unknown as CustomEdgeData) || {};
  };

  // Helper function to safely access node data
  const getNodeData = (node: Node): CustomNodeData => {
    const data = (node.data as unknown as CustomNodeData) || {};
    return {
      ...data,
      description: data.description || "",
    };
  };

  // Update edit value when selected edge changes
  useEffect(() => {
    if (selectedEdge) {
      const edgeData = getEdgeData(selectedEdge);
      setEditValue(edgeData.description || "");
      setParamValues(edgeData.paramValues || []);
      setBusinessLogic(
        typeof edgeData.business_logic === "string"
          ? edgeData.business_logic
          : "",
      );
      setIsEditing(false);
      setNewValue("");
      setIsSaving(false);
    }
  }, [selectedEdge?.id, selectedEdge?.data]);

  // Save on blur for Description and Business Logic
  const handleDescriptionBlur = () => {
    if (descriptionFormatClickRef.current) {
      descriptionFormatClickRef.current = false;
      return;
    }

    if (hasChanges && !isSaving) {
      handleSave({ autoFormatDescription: autoFormatEnabled });
    }
  };
  const handleBusinessLogicBlur = () => {
    if (formatClickRef.current) {
      formatClickRef.current = false;
      return;
    }

    if (hasChanges && !isSaving) {
      handleSave({ autoFormat: autoFormatEnabled });
    }
  };

  const handleSave = ({
    autoFormat = false,
    autoFormatDescription = false,
  }: {
    autoFormat?: boolean;
    autoFormatDescription?: boolean;
  } = {}) => {
    if (selectedEdge) {
      setIsSaving(true);
      try {
        const previousBusinessLogic =
          typeof selectedEdge.data?.business_logic === "string"
            ? selectedEdge.data.business_logic
            : "";
        const previousDescription = selectedEdge.data?.description || "";
        const savedDescription = editValue.trim();
        const savedParamValues = [...paramValues];
        const savedBusinessLogic = businessLogic.trim();

        onEdgeDetailsChange(selectedEdge.id, {
          description: savedDescription,
          paramValues: savedParamValues,
          business_logic: savedBusinessLogic,
        });

        setIsEditing(false);
        toast.success("Edge details saved successfully");

        if (
          autoFormat &&
          savedBusinessLogic &&
          savedBusinessLogic !== previousBusinessLogic
        ) {
          queueBusinessLogicFormatting(savedBusinessLogic, {
            silentOnEmpty: true,
          });
        }

        if (
          autoFormatDescription &&
          savedDescription &&
          savedDescription !== previousDescription
        ) {
          queueDescriptionFormatting(savedDescription, {
            silentOnEmpty: true,
          });
        }
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleCancel = () => {
    if (selectedEdge) {
      const edgeData = getEdgeData(selectedEdge);
      setEditValue(edgeData.description || "");
      setParamValues(edgeData.paramValues || []);
      setBusinessLogic(
        typeof edgeData.business_logic === "string"
          ? edgeData.business_logic
          : "",
      );
      setIsEditing(false);
      setNewValue("");
      setIsSaving(false);
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    options: { autoFormat?: boolean; autoFormatDescription?: boolean } = {},
  ) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave({
        autoFormat: options.autoFormat,
        autoFormatDescription: options.autoFormatDescription,
      });
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  const handleAddValue = () => {
    if (newValue.trim()) {
      setParamValues([...paramValues, newValue.trim()]);
      setNewValue("");
    }
  };

  const handleDeleteValue = (index: number) => {
    setParamValues(paramValues.filter((_, i) => i !== index));
  };

  const handleNewValueKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddValue();
    }
  };

  const queueBusinessLogicFormatting = (
    value: string,
    options: { silentOnEmpty?: boolean } = {},
  ) => {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      if (!options.silentOnEmpty) {
        toast.error("Please enter some business logic to format");
      }
      return false;
    }

    const edgeToFormat = selectedEdgeRef.current;
    if (!edgeToFormat) {
      toast.error("No edge selected");
      return false;
    }

    setFormattingEdgeId(edgeToFormat.id);
    const enqueued = formatEdgeBusinessLogic(edgeToFormat.id, trimmedValue);
    if (!enqueued) {
      toast.info("Formatting queued - will process when ready");
    }
    return true;
  };

  const handleFormatBusinessLogic = () => {
    formatClickRef.current = false;
    queueBusinessLogicFormatting(businessLogic);
  };

  const queueDescriptionFormatting = (
    value: string,
    options: { silentOnEmpty?: boolean } = {},
  ) => {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      if (!options.silentOnEmpty) {
        toast.error("Please enter a description to format");
      }
      return false;
    }

    const edgeToFormat = selectedEdgeRef.current;
    if (!edgeToFormat) {
      toast.error("No edge selected");
      return false;
    }

    setFormattingDescriptionEdgeId(edgeToFormat.id);
    const enqueued = formatEdgeDescription(edgeToFormat.id, trimmedValue);
    if (!enqueued) {
      toast.info("Formatting queued - will process when ready");
    }
    return true;
  };

  const handleFormatDescription = () => {
    descriptionFormatClickRef.current = false;
    queueDescriptionFormatting(editValue);
  };

  useEffect(() => {
    if (!selectedEdge) return;
    const edgeData = getEdgeData(selectedEdge);
    if (
      formattingEdgeId === selectedEdge.id &&
      typeof edgeData.business_logic === "string" &&
      edgeData.business_logic.trim().length > 0
    ) {
      setFormattingEdgeId(null);
      setBusinessLogic(edgeData.business_logic);
    }
    if (
      formattingDescriptionEdgeId === selectedEdge.id &&
      edgeData.description &&
      edgeData.description.trim().length > 0
    ) {
      setFormattingDescriptionEdgeId(null);
      setEditValue(edgeData.description);
    }
  }, [selectedEdge?.data, formattingEdgeId, formattingDescriptionEdgeId]);

  // Clear formatting states after timeout to handle errors
  useEffect(() => {
    if (formattingEdgeId) {
      const timer = setTimeout(() => {
        setFormattingEdgeId(null);
      }, 30000); // 30 second timeout
      return () => clearTimeout(timer);
    }
  }, [formattingEdgeId]);

  useEffect(() => {
    if (formattingDescriptionEdgeId) {
      const timer = setTimeout(() => {
        setFormattingDescriptionEdgeId(null);
      }, 30000); // 30 second timeout
      return () => clearTimeout(timer);
    }
  }, [formattingDescriptionEdgeId]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setParamValues((items) => {
        const oldIndex = items.findIndex(
          (_, index) => index.toString() === active.id,
        );
        const newIndex = items.findIndex(
          (_, index) => index.toString() === over?.id,
        );

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  if (!selectedEdge) {
    return null;
  }

  // Get source and target node descriptions
  const sourceNode = nodes.find((node) => node.id === selectedEdge.source);
  const targetNode = nodes.find((node) => node.id === selectedEdge.target);
  const sourceDescription = sourceNode
    ? getNodeData(sourceNode).description
    : selectedEdge.source;
  const targetDescription = targetNode
    ? getNodeData(targetNode).description
    : selectedEdge.target;

  const edgeData = getEdgeData(selectedEdge);
  const hasDescription =
    edgeData.description && edgeData.description.trim().length > 0;

  // Check for placeholders in the current description (use editValue when editing, otherwise use saved description)
  const currentDescription = isEditing ? editValue : edgeData.description || "";
  const placeholderName = getPlaceholderName(currentDescription);
  const showParamTable = placeholderName !== null && paramValues.length > 0;

  const hasChanges =
    editValue !== (edgeData.description || "") ||
    JSON.stringify(paramValues) !==
      JSON.stringify(edgeData.paramValues || []) ||
    businessLogic !== (edgeData.business_logic || "");

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm truncate">
            {hasDescription ? edgeData.description : "No description"}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <div className="text-xs text-muted-foreground">
          <div>
            From {sourceDescription} to {targetDescription}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium">Description</label>
          {isEditing ? (
            <div className="space-y-1">
              <Textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) =>
                  handleKeyDown(e, {
                    autoFormatDescription: autoFormatEnabled,
                  })
                }
                onBlur={handleDescriptionBlur}
                placeholder="Enter transition description"
                className="h-20 text-sm"
              />
              <div className="flex justify-end">
                <Button
                  onMouseDown={() => {
                    descriptionFormatClickRef.current = true;
                  }}
                  onClick={handleFormatDescription}
                  disabled={isFormattingDescription || !editValue.trim()}
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs"
                >
                  <Wand2 className="h-3 w-3 mr-1" />
                  {isFormattingDescription ? "Formatting..." : "Format"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div
                className={`p-3 border rounded-md min-h-[5rem] cursor-pointer hover:bg-gray-50 ${
                  hasDescription
                    ? "border-gray-300 bg-white"
                    : "border-red-300 bg-red-50"
                }`}
                onClick={() => setIsEditing(true)}
              >
                <div
                  className={`text-sm ${hasDescription ? "text-gray-700" : "text-red-500 italic"}`}
                >
                  {hasDescription
                    ? edgeData.description
                    : "No description - click to add"}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium">Business Logic</label>
          {isEditing ? (
            <div className="space-y-1">
              <Textarea
                placeholder="Enter business logic for this edge"
                value={businessLogic}
                onChange={(e) => setBusinessLogic(e.target.value)}
                onKeyDown={(e) =>
                  handleKeyDown(e, {
                    autoFormat: autoFormatEnabled,
                  })
                }
                onBlur={handleBusinessLogicBlur}
                className="h-16 text-sm"
              />
              <div className="flex justify-end">
                <Button
                  onMouseDown={() => {
                    formatClickRef.current = true;
                  }}
                  onClick={handleFormatBusinessLogic}
                  disabled={isFormatting || !businessLogic.trim()}
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs"
                >
                  <Wand2 className="h-3 w-3 mr-1" />
                  {isFormatting ? "Formatting..." : "Format"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div
                className={`p-3 border rounded-md min-h-[4rem] cursor-pointer hover:bg-gray-50 ${
                  businessLogic.trim()
                    ? "border-gray-300 bg-white"
                    : "border-red-300 bg-red-50"
                }`}
                onClick={() => setIsEditing(true)}
              >
                <div
                  className={`text-sm ${businessLogic.trim() ? "text-gray-700" : "text-red-500 italic"}`}
                >
                  {businessLogic.trim()
                    ? businessLogic
                    : "No business logic - click to add"}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Parameter Values Table Section - Only show when placeholders detected */}
        {placeholderName !== null ? (
          <div className="space-y-2 mt-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">{`{{${placeholderName}}} Values`}</h4>
              <div className="flex gap-2">
                <Input
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  onKeyDown={handleNewValueKeyDown}
                  placeholder="Add new value"
                  className="h-8 w-32 text-xs"
                />
                <Button
                  onClick={handleAddValue}
                  size="sm"
                  variant="outline"
                  className="h-8 px-2"
                  disabled={!newValue.trim()}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {paramValues.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <Table>
                  <TableBody>
                    <SortableContext
                      items={paramValues.map((_, index) => index.toString())}
                      strategy={verticalListSortingStrategy}
                    >
                      {paramValues.map((value, index) => (
                        <SortableItem
                          key={index}
                          id={index.toString()}
                          value={value}
                          onRemove={() => handleDeleteValue(index)}
                        />
                      ))}
                    </SortableContext>
                  </TableBody>
                </Table>
              </DndContext>
            ) : (
              <div className="text-center py-4 text-sm text-muted-foreground border border-dashed rounded-md">
                No values added yet
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 text-center py-4 text-sm text-muted-foreground border border-dashed rounded-md">
            Add your first {"{{parameter}}"} in the description to add values
          </div>
        )}
      </CardContent>
    </Card>
  );
};

interface SortableItemProps {
  id: string;
  value: string;
  onRemove: () => void;
}

const SortableItem: React.FC<SortableItemProps> = ({ id, value, onRemove }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
    zIndex: isDragging ? 1000 : "auto",
    opacity: isDragging ? 0.8 : 1,
  } as const;

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={`group ${isDragging ? "shadow-lg border-purple-300" : ""}`}
    >
      <TableCell className="py-2">
        <div className="flex items-center justify-between">
          <span className="text-sm">{value}</span>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              {...attributes}
              {...listeners}
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-gray-500 hover:text-gray-700 hover:bg-gray-100 cursor-grab active:cursor-grabbing"
            >
              <GripVertical className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
              onClick={onRemove}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
};
