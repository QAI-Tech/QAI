// @ts-nocheck
import React, { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Node, Edge } from "@xyflow/react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/global/delete-confirmation-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Download,
  Upload,
  Trash2,
  Search,
  ChevronDown,
  ChevronUp,
  Edit2,
  Check,
  X,
  Link,
  Loader2,
  GripVertical,
  CheckSquare,
  Square,
  ClipboardList,
  RefreshCw,
  Play,
  ChevronLeft,
  Plus,
  Wand2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useFlowDetailsKeyboardNavigation } from "@/hooks/use-flow-details-keyboard-navigation";
import { transitions } from "@/lib/animations";
import { computeFlowChainsAsync } from "@/app/(editor)/utils/asyncFlowReachability";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FlowDetailsPanel } from "./FlowDetailsPanel";
import { VideoFlowQueue } from "./VideoFlowQueue";
import {
  GCS_BUCKET_URL,
  GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT,
  isQaiOrgUser,
} from "@/lib/constants";
import { useUser } from "@clerk/nextjs";
import type { VideoFlowQueueItem } from "@/app/store/videoFlowQueueSlice";
import { ScenariosDialog } from "@/app/(dashboard)/[product]/homev1/test-cases/components/scenarios-dialog";
import { TestCaseCredentials } from "@/components/ui/test-case-credentials";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProductSwitcher } from "@/providers/product-provider";
import { useDispatch } from "react-redux";
import { fetchCredentials } from "@/app/store/credentialsSlice";
import { deleteFeature, updateFeature } from "@/app/store/featuresSlice";
import { Separator } from "@/components/ui/separator";
import { VideoPlayer } from "@/components/ui/video-player";
import {
  TestCaseType,
  Criticality,
  testCaseSchema,
  Scenario,
} from "@/lib/types";
import { detectTestCaseParameters } from "@/lib/utils";
import type { AppDispatch } from "@/app/store/store";
import {
  TestRunSelectionProvider,
  useTestRunSelection,
} from "../contexts/TestRunSelectionContext";
import { FeatureSelectionList } from "./FeatureSelectionList";
import { formatEdgeBusinessLogic } from "@/app/(editor)/services/edgeFormatManager";
import { formatEdgeDescription } from "@/app/(editor)/services/edgeDescriptionFormatManager";
import {
  UNASSIGNED_FLOWS_FEATURE_ID,
  UNASSIGNED_FLOWS_FEATURE_NAME,
} from "@/lib/constants";
export interface Flow {
  id: string;
  name: string;
  startNodeId: string;
  endNodeId: string;
  viaNodeIds: string[];
  pathNodeIds: string[];
  precondition?: string;
  description?: string;
  autoPlan?: boolean;
  scenarios?: Scenario[];
  credentials?: string[];
  videoUrl?: string;
  feature_id?: string;
}

export interface Scenario {
  id: string;
  description: string;
  params: {
    parameter_name: string;
    parameter_value: string;
  }[];
}

export interface Feature {
  id: string;
  name: string;
  nodeIds: string[];
  isCollapsed?: boolean;
  collapsedCenterPosition?: { x: number; y: number };
}

export type FeatureUpdates = Partial<Omit<Feature, "id">>;

interface FlowDetailsVerticalPanelProps {
  flow: Flow;
  nodes: Node[];
  edges: Edge[];
  onClose: () => void;
  onRecapture?: () => void;
  onDelete?: () => void;
  onPreconditionSave?: (value: string) => void;
  onFlowDescriptionSave?: (value: string) => void;
  onFlowRename?: (flowId: string, newName: string) => void;
  onEdgeDetailsChange?: (
    edgeId: string,
    details: {
      description: string;
      paramValues: string[];
      business_logic?: string | null;
    },
  ) => void;
  onFlowStepClick?: (sourceNodeId: string, targetNodeId: string) => void;
  onFlowScenariosUpdate?: (flowId: string, scenarios: Scenario[]) => void;
  onFlowCredentialsUpdate?: (flowId: string, credentials: string[]) => void;
  projectType?: "web" | "mobile";
  addNewNodes?: (nodes: Node[]) => void;
  updateNodeDescription?: (nodeId: string, newDescription: string) => void;
  isFlowsPanel?: boolean;
  features?: Feature[];
  flowFeature?: Feature | null;
  onFlowFeatureUpdate?: (flowId: string, featureId: string) => void;
}

const FlowDetailsVerticalPanel: React.FC<FlowDetailsVerticalPanelProps> = ({
  flow,
  nodes,
  edges,
  onClose,
  onRecapture,
  onDelete,
  onPreconditionSave,
  onFlowDescriptionSave,
  onFlowRename,
  onEdgeDetailsChange,
  onFlowStepClick,
  onFlowScenariosUpdate,
  onFlowCredentialsUpdate,
  projectType = "mobile",
  addNewNodes,
  updateNodeDescription,
  isFlowsPanel = false,
  features = [],
  flowFeature = null,
  onFlowFeatureUpdate,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [hasNavigatedSteps, setHasNavigatedSteps] = useState(false);
  const InitialAutoPanRef = useRef(false);
  const lastAutoPanKeyRef = useRef<string | null>(null);
  const [isScenariosDialogOpen, setIsScenariosDialogOpen] = useState(false);
  const [isCredentialsDialogOpen, setIsCredentialsDialogOpen] = useState(false);
  const { productSwitcher } = useProductSwitcher();
  const dispatch = useDispatch<AppDispatch>();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stableEmptyScenariosRef = useRef<Scenario[]>([]);
  const formatClickRef = useRef(false);
  const descriptionFormatClickRef = useRef(false);
  const [formattingEdgeMap, setFormattingEdgeMap] = useState<
    Record<string, { pendingValue: string; startedAt: number }>
  >({});
  const [formattingDescriptionEdgeMap, setFormattingDescriptionEdgeMap] =
    useState<Record<string, { pendingValue: string; startedAt: number }>>({});
  const formattingEdgeMapRef = useRef(formattingEdgeMap);
  const formattingDescriptionEdgeMapRef = useRef(formattingDescriptionEdgeMap);

  useEffect(() => {
    if (productSwitcher.product_id) {
      dispatch(fetchCredentials(productSwitcher.product_id));
    }
  }, [productSwitcher.product_id, dispatch]);

  useEffect(() => {
    InitialAutoPanRef.current = false;
    lastAutoPanKeyRef.current = null;
  }, [flow.id]);

  const [isEdgeEditing, setIsEdgeEditing] = useState(false);
  const [isBusinessLogicFocused, setIsBusinessLogicFocused] = useState(false);

  useEffect(() => {
    formattingEdgeMapRef.current = formattingEdgeMap;
  }, [formattingEdgeMap]);

  useEffect(() => {
    formattingDescriptionEdgeMapRef.current = formattingDescriptionEdgeMap;
  }, [formattingDescriptionEdgeMap]);

  useEffect(() => {
    const handleBusinessLogicComplete = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | {
            edgeId: string;
            success: boolean;
            formattedBusinessLogic: string;
            metaLogic?: string;
            error?: string;
            isEmpty: boolean;
          }
        | undefined;

      if (!detail?.edgeId) return;

      const wasFormatting = Boolean(
        formattingEdgeMapRef.current?.[detail.edgeId],
      );
      if (!wasFormatting) return;

      setFormattingEdgeMap((prev) => {
        if (!prev[detail.edgeId]) return prev;
        const next = { ...prev };
        delete next[detail.edgeId];
        return next;
      });

      if (!detail.success || detail.isEmpty) {
        toast({
          title: "Business Logic Formatting Failed",
          description:
            detail.metaLogic ||
            detail.error ||
            "The business logic could not be formatted.",
          variant: "destructive",
        });
      }
    };

    const handleDescriptionComplete = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | {
            edgeId: string;
            success: boolean;
            formattedDescription: string;
            metaLogic?: string;
            error?: string;
            isEmpty: boolean;
          }
        | undefined;

      if (!detail?.edgeId) return;

      const wasFormatting = Boolean(
        formattingDescriptionEdgeMapRef.current?.[detail.edgeId],
      );
      if (!wasFormatting) return;

      setFormattingDescriptionEdgeMap((prev) => {
        if (!prev[detail.edgeId]) return prev;
        const next = { ...prev };
        delete next[detail.edgeId];
        return next;
      });

      if (!detail.success || detail.isEmpty) {
        toast({
          title: "Description Formatting Failed",
          description:
            detail.metaLogic ||
            detail.error ||
            "The description could not be formatted.",
          variant: "destructive",
        });
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener(
        "edgeBusinessLogicFormatTaskComplete",
        handleBusinessLogicComplete as EventListener,
      );
      window.addEventListener(
        "edgeDescriptionFormatTaskComplete",
        handleDescriptionComplete as EventListener,
      );
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(
          "edgeBusinessLogicFormatTaskComplete",
          handleBusinessLogicComplete as EventListener,
        );
        window.removeEventListener(
          "edgeDescriptionFormatTaskComplete",
          handleDescriptionComplete as EventListener,
        );
      }
    };
  }, [toast]);

  const [title, setTitle] = useState(flow.name);
  const [description, setDescription] = useState(flow.description || "");
  const [preconditions, setPreconditions] = useState(flow.precondition || "");
  const [showPreconditionsInput, setShowPreconditionsInput] = useState(
    !!flow.precondition,
  );
  const [stepFields, setStepFields] = useState<
    Record<
      string,
      {
        screenName: string;
        action: string;
        businessLogic: string;
        showBusinessLogic: boolean;
      }
    >
  >({});

  useEffect(() => {
    setPreconditions(flow.precondition || "");
    setDescription(flow.description || "");
    setCurrentStepIndex(0);
    setIsVideoPlaying(false);
    setVideoSrc(null);
    setVideoError(null);
    setTitle(flow.name);
    setHasNavigatedSteps(false);
  }, [flow.id, flow.precondition, flow.description, flow.name]);

  useEffect(() => {
    let cancelled = false;
    const raw = (flow.videoUrl || "").trim();

    if (!raw) {
      setVideoSrc(null);
      setVideoError(null);
      return () => {
        cancelled = true;
      };
    }

    if (!raw.startsWith(GCS_BUCKET_URL)) {
      setVideoSrc(raw);
      setVideoError(null);
      return () => {
        cancelled = true;
      };
    }

    const apiUrl = `${GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT}${raw.substring(
      GCS_BUCKET_URL.length,
    )}`;

    (async () => {
      try {
        setVideoError(null);
        const response = await fetch(apiUrl);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch video signed URL: ${response.status} ${response.statusText}`,
          );
        }
        const { signedUrl } = await response.json();
        if (!cancelled) {
          setVideoSrc(typeof signedUrl === "string" ? signedUrl : null);
        }
      } catch (error) {
        if (!cancelled) {
          setVideoSrc(null);
          setVideoError(
            error instanceof Error ? error.message : "Failed to load video",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [flow.videoUrl]);

  const nodeMap = useMemo(() => {
    const map = new Map<string, Node>();
    nodes.forEach((node) => map.set(node.id, node));
    return map;
  }, [nodes]);

  const stepNodeIds = useMemo(() => {
    if (Array.isArray(flow.pathNodeIds) && flow.pathNodeIds.length > 0) {
      return flow.pathNodeIds;
    }
    const sequence = [
      flow.startNodeId,
      ...(flow.viaNodeIds || []),
      flow.endNodeId,
    ].filter(Boolean) as string[];
    return Array.from(new Set(sequence));
  }, [flow.startNodeId, flow.viaNodeIds, flow.endNodeId, flow.pathNodeIds]);

  const steps = useMemo(() => {
    // For n screens, we show n-1 steps (edges between screens),
    // so we only create steps for nodes that have a "next" node.
    if (stepNodeIds.length <= 1) return [];

    return stepNodeIds.slice(0, -1).map((nodeId, index) => {
      const node = nodeMap.get(nodeId);
      const screenName =
        (node?.data as any)?.title ||
        (node?.data as any)?.description ||
        `Node ${nodeId}`;
      const nextId = stepNodeIds[index + 1];
      const edge = edges.find(
        (e) => e.source === nodeId && e.target === nextId,
      );
      const edgeAction = edge?.data?.description || "";
      const businessLogic = edge?.data?.business_logic || null;

      return {
        id: nodeId,
        edgeId: edge?.id,
        screenName,
        action: edgeAction || "Proceed to next screen",
        businessLogic,
        edge,
      };
    });
  }, [edges, nodeMap, stepNodeIds]);

  useEffect(() => {
    const fields: Record<
      string,
      {
        screenName: string;
        action: string;
        businessLogic: string;
        showBusinessLogic: boolean;
      }
    > = {};
    steps.forEach((step) => {
      fields[step.id] = {
        screenName: step.screenName || "",
        action: step.action || "",
        businessLogic: step.businessLogic || "",
        showBusinessLogic: !!step.businessLogic,
      };
    });
    setStepFields(fields);
  }, [flow.id, steps]);

  useEffect(() => {
    if (!onFlowStepClick || steps.length === 0) return;

    const allowInitialAutoPan = Boolean(
      isFlowsPanel && !InitialAutoPanRef.current,
    );
    if (!hasNavigatedSteps && !allowInitialAutoPan) return;

    const fromId = stepNodeIds[currentStepIndex];
    const toId = stepNodeIds[currentStepIndex + 1];

    if (!fromId || !toId) return;
    if (fromId === toId) return;

    const autoPanKey = `${fromId}->${toId}`;
    if (lastAutoPanKeyRef.current === autoPanKey) return;
    lastAutoPanKeyRef.current = autoPanKey;
    if (allowInitialAutoPan) {
      InitialAutoPanRef.current = true;
    }

    const timeoutId = setTimeout(() => {
      onFlowStepClick(fromId, toId);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [
    currentStepIndex,
    steps.length,
    stepNodeIds,
    hasNavigatedSteps,
    onFlowStepClick,
    isFlowsPanel,
  ]);

  useEffect(() => {
    const handleCanvasInteraction = () => {
      if (hasNavigatedSteps) {
        setHasNavigatedSteps(false);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener(
        "graphCanvasInteraction",
        handleCanvasInteraction,
      );

      window.addEventListener("graphNodeEdit", handleCanvasInteraction);
      window.addEventListener("graphEdgeEdit", handleCanvasInteraction);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(
          "graphCanvasInteraction",
          handleCanvasInteraction,
        );
        window.removeEventListener("graphNodeEdit", handleCanvasInteraction);
        window.removeEventListener("graphEdgeEdit", handleCanvasInteraction);
      }
    };
  }, [hasNavigatedSteps]);

  useFlowDetailsKeyboardNavigation({
    enabled: true,
    onStepPrevious: () => {
      if (currentStepIndex > 0) {
        setHasNavigatedSteps(true);
        setCurrentStepIndex((prev) => prev - 1);
      }
    },
    onStepNext: () => {
      if (currentStepIndex < steps.length - 1) {
        setHasNavigatedSteps(true);
        setCurrentStepIndex((prev) => prev + 1);
      }
    },
    onClose,
    canGoToPreviousStep: currentStepIndex > 0,
    canGoToNextStep: currentStepIndex < steps.length - 1,
    isDialogOpen: isScenariosDialogOpen || isCredentialsDialogOpen,
  });

  const currentStep = steps[currentStepIndex];
  const currentStepFields = currentStep ? stepFields[currentStep.id] : null;

  useEffect(() => {
    const step = steps[currentStepIndex];
    if (!step?.edge) return;

    const latestEdge = edges.find((edge) => edge.id === step.edge.id);
    if (!latestEdge) return;

    const latestDescription =
      typeof latestEdge.data?.description === "string"
        ? latestEdge.data.description
        : "";
    const latestBusinessLogic =
      typeof latestEdge.data?.business_logic === "string"
        ? latestEdge.data.business_logic
        : "";

    setStepFields((prev) => {
      const currentFields = prev[step.id];
      if (!currentFields) return prev;

      const next = { ...prev };
      const nextFields = { ...currentFields };
      let changed = false;

      if (latestDescription && latestDescription !== currentFields.action) {
        nextFields.action = latestDescription;
        changed = true;
      }
      if (
        latestBusinessLogic &&
        latestBusinessLogic !== currentFields.businessLogic
      ) {
        nextFields.businessLogic = latestBusinessLogic;
        changed = true;
      }

      if (!changed) return prev;
      next[step.id] = nextFields;
      return next;
    });
  }, [edges, steps, currentStepIndex]);

  const goToPrevStep = () => {
    setHasNavigatedSteps(true);
    setCurrentStepIndex((prev) => Math.max(0, prev - 1));
  };

  const goToNextStep = () => {
    setHasNavigatedSteps(true);
    setCurrentStepIndex((prev) => Math.min(steps.length - 1, prev + 1));
  };

  const updateStepField = (
    stepId: string,
    field: "screenName" | "action" | "businessLogic",
    value: string,
  ) => {
    // 1. Update local state
    setStepFields((prev) => ({
      ...prev,
      [stepId]: {
        ...prev[stepId],
        [field]: value,
      },
    }));

    // 2. Propagate to graph
    if (!stepId) return;

    if (field === "screenName") {
      if (updateNodeDescription) {
        updateNodeDescription(stepId, value);
      }
      return;
    }

    if (field === "businessLogic") {
      return;
    }

    const currentStep = steps.find((s) => s.id === stepId);
    if (!currentStep?.edge) return;

    if (field === "action") {
      if (onEdgeDetailsChange) {
        const currentFields = stepFields[stepId];
        // We need the NEW value for the field being updated, and OLD value for the other.
        const newAction = value;
        const newBusinessLogic = currentFields.businessLogic;

        onEdgeDetailsChange(currentStep.edge.id, {
          description: newAction,
          paramValues: Array.isArray(currentStep.edge.data?.paramValues)
            ? currentStep.edge.data.paramValues
            : [],
          business_logic: newBusinessLogic.trim() || null,
        });
      }
    }
  };

  const toggleBusinessLogic = (stepId: string) => {
    setStepFields((prev) => ({
      ...prev,
      [stepId]: {
        ...prev[stepId],
        showBusinessLogic: true,
      },
    }));
  };

  const handlePreconditionBlur = () => {
    const trimmed = preconditions.trim();
    if (trimmed) {
      setPreconditions(trimmed);
      onPreconditionSave?.(trimmed);
    } else {
      setPreconditions("");
      setShowPreconditionsInput(false);
    }
  };

  const handleDescriptionBlur = () => {
    const trimmed = description.trim();
    setDescription(trimmed);
    if (onFlowDescriptionSave && trimmed !== (flow.description || "")) {
      onFlowDescriptionSave(trimmed);
    }
  };

  const handleTitleBlur = () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== flow.name && onFlowRename) {
      onFlowRename(flow.id, trimmed);
    }
  };

  const handleActionBlur = () => {
    if (descriptionFormatClickRef.current) {
      descriptionFormatClickRef.current = false;
      return;
    }

    if (!currentStep?.edge || !onEdgeDetailsChange) return;

    const currentFields = stepFields[currentStep.id];
    if (!currentFields) return;

    const currentDescription = currentStep.edge.data?.description || "";
    const hasChange = currentFields.action !== currentDescription;

    if (hasChange) {
      onEdgeDetailsChange(currentStep.edge.id, {
        description: currentFields.action,
        paramValues: Array.isArray(currentStep.edge.data?.paramValues)
          ? currentStep.edge.data.paramValues
          : [],
        business_logic:
          typeof currentStep.edge.data?.business_logic === "string"
            ? currentStep.edge.data.business_logic
            : null,
      });
    }
  };

  const handleBusinessLogicBlur = () => {
    if (formatClickRef.current) {
      formatClickRef.current = false;
      return;
    }

    if (!currentStep?.edge || !onEdgeDetailsChange) return;

    const currentFields = stepFields[currentStep.id];
    if (!currentFields) return;

    const trimmedLogic = currentFields.businessLogic.trim();
    const currentBusinessLogic = currentStep.edge.data?.business_logic || "";
    const hasChange = trimmedLogic !== currentBusinessLogic;

    if (hasChange) {
      onEdgeDetailsChange(currentStep.edge.id, {
        description: currentStep.edge.data?.description || "",
        paramValues: Array.isArray(currentStep.edge.data?.paramValues)
          ? currentStep.edge.data.paramValues
          : [],
        business_logic: trimmedLogic || null,
      });
    }

    if (!trimmedLogic) {
      setStepFields((prev) => ({
        ...prev,
        [currentStep.id]: {
          ...prev[currentStep.id],
          businessLogic: "",
          showBusinessLogic: false,
        },
      }));
    }
  };

  const queueBusinessLogicFormatting = (edge: Edge, logic: string) => {
    const trimmedLogic = logic.trim();
    if (!trimmedLogic) {
      return false;
    }

    setFormattingEdgeMap((currentMap) => ({
      ...currentMap,
      [edge.id]: { pendingValue: trimmedLogic, startedAt: Date.now() },
    }));

    const enqueued = formatEdgeBusinessLogic(edge.id, trimmedLogic);
    if (!enqueued) {
      toast({
        title: "Formatting queued",
        description:
          "We'll format this business logic as soon as the formatter is ready.",
      });
    }

    return true;
  };

  const handleManualFormat = () => {
    if (!currentStep?.edge) {
      return;
    }

    const currentFields = stepFields[currentStep.id];
    if (!currentFields) return;

    const rawValue = currentFields.businessLogic;

    if (!rawValue.trim()) {
      toast({
        title: "Add business logic",
        description: "Enter business logic before requesting formatting.",
        variant: "destructive",
      });
      return;
    }

    queueBusinessLogicFormatting(currentStep.edge, rawValue);
  };

  const queueDescriptionFormatting = (edge: Edge, description: string) => {
    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      toast({
        title: "Add description",
        description: "Enter a description before requesting formatting.",
        variant: "destructive",
      });
      return false;
    }

    setFormattingDescriptionEdgeMap((currentMap) => ({
      ...currentMap,
      [edge.id]: { pendingValue: trimmedDescription, startedAt: Date.now() },
    }));

    const enqueued = formatEdgeDescription(edge.id, trimmedDescription);
    if (!enqueued) {
      toast({
        title: "Formatting queued",
        description:
          "We'll format this description as soon as the formatter is ready.",
      });
    }

    return true;
  };

  const handleFormatDescription = () => {
    if (!currentStep?.edge) {
      return;
    }

    const currentFields = stepFields[currentStep.id];
    if (!currentFields) return;

    const rawValue = currentFields.action;

    if (!rawValue.trim()) {
      toast({
        title: "Add description",
        description: "Enter a description before requesting formatting.",
        variant: "destructive",
      });
      return;
    }

    queueDescriptionFormatting(currentStep.edge, rawValue);
  };

  const createFlowDescription = useMemo(() => {
    if (!flow) return "";

    let description = flow.precondition || "";

    const edgeDescriptions: string[] = [];
    for (let i = 0; i < steps.length - 1; i++) {
      const currentStep = steps[i];
      const nextStep = steps[i + 1];
      const edge = edges.find(
        (e) => e.source === currentStep.id && e.target === nextStep.id,
      );
      const edgeDesc = edge?.data?.description || "";

      if (edgeDesc.trim()) {
        edgeDescriptions.push(edgeDesc);
      }
    }

    if (edgeDescriptions.length > 0) {
      if (description) {
        description += "\n\nFlow Steps:\n";
      } else {
        description = "Flow Steps:\n";
      }
      description += edgeDescriptions.join("\n");
    }

    return description;
  }, [flow, steps, edges]);

  const mockTestCase = useMemo(
    () => ({
      test_case_id: flow?.id || "",
      test_case_description: createFlowDescription,
      scenarios: flow?.scenarios ?? stableEmptyScenariosRef.current,
      preconditions: [],
      test_case_steps: [],
      credentials: flow?.credentials || [],
      mirrored_test_cases: [],
      created_at: new Date().toISOString(),
      test_case_type: TestCaseType.ui,
      criticality: Criticality.HIGH,
      title: flow?.name || "",
    }),
    [flow, createFlowDescription],
  );

  const hasParameters = useMemo(() => {
    const detectedParameters = detectTestCaseParameters(mockTestCase);
    return detectedParameters.length > 0;
  }, [mockTestCase]);

  const scenariosCount = flow?.scenarios?.length || 0;
  const credentialsCount = flow?.credentials?.length || 0;

  const handlePickScreen = () => {
    if (!videoRef.current || !addNewNodes) {
      toast({
        title: "Error",
        description: "Video player not ready or addNewNodes not available",
        variant: "destructive",
      });
      return;
    }

    try {
      const video = videoRef.current;

      if (video.readyState < 2) {
        toast({
          title: "Video not ready",
          description: "Please wait for the video to load",
          variant: "destructive",
        });
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || video.clientWidth;
      canvas.height = video.videoHeight || video.clientHeight;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Could not get canvas context");
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);

      const nodeId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `node_${Date.now()}`;

      let positionX = 200;
      let positionY = 200;
      const nodeSpacing = projectType === "web" ? 350 : 250;

      if (flow?.pathNodeIds && flow.pathNodeIds.length > 0) {
        const flowNodes = flow.pathNodeIds
          .map((nid) => nodes.find((n) => n.id === nid))
          .filter(Boolean) as any[];

        if (flowNodes.length > 0) {
          const lastFlowNode = flowNodes[flowNodes.length - 1];
          let baseX = lastFlowNode.position.x;
          let baseY = lastFlowNode.position.y;

          // Check for nodes already positioned to the right (similar to browserdroid logic)
          const nodesOnRight = nodes.filter(
            (node) =>
              node.position.x > baseX && Math.abs(node.position.y - baseY) < 50,
          );

          const rightmostX =
            nodesOnRight.length > 0
              ? Math.max(...nodesOnRight.map((n) => n.position.x))
              : baseX;

          positionX = rightmostX + nodeSpacing;
          positionY = baseY;
        }
      } else if (nodes.length > 0) {
        // Fallback if flow has no nodes but graph has nodes
        const maxX = Math.max(...nodes.map((n) => n.position.x));
        const maxY = Math.max(...nodes.map((n) => n.position.y));
        positionX = maxX + nodeSpacing;
        positionY = Math.max(100, maxY - 100);
      }

      const newNode = {
        id: nodeId,
        type: "customNode",
        position: { x: positionX, y: positionY },
        data: {
          image: dataUrl,
          description: "Picked Screen",
        },
        deletable: true,
      };

      addNewNodes([newNode]);

      toast({
        title: "Screen captured",
        description: "New screen added to the graph",
        variant: "success",
      });
    } catch (error) {
      console.error("Pick screen error:", error);
      toast({
        title: "Capture failed",
        description:
          error instanceof Error ? error.message : "Failed to capture screen",
        variant: "destructive",
      });
    }
  };

  const renderVideoFrame = () => {
    if (isVideoPlaying && videoSrc) {
      return (
        <div className="bg-muted rounded-lg relative overflow-hidden border-2 border-primary/20 aspect-[9/16] w-full max-w-[280px]">
          <VideoPlayer
            src={videoSrc}
            autoPlay={true}
            className="w-full h-full"
            fitMode="contain"
            backgroundColor="transparent"
            videoElementRef={videoRef}
          />
        </div>
      );
    }

    return (
      <div
        className="bg-muted rounded-lg flex items-center justify-center cursor-pointer group relative overflow-hidden border-2 border-primary/20 hover:border-primary transition-colors duration-fast aspect-[9/16] w-full max-w-[280px]"
        onClick={() => {
          if (flow.videoUrl && videoSrc) {
            setIsVideoPlaying(true);
          }
        }}
      >
        {flow.videoUrl ? (
          <Play className="h-10 w-10 text-primary group-hover:scale-110 transition-transform duration-fast" />
        ) : (
          <div className="text-center">
            <Play className="h-10 w-10 text-primary mx-auto mb-2" />
            <p className="text-sm text-primary">No video</p>
          </div>
        )}
      </div>
    );
  };

  const handleScenariosUpdate = (updatedTestCase: testCaseSchema) => {
    if (onFlowScenariosUpdate && flow) {
      onFlowScenariosUpdate(flow.id, updatedTestCase.scenarios || []);
    }
  };

  const handleCredentialChange = (credentialId: string) => {
    if (onFlowCredentialsUpdate && flow) {
      const existingCredentials = flow.credentials || [];
      const newCredentials = existingCredentials.includes(credentialId)
        ? existingCredentials.filter((id) => id !== credentialId)
        : [...existingCredentials, credentialId];
      onFlowCredentialsUpdate(flow.id, newCredentials);
    }
  };

  const handleCredentialRemove = (credentialId: string) => {
    if (onFlowCredentialsUpdate && flow) {
      const existingCredentials = flow.credentials || [];
      const newCredentials = existingCredentials.filter(
        (id) => id !== credentialId,
      );
      onFlowCredentialsUpdate(flow.id, newCredentials);
    }
  };

  const editableInputClass =
    "bg-transparent border border-transparent p-1 -m-1 rounded transition-colors hover:border-border focus:border-primary focus-visible:ring-0 focus-visible:ring-offset-0";

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={transitions.normal}
      className="h-full flex flex-col p-4 overflow-y-auto"
    >
      <div className="flex-shrink-0 flex flex-col">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors duration-fast"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 flex flex-col min-w-0">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              className={cn(
                "w-full !text-lg font-semibold h-auto",
                editableInputClass,
              )}
              placeholder="Flow title"
            />
            <div className="text-xs text-muted-foreground mt-0.5 px-1 truncate">
              Use Shift + Left/Right to switch flows
            </div>
          </div>
          <div className="flex items-center gap-3">
            {onRecapture && (
              <button
                onClick={onRecapture}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-fast hidden"
              >
                Recapture
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="text-sm text-muted-foreground hover:text-destructive transition-colors duration-fast"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        <Textarea
          ref={(el) => {
            if (el) {
              const lineHeight = 24;
              const minHeight = lineHeight * 3;
              el.style.height = minHeight + "px";
            }
          }}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
          onBlur={handleDescriptionBlur}
          placeholder="Add a description..."
          className={cn(
            "resize-none text-sm text-foreground leading-relaxed mb-3 min-h-[72px] max-h-[72px] overflow-y-auto",
            editableInputClass,
          )}
        />

        {features.length > 0 && (
          <div className="mt-2 mb-3">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Feature
            </label>
            <Select
              value={flowFeature?.id || UNASSIGNED_FLOWS_FEATURE_ID}
              onValueChange={(value) => {
                if (onFlowFeatureUpdate) {
                  onFlowFeatureUpdate(
                    flow.id,
                    value === UNASSIGNED_FLOWS_FEATURE_ID ? "" : value,
                  );
                }
              }}
            >
              <SelectTrigger className="w-full">
                <span className="flex-1 text-left">
                  {flowFeature?.name || UNASSIGNED_FLOWS_FEATURE_NAME}
                </span>
              </SelectTrigger>
              <SelectContent>
                {!flow.feature_id && (
                  <SelectItem value={UNASSIGNED_FLOWS_FEATURE_ID}>
                    {UNASSIGNED_FLOWS_FEATURE_NAME}
                  </SelectItem>
                )}
                {features.map((feature) => (
                  <SelectItem key={feature.id} value={feature.id}>
                    {feature.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {showPreconditionsInput || preconditions ? (
          <div className="mt-1 mb-3">
            <span className="text-xs font-medium text-muted-foreground mb-1 block">
              Preconditions:
            </span>
            <Textarea
              ref={(el) => {
                if (el) {
                  const lineHeight = 24;
                  const minHeight = lineHeight * 3;
                  el.style.height = "auto";
                  el.style.height = Math.max(el.scrollHeight, minHeight) + "px";
                }
              }}
              value={preconditions}
              onChange={(e) => {
                setPreconditions(e.target.value);
                const lineHeight = 24;
                const minHeight = lineHeight * 3;
                e.target.style.height = "auto";
                e.target.style.height =
                  Math.max(e.target.scrollHeight, minHeight) + "px";
              }}
              onBlur={handlePreconditionBlur}
              placeholder="Enter preconditions..."
              className={cn(
                "resize-none text-sm text-foreground min-h-[72px] overflow-hidden",
                editableInputClass,
              )}
              autoFocus={showPreconditionsInput && !preconditions}
            />
          </div>
        ) : (
          <button
            onClick={() => setShowPreconditionsInput(true)}
            className="text-sm text-primary hover:text-primary/80 transition-colors duration-fast mt-1 mb-3 self-start"
          >
            + Add Precondition
          </button>
        )}

        <div
          className="flex items-center gap-3 flex-shrink-0"
          data-tutorial="flow-config"
        >
          <Button
            variant="v2-outline"
            size="sm"
            className="flex-1 justify-center"
            onClick={() => setIsScenariosDialogOpen(true)}
            disabled={!hasParameters}
          >
            Manage Scenarios{scenariosCount > 0 && ` (${scenariosCount})`}
          </Button>
          <Button
            variant="v2-outline"
            className="flex-1 justify-center"
            onClick={() => setIsCredentialsDialogOpen(true)}
          >
            <span className="text-sm">
              Manage Credentials
              {credentialsCount > 0 && ` (${credentialsCount})`}
            </span>
          </Button>
        </div>
      </div>

      <div className="border-t border-border my-4 flex-shrink-0" />

      <div className="flex flex-col" data-tutorial="step-controls">
        <div className="flex items-center justify-center gap-4 mb-3">
          <button
            onClick={goToPrevStep}
            disabled={currentStepIndex === 0}
            className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors duration-fast"
          >
            &lt;&lt;
          </button>
          <span className="text-sm font-medium text-foreground">
            Step {currentStepIndex + 1} of {steps.length || 1}
          </span>
          <button
            onClick={goToNextStep}
            disabled={
              currentStepIndex === steps.length - 1 || steps.length === 0
            }
            className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors duration-fast"
          >
            &gt;&gt;
          </button>
        </div>

        {currentStep && currentStepFields ? (
          <div className="border-2 border-border rounded-lg p-4 flex flex-col gap-2 relative">
            <div className="flex flex-col gap-1.5 mb-4">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                On
              </span>
              <Input
                value={currentStepFields.screenName}
                onChange={(e) =>
                  updateStepField(currentStep.id, "screenName", e.target.value)
                }
                className={cn(
                  "flex-1 font-medium text-foreground h-10 !text-sm !px-0 pr-1",
                  editableInputClass,
                )}
                placeholder="Screen name"
              />
            </div>
            <textarea
              key={`action-${currentStep.id}`}
              ref={(el) => {
                if (el) {
                  const lineHeight = 24;
                  const minHeight = lineHeight * 3;
                  el.style.height = "auto";
                  el.style.height = Math.max(el.scrollHeight, minHeight) + "px";
                }
              }}
              value={currentStepFields.action}
              onChange={(e) => {
                updateStepField(currentStep.id, "action", e.target.value);
                const lineHeight = 24;
                const minHeight = lineHeight * 3;
                e.target.style.height = "auto";
                e.target.style.height =
                  Math.max(e.target.scrollHeight, minHeight) + "px";
              }}
              placeholder="Describe the action..."
              className={cn(
                "resize-none text-sm text-foreground min-h-[72px] overflow-hidden w-full rounded-md border-0 bg-transparent px-0 pr-1 py-1 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                editableInputClass,
              )}
              onFocus={() => setIsEdgeEditing(true)}
              onBlur={() => {
                handleActionBlur();
                // Delay hiding buttons to allow click events to register
                setTimeout(() => setIsEdgeEditing(false), 200);
              }}
            />
            {(isEdgeEditing ||
              (currentStep?.edge?.id &&
                formattingDescriptionEdgeMap[currentStep.edge.id])) && (
              <div className="flex justify-end mt-1 pr-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px]"
                  onMouseDown={() => {
                    descriptionFormatClickRef.current = true;
                  }}
                  onClick={handleFormatDescription}
                  disabled={
                    !currentStep?.edge ||
                    (currentStep.edge.id &&
                      formattingDescriptionEdgeMap[currentStep.edge.id]) ||
                    !currentStepFields.action.trim()
                  }
                >
                  {currentStep?.edge?.id &&
                  formattingDescriptionEdgeMap[currentStep.edge.id] ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Formatting...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-3 w-3 mr-1" />
                      Format
                    </>
                  )}
                </Button>
              </div>
            )}

            {currentStepFields.showBusinessLogic ||
            currentStepFields.businessLogic ? (
              <div className="mt-auto">
                <span className="text-xs font-medium text-muted-foreground">
                  Business Logic:
                </span>
                <textarea
                  key={`logic-${currentStep.id}`}
                  ref={(el) => {
                    if (el) {
                      const lineHeight = 24;
                      const minHeight = lineHeight * 3;
                      el.style.height = "auto";
                      el.style.height =
                        Math.max(el.scrollHeight, minHeight) + "px";
                    }
                  }}
                  value={currentStepFields.businessLogic}
                  onChange={(e) => {
                    updateStepField(
                      currentStep.id,
                      "businessLogic",
                      e.target.value,
                    );
                    const lineHeight = 24;
                    const minHeight = lineHeight * 3;
                    e.target.style.height = "auto";
                    e.target.style.height =
                      Math.max(e.target.scrollHeight, minHeight) + "px";
                  }}
                  placeholder="Enter business logic..."
                  className={cn(
                    "resize-none text-sm text-foreground mt-1 min-h-[72px] overflow-hidden w-full rounded-md border-0 bg-transparent px-0 pr-1 py-1 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                    editableInputClass,
                  )}
                  autoFocus={
                    currentStepFields.showBusinessLogic &&
                    !currentStepFields.businessLogic
                  }
                  onFocus={() => setIsBusinessLogicFocused(true)}
                  onBlur={() => {
                    handleBusinessLogicBlur();
                    // Delay hiding buttons to allow click events to register
                    setTimeout(() => setIsBusinessLogicFocused(false), 200);
                  }}
                />
                {(isBusinessLogicFocused ||
                  (currentStep?.edge?.id &&
                    formattingEdgeMap[currentStep.edge.id])) && (
                  <div className="flex justify-end mt-1 pr-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[11px]"
                      onMouseDown={() => {
                        formatClickRef.current = true;
                      }}
                      onClick={handleManualFormat}
                      disabled={
                        !currentStep?.edge ||
                        (currentStep.edge.id &&
                          formattingEdgeMap[currentStep.edge.id]) ||
                        !currentStepFields.businessLogic.trim()
                      }
                    >
                      {currentStep?.edge?.id &&
                      formattingEdgeMap[currentStep.edge.id] ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Formatting...
                        </>
                      ) : (
                        <>
                          <Wand2 className="h-3 w-3 mr-1" />
                          Format
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => toggleBusinessLogic(currentStep.id)}
                className="text-sm text-primary hover:text-primary/80 transition-colors duration-fast mt-auto self-start"
              >
                + Add Business Logic
              </button>
            )}
          </div>
        ) : (
          <div className="border-2 border-dashed border-border rounded-lg p-4 flex items-center justify-center text-muted-foreground text-sm min-h-[100px]">
            No steps defined
          </div>
        )}
      </div>

      <div
        className={cn(
          "border-t border-border my-4 flex-shrink-0",
          !flow.videoUrl && "invisible",
        )}
      />

      <div className={cn(!flow.videoUrl && "invisible pointer-events-none")}>
        <div className="mt-1 flex flex-col items-center">
          {renderVideoFrame()}
          <button
            onClick={handlePickScreen}
            disabled={!isVideoPlaying || !videoSrc}
            className="text-sm text-primary hover:text-primary/80 transition-colors duration-fast mt-2 self-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Pick Screen
          </button>
        </div>
      </div>

      {/* Scenarios Dialog */}
      <ScenariosDialog
        isOpen={isScenariosDialogOpen}
        onOpenChange={setIsScenariosDialogOpen}
        input={mockTestCase}
        setInput={handleScenariosUpdate}
        readOnly={false}
      />

      {/* Credentials Dialog */}
      <Dialog
        open={isCredentialsDialogOpen}
        onOpenChange={setIsCredentialsDialogOpen}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Credentials</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <TestCaseCredentials
              productId={productSwitcher.product_id}
              credentialIds={flow?.credentials || []}
              testCaseId={undefined}
              isEditing={true}
              isSaving={false}
              onCredentialChange={handleCredentialChange}
              onCredentialRemove={handleCredentialRemove}
              showAddCredentials={true}
              showDefaultCredentials={true}
            />
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export interface TestCasePlanningRequest {
  acceptance_criteria: string;
  completed_at: string | null;
  created_at: string;
  design_frame_urls: string[];
  executable_url: string | null;
  feature_id: string | null;
  flow_version: string;
  input_test_cases: any[];
  knowledge_graph_version: string;
  monkey_run_output: any | null;
  new_feature_name: string | null;
  product_id: string;
  product_name: string | null;
  request_id: string;
  request_type: string;
  requestor_user_id: string;
  status: string;
  test_run_id: string | null;
  updated_at: string;
  user_flow_video_urls: string[];
}

interface FlowManagerProps {
  flows: Flow[];
  features: Feature[];
  selectedFlowId: string | null;
  onFlowSelect: (flowId: string | null) => void;
  onFlowDelete: (flowId: string) => void;
  onFlowBulkDelete: (flowIds: string[]) => void;
  onFlowExport: () => void;
  onFlowPlan?: (flowIds: string[]) => void;
  onFlowImport: () => void;
  onFlowRename: (flowId: string, newName: string) => void;
  onFlowPreconditionRename: (flowId: string, newPrecondition: string) => void;
  onFlowDescriptionSave?: (flowId: string, description: string) => void;
  onFlowScenariosUpdate: (flowId: string, scenarios: Scenario[]) => void;
  onFlowCredentialsUpdate: (flowId: string, credentials: string[]) => void;
  onFlowUpdate?: (flow: Flow) => void;
  onFlowReorder: (flows: Flow[]) => void;
  onSelectedFlowChainChange?: (chain: Flow[]) => void;
  edges?: Edge[];
  nodes?: Node[];
  onFlowStepClick?: (sourceNodeId: string, targetNodeId: string) => void;
  addNewNodes?: (nodes: Node[]) => void;
  updateNodeDescription?: (nodeId: string, newDescription: string) => void;
  onEdgeDetailsChange?: (
    edgeId: string,
    details: {
      description: string;
      paramValues: string[];
      business_logic?: string | null;
    },
  ) => void;
  handleTestCasePlanning?: (
    isForcePlanning: boolean,
    specificFlowsToPlan: string[],
  ) => void;
  failedVideoToFlowRequests?: TestCasePlanningRequest[];
  onClearFailedVideoRequests?: () => void;
  onRetryFailedRequest?: (request: TestCasePlanningRequest) => void;
  selectedFeatureId?: string | null;
  isFlowsPanel?: boolean;
  videoQueueItems?: VideoFlowQueueItem[];
  autoFormatEnabled?: boolean;
  onFeatureSelectChange?: (featureId: string | null) => void;
  onAddFeatureClick?: () => void;
  onFeatureUpdate?: (
    featureId: string,
    updates: FeatureUpdates,
  ) => Promise<void>;
  onFeatureDelete?: (featureId: string) => Promise<void>;
}

interface FlowCardProps {
  flow: Flow;
  isSelected: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  onRename: (newName: string) => void;
  cardRef?: React.RefObject<HTMLDivElement>;
  isReachableFromEntryPoint?: boolean;
  isLoadingChains?: boolean;
  isMultiSelectMode?: boolean;
  isMultiSelected?: boolean;
  onMultiSelect?: (flowId: string, checked: boolean) => void;
  hasReachabilityComputed?: boolean;
  isFlowsPanel?: boolean;
  onCapture?: () => void;
  isDragging?: boolean;
}

const SortableFlowCard: React.FC<FlowCardProps> = (props) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.flow.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <FlowCard
        {...props}
        dragHandleProps={{ ...attributes, ...listeners }}
        isDragging={isDragging}
      />
    </div>
  );
};

const FlowCard: React.FC<FlowCardProps & { dragHandleProps?: any }> = ({
  flow,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onRename,
  cardRef,
  isReachableFromEntryPoint = false,
  isLoadingChains = false,
  isMultiSelectMode = false,
  isMultiSelected = false,
  onMultiSelect,
  hasReachabilityComputed = false,
  dragHandleProps,
  isFlowsPanel = false,
  onCapture,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(flow.name);

  useEffect(() => {
    setEditName(flow.name);
  }, [flow.name]);

  const handleSave = () => {
    if (editName.trim() && editName !== flow.name) {
      onRename(editName.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditName(flow.name);
  };

  const handleMouseEnter = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("graphFlowHover", {
          detail: { flowId: flow.id },
        }),
      );
    }
  };

  const handleMouseLeave = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("graphFlowHover", {
          detail: { flowId: null },
        }),
      );
    }
  };

  if (isFlowsPanel) {
    const screenCount = Array.isArray(flow.pathNodeIds)
      ? flow.pathNodeIds.length
      : 0;
    const isDraft = screenCount === 0;

    return (
      <motion.div
        {...dragHandleProps}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "bg-card border-2 rounded-lg p-4 transition-all duration-normal ease-default cursor-grab active:cursor-grabbing group",
          isSelected
            ? "border-primary shadow-lg shadow-primary/10"
            : "border-border hover:border-primary/30 hover:shadow-md",
        )}
        onClick={onSelect}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        ref={cardRef}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {isMultiSelectMode && onMultiSelect && (
              <div
                onClick={(e) => e.stopPropagation()}
                className={cn("pt-0.5", isDraft && "invisible")}
              >
                <Checkbox
                  checked={isMultiSelected}
                  onCheckedChange={(checked) =>
                    onMultiSelect(flow.id, !!checked)
                  }
                  disabled={isDraft}
                  className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3
                className={cn(
                  "font-medium truncate transition-colors duration-fast ease-default",
                  isSelected ? "text-primary" : "text-foreground",
                )}
              >
                {flow.name}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {isDraft ? "Draft" : `${screenCount} screens`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-3">
            {isDraft && onCapture && !isMultiSelectMode && (
              <Button
                variant="capture"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onCapture();
                }}
              >
                Capture
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Card
          {...dragHandleProps}
          ref={cardRef}
          className={`transition-all cursor-grab active:cursor-grabbing group relative ${
            isSelected
              ? "ring-2 ring-purple-500 shadow-md"
              : isMultiSelected
                ? "ring-2 ring-accent shadow-md"
                : "hover:shadow-sm"
          }`}
          onClick={
            !isEditing ? (isMultiSelectMode ? undefined : onSelect) : undefined
          }
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <CardContent className="p-4">
            <div>
              {isEditing ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-1">
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
                      {Array.isArray(flow.pathNodeIds)
                        ? flow.pathNodeIds.length
                        : 0}{" "}
                      screens
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      {flow.id}
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-start gap-2">
                    {isMultiSelectMode && onMultiSelect && (
                      <Checkbox
                        checked={isMultiSelected}
                        onCheckedChange={(checked) =>
                          onMultiSelect(flow.id, !!checked)
                        }
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <h3 className="font-medium text-sm mb-1 leading-tight min-h-[2.5rem] flex items-start flex-1">
                      <span className="break-words">{flow.name}</span>
                    </h3>
                    {onEdit && !isMultiSelectMode && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit();
                        }}
                        className="h-6 w-6 p-0 ml-2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {Array.isArray(flow.pathNodeIds)
                          ? flow.pathNodeIds.length
                          : 0}{" "}
                        screens
                      </Badge>
                      <div className="hidden">
                        {isLoadingChains ? (
                          <Badge variant="outline" className="text-xs">
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Loading...
                          </Badge>
                        ) : hasReachabilityComputed ? (
                          isReachableFromEntryPoint ? (
                            <Badge
                              variant="outline"
                              className="text-xs bg-green-50 text-green-700 border-green-200"
                            >
                              <Link className="h-3 w-3 mr-1" />
                              Reachable
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-xs bg-gray-50 text-gray-700 border-gray-200"
                            >
                              Unchecked
                            </Badge>
                          )
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-xs bg-orange-50 text-orange-700 border-orange-200"
                          >
                            Isolated
                          </Badge>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {flow.id}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onClick={(e) => {
            e.stopPropagation();
            if (!isSelected) onSelect();
            setIsEditing(true);
          }}
          disabled={isEditing}
        >
          <Edit2 className="h-4 w-4 mr-2" />
          Edit Name
        </ContextMenuItem>
        <ContextMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Flow
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export const FlowManager: React.FC<FlowManagerProps> = ({
  flows,
  features,
  selectedFlowId,
  onFlowSelect,
  onFlowDelete,
  onFlowBulkDelete,
  onFlowExport,
  onFlowImport,
  onFlowRename,
  onFlowPreconditionRename,
  onFlowDescriptionSave,
  onFlowScenariosUpdate,
  onFlowCredentialsUpdate,
  onFlowUpdate,
  onFlowReorder,
  onSelectedFlowChainChange,
  edges = [],
  nodes = [],
  onFlowStepClick,
  addNewNodes,
  updateNodeDescription,
  onEdgeDetailsChange,
  handleTestCasePlanning,
  failedVideoToFlowRequests,
  onClearFailedVideoRequests,
  onRetryFailedRequest,
  autoFormatEnabled = false,
  selectedFeatureId,
  isFlowsPanel = false,
  videoQueueItems = [],
  onFeatureSelectChange,
  onAddFeatureClick,
  onFeatureUpdate,
  onFeatureDelete,
}) => {
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [flowToDelete, setFlowToDelete] = useState<Flow | null>(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [featureDeleteDialogOpen, setFeatureDeleteDialogOpen] = useState(false);
  const [featureToDelete, setFeatureToDelete] = useState<Feature | null>(null);
  const [editingFeatureId, setEditingFeatureId] = useState<string | null>(null);
  const [editingFeatureName, setEditingFeatureName] = useState<string>("");
  const [isLoadingFeatureDelete, setIsLoadingFeatureDelete] = useState(false);
  const [isLoadingFeatureUpdate, setIsLoadingFeatureUpdate] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);
  const preventSelectionRef = useRef(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeChainTabs, setActiveChainTabs] = useState<
    Record<string, number>
  >({});
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedFlowIds, setSelectedFlowIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Use TestRunSelectionContext when in flows panel
  let testRunSelection: ReturnType<typeof useTestRunSelection> | null = null;
  try {
    if (isFlowsPanel) {
      testRunSelection = useTestRunSelection();
    }
  } catch {
    // Context not available, use local state
  }

  // Use context selection state if available, otherwise use local state
  const isSelectionMode =
    testRunSelection?.isSelectionMode ?? isMultiSelectMode;
  const contextSelectedFlowIds = testRunSelection?.selectedFlowIds
    ? Array.from(testRunSelection.selectedFlowIds)
    : [];
  const effectiveSelectedFlowIds = testRunSelection
    ? contextSelectedFlowIds
    : selectedFlowIds;
  const [reachabilityResults, setReachabilityResults] = useState<
    Record<string, { isReachable: boolean; flowChains: Flow[][] }>
  >({});
  const [loadingReachability, setLoadingReachability] = useState<
    Record<string, boolean>
  >({});
  const [collapsedFeatures, setCollapsedFeatures] = useState<
    Record<string, boolean>
  >({});
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const suppressAutoStartRef = useRef(false);
  const { user } = useUser();

  // Get user organization ID
  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;
  // Check if user belongs to QAI organization
  const isQaiOrgUserValue = isQaiOrgUser(userOrgId);

  // Ensure all features are collapsed by default when features change
  useEffect(() => {
    if (features && features.length > 0) {
      const initialCollapsed: Record<string, boolean> = {};
      features.forEach((feature) => {
        initialCollapsed[feature.id] = true;
      });
      setCollapsedFeatures(initialCollapsed);
    }
  }, [features]);

  // Don't auto-select first feature anymore - as we're allowing "All Features" to be the default
  // useEffect(() => {
  //   if (!isFlowsPanel) return;
  //   if (!onFeatureSelectChange) return;
  //   if (isSelectionMode) return;
  //   if (isPanelOpen) return;
  //   if (!features || features.length === 0) return;

  //   const firstFeatureId = features[0]?.id;
  //   if (!firstFeatureId) return;

  //   if (selectedFeatureId === null || selectedFeatureId === undefined) {
  //     onFeatureSelectChange(firstFeatureId);
  //   }
  // }, [
  //   features,
  //   isFlowsPanel,
  //   isPanelOpen,
  //   isSelectionMode,
  //   onFeatureSelectChange,
  //   selectedFeatureId,
  // ]);

  // ----- Test run selection (flows-first) integration for flows panel -----
  // When the header triggers a test run selection start, use context to start selection
  useEffect(() => {
    if (!isFlowsPanel || !testRunSelection) return;

    const handleStartTestRunSelection = () => {
      testRunSelection.startSelection();
    };

    const handleCancelTestRunSelection = () => {
      suppressAutoStartRef.current = true;
      testRunSelection.cancelSelection();
    };

    window.addEventListener(
      "graphStartTestRunSelection",
      handleStartTestRunSelection,
    );
    window.addEventListener(
      "graphCancelTestRunSelection",
      handleCancelTestRunSelection,
    );
    return () => {
      window.removeEventListener(
        "graphStartTestRunSelection",
        handleStartTestRunSelection,
      );
      window.removeEventListener(
        "graphCancelTestRunSelection",
        handleCancelTestRunSelection,
      );
    };
  }, [isFlowsPanel, testRunSelection]);

  // Notify header about current selection state so it can update the
  // "New Test Run" / "Test N flows" button and gating.
  useEffect(() => {
    if (!isFlowsPanel || !testRunSelection) return;

    window.dispatchEvent(
      new CustomEvent("graphFlowSelectionUpdate", {
        detail: {
          isSelectionMode: testRunSelection.isSelectionMode,
          selectedFlowIds: Array.from(testRunSelection.selectedFlowIds),
        },
      }),
    );
  }, [
    isFlowsPanel,
    testRunSelection?.isSelectionMode,
    testRunSelection?.selectedFlowIds,
  ]);

  const searchParams = useSearchParams();
  useEffect(() => {
    if (!isFlowsPanel || !testRunSelection) return;

    if (suppressAutoStartRef.current) {
      suppressAutoStartRef.current = false;
      return;
    }

    const addFlowsMode = searchParams.get("addFlowsMode");
    if (addFlowsMode === "true" && !testRunSelection.isSelectionMode) {
      testRunSelection.startSelection();
    }
  }, [isFlowsPanel, testRunSelection, searchParams]);

  const toggleFeatureCollapse = (featureId: string) => {
    setCollapsedFeatures((prev) => ({
      ...prev,
      [featureId]: !prev[featureId],
    }));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const entryPointIds = useMemo(() => {
    if (!nodes.length || !edges.length) return [];

    return nodes
      .filter((node) => {
        const hasIncomingEdges = edges.some((edge) => edge.target === node.id);
        const hasOutgoingEdges = edges.some((edge) => edge.source === node.id);
        return !hasIncomingEdges && hasOutgoingEdges;
      })
      .map((node) => node.id);
  }, [nodes, edges]);

  const handleCheckReachability = async (flowId: string) => {
    const flow = flows.find((f) => f.id === flowId);
    if (!flow) return;

    setLoadingReachability((prev) => ({ ...prev, [flowId]: true }));

    try {
      const result = await computeFlowChainsAsync(flows, entryPointIds);
      const flowResult = result.results.get(flowId);

      if (flowResult) {
        setReachabilityResults((prev) => ({
          ...prev,
          [flowId]: {
            isReachable: flowResult.isReachable,
            flowChains: flowResult.flowChains,
          },
        }));
      }
    } catch (error) {
      console.error("Error computing reachability:", error);
      toast({
        title: "Error",
        description: "Failed to compute reachability for this flow.",
        variant: "destructive",
      });
    } finally {
      setLoadingReachability((prev) => ({ ...prev, [flowId]: false }));
    }
  };

  const handleFlowSelect = (flowId: string | null) => {
    onFlowSelect(flowId);
  };

  const handleFlowEdit = (flowId: string) => {
    onFlowSelect(flowId);
    setIsPanelOpen(true);
  };

  const handlePanelClose = () => {
    setIsPanelOpen(false);
    // Keep the flow selected but just close the panel
  };

  const handleChainTabChange = (flowId: string, tabIndex: number) => {
    setActiveChainTabs((prev) => ({
      ...prev,
      [flowId]: tabIndex,
    }));
  };

  const selectedFlow = selectedFlowId
    ? flows.find((f) => f.id === selectedFlowId)
    : null;
  const showVerticalDetails = isFlowsPanel && isPanelOpen && selectedFlow;
  const flowRefs = useRef<Record<string, React.RefObject<HTMLDivElement>>>({});

  useEffect(() => {
    const newRefs: Record<string, React.RefObject<HTMLDivElement>> = {};
    flows.forEach((flow) => {
      newRefs[flow.id] = flowRefs.current[flow.id] || React.createRef();
    });
    flowRefs.current = newRefs;
  }, [flows]);

  useEffect(() => {
    if (isFlowsPanel && selectedFlowId && !isPanelOpen) {
      setIsPanelOpen(true);
    }
  }, [isFlowsPanel, selectedFlowId, isPanelOpen]);

  useEffect(() => {
    if (selectedFlowId && flowRefs.current[selectedFlowId]?.current) {
      const element = flowRefs.current[selectedFlowId].current;
      element?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    }
  }, [selectedFlowId]);

  useEffect(() => {
    if (!onSelectedFlowChainChange) return;

    if (!selectedFlowId) {
      onSelectedFlowChainChange([]);
      return;
    }

    const reachabilityResult = reachabilityResults[selectedFlowId];
    if (reachabilityResult && reachabilityResult.flowChains.length > 0) {
      // Use the active chain tab for this flow, or default to 0
      const activeTab = activeChainTabs[selectedFlowId] || 0;
      const chainToShow =
        reachabilityResult.flowChains[activeTab] ||
        reachabilityResult.flowChains[0];

      onSelectedFlowChainChange(chainToShow);
    } else {
      onSelectedFlowChainChange([]);
    }
  }, [
    selectedFlowId,
    reachabilityResults,
    onSelectedFlowChainChange,
    activeChainTabs,
  ]);

  // Listen for flow chain changes from the dropdown
  useEffect(() => {
    const handleFlowChainChanged = (event: CustomEvent) => {
      const { flowId, chainIndex, chain } = event.detail;

      // Update the active chain tab for this flow
      setActiveChainTabs((prev) => ({
        ...prev,
        [flowId]: chainIndex,
      }));

      // Only respond if this is for the currently selected flow
      if (flowId === selectedFlowId && onSelectedFlowChainChange) {
        onSelectedFlowChainChange(chain);
      }
    };

    window.addEventListener(
      "flowChainChanged",
      handleFlowChainChanged as EventListener,
    );
    return () => {
      window.removeEventListener(
        "flowChainChanged",
        handleFlowChainChanged as EventListener,
      );
    };
  }, [selectedFlowId, onSelectedFlowChainChange]);

  const filteredFlows = useMemo(() => {
    if (!searchTerm.trim()) return flows;

    const term = searchTerm.toLowerCase();
    return flows.filter((flow) => {
      // Search in flow ID
      if (flow.id.toLowerCase().includes(term)) return true;
      if (flow.name.toLowerCase().includes(term)) return true;
      // Search in start node label/description
      const startNode = nodes.find((n) => n.id === flow.startNodeId);
      const startNodeText = String(
        startNode?.data?.label || startNode?.data?.description || "",
      ).toLowerCase();
      if (startNodeText.includes(term)) return true;

      // Search in end node label/description
      const endNode = nodes.find((n) => n.id === flow.endNodeId);
      const endNodeText = String(
        endNode?.data?.label || endNode?.data?.description || "",
      ).toLowerCase();
      if (endNodeText.includes(term)) return true;

      // Search in via nodes
      const viaNodeMatch = flow.viaNodeIds.some((nodeId) => {
        const node = nodes.find((n) => n.id === nodeId);
        const nodeText = String(
          node?.data?.label || node?.data?.description || "",
        ).toLowerCase();
        return nodeText.includes(term);
      });

      return viaNodeMatch;
    });
  }, [flows, searchTerm]);

  const handleDeleteClick = (flow: Flow) => {
    setFlowToDelete(flow);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (flowToDelete) {
      onFlowDelete(flowToDelete.id);
      // Clear all reachability cache since flow dependencies might have changed
      setReachabilityResults({});
      toast({
        title: "Flow deleted",
        description: `Flow "${flowToDelete.name}" has been deleted.`,
      });
      setDeleteDialogOpen(false);
      setFlowToDelete(null);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = flows.findIndex((flow) => flow.id === active.id);
      const newIndex = flows.findIndex((flow) => flow.id === over.id);

      const reorderedFlows = arrayMove(flows, oldIndex, newIndex);
      onFlowReorder(reorderedFlows);
    }
  };

  const handleMultiSelect = (flowId: string, checked: boolean) => {
    setSelectedFlowIds((prev) =>
      checked ? [...prev, flowId] : prev.filter((id) => id !== flowId),
    );
  };

  const handleSelectAll = () => {
    const allFlowIds = filteredFlows.map((flow) => flow.id);
    setSelectedFlowIds(allFlowIds);
  };

  const handleSelectNone = () => {
    setSelectedFlowIds([]);
  };

  const handleBulkDeleteClick = () => {
    setBulkDeleteDialogOpen(true);
  };

  const confirmBulkDelete = () => {
    if (selectedFlowIds.length > 0 && onFlowBulkDelete) {
      onFlowBulkDelete(selectedFlowIds);
      toast({
        title: "Flows deleted",
        description: `${selectedFlowIds.length} flow${selectedFlowIds.length > 1 ? "s" : ""} deleted successfully.`,
      });
      setSelectedFlowIds([]);
      setIsMultiSelectMode(false);
      setBulkDeleteDialogOpen(false);
    }
  };

  const toggleMultiSelectMode = () => {
    setIsMultiSelectMode(!isMultiSelectMode);
    setSelectedFlowIds([]);
  };

  const featureMaps = useMemo(() => {
    const featureMapById = new Map<string, Feature>(
      features.map((feature) => [feature.id, feature]),
    );

    return { featureMapById };
  }, [features]);

  const orphanedFlowsMeta = useMemo(() => {
    const orphanedFlows = flows.filter((flow) => {
      if (flow.feature_id && featureMaps.featureMapById.has(flow.feature_id)) {
        return false;
      }

      return true;
    });

    return {
      orphanedFlows,
      hasOrphanedFlows: orphanedFlows.length > 0,
    };
  }, [flows, featureMaps]);

  // Group flows by feature based on feature_id
  const flowsByFeature = useMemo(() => {
    const grouped: Record<string, Feature & { flows: Flow[] }> = {};
    const flowsWithoutFeature: Flow[] = [];

    filteredFlows.forEach((flow) => {
      let feature: Feature | undefined;

      if (flow.feature_id) {
        feature = featureMaps.featureMapById.get(flow.feature_id);
      }

      if (feature) {
        if (!grouped[feature.id]) {
          grouped[feature.id] = { ...feature, flows: [] };
        }
        grouped[feature.id].flows.push(flow);
      } else {
        flowsWithoutFeature.push(flow);
      }
    });

    const result = Object.values(grouped);
    if (flowsWithoutFeature.length > 0) {
      result.push({
        id: UNASSIGNED_FLOWS_FEATURE_ID,
        name: UNASSIGNED_FLOWS_FEATURE_NAME,
        nodeIds: [],
        flows: flowsWithoutFeature,
      });
    }

    if (selectedFeatureId) {
      return result.filter((feature) => feature.id === selectedFeatureId);
    }

    return result;
  }, [featureMaps, filteredFlows, selectedFeatureId]);

  const flowsList = useMemo(() => {
    if (!isFlowsPanel || !showVerticalDetails || !selectedFlowId) return [];
    return flowsByFeature.flatMap((feature) => feature.flows);
  }, [isFlowsPanel, showVerticalDetails, selectedFlowId, flowsByFeature]);

  const currentFlowIndex = useMemo(() => {
    if (flowsList.length === 0) return -1;
    return flowsList.findIndex((f) => f.id === selectedFlowId);
  }, [flowsList, selectedFlowId]);

  useFlowDetailsKeyboardNavigation({
    enabled: isFlowsPanel && showVerticalDetails && selectedFlowId !== null,
    onFlowPrevious: () => {
      if (currentFlowIndex > 0) {
        const prevFlow = flowsList[currentFlowIndex - 1];
        onFlowSelect(prevFlow.id);
        setIsPanelOpen(true);
      }
    },
    onFlowNext: () => {
      if (currentFlowIndex < flowsList.length - 1) {
        const nextFlow = flowsList[currentFlowIndex + 1];
        onFlowSelect(nextFlow.id);
        setIsPanelOpen(true);
      }
    },
    canGoToPreviousFlow: currentFlowIndex > 0,
    canGoToNextFlow:
      currentFlowIndex < flowsList.length - 1 && currentFlowIndex >= 0,
    isDialogOpen: false,
  });

  // When in flows panel with selection mode, show two-column layout (features + flows)
  if (isFlowsPanel && isSelectionMode && testRunSelection) {
    const flowsForSelectedFeature = testRunSelection.getFlowsForFeature(
      testRunSelection.selectedFeature || features[0]?.id || "",
    );

    return (
      <div className="flex flex-1 overflow-hidden h-full">
        {/* Feature Selection List - 40% width for wider cards */}
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: "40%", opacity: 1 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="border-r border-border overflow-hidden flex-shrink-0"
        >
          <div className="w-full h-full overflow-y-auto">
            <FeatureSelectionList features={testRunSelection.features} />
          </div>
        </motion.div>

        {/* Flow List - takes remaining 60% for wide rectangular cards */}
        <motion.div
          layout
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="flex-1 overflow-y-auto min-w-0"
        >
          <div className="p-4">
            {/* Deselect All Flows checkbox */}
            <div
              className="flex items-center gap-2 px-1 py-1.5 mb-3 cursor-pointer hover:bg-accent/20 rounded transition-colors"
              onClick={
                flowsForSelectedFeature.every((f) =>
                  testRunSelection.selectedFlowIds.has(f.id),
                )
                  ? () => {
                      flowsForSelectedFeature.forEach((f) =>
                        testRunSelection.toggleFlowSelection(f.id),
                      );
                    }
                  : () => {
                      flowsForSelectedFeature.forEach((f) => {
                        if (!testRunSelection.selectedFlowIds.has(f.id)) {
                          testRunSelection.toggleFlowSelection(f.id);
                        }
                      });
                    }
              }
            >
              <Checkbox
                checked={
                  flowsForSelectedFeature.length > 0 &&
                  flowsForSelectedFeature.every((f) =>
                    testRunSelection.selectedFlowIds.has(f.id),
                  )
                    ? true
                    : flowsForSelectedFeature.some((f) =>
                          testRunSelection.selectedFlowIds.has(f.id),
                        )
                      ? "indeterminate"
                      : false
                }
                onCheckedChange={(checked) => {
                  flowsForSelectedFeature.forEach((f) => {
                    const isSelected = testRunSelection.selectedFlowIds.has(
                      f.id,
                    );
                    if (checked && !isSelected) {
                      testRunSelection.toggleFlowSelection(f.id);
                    } else if (!checked && isSelected) {
                      testRunSelection.toggleFlowSelection(f.id);
                    }
                  });
                }}
                onClick={(e) => e.stopPropagation()}
                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <span className="text-xs font-medium">
                {flowsForSelectedFeature.every((f) =>
                  testRunSelection.selectedFlowIds.has(f.id),
                )
                  ? "Deselect All Flows"
                  : "Select All Flows"}
              </span>
            </div>

            {/* Flow Cards */}
            <div>
              {flowsForSelectedFeature.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  No flows in this feature
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {flowsForSelectedFeature.map((flow, index) => {
                    const screenCount = Array.isArray(flow.pathNodeIds)
                      ? flow.pathNodeIds.length
                      : 0;
                    const isDraft = screenCount === 0;
                    return (
                      <motion.div
                        key={flow.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="mb-3"
                      >
                        <SortableFlowCard
                          flow={flow}
                          isSelected={false}
                          onSelect={() => {
                            testRunSelection.toggleFlowSelection(flow.id);
                          }}
                          onEdit={() => handleFlowEdit(flow.id)}
                          onDelete={() => handleDeleteClick(flow)}
                          onRename={(newName) => onFlowRename(flow.id, newName)}
                          cardRef={flowRefs.current[flow.id]}
                          isReachableFromEntryPoint={false}
                          isLoadingChains={false}
                          isMultiSelectMode={true}
                          isMultiSelected={testRunSelection.selectedFlowIds.has(
                            flow.id,
                          )}
                          onMultiSelect={(flowId, checked) => {
                            testRunSelection.toggleFlowSelection(flowId);
                          }}
                          hasReachabilityComputed={false}
                          isFlowsPanel={isFlowsPanel}
                          onCapture={
                            isDraft && isFlowsPanel
                              ? () => {
                                  console.log("Capture flow:", flow.id);
                                }
                              : undefined
                          }
                        />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          !isFlowsPanel || !showVerticalDetails
            ? "space-y-4"
            : "h-full flex flex-col",
          isFlowsPanel && !showVerticalDetails && "p-4",
        )}
      >
        {!isFlowsPanel && isQaiOrgUserValue && (
          <div className="flex gap-2">
            <Button
              onClick={onFlowImport}
              variant="outline"
              size="sm"
              className="flex-1"
            >
              <Upload className="h-4 w-4 mr-2" />
              Import Flows
            </Button>
            <Button
              onClick={onFlowExport}
              variant="outline"
              disabled={flows.length === 0}
              size="sm"
              className="flex-1"
            >
              <Download className="h-4 w-4 mr-2" />
              Export Flows
            </Button>
          </div>
        )}

        {isFlowsPanel &&
          !showVerticalDetails &&
          !isSelectionMode &&
          onFeatureSelectChange && (
            <div>
              <Select
                value={selectedFeatureId || "all"}
                open={selectOpen}
                onOpenChange={(open) => {
                  // will not close if editing
                  if (editingFeatureId) {
                    setSelectOpen(true);
                    return;
                  }
                  setSelectOpen(open);
                }}
                onValueChange={(value) => {
                  // Don't change value if editing or if selection was prevented
                  if (editingFeatureId || preventSelectionRef.current) {
                    preventSelectionRef.current = false;
                    return;
                  }
                  if (value === "__add_new__") {
                    onAddFeatureClick?.();
                    setSelectOpen(false);
                  } else if (value === "all") {
                    onFeatureSelectChange(null);
                    setSelectOpen(false);
                  } else {
                    onFeatureSelectChange(value || null);
                    setSelectOpen(false);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left">
                    {!selectedFeatureId
                      ? "All Features"
                      : selectedFeatureId === UNASSIGNED_FLOWS_FEATURE_ID
                        ? UNASSIGNED_FLOWS_FEATURE_NAME
                        : features.find((f) => f.id === selectedFeatureId)
                            ?.name || "All Features"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value="__add_new__"
                    className="text-primary font-medium"
                  >
                    <span className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Add New Feature
                    </span>
                  </SelectItem>
                  <Separator className="my-1" />
                  <SelectItem value="all">All Features</SelectItem>
                  {orphanedFlowsMeta.hasOrphanedFlows && (
                    <div
                      className={cn(
                        "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                        selectedFeatureId === UNASSIGNED_FLOWS_FEATURE_ID &&
                          "bg-accent text-accent-foreground",
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onFeatureSelectChange?.(UNASSIGNED_FLOWS_FEATURE_ID);
                        setSelectOpen(false);
                      }}
                    >
                      {selectedFeatureId === UNASSIGNED_FLOWS_FEATURE_ID && (
                        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center text-primary">
                          <Check className="h-4 w-4" />
                        </span>
                      )}
                      <div className="flex justify-between items-center w-full group">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="truncate">
                            {UNASSIGNED_FLOWS_FEATURE_NAME}
                          </span>
                          <span className="text-xs opacity-60 flex-shrink-0">
                            ({orphanedFlowsMeta.orphanedFlows.length})
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  {features.map((feature) => {
                    const hasAnyFlowsWithFeatureId = flows.some(
                      (flow) => flow.feature_id,
                    );
                    let flowCount = flows.filter(
                      (flow) => flow.feature_id === feature.id,
                    ).length;

                    if (
                      !hasAnyFlowsWithFeatureId &&
                      flowCount === 0 &&
                      feature.nodeIds &&
                      feature.nodeIds.length > 0
                    ) {
                      const featureNodeIdsSet = new Set(feature.nodeIds);
                      flowCount = flows.filter((flow) =>
                        featureNodeIdsSet.has(flow.startNodeId),
                      ).length;
                    }

                    const isEditing = editingFeatureId === feature.id;
                    const isSelected = selectedFeatureId === feature.id;
                    return (
                      <div
                        key={feature.id}
                        className={cn(
                          "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                          isSelected && "bg-accent text-accent-foreground",
                        )}
                        onPointerDown={(e) => {
                          // Prevent selection when clicking buttons or when editing
                          const target = e.target as HTMLElement;
                          if (target.closest("button") || isEditing) {
                            e.preventDefault();
                            e.stopPropagation();
                            return;
                          }
                        }}
                        onClick={(e) => {
                          // Only select if clicking on the text area, not buttons
                          const target = e.target as HTMLElement;
                          if (target.closest("button") || isEditing) {
                            e.preventDefault();
                            e.stopPropagation();
                            return;
                          }
                          onFeatureSelectChange?.(feature.id);
                          setSelectOpen(false);
                        }}
                      >
                        {isSelected && (
                          <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center text-primary">
                            <Check className="h-4 w-4" />
                          </span>
                        )}
                        <div className="flex justify-between items-center w-full group">
                          {isEditing ? (
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Input
                                value={editingFeatureName}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  setEditingFeatureName(e.target.value);
                                }}
                                onKeyDown={(e) => {
                                  e.stopPropagation();
                                  if (
                                    e.key === "Enter" &&
                                    !isLoadingFeatureUpdate
                                  ) {
                                    e.preventDefault();
                                    if (
                                      editingFeatureName.trim() &&
                                      editingFeatureName.trim() !== feature.name
                                    ) {
                                      (async () => {
                                        if (!onFeatureUpdate) return;
                                        setIsLoadingFeatureUpdate(true);
                                        try {
                                          await onFeatureUpdate(feature.id, {
                                            name: editingFeatureName.trim(),
                                          });
                                          setEditingFeatureId(null);
                                          setEditingFeatureName("");
                                          // Close select after saving
                                          setTimeout(() => {
                                            setSelectOpen(false);
                                          }, 100);
                                        } catch (error) {
                                          console.error(
                                            "Failed to update feature:",
                                            error,
                                          );
                                        } finally {
                                          setIsLoadingFeatureUpdate(false);
                                        }
                                      })();
                                    } else {
                                      setEditingFeatureId(null);
                                      setEditingFeatureName("");
                                      setSelectOpen(false);
                                    }
                                  } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    setEditingFeatureId(null);
                                    setEditingFeatureName("");
                                  }
                                }}
                                onBlur={async () => {
                                  if (
                                    editingFeatureName.trim() &&
                                    editingFeatureName.trim() !==
                                      feature.name &&
                                    onFeatureUpdate
                                  ) {
                                    setIsLoadingFeatureUpdate(true);
                                    try {
                                      await onFeatureUpdate(feature.id, {
                                        name: editingFeatureName.trim(),
                                      });
                                    } catch (error) {
                                      console.error(
                                        "Failed to update feature:",
                                        error,
                                      );
                                    } finally {
                                      setIsLoadingFeatureUpdate(false);
                                    }
                                  }
                                  setEditingFeatureId(null);
                                  setEditingFeatureName("");
                                  setTimeout(() => {
                                    setSelectOpen(false);
                                  }, 100);
                                }}
                                disabled={isLoadingFeatureUpdate}
                                onClick={(e) => e.stopPropagation()}
                                className="h-6 px-2 text-sm flex-1 text-foreground bg-background border border-input"
                                style={{ color: "hsl(var(--foreground))" }}
                                autoFocus
                              />
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="truncate">{feature.name}</span>
                                <span className="text-xs opacity-60 flex-shrink-0">
                                  ({flowCount})
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    preventSelectionRef.current = true;
                                    setEditingFeatureId(feature.id);
                                    setEditingFeatureName(feature.name);
                                    // Keep select open for editing
                                    setSelectOpen(true);
                                  }}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    preventSelectionRef.current = true;
                                  }}
                                  onPointerDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    preventSelectionRef.current = true;
                                  }}
                                  title="Edit feature name"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  preventSelectionRef.current = true;
                                  setFeatureToDelete(feature);
                                  setFeatureDeleteDialogOpen(true);
                                  // Close select before showing dialog
                                  setSelectOpen(false);
                                }}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  preventSelectionRef.current = true;
                                }}
                                onPointerDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  preventSelectionRef.current = true;
                                }}
                                title="Delete feature"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

        {!isFlowsPanel &&
          failedVideoToFlowRequests &&
          failedVideoToFlowRequests.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 ">
                <span className="text-sm font-medium">
                  Failed Video Requests: {failedVideoToFlowRequests.length}
                </span>
              </div>
              <div className="space-y-1">
                {failedVideoToFlowRequests.map((request) => (
                  <div
                    key={request.request_id}
                    className="flex items-center justify-between p-2 text-xs bg-destructive/5 border border-destructive/10 rounded-md"
                  >
                    <span
                      className="truncate max-w-[180px]"
                      title={`Request ID: ${request.request_id}`}
                    >
                      Request @{" "}
                      {new Date(request.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    {onRetryFailedRequest && (
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6 ml-2"
                        onClick={() => onRetryFailedRequest(request)}
                        title="Retry"
                      >
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        {/* Selection bar - show in flows panel when in test run selection mode */}
        {isFlowsPanel && isMultiSelectMode && flows.length > 0 && (
          <div className="flex items-center gap-2 px-1 py-1.5 mb-3">
            <Button
              onClick={() => {
                setIsMultiSelectMode(false);
                setSelectedFlowIds([]);
                if (typeof window !== "undefined") {
                  window.dispatchEvent(
                    new CustomEvent("graphCancelTestRunSelection"),
                  );
                }
              }}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              Cancel
            </Button>
            <div className="flex items-center gap-2 flex-1">
              <Button
                onClick={
                  selectedFlowIds.length === filteredFlows.length
                    ? handleSelectNone
                    : handleSelectAll
                }
                variant="outline"
                size="sm"
                className="px-2 text-xs"
              >
                {selectedFlowIds.length === filteredFlows.length ? (
                  <Square className="h-3 w-3" />
                ) : (
                  <CheckSquare className="h-3 w-3" />
                )}
                <span className="ml-1">
                  {selectedFlowIds.length === filteredFlows.length
                    ? "Deselect All Flows"
                    : "Select All Flows"}
                </span>
              </Button>
            </div>
          </div>
        )}

        {!isFlowsPanel && flows.length > 0 && (
          <div className="flex gap-1">
            <Button
              onClick={toggleMultiSelectMode}
              variant={isMultiSelectMode ? "default" : "outline"}
              size="sm"
              className={isMultiSelectMode ? "flex-1" : "flex-auto"}
            >
              {isMultiSelectMode ? (
                <CheckSquare className="h-3 w-3 mr-1" />
              ) : (
                <Square className="h-3 w-3 mr-1" />
              )}
              {isMultiSelectMode ? "Exit" : "Select"}
            </Button>
            {isMultiSelectMode && (
              <>
                <Button
                  onClick={
                    selectedFlowIds.length === filteredFlows.length
                      ? handleSelectNone
                      : handleSelectAll
                  }
                  variant="outline"
                  size="sm"
                  className="px-2"
                >
                  {selectedFlowIds.length === filteredFlows.length ? (
                    <Square className="h-3 w-3" />
                  ) : (
                    <CheckSquare className="h-3 w-3" />
                  )}
                </Button>
                <Button
                  onClick={handleBulkDeleteClick}
                  variant="destructive"
                  size="sm"
                  disabled={selectedFlowIds.length === 0}
                  className="px-2"
                >
                  <Trash2 className="h-3 w-3" />
                  {selectedFlowIds.length > 0 && (
                    <span className="ml-1">{selectedFlowIds.length}</span>
                  )}
                </Button>
                <Button
                  onClick={() => handleTestCasePlanning(false, selectedFlowIds)}
                  variant="default"
                  size="sm"
                  disabled={selectedFlowIds.length === 0}
                  className="px-2"
                >
                  Plan
                  {selectedFlowIds.length > 0 && (
                    <span className="ml-1">{selectedFlowIds.length}</span>
                  )}
                </Button>
              </>
            )}
          </div>
        )}

        {!isFlowsPanel && flows.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search flows by ID, name, or screens..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        )}

        {flows.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">
            No flows created yet
          </div>
        ) : filteredFlows.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">
            No flows match your search
          </div>
        ) : isFlowsPanel ? (
          flowsByFeature.flatMap((feature) => feature.flows).length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No flows in this feature
            </div>
          ) : showVerticalDetails && selectedFlow ? (
            <FlowDetailsVerticalPanel
              flow={selectedFlow}
              nodes={nodes}
              edges={edges}
              onClose={() => {
                setIsPanelOpen(false);
                handleFlowSelect(null);
              }}
              onRecapture={() => handleFlowEdit(selectedFlow.id)}
              onDelete={() => handleDeleteClick(selectedFlow)}
              onPreconditionSave={(value) =>
                onFlowPreconditionRename(selectedFlow.id, value)
              }
              onFlowDescriptionSave={(value) =>
                onFlowDescriptionSave?.(selectedFlow.id, value)
              }
              onFlowRename={onFlowRename}
              onEdgeDetailsChange={onEdgeDetailsChange}
              onFlowStepClick={onFlowStepClick}
              onFlowScenariosUpdate={onFlowScenariosUpdate}
              onFlowCredentialsUpdate={onFlowCredentialsUpdate}
              addNewNodes={addNewNodes}
              updateNodeDescription={updateNodeDescription}
              isFlowsPanel={isFlowsPanel}
              features={features}
              flowFeature={
                selectedFlow.feature_id
                  ? featureMaps.featureMapById.get(selectedFlow.feature_id)
                  : null
              }
              onFlowFeatureUpdate={(flowId, featureId) => {
                const flowToUpdate = flows.find((f) => f.id === flowId);
                if (flowToUpdate) {
                  const updatedFlow = {
                    ...flowToUpdate,
                    feature_id: featureId === "" ? undefined : featureId,
                  };
                  onFlowUpdate?.(updatedFlow);

                  if (onFeatureSelectChange) {
                    if (featureId) {
                      onFeatureSelectChange(featureId);
                    } else {
                      onFeatureSelectChange(UNASSIGNED_FLOWS_FEATURE_ID);
                    }
                  }
                }
              }}
            />
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={flowsByFeature
                  .flatMap((f) => f.flows)
                  .map((flow) => flow.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {flowsByFeature
                    .flatMap((feature) => feature.flows)
                    .map((flow, index) => {
                      const screenCount = Array.isArray(flow.pathNodeIds)
                        ? flow.pathNodeIds.length
                        : 0;
                      const isDraft = screenCount === 0;
                      return (
                        <SortableFlowCard
                          key={flow.id}
                          flow={flow}
                          isSelected={selectedFlowId === flow.id}
                          onSelect={() => {
                            if (isMultiSelectMode && isFlowsPanel) {
                              handleMultiSelect(
                                flow.id,
                                !selectedFlowIds.includes(flow.id),
                              );
                              return;
                            }
                            const nextSelected =
                              selectedFlowId === flow.id ? null : flow.id;
                            handleFlowSelect(nextSelected);
                            if (isFlowsPanel) {
                              setIsPanelOpen(nextSelected !== null);
                            }
                          }}
                          onEdit={() => handleFlowEdit(flow.id)}
                          onDelete={() => handleDeleteClick(flow)}
                          onRename={(newName) => onFlowRename(flow.id, newName)}
                          cardRef={flowRefs.current[flow.id]}
                          isReachableFromEntryPoint={false}
                          isLoadingChains={false}
                          isMultiSelectMode={isMultiSelectMode && isFlowsPanel}
                          isMultiSelected={selectedFlowIds.includes(flow.id)}
                          onMultiSelect={handleMultiSelect}
                          hasReachabilityComputed={false}
                          isFlowsPanel={isFlowsPanel}
                          onCapture={
                            isDraft && isFlowsPanel
                              ? () => {
                                  console.log("Capture flow:", flow.id);
                                }
                              : undefined
                          }
                        />
                      );
                    })}
                </div>
              </SortableContext>
            </DndContext>
          )
        ) : (
          flowsByFeature.map((feature) => (
            <div key={feature.id}>
              {!selectedFeatureId && (
                <div className="mb-4">
                  <button
                    className="w-full flex items-center justify-between px-2 py-2 bg-muted/40 rounded hover:bg-muted/60 transition-colors"
                    onClick={() => toggleFeatureCollapse(feature.id)}
                    aria-expanded={!collapsedFeatures[feature.id]}
                  >
                    <span className="text-base font-semibold text-primary flex items-center gap-2">
                      {feature.name}
                      <span className="text-xs text-muted-foreground">
                        ({feature.flows.length} flows)
                      </span>
                    </span>
                    {collapsedFeatures[feature.id] ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronUp className="h-4 w-4" />
                    )}
                  </button>
                </div>
              )}
              {((!selectedFeatureId && !collapsedFeatures[feature.id]) ||
                selectedFeatureId) && (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={feature.flows.map((flow) => flow.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div
                      className={cn(
                        "focus:outline-none",
                        isFlowsPanel ? "space-y-0" : "space-y-3",
                      )}
                      tabIndex={-1}
                    >
                      {feature.flows.map((flow, index) => {
                        const reachabilityResult = reachabilityResults[flow.id];
                        const isLoadingForThisFlow =
                          loadingReachability[flow.id] || false;
                        const hasReachabilityComputed = !!reachabilityResult;
                        return (
                          <div
                            key={flow.id}
                            className={isFlowsPanel ? "mb-3" : ""}
                          >
                            <SortableFlowCard
                              flow={flow}
                              isSelected={selectedFlowId === flow.id}
                              onSelect={() =>
                                handleFlowSelect(
                                  selectedFlowId === flow.id ? null : flow.id,
                                )
                              }
                              onEdit={() => handleFlowEdit(flow.id)}
                              onDelete={() => handleDeleteClick(flow)}
                              onRename={(newName) =>
                                onFlowRename(flow.id, newName)
                              }
                              cardRef={flowRefs.current[flow.id]}
                              isReachableFromEntryPoint={
                                reachabilityResult?.isReachable || false
                              }
                              isLoadingChains={isLoadingForThisFlow}
                              isMultiSelectMode={isMultiSelectMode}
                              isMultiSelected={selectedFlowIds.includes(
                                flow.id,
                              )}
                              onMultiSelect={handleMultiSelect}
                              hasReachabilityComputed={hasReachabilityComputed}
                              isFlowsPanel={isFlowsPanel}
                              onCapture={
                                isFlowsPanel
                                  ? () => {
                                      console.log("Capture flow:", flow.id);
                                    }
                                  : undefined
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          ))
        )}
      </div>

      <ConfirmationDialog
        isOpen={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Flow"
        description={`Are you sure you want to delete "${flowToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        onConfirm={confirmDelete}
      />

      <ConfirmationDialog
        isOpen={bulkDeleteDialogOpen}
        onOpenChange={setBulkDeleteDialogOpen}
        title="Delete Multiple Flows"
        description={`Are you sure you want to delete ${selectedFlowIds.length} flow${selectedFlowIds.length > 1 ? "s" : ""}? This action cannot be undone.`}
        confirmText="Delete All"
        onConfirm={confirmBulkDelete}
      />

      <ConfirmationDialog
        isOpen={featureDeleteDialogOpen}
        onOpenChange={(isOpen) => {
          if (isLoadingFeatureDelete) return;
          setFeatureDeleteDialogOpen(isOpen);
          if (!isOpen) {
            setFeatureToDelete(null);
          }
        }}
        title="Delete Feature"
        description={`Are you sure you want to delete the feature "${featureToDelete?.name}"? This action cannot be undone and will remove the feature from all associated flows.`}
        confirmText="Delete"
        isLoading={isLoadingFeatureDelete}
        onConfirm={async () => {
          if (!featureToDelete || !onFeatureDelete) return;

          setIsLoadingFeatureDelete(true);
          try {
            await onFeatureDelete(featureToDelete.id);

            // Clear selection if deleted feature was selected
            if (selectedFeatureId === featureToDelete.id) {
              onFeatureSelectChange?.(null);
            }
            setIsLoadingFeatureDelete(false);
            setFeatureDeleteDialogOpen(false);
            setFeatureToDelete(null);
          } catch (error) {
            console.error("Error during feature delete:", error);
            setIsLoadingFeatureDelete(false);
          }
        }}
      />

      <FlowDetailsPanel
        flow={selectedFlow}
        isOpen={!isFlowsPanel && isPanelOpen}
        onClose={handlePanelClose}
        onFlowRename={onFlowRename}
        onFlowPreconditionRename={onFlowPreconditionRename}
        onCheckReachability={handleCheckReachability}
        onFlowScenariosUpdate={onFlowScenariosUpdate}
        onFlowCredentialsUpdate={onFlowCredentialsUpdate}
        edges={edges}
        nodes={nodes}
        reachabilityResult={
          selectedFlowId ? reachabilityResults[selectedFlowId] : undefined
        }
        isLoadingChains={
          selectedFlowId ? loadingReachability[selectedFlowId] || false : false
        }
        activeChainTab={
          selectedFlowId ? activeChainTabs[selectedFlowId] || 0 : 0
        }
        onChainTabChange={handleChainTabChange}
        onFlowSelect={handleFlowEdit}
        entryPointIds={entryPointIds}
        onFlowStepClick={onFlowStepClick}
        addNewNodes={addNewNodes}
        updateNodeDescription={updateNodeDescription}
        onEdgeDetailsChange={onEdgeDetailsChange}
        autoFormatEnabled={autoFormatEnabled}
      />

      {isFlowsPanel && <VideoFlowQueue items={videoQueueItems || []} />}

      <DragOverlay dropAnimation={null}>
        {activeId ? (
          <div className="w-[300px] pointer-events-none opacity-80 shadow-2xl">
            <FlowCard
              flow={flows.find((f) => f.id === activeId)!}
              isSelected={selectedFlowId === activeId}
              onSelect={() => {}}
              onDelete={() => {}}
              onRename={() => {}}
              isFlowsPanel={isFlowsPanel}
              dragHandleProps={{}}
              isDragging={true}
            />
          </div>
        ) : null}
      </DragOverlay>
    </>
  );
};
