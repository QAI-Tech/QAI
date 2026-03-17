import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { Node, Edge } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  X,
  Link,
  Loader2,
  ChevronDown,
  Video,
  Camera,
  Pencil,
  Wand2,
} from "lucide-react";
import { Scenarios } from "@/app/(dashboard)/[product]/homev1/test-cases/components/scenarios";
import { TestCaseCredentials } from "@/components/ui/test-case-credentials";
import { useProductSwitcher } from "@/providers/product-provider";
import { useToast } from "@/hooks/use-toast";
import { useDispatch } from "react-redux";
import { fetchCredentials } from "@/app/store/credentialsSlice";
import {
  GCS_BUCKET_URL,
  GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT,
} from "@/lib/constants";
import type { AppDispatch } from "@/app/store/store";
import {
  TestCaseType,
  Criticality,
  testCaseSchema,
  Scenario,
} from "@/lib/types";
import { Flow } from "./FlowManager";
import { VideoPlayer } from "@/components/ui/video-player";
import { generateNodeId } from "@/app/(editor)/utils/idGenerator";
import { CustomNodeData } from "@/app/(editor)/types/graphHandlers";
import { getNodeAutoTitleManager } from "@/app/(editor)/services/nodeAutoTitleManager";
import { formatEdgeBusinessLogic } from "@/app/(editor)/services/edgeFormatManager";

interface FlowDetailsPanelProps {
  flow: Flow | null;
  isOpen: boolean;
  onClose: () => void;
  onFlowRename: (flowId: string, newName: string) => void;
  onFlowPreconditionRename: (flowId: string, newPrecondition: string) => void;
  onCheckReachability?: (flowId: string) => void;
  onFlowScenariosUpdate?: (flowId: string, scenarios: Scenario[]) => void;
  onFlowCredentialsUpdate?: (flowId: string, credentials: string[]) => void;
  edges?: Edge[];
  nodes?: Node[];
  reachabilityResult?: {
    isReachable: boolean;
    flowChains: Flow[][];
  };
  isLoadingChains?: boolean;
  activeChainTab?: number;
  onChainTabChange?: (flowId: string, tabIndex: number) => void;
  onFlowSelect?: (flowId: string | null) => void;
  entryPointIds?: string[];
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
  autoFormatEnabled?: boolean;
}

export const FlowDetailsPanel: React.FC<FlowDetailsPanelProps> = ({
  flow,
  isOpen,
  onClose,
  onFlowRename,
  onFlowPreconditionRename,
  onCheckReachability,
  onFlowScenariosUpdate,
  onFlowCredentialsUpdate,
  edges,
  nodes,
  reachabilityResult,
  isLoadingChains,
  activeChainTab,
  onChainTabChange,
  onFlowSelect,
  entryPointIds,
  onFlowStepClick,
  addNewNodes,
  updateNodeDescription,
  onEdgeDetailsChange,
  autoFormatEnabled = false,
}) => {
  const { productSwitcher } = useProductSwitcher();
  const dispatch = useDispatch<AppDispatch>();
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTestCases, setGeneratedTestCases] = useState<any[]>([]);
  const [showFullFlow, setShowFullFlow] = useState(false);
  const [isCredentialsExpanded, setIsCredentialsExpanded] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPrecondition, setEditPrecondition] = useState("");
  const [isScenariosCollapsed, setIsScenariosCollapsed] = useState(false);
  const [isCredentialsCollapsed, setIsCredentialsCollapsed] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [signedVideoUrl, setSignedVideoUrl] = useState<string | null>(null);
  const [isCapturingFrame, setIsCapturingFrame] = useState(false);
  const [editingBusinessLogic, setEditingBusinessLogic] = useState<
    string | null
  >(null);
  const [businessLogicValue, setBusinessLogicValue] = useState("");
  const [formattingEdgeMap, setFormattingEdgeMap] = useState<
    Record<string, { pendingValue: string; startedAt: number }>
  >({});
  const [expandedEdgeIds, setExpandedEdgeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const stableEmptyScenariosRef = useRef<Scenario[]>([]);
  const formatClickRef = useRef(false);

  // Synchronize editName with flow prop
  useEffect(() => {
    setEditName(flow?.name || "");
  }, [flow?.name]);

  // Synchronize editPrecondition with flow prop
  useEffect(() => {
    setEditPrecondition(flow?.precondition || "");
  }, [flow?.precondition]);

  // Reset video player state when flow changes
  useEffect(() => {
    setShowVideo(false);
    setVideoError(null);
    setSignedVideoUrl(null);
  }, [flow?.id]);

  // Fetch signed URL when video is shown
  useEffect(() => {
    if (
      !showVideo ||
      !flow?.videoUrl ||
      flow.videoUrl.trim() === "" ||
      videoError
    ) {
      setSignedVideoUrl(null);
      return;
    }

    const fetchVideoSignedUrl = async () => {
      if (!flow.videoUrl) return;
      const rawVideoUrl = flow.videoUrl.trim();

      try {
        setVideoError(null);

        // Generate the API URL for signed URL request
        const apiUrl = rawVideoUrl.startsWith(GCS_BUCKET_URL)
          ? `${GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT}${rawVideoUrl.substring(GCS_BUCKET_URL.length)}`
          : `${GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT}${rawVideoUrl}`;

        console.log("Fetching signed URL from:", apiUrl);

        const response = await fetch(apiUrl);

        if (!response.ok) {
          throw new Error(
            `Failed to fetch video signed URL: ${response.status} ${response.statusText}`,
          );
        }

        const { signedUrl } = await response.json();

        if (!signedUrl) {
          throw new Error("No signed URL returned from API");
        }

        setSignedVideoUrl(signedUrl);
      } catch (error) {
        console.error("Error while fetching the video signed URL:", error);
        setVideoError(
          error instanceof Error ? error.message : "Failed to fetch signed URL",
        );
        setSignedVideoUrl(null);
      }
    };

    fetchVideoSignedUrl();
  }, [showVideo, flow?.videoUrl, videoError]);

  // Fetch credentials when component mounts or productId changes
  useEffect(() => {
    if (productSwitcher?.product_id) {
      dispatch(fetchCredentials(productSwitcher.product_id));
    }
  }, [productSwitcher?.product_id, dispatch]);

  useEffect(() => {
    if (!editingBusinessLogic || !edges) {
      return;
    }

    const activeEdge = edges.find((edge) => edge.id === editingBusinessLogic);
    if (!activeEdge) {
      return;
    }

    const latestLogic =
      typeof activeEdge.data?.business_logic === "string"
        ? activeEdge.data.business_logic
        : "";
    setBusinessLogicValue(latestLogic);
  }, [editingBusinessLogic, edges]);

  useEffect(() => {
    setExpandedEdgeIds(new Set());
  }, [flow?.id]);

  useEffect(() => {
    if (!edges) {
      return;
    }

    setFormattingEdgeMap((currentMap) => {
      if (Object.keys(currentMap).length === 0) {
        return currentMap;
      }

      let mapChanged = false;
      const nextMap = { ...currentMap };

      Object.entries(currentMap).forEach(([edgeId, meta]) => {
        const latestEdge = edges.find((edge) => edge.id === edgeId);
        if (!latestEdge) {
          return;
        }

        const currentValue =
          typeof latestEdge.data?.business_logic === "string"
            ? latestEdge.data.business_logic
            : "";
        const timedOut = Date.now() - meta.startedAt > 15000;

        if ((currentValue && currentValue !== meta.pendingValue) || timedOut) {
          delete nextMap[edgeId];
          mapChanged = true;
          if (editingBusinessLogic === edgeId && currentValue) {
            setBusinessLogicValue(currentValue);
          }
        }
      });

      return mapChanged ? nextMap : currentMap;
    });
  }, [edges, editingBusinessLogic]);

  const queueBusinessLogicFormatting = useCallback(
    (edge: Edge, logic: string) => {
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
    },
    [toast],
  );

  const toggleEdgeExpansion = useCallback((edgeId: string) => {
    setExpandedEdgeIds((prev) => {
      const next = new Set(prev);
      if (next.has(edgeId)) {
        next.delete(edgeId);
      } else {
        next.add(edgeId);
      }
      return next;
    });
  }, []);

  const expandEdge = useCallback((edgeId: string) => {
    setExpandedEdgeIds((prev) => {
      if (prev.has(edgeId)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(edgeId);
      return next;
    });
  }, []);

  const persistBusinessLogic = useCallback(
    (edge: Edge, value: string, options: { autoFormat?: boolean } = {}) => {
      if (!onEdgeDetailsChange) {
        return;
      }

      const trimmedValue = value.trim();
      const currentValue =
        typeof edge.data?.business_logic === "string"
          ? edge.data.business_logic
          : "";

      const hasChange = trimmedValue !== currentValue;

      if (hasChange) {
        onEdgeDetailsChange(edge.id, {
          description: String(edge.data?.description || ""),
          paramValues: Array.isArray(edge.data?.paramValues)
            ? edge.data.paramValues
            : [],
          business_logic: trimmedValue,
        });
      }

      if (
        options.autoFormat &&
        autoFormatEnabled &&
        trimmedValue &&
        (hasChange || !currentValue)
      ) {
        queueBusinessLogicFormatting(edge, trimmedValue);
      }
    },
    [onEdgeDetailsChange, queueBusinessLogicFormatting, autoFormatEnabled],
  );

  // Helper functions to resolve node IDs to actual nodes
  const getNodeById = useCallback(
    (nodeId: string) => {
      return nodes?.find((node) => node.id === nodeId);
    },
    [nodes],
  );
  const getFlowPathNodes = (): Node[] => {
    return Array.isArray(flow?.pathNodeIds)
      ? (flow.pathNodeIds
          .map((nodeId) => getNodeById(nodeId))
          .filter(Boolean) as Node[])
      : [];
  };

  const getEdgeDescription = (
    sourceNodeId: string,
    targetNodeId: string,
  ): string => {
    const edge = edges?.find(
      (edge) => edge.source === sourceNodeId && edge.target === targetNodeId,
    );
    return String(edge?.data?.description || edge?.label || "");
  };

  const createFlowDescription = (): string => {
    if (!flow) return "";

    let description = flow.precondition || "";

    const pathNodes = getFlowPathNodes();
    const edgeDescriptions: string[] = [];

    for (let i = 0; i < pathNodes.length - 1; i++) {
      const currentNode = pathNodes[i];
      const nextNode = pathNodes[i + 1];
      const edgeDesc = getEdgeDescription(currentNode.id, nextNode.id);

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
  };

  const mockTestCase = useMemo(
    () => ({
      test_case_id: flow?.id || "",
      test_case_description: createFlowDescription(),
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
    [flow, nodes, edges],
  );

  if (!isOpen || !flow) return null;

  const startNode = getNodeById(flow.startNodeId);
  const endNode = getNodeById(flow.endNodeId);
  const viaNodes = Array.isArray(flow.viaNodeIds)
    ? (flow.viaNodeIds
        .map((nodeId) => getNodeById(nodeId))
        .filter(Boolean) as Node[])
    : [];
  const pathNodes = getFlowPathNodes();

  const getTabTitle = (chain: Flow[], index: number): string => {
    if (chain.length <= 1) {
      return "Direct";
    }

    const viaFlow = chain[chain.length - 2];
    return `via ${viaFlow.name}`;
  };

  const handleChainTabChange = (newActiveTab: number) => {
    if (onChainTabChange) {
      onChainTabChange(flow.id, newActiveTab);
    }
  };

  const flowChains = reachabilityResult?.flowChains || [];
  const isReachableFromEntryPoint = reachabilityResult?.isReachable || false;

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

  const handleBusinessLogicBlur = (edge?: Edge) => {
    if (!edge) {
      setEditingBusinessLogic(null);
      return;
    }

    if (formatClickRef.current) {
      formatClickRef.current = false;
      return;
    }

    persistBusinessLogic(edge, businessLogicValue, {
      autoFormat: autoFormatEnabled,
    });
    setEditingBusinessLogic(null);
  };

  const handleBusinessLogicKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
    edge: Edge | undefined,
    currentValue: string,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setBusinessLogicValue(currentValue);
      setEditingBusinessLogic(null);
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (edge) {
        persistBusinessLogic(edge, businessLogicValue, {
          autoFormat: autoFormatEnabled,
        });
        setEditingBusinessLogic(null);
      }
    }
  };

  const handleManualFormat = (edge?: Edge) => {
    if (!edge) {
      return;
    }

    const rawValue =
      editingBusinessLogic === edge.id
        ? businessLogicValue
        : typeof edge.data?.business_logic === "string"
          ? edge.data.business_logic
          : "";

    if (!rawValue.trim()) {
      toast({
        title: "Add business logic",
        description: "Enter business logic before requesting formatting.",
        variant: "destructive",
      });
      return;
    }

    queueBusinessLogicFormatting(edge, rawValue);
  };

  const hasVideo = !!(flow.videoUrl && flow.videoUrl.trim());

  // Test video URL accessibility
  const testVideoUrl = async (url: string): Promise<boolean> => {
    try {
      const response = await fetch(url, { method: "HEAD" });
      const contentType = response.headers.get("content-type");
      console.log("Video URL test:", {
        url,
        status: response.status,
        contentType,
        ok: response.ok,
      });
      return (
        response.ok &&
        (contentType?.startsWith("video/") || response.status === 200)
      );
    } catch (error) {
      console.error("Video URL test failed:", error);
      return false;
    }
  };

  const handleVideoError = (error: MediaError | null) => {
    let errorMessage = "Failed to load video";

    if (error) {
      console.error("Video error details:", {
        code: error.code,
        message: error.message,
        videoUrl: flow?.videoUrl,
      });

      switch (error.code) {
        case MediaError.MEDIA_ERR_ABORTED:
          errorMessage = "Video playback was aborted";
          break;
        case MediaError.MEDIA_ERR_NETWORK:
          errorMessage = "Network error occurred while loading video";
          break;
        case MediaError.MEDIA_ERR_DECODE:
          errorMessage = "Video format is not supported or file is corrupted";
          break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          errorMessage = "Video source format is not supported";
          break;
        default:
          errorMessage = `Video error: ${error.message || "Unknown error"}`;
      }
    }

    setVideoError(errorMessage);
  };

  const handleShowVideo = () => {
    if (!showVideo) {
      // Reset states when showing video
      setVideoError(null);
      setSignedVideoUrl(null);
      // The useEffect will handle loading the signed URL
    } else {
      // When hiding video, clear the signed URL
      setSignedVideoUrl(null);
    }
    setShowVideo(!showVideo);
  };

  const captureVideoFrame = async (): Promise<string | null> => {
    try {
      // Find the video element in the VideoPlayer
      const videoElement = document.querySelector("video") as HTMLVideoElement;
      if (!videoElement) {
        console.error("No video element found");
        return null;
      }

      // Check if video is ready
      if (videoElement.readyState < 2) {
        console.error(
          "Video not ready for frame capture. ReadyState:",
          videoElement.readyState,
        );
        return null;
      }

      // Verify video has dimensions
      if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
        console.error("Video dimensions are zero:", {
          videoWidth: videoElement.videoWidth,
          videoHeight: videoElement.videoHeight,
          clientWidth: videoElement.clientWidth,
          clientHeight: videoElement.clientHeight,
        });
        return null;
      }

      // Create canvas to capture frame
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        console.error("Could not get canvas context");
        return null;
      }

      // Set canvas dimensions to match video
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;

      console.log("Capturing frame:", {
        videoWidth: videoElement.videoWidth,
        videoHeight: videoElement.videoHeight,
        currentTime: videoElement.currentTime,
        crossOrigin: videoElement.crossOrigin,
        src: videoElement.src?.substring(0, 100) + "...",
      });

      // Draw current frame to canvas
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

      // Convert to base64
      return canvas.toDataURL("image/jpeg", 0.2);
    } catch (error) {
      console.error("Error capturing video frame:", error);

      // If we still get a CORS error, provide user feedback
      if (error instanceof DOMException && error.name === "SecurityError") {
        console.error(
          "CORS error: Video cannot be captured due to cross-origin restrictions",
        );
        // You might want to show a toast notification to the user here
        return null;
      }

      return null;
    }
  };

  const handleAddNodeFromFrame = async () => {
    if (!addNewNodes) {
      console.error("addNewNodes function not available");
      toast({
        title: "Feature not available",
        description: "Node creation function is not available",
        variant: "destructive",
      });
      return;
    }

    if (isCapturingFrame) {
      console.log("Frame capture already in progress");
      return;
    }

    try {
      setIsCapturingFrame(true);
      console.log("Starting frame capture...");

      // Capture current video frame
      const frameImage = await captureVideoFrame();
      if (!frameImage) {
        console.error("Failed to capture video frame");
        toast({
          title: "Failed to capture frame",
          description:
            "This may be due to CORS restrictions or video not being ready.",
          variant: "destructive",
        });
        return;
      }

      // Generate new node ID
      const nodeId = generateNodeId();

      // Create new node data - description will be updated by AI
      const videoElement = document.querySelector("video") as HTMLVideoElement;
      const currentTime = videoElement?.currentTime || 0;
      const formattedTime = `${Math.floor(currentTime / 60)}:${Math.floor(
        currentTime % 60,
      )
        .toString()
        .padStart(2, "0")}`;

      const nodeData: CustomNodeData = {
        description: `Frame at ${formattedTime}`,
        image: frameImage,
      };

      // Calculate position to the right of the last screen in the flow
      let positionX = 200;
      let positionY = 200;

      const flowPathNodes = getFlowPathNodes();

      if (flowPathNodes && flowPathNodes.length > 0) {
        // Get the last node in the flow path
        const lastFlowNode = flowPathNodes[flowPathNodes.length - 1];

        if (lastFlowNode) {
          // Start from the last flow node position
          let baseX = lastFlowNode.position.x;
          let baseY = lastFlowNode.position.y;

          // Find all nodes that are to the right of the last flow node at the same Y level
          // to avoid overlapping with previously added frame nodes
          const nodesOnRight =
            nodes?.filter(
              (node) =>
                node.position.x > baseX &&
                Math.abs(node.position.y - baseY) < 50, // Within 50px Y tolerance
            ) || [];

          // Calculate the rightmost position among existing nodes on the right
          const rightmostX =
            nodesOnRight.length > 0
              ? Math.max(...nodesOnRight.map((n) => n.position.x))
              : baseX;

          // Place the new node with appropriate spacing
          const nodeSpacing = 250; // 250px gap between nodes
          positionX = rightmostX + nodeSpacing;
          positionY = baseY; // Same Y level as the last flow node
        }
      } else if (nodes && nodes.length > 0) {
        // Fallback: if no flow nodes found, use general positioning
        const maxX = Math.max(...nodes.map((n) => n.position.x));
        const maxY = Math.max(...nodes.map((n) => n.position.y));
        positionX = maxX + 250;
        positionY = Math.max(100, maxY - 100);
      }

      // Create new node
      const newNode: Node = {
        id: nodeId,
        type: "customNode",
        position: { x: positionX, y: positionY },
        data: nodeData,
        deletable: true,
      };

      // Add the new node
      addNewNodes([newNode]);

      console.log(
        "Successfully added node from video frame:",
        nodeId,
        "at position",
        { x: positionX, y: positionY },
        "to the right of flow:",
        flow?.name,
      );

      // Trigger auto-title generation for the new node
      try {
        // Provide callback to update the node when title is generated
        const handleNodeUpdate = (
          nodeId: string,
          title: string,
          description: string,
        ) => {
          if (updateNodeDescription) {
            updateNodeDescription(nodeId, title);
            console.log(
              `[FlowDetailsPanel] Updated node ${nodeId} with title: "${title}"`,
            );

            // Show toast with the AI-generated title
            toast({
              title: "Node title generated!",
              description: `"${title}"`,
              duration: 3000,
            });
          }
        };

        const manager = getNodeAutoTitleManager(handleNodeUpdate);
        manager.generateTitleForNode(nodeId, frameImage);
        console.log(
          `[FlowDetailsPanel] Triggered auto-title for node: ${nodeId}`,
        );
      } catch (error) {
        console.warn("[FlowDetailsPanel] Could not trigger auto-title:", error);
      }

      // Show success feedback
      toast({
        title: "Node added",
        description: "Captured frame from video",
      });
    } catch (error) {
      console.error("Error adding node from frame:", error);
      toast({
        title: "Failed to add node",
        description: "An error occurred while adding the node from video frame",
        variant: "destructive",
      });
    } finally {
      setIsCapturingFrame(false);
    }
  };

  return (
    <div className="fixed left-[21rem] top-20 h-[calc(100vh-8rem)] w-96 bg-background border-l border-border shadow-lg z-50 overflow-y-auto rounded-l-lg">
      <div className="sticky top-0 bg-background border-b border-border z-10">
        {/* Header with close button */}
        <div className="flex items-center justify-between p-3 h-12">
          <h2 className="text-base font-semibold text-foreground">
            Flow Details
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-6 w-6 p-0 hover:bg-muted rounded-sm"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="p-3 space-y-4 pb-6">
        {/* Flow title */}
        <div className="bg-muted/30 p-3 rounded-sm border">
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={() => {
              const trimmed = editName.trim();
              if (trimmed && trimmed !== (flow.name || "")) {
                onFlowRename(flow.id, trimmed);
              }
            }}
            className="w-full text-sm font-medium text-foreground mb-2 bg-transparent border border-transparent focus:border-input rounded-sm px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
            placeholder="Enter flow name"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{pathNodes.length} screens</span>
              <div className="hidden">
                {isReachableFromEntryPoint ? (
                  <Badge
                    variant="default"
                    className="text-xs px-2 py-0 h-5 rounded-sm"
                  >
                    Reachable
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="text-xs px-2 py-0 h-5 rounded-sm"
                  >
                    Isolated
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground break-all">
            ID: <span className="font-mono">{flow.id}</span>
          </div>
        </div>

        {/* Video button section - only show if flow has videoUrl */}
        {hasVideo && (
          <div className="bg-muted/30 p-3 rounded-sm border">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Video Demo</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={handleShowVideo}
              >
                {showVideo ? "Hide Video" : "Show Video"}
              </Button>
            </div>

            {/* Video player - conditionally shown */}
            {showVideo && flow.videoUrl && flow.videoUrl.trim() && (
              <div className="mt-3">
                {/* Error state */}
                {videoError ? (
                  <div className="relative w-full h-[700px] rounded-md overflow-hidden bg-muted/20 border border-destructive/20 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3 text-center p-6 max-w-md">
                      <Video className="h-8 w-8 text-destructive" />
                      <div className="space-y-2">
                        <span className="text-sm text-destructive font-medium">
                          Failed to load video
                        </span>
                        <span className="text-xs text-muted-foreground block">
                          {videoError}
                        </span>
                        {flow?.videoUrl && (
                          <details className="text-xs text-muted-foreground text-left">
                            <summary className="cursor-pointer hover:text-foreground">
                              Debug Info
                            </summary>
                            <div className="mt-2 p-2 bg-muted/50 rounded text-xs font-mono break-all space-y-1">
                              <div>
                                <strong>Raw URL:</strong> {flow.videoUrl}
                              </div>
                              <div>
                                <strong>Format:</strong>{" "}
                                {flow.videoUrl
                                  .split(".")
                                  .pop()
                                  ?.toUpperCase() || "Unknown"}
                              </div>
                              {signedVideoUrl && (
                                <div>
                                  <strong>Signed URL:</strong>{" "}
                                  {signedVideoUrl.substring(0, 100)}...
                                </div>
                              )}
                              <div>
                                <strong>Is GCS URL:</strong>{" "}
                                {flow.videoUrl.startsWith(GCS_BUCKET_URL)
                                  ? "Yes"
                                  : "No"}
                              </div>
                            </div>
                          </details>
                        )}
                      </div>
                      <div className="flex gap-2 flex-wrap justify-center">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => {
                            setVideoError(null);
                            setSignedVideoUrl(null);
                            // The useEffect will trigger and retry fetching the signed URL
                          }}
                        >
                          Retry
                        </Button>
                        {flow?.videoUrl && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={async () => {
                                if (flow.videoUrl) {
                                  // Test both the original URL and the signed URL if available
                                  const rawUrlAccessible = await testVideoUrl(
                                    flow.videoUrl,
                                  );
                                  let signedUrlAccessible = false;

                                  if (signedVideoUrl) {
                                    signedUrlAccessible =
                                      await testVideoUrl(signedVideoUrl);
                                  }

                                  let description = "";
                                  let title = "URL Test Results";
                                  if (rawUrlAccessible && signedUrlAccessible) {
                                    description =
                                      "Both raw and signed URLs are accessible. The issue may be with video format or browser compatibility.";
                                  } else if (
                                    rawUrlAccessible &&
                                    !signedUrlAccessible
                                  ) {
                                    title = "Signed URL Issue";
                                    description =
                                      "Raw URL is accessible but signed URL failed. There may be an issue with the signed URL generation.";
                                  } else if (!rawUrlAccessible) {
                                    title = "Raw URL Inaccessible";
                                    description =
                                      "Raw URL is not accessible. The video file may not exist or be unavailable.";
                                  } else {
                                    description =
                                      "URL test completed. Check console for detailed results.";
                                  }

                                  toast({ title, description });
                                }
                              }}
                            >
                              Test URL
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() => {
                                // Prefer signed URL if available, fallback to raw URL
                                const urlToOpen =
                                  signedVideoUrl || flow.videoUrl;
                                if (urlToOpen) {
                                  window.open(urlToOpen, "_blank");
                                }
                              }}
                            >
                              Open Direct
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ) : signedVideoUrl ? (
                  /* Video player container */
                  <div className="relative">
                    <VideoPlayer
                      src={signedVideoUrl}
                      className="relative w-full h-[700px] rounded-md overflow-hidden bg-white"
                      autoPlay={false}
                      muted={false}
                      fitMode="contain"
                      backgroundColor="white"
                      onError={handleVideoError}
                    />
                  </div>
                ) : (
                  /* Placeholder when no signed URL yet */
                  <div className="relative w-full h-[700px] rounded-md overflow-hidden bg-muted/20 border border-border flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2">
                      <Video className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Preparing video...
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Add Node from Video Frame Button */}
        {hasVideo && showVideo && signedVideoUrl && addNewNodes && (
          <div className="bg-muted/30 p-3 rounded-sm border">
            <Button
              onClick={(e) => {
                e.stopPropagation();
                handleAddNodeFromFrame();
              }}
              variant="outline"
              size="sm"
              disabled={isCapturingFrame || !addNewNodes}
              className="w-full h-8 text-xs border-dashed hover:border-solid transition-all rounded-sm"
            >
              {isCapturingFrame ? (
                <>
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  Capturing Frame...
                </>
              ) : (
                <>
                  <Camera className="h-3 w-3 mr-2" />
                  Add Node from Frame
                </>
              )}
            </Button>
          </div>
        )}

        {/* Precondition section */}
        <div className="bg-muted/30 p-3 rounded-sm border">
          <h4 className="text-xs font-medium text-foreground mb-2 flex items-center">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-sm mr-2"></span>
            Precondition
          </h4>
          <textarea
            value={editPrecondition}
            onChange={(e) => {
              setEditPrecondition(e.target.value);
            }}
            onBlur={() => {
              const trimmedPrecondition = editPrecondition.trim();
              if (trimmedPrecondition !== (flow.precondition || "")) {
                onFlowPreconditionRename(flow.id, trimmedPrecondition);
              }
            }}
            className="h-16 min-h-[2rem] max-h-32 text-xs w-full resize-vertical rounded-sm border border-input bg-background px-2 py-1.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
            placeholder="Enter precondition for flow..."
          />
        </div>

        {/* Flow Path section */}
        <div className="bg-muted/30 p-3 rounded-sm border">
          <h4 className="text-xs font-medium text-foreground mb-2 flex items-center">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-sm mr-2"></span>
            Flow Path
          </h4>
          <div className="space-y-1.5">
            {pathNodes.map((node, index) => {
              const isStart = node.id === startNode?.id;
              const isEnd = node.id === endNode?.id;
              const isVia = viaNodes.some((viaNode) => viaNode.id === node.id);
              const nextNode = pathNodes[index + 1];
              const edgeDescription = nextNode
                ? getEdgeDescription(node.id, nextNode.id)
                : "";

              const hasNextNode = nextNode !== undefined;
              const edge =
                hasNextNode && edges
                  ? edges.find(
                      (edgeItem) =>
                        edgeItem.source === node.id &&
                        edgeItem.target === nextNode.id,
                    )
                  : undefined;
              const edgeBusinessLogic =
                typeof edge?.data?.business_logic === "string"
                  ? edge.data.business_logic
                  : "";
              const isEditing = Boolean(
                edge && editingBusinessLogic === edge.id,
              );
              const isFormatting = Boolean(
                edge?.id && formattingEdgeMap[edge.id],
              );
              const canEditLogic = Boolean(edge && onEdgeDetailsChange);
              const isClickable = hasNextNode && onFlowStepClick !== undefined;
              const isStepInteractive = Boolean(
                hasNextNode && (edge || isClickable),
              );
              const isEdgeExpanded = Boolean(
                edge?.id && expandedEdgeIds.has(edge.id),
              );
              const shouldShowLogicSection = Boolean(
                edge && (isEdgeExpanded || isEditing),
              );

              const handleStepClick = () => {
                if (!hasNextNode) {
                  return;
                }

                if (isClickable && nextNode) {
                  onFlowStepClick(node.id, nextNode.id);
                }

                if (edge) {
                  toggleEdgeExpansion(edge.id);
                }
              };

              return (
                <div
                  key={`${flow.id}-${node.id}-${index}`}
                  className="relative"
                >
                  <div className="flex items-start gap-2 p-2 bg-background rounded-sm transition-colors border border-transparent">
                    <div
                      className={`flex items-center justify-center w-5 h-5 rounded-sm text-xs font-medium ${
                        isStart
                          ? "bg-purple-100 text-purple-700 border border-purple-200"
                          : isEnd
                            ? "bg-green-100 text-green-700 border border-green-200"
                            : isVia
                              ? "bg-blue-100 text-blue-700 border border-blue-200"
                              : "bg-gray-100 text-gray-700 border border-gray-200"
                      }`}
                    >
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        onClick={
                          isStepInteractive ? handleStepClick : undefined
                        }
                        className={`${
                          isStepInteractive
                            ? "hover:bg-muted/40 hover:border-border cursor-pointer p-1 rounded-sm -m-1"
                            : ""
                        }`}
                        role={isStepInteractive ? "button" : undefined}
                      >
                        <div
                          className={`text-xs font-medium break-words ${
                            isStart
                              ? "text-purple-700"
                              : isEnd
                                ? "text-green-700"
                                : isVia
                                  ? "text-blue-700"
                                  : "text-foreground"
                          }`}
                        >
                          {String(
                            node.data?.description ||
                              node.data?.label ||
                              `Screen ${node.id}`,
                          )}
                        </div>
                        {edgeDescription && (
                          <div className="text-xs text-muted-foreground mt-0.5 italic break-words">
                            → {edgeDescription}
                          </div>
                        )}
                      </div>
                      {hasNextNode && edge && (
                        <div className="text-xs text-muted-foreground mt-1 pl-2 border-l border-border">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleEdgeExpansion(edge.id);
                            }}
                            data-tutorial="flow-business-logic"
                            className="flex items-center gap-2 mb-1 text-left text-foreground"
                          >
                            <ChevronDown
                              className={`h-3 w-3 transition-transform ${
                                shouldShowLogicSection ? "rotate-180" : ""
                              }`}
                            />
                            <span className="font-medium">Business logic</span>
                          </button>

                          {shouldShowLogicSection && (
                            <div>
                              {isEditing ? (
                                <div>
                                  <textarea
                                    value={businessLogicValue}
                                    onChange={(e) =>
                                      setBusinessLogicValue(e.target.value)
                                    }
                                    onBlur={() => handleBusinessLogicBlur(edge)}
                                    onKeyDown={(event) =>
                                      handleBusinessLogicKeyDown(
                                        event,
                                        edge,
                                        edgeBusinessLogic,
                                      )
                                    }
                                    className="w-full text-xs p-2 border border-input rounded-sm bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[3rem] max-h-20 resize-vertical"
                                    placeholder="Enter business logic..."
                                    autoFocus
                                  />
                                  <div className="flex items-center justify-between mt-1">
                                    <span className="text-[10px] text-muted-foreground">
                                      Click outside or press ⌘+Enter to save
                                    </span>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-6 px-2 text-[11px]"
                                      onMouseDown={() => {
                                        formatClickRef.current = true;
                                      }}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleManualFormat(edge);
                                      }}
                                      disabled={
                                        isFormatting ||
                                        !businessLogicValue.trim()
                                      }
                                    >
                                      {isFormatting ? (
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
                                </div>
                              ) : edgeBusinessLogic ? (
                                <div className="flex items-start gap-2">
                                  <div className="flex-1 text-foreground break-words">
                                    {edgeBusinessLogic}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (canEditLogic && edge) {
                                        expandEdge(edge.id);
                                        setEditingBusinessLogic(edge.id);
                                        setBusinessLogicValue(
                                          edgeBusinessLogic,
                                        );
                                      }
                                    }}
                                    disabled={!canEditLogic}
                                    className={`p-1 rounded-sm transition-colors flex items-center justify-center min-w-[24px] min-h-[24px] ${
                                      canEditLogic
                                        ? "hover:bg-muted/40 text-muted-foreground hover:text-foreground cursor-pointer"
                                        : "text-muted-foreground/50 cursor-not-allowed"
                                    }`}
                                    title={
                                      canEditLogic
                                        ? "Edit business logic"
                                        : "Editing not available"
                                    }
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (canEditLogic && edge) {
                                        expandEdge(edge.id);
                                        setEditingBusinessLogic(edge.id);
                                        setBusinessLogicValue("");
                                      }
                                    }}
                                    disabled={!canEditLogic}
                                    className={`text-xs transition-colors ${
                                      canEditLogic
                                        ? "text-primary hover:text-primary/80 cursor-pointer underline"
                                        : "text-muted-foreground cursor-not-allowed"
                                    }`}
                                  >
                                    Add business logic
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {index < pathNodes.length - 1 && (
                    <div className="flex justify-center py-0.5">
                      <div className="w-px h-2 bg-border"></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Flow chains section */}
        {isLoadingChains ? (
          <div className="bg-muted/30 p-3 rounded-sm border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading flow chains...
            </div>
          </div>
        ) : (
          isReachableFromEntryPoint &&
          flowChains.length > 0 && (
            <div className="bg-muted/30 p-3 rounded-sm border">
              <h4 className="text-xs font-medium text-foreground mb-2 flex items-center">
                <span className="w-1.5 h-1.5 bg-orange-500 rounded-sm mr-2"></span>
                Flow chains from entry points{" "}
                {flowChains.length > 1 && (
                  <Badge
                    variant="outline"
                    className="ml-2 text-xs px-1.5 py-0 h-4 rounded-sm"
                  >
                    {flowChains.length}
                  </Badge>
                )}
              </h4>

              {flowChains.length > 1 && (
                <div className="mb-3">
                  <Select
                    value={(activeChainTab ?? 0).toString()}
                    onValueChange={(value) =>
                      handleChainTabChange(parseInt(value))
                    }
                  >
                    <SelectTrigger className="h-7 text-xs border-border bg-background rounded-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {flowChains.map((chain, index) => (
                        <SelectItem
                          key={index}
                          value={index.toString()}
                          className="text-xs"
                        >
                          {getTabTitle(chain, index)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                {flowChains[activeChainTab ?? 0]?.map(
                  (chainFlow: Flow, index: number) => (
                    <div key={chainFlow.id} className="group">
                      {chainFlow.id === flow.id ? (
                        <div className="p-2 bg-primary/10 text-primary border border-primary/20 rounded-sm">
                          <span className="text-xs font-medium">
                            {chainFlow.name}
                          </span>
                          <Badge
                            variant="secondary"
                            className="ml-2 text-xs px-1.5 py-0 h-4 rounded-sm"
                          >
                            Current
                          </Badge>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onFlowSelect) {
                              onFlowSelect(chainFlow.id);
                            }
                          }}
                          className="w-full text-left p-2 bg-background hover:bg-muted/40 border border-transparent hover:border-border rounded-sm transition-all"
                        >
                          <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                            {chainFlow.name}
                          </span>
                        </button>
                      )}
                      {index < flowChains[activeChainTab ?? 0].length - 1 && (
                        <div className="flex justify-center py-0.5">
                          <div className="w-px h-1.5 bg-border"></div>
                        </div>
                      )}
                    </div>
                  ),
                )}
              </div>
            </div>
          )
        )}

        {/* Check Reachability Button */}
        {onCheckReachability && entryPointIds && entryPointIds.length > 0 && (
          <div className="bg-muted/30 p-3 rounded-sm border hidden">
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onCheckReachability(flow.id);
              }}
              variant="outline"
              size="sm"
              disabled={isLoadingChains}
              className="w-full h-8 text-xs border-dashed hover:border-solid transition-all rounded-sm"
            >
              {isLoadingChains ? (
                <>
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <Link className="h-3 w-3 mr-2" />
                  Check Reachability
                </>
              )}
            </Button>
          </div>
        )}

        <div className="bg-muted/30 p-3 rounded-sm border">
          <button
            onClick={() => setIsScenariosCollapsed(!isScenariosCollapsed)}
            className="flex w-full items-center justify-between py-2 text-xs font-medium text-foreground hover:text-purple-600 transition-colors"
          >
            <span>Scenarios</span>
            <ChevronDown
              className={`h-3 w-3 transition-transform ${!isScenariosCollapsed && "rotate-180"}`}
            />
          </button>

          {!isScenariosCollapsed && (
            <div className="mt-3 -mx-3 -mb-3">
              <Scenarios
                input={mockTestCase}
                setInput={handleScenariosUpdate}
                readOnly={false}
              />
            </div>
          )}
        </div>

        <div className="bg-muted/30 p-3 rounded-sm border">
          <button
            onClick={() => setIsCredentialsCollapsed(!isCredentialsCollapsed)}
            className="flex w-full items-center justify-between py-2 text-xs font-medium text-foreground hover:text-purple-600 transition-colors"
          >
            <span>Credentials</span>
            <ChevronDown
              className={`h-3 w-3 transition-transform ${!isCredentialsCollapsed && "rotate-180"}`}
            />
          </button>

          {!isCredentialsCollapsed && (
            <div className="mt-3 -mx-3 -mb-3 p-3">
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
          )}
        </div>
      </div>
    </div>
  );
};
