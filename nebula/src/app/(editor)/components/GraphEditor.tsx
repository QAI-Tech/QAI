// @ts-nocheck
import React, {
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
} from "react";
import {
  ReactFlow,
  Node,
  Edge,
  addEdge,
  Connection,
  Controls,
  Background,
  MiniMap,
  MarkerType,
  BackgroundVariant,
  SelectionMode,
  useReactFlow,
  ReactFlowProvider,
  getNodesBounds,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useToast } from "@/hooks/use-toast";
import { Position } from "../types/collaborationEvents";
import { useUndoRedo } from "@/app/(editor)/hooks/useUndoRedo";
import { useKeyboardShortcuts } from "@/app/(editor)/hooks/useKeyboardShortcuts";
import { useClipboard } from "@/app/(editor)/hooks/useClipboard";
import { useEventListeners } from "@/app/(editor)/hooks/useEventListeners";
import { useCameraControls } from "@/app/(editor)/hooks/useCameraControls";
import { useNodeCreation } from "@/app/(editor)/hooks/useNodeCreation";
import { useNodeManagement } from "@/app/(editor)/hooks/useNodeManagement";
import { useNodeEditing } from "@/app/(editor)/hooks/useNodeEditing";
import { useEdgeEditing } from "@/app/(editor)/hooks/useEdgeEditing";
import { useEdgeCollaboration } from "@/app/(editor)/hooks/useEdgeCollaboration";
import { useNodeCollaboration } from "@/app/(editor)/hooks/useNodeCollaboration";
import { useDeleteManagement } from "@/app/(editor)/hooks/useDeleteManagement";
import {
  updateFeatureViaApi,
  deleteFeatureViaApi,
} from "@/app/(editor)/utils/updatefeatureApi";
import { useGraphState } from "@/app/(editor)/hooks/useGraphState";
import { useFlowManagement } from "@/app/(editor)/hooks/useFlowManagement";
import { usePlanFlowManagement } from "@/app/(editor)/hooks/usePlanFlowManagement";
import { useGraphEventHandlers } from "@/app/(editor)/hooks/useGraphEventHandlers";
import { useFeatureManagement } from "@/app/(editor)/hooks/useFeatureManagement";
import { useFeatureCollapse } from "@/app/(editor)/hooks/useFeatureCollapse";
import { useFeatureCollaboration } from "@/app/(editor)/hooks/useFeatureCollaboration";
import { compressBase64ImageToJpeg } from "@/app/(editor)/utils/imageCompressor";
import {
  setGraphFeatures,
  updateGraphFeature,
  deleteGraphFeature,
} from "@/app/store/graphFeaturesSlice";
import { useGraphFlows } from "@/app/context/graph-flows-context";
import { ConsoleCollaborationEvents } from "../types/collaborationEvents";
import { GraphSidebar } from "./GraphSidebar";
import { RightSidebar } from "./RightSidebar";
import { GraphDialogs } from "./GraphDialogs";
import { GraphCanvas } from "./GraphCanvas";
import { useFileOperations } from "./FileOperations";
import { PlanFlowManager, PlanFlowState } from "./PlanFlowManager";
import {
  FlowManager,
  Flow,
  Feature,
  Scenario,
  TestCasePlanningRequest,
} from "./FlowManager";
import { TestRunSelectionProvider } from "../contexts/TestRunSelectionContext";
import { useAiFlowPlanning } from "@/app/(editor)/hooks/useAiFlowPlanning";
import { useCommentManagement } from "@/app/(editor)/hooks/useCommentManagement";
import { useNodeAutoTitle } from "@/app/(editor)/hooks/useNodeAutoTitle";
import { useEdgeFormat } from "@/app/(editor)/hooks/useEdgeFormat";
import { useEdgeDescriptionFormat } from "@/app/(editor)/hooks/useEdgeDescriptionFormat";
import { getNodeStyle, getEdgeStyle } from "../utils/styleUtils";
import { getClosestConnectionHandles } from "../utils/edgeUtils";
import {
  generateNodeId,
  generateEdgeId,
  generateFlowIdFromPath,
} from "../utils/idGenerator";
import { findNonOverlappingPosition } from "../utils/collisionDetection";
import { getNodeAutoTitleManager } from "../services/nodeAutoTitleManager";
import { Button } from "@/components/ui/button";
import { CommentInputDialog } from "./CommentInputDialog";
import {
  Download,
  Upload,
  Lightbulb,
  ClipboardList,
  X,
  ChevronLeft,
  Plus,
} from "lucide-react";
import { useProductSwitcher } from "@/providers/product-provider";
import {
  GRAPH_BUCKET_NAME,
  GRAPH_COLLABORATION_SERVER_URL,
  BROWSER_DROID_SERVER_URLS,
} from "@/lib/constants";
import { useUser } from "@clerk/nextjs";
import { isQaiOrgUser, isQaiOrgAnalystUser } from "@/lib/constants";
import {
  validateVideoDuration,
  isWebProduct,
  isMobileProduct,
  cn,
} from "@/lib/utils";
import ProductLoadingScreen from "@/components/global/ProductLoadingScreen";
import { useSearchParams } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "@/app/store/store";
import {
  queueAdded,
  queueProgress,
  queueProcessing,
  queueCompleted,
  queueFailed,
  queueRemoved,
} from "@/app/store/videoFlowQueueSlice";
import { addCredentialFromCollaboration } from "@/app/store/credentialsSlice";
import type {
  BackendMergeResponse,
  MergedFlow,
  GraphNodeExport,
  GraphEdgeExport,
  GraphExport,
} from "@/app/(editor)/types/graph";
import WelcomeVideoUploadModal from "../components/WelcomeVideoUploadModal";

async function requestMergeWithOffset(
  productId: string,
  requestId: string,
  y_offset: number,
): Promise<string[]> {
  const resp = await fetch("/api/merge-generated-graph", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      product_id: productId,
      request_id: requestId,
      y_offset,
    }),
  });
  const data: BackendMergeResponse = await resp
    .json()
    .catch(() => ({}) as BackendMergeResponse);
  if (!resp.ok) {
    throw new Error((data as any)?.error || "Failed to merge generated graph");
  }
  return Array.isArray(data.flow_ids) ? data.flow_ids : [];
}

async function fetchMergedFlows(productId: string): Promise<MergedFlow[]> {
  try {
    const flowsExportPath = `${GRAPH_BUCKET_NAME}/qai-upload-temporary/productId_${productId}/flows-export.json`;
    const signedUrlResp = await fetch(
      `/api/generate-signed-url-for-frame?framePath=${flowsExportPath}`,
    );
    if (!signedUrlResp.ok) return [];
    const { signedUrl } = await signedUrlResp.json();
    const flowsResp = await fetch(signedUrl);
    if (!flowsResp.ok) return [];
    const importedFlowsJson = await flowsResp.json();
    return Array.isArray(importedFlowsJson)
      ? (importedFlowsJson as MergedFlow[])
      : [];
  } catch (e) {
    console.error("Failed to fetch merged flows:", e);
    return [];
  }
}

function buildNewFlowNodeIdsFromFlows(flows: MergedFlow[]): Set<string> {
  const ids = new Set<string>();
  flows.forEach((f) => {
    const startNodeId = f.startNodeId || f.startNode?.id;
    const endNodeId = f.endNodeId || f.endNode?.id;
    const viaNodeIds = f.viaNodeIds || f.viaNodes?.map((vn) => vn.id) || [];
    const pathNodeIds =
      f.pathNodeIds || f.nodeSequence?.map((ns) => ns.id) || [];
    if (startNodeId) ids.add(startNodeId);
    if (endNodeId) ids.add(endNodeId);
    viaNodeIds.forEach((id) => ids.add(id));
    pathNodeIds.forEach((id) => ids.add(id));
  });
  return ids;
}

async function fetchGraphExport(
  productId: string,
): Promise<GraphExport | null> {
  try {
    const graphPath = `${GRAPH_BUCKET_NAME}/qai-upload-temporary/productId_${productId}/graph-export.json`;
    const signedUrlGraph = await fetch(
      `/api/generate-signed-url-for-frame?framePath=${graphPath}`,
    );
    if (!signedUrlGraph.ok) return null;
    const { signedUrl } = await signedUrlGraph.json();
    const gResp = await fetch(signedUrl);
    if (!gResp.ok) return null;
    const graphData = await gResp.json();
    if (graphData?.nodes && graphData?.edges) {
      return graphData as GraphExport;
    }
    return null;
  } catch (e) {
    console.error("Failed to fetch graph export:", e);
    return null;
  }
}

function normalizeImportedNodes(nodes: GraphNodeExport[]): GraphNodeExport[] {
  return nodes.map((node) => ({
    ...node,
    type: "customNode",
    deletable: true,
    position: node.originalPosition || node.position,
    data: {
      ...node.data,
      ...(node.originalPosition && { originalPosition: node.originalPosition }),
      ...(node.data?.isCollapsed !== undefined && {
        isCollapsed: node.data.isCollapsed,
      }),
    },
  }));
}

function normalizeImportedEdges(edges: GraphEdgeExport[]): GraphEdgeExport[] {
  return edges.map((edge) => ({
    ...edge,
    type: "customEdge",
    sourceHandle: edge.data?.source_anchor || edge.sourceHandle || undefined,
    targetHandle: edge.data?.target_anchor || edge.targetHandle || undefined,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 20,
      height: 20,
    },
  }));
}

function filterNodesAndEdges(
  importedNodes: GraphNodeExport[],
  importedEdges: GraphEdgeExport[],
  newFlowNodeIds: Set<string>,
  existingNodeIds: Set<string>,
  onlyWithinNewSet: boolean,
): { nodes: GraphNodeExport[]; edges: GraphEdgeExport[] } {
  let nodes = importedNodes;
  let edges = importedEdges;

  if (newFlowNodeIds.size > 0) {
    nodes = nodes.filter((n) => newFlowNodeIds.has(n.id));
    const nodeSet = new Set(nodes.map((n) => n.id));
    if (onlyWithinNewSet) {
      edges = edges.filter(
        (e) => nodeSet.has(e.source) && nodeSet.has(e.target),
      );
    } else {
      edges = edges.filter(
        (e) =>
          (nodeSet.has(e.source) || existingNodeIds.has(e.source)) &&
          (nodeSet.has(e.target) || existingNodeIds.has(e.target)),
      );
    }
  }

  return { nodes, edges };
}

function mapFlowsForState(
  sourceFlows: MergedFlow[],
  returnedFlowIds: string[],
  requestId: string,
): Flow[] {
  return sourceFlows.map((flowData, idx) => {
    const startNodeId = flowData.startNodeId || flowData.startNode?.id;
    const endNodeId = flowData.endNodeId || flowData.endNode?.id;
    const precondition = flowData?.precondition || "";
    const description = flowData?.description || "";
    const viaNodeIds =
      flowData.viaNodeIds || flowData.viaNodes?.map((vn) => vn.id) || [];
    const pathNodeIds =
      flowData.pathNodeIds || flowData.nodeSequence?.map((ns) => ns.id) || [];
    return {
      id:
        (flowData.id as string | undefined) ||
        (returnedFlowIds[idx] as string | undefined) ||
        `flow_${requestId}_${idx}`,
      name: flowData.name,
      startNodeId,
      endNodeId,
      viaNodeIds,
      pathNodeIds,
      precondition,
      description,
      scenarios: flowData.scenarios,
      credentials: flowData.credentials || [],
      feature_id: flowData.feature_id,
      ...(flowData.autoPlan !== undefined && {
        autoPlan: flowData.autoPlan,
      }),
    } as Flow;
  });
}

export interface NodeData {
  id: string;
  image: string;
  description: string;
}

export interface EdgeData {
  id: string;
  description: string;
  source: string;
  target: string;
}

const GraphEditorFlow = ({
  path,
  flowPath,
  hideSidebar = false,
  hideTopButtons = false,
  showFlowsPanel = false,
  selectedFeatureId = null,
  onFeatureSelectChange,
  onAddFeatureClick,
  enableLinearFlowView = false,
}: {
  path?: string;
  flowPath?: string;
  hideSidebar?: boolean;
  hideTopButtons?: boolean;
  showFlowsPanel?: boolean;
  selectedFeatureId?: string | null;
  onFeatureSelectChange?: (featureId: string | null) => void;
  onAddFeatureClick?: () => void;
  enableLinearFlowView?: boolean;
}) => {
  // Graph state management
  const graphState = useGraphState();

  // Use comment management hook
  const commentManagement = useCommentManagement();
  const {
    nodes,
    setNodes,
    onNodesChange: graphNodesChange,
    edges,
    setEdges,
    onEdgesChange,
    mode,
    setMode,
    edgeSource,
    setEdgeSource,
    edgeCounter,
    setEdgeCounter,
    selectedEdge,
    setSelectedEdge,
    cursorPosition,
    setCursorPosition,
  } = graphState;

  const { productSwitcher } = useProductSwitcher();
  // Feature editing state
  const [editingFeatureId, setEditingFeatureId] = useState<string | null>(null);
  // Get user data from Clerk
  const { user, isSignedIn, isLoaded } = useUser();

  // Get user organization ID
  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;

  // Check if user belongs to QAI organization for production
  const isQaiUser = isQaiOrgUser(userOrgId) || isQaiOrgAnalystUser(userOrgId);

  // Flash animation state for uncovered nodes/edges
  const [isFlashingUncovered, setIsFlashingUncovered] = useState(false);

  // Screen preview toggle state (default: disabled)
  const [screenPreviewEnabled, setScreenPreviewEnabled] = useState(false);

  // Flash animation state for entry points
  const [isFlashingEntryPoints, setIsFlashingEntryPoints] = useState(false);

  // Flash animation state for search result
  const [isFlashingSearchResult, setIsFlashingSearchResult] = useState(false);
  const [searchResultId, setSearchResultId] = useState<string | null>(null);

  const [hoveredFlowId, setHoveredFlowId] = useState<string | null>(null);

  const [activeBrowserDroidServer, setActiveBrowserDroidServer] = useState<
    string | null
  >(null);

  useEffect(() => {
    const findBestServer = async () => {
      if (!isQaiUser) return;

      for (const serverUrl of BROWSER_DROID_SERVER_URLS) {
        try {
          console.log(`Checking server ${serverUrl}`);
          const response = await fetch(`${serverUrl}/status`);
          console.log(`Response from server ${serverUrl}: ${response}`);
          if (response.ok) {
            const status = await response.json();
            // If streaming_active is false, we consider it free.
            if (!status.locked_by) {
              setActiveBrowserDroidServer(serverUrl);
              return;
            } else if (status.locked_by == user.id) {
              setActiveBrowserDroidServer(serverUrl);
              return;
            } else if (status.locked_by !== user.id) {
              continue;
            }
          }
        } catch (e) {
          console.warn(`Failed to check server ${serverUrl}`, e);
        }
      }

      // Fallback: if all are busy or failed, use the first one
      if (BROWSER_DROID_SERVER_URLS.length > 0) {
        setActiveBrowserDroidServer(BROWSER_DROID_SERVER_URLS[0]);
      }
    };

    findBestServer();
    findBestServer();
  }, [isQaiUser]);

  useEffect(() => {
    const handleStartManualFlowCreation = (event: Event) => {
      const customEvent = event as CustomEvent;
      const flowName = customEvent.detail?.flowName;
      const featureId = customEvent.detail?.featureId;

      setMode("planFlow");
      setPlanFlowState((prev) => ({
        ...prev,
        ...(flowName && { flowName }),
        ...(featureId && { featureId }),
      }));
    };

    if (typeof window !== "undefined") {
      window.addEventListener(
        "graphStartManualFlowCreation",
        handleStartManualFlowCreation,
      );
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(
          "graphStartManualFlowCreation",
          handleStartManualFlowCreation,
        );
      }
    };
  }, []);

  const [isSaveInProgress, setIsSaveInProgress] = useState(false);
  const [isTestCasePlanningInProgress, setIsTestCasePlanningInProgress] =
    useState(false);
  const [isAutoImportInProgress, setIsAutoImportInProgress] = useState(false);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(true);
  const [showBrowserDroidInLeftSidebar, setShowBrowserDroidInLeftSidebar] =
    useState(false);

  const shouldFlushBrowserDroidOnCloseRef = useRef(false);
  const [browserDroidLeftCaptureCount, setBrowserDroidLeftCaptureCount] =
    useState(0);
  const [isFlowSelectionMode, setIsFlowSelectionMode] = useState(false);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const addNodeFileInputRef = useRef<HTMLInputElement>(null);
  const contextMenuPositionRef = useRef<{ x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
    contextMenuPositionRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handleAddNodeClick = () => {
    addNodeFileInputRef.current?.click();
    setContextMenu(null);
  };

  // State for merge graph loading
  const [isMergeGraphInProgress, setIsMergeGraphInProgress] = useState(false);

  const [forceDropdownOpen, setForceDropdownOpen] = useState(false);

  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const webRecorderBasePositionRef = useRef<{ x: number; y: number } | null>(
    null,
  );
  const webRecorderActionCountRef = useRef(0);
  const webRecorderLastNodeIdRef = useRef<string | null>(null);
  const webRecorderNodeIdsRef = useRef<string[]>([]);
  const webRecorderFeatureIdRef = useRef<string | null>(null);

  interface WebRecorderActionDetails {
    x?: number;
    y?: number;
    pageX?: number;
    pageY?: number;
    text?: string;
    scrollX?: number;
    scrollY?: number;
    element?: {
      text?: string;
      selector?: string;
      tagName?: string;
    };
  }

  interface WebRecorderAction {
    type: "click" | "scroll" | "type" | "hover" | "focus";
    details: WebRecorderActionDetails;
    timestamp: string;
    time: string;
    url?: string;
    actionCounter?: number;
    before_screenshot?: string;
    after_screenshot?: string;
    screenshot?: string;
  }

  interface PendingEdgeDescriptionRequest {
    edgeId: string;
    beforeImage: string;
    afterImage: string;
    boundingBox: { x: number; y: number; width: number; height: number };
    serverUrl: string;
    actionSummary: string;
    actionType: string;
    actionDetails: WebRecorderActionDetails;
    isWeb: boolean;
  }

  const [webRecorderActions, setWebRecorderActions] = useState<
    WebRecorderAction[]
  >([]);
  const browserDroidActionsRef = useRef<Record<string, any>>({});
  const browserDroidScreensRef = useRef<Record<string, any>>({});
  const browserDroidCaptureSessionsRef = useRef<
    Record<
      string,
      {
        flowId: string;
        nodeIds: string[];
        lastTimestamp: number;
        featureId: string | null;
        flowName?: string;
      }
    >
  >({});
  const webRecorderFlowNameRef = useRef<string | null>(null);
  const browserDroidFlowNameRef = useRef<string | null>(null);
  const pendingWebRecorderEdgeDescriptionsRef = useRef<
    PendingEdgeDescriptionRequest[]
  >([]);

  const clampValue = (value: number, min: number, max: number) => {
    if (Number.isNaN(value)) {
      return min;
    }
    return Math.max(min, Math.min(max, value));
  };

  const formatActionSummary = useCallback((actionPayload: any) => {
    if (!actionPayload) {
      return "User interaction";
    }
    const { actionType, details = {} } = actionPayload;
    switch (actionType) {
      case "tap":
        if (details.coordinates) {
          const { x, y } = details.coordinates;
          return `Tap at (${Math.round(x)}, ${Math.round(y)})`;
        }
        return "Tap interaction";
      case "swipe":
        if (details.start && details.end) {
          return `Swipe from (${Math.round(details.start.x)}, ${Math.round(details.start.y)}) to (${Math.round(details.end.x)}, ${Math.round(details.end.y)})`;
        }
        return "Swipe interaction";
      case "key":
        return `Pressed ${details.label || `key ${details.keycode || ""}`}`.trim();
      case "text":
        if (details.preview) {
          return `Entered "${details.preview}"`;
        }
        return "Entered text";
      default:
        return `${actionType || "User"} action`;
    }
  }, []);

  const computeBoundingBox = useCallback(
    (
      actionPayload: any,
      resolution?: { width?: number; height?: number } | null,
    ) => {
      if (!actionPayload) {
        return null;
      }

      const fallbackResolution = { width: 1080, height: 1920 };
      const width = Number(resolution?.width || fallbackResolution.width);
      const height = Number(resolution?.height || fallbackResolution.height);

      if (
        actionPayload.actionType === "tap" &&
        actionPayload.details?.coordinates
      ) {
        const size = Math.round(Math.min(width, height) * 0.12);
        const half = Math.round(size / 2);
        const x = clampValue(
          actionPayload.details.coordinates.x - half,
          0,
          width - size,
        );
        const y = clampValue(
          actionPayload.details.coordinates.y - half,
          0,
          height - size,
        );
        return { x, y, width: size, height: size };
      }

      if (
        actionPayload.actionType === "swipe" &&
        actionPayload.details?.start &&
        actionPayload.details?.end
      ) {
        const padding = Math.round(Math.min(width, height) * 0.05);
        const minX = Math.min(
          actionPayload.details.start.x,
          actionPayload.details.end.x,
        );
        const minY = Math.min(
          actionPayload.details.start.y,
          actionPayload.details.end.y,
        );
        const maxX = Math.max(
          actionPayload.details.start.x,
          actionPayload.details.end.x,
        );
        const maxY = Math.max(
          actionPayload.details.start.y,
          actionPayload.details.end.y,
        );
        const boxWidth = clampValue(maxX - minX + padding * 2, padding, width);
        const boxHeight = clampValue(
          maxY - minY + padding * 2,
          padding,
          height,
        );
        const x = clampValue(minX - padding, 0, width - boxWidth);
        const y = clampValue(minY - padding, 0, height - boxHeight);
        return { x, y, width: boxWidth, height: boxHeight };
      }

      return { x: 0, y: 0, width, height };
    },
    [],
  );

  const [isExtensionConnected, setIsExtensionConnected] = useState(false);
  const [extensionRecording, setExtensionRecording] = useState(false);
  const prevExtensionRecordingRef = useRef<boolean>(false);

  // WebSocket health check state
  const [isWebSocketHealthy, setIsWebSocketHealthy] = useState(true);
  const [connectionCheckCount, setConnectionCheckCount] = useState(0);
  // Keep previous health status to detect recovery transitions
  const prevIsWebSocketHealthyRef = useRef<boolean | null>(null);

  // Track if we're in the middle of a step navigation to prevent competing camera pans
  const isStepNavigatingRef = useRef(false);

  // Custom hooks
  const undoRedo = useUndoRedo(
    nodes,
    edges,
    setNodes,
    setEdges,
    productSwitcher.product_id,
  );

  // Initialize node auto-title system
  useNodeAutoTitle({ setNodes, enabled: true });

  // URL parameter handling
  const searchParams = useSearchParams();

  const { toast } = useToast();
  const { screenToFlowPosition, setViewport, getViewport, fitView } =
    useReactFlow();

  const camera = useCameraControls({ getViewport, setViewport });
  const router = useRouter();
  const isUpdatingUrl = useRef(false);
  // State to track initial URL flow ID
  const [initialFlowIdFromUrl, setInitialFlowIdFromUrl] = useState<
    string | null
  >(null);

  // Initialize edge business-logic formatter at graph level exactly like auto-title
  useEdgeFormat({
    enabled: true,
    onEdgeUpdate: (edgeId, formattedBusinessLogic) => {
      // Find the current edge to check for changes
      const currentEdge = edges.find((edge) => edge.id === edgeId);
      const oldBusinessLogic = currentEdge?.data?.business_logic || "";

      // Update edges array
      setEdges((eds) =>
        eds.map((edge) =>
          edge.id === edgeId
            ? {
                ...edge,
                data: {
                  ...edge.data,
                  business_logic: formattedBusinessLogic,
                },
              }
            : edge,
        ),
      );

      // Emit collaboration event if business logic changed
      if (collaborationEvents && oldBusinessLogic !== formattedBusinessLogic) {
        collaborationEvents.updateEdge(
          edgeId,
          {
            business_logic: {
              old: oldBusinessLogic,
              new: formattedBusinessLogic,
            },
          },
          "USER_ID",
        );
      }

      // Update selected edge if currently selected
      setSelectedEdge((current) =>
        current && current.id === edgeId
          ? {
              ...current,
              data: {
                ...current.data,
                business_logic: formattedBusinessLogic,
              },
            }
          : current,
      );
    },
    onError: (edgeId) => {
      // Trigger a dummy update to clear formatting state
      setEdges((eds) =>
        eds.map((edge) =>
          edge.id === edgeId
            ? {
                ...edge,
                data: {
                  ...edge.data,
                  // Keep the same business logic, just trigger a re-render
                },
              }
            : edge,
        ),
      );
    },
  });

  // Initialize edge description formatter
  useEdgeDescriptionFormat({
    enabled: true,
    onEdgeUpdate: (edgeId, formattedDescription) => {
      // Find the current edge to check for changes
      const currentEdge = edges.find((edge) => edge.id === edgeId);
      const oldDescription = currentEdge?.data?.description || "";

      // Update edges array
      setEdges((eds) =>
        eds.map((edge) =>
          edge.id === edgeId
            ? {
                ...edge,
                data: {
                  ...edge.data,
                  description: formattedDescription,
                },
              }
            : edge,
        ),
      );

      // Emit collaboration event if description changed
      if (collaborationEvents && oldDescription !== formattedDescription) {
        collaborationEvents.updateEdge(
          edgeId,
          {
            description: {
              old: oldDescription,
              new: formattedDescription,
            },
          },
          "USER_ID",
        );
      }

      // Update selected edge if currently selected
      setSelectedEdge((current) =>
        current && current.id === edgeId
          ? {
              ...current,
              data: {
                ...current.data,
                description: formattedDescription,
              },
            }
          : current,
      );
    },
    onError: (edgeId) => {
      // Trigger a dummy update to clear formatting state
      setEdges((eds) =>
        eds.map((edge) =>
          edge.id === edgeId
            ? {
                ...edge,
                data: {
                  ...edge.data,
                  // Keep the same description, just trigger a re-render
                },
              }
            : edge,
        ),
      );
    },
  });

  // Use flow management hook
  const flowManagement = useFlowManagement({
    panToFlowPath: (flowNodes: Node[]) => {
      // Skip if we're in the middle of step navigation
      if (isStepNavigatingRef.current) return;

      const isBrowserDroidCapturing = Object.values(
        browserDroidCaptureSessionsRef.current,
      ).some((session) => session && session.nodeIds.length > 0);
      if (isBrowserDroidCapturing) return;
      camera.panToFlowPath(flowNodes);
    },
    nodes,
  });

  // Use feature management hook (without expandFeatureImmediate initially)
  const featureManagement = useFeatureManagement();

  // Graph features should be globally available (e.g. for homev2/test-runs mapping),
  // so we mirror the editor's featureManagement into Redux.
  const dispatch = useDispatch();
  const {
    setFlows: setGraphFlows,
    setNodesCount,
    setIsLoading,
    setVideoQueueItems,
  } = useGraphFlows();

  useEffect(() => {
    dispatch(setGraphFeatures(featureManagement.features));
  }, [featureManagement.features, dispatch]);

  useEffect(() => {
    setGraphFlows(flowManagement.flows);
  }, [flowManagement.flows, setGraphFlows]);

  useEffect(() => {
    setNodesCount(nodes.length);
  }, [nodes.length, setNodesCount]);

  // Use feature collaboration hook for real-time feature sync (registers incoming event handlers)
  useFeatureCollaboration({
    setFeatures: featureManagement.setFeatures,
    setVisibleFeatureIds: featureManagement.setVisibleFeatureIds,
  });

  // Comment input dialog state
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  const [pendingCommentPosition, setPendingCommentPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const featureCollapse = useFeatureCollapse({
    nodes,
    setNodes,
    features: featureManagement.features,
    updateFeature: featureManagement.updateFeature,
  });

  // Update feature management to use expandFeature with animation and collaboration events
  const enhancedFeatureManagement = {
    ...featureManagement,
    addFeature: (feature: Feature) => {
      // Call the original addFeature method
      featureManagement.addFeature(feature);

      // Emit collaboration event
      if (collaborationEvents) {
        collaborationEvents.createFeatures([feature]);
      }
    },
    deleteFeature: (featureId: string) => {
      const feature = featureManagement.features.find(
        (f) => f.id === featureId,
      );

      // If feature is collapsed, expand it with animation first, then delete after animation completes
      if (feature && (feature as any).isCollapsed) {
        // Use the animated expansion and delete after animation completes
        featureCollapse.expandFeature(featureId);

        // Wait for animation to complete before deleting (500ms duration from useFeatureCollapse)
        setTimeout(() => {
          featureManagement.deleteFeature(featureId);
          // Emit collaboration event after actual deletion
          if (collaborationEvents && feature) {
            collaborationEvents.deleteFeature(feature);
          }
        }, 500);
      } else {
        // Feature is not collapsed, delete immediately
        featureManagement.deleteFeature(featureId);
        // Emit collaboration event
        if (collaborationEvents && feature) {
          collaborationEvents.deleteFeatures([feature]);
        }
      }
    },
    updateFeature: (featureId: string, updates: Partial<Feature>) => {
      const feature = featureManagement.features.find(
        (f) => f.id === featureId,
      );

      // Call the original updateFeature method
      featureManagement.updateFeature(featureId, updates);

      if (feature) {
        const collaborationUpdates: {
          name?: { old: string; new: string };
          nodeIds?: { old: string[]; new: string[] };
        } = {};

        if (updates.name && updates.name !== feature.name) {
          collaborationUpdates.name = { old: feature.name, new: updates.name };
        }

        if (
          updates.nodeIds &&
          JSON.stringify(updates.nodeIds) !== JSON.stringify(feature.nodeIds)
        ) {
          collaborationUpdates.nodeIds = {
            old: feature.nodeIds,
            new: updates.nodeIds,
          };
        }

        // Only emit if there are actual changes
        if (Object.keys(collaborationUpdates).length > 0) {
          if (showFlowsPanel) {
            const apiUpdates: { name?: string; nodeIds?: string[] } = {};
            apiUpdates.name = collaborationUpdates.name
              ? collaborationUpdates.name.new
              : feature.name;

            if (collaborationUpdates.nodeIds) {
              apiUpdates.nodeIds = collaborationUpdates.nodeIds.new;
            }

            if (productSwitcher?.product_id) {
              updateFeatureViaApi(
                featureId,
                apiUpdates,
                productSwitcher.product_id,
              ).catch((error) => {
                console.error(
                  `Failed to update feature ${featureId} via API:`,
                  error,
                );
              });
            }
          } else {
            if (collaborationEvents) {
              collaborationEvents.updateFeatures?.([
                { featureId, updates: collaborationUpdates },
              ]);
            }
          }
        }
      }
    },
  };

  // Use plan flow management hook
  // Use plan flow management hook
  const planFlow = usePlanFlowManagement({
    nodes,
    edges,
    setMode,
    flowManagement,
    featureManagement: enhancedFeatureManagement,
    selectedFeatureId,
  });
  const { planFlowState, setPlanFlowState, createPlanFlow } = planFlow;

  // Use AI flow planning hook
  const aiFlowPlanning = useAiFlowPlanning({
    features: featureManagement.features,
    nodes,
    edges,
    getNodeFeature: featureManagement.getNodeFeature,
    existingFlows: flowManagement.flows,
    onFlowsCreated: (flows) => {
      // Replace all flows with the new set (includes preserved, valid replanned, and new flows)
      flowManagement.setAllFlows(flows);
    },
  });

  // Create shared collaboration events instance
  const [collaborationEvents, setCollaborationEvents] =
    useState<ConsoleCollaborationEvents | null>(null);
  const [isRoomReady, setIsRoomReady] = useState(false);

  // Initialize collaboration when product ID changes
  useEffect(() => {
    const initializeCollaboration = async () => {
      if (productSwitcher.product_id) {
        try {
          console.log(
            "🔄 Initializing collaboration for product:",
            productSwitcher.product_id,
          );
          setIsRoomReady(false);

          const events = ConsoleCollaborationEvents.initializeForProduct(
            productSwitcher.product_id,
          );
          setCollaborationEvents(events);

          // Wait a bit for room to be ready, then check status
          setTimeout(() => {
            const roomReady = ConsoleCollaborationEvents.isRoomReady();
            console.log("room join status: ", roomReady);
            setIsRoomReady(roomReady);

            if (roomReady) {
              console.log("✅ Room is ready, can proceed with graph loading");
            } else {
              console.error("❌ Failed to join room, retrying...");
              // Retry checking room status every 2 seconds
              const retryInterval = setInterval(() => {
                const isReady = ConsoleCollaborationEvents.isRoomReady();
                console.log("⏳ Checking room status:", isReady);
                if (isReady) {
                  console.log(
                    "✅ Room is now ready, proceeding with graph loading",
                  );
                  setIsRoomReady(true);
                  clearInterval(retryInterval);
                }
              }, 2000);

              // Stop retrying after 2 minutes
              setTimeout(() => {
                console.log("⏰ Timeout: Stopping room status checks");
                clearInterval(retryInterval);
              }, 120000);
            }
          }, 3000); // Wait 3 seconds for initial connection
        } catch (error) {
          console.error("❌ Failed to initialize collaboration:", error);
          setIsRoomReady(false);
        }
      }
    };

    initializeCollaboration();
  }, [productSwitcher.product_id]);

  // Ensure all existing nodes are draggable (one-time fix)
  useEffect(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        draggable: true,
        data: {
          ...node.data,
          originalPosition: node.data?.originalPosition || node.position, // Set originalPosition if missing
        },
      })),
    );

    if (sessionStorage.getItem("isFirstTimeUser") === "true") {
      if (!showFlowsPanel) {
        setShowWelcomeModal(true);
      }
      sessionStorage.removeItem("isFirstTimeUser");
    }
  }, [showFlowsPanel]); // Run once on mount, but depend on showFlowsPanel

  // Use delete management hook
  const deleteManagement = useDeleteManagement({
    flows: flowManagement.flows,
    edges,
    setNodes,
    setEdges,
    saveState: undoRedo.saveState,
    deleteFlowsByNodeIds: flowManagement.deleteFlowsByNodeIds,
    deleteFlowsByEdgeIds: flowManagement.deleteFlowsByEdgeIds,
    featureManagement: enhancedFeatureManagement,
    collaborationEvents,
    productId: productSwitcher?.product_id || null,
    isNewUI: showFlowsPanel,
  });

  // Use event handlers hook
  const eventHandlers = useGraphEventHandlers({
    nodes,
    edges,
    setNodes,
    setEdges,
    mode,
    setMode,
    edgeSource,
    setEdgeSource,
    edgeCounter,
    setEdgeCounter,
    selectedEdge,
    setSelectedEdge,
    planFlowState,
    setPlanFlowState,
    flowManagement,
    undoRedo,
    camera,
    deleteManagement,
    featureManagement: enhancedFeatureManagement
      ? {
          ...enhancedFeatureManagement,
          features: enhancedFeatureManagement.features,
          setFeatures: enhancedFeatureManagement.setFeatures,
        }
      : undefined,
    editingFeatureId,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use node collaboration hook for real-time node sync (registers incoming event handlers)
  const nodeManagement = useNodeCollaboration({
    setNodes,
    collaborationEvents,
  });

  // Use edge collaboration hook for real-time edge sync (registers incoming event handlers)
  useEdgeCollaboration({
    setEdges,
  });

  // Create automatic edge for BrowserDroid screenshot flow
  const createAutomaticEdge = useCallback(
    ({
      sourceNode,
      targetNode,
      description,
    }: {
      sourceNode: Node | undefined;
      targetNode: Node | undefined;
      description: string;
    }) => {
      if (!sourceNode || !targetNode) {
        return null;
      }

      const sourceHandle = "right-source";
      const targetHandle = "left-target";

      const edgeId = generateEdgeId(undefined, productSwitcher.product_id);

      const newEdge: Edge = {
        id: edgeId,
        type: "customEdge",
        source: sourceNode.id,
        target: targetNode.id,
        sourceHandle,
        targetHandle,
        data: {
          description,
          source: sourceNode.id,
          target: targetNode.id,
          sourceHandle,
          targetHandle,
          isNewEdge: false,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
        },
      };

      setEdges((prevEdges) => [...prevEdges, newEdge]);
      setEdgeCounter((count) => count + 1);

      if (collaborationEvents) {
        collaborationEvents.createEdges(
          [
            {
              edgeId,
              sourceNodeId: sourceNode.id,
              targetNodeId: targetNode.id,
              sourceHandle,
              targetHandle,
              data: newEdge.data,
            },
          ],
          user?.id || "USER_ID",
        );
      }

      return edgeId;
    },
    [
      productSwitcher.product_id,
      setEdges,
      setEdgeCounter,
      collaborationEvents,
      user?.id,
    ],
  );

  // State to track node movements for batching
  const dragStartPositionsRef = useRef<Map<string, Position>>(new Map());
  const dragSelectionRef = useRef<Set<string>>(new Set());
  const throttledMovementsRef = useRef<
    Map<
      string,
      { nodeId: string; oldPosition: Position; newPosition: Position }
    >
  >(new Map());
  const throttleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSentPositionsRef = useRef<Map<string, Position>>(new Map());

  const flushThrottledMovements = useCallback(() => {
    if (throttledMovementsRef.current.size === 0) {
      return;
    }
    const movements = Array.from(throttledMovementsRef.current.values());
    throttledMovementsRef.current = new Map();
    throttleTimerRef.current = null;

    nodeManagement.moveNodes(movements, "USER_ID");
    movements.forEach(({ nodeId, newPosition }) => {
      lastSentPositionsRef.current.set(nodeId, newPosition);
    });
  }, [nodeManagement]);

  const initializeDragTracking = useCallback(
    (selectedIds: Set<string>) => {
      if (selectedIds.size === 0) {
        dragSelectionRef.current = new Set();
        dragStartPositionsRef.current = new Map();
        lastSentPositionsRef.current = new Map();
        throttledMovementsRef.current = new Map();
        if (throttleTimerRef.current) {
          clearTimeout(throttleTimerRef.current);
          throttleTimerRef.current = null;
        }
        return;
      }

      dragSelectionRef.current = selectedIds;

      const positionSnapshot = new Map<string, Position>();
      nodes.forEach((n) => {
        if (selectedIds.has(n.id)) {
          positionSnapshot.set(n.id, { x: n.position.x, y: n.position.y });
        }
      });
      dragStartPositionsRef.current = positionSnapshot;
      lastSentPositionsRef.current = new Map(positionSnapshot);

      throttledMovementsRef.current = new Map();
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
    },
    [nodes],
  );

  const finalizeDragTracking = useCallback(() => {
    const selectedIds = dragSelectionRef.current;
    const startPositions = dragStartPositionsRef.current;

    if (selectedIds.size === 0 || startPositions.size === 0) {
      return;
    }

    if (throttleTimerRef.current) {
      clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }
    flushThrottledMovements();

    const movements: Array<{
      nodeId: string;
      oldPosition: Position;
      newPosition: Position;
    }> = [];

    nodes.forEach((currentNode) => {
      if (!selectedIds.has(currentNode.id)) {
        return;
      }
      const startPosition = startPositions.get(currentNode.id);
      if (!startPosition) {
        return;
      }
      const currentPosition = currentNode.position;
      if (
        currentPosition.x !== startPosition.x ||
        currentPosition.y !== startPosition.y
      ) {
        movements.push({
          nodeId: currentNode.id,
          oldPosition:
            lastSentPositionsRef.current.get(currentNode.id) || startPosition,
          newPosition: currentPosition,
        });
        lastSentPositionsRef.current.set(currentNode.id, currentPosition);
      }
    });

    if (movements.length > 0) {
      nodeManagement.moveNodes(movements, "USER_ID");
    }

    dragSelectionRef.current = new Set();
    dragStartPositionsRef.current = new Map();
    throttledMovementsRef.current = new Map();
    lastSentPositionsRef.current = new Map();
  }, [flushThrottledMovements, nodes, nodeManagement]);

  const onNodeDragStart = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // Dispatch event to stop camera panning during step navigation
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("graphCanvasInteraction"));
      }

      const selectedIds = new Set(
        nodes.filter((n) => n.selected).map((n) => n.id),
      );
      if (selectedIds.size === 0) {
        selectedIds.add(node.id);
      }

      initializeDragTracking(selectedIds);
    },
    [initializeDragTracking, nodes],
  );

  const onNodeDragStop = useCallback(() => {
    finalizeDragTracking();
  }, [finalizeDragTracking]);

  const onSelectionDragStart = useCallback(
    (event: MouseEvent | React.MouseEvent, selectionNodes: Node[]) => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("graphCanvasInteraction"));
      }

      const selectedIds = new Set(
        (selectionNodes || []).map((selectionNode) => selectionNode.id),
      );

      if (selectedIds.size === 0) {
        const currentlySelected = nodes
          .filter((n) => n.selected)
          .map((n) => n.id);
        initializeDragTracking(new Set(currentlySelected));
        return;
      }

      initializeDragTracking(selectedIds);
    },
    [initializeDragTracking, nodes],
  );

  const onSelectionDragStop = useCallback(() => {
    finalizeDragTracking();
  }, [finalizeDragTracking]);

  useEffect(() => {
    return () => {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
      }
    };
  }, []);

  const onNodesChange = useCallback(
    (changes: any) => {
      const positionChanges = changes.filter(
        (change: any) => change.type === "position" && change.position,
      );

      if (positionChanges.length > 0) {
        const nodesById = new Map(nodes.map((node) => [node.id, node]));

        positionChanges.forEach((change: any) => {
          const nodeId = change.id;
          const newPosition = change.position;
          if (!newPosition) return;

          const existing = throttledMovementsRef.current.get(nodeId);
          const baseOldPosition =
            existing?.oldPosition ||
            lastSentPositionsRef.current.get(nodeId) ||
            dragStartPositionsRef.current.get(nodeId) ||
            nodesById.get(nodeId)?.position;

          if (!baseOldPosition) return;

          throttledMovementsRef.current.set(nodeId, {
            nodeId,
            oldPosition: existing?.oldPosition || { ...baseOldPosition },
            newPosition,
          });
        });

        if (!throttleTimerRef.current) {
          throttleTimerRef.current = setTimeout(() => {
            flushThrottledMovements();
          }, 500);
        }
      }

      graphNodesChange(changes);
    },
    [flushThrottledMovements, graphNodesChange, nodes],
  );

  // Use node creation hook
  const nodeCreation = useNodeCreation({
    addNewNodes: nodeManagement.addNewNodes,
    setNodes,
    nodes,
    mode,
    setMode,
    screenToFlowPosition,
    saveState: undoRedo.saveState,
    // Removed onNodeCreated callback to prevent edit dialog from appearing
  });

  const handleFileInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (contextMenuPositionRef.current) {
      await nodeCreation.addNodesAtPosition(
        e.target.files,
        contextMenuPositionRef.current,
      );
      contextMenuPositionRef.current = null;
    } else {
      await nodeCreation.handleImageUpload(e);
      setMode("addNode");
    }

    if (e.target) {
      e.target.value = "";
    }
  };

  const getLastNodePositionInFeature = useCallback(
    (featureId: string | null): { x: number; y: number } | null => {
      if (!featureId || !featureManagement) return null;

      const feature = featureManagement.getFeatureById(featureId);
      if (!feature || !feature.nodeIds || feature.nodeIds.length === 0) {
        return null;
      }

      const featureNodes = nodes.filter((node) =>
        feature.nodeIds.includes(node.id),
      );

      if (featureNodes.length === 0) return null;

      let lastNode = featureNodes[0];
      for (const node of featureNodes) {
        if (
          node.position.y > lastNode.position.y ||
          (node.position.y === lastNode.position.y &&
            node.position.x < lastNode.position.x)
        ) {
          lastNode = node;
        }
      }

      return {
        x: lastNode.position.x,
        y: lastNode.position.y + (lastNode.height ?? 300),
      };
    },
    [nodes, featureManagement],
  );

  const handleWebRecorderAction = useCallback(
    async (action: WebRecorderAction) => {
      let afterScreenshot = action.after_screenshot || action.screenshot;
      let beforeScreenshot = action.before_screenshot;

      if (afterScreenshot) {
        try {
          afterScreenshot = await compressBase64ImageToJpeg(afterScreenshot);
        } catch (error) {
          console.warn(
            "Failed to compress after screenshot, using original:",
            error,
          );
          afterScreenshot = action.after_screenshot || action.screenshot;
        }
      }

      if (beforeScreenshot) {
        try {
          beforeScreenshot = await compressBase64ImageToJpeg(beforeScreenshot);
        } catch (error) {
          console.warn(
            "Failed to compress before screenshot, using original:",
            error,
          );
          beforeScreenshot = action.before_screenshot;
        }
      }

      const isFirstAction = webRecorderActionCountRef.current === 0;

      const existingNodes = nodes;
      const NODE_SPACING_X = 450;
      const NODE_SPACING_Y = 500;

      if (!webRecorderBasePositionRef.current) {
        const featureLastNodePos =
          getLastNodePositionInFeature(selectedFeatureId);

        if (featureLastNodePos) {
          webRecorderBasePositionRef.current = {
            x: featureLastNodePos.x,
            y: featureLastNodePos.y + NODE_SPACING_Y,
          };
        } else if (existingNodes.length > 0) {
          const maxY = Math.max(
            ...existingNodes.map(
              (node) => node.position.y + (node.height ?? 300),
            ),
          );
          const minX = Math.min(
            ...existingNodes.map((node) => node.position.x),
          );
          webRecorderBasePositionRef.current = {
            x: Number.isFinite(minX) ? minX : 100,
            y: maxY + NODE_SPACING_Y,
          };
        } else {
          webRecorderBasePositionRef.current = { x: 100, y: 100 };
        }
      }

      const basePosition = webRecorderBasePositionRef.current!;
      let actionIndex = webRecorderActionCountRef.current;

      let rawInteraction = "";
      if (action.type === "click") {
        if (action.details.element?.text) {
          const elementText = action.details.element.text.slice(0, 50);
          rawInteraction = `Click ${elementText}`;
        } else if (action.details.element?.selector) {
          rawInteraction = `Click ${action.details.element.selector}`;
        } else {
          rawInteraction = `Click at (${action.details.x}, ${action.details.y})`;
        }
      } else if (action.type === "type") {
        rawInteraction = `Type "${action.details.text?.slice(0, 30) || ""}"`;
      } else if (action.type === "scroll") {
        rawInteraction = "Scroll";
      } else if (action.type === "focus") {
        rawInteraction = `Focus ${action.details.element?.selector || "element"}`;
      } else {
        rawInteraction = `${action.type} action`;
      }

      const nodesToAdd: Node[] = [];
      const defaultNodeWidth = isWebProduct(productSwitcher) ? 350 : 250;
      const defaultNodeHeight = 300;

      if (isFirstAction && beforeScreenshot) {
        const preferredPosition = {
          x: basePosition.x + actionIndex * NODE_SPACING_X,
          y: basePosition.y,
        };

        const adjustedPosition = findNonOverlappingPosition(
          preferredPosition,
          defaultNodeWidth,
          defaultNodeHeight,
          nodes,
          {
            margin: 20,
            spacing: 50,
          },
        );

        const beforeNode: Node = {
          id: generateNodeId(undefined, productSwitcher.product_id),
          type: "customNode",
          position: adjustedPosition,
          data: {
            image: beforeScreenshot,
            description: "Initial state",
          },
          deletable: true,
        };
        nodesToAdd.push(beforeNode);
        actionIndex++;
      }

      if (afterScreenshot) {
        const preferredPosition = {
          x: basePosition.x + actionIndex * NODE_SPACING_X,
          y: basePosition.y,
        };

        const adjustedPosition = findNonOverlappingPosition(
          preferredPosition,
          defaultNodeWidth,
          defaultNodeHeight,
          [...nodes, ...nodesToAdd],
          {
            margin: 20,
            spacing: 50,
          },
        );

        const afterNode: Node = {
          id: generateNodeId(undefined, productSwitcher.product_id),
          type: "customNode",
          position: adjustedPosition,
          data: {
            image: afterScreenshot,
            description: rawInteraction,
          },
          deletable: true,
        };
        nodesToAdd.push(afterNode);
      }

      if (nodesToAdd.length > 0) {
        nodeManagement.addNewNodes(nodesToAdd);
        nodeCreation.setNodeCounter((count) => count + nodesToAdd.length);

        try {
          const autoTitleManager = getNodeAutoTitleManager();
          nodesToAdd.forEach((node) => {
            autoTitleManager.generateTitleForNode(node.id, node.data.image);
          });
        } catch (error) {
          console.error("Failed to auto-title web recorder nodes:", error);
        }

        const edgesToAdd: Edge[] = [];
        let previousNodeId = webRecorderLastNodeIdRef.current;

        for (const node of nodesToAdd) {
          if (previousNodeId) {
            const newEdge: Edge = {
              id: generateEdgeId(undefined, productSwitcher.product_id),
              type: "customEdge",
              source: previousNodeId,
              target: node.id,
              sourceHandle: "right-source",
              targetHandle: "left-target",
              data: {
                description: rawInteraction,
                rawInteraction: rawInteraction,
                source: previousNodeId,
                target: node.id,
                sourceHandle: "right-source",
                targetHandle: "left-target",
                isNewEdge: false,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 20,
                height: 20,
              },
            };
            edgesToAdd.push(newEdge);
          }
          previousNodeId = node.id;
        }

        if (edgesToAdd.length > 0) {
          setEdges((prevEdges) => [...prevEdges, ...edgesToAdd]);
          setEdgeCounter((count) => count + edgesToAdd.length);

          if (collaborationEvents && edgesToAdd.length > 0) {
            const collaborationEdges = edgesToAdd.map((edge) => ({
              edgeId: edge.id,
              sourceNodeId: edge.source,
              targetNodeId: edge.target,
              sourceHandle: edge.sourceHandle,
              targetHandle: edge.targetHandle,
              data: edge.data,
            }));
            collaborationEvents.createEdges(
              collaborationEdges,
              user?.id || "USER_ID",
            );
          }

          // Queue LLM-generated edge description request for all action types
          if (beforeScreenshot && afterScreenshot) {
            // Determine bounding box based on action type
            const BOX_SIZE = 100;
            let boundingBox = { x: 0, y: 0, width: BOX_SIZE, height: BOX_SIZE };

            if (
              action.type === "click" &&
              action.details?.x !== undefined &&
              action.details?.y !== undefined
            ) {
              // For click actions, center the box on click coordinates
              boundingBox = {
                x: Math.max(0, action.details.x - BOX_SIZE / 2),
                y: Math.max(0, action.details.y - BOX_SIZE / 2),
                width: BOX_SIZE,
                height: BOX_SIZE,
              };
            } else if (
              action.type === "type" ||
              action.type === "focus" ||
              action.type === "hover"
            ) {
              // For type/focus/hover actions, use pageX/pageY if available, otherwise center of screen
              const x = action.details?.pageX ?? action.details?.x ?? 400;
              const y = action.details?.pageY ?? action.details?.y ?? 300;
              boundingBox = {
                x: Math.max(0, x - BOX_SIZE / 2),
                y: Math.max(0, y - BOX_SIZE / 2),
                width: BOX_SIZE,
                height: BOX_SIZE,
              };
            } else if (action.type === "scroll") {
              // For scroll actions, use scroll position area
              const x = action.details?.scrollX ?? 400;
              const y = action.details?.scrollY ?? 300;
              boundingBox = {
                x: Math.max(0, x),
                y: Math.max(0, y),
                width: BOX_SIZE,
                height: BOX_SIZE,
              };
            }

            // Find the edge that connects the before node to after node
            const edgeForDescription = edgesToAdd.find(
              (edge) => edge.data?.rawInteraction === rawInteraction,
            );

            if (edgeForDescription) {
              // Queue the request to be processed after requestEdgeDescription is available
              pendingWebRecorderEdgeDescriptionsRef.current.push({
                edgeId: edgeForDescription.id,
                beforeImage: beforeScreenshot,
                afterImage: afterScreenshot,
                boundingBox,
                serverUrl: BROWSER_DROID_SERVER_URLS[0],
                actionSummary: rawInteraction,
                actionType: action.type,
                actionDetails: action.details,
                isWeb: true,
              });
            }
          }
        }

        webRecorderLastNodeIdRef.current = nodesToAdd[nodesToAdd.length - 1].id;

        nodesToAdd.forEach((node) => {
          webRecorderNodeIdsRef.current.push(node.id);
        });

        webRecorderActionCountRef.current += nodesToAdd.length;

        console.log("Web recorder nodes added:", {
          nodeIds: webRecorderNodeIdsRef.current,
          count: webRecorderNodeIdsRef.current.length,
          isRecording: extensionRecording,
        });

        toast({
          title: "Screen captured",
          description: `Added ${nodesToAdd.length} node${
            nodesToAdd.length > 1 ? "s" : ""
          } and ${edgesToAdd.length} edge${
            edgesToAdd.length > 1 ? "s" : ""
          }: ${rawInteraction}`,
        });
      }
    },
    [
      nodes,
      nodeManagement,
      nodeCreation,
      productSwitcher.product_id,
      toast,
      setEdges,
      setEdgeCounter,
      collaborationEvents,
      user?.id,
      selectedFeatureId,
      getLastNodePositionInFeature,
    ],
  );

  useEffect(() => {
    const handleAuthCheck = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.type === "QAI_CHECK_AUTH_REQUEST") {
        const authenticated = isLoaded && isSignedIn && !!user;
        window.postMessage(
          {
            type: "QAI_CHECK_AUTH_RESPONSE",
            authenticated: authenticated,
          },
          window.location.origin,
        );
      }
    };

    window.addEventListener("message", handleAuthCheck);
    return () => window.removeEventListener("message", handleAuthCheck);
  }, [isLoaded, isSignedIn, user]);

  useEffect(() => {
    const handleExtensionMessage = (event: MessageEvent) => {
      if (event.source !== window) return;

      if (event.data?.type === "QAI_RECORDER_ACTION") {
        const action = event.data.action as WebRecorderAction;
        setWebRecorderActions((prev) => [action, ...prev]);
        setIsExtensionConnected(true);
        handleWebRecorderAction(action);
      } else if (event.data?.type === "QAI_CAPTURER_STATE") {
        const wasCapturing = prevExtensionRecordingRef.current;
        const isNowCapturing = event.data.isCapturing;

        if (event.data.flowName) {
          webRecorderFlowNameRef.current = event.data.flowName;
        }

        console.log("QAI_CAPTURER_STATE received:", {
          wasCapturing,
          isNowCapturing,
          nodeIdsCount: webRecorderNodeIdsRef.current.length,
          nodeIds: [...webRecorderNodeIdsRef.current],
          flowName: event.data.flowName,
        });

        setExtensionRecording(isNowCapturing);

        if (!wasCapturing && isNowCapturing) {
          webRecorderFeatureIdRef.current = selectedFeatureId || null;
        }

        if (wasCapturing && !isNowCapturing) {
          console.log("Recording stopped, checking for flow creation...");
          const nodeIds = [...webRecorderNodeIdsRef.current];
          const featureId = webRecorderFeatureIdRef.current;

          if (nodeIds.length >= 2) {
            console.log("Creating flow with nodeIds:", nodeIds);
            const flowId = generateFlowIdFromPath(nodeIds);
            const flowName =
              webRecorderFlowNameRef.current || `Web Recorder Flow`;
            const startNodeId = nodeIds[0];
            const endNodeId = nodeIds[nodeIds.length - 1];
            const viaNodeIds = nodeIds.length > 2 ? nodeIds.slice(1, -1) : [];

            const newFlow: Flow = {
              id: flowId,
              name: flowName,
              startNodeId: startNodeId,
              endNodeId: endNodeId,
              viaNodeIds: viaNodeIds,
              pathNodeIds: nodeIds,
              precondition: "",
              autoPlan: false,
              feature_id: featureId || undefined,
            };

            console.log("Flow object:", newFlow);
            flowManagement.addFlow(newFlow, true, true);

            if (featureId && featureManagement) {
              const feature = featureManagement.features.find(
                (f) => f.id === featureId,
              );
              if (feature) {
                const existingNodeIds = new Set<string>(
                  Array.isArray(feature.nodeIds) ? feature.nodeIds : [],
                );

                for (const nid of nodeIds) {
                  if (!nid || existingNodeIds.has(nid)) continue;

                  existingNodeIds.add(nid);
                }

                const newNodeIds = Array.from(existingNodeIds);
                featureManagement.updateFeature(featureId, {
                  nodeIds: newNodeIds,
                });
                collaborationEvents?.updateFeatures?.([
                  {
                    featureId,
                    updates: {
                      nodeIds: { old: feature.nodeIds, new: newNodeIds },
                    },
                  },
                ]);
                console.log(
                  `Associated ${nodeIds.length} nodes with feature ${featureId}`,
                );
              }
            }

            if (collaborationEvents) {
              collaborationEvents.createFlows([newFlow], "USER_ID");
            }

            toast({
              title: "Flow created",
              description: `Flow "${flowName}" with ${nodeIds.length} screens has been created.`,
            });

            webRecorderNodeIdsRef.current = [];
            webRecorderBasePositionRef.current = null;
            webRecorderActionCountRef.current = 0;
            webRecorderLastNodeIdRef.current = null;
            webRecorderFlowNameRef.current = null;
            webRecorderFeatureIdRef.current = null;
          } else {
            console.log("Not enough nodes for flow creation:", {
              count: nodeIds.length,
              nodeIds: nodeIds,
            });
            webRecorderNodeIdsRef.current = [];
            webRecorderBasePositionRef.current = null;
            webRecorderActionCountRef.current = 0;
            webRecorderLastNodeIdRef.current = null;
            webRecorderFlowNameRef.current = null;
            webRecorderFeatureIdRef.current = null;
          }
        }

        prevExtensionRecordingRef.current = isNowCapturing;

        if (event.data.connected !== undefined) {
          setIsExtensionConnected(event.data.connected);
        } else {
          setIsExtensionConnected(true);
        }
      }
    };

    window.addEventListener("message", handleExtensionMessage as any);
    return () =>
      window.removeEventListener("message", handleExtensionMessage as any);
  }, [
    handleWebRecorderAction,
    flowManagement,
    collaborationEvents,
    toast,
    featureManagement,
    selectedFeatureId,
  ]);

  // Use node editing hook
  const nodeEditing = useNodeEditing({
    setNodes,
    saveState: undoRedo.saveState,
  });

  // Use edge editing hook
  const edgeEditing = useEdgeEditing({
    edges,
    setEdges,
    saveState: undoRedo.saveState,
    collaborationEvents,
  });

  // File operations hook
  const fileOps = useFileOperations({
    nodes,
    edges,
    flows: flowManagement.flows,
    setNodes,
    setEdges,
    addNewNodes: nodeManagement.addNewNodes,
    setFlows: flowManagement.setFlows,
    setNodeCounter: nodeCreation.setNodeCounter,
    setEdgeCounter,
    productId: productSwitcher.product_id,
    featureManagement: enhancedFeatureManagement,
    commentManagement,
    path,
    flowPath,
    setFailedVideoToFlowRequests: flowManagement.setFailedVideoToFlowRequests,
  });

  const videoQueueItems = useSelector(
    (state: RootState) => state.videoFlowQueue.items,
  );

  useEffect(() => {
    setVideoQueueItems(videoQueueItems);
  }, [videoQueueItems, setVideoQueueItems]);

  const nextOffsetRef = useRef(600);

  const videoQueueItemsRef = useRef(videoQueueItems);
  const fileMapRef = useRef<Record<string, File>>({});

  useEffect(() => {
    videoQueueItemsRef.current = videoQueueItems;

    if (videoQueueItems.length === 0) {
      nextOffsetRef.current = 600;
    }
  }, [videoQueueItems]);

  const importGeneratedAssets = useCallback(
    async (requestId: string, queueId?: string): Promise<boolean> => {
      const productId = productSwitcher.product_id;
      if (!productId) {
        throw new Error("Missing product_id");
      }
      try {
        const currentQueueItems = videoQueueItemsRef.current;
        const matchedItem = currentQueueItems.find(
          (it) => (queueId && it.id === queueId) || it.requestId === requestId,
        );
        const y_offset = matchedItem?.mergeOffset ?? 600;

        const returnedFlowIds: string[] = await requestMergeWithOffset(
          productId,
          requestId,
          y_offset,
        );

        if (returnedFlowIds.length === 0) {
          console.error("No flows returned from backend");
          toast({
            title: "No flows returned",
            description:
              "The merge completed but did not return any flow IDs. Skipping import.",
            variant: "destructive",
          });
          throw new Error("No flows returned from merge");
        }

        let flowsForRequest: MergedFlow[] = [];
        let newFlowNodeIds: Set<string> = new Set();
        let addedFlows = 0;
        let importedNodes: GraphNodeExport[] = [];
        let importedEdges: GraphEdgeExport[] = [];
        const existingNodeIds = new Set(nodes.map((n) => n.id));

        // for (let attempt = 0; attempt < 3; attempt++) {
        //   try {
        //     const mergedFlows = await fetchMergedFlows(productId);
        //     flowsForRequest =
        //       mergedFlows.length > 0
        //         ? mergedFlows.filter((f: MergedFlow) =>
        //             returnedFlowIds.includes(f.id as string),
        //           )
        //         : [];

        //     if (flowsForRequest.length === 0) {
        //       if (attempt < 2) {
        //         await new Promise((resolve) => setTimeout(resolve, 8000));
        //         continue;
        //       } else {
        //         console.error("Merged flows not found after retries");
        //         toast({
        //           title: "Merged flows not found",
        //           description:
        //             "Returned flow IDs were not found in the canonical flows after multiple attempts. Skipping import.",
        //           variant: "destructive",
        //         });
        //         return;
        //       }
        //     }

        //     newFlowNodeIds = buildNewFlowNodeIdsFromFlows(flowsForRequest);
        //     if (newFlowNodeIds.size === 0) {
        //       if (attempt < 2) {
        //         await new Promise((resolve) => setTimeout(resolve, 8000));
        //         continue;
        //       } else {
        //         console.error("No nodes for merged flows after retries");
        //         toast({
        //           title: "No nodes for merged flows",
        //           description:
        //             "Could not resolve any nodes for the returned flows after multiple attempts. Skipping import.",
        //           variant: "destructive",
        //         });
        //         return;
        //       }
        //     }

        //     const graphData = await fetchGraphExport(productId);
        //     if (graphData) {
        //       let tempNodes = normalizeImportedNodes(graphData.nodes);
        //       let tempEdges = normalizeImportedEdges(graphData.edges);

        //       const filtered = filterNodesAndEdges(
        //         tempNodes,
        //         tempEdges,
        //         newFlowNodeIds,
        //         existingNodeIds,
        //         true,
        //       );
        //       tempNodes = filtered.nodes;
        //       tempEdges = filtered.edges;

        //       if (tempNodes.length > 0) {
        //         importedNodes = tempNodes;
        //         importedEdges = tempEdges;
        //         break;
        //       }
        //     }
        //   } catch (e) {
        //     console.warn(
        //       "Failed to fetch/append merged graph attempt:",
        //       attempt + 1,
        //       e,
        //     );
        //   }
        //   if (attempt < 2) {
        //     await new Promise((resolve) => setTimeout(resolve, 8000));
        //   }
        // }

        // if (importedNodes.length === 0) {
        //   console.error("Flow not ready in graph");
        //   toast({
        //     title: "Flow not ready in graph",
        //     description:
        //       "Tried downloading graph 3 times but flow nodes were not present. Please try again later.",
        //     variant: "destructive",
        //   });
        //   return;
        // }

        // const newNodes = importedNodes.filter(
        //   (n) => !existingNodeIds.has(n.id),
        // );
        // if (newNodes.length > 0) {
        //   setNodes((prev) => [...prev, ...newNodes]);
        // }

        // const existingEdgeIds = new Set(edges.map((e) => e.id));
        // const newEdges = importedEdges.filter(
        //   (e) => !existingEdgeIds.has(e.id),
        // );
        // if (newEdges.length > 0) {
        //   setEdges((prev) => [...prev, ...newEdges]);
        // }

        // try {
        //   const mapped = mapFlowsForState(
        //     flowsForRequest,
        //     returnedFlowIds,
        //     requestId,
        //   );
        //   if (mapped.length > 0) {
        //     flowManagement.setFlows((prev) => [...prev, ...mapped]);
        //     addedFlows += mapped.length;
        //   }
        // } catch (e) {
        //   console.error("Failed to import flows:", e);
        // }

        // fileOps.importFeaturesAutomatically();

        // if (addedFlows > 0) {
        //   toast({
        //     title: "Flow(s) added",
        //     description: "Graph merged and imported.",
        //   });
        // } else {
        //   toast({
        //     title: "Nothing imported",
        //     description:
        //       "Merge completed but no new nodes, edges, or flows were added.",
        //     variant: "destructive",
        //   });
        // }
        return true;
      } catch (error) {
        console.error("Error merging and importing generated assets:", error);
        toast({
          title: "Merge failed",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
        throw error;
      }
    },
    [
      productSwitcher.product_id,
      nodes,
      edges,
      setNodes,
      setEdges,
      flowManagement,
      fileOps,
      toast,
    ],
  );

  const pollingTimersRef = useRef<Record<string, NodeJS.Timeout>>({});
  const removeTimer = useCallback((id: string) => {
    const t = pollingTimersRef.current[id];
    if (t) {
      clearInterval(t);
      delete pollingTimersRef.current[id];
    }
  }, []);

  const startPolling = useCallback(
    (queueId: string, requestId: string) => {
      removeTimer(queueId);
      const timer = setInterval(async () => {
        try {
          const resp = await fetch(
            `/api/get-planning-request-status?requestId=${requestId}`,
          );
          if (!resp.ok) return;
          const data = await resp.json();
          if (data.status === "COMPLETED") {
            removeTimer(queueId);
            try {
              await importGeneratedAssets(requestId, queueId);

              dispatch(queueCompleted({ id: queueId }));

              dispatch(queueRemoved({ id: queueId }));
            } catch (error) {
              dispatch(
                queueFailed({
                  id: queueId,
                  error:
                    error instanceof Error ? error.message : "Merge failed",
                }),
              );

              dispatch(queueRemoved({ id: queueId }));
            }
          } else if (data.status === "FAILED") {
            dispatch(queueFailed({ id: queueId, error: "Processing failed" }));
            removeTimer(queueId);
            dispatch(queueRemoved({ id: queueId }));

            // Fetch request details and add to failed list
            try {
              const detailsResp = await fetch(
                `/api/get-test-case-planning-requests-by-product-id?productId=${productSwitcher.product_id}`,
              );
              if (detailsResp.ok) {
                const detailsData = await detailsResp.json();
                const failedRequest =
                  detailsData.test_case_planning_requests?.find(
                    (req: any) => req.request_id === requestId,
                  );
                if (failedRequest) {
                  flowManagement.addFailedVideoToFlowRequest(failedRequest);
                }
              }
            } catch (err) {
              console.error("Failed to fetch failed request details:", err);
            }
          }
        } catch (e) {
          console.error("Failed to start polling:", e);
        }
      }, 10000);
      pollingTimersRef.current[queueId] = timer;
    },
    [dispatch, importGeneratedAssets, removeTimer],
  );

  const requestMaintainerAgent = useCallback(
    async (
      queueId: string,
      videoUrl: string,
      requestIdToSend: string | null = null,
      featureId: string | null = null,
      flowName?: string,
    ) => {
      const productId = productSwitcher.product_id;
      if (!productId) throw new Error("Missing product_id");
      const payload = {
        product_id: productId,
        user_flow_video_urls: [videoUrl],
        request_id: requestIdToSend,
        feature_id: featureId,
        ...(flowName && { flow_name: flowName }),
      };
      const resp = await fetch(
        `/api/generate-instructions?maintainerAgent=true`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payload }),
        },
      );
      if (!resp.ok) throw new Error("Failed to request flow generation");
      const result = await resp.json();
      const requestId = (result?.message?.request_id || "") as string;
      if (!requestId) throw new Error("No request id returned");
      dispatch(queueProcessing({ id: queueId, requestId }));
      startPolling(queueId, requestId);
    },
    [dispatch, productSwitcher.product_id, startPolling],
  );

  const retryMapRef = useRef<
    Record<string, { videoUrl: string; requestId: string }>
  >({});

  const handleRetryVideoRequest = useCallback(
    async (request: TestCasePlanningRequest) => {
      if (
        !request.user_flow_video_urls ||
        request.user_flow_video_urls.length === 0 ||
        !request.request_id
      ) {
        toast({
          title: "Cannot retry",
          description:
            "No video URL or request ID found in the failed request.",
          variant: "destructive",
        });
        return;
      }

      const videoUrl = request.user_flow_video_urls[0];
      const queueId = crypto.randomUUID();
      const mergeOffset = nextOffsetRef.current;
      nextOffsetRef.current += 300;

      // Store retry info
      retryMapRef.current[queueId] = {
        videoUrl,
        requestId: request.request_id,
      };

      // Add to queue
      dispatch(
        queueAdded({
          id: queueId,
          fileName: "Retrying video...",
          progress: 0,
          status: "queued",
          mergeOffset,
          requestId: request.request_id,
        }),
      );

      toast({
        title: "Retry queued",
        description: "Video retry has been added to the queue.",
      });

      // Remove from failed list
      flowManagement.removeFailedVideoToFlowRequest(request.request_id);
    },
    [dispatch, toast, flowManagement],
  );

  const uploadVideo = useCallback(
    async (
      queueId: string,
      file: File,
      featureId: string | null = null,
      flowName?: string,
    ) => {
      try {
        dispatch(queueProgress({ id: queueId, progress: 0 }));
        const extension = file.type.split("/")[1] || "mp4";
        const uploadPath = `qai-upload-temporary/productId_${productSwitcher.product_id}/${queueId}.${extension}`;
        const signedUrlResponse = await fetch(
          `/api/generate-instructions?getSignedUrl=true`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: uploadPath,
              contentType: file.type,
            }),
          },
        );
        if (!signedUrlResponse.ok) throw new Error("Failed to get signed URL");
        const { signedUrl, fileName } = await signedUrlResponse.json();
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", signedUrl, true);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const percent = (event.loaded / event.total) * 100;
            const cappedPercent = Math.min(percent, 90);
            dispatch(queueProgress({ id: queueId, progress: cappedPercent }));
          }
        });
        await new Promise<void>((resolve, reject) => {
          xhr.onload = () =>
            xhr.status === 200
              ? resolve()
              : reject(new Error(`Upload failed: ${xhr.status}`));
          xhr.onerror = () => reject(new Error("Network error during upload"));
          xhr.send(file);
        });
        const videoUrl = fileName as string;
        dispatch(queueProgress({ id: queueId, progress: 90 }));
        await requestMaintainerAgent(
          queueId,
          videoUrl,
          null,
          featureId,
          flowName,
        );
      } catch (error: any) {
        dispatch(queueFailed({ id: queueId, error: error?.message }));
        // Auto-remove failed upload after delay
        setTimeout(() => {
          dispatch(queueRemoved({ id: queueId }));
        }, 12000);
        toast({
          title: "Video upload failed",
          description: error?.message,
          variant: "destructive",
        });
      }
    },
    [dispatch, productSwitcher.product_id, requestMaintainerAgent, toast],
  );

  // Process queue sequentially
  useEffect(() => {
    const isBusy = videoQueueItems.some(
      (item) => item.status === "uploading" || item.status === "processing",
    );

    if (isBusy) return;

    const nextItem = videoQueueItems.find((item) => item.status === "queued");
    if (nextItem) {
      const file = fileMapRef.current[nextItem.id];
      const retryInfo = retryMapRef.current[nextItem.id];

      if (file) {
        uploadVideo(
          nextItem.id,
          file,
          nextItem.featureId || null,
          nextItem.flowName,
        );
        delete fileMapRef.current[nextItem.id];
      } else if (retryInfo) {
        // Handle retry
        dispatch(queueProgress({ id: nextItem.id, progress: 90 })); // Jump to processing
        requestMaintainerAgent(
          nextItem.id,
          retryInfo.videoUrl,
          retryInfo.requestId,
          nextItem.featureId || null,
          nextItem.flowName,
        );
        delete retryMapRef.current[nextItem.id];
      } else {
        console.error(
          `File or retry info missing for queued item ${nextItem.id}`,
        );
        dispatch(queueFailed({ id: nextItem.id, error: "Data missing" }));
      }
    }
  }, [videoQueueItems, uploadVideo, dispatch, requestMaintainerAgent]);

  const onAddFlowsFromVideo = useCallback(
    async (
      files: File[] | FileList,
      flowName?: string,
      featureId?: string | null,
    ) => {
      if (!files) {
        console.error("onAddFlowsFromVideo called with null/undefined files");
        return;
      }

      const list = Array.from(files as File[]);
      if (!list || list.length === 0) {
        console.error("No files provided to onAddFlowsFromVideo");
        return;
      }

      const currentFeatureId = featureId || selectedFeatureId;

      for (const file of list) {
        const validation = await validateVideoDuration(file);
        if (!validation.isValid) {
          toast({
            title: validation.errorMessage?.includes("exceeds")
              ? "Video too long"
              : "Failed to read video",
            description: validation.errorMessage,
            variant: "destructive",
          });
          continue;
        }

        const id = crypto.randomUUID();
        const mergeOffset = nextOffsetRef.current;
        nextOffsetRef.current += 300;

        // Store file in ref for later processing
        fileMapRef.current[id] = file;

        dispatch(
          queueAdded({
            id,
            fileName: file.name,
            progress: 0,
            status: "queued",
            mergeOffset,
            featureId: currentFeatureId || null,
            flowName: flowName,
          }),
        );
      }
    },
    [dispatch, toast, selectedFeatureId],
  );

  // Auto-import on mount and when productId changes
  const [graphImported, setGraphImported] = useState(false);
  const [flowsImported, setFlowsImported] = useState(false);
  useEffect(() => {
    const runImports = async () => {
      if (productSwitcher.product_id && isRoomReady) {
        console.log("🚀 Room is ready, starting graph import...");
        setIsAutoImportInProgress(true);
        setGraphImported(false);
        await fileOps.importGraphFromGcms(productSwitcher.product_id);
        fileOps.importFailedVideoToFlowRequests(productSwitcher.product_id);
        setIsAutoImportInProgress(false);
        setGraphImported(true);
      }
    };

    runImports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSwitcher.product_id, isRoomReady]);

  // On initial mount, capture the flow ID from URL if present
  useEffect(() => {
    const flowIdFromUrl = searchParams.get("flow_id");
    if (flowIdFromUrl) {
      setInitialFlowIdFromUrl(flowIdFromUrl);
    }
  }, []); // Run only once on mount

  // Hook to set flow id from URL parameter when flows load
  useEffect(() => {
    // Skip if updating URL from selection
    if (isUpdatingUrl.current) return;

    // Check for flow_id in URL or saved initial value
    const flowIdFromUrl = searchParams.get("flow_id") || initialFlowIdFromUrl;

    // Only try to select flow if we have flows loaded and a flow ID to select
    if (flowIdFromUrl && flowManagement.flows.length > 0) {
      // Find if this flow exists
      const flowExists = flowManagement.flows.some(
        (flow) => flow.id === flowIdFromUrl,
      );

      if (flowExists && flowManagement.selectedFlowId !== flowIdFromUrl) {
        console.log(`Selecting flow from URL: ${flowIdFromUrl}`);
        flowManagement.selectFlow(flowIdFromUrl);

        // Clear initial flow ID after successful selection
        if (initialFlowIdFromUrl) {
          setInitialFlowIdFromUrl(null);
        }
      }
    }
    // If URL has no flow_id but we have a selected flow, clear selection
    else if (!flowIdFromUrl && flowManagement.selectedFlowId) {
      flowManagement.selectFlow(null);
    }
  }, [searchParams, flowManagement.flows, initialFlowIdFromUrl]); // Run when URL changes OR flows load

  // The rest of your URL update effect remains unchanged
  useEffect(() => {
    // Skip during initial load
    if (flowManagement.flows.length === 0) return;

    if (typeof window === "undefined") return;

    const currentUrl = new URL(window.location.href);

    if (currentUrl.searchParams.has("tcue")) {
      return;
    }

    // Get current flow_id parameter from URL
    const currentFlowParam = currentUrl.searchParams.get("flow_id");

    // Only update URL if the flow selection doesn't match URL parameter
    if (currentFlowParam !== flowManagement.selectedFlowId) {
      // Set flag to prevent re-triggering from URL change
      isUpdatingUrl.current = true;

      if (flowManagement.selectedFlowId) {
        currentUrl.searchParams.set("flow_id", flowManagement.selectedFlowId);
      } else {
        currentUrl.searchParams.delete("flow_id");
      }

      // Update the URL without triggering a page reload
      window.history.replaceState({}, "", currentUrl);
      // Reset flag after DOM has updated
      requestAnimationFrame(() => {
        isUpdatingUrl.current = false;
      });
    }
  }, [flowManagement.selectedFlowId]); // Only run when selected flow changes
  // Show connection status toast when WebSocket is unhealthy
  useEffect(() => {
    if (!isWebSocketHealthy && connectionCheckCount > 0) {
      // Always show the toast when connection is unhealthy after each health check
      // This ensures it reappears even if dismissed by other toasts
      toast({
        title: "Not connected to Internet",
        description: "Changes might not be saved.",
        variant: "destructive",
        duration: Infinity, // Keep showing until connection is restored
      });
    }
  }, [isWebSocketHealthy, connectionCheckCount, toast]);

  // Connection health check function
  const checkConnectionHealth = useCallback(async () => {
    const controller = new AbortController();

    const timeout = new Promise<false>((resolve) =>
      setTimeout(() => {
        controller.abort();
        resolve(false);
      }, 3000),
    );

    try {
      const response = await Promise.race([
        fetch(`${GRAPH_COLLABORATION_SERVER_URL}/health-live`, {
          method: "GET",
          cache: "no-cache",
          signal: controller.signal,
        }),
        timeout,
      ]);

      if (!response) return false;

      const isHealthy = response.ok;

      const prev = prevIsWebSocketHealthyRef.current;
      prevIsWebSocketHealthyRef.current = isHealthy;
      setIsWebSocketHealthy(isHealthy);

      if (!prev && isHealthy) {
        toast({
          title: "Connected to Internet",
          description: "Connection to collaboration server restored.",
          variant: "success",
        });
      }

      setConnectionCheckCount((c) => c + 1);

      return isHealthy;
    } catch (err) {
      console.error("Connection health check failed:", err);
      prevIsWebSocketHealthyRef.current = false;
      setIsWebSocketHealthy(false);
      setConnectionCheckCount((c) => c + 1);
      return false;
    }
  }, []);

  // Connection health check - runs every 5 seconds
  useEffect(() => {
    if (!productSwitcher.product_id) return;

    checkConnectionHealth(); // initial

    const interval = setInterval(checkConnectionHealth, 5000);

    return () => clearInterval(interval);
  }, [productSwitcher.product_id]);

  // Get selected nodes for features
  const selectedNodes = nodes.filter((node) => node.selected);
  // Store flow chain from FlowManager
  const [flowChain, setFlowChain] = useState<Flow[]>([]);
  const setFlowChainOnce = useRef(false);

  const handleSelectedFlowChainChange = useCallback((chain: Flow[]) => {
    // Prevent infinite update loop by only updating if chain is different
    setFlowChain((prev) => {
      if (
        prev.length === chain.length &&
        prev.every((f, i) => f.id === chain[i]?.id)
      ) {
        return prev;
      }
      return chain;
    });
  }, []);

  // Clear selection function
  const handleEditFeature = useCallback(
    (featureId: string) => {
      const feature = featureManagement.getFeatureById(featureId);
      if (feature) {
        // Pre-select the nodes that belong to this feature (only customNode types)
        setNodes((nodes) =>
          nodes.map((node) => ({
            ...node,
            selected:
              node.type === "customNode" && feature.nodeIds.includes(node.id),
          })),
        );
        setEditingFeatureId(featureId);
        setMode("addFeature");
      }
    },
    [featureManagement, setNodes, setMode],
  );

  // Refs for auto-save to prevent re renders
  const isSaving = useRef(false);
  const fileOpsRef = useRef(fileOps);

  // Keep fileOpsRef updated with latest fileOps
  useEffect(() => {
    fileOpsRef.current = fileOps;
  });

  // Auto-save disabled
  // useEffect(() => {
  //   const exportPeriodically = async () => {
  //     // Prevent concurrent saves
  //     if (isSaving.current) {
  //       console.log("Auto-save skipped: save already in progress");
  //       return;
  //     }

  //     if (productSwitcher.product_id && fileOpsRef.current) {
  //       isSaving.current = true;
  //       console.log("Auto-saving graph data...");

  //       try {
  //         await fileOpsRef.current.exportGraphAutomatically();
  //         await fileOpsRef.current.exportFlowsAutomatically();
  //         await fileOpsRef.current.exportFeaturesAutomatically();
  //         await fileOpsRef.current.exportCommentsAutomatically();
  //         console.log("Auto-save completed successfully");
  //       } catch (error) {
  //         console.error("Auto-save failed:", error);
  //       } finally {
  //         isSaving.current = false;
  //       }
  //     }
  //   };

  //   if (productSwitcher.product_id) {
  //     //2 minutes (120000 ms)
  //     const intervalId = setInterval(exportPeriodically, 120000);

  //     return () => clearInterval(intervalId);
  //   }
  // }, [productSwitcher.product_id]);

  // Use keyboard shortcuts hook
  const { copiedData, setCopiedData } = useKeyboardShortcuts({
    nodes,
    edges,
    setNodes,
    setEdges,
    addNewNodes: nodeManagement.addNewNodes,
    nodeCounter: nodeCreation.nodeCounter,
    setNodeCounter: nodeCreation.setNodeCounter,
    cursorPosition,
    editingNode: nodeEditing.editingNode,
    editingEdge: edgeEditing.editingEdge,
    inlineEditingEdges: edgeEditing.inlineEditingEdges,
    undo: undoRedo.undo,
    redo: undoRedo.redo,
    saveState: undoRedo.saveState,
    onDelete: deleteManagement.handleDelete,
    getViewport,
    setViewport,
    flows: flowManagement.flows,
    selectedFlowId: flowManagement.selectedFlowId,
    selectFlow: flowManagement.selectFlow,
    commentManagement: {
      createComment: commentManagement.createComment,
    },
    collaborationEvents,
  });

  // Use event listeners hook
  useEventListeners({
    nodes,
    edges,
    setNodes,
    setEdges,
    setEditingNode: nodeEditing.setEditingNode,
    setEditingEdge: edgeEditing.setEditingEdge,
    setEditNodeDescription: nodeEditing.setEditNodeDescription,
    setEditNodeImage: nodeEditing.setEditNodeImage,
    setEditEdgeDescription: edgeEditing.setEditEdgeDescription,
    setInlineEditingEdges: edgeEditing.setInlineEditingEdges,
    setCursorPosition,
    setIsPanning: camera.setIsPanning,
    setLastPanPosition: camera.setLastPanPosition,
    screenToFlowPosition,
    saveState: undoRedo.saveState,
    onDelete: deleteManagement.handleDelete,
    commentManagement: {
      deleteComment: commentManagement.deleteComment,
      updateComment: commentManagement.updateComment,
    },
  });

  // Use clipboard hook (now handles only images - node pasting handled by useKeyboardShortcuts)
  useClipboard({
    cursorPosition,
    nodeCounter: nodeCreation.nodeCounter,
    nodes,
    edges,
    setNodes,
    setEdges,
    addNewNodes: nodeManagement.addNewNodes,
    setNodeCounter: nodeCreation.setNodeCounter,
    editingNode: nodeEditing.editingNode,
    editingEdge: edgeEditing.editingEdge,
    inlineEditingEdges: edgeEditing.inlineEditingEdges,
    saveState: undoRedo.saveState,
  });

  const cancelDeletion = useCallback(() => {
    deleteManagement.cancelDelete();
  }, [deleteManagement.cancelDelete]);

  const clearSelection = useCallback(() => {
    console.log("clearSelection called - clearing all node selections");
    setNodes((nodes) => nodes.map((node) => ({ ...node, selected: false })));
    setEditingFeatureId(null);
  }, [setNodes]);

  const handleFlashUncovered = useCallback(() => {
    setIsFlashingUncovered(true);
    setTimeout(() => {
      setIsFlashingUncovered(false);
    }, 3000); // 3 seconds for single iteration
  }, []);

  const handleFlashEntryPoints = useCallback(() => {
    setIsFlashingEntryPoints(true);
    setTimeout(() => {
      setIsFlashingEntryPoints(false);
    }, 3000); // 3 seconds for single iteration
  }, []);

  const handleFindElementById = useCallback(
    (id: string) => {
      // Find node or edge by exact ID match
      const foundNode = nodes.find((node) => node.id === id);
      const foundEdge = edges.find((edge) => edge.id === id);

      if (foundNode) {
        // Highlight the node and pan to it
        setSearchResultId(id);
        setIsFlashingSearchResult(true);
        camera.panToFlowPath([foundNode]);

        // Fade out after 3 seconds
        setTimeout(() => {
          setIsFlashingSearchResult(false);
          setSearchResultId(null);
        }, 3000);
      } else if (foundEdge) {
        // For edges, highlight and pan to show both source and target nodes
        const sourceNode = nodes.find((node) => node.id === foundEdge.source);
        const targetNode = nodes.find((node) => node.id === foundEdge.target);

        if (sourceNode && targetNode) {
          setSearchResultId(id);
          setIsFlashingSearchResult(true);
          camera.panToFlowPath([sourceNode, targetNode]);

          // Fade out after 3 seconds
          setTimeout(() => {
            setIsFlashingSearchResult(false);
            setSearchResultId(null);
          }, 3000);
        }
      } else {
        // No element found
        toast({
          title: "Element not found",
          description: `No element with ID "${id}" exists.`,
          variant: "destructive",
        });
      }
    },
    [nodes, edges, camera, toast],
  );

  const handleFlowStepClick = useCallback(
    (sourceNodeId: string, targetNodeId: string) => {
      // Don't pan camera when browserdroid is capturing
      const isBrowserDroidCapturing = Object.values(
        browserDroidCaptureSessionsRef.current,
      ).some((session) => session && session.nodeIds.length > 0);
      if (isBrowserDroidCapturing) return;

      const sourceNode = nodes.find((n) => n.id === sourceNodeId);
      const targetNode = nodes.find((n) => n.id === targetNodeId);
      if (!sourceNode || !targetNode) return;

      const isNewUI = showFlowsPanel === true;
      // ✅ showFlowsPanel = New UI
      // ✅ !showFlowsPanel = Old UI

      // ============================
      // ✅ NEW UI → USE fitView
      // ============================
      if (isNewUI) {
        // Set flag to prevent feature panning from interfering
        isStepNavigatingRef.current = true;

        // Perform the camera pan immediately without requestAnimationFrame
        fitView(
          {
            nodes: [sourceNode, targetNode],
            padding: 0.25,
            duration: 800,
            minZoom: 0.9,
            maxZoom: 1.6,
          },
          true,
        );

        // Clear the flag after animation completes
        setTimeout(() => {
          isStepNavigatingRef.current = false;
        }, 850); // Slightly longer than animation duration

        return;
      }

      // ============================
      // ✅ OLD UI → USE LEGACY MATH (UNCHANGED)
      // ============================

      // Set flag to prevent other camera panning from interfering (even in old UI)
      isStepNavigatingRef.current = true;

      const sourceW = sourceNode.width ?? 150;
      const sourceH = sourceNode.height ?? 100;
      const targetW = targetNode.width ?? 150;
      const targetH = targetNode.height ?? 100;

      const sX = sourceNode.position.x + sourceW / 2;
      const sY = sourceNode.position.y + sourceH / 2;
      const tX = targetNode.position.x + targetW / 2;
      const tY = targetNode.position.y + targetH / 2;

      const minX = Math.min(sX, tX);
      const maxX = Math.max(sX, tX);
      const minY = Math.min(sY, tY);
      const maxY = Math.max(sY, tY);

      const width = maxX - minX;
      const height = maxY - minY;

      const padding = 100;
      const paddedWidth = width + padding * 2;
      const paddedHeight = height + padding * 2;

      // ✅ OLD UI layout constants (LEFT sidebar + Flow Details panel)
      const leftSidebarWidth = 336 + 384;

      const viewportHeight = window.innerHeight;
      const availableWidth = window.innerWidth - leftSidebarWidth;

      const miniMapWidth = 200;
      const miniMapHeight = 150;
      const uiPaddingRight = miniMapWidth + 60;
      const uiPaddingBottom = miniMapHeight + 60;

      const effectiveWidth = availableWidth - uiPaddingRight;
      const effectiveHeight = viewportHeight - uiPaddingBottom;

      const zoomX = effectiveWidth / paddedWidth;
      const zoomY = effectiveHeight / paddedHeight;
      const zoom = Math.min(zoomX, zoomY);

      const minZoom = 0.9;
      const maxZoom = 1.6;
      const clampedZoom = Math.min(Math.max(zoom, minZoom), maxZoom);

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      const biasStrength = 120;
      const shiftX = tX > sX ? biasStrength : -biasStrength;
      const finalCenterX = centerX + shiftX;

      const viewportCenterX =
        leftSidebarWidth + (availableWidth - uiPaddingRight) / 2;
      const viewportCenterY = (viewportHeight - uiPaddingBottom) / 2;

      setViewport(
        {
          x: viewportCenterX - finalCenterX * clampedZoom,
          y: viewportCenterY - centerY * clampedZoom,
          zoom: clampedZoom,
        },
        { duration: 800 },
      );

      // Clear the flag after animation completes
      setTimeout(() => {
        isStepNavigatingRef.current = false;
      }, 850); // Slightly longer than animation duration
    },
    [nodes, showFlowsPanel, fitView, setViewport],
  );

  const handleEdgeDetailsChange = useCallback(
    (
      edgeId: string,
      details: {
        description: string;
        paramValues: string[];
        business_logic?: string | null;
      },
    ) => {
      // Find the edge to check if it's new
      const currentEdge = edges.find((edge) => edge.id === edgeId);
      const isNewEdge = currentEdge?.data?.isNewEdge;

      setEdges((eds) =>
        eds.map((edge) =>
          edge.id === edgeId
            ? {
                ...edge,
                data: {
                  ...edge.data,
                  description: details.description,
                  paramValues: details.paramValues,
                  business_logic: details.business_logic,
                },
              }
            : edge,
        ),
      );

      // Emit appropriate collaboration event
      if (isNewEdge && currentEdge) {
        // Emit edge creation for new edges with description
        const edgeData = {
          description: details.description,
          source: currentEdge.source,
          target: currentEdge.target,
          paramValues: details.paramValues,
          isNewEdge: false,
        };
        let finalSourceHandle = currentEdge.sourceHandle;
        let finalTargetHandle = currentEdge.targetHandle;

        console.log("Debug GraphEditor - Original handles:", {
          sourceHandle: currentEdge.sourceHandle,
          targetHandle: currentEdge.targetHandle,
        });

        if (!finalSourceHandle || !finalTargetHandle) {
          console.log(
            "Debug GraphEditor - Handles are undefined, using fallback",
          );
          const sourceNode = nodes.find((n) => n.id === currentEdge.source);
          const targetNode = nodes.find((n) => n.id === currentEdge.target);
          if (sourceNode && targetNode) {
            // reuse directional inference from edgeUtils but adapt if it returns semantic names
            const { sourceHandle, targetHandle } = getClosestConnectionHandles(
              sourceNode,
              targetNode,
            );
            finalSourceHandle = finalSourceHandle || sourceHandle;
            finalTargetHandle = finalTargetHandle || targetHandle;
            console.log(
              "Debug GraphEditor - getClosestConnectionHandles returned:",
              { sourceHandle, targetHandle },
            );
          } else {
            // geometry fallback using positions directly if nodes missing
            if (sourceNode && targetNode) {
              const dx = targetNode.position.x - sourceNode.position.x;
              const dy = targetNode.position.y - sourceNode.position.y;
              if (Math.abs(dx) > Math.abs(dy)) {
                if (dx > 0) {
                  finalSourceHandle = finalSourceHandle || "right-source";
                  finalTargetHandle = finalTargetHandle || "left-target";
                } else {
                  finalSourceHandle = finalSourceHandle || "left-source";
                  finalTargetHandle = finalTargetHandle || "right-target";
                }
              } else {
                if (dy > 0) {
                  finalSourceHandle = finalSourceHandle || "bottom-source";
                  finalTargetHandle = finalTargetHandle || "top-target";
                } else {
                  finalSourceHandle = finalSourceHandle || "top-source";
                  finalTargetHandle = finalTargetHandle || "bottom-target";
                }
              }
              console.log(
                "Debug GraphEditor - Geometric fallback calculated:",
                { finalSourceHandle, finalTargetHandle },
              );
            }
          }
        } else {
          console.log("Debug GraphEditor - Using original handles:", {
            finalSourceHandle,
            finalTargetHandle,
          });
        }
        collaborationEvents?.createEdge(
          edgeId,
          currentEdge.source,
          currentEdge.target,
          finalSourceHandle,
          finalTargetHandle,
          edgeData as any,
          "USER_ID",
        );
      } else {
        // Emit collaboration events for existing edges
        const currentEdgeData = currentEdge?.data || {};

        // Check for description changes
        const oldDescription = currentEdgeData.description || "";
        if (oldDescription !== details.description) {
          collaborationEvents?.updateEdge(
            edgeId,
            {
              description: { old: oldDescription, new: details.description },
            },
            "USER_ID",
          );
        }

        // Check for business logic changes
        const oldBusinessLogic = currentEdgeData.business_logic || "";
        if (oldBusinessLogic !== (details.business_logic || "")) {
          collaborationEvents?.updateEdge(
            edgeId,
            {
              business_logic: {
                old: oldBusinessLogic,
                new: details.business_logic || "",
              },
            },
            "USER_ID",
          );
        }
      }

      // Update selectedEdge if it's the one being edited
      setSelectedEdge((currentSelectedEdge) => {
        if (currentSelectedEdge && currentSelectedEdge.id === edgeId) {
          return {
            ...currentSelectedEdge,
            data: {
              ...currentSelectedEdge.data,
              description: details.description,
              paramValues: details.paramValues,
              business_logic: details.business_logic,
            },
          };
        }
        return currentSelectedEdge;
      });
    },
    [setEdges, setSelectedEdge, edges, collaborationEvents],
  );

  // Handle auto-format enabled toggle - update all edges
  const handleAutoFormatEnabledChange = useCallback(
    (enabled: boolean) => {
      setEdges((eds) =>
        eds.map((edge) => ({
          ...edge,
          data: {
            ...edge.data,
            autoFormatEnabled: enabled,
          },
        })),
      );
    },
    [setEdges],
  );

  // Initialize all edges with autoFormatEnabled
  useEffect(() => {
    if (edges.some((e) => e.data?.autoFormatEnabled === undefined)) {
      setEdges((eds) =>
        eds.map((edge) =>
          edge.data?.autoFormatEnabled === undefined
            ? { ...edge, data: { ...edge.data, autoFormatEnabled: false } }
            : edge,
        ),
      );
    }
  }, [edges, setEdges]);

  const requestEdgeDescription = useCallback(
    async ({
      edgeId,
      beforeImage,
      afterImage,
      boundingBox,
      serverUrl,
      actionSummary,
      actionType,
      actionDetails,
      isWeb = false,
    }: PendingEdgeDescriptionRequest) => {
      if (
        !edgeId ||
        !beforeImage ||
        !afterImage ||
        !boundingBox ||
        !serverUrl
      ) {
        return;
      }

      try {
        console.log("Triggering edge description", {
          edgeId,
          serverUrl,
          boundingBox,
          isWeb,
        });
        const response = await fetch("/api/browserdroid/edge-description", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            edgeId,
            beforeImage,
            afterImage,
            boundingBox,
            serverUrl,
            action: {
              summary: actionSummary,
              type: actionType,
              details: actionDetails,
            },
            isWeb,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to generate edge description");
        }

        const result = await response.json();
        if (result?.description) {
          handleEdgeDetailsChange(edgeId, {
            description: result.description,
            paramValues: [],
            business_logic: null,
          });
        }
      } catch (error) {
        console.error("Edge description update failed", error);
      }
    },
    [handleEdgeDetailsChange],
  );

  // Process pending web recorder edge description requests
  useEffect(() => {
    if (pendingWebRecorderEdgeDescriptionsRef.current.length > 0) {
      const pendingRequests = [
        ...pendingWebRecorderEdgeDescriptionsRef.current,
      ];
      pendingWebRecorderEdgeDescriptionsRef.current = [];

      console.log(
        "Processing pending web recorder edge descriptions:",
        pendingRequests.length,
      );
      pendingRequests.forEach((request) => {
        requestEdgeDescription(request);
      });
    }
  }, [edges, requestEdgeDescription]);

  // Handle comment creation
  const handleCommentSave = useCallback(
    (content: string) => {
      if (pendingCommentPosition) {
        const comment = commentManagement.createComment(
          content,
          pendingCommentPosition,
        );

        // Create a comment node
        const newNode = {
          id: `comment-${comment.id}`,
          type: "commentNode",
          position: pendingCommentPosition,
          data: {
            content: comment.content,
            commentId: comment.id,
          },
        };

        setNodes((nodes) => [...nodes, newNode]);
        setPendingCommentPosition(null);
        setMode("select"); // Auto-exit comment mode
      }
    },
    [
      pendingCommentPosition,
      commentManagement.createComment,
      setNodes,
      setMode,
    ],
  );

  // Combined canvas click handler
  const handleCanvasClick = useCallback(
    (event: React.MouseEvent) => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("graphCanvasInteraction"));
      }

      // Handle comment mode first
      if (mode === "addComment") {
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        setPendingCommentPosition(position);
        setCommentDialogOpen(true);
        return;
      }

      // First handle edge deselection
      eventHandlers.onCanvasClick(event);
      // Then handle node creation if in addNode mode
      nodeCreation.onCanvasClick(event);
    },
    [
      mode,
      screenToFlowPosition,
      eventHandlers.onCanvasClick,
      nodeCreation.onCanvasClick,
    ],
  );

  const handleMergeGraph = async () => {
    try {
      setIsMergeGraphInProgress(true);
      const productId = productSwitcher.product_id;

      // Extracting request_id from the flowPath
      // flowPath format: qai-upload-temporary/productId_{product_id}/{request_id}/generated-flow.json
      let requestId = null;

      if (flowPath) {
        // Parse the flowPath string to extract the request_id
        // [0] = qai-upload-temporary
        // [1] = productId_XYZ
        // [2] = request_id
        // [3] = generated-flow.json
        const parts = flowPath.split("/");
        if (parts.length >= 4 && parts[3] === "generated-flow.json") {
          requestId = parts[2];
          console.log("Successfully extracted request_id:", requestId);
        }
      }

      if (!productId || !requestId) {
        toast({
          title: "Error",
          description: `Could not extract necessary IDs: product_id=${productId}, request_id=${requestId}`,
          variant: "destructive",
        });
        setIsMergeGraphInProgress(false);
        return;
      }

      const response = await fetch("/api/merge-generated-graph", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product_id: productId,
          request_id: requestId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to merge graph");
      }

      toast({
        title: "Success",
        description: "Graph merged successfully!",
        variant: "success",
      });

      // Redirect to the editor focussing on the new flow
      if (data.flow_ids && data.flow_ids.length > 0) {
        // Redirect to the flow_id returned
        const flowId = data.flow_ids[0];
        router.push(`/${productId}/editor?flow_id=${flowId}`);
      } else {
        // Fall back to just redirecting to the editor
        router.push(`/${productId}/editor`);
      }
    } catch (error) {
      console.error("Error merging graph:", error);
      Sentry.captureException(error, {
        level: "error",
        tags: { component: "GraphEditor" },
      });
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to merge graph",
        variant: "destructive",
      });
      setIsMergeGraphInProgress(false);
    }
  };

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((prevState) => !prevState);
  }, []);

  const toggleRightSidebar = useCallback(() => {
    setIsRightSidebarCollapsed((prevState) => !prevState);
  }, []);

  const handleStartWebRecording = useCallback(() => {
    if (!productSwitcher.web_url || !productSwitcher.web_url.trim()) {
      toast({
        title: "Web URL not configured",
        description: "Please configure a web URL for this product.",
      });
      return;
    }

    if (!isExtensionConnected) {
      toast({
        title: "Web recorder extension not connected",
        description:
          "Install/enable the QAI Web Recorder extension to capture actions automatically.",
      });
      return;
    }

    const windowWidth = 1024;
    const windowHeight = 576;
    const windowLeft = (window.screen.width - windowWidth) / 2;
    const windowTop = (window.screen.height - windowHeight) / 2;

    window.postMessage(
      {
        type: "QAI_WEB_RECORDER_COMMAND",
        command: "OPEN_RECORDING_WINDOW",
        url: productSwitcher.web_url,
        width: windowWidth,
        height: windowHeight,
        left: windowLeft,
        top: windowTop,
      },
      "*",
    );

    if (!extensionRecording) {
      setTimeout(() => {
        window.postMessage(
          {
            type: "QAI_WEB_RECORDER_COMMAND",
            command: "START_CAPTURING_IF_IDLE",
          },
          "*",
        );
      }, 1000);
    }
  }, [
    productSwitcher.web_url,
    isExtensionConnected,
    extensionRecording,
    toast,
  ]);

  const handleStopWebRecording = useCallback(() => {
    if (!isExtensionConnected) {
      toast({
        title: "Web recorder extension not connected",
        description: "Extension is not connected.",
      });
      return;
    }

    window.postMessage(
      {
        type: "QAI_WEB_RECORDER_COMMAND",
        command: "STOP_CAPTURING",
      },
      "*",
    );
  }, [isExtensionConnected, toast]);

  useEffect(() => {
    const handleOpenVideoUpload = (event: CustomEvent) => {
      const flowName = event.detail?.flowName;
      const featureId = event.detail?.featureId;
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "video/*";
      input.multiple = true;
      input.style.display = "none";

      input.onchange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        const files = target.files;
        if (files && files.length > 0 && onAddFlowsFromVideo) {
          onAddFlowsFromVideo(files, flowName, featureId);
        }
        document.body.removeChild(input);
      };

      document.body.appendChild(input);
      input.click();
    };

    const handleCaptureLiveFlowEvent = (event: Event) => {
      const customEvent = event as CustomEvent;
      const flowName = customEvent.detail?.flowName;
      const featureId = customEvent.detail?.featureId;

      if (flowName) {
        webRecorderFlowNameRef.current = flowName;
      }
      if (featureId) {
        webRecorderFeatureIdRef.current = featureId;
      }

      if (!productSwitcher.product_id) {
        toast({
          title: "Product not selected",
          description: "Please select a product first.",
        });
        return;
      }

      if (isWebProduct(productSwitcher)) {
        handleStartWebRecording();
      } else if (isMobileProduct(productSwitcher)) {
        if (isQaiUser && activeBrowserDroidServer) {
          if (flowName) {
            const safeServerKey = activeBrowserDroidServer || "default";
            const existingSession =
              browserDroidCaptureSessionsRef.current[safeServerKey];
            if (existingSession) {
              browserDroidCaptureSessionsRef.current[safeServerKey] = {
                ...existingSession,
                flowName,
              };
            } else {
              browserDroidFlowNameRef.current = flowName;
            }
          }

          if (showFlowsPanel) {
            setShowBrowserDroidInLeftSidebar(true);
          } else {
            setIsRightSidebarCollapsed((prevState) => {
              if (prevState) {
                return false;
              }
              return prevState;
            });
          }
        } else {
          toast({
            title: "Browserdroid not available",
            description: "Please ensure you have access to Browserdroid.",
          });
        }
      } else {
        toast({
          title: "Product type not supported",
          description: "This product type does not support live flow capture.",
        });
      }
    };

    const handleCaptureTextFlowEvent = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const { content, featureId } = customEvent.detail;

      if (!productSwitcher.product_id) {
        toast({
          title: "Product not selected",
          description: "Please select a product first.",
        });
        return;
      }
      console.log("content", content);
      try {
        const response = await fetch("/api/user-goal-planning-handler", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            product_id: productSwitcher.product_id,
            product_name: productSwitcher.product_name,
            executable_url: productSwitcher.web_url,
            platform: "WEB",
            environment: (productSwitcher as any).environment || "production",
            text_based_goal: content,
            feature_id: featureId,
            mode: "GOAL_BASED_RUN",
          }),
        });

        if (response.ok) {
          toast({
            title: "Success",
            description: "Text flow captured successfully.",
          });
        } else {
          toast({
            title: "Error",
            description: "Failed to capture text flow.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Error calling capture-text-flow API:", error);
        toast({
          title: "Error",
          description: "Failed to capture text flow.",
          variant: "destructive",
        });
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener(
        "graphOpenVideoUpload",
        handleOpenVideoUpload as EventListener,
      );
      window.addEventListener(
        "graphCaptureLiveFlow",
        handleCaptureLiveFlowEvent as EventListener,
      );
      window.addEventListener(
        "graphCaptureTextFlow",
        handleCaptureTextFlowEvent as EventListener,
      );
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(
          "graphOpenVideoUpload",
          handleOpenVideoUpload as EventListener,
        );
        window.removeEventListener(
          "graphCaptureLiveFlow",
          handleCaptureLiveFlowEvent as EventListener,
        );
        window.removeEventListener(
          "graphCaptureTextFlow",
          handleCaptureTextFlowEvent as EventListener,
        );
      }
    };
  }, [
    onAddFlowsFromVideo,
    isQaiUser,
    activeBrowserDroidServer,
    toast,
    productSwitcher,
    showFlowsPanel,
    handleStartWebRecording,
  ]);

  // Listen for flow selection mode changes to adjust container width
  useEffect(() => {
    const handleFlowSelectionUpdate = (event: CustomEvent) => {
      const { isSelectionMode } = event.detail;
      setIsFlowSelectionMode(isSelectionMode);
    };

    const handleCancelTestRunSelection = () => {
      setIsFlowSelectionMode(false);
    };

    if (typeof window !== "undefined") {
      window.addEventListener(
        "graphFlowSelectionUpdate",
        handleFlowSelectionUpdate as EventListener,
      );
      window.addEventListener(
        "graphCancelTestRunSelection",
        handleCancelTestRunSelection as EventListener,
      );
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(
          "graphFlowSelectionUpdate",
          handleFlowSelectionUpdate as EventListener,
        );
        window.removeEventListener(
          "graphCancelTestRunSelection",
          handleCancelTestRunSelection as EventListener,
        );
      }
    };
  }, []);

  // Handle collapsed feature expansion
  useEffect(() => {
    const handleExpandCollapsedFeature = (event: CustomEvent) => {
      const { featureId } = event.detail;
      featureCollapse.toggleFeatureCollapse(featureId);
    };

    window.addEventListener(
      "expandCollapsedFeature",
      handleExpandCollapsedFeature as EventListener,
    );
    return () => {
      window.removeEventListener(
        "expandCollapsedFeature",
        handleExpandCollapsedFeature as EventListener,
      );
    };
  }, [featureCollapse]);

  useEffect(() => {
    const handleTestRunFlowSelect = (event: CustomEvent) => {
      const { flowId } = event.detail;
      if (flowId && flowManagement.flows.some((f) => f.id === flowId)) {
        flowManagement.selectFlow(flowId);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener(
        "testRunFlowSelect",
        handleTestRunFlowSelect as EventListener,
      );
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(
          "testRunFlowSelect",
          handleTestRunFlowSelect as EventListener,
        );
      }
    };
  }, [flowManagement]);

  useEffect(() => {
    const handleTestRunStepNavigate = (event: CustomEvent) => {
      const { sourceNodeId, targetNodeId } = event.detail;
      if (sourceNodeId && targetNodeId) {
        handleFlowStepClick(sourceNodeId, targetNodeId);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener(
        "testRunStepNavigate",
        handleTestRunStepNavigate as EventListener,
      );
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(
          "testRunStepNavigate",
          handleTestRunStepNavigate as EventListener,
        );
      }
    };
  }, [handleFlowStepClick]);

  useEffect(() => {
    const handleFlowHover = (event: CustomEvent) => {
      const { flowId } = event.detail;
      setHoveredFlowId(flowId || null);
    };

    if (typeof window !== "undefined") {
      window.addEventListener(
        "graphFlowHover",
        handleFlowHover as EventListener,
      );
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(
          "graphFlowHover",
          handleFlowHover as EventListener,
        );
      }
    };
  }, []);

  // Memoize selected node IDs to avoid recomputing during position updates
  const selectedNodeIds = useMemo(
    () => nodes.filter((node) => node.selected).map((node) => node.id),
    [nodes.map((node) => `${node.id}-${node.selected}`).join(",")],
  );

  // When a feature is selected in the New UI, fit the camera to show the whole feature.
  const { fitBounds } = useReactFlow();

  const previousSelectedFeatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!showFlowsPanel) return;

    // Don't auto-pan camera if user is navigating through flow steps
    if (isStepNavigatingRef.current) return;

    if (nodeEditing.editingNode) return;
    if (edgeEditing.editingEdge) return;
    if (edgeEditing.inlineEditingEdges.size > 0) return;

    const isBrowserDroidCapturing = Object.values(
      browserDroidCaptureSessionsRef.current,
    ).some((session) => session && session.nodeIds.length > 0);
    if (isBrowserDroidCapturing) return;

    const featureChanged =
      previousSelectedFeatureRef.current !== selectedFeatureId;
    previousSelectedFeatureRef.current = selectedFeatureId;

    if (!featureChanged && selectedFeatureId !== "") return;

    if (selectedFeatureId === "") {
      if (nodes.length === 0) return;

      const allNodesBounds = getNodesBounds(nodes);
      requestAnimationFrame(() => {
        fitBounds(allNodesBounds, {
          padding: 0.35,
          duration: 800,
          minZoom: 0.35,
          maxZoom: 1.4,
        });
      });
      return;
    }

    if (!selectedFeatureId) return;

    const feature = featureManagement.features.find(
      (f) => f.id === selectedFeatureId,
    );
    if (!Array.isArray(feature?.nodeIds) || feature.nodeIds.length === 0)
      return;

    const featureNodes = feature.nodeIds
      .map((id) => nodes.find((n) => n.id === id))
      .filter(Boolean) as Node[];

    if (featureNodes.length === 0) return;

    const bounds = getNodesBounds(featureNodes);

    requestAnimationFrame(() => {
      fitBounds(bounds, {
        padding: 0.35, // important for narrow canvas
        duration: 800,
        minZoom: 0.35, // allowing zooming out enough
        maxZoom: 1.4,
      });
    });
  }, [
    selectedFeatureId,
    showFlowsPanel,
    nodeEditing.editingNode,
    edgeEditing.editingEdge,
    edgeEditing.inlineEditingEdges,
    fitBounds,
    nodeEditing.editingNode,
    edgeEditing.editingEdge,
    edgeEditing.inlineEditingEdges,
  ]);

  // Auto-expand collapsed features when nodes are selected
  useEffect(() => {
    // Don't auto-expand if we're in the middle of collapsing or no nodes selected
    if (featureCollapse.isCollapsing() || selectedNodeIds.length === 0) {
      return;
    }

    selectedNodeIds.forEach((nodeId) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node && (node.data as any)?.isCollapsed) {
        const feature = featureManagement.features.find((f) =>
          f.nodeIds.includes(nodeId),
        );
        if (feature && (feature as any).isCollapsed) {
          console.log(
            "Auto-expanding feature:",
            feature.id,
            "due to selected node:",
            node.id,
          );
          featureCollapse.toggleFeatureCollapse(feature.id);
        }
      }
    });
  }, [selectedNodeIds, featureManagement.features, featureCollapse, nodes]);

  // Accepts optional request_id and passes it to all fileOps export functions
  const handleSaveGraph = async (request_id?: string) => {
    await setIsSaveInProgress(true);
    await fileOps.exportGraphAutomatically(request_id);
    await fileOps.exportFlowsAutomatically(request_id);
    if (request_id && request_id != "FLOW_TO_VIDEO") {
      await fileOps.exportFeaturesAutomatically(request_id);
      await fileOps.exportCommentsAutomatically(request_id);
    }
    await setIsSaveInProgress(false);
  };

  const handleTestCasePlanning = async (
    isForcePlanning: boolean = false,
    specificFlowsToPlan: string[] | null = null,
  ) => {
    await setIsTestCasePlanningInProgress(true);
    try {
      await handleSaveGraph("tempExport");
      const response = await fetch("/api/request-kg-test-case-planning", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product_id: productSwitcher.product_id,
          is_force_planning: isForcePlanning ? "true" : "false",
          specific_flows_to_plan: specificFlowsToPlan,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || "Failed to trigger test case creation",
        );
      }
      const result = await response.json();
      let successMessage = "Test case planning request sent successfully.";
      if (result.flows_planned && result.flows_planned > 0) {
        if (result.flows_planned === 5000) {
          successMessage += `All ${flowManagement.flows.length} flows will be planned.`;
        } else {
          successMessage += ` ${result.flows_planned} flows will be planned.`;
        }
      }
      if (result.deleted_flows && result.deleted_flows > 0) {
        successMessage += ` ${result.deleted_flows} obsolete flows will be deleted.`;
      }
      await handleSaveGraph(result.request_id);
      toast({
        title: successMessage,
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Error triggering test case request",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      await setIsTestCasePlanningInProgress(false);
    }
  };

  // Register handler for flows_create collaboration events
  useEffect(() => {
    // Defensive: only register if addFlow exists
    if (flowManagement && typeof flowManagement.addFlow === "function") {
      // Register the handler
      ConsoleCollaborationEvents.setFlowsCreateHandler((flows) => {
        const safeFlows = Array.isArray(flows) ? flows : [];

        safeFlows.forEach((flow) => flowManagement.addFlow(flow, false, false)); // autoSelect: false

        const flowsByFeature: Record<string, string[]> = {};

        for (const flow of safeFlows) {
          const featureId =
            flow.feature_id ||
            (selectedFeatureId && flow.startNodeId ? selectedFeatureId : null);

          if (featureId) {
            if (!flowsByFeature[featureId]) {
              flowsByFeature[featureId] = [];
            }

            const pathNodeIds = Array.isArray(flow.pathNodeIds)
              ? flow.pathNodeIds
              : [];
            flowsByFeature[featureId].push(...pathNodeIds);
          }
        }

        // Update features
        Object.entries(flowsByFeature).forEach(([featureId, nodeIds]) => {
          const feature = featureManagement.features.find(
            (f) => f.id === featureId,
          );
          if (!feature) return;

          const existingNodeIds = new Set(feature.nodeIds || []);
          const nodeIdsToAdd: string[] = [];

          for (const nodeId of nodeIds) {
            if (!nodeId || existingNodeIds.has(nodeId)) continue;

            const owner = featureManagement.getNodeFeature?.(nodeId);
            if (owner && owner.id !== featureId) continue;

            existingNodeIds.add(nodeId);
            nodeIdsToAdd.push(nodeId);
          }

          if (nodeIdsToAdd.length > 0) {
            const newNodeIds = Array.from(existingNodeIds);
            featureManagement.updateFeature(featureId, { nodeIds: newNodeIds });

            if (collaborationEvents) {
              collaborationEvents.updateFeatures?.([
                {
                  featureId: featureId,
                  updates: {
                    nodeIds: {
                      old: feature.nodeIds,
                      new: newNodeIds,
                    },
                  },
                },
              ]);
            }
          }
        });
      });
    }
    // Optional: cleanup handler on unmount
    return () => {
      ConsoleCollaborationEvents.setFlowsCreateHandler(() => {});
    };
  }, [
    flowManagement,
    selectedFeatureId,
    featureManagement.features,
    featureManagement.getNodeFeature,
    featureManagement.updateFeature,
    collaborationEvents,
  ]);

  // Register handler for flows_delete collaboration events
  useEffect(() => {
    if (flowManagement && typeof flowManagement.deleteFlows === "function") {
      ConsoleCollaborationEvents.setFlowsDeleteHandler((flows) => {
        const flowIds = flows.map((flow) => flow.id);
        flowManagement.deleteFlows(flowIds, false, false);
      });
    }
    return () => {
      ConsoleCollaborationEvents.setFlowsDeleteHandler(() => {});
    };
  }, [flowManagement]);

  useEffect(() => {
    if (flowManagement && typeof flowManagement.setFlows === "function") {
      ConsoleCollaborationEvents.setFlowsUpdateHandler((flows) => {
        // Replace the local flows state with the updated flows array
        flowManagement.setFlows(flows);
      });
    }
    return () => {
      ConsoleCollaborationEvents.setFlowsUpdateHandler(() => {});
    };
  }, [flowManagement]);

  // Register handler for credential_add collaboration events
  useEffect(() => {
    ConsoleCollaborationEvents.setCredentialAddHandler((credential) => {
      console.log(
        "📨 [GraphEditor] Received credential from collaboration:",
        credential,
      );

      // Dispatch to Redux store to add the credential
      dispatch(addCredentialFromCollaboration(credential));
    });
    return () => {
      ConsoleCollaborationEvents.setCredentialAddHandler(() => {});
    };
  }, [dispatch]);

  // Listen for messages from the iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "BROWSERDROID_ACTION") {
        const actionPayload = event.data.payload;
        const serverKey =
          actionPayload?.server || activeBrowserDroidServer || "default";
        if (actionPayload) {
          browserDroidActionsRef.current[serverKey] = actionPayload;
        }
        return;
      }

      if (event.data && event.data.type === "SCREENSHOT_CAPTURED") {
        console.log("Received screenshot from iframe");

        const frameImage = event.data.payload.image;
        const nodeId = generateNodeId();
        const serverKey =
          event.data.payload?.server || activeBrowserDroidServer || "default";
        const previousScreenshot =
          browserDroidScreensRef.current[serverKey] || null;
        const pendingAction = browserDroidActionsRef.current[serverKey];
        const screenshotResolution =
          event.data.payload?.deviceResolution ||
          previousScreenshot?.resolution ||
          null;

        // Calculate position logic similar to FlowDetailsPanel
        let positionX = 200;
        let positionY = 200;

        const nodeSpacing = isWebProduct(productSwitcher) ? 350 : 250;

        const featureLastNodePos =
          getLastNodePositionInFeature(selectedFeatureId);

        if (featureLastNodePos) {
          const safeServerKey = serverKey || "default";
          const prevSession =
            browserDroidCaptureSessionsRef.current[safeServerKey] || null;

          if (prevSession && prevSession.nodeIds.length > 0) {
            const lastNodeId =
              prevSession.nodeIds[prevSession.nodeIds.length - 1];
            const lastNode = nodes.find((n) => n.id === lastNodeId);
            if (lastNode) {
              positionX = lastNode.position.x + 450;
              positionY = lastNode.position.y;
            } else {
              positionX = featureLastNodePos.x;
              positionY = featureLastNodePos.y + 200;
            }
          } else {
            positionX = featureLastNodePos.x;
            positionY = featureLastNodePos.y + 200;
          }
        } else {
          const currentFlow = flowManagement.flows.find(
            (f) => f.id === flowManagement.selectedFlowId,
          );

          if (currentFlow) {
            const flowPathNodes = Array.isArray(currentFlow.pathNodeIds)
              ? (currentFlow.pathNodeIds
                  .map((nid) => nodes.find((n) => n.id === nid))
                  .filter(Boolean) as Node[])
              : [];

            if (flowPathNodes.length > 0) {
              const lastFlowNode = flowPathNodes[flowPathNodes.length - 1];
              if (lastFlowNode) {
                let baseX = lastFlowNode.position.x;
                let baseY = lastFlowNode.position.y;

                const nodesOnRight = nodes.filter(
                  (node) =>
                    node.position.x > baseX &&
                    Math.abs(node.position.y - baseY) < 50,
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
          } else if (nodes.length > 0) {
            // Fallback if no flow selected
            const maxX = Math.max(...nodes.map((n) => n.position.x));
            const maxY = Math.max(...nodes.map((n) => n.position.y));
            positionX = maxX + nodeSpacing;
            positionY = Math.max(100, maxY - 100);
          }
        }

        // Use collision detection to find a non-overlapping position
        const defaultNodeWidth = isWebProduct(productSwitcher) ? 350 : 250;
        const defaultNodeHeight = 300;
        const preferredPosition = { x: positionX, y: positionY };

        const adjustedPosition = findNonOverlappingPosition(
          preferredPosition,
          defaultNodeWidth,
          defaultNodeHeight,
          nodes,
          {
            margin: 20,
            spacing: 50,
          },
        );

        const newNode: Node = {
          id: nodeId,
          type: "customNode",
          position: adjustedPosition,
          data: {
            image: frameImage,
            description: "Screenshot",
          },
          deletable: true,
        };

        // Use nodeManagement to add the node (handles collaboration)
        nodeManagement.addNewNodes([newNode]);

        // Trigger auto-title
        try {
          const handleNodeUpdate = (
            nid: string,
            title: string,
            description: string,
          ) => {
            nodeManagement.updateNodeDescription(nid, title);
            toast({
              title: "Node title generated!",
              description: `"${title}"`,
              duration: 3000,
            });
          };

          const manager = getNodeAutoTitleManager(handleNodeUpdate);
          manager.generateTitleForNode(nodeId, frameImage);
        } catch (error) {
          console.warn("Could not trigger auto-title:", error);
        }

        const summary = pendingAction
          ? formatActionSummary(pendingAction)
          : null;

        if (
          summary &&
          previousScreenshot?.nodeId &&
          previousScreenshot?.image &&
          pendingAction
        ) {
          const boundingBox = computeBoundingBox(
            pendingAction,
            previousScreenshot.resolution || screenshotResolution,
          );
          console.log("BrowserDroid edge context", {
            summary,
            serverKey,
            boundingBox,
            previousScreenshot,
          });
          const previousNode = nodes.find(
            (node) => node.id === previousScreenshot.nodeId,
          );
          const newEdgeId = createAutomaticEdge({
            sourceNode: previousNode,
            targetNode: newNode,
            description: summary,
          });

          if (newEdgeId && boundingBox && serverKey) {
            requestEdgeDescription({
              edgeId: newEdgeId,
              beforeImage: previousScreenshot.image,
              afterImage: frameImage,
              boundingBox,
              serverUrl: serverKey,
              actionSummary: summary,
              actionType: pendingAction.actionType,
              actionDetails: pendingAction.details,
              isWeb: false,
            });
          }

          browserDroidActionsRef.current[serverKey] = null;
        } else if (pendingAction) {
          browserDroidActionsRef.current[serverKey] = null;
        }

        browserDroidScreensRef.current[serverKey] = {
          nodeId,
          image: frameImage,
          resolution: screenshotResolution,
          timestamp: event.data.payload?.timestamp || Date.now(),
        };

        if (showFlowsPanel) {
          const now = Number(event.data.payload?.timestamp || Date.now());
          const safeServerKey = serverKey || "default";
          const prevSession =
            browserDroidCaptureSessionsRef.current[safeServerKey] || null;

          const shouldStartNewSession =
            !prevSession ||
            prevSession.featureId !== (selectedFeatureId || null) ||
            now - (prevSession.lastTimestamp || 0) > 60_000;

          const flowId = shouldStartNewSession
            ? typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `browserdroid_${now}`
            : prevSession.flowId;

          const sessionNodeIds = shouldStartNewSession
            ? [nodeId]
            : [...prevSession.nodeIds, nodeId];

          const flowName =
            event.data.payload?.flowName ||
            prevSession?.flowName ||
            (shouldStartNewSession ? browserDroidFlowNameRef.current : null);

          if (shouldStartNewSession && browserDroidFlowNameRef.current) {
            browserDroidFlowNameRef.current = null;
          }

          browserDroidCaptureSessionsRef.current[safeServerKey] = {
            flowId,
            nodeIds: sessionNodeIds,
            lastTimestamp: now,
            featureId: selectedFeatureId || null,
            ...(flowName ? { flowName } : {}),
          };

          if (showBrowserDroidInLeftSidebar) {
            setBrowserDroidLeftCaptureCount(sessionNodeIds.length);
          }
        }

        toast({
          title: "Screenshot Captured",
          description: summary
            ? `New node created from screenshot (${summary})`
            : "New node created from screenshot",
          variant: "success",
        });
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [
    nodes,
    flowManagement.flows,
    flowManagement.selectedFlowId,
    nodeManagement,
    toast,
    activeBrowserDroidServer,
    createAutomaticEdge,
    formatActionSummary,
    computeBoundingBox,
    requestEdgeDescription,
    selectedFeatureId,
    showBrowserDroidInLeftSidebar,
    showFlowsPanel,
    getLastNodePositionInFeature,
  ]);

  const flushBrowserDroidCaptures = useCallback(() => {
    if (!showFlowsPanel) return;

    const sessions = browserDroidCaptureSessionsRef.current || {};
    const entries = Object.entries(sessions);
    if (entries.length === 0) return;

    for (const [, session] of entries) {
      const nodeIds = Array.isArray(session?.nodeIds) ? session.nodeIds : [];
      const featureId = session?.featureId || null;
      const flowId = session?.flowId || null;

      if (!flowId || !featureId || nodeIds.length < 2) continue;

      const startNodeId = nodeIds[0];
      const endNodeId = nodeIds[nodeIds.length - 1];
      const viaNodeIds = nodeIds.length > 2 ? nodeIds.slice(1, -1) : [];

      const browserDroidFlow: Flow = {
        id: flowId,
        name: session.flowName || "BrowserDroid Flow",
        startNodeId,
        endNodeId,
        viaNodeIds,
        pathNodeIds: nodeIds,
        precondition: "",
        autoPlan: false,
        feature_id: featureId || undefined,
      };

      const exists = flowManagement.flows.some((f) => f.id === flowId);
      if (!exists) {
        flowManagement.addFlow(browserDroidFlow, true, false);
        collaborationEvents?.createFlows?.([browserDroidFlow], "USER_ID");
      } else {
        const updatedFlows = flowManagement.flows.map((f) =>
          f.id === flowId ? { ...f, ...browserDroidFlow } : f,
        );

        if (typeof (flowManagement as any).reorderFlows === "function") {
          (flowManagement as any).reorderFlows(updatedFlows);
        } else if (typeof (flowManagement as any).setFlows === "function") {
          (flowManagement as any).setFlows(updatedFlows);
        }

        collaborationEvents?.updateFlows?.(updatedFlows);
      }

      const feature = featureManagement.features.find(
        (f) => f.id === featureId,
      );
      if (!feature) continue;

      const existingNodeIds = new Set<string>(
        Array.isArray(feature.nodeIds) ? feature.nodeIds : [],
      );

      let didChange = false;
      for (const nid of nodeIds) {
        if (!nid || existingNodeIds.has(nid)) continue;

        const owner = featureManagement.getNodeFeature?.(nid);
        if (owner && owner.id !== featureId) continue;

        existingNodeIds.add(nid);
        didChange = true;
      }

      if (!didChange) continue;

      const newNodeIds = Array.from(existingNodeIds);
      featureManagement.updateFeature(featureId, { nodeIds: newNodeIds });

      if (showFlowsPanel) {
        if (productSwitcher?.product_id) {
          updateFeatureViaApi(
            featureId,
            { nodeIds: newNodeIds, name: feature.name },
            productSwitcher.product_id,
          ).catch((error) => {
            console.error(
              `Failed to update feature ${featureId} via API:`,
              error,
            );
          });
        }
      } else {
        collaborationEvents?.updateFeatures?.([
          {
            featureId,
            updates: {
              nodeIds: { old: feature.nodeIds, new: newNodeIds },
            },
          },
        ]);
      }
    }

    browserDroidCaptureSessionsRef.current = {};
  }, [
    showFlowsPanel,
    collaborationEvents,
    flowManagement,
    flowManagement.flows,
    featureManagement.features,
    featureManagement.getNodeFeature,
    featureManagement.updateFeature,
  ]);

  const prevBrowserDroidLeftOpenRef = useRef(showBrowserDroidInLeftSidebar);
  useEffect(() => {
    const wasOpen = prevBrowserDroidLeftOpenRef.current;
    const isOpen = showBrowserDroidInLeftSidebar;
    prevBrowserDroidLeftOpenRef.current = isOpen;

    if (wasOpen && !isOpen) {
      const shouldFlush = shouldFlushBrowserDroidOnCloseRef.current;
      shouldFlushBrowserDroidOnCloseRef.current = false;

      if (shouldFlush) {
        flushBrowserDroidCaptures();
      } else {
        browserDroidCaptureSessionsRef.current = {};

        browserDroidActionsRef.current = {};
        browserDroidScreensRef.current = {};
      }

      setBrowserDroidLeftCaptureCount(0);
    }
  }, [showBrowserDroidInLeftSidebar, flushBrowserDroidCaptures]);

  useEffect(() => {
    const isLoading =
      !productSwitcher.product_id || !isRoomReady || isAutoImportInProgress;
    setIsLoading(isLoading);
  }, [
    productSwitcher.product_id,
    isRoomReady,
    isAutoImportInProgress,
    setIsLoading,
  ]);

  const { testRunUnderExecution, selectedTcueId } = useSelector(
    (state: RootState) => state.testRunsUnderExecution,
  );

  // --- Linearize Flow View Logic ---
  const { displayNodes, displayEdges, isLinearView } = useMemo(() => {
    // Priority 1: Use Selected Feature (ALWAYS linearized, regardless of mode)
    if (
      selectedFeatureId &&
      !flowManagement.selectedFlowId &&
      !selectedTcueId
    ) {
      const selectedFeature = featureManagement.features.find(
        (f) => f.id === selectedFeatureId,
      );

      if (selectedFeature && selectedFeature.nodeIds.length > 0) {
        const featureFlows = flowManagement.flows.filter(
          (flow) => flow.feature_id === selectedFeatureId,
        );

        let orderedNodeIds: string[] = [];
        const nodePositions = new Map<string, { x: number; y: number }>();

        if (featureFlows.length > 0) {
          const NODE_SPACING = 400;
          const FLOW_SPACING = 450;

          featureFlows.forEach((flow, flowIndex) => {
            const flowNodeIds =
              flow.pathNodeIds && flow.pathNodeIds.length > 0
                ? flow.pathNodeIds
                : [
                    flow.startNodeId,
                    ...(flow.viaNodeIds || []),
                    flow.endNodeId,
                  ].filter(Boolean);

            flowNodeIds.forEach((nodeId, nodeIndex) => {
              if (nodePositions.has(nodeId)) {
                return;
              }

              nodePositions.set(nodeId, {
                x: nodeIndex * NODE_SPACING,
                y: flowIndex * FLOW_SPACING,
              });
              orderedNodeIds.push(nodeId);
            });
          });
        } else {
          const featureNodes = selectedFeature.nodeIds
            .map((id) => nodes.find((n) => n.id === id))
            .filter((n): n is Node => !!n)
            .sort((a, b) => a.position.x - b.position.x);

          orderedNodeIds = featureNodes.map((n) => n.id);
        }

        if (orderedNodeIds.length > 0) {
          const featureNodes = orderedNodeIds
            .map((id) => nodes.find((n) => n.id === id))
            .filter((n): n is Node => !!n);

          if (featureNodes.length > 0) {
            const SPACING = 400;
            const linearNodes = featureNodes.map((node, index) => {
              const positioned = nodePositions.get(node.id);
              const position = positioned || { x: index * SPACING, y: 0 };

              return {
                ...node,
                type: "customNode",
                position,
                draggable: true,
                selectable: true,
                data: {
                  ...node.data,
                  isLinearView: true,
                  isReadOnly: false,
                },
              };
            });

            const nodeIdsSet = new Set(featureNodes.map((n) => n.id));
            const linearEdges = edges
              .filter(
                (e) => nodeIdsSet.has(e.source) && nodeIdsSet.has(e.target),
              )
              .map((e) => ({
                ...e,
                type: "customEdge",
                sourceHandle: "right-source",
                targetHandle: "left-target",
                data: {
                  ...e.data,
                  description: e.data?.description || e.label,
                  isLinearView: true,
                },
              }));

            return {
              displayNodes: linearNodes,
              displayEdges: linearEdges,
              isLinearView: true,
            };
          }
        }
      }
    }

    if (!enableLinearFlowView) {
      return { displayNodes: nodes, displayEdges: edges, isLinearView: false };
    }

    // Priority 2: Use Selected TCUE Metadata
    if (selectedTcueId) {
      const tcue = testRunUnderExecution.find((t) => t.id === selectedTcueId);
      if (tcue?.metadata) {
        try {
          const meta =
            typeof tcue.metadata === "string"
              ? JSON.parse(tcue.metadata)
              : tcue.metadata;
          const graph = meta?.tc_graph_json;

          if (graph?.nodes && Array.isArray(graph.nodes)) {
            const rawNodes = graph.nodes;
            const rawEdges = graph.edges || [];

            const SPACING = 400; // px
            const linearNodes = rawNodes.map((node: any, index: number) => {
              const existingNode = nodes.find(
                (n) => String(n.id) === String(node.id),
              );

              const nodeDataUrl =
                node.data?.image ||
                node.data?.frame_url ||
                node.data?.screenshot_url;
              const existingNodeImage =
                existingNode?.data?.image ||
                existingNode?.data?.frame_url ||
                existingNode?.data?.screenshot_url;

              const finalImage = existingNodeImage || nodeDataUrl;

              return {
                ...node,
                type: "customNode",
                position: { x: index * SPACING, y: 0 },
                draggable: false,
                selectable: false,
                data: {
                  ...node.data,
                  image: finalImage,
                  isLinearView: true,
                  isReadOnly: true,
                },
              };
            });

            const nodeIdsSet = new Set(rawNodes.map((n: any) => n.id));
            const linearEdges = rawEdges
              .filter(
                (e: any) =>
                  nodeIdsSet.has(e.source) && nodeIdsSet.has(e.target),
              )
              .map((e: any) => ({
                ...e,
                type: "default",
                sourceHandle: "right-source",
                targetHandle: "left-target",
                label: e.data?.description || e.label,
              }));

            return {
              displayNodes: linearNodes as Node[],
              displayEdges: linearEdges as Edge[],
              isLinearView: true,
            };
          }
        } catch (e) {
          console.error("Failed to parse TCUE metadata for linear view:", e);
        }
      }
    }

    // Priority 3: Use Selected Flow from FlowManagement
    if (!flowManagement.selectedFlowId || !flowManagement.flows) {
      return { displayNodes: nodes, displayEdges: edges, isLinearView: false };
    }

    const selectedFlow = flowManagement.flows.find(
      (f) => f.id === flowManagement.selectedFlowId,
    );
    if (!selectedFlow) {
      return { displayNodes: nodes, displayEdges: edges, isLinearView: false };
    }

    // Determine sequence
    let orderedNodeIds: string[] = [];
    if (selectedFlow.pathNodeIds && selectedFlow.pathNodeIds.length > 0) {
      orderedNodeIds = selectedFlow.pathNodeIds;
    } else {
      // Fallback
      orderedNodeIds = [
        selectedFlow.startNodeId,
        ...(selectedFlow.viaNodeIds || []),
        selectedFlow.endNodeId,
      ].filter(Boolean) as string[];
    }

    // Ensure uniqueness
    orderedNodeIds = Array.from(new Set(orderedNodeIds));

    if (orderedNodeIds.length === 0) {
      return { displayNodes: nodes, displayEdges: edges, isLinearView: false };
    }

    const flowNodes = orderedNodeIds
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n): n is Node => !!n);

    if (flowNodes.length === 0) {
      return { displayNodes: nodes, displayEdges: edges, isLinearView: false };
    }

    const SPACING = 400; // px
    const linearNodes = flowNodes.map((node, index) => ({
      ...node,
      type: "customNode",
      position: { x: index * SPACING, y: 0 },
      draggable: false, // Prevent moving nodes in this view
      selectable: false,
      data: {
        ...node.data,
        isLinearView: true,
        isReadOnly: false,
      },
    }));

    const nodeIdsSet = new Set(flowNodes.map((n) => n.id));
    // Showing only internal edges helps visualization
    const linearEdges = edges
      .filter((e) => nodeIdsSet.has(e.source) && nodeIdsSet.has(e.target))
      .map((e) => ({
        ...e,
        type: "customEdge",
        sourceHandle: "right-source",
        targetHandle: "left-target",
        data: {
          ...e.data,
          description: e.data?.description || e.label,
          isLinearView: true,
        },
      }));

    return {
      displayNodes: linearNodes,
      displayEdges: linearEdges,
      isLinearView: true,
    };
  }, [
    nodes,
    edges,
    flowManagement.selectedFlowId,
    flowManagement.flows,
    enableLinearFlowView,
    selectedTcueId,
    testRunUnderExecution,
    selectedFeatureId,
    featureManagement.features,
  ]);

  useEffect(() => {
    if (isLinearView) {
      const timer = setTimeout(() => {
        const isFeatureLinearView =
          selectedFeatureId &&
          !flowManagement.selectedFlowId &&
          !selectedTcueId;

        if (isFeatureLinearView && displayNodes && displayNodes.length > 0) {
          fitView({
            nodes: displayNodes.map((node) => ({ id: node.id })),
            padding: 0.2,
            duration: 500,
          });
        } else if (displayNodes && displayNodes.length >= 2) {
          fitView({
            nodes: [{ id: displayNodes[0].id }, { id: displayNodes[1].id }],
            padding: 0.2,
            duration: 500,
          });
        } else {
          fitView({ padding: 0.2, duration: 500 });
        }
      }, 50);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isLinearView,
    fitView,
    flowManagement.selectedFlowId,
    selectedFeatureId,
    selectedTcueId,
  ]);

  const preSelectionViewport = useRef<any>(null);
  const previousTcueIdRef = useRef<string | null>(null);
  const previousFlowIdRef = useRef<string | null>(null);
  const previousFeatureIdRef = useRef<string | null>(null);
  const previousEnableLinearFlowViewRef = useRef(enableLinearFlowView);

  useEffect(() => {
    // --- TCUE Logic ---
    // Transition: Null -> Value (Selection)
    if (
      previousTcueIdRef.current === null &&
      selectedTcueId !== null &&
      enableLinearFlowView
    ) {
      if (!preSelectionViewport.current) {
        preSelectionViewport.current = getViewport();
      }
    }

    // Transition: Value -> Null (Deselection)
    if (
      previousTcueIdRef.current !== null &&
      selectedTcueId === null &&
      enableLinearFlowView
    ) {
      if (preSelectionViewport.current) {
        setViewport(preSelectionViewport.current, { duration: 800 });
        preSelectionViewport.current = null;
      } else {
        fitView({ duration: 800, padding: 0.2 });
      }
    }
    previousTcueIdRef.current = selectedTcueId;

    // --- Flow Logic ---
    // Transition: Null -> Value (Map Selection)
    if (
      previousFlowIdRef.current === null &&
      flowManagement.selectedFlowId !== null &&
      enableLinearFlowView
    ) {
      if (!preSelectionViewport.current) {
        preSelectionViewport.current = getViewport();
      }
    }

    // Transition: Value -> Null (Map Deselection)
    if (
      previousFlowIdRef.current !== null &&
      flowManagement.selectedFlowId === null &&
      enableLinearFlowView
    ) {
      if (preSelectionViewport.current) {
        setViewport(preSelectionViewport.current, { duration: 800 });
        preSelectionViewport.current = null;
      } else {
        fitView({ duration: 800, padding: 0.2 });
      }
    }
    previousFlowIdRef.current = flowManagement.selectedFlowId;

    // --- Feature Logic (ALWAYS active, regardless of linear mode flag) ---
    // Transition: Null -> Value (Feature Selection)
    if (
      previousFeatureIdRef.current === null &&
      selectedFeatureId !== null &&
      flowManagement.selectedFlowId === null &&
      selectedTcueId === null
    ) {
      if (!preSelectionViewport.current) {
        preSelectionViewport.current = getViewport();
      }
    }

    // Transition: Value -> Null (Feature Deselection)
    if (
      previousFeatureIdRef.current !== null &&
      selectedFeatureId === null &&
      flowManagement.selectedFlowId === null &&
      selectedTcueId === null
    ) {
      if (preSelectionViewport.current) {
        setViewport(preSelectionViewport.current, { duration: 800 });
        preSelectionViewport.current = null;
      } else {
        fitView({ duration: 800, padding: 0.2 });
      }
    }
    previousFeatureIdRef.current = selectedFeatureId;

    // --- Toggle Logic (Linear <-> Graph) ---
    // Transition: Graph -> Linear (with active TCUE or Flow selection)
    // Note: Features are always linear, so they don't participate in toggle logic
    if (
      !previousEnableLinearFlowViewRef.current &&
      enableLinearFlowView &&
      (flowManagement.selectedFlowId !== null || selectedTcueId !== null)
    ) {
      if (!preSelectionViewport.current) {
        preSelectionViewport.current = getViewport();
      }
    }

    // Transition: Linear -> Graph (with active TCUE or Flow selection)
    // Note: Features are always linear, so they don't participate in toggle logic
    if (
      previousEnableLinearFlowViewRef.current &&
      !enableLinearFlowView &&
      (flowManagement.selectedFlowId !== null || selectedTcueId !== null)
    ) {
      if (preSelectionViewport.current) {
        setViewport(preSelectionViewport.current, { duration: 800 });
        preSelectionViewport.current = null;
      } else {
        fitView({ duration: 800, padding: 0.2 });
      }
    }
    previousEnableLinearFlowViewRef.current = enableLinearFlowView;
  }, [
    enableLinearFlowView,
    selectedTcueId,
    flowManagement.selectedFlowId,
    selectedFeatureId,
    getViewport,
    setViewport,
    fitView,
  ]);

  // Listen for data updates from Linear View components to prevent position pollution
  useEffect(() => {
    const handleNodeDataUpdate = (e: CustomEvent) => {
      const { nodeId, data } = e.detail;
      setNodes((currentNodes) =>
        currentNodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n,
        ),
      );
    };

    const handleEdgeDataUpdate = (e: CustomEvent) => {
      const { edgeId, data } = e.detail;
      setEdges((currentEdges) =>
        currentEdges.map((ed) =>
          ed.id === edgeId ? { ...ed, data: { ...ed.data, ...data } } : ed,
        ),
      );
    };

    window.addEventListener("nodeDataUpdate" as any, handleNodeDataUpdate);
    window.addEventListener("edgeDataUpdate" as any, handleEdgeDataUpdate);

    return () => {
      window.removeEventListener("nodeDataUpdate" as any, handleNodeDataUpdate);
      window.removeEventListener("edgeDataUpdate" as any, handleEdgeDataUpdate);
    };
  }, [setNodes, setEdges]);
  const safeOnNodesChange = useCallback(
    (changes: any) => {
      if (isLinearView) {
        // Filter out position/dimensions changes to prevent saving/syncing linear positions
        const safe = changes.filter(
          (c: any) => c.type !== "position" && c.type !== "dimensions",
        );
        if (safe.length > 0) onNodesChange(safe);
        return;
      }
      onNodesChange(changes);
    },
    [isLinearView, onNodesChange],
  );
  // --- End Linearize Flow View Logic ---

  if (!productSwitcher.product_id || !isRoomReady || isAutoImportInProgress) {
    return (
      <ProductLoadingScreen
        message={
          !productSwitcher.product_id
            ? "Please wait while we load graph editor for you"
            : !isRoomReady
              ? "Connecting to collaboration room..."
              : "Loading graph data..."
        }
      />
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Welcome Modal for new users */}
      <WelcomeVideoUploadModal
        isOpen={showWelcomeModal}
        onClose={() => setShowWelcomeModal(false)}
        onAddFlowsFromVideo={onAddFlowsFromVideo}
      />
      {showFlowsPanel && (
        <div
          className={cn(
            "bg-background border-r border-border h-full flex flex-col overflow-hidden",
            isFlowSelectionMode ? "w-1/2" : "w-1/3",
          )}
        >
          {mode === "planFlow" ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <PlanFlowManager
                planFlowState={planFlowState}
                nodes={nodes}
                edges={edges}
                flows={flowManagement.flows}
                onStateChange={(update) =>
                  setPlanFlowState((prev) => ({ ...prev, ...update }))
                }
                onCancel={() => {
                  setMode("select");
                  setPlanFlowState((prev) => ({
                    ...prev,
                    step: "start",
                    startNode: null,
                    currentPathNodes: [],
                  }));
                }}
                onReset={() => {
                  setPlanFlowState((prev) => ({
                    ...prev,
                    step: "start",
                    startNode: null,
                    currentPathNodes: [],
                  }));
                }}
                onCreateFlow={createPlanFlow}
                onFlashUncovered={handleFlashUncovered}
                onAiFlowPlanning={aiFlowPlanning.executePlanning}
                isAiPlanning={aiFlowPlanning.isPlanning}
              />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0">
              {isMobileProduct(productSwitcher) &&
              isQaiUser &&
              activeBrowserDroidServer &&
              showBrowserDroidInLeftSidebar ? (
                <div className="h-full flex flex-col">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
                    <div className="text-sm font-medium text-foreground">
                      Untitled Flow
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        shouldFlushBrowserDroidOnCloseRef.current = false;
                        setShowBrowserDroidInLeftSidebar(false);
                      }}
                      className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      title="Close"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex-1 flex items-center justify-center p-6 bg-muted/10">
                    <div className="w-full max-w-[360px]">
                      <div className="relative w-full aspect-[9/16] rounded-[44px] border border-border bg-background shadow-xl overflow-hidden">
                        <iframe
                          src={`/browserdroid/index_1.html?product=${encodeURIComponent(
                            productSwitcher.product_id,
                          )}&server=${activeBrowserDroidServer}&userId=${user.id}`}
                          className="w-full h-full border-none"
                          title="Browser Droid"
                          id="browserdroid-iframe-left"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="px-4 pb-4">
                    <Button
                      variant="v2-outline"
                      className="w-full py-6 text-base font-semibold"
                      onClick={() => {
                        shouldFlushBrowserDroidOnCloseRef.current = true;
                        setShowBrowserDroidInLeftSidebar(false);
                      }}
                      disabled={browserDroidLeftCaptureCount < 2}
                    >
                      Complete Flow
                    </Button>
                  </div>
                </div>
              ) : (
                <TestRunSelectionProvider
                  flows={flowManagement.flows}
                  features={featureManagement.features}
                >
                  <FlowManager
                    flows={flowManagement.flows}
                    features={featureManagement.features}
                    selectedFlowId={flowManagement.selectedFlowId}
                    onFlowSelect={flowManagement.selectFlow}
                    onFlowDelete={flowManagement.deleteFlow}
                    onFlowBulkDelete={flowManagement.deleteFlows}
                    onFlowExport={fileOps.exportFlows}
                    onFlowImport={fileOps.importFlows}
                    onFlowRename={flowManagement.renameFlow}
                    onFlowPreconditionRename={
                      flowManagement.renameFlowPrecondition
                    }
                    onFlowDescriptionSave={flowManagement.renameFlowDescription}
                    onFlowScenariosUpdate={flowManagement.updateFlowScenarios}
                    onFlowCredentialsUpdate={
                      flowManagement.updateFlowCredentials
                    }
                    onFlowUpdate={flowManagement.updateFlow}
                    onFlowReorder={flowManagement.reorderFlows}
                    onSelectedFlowChainChange={handleSelectedFlowChainChange}
                    edges={edges}
                    nodes={nodes}
                    onFlowStepClick={handleFlowStepClick}
                    addNewNodes={nodeManagement.addNewNodes}
                    updateNodeDescription={nodeManagement.updateNodeDescription}
                    onEdgeDetailsChange={handleEdgeDetailsChange}
                    handleTestCasePlanning={handleTestCasePlanning}
                    failedVideoToFlowRequests={
                      flowManagement.failedVideoToFlowRequests
                    }
                    onClearFailedVideoRequests={
                      flowManagement.clearFailedVideoToFlowRequests
                    }
                    onRetryFailedRequest={handleRetryVideoRequest}
                    selectedFeatureId={selectedFeatureId}
                    isFlowsPanel={true}
                    videoQueueItems={videoQueueItems}
                    onFeatureSelectChange={onFeatureSelectChange}
                    onAddFeatureClick={onAddFeatureClick}
                    onFeatureUpdate={async (featureId, updates) => {
                      try {
                        await updateFeatureViaApi(
                          featureId,
                          updates,
                          productSwitcher?.product_id || null,
                        );

                        if (updates.name !== undefined) {
                          dispatch(
                            updateGraphFeature({
                              id: featureId,
                              name: updates.name,
                            }),
                          );
                        }

                        featureManagement.updateFeature(featureId, updates);

                        toast({
                          title: "Feature updated",
                          description: updates.name
                            ? `Feature name updated to "${updates.name}".`
                            : "Feature updated successfully.",
                        });
                      } catch (error) {
                        console.error("Failed to update feature:", error);
                        toast({
                          title: "Failed to update feature",
                          description: error?.message || String(error),
                          variant: "destructive",
                        });
                        throw error;
                      }
                    }}
                    onFeatureDelete={async (featureId) => {
                      try {
                        await deleteFeatureViaApi(
                          featureId,
                          productSwitcher?.product_id || null,
                        );

                        dispatch(deleteGraphFeature(featureId));

                        featureManagement.deleteFeature(featureId);

                        toast({
                          title: "Feature deleted",
                          description: "Feature has been deleted.",
                        });
                      } catch (error) {
                        console.error("Failed to delete feature:", error);
                        toast({
                          title: "Failed to delete feature",
                          description: error?.message || String(error),
                          variant: "destructive",
                        });
                        throw error;
                      }
                    }}
                  />
                </TestRunSelectionProvider>
              )}
            </div>
          )}
        </div>
      )}
      {/* Manual Flow Creation Overlay (when sidebar is hidden and flows panel is not visible) */}
      {hideSidebar && !showFlowsPanel && mode === "planFlow" && (
        <div className="absolute top-4 left-4 z-20 w-80 bg-background border border-border shadow-lg rounded-lg overflow-hidden flex flex-col max-h-[calc(100vh-2rem)]">
          <PlanFlowManager
            planFlowState={planFlowState}
            nodes={nodes}
            edges={edges}
            flows={flowManagement.flows}
            onStateChange={(update) =>
              setPlanFlowState((prev) => ({ ...prev, ...update }))
            }
            onCancel={() => {
              setMode("select");
              setPlanFlowState((prev) => ({
                ...prev,
                step: "start",
                startNode: null,
                currentPathNodes: [],
              }));
            }}
            onReset={() => {
              setPlanFlowState((prev) => ({
                ...prev,
                step: "start",
                startNode: null,
                currentPathNodes: [],
              }));
            }}
            onCreateFlow={createPlanFlow}
            onFlashUncovered={handleFlashUncovered}
          />
        </div>
      )}
      {!hideSidebar && (
        <GraphSidebar
          mode={mode}
          editingFeatureId={editingFeatureId}
          nodes={nodes}
          edges={edges}
          flows={flowManagement.flows}
          selectedFlowId={flowManagement.selectedFlowId}
          isFlowsPanelVisible={showFlowsPanel}
          planFlowState={planFlowState}
          features={featureManagement.features}
          visibleFeatureIds={featureManagement.visibleFeatureIds}
          nodeImages={nodeCreation.nodeImages}
          nodeDescription={nodeCreation.nodeDescription}
          edgeSource={edgeSource}
          selectedEdge={selectedEdge}
          canUndo={undoRedo.canUndo}
          canRedo={undoRedo.canRedo}
          screenPreviewEnabled={screenPreviewEnabled}
          onModeChange={setMode}
          onEditFeature={handleEditFeature}
          onFlowSelect={flowManagement.selectFlow}
          onFlowDelete={flowManagement.deleteFlow}
          onFlowBulkDelete={flowManagement.deleteFlows}
          onFlowExport={fileOps.exportFlows}
          onFlowImport={fileOps.importFlows}
          onFlowRename={flowManagement.renameFlow}
          onFlowPreconditionRename={flowManagement.renameFlowPrecondition}
          onFlowDescriptionSave={flowManagement.renameFlowDescription}
          onFlowScenariosUpdate={flowManagement.updateFlowScenarios}
          onFlowCredentialsUpdate={flowManagement.updateFlowCredentials}
          onFlowReorder={flowManagement.reorderFlows}
          onSelectedFlowChainChange={handleSelectedFlowChainChange}
          onFlowStepClick={handleFlowStepClick}
          onPlanFlowStateChange={(update) =>
            setPlanFlowState((prev) => ({ ...prev, ...update }))
          }
          onCreatePlanFlow={createPlanFlow}
          onNodeDescriptionChange={nodeCreation.setNodeDescription}
          onImageUpload={nodeCreation.handleImageUpload}
          onExportGraph={fileOps.exportGraph}
          onImportGraph={fileOps.importGraph}
          onUndo={undoRedo.undo}
          onRedo={undoRedo.redo}
          fileInputRef={fileInputRef}
          importInputRef={fileOps.importInputRef}
          featureManagement={enhancedFeatureManagement}
          selectedNodes={selectedNodes}
          onClearSelection={clearSelection}
          onFlashUncovered={handleFlashUncovered}
          onFlashEntryPoints={handleFlashEntryPoints}
          onFindElementById={handleFindElementById}
          onEdgeDetailsChange={handleEdgeDetailsChange}
          setNodes={setNodes}
          onToggleFeatureCollapse={featureCollapse.toggleFeatureCollapse}
          onAiFlowPlanning={aiFlowPlanning.executePlanning}
          isAiPlanning={aiFlowPlanning.isPlanning}
          onScreenPreviewToggle={setScreenPreviewEnabled}
          onAutoFormatEnabledChange={handleAutoFormatEnabledChange}
          onAddFlowsFromVideo={onAddFlowsFromVideo}
          videoQueueItems={videoQueueItems}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebar}
          addNewNodes={nodeManagement.addNewNodes}
          updateNodeDescription={nodeManagement.updateNodeDescription}
          handleTestCasePlanning={handleTestCasePlanning}
          failedVideoToFlowRequests={flowManagement.failedVideoToFlowRequests}
          onClearFailedVideoRequests={
            flowManagement.clearFailedVideoToFlowRequests
          }
          onRetryFailedRequest={handleRetryVideoRequest}
          onStartWebRecording={handleStartWebRecording}
          onStopWebRecording={handleStopWebRecording}
          isWebRecording={extensionRecording}
        />
      )}

      {!hideTopButtons && (
        <div className="absolute top-4 right-4 z-10 flex gap-2 items-center">
          {path && flowPath ? (
            <Button onClick={handleMergeGraph} variant="outline" size="sm">
              Merge Graph
            </Button>
          ) : (
            <>
              <Button
                className="hidden"
                onClick={handleSaveGraph}
                variant="outline"
                size="sm"
                disabled={isSaveInProgress}
              >
                <Download className="h-4 w-4 mr-2" />
                {isSaveInProgress ? "Saving Graph..." : "Save Graph"}
              </Button>
              <div className="relative flex flex-col items-end gap-0">
                <div className="flex">
                  <Button
                    onClick={() => handleTestCasePlanning(false)}
                    variant="default"
                    size="sm"
                    disabled={isTestCasePlanningInProgress}
                    className="rounded-r-md hidden"
                  >
                    <ClipboardList className="h-4 w-4 mr-2" />
                    {isTestCasePlanningInProgress
                      ? "Planning Diff Test Cases..."
                      : "Plan Diff Test Cases"}
                  </Button>

                  <Button
                    onClick={() => handleTestCasePlanning(true)}
                    variant="default"
                    size="sm"
                    disabled={isTestCasePlanningInProgress}
                    className="rounded-r-md"
                  >
                    <ClipboardList className="h-4 w-4 mr-2" />
                    {isTestCasePlanningInProgress
                      ? "Planning Test Cases..."
                      : "Plan Test Cases"}
                  </Button>

                  <Button
                    className=" hidden rounded-r-none rounded-tr-md rounded-br-md"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setForceDropdownOpen((open) => !open);
                    }}
                    title="More options"
                    aria-label="More options"
                    disabled={isTestCasePlanningInProgress}
                  >
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                      <path
                        d="M6 8l4 4 4-4"
                        stroke="#fff"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Button>
                </div>
                {forceDropdownOpen && (
                  <div
                    className="absolute right-0 mt-9 w-40 bg-white border border-gray-200 rounded shadow-lg z-20 flex flex-col"
                    style={{ minWidth: "140px" }}
                  >
                    <Button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await handleTestCasePlanning(true);
                        setForceDropdownOpen(false);
                      }}
                      variant="primary"
                      size="sm"
                      disabled={isTestCasePlanningInProgress}
                      className="w-full justify-start bg-primary text-white hover:bg-primary/90 hidden"
                      style={{ borderRadius: "0 0 0.375rem 0.375rem" }}
                    >
                      {isTestCasePlanningInProgress
                        ? "Planning Full Test Cases..."
                        : "Plan Full Test Cases"}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <GraphCanvas
        nodes={displayNodes}
        edges={displayEdges}
        flows={flowManagement.flows}
        setFlows={flowManagement.setAllFlows}
        selectedFlowId={flowManagement.selectedFlowId}
        hoveredFlowId={hoveredFlowId}
        mode={mode}
        planFlowState={planFlowState}
        visibleFeatures={
          selectedFeatureId && !flowManagement.selectedFlowId && !selectedTcueId
            ? featureManagement.features.filter(
                (feature) => feature.id === selectedFeatureId,
              )
            : featureManagement.visibleFeatures
        }
        allNodes={
          selectedFeatureId && !flowManagement.selectedFlowId && !selectedTcueId
            ? displayNodes
            : nodes
        }
        editingFeatureId={editingFeatureId}
        isFlashingUncovered={isFlashingUncovered}
        isFlashingEntryPoints={isFlashingEntryPoints}
        isFlashingSearchResult={isFlashingSearchResult}
        searchResultId={searchResultId}
        flowChain={flowChain}
        screenPreviewEnabled={screenPreviewEnabled}
        onNodesChange={safeOnNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onSelectionDragStart={onSelectionDragStart}
        onSelectionDragStop={onSelectionDragStop}
        onEdgesChange={onEdgesChange}
        onConnect={eventHandlers.onConnect}
        onReconnect={eventHandlers.onReconnect}
        onNodeClick={eventHandlers.onNodeClick}
        onEdgeClick={eventHandlers.onEdgeClick}
        onCanvasClick={handleCanvasClick}
        onMouseDown={camera.handleMouseDown}
        onMouseMove={camera.handleMouseMove}
        onMouseUp={camera.handleMouseUp}
        onContextMenu={handleContextMenu}
        saveState={undoRedo.saveState}
      />

      {fileOps.FileInputComponent()}

      <GraphDialogs
        editingNode={nodeEditing.editingNode}
        editNodeDescription={nodeEditing.editNodeDescription}
        editNodeImage={nodeEditing.editNodeImage}
        onEditNodeDescriptionChange={nodeEditing.setEditNodeDescription}
        onEditNodeImageChange={nodeEditing.setEditNodeImage}
        onEditNodeImageUpload={nodeEditing.handleEditImageUpload}
        onSaveNodeEdit={nodeEditing.saveNodeEdit}
        onCancelNodeEdit={nodeEditing.cancelNodeEdit}
        editImageInputRef={nodeEditing.editImageInputRef}
        editingEdge={edgeEditing.editingEdge}
        editEdgeDescription={edgeEditing.editEdgeDescription}
        onEditEdgeDescriptionChange={edgeEditing.setEditEdgeDescription}
        onSaveEdgeEdit={edgeEditing.saveEdgeEdit}
        onCancelEdgeEdit={edgeEditing.cancelEdgeEdit}
        showDeleteConfirm={deleteManagement.showDeleteConfirm}
        onShowDeleteConfirmChange={(show) =>
          show ? null : deleteManagement.cancelDelete()
        }
        pendingDeletion={deleteManagement.pendingDeletion}
        onConfirmDeletion={deleteManagement.confirmDelete}
        onCancelDeletion={cancelDeletion}
      />

      <CommentInputDialog
        isOpen={commentDialogOpen}
        onClose={() => {
          setCommentDialogOpen(false);
          setPendingCommentPosition(null);
        }}
        onSave={handleCommentSave}
        title="Add Comment"
      />
      {isMergeGraphInProgress && (
        <div className="fixed inset-0 z-50 bg-white">
          <ProductLoadingScreen message="Please wait while we merge the Graph" />
        </div>
      )}
      {isQaiUser && activeBrowserDroidServer && (
        <RightSidebar
          isCollapsed={isRightSidebarCollapsed}
          onToggleCollapse={toggleRightSidebar}
        >
          <iframe
            src={`/browserdroid/index_1.html?product=${encodeURIComponent(productSwitcher.product_id)}&server=${activeBrowserDroidServer}&userId=${user.id}`}
            className="w-full h-full border-none"
            title="Custom HTML Page"
            id="browserdroid-iframe"
          />
        </RightSidebar>
      )}

      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-[100]"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
          />
          <div
            className="fixed z-[101] bg-white rounded-md border shadow-md py-1 min-w-[160px]"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button
              className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 flex items-center"
              onClick={handleAddNodeClick}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Nodes
            </button>
          </div>
        </>
      )}

      <input
        type="file"
        ref={addNodeFileInputRef}
        className="hidden"
        accept="image/*"
        multiple
        onChange={handleFileInputChange}
      />
    </div>
  );
};

const GraphEditor = ({
  path,
  flowPath,
  hideSidebar = false,
  hideTopButtons = false,
  showFlowsPanel = false,
  selectedFeatureId = null,
  onFeatureSelectChange,
  onAddFeatureClick,
  enableLinearFlowView = false,
}: {
  path?: string;
  flowPath?: string;
  hideSidebar?: boolean;
  hideTopButtons?: boolean;
  showFlowsPanel?: boolean;
  selectedFeatureId?: string | null;
  onFeatureSelectChange?: (featureId: string | null) => void;
  onAddFeatureClick?: () => void;
  enableLinearFlowView?: boolean;
}) => {
  return (
    <div className="flex flex-col h-full flex-1 min-h-0">
      <ReactFlowProvider>
        <GraphEditorFlow
          path={path}
          flowPath={flowPath}
          hideSidebar={hideSidebar}
          hideTopButtons={hideTopButtons}
          showFlowsPanel={showFlowsPanel}
          selectedFeatureId={selectedFeatureId}
          onFeatureSelectChange={onFeatureSelectChange}
          onAddFeatureClick={onAddFeatureClick}
          enableLinearFlowView={enableLinearFlowView}
        />
      </ReactFlowProvider>
    </div>
  );
};

export default GraphEditor;
