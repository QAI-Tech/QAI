"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  CheckCircle,
  Clock,
  PlayCircle,
  Play,
  XCircle,
  ArrowLeft,
  Loader2,
  Edit,
  Trash2,
  MessageCircleMore,
  Video,
  ClosedCaption,
  SkipForward,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useProductSwitcher } from "@/providers/product-provider";
import ProductLoadingScreen from "@/components/global/ProductLoadingScreen";
import { RootState, AppDispatch } from "@/app/store/store";
import { fetchTestRunsForProduct } from "@/app/store/testRunSlice";
import { fetchCredentials } from "@/app/store/credentialsSlice";
import { fetchFeatures } from "@/app/store/featuresSlice";
import { useGraphFlows } from "@/app/context/graph-flows-context";
import {
  categorizeTestRunSchema,
  CommentType,
  TestCaseUnderExecutionSchema,
  TestCaseUnderExecutionStatus,
  TestCaseStep,
  TestCaseStepStatus,
  Feature,
  Criticality,
  TestCaseType,
} from "@/lib/types";
import { cn, isIOSProduct } from "@/lib/utils";
import { useFlowDetailsKeyboardNavigation } from "@/hooks/use-flow-details-keyboard-navigation";
import {
  fetchTestRunUnderExecution,
  setTestRunUnderExecution,
  updateTestCase,
  deleteTestCaseUnderExecution,
  setSelectedTcueId as setSelectedTcueIdAction,
} from "@/app/store/testRunUnderExecutionSlice";

import { StatusLabel, TimeGroup } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useUser } from "@clerk/nextjs";
import { isQaiOrgUser, isQaiOrgAnalystUser, NOVA_USER } from "@/lib/constants";
import { fetchUsers } from "@/app/store/userSlice";
import { CommentsSection } from "@/app/(dashboard)/[product]/homev1/test-runs/_components/tcue-comments-section";
import ScenariosCredentialsDropdown from "@/app/(dashboard)/[product]/homev1/test-runs/_components/scenarios-credentials-dropdown";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { UserAvatar } from "@/components/ui/user-avatar";
import { BulkAssignDialog } from "@/app/(dashboard)/[product]/homev1/test-runs/_components/bulk-assign-dialog";
import { uploadVideo } from "@/app/services/videoUploadService";
import { selectUploadsByTcueId } from "@/app/store/videoUploadSlice";
import { VideoUploadProgress } from "@/app/(dashboard)/[product]/homev1/test-runs/_components/video-upload-progress";
import { VideoPlayer } from "@/components/ui/video-player";
import {
  GCS_BUCKET_URL,
  GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT,
} from "@/lib/constants";
import { ConfirmationDialog } from "@/components/global/delete-confirmation-dialog";
import { DesignReviewCarousel } from "@/app/(dashboard)/[product]/test-runs/_components/design-review-carousel";
import { UXReviewCarousel } from "@/app/(dashboard)/[product]/test-runs/_components/ux-review-carousel";
import {
  TestRunStats,
  calculateTestRunStatusCounts,
} from "@/app/(dashboard)/[product]/test-runs/_components/test-run-stats";
import { calculateDuration } from "@/lib/urlUtlis";
import { TestRunToolbarMenu } from "./_components/test-run-toolbar-menu";
import { GuidedTour, GuidedTourStep } from "@/components/global/guided-tour";
import { clearTutorial } from "@/app/store/tutorialSlice";

const statusConfig: Record<
  StatusLabel,
  {
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    label: string;
  }
> = {
  passed: { icon: CheckCircle, color: "text-green-500", label: "Passed" },
  failed: { icon: XCircle, color: "text-destructive", label: "Failed" },
  running: { icon: PlayCircle, color: "text-primary", label: "Running" },
  pending: { icon: Clock, color: "text-muted-foreground", label: "Pending" },
};

const statusIconForTcue = (status?: TestCaseUnderExecutionStatus) => {
  switch (status) {
    case TestCaseUnderExecutionStatus.PASSED:
      return { icon: CheckCircle, color: "text-green-500" };
    case TestCaseUnderExecutionStatus.FAILED:
    case TestCaseUnderExecutionStatus.ATTEMPT_FAILED:
      return { icon: XCircle, color: "text-destructive" };
    case TestCaseUnderExecutionStatus.SKIPPED:
      return { icon: SkipForward, color: "text-muted-foreground" };
    default:
      return { icon: Clock, color: "text-muted-foreground" };
  }
};

const testTypeLabels: Record<string, string> = {
  functional: "Functional",
  "ui-review": "UI Review",
  "ux-review": "UX Review",
  "ab-testing": "A/B Testing",
  exploratory: "Exploratory",
};

function getTimeGroup(dateString: string): TimeGroup {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  if (date >= today) return "Today";
  if (date >= startOfWeek) return "This Week";
  if (date >= startOfMonth) return "This Month";
  if (date >= startOfLastMonth && date <= endOfLastMonth) return "Last Month";
  return "Earlier";
}

function isHiddenDefaultTestRun(run: categorizeTestRunSchema): boolean {
  const title = (run.title || "").trim().toLowerCase();
  return (
    title === "ui" ||
    title === "ux review" ||
    title === "ux-review" ||
    run.test_run_id === "mock-ui-review-1" ||
    run.test_run_id === "mock-ux-review-1"
  );
}

function TestRunCard({
  run,
  isSelected,
  onClick,
}: {
  run: categorizeTestRunSchema;
  isSelected: boolean;
  onClick: () => void;
}) {
  const totalFlows =
    (run.metrics?.passed ?? 0) +
    (run.metrics?.failed ?? 0) +
    (run.metrics?.blocked ?? 0);

  const isCompleted = run.status === "COMPLETED";
  const hasMetrics = totalFlows > 0;

  const duration =
    run.status === "COMPLETED"
      ? calculateDuration(new Date(run.created_at), new Date(run.updated_at))
      : calculateDuration(new Date(run.created_at), new Date());

  const passedCount = parseInt(run.status_counts?.passed || "0", 10);
  const failedCount = parseInt(run.status_counts?.failed || "0", 10);

  const status: StatusLabel = (() => {
    if (!isCompleted) {
      return hasMetrics ? "running" : "pending";
    }
    if (failedCount > 0) {
      return "failed";
    }
    if (passedCount > 0 && failedCount === 0) {
      return "passed";
    }
    return "pending";
  })();

  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "bg-card border-2 rounded-lg p-4 cursor-pointer transition-all duration-200 ease-default",
        isSelected
          ? "border-primary shadow-lg shadow-primary/10"
          : "border-border hover:border-primary/30 hover:shadow-md",
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <StatusIcon
            className={cn("h-5 w-5 mt-0.5 flex-shrink-0", config.color)}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                className={cn(
                  "font-medium truncate transition-colors duration-200 ease-default",
                  isSelected ? "text-primary" : "text-foreground",
                )}
              >
                {run.title}
              </h3>
              {run.test_run_type && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0">
                  {testTypeLabels[run.test_run_type] || run.test_run_type}
                </span>
              )}
            </div>
            <div className="mt-1.5 text-sm text-muted-foreground">
              {[
                typeof run.tcue_count === "number" &&
                  `${run.tcue_count} flow${run.tcue_count !== 1 ? "s" : ""}`,
                parseInt(run.status_counts?.passed || "0", 10) > 0 &&
                  `${run.status_counts!.passed} passed`,
                parseInt(run.status_counts?.failed || "0", 10) > 0 &&
                  `${run.status_counts!.failed} failed`,
              ]
                .filter(Boolean)
                .join(" • ")}
            </div>
          </div>
        </div>
        {duration && isCompleted && (
          <div className="text-xs text-muted-foreground flex-shrink-0 ml-2">
            {duration}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function SectionedRunsList({
  groupedRuns,
  selectedRun,
  onSelect,
}: {
  groupedRuns: Record<TimeGroup, categorizeTestRunSchema[]>;
  selectedRun: categorizeTestRunSchema | null;
  onSelect: (run: categorizeTestRunSchema) => void;
}) {
  const groupOrder: TimeGroup[] = [
    "Today",
    "This Week",
    "This Month",
    "Last Month",
    "Earlier",
  ];

  return (
    <AnimatePresence mode="popLayout">
      {groupOrder.map((group) => {
        const runs = groupedRuns[group] || [];
        const visibleRuns = runs.filter((run) => !isHiddenDefaultTestRun(run));
        if (visibleRuns.length === 0) return null;
        return (
          <motion.div
            key={group}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              {group}
            </h3>
            <div className="space-y-2">
              {visibleRuns.map((run) => (
                <TestRunCard
                  key={run.test_run_id}
                  run={run}
                  isSelected={selectedRun?.test_run_id === run.test_run_id}
                  onClick={() => onSelect(run)}
                />
              ))}
            </div>
          </motion.div>
        );
      })}
    </AnimatePresence>
  );
}

function statusPillForTcue(status?: TestCaseUnderExecutionStatus) {
  switch (status) {
    case TestCaseUnderExecutionStatus.PASSED:
      return {
        label: "Passed",
        icon: CheckCircle,
        className: "bg-green-50 text-green-700 border-green-200",
      };
    case TestCaseUnderExecutionStatus.FAILED:
    case TestCaseUnderExecutionStatus.ATTEMPT_FAILED:
      return {
        label: "Failed",
        icon: XCircle,
        className: "bg-red-50 text-red-700 border-red-200",
      };
    case TestCaseUnderExecutionStatus.SKIPPED:
      return {
        label: "Skipped",
        icon: SkipForward,
        className: "bg-muted text-muted-foreground border-border",
      };
    case TestCaseUnderExecutionStatus.UNTESTED:
    case TestCaseUnderExecutionStatus.DEFAULT:
    default:
      return {
        label: "Untested",
        icon: Clock,
        className: "bg-muted text-muted-foreground border-border",
      };
  }
}

function normalizeExecutorStatus(
  status?: TestCaseUnderExecutionStatus,
): TestCaseUnderExecutionStatus {
  if (!status || status === TestCaseUnderExecutionStatus.DEFAULT) {
    return TestCaseUnderExecutionStatus.UNTESTED;
  }
  if (status === TestCaseUnderExecutionStatus.ATTEMPT_FAILED) {
    return TestCaseUnderExecutionStatus.FAILED;
  }
  return status;
}

function TestRunFlowDetailsPanel({
  tcue,
  mode,
  onBack,
  productId,
  testRunId,
  testType,
  onTcueChange,
}: {
  tcue: TestCaseUnderExecutionSchema;
  mode: "viewer" | "executor" | "reviewer";
  onBack: () => void;
  productId?: string;
  testRunId?: string;
  testType?: string;
  onTcueChange?: (tcueId: string) => void;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useUser();
  const { productSwitcher } = useProductSwitcher();
  const { flows } = useGraphFlows();
  const isEditMode = mode === "executor" || mode === "reviewer";
  const commentsReadOnly = mode === "reviewer";

  const { testRunUnderExecution } = useSelector(
    (state: RootState) => state.testRunsUnderExecution,
  );

  const flowTcueList = useMemo(() => {
    if (!tcue.flow_id) return [tcue];
    return testRunUnderExecution.filter((tc) => tc.flow_id === tcue.flow_id);
  }, [tcue.flow_id, testRunUnderExecution, tcue]);

  const selectedTcueIndex = useMemo(() => {
    return flowTcueList.findIndex((tc) => tc.id === tcue.id);
  }, [flowTcueList, tcue.id]);
  const [stepIndex, setStepIndex] = useState(0);
  const [hasNavigatedSteps, setHasNavigatedSteps] = useState(false);
  const [notesDraft, setNotesDraft] = useState(tcue.notes || "");
  const [pendingStatus, setPendingStatus] =
    useState<TestCaseUnderExecutionStatus>(
      normalizeExecutorStatus(
        tcue.status as TestCaseUnderExecutionStatus | undefined,
      ),
    );
  const [isSaving, setIsSaving] = useState(false);
  const [comments, setComments] = useState<CommentType[]>([]);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showVideoDeleteDialog, setShowVideoDeleteDialog] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [executionVideoHttp, setExecutionVideoHttp] = useState<string | null>(
    null,
  );
  const [currentVideoTime, setCurrentVideoTime] = useState(0);

  const lastTcueIdRef = useRef<string | null>(null);

  interface FreeAnnotation {
    id: string;
    text: string;
    timestamp: number;
    step_id?: string;
  }
  const [freeAnnotations, setFreeAnnotations] = useState<FreeAnnotation[]>([]);

  const uploadsForThisTcue = useSelector((state: RootState) =>
    selectUploadsByTcueId(state, tcue.id),
  );
  const isUploading = uploadsForThisTcue.some(
    (upload) => upload.status === "uploading",
  );

  useEffect(() => {
    const isNewTcue = lastTcueIdRef.current !== tcue.id;
    lastTcueIdRef.current = tcue.id;
    if (!isNewTcue) return;

    setStepIndex(0);
    setHasNavigatedSteps(false);
    setNotesDraft(tcue.notes || "");
    setPendingStatus(
      normalizeExecutorStatus(
        tcue.status as TestCaseUnderExecutionStatus | undefined,
      ),
    );
    setIsVideoPlaying(false);
    setCurrentVideoTime(0);
  }, [tcue.id]);

  useEffect(() => {
    if (showStatusDropdown) return;
    setNotesDraft(tcue.notes || "");
    setPendingStatus(
      normalizeExecutorStatus(
        tcue.status as TestCaseUnderExecutionStatus | undefined,
      ),
    );
  }, [showStatusDropdown, tcue.notes, tcue.status]);

  useEffect(() => {
    if (mode !== "reviewer" || !tcue.annotations) {
      setFreeAnnotations([]);
      return;
    }

    try {
      const parsed =
        typeof tcue.annotations === "string"
          ? JSON.parse(tcue.annotations)
          : tcue.annotations;

      if (!Array.isArray(parsed)) {
        setFreeAnnotations([]);
        return;
      }

      const testSteps = Array.isArray(tcue.test_case_steps)
        ? tcue.test_case_steps
        : [];

      if (parsed.length > 0 && typeof parsed[0] === "string") {
        const normalized: FreeAnnotation[] = parsed.map(
          (ann: string, index: number) => {
            const parts = ann.split(":");
            let timestampNum = Number(parts[0]);
            let stepId: string | undefined = undefined;

            if (isNaN(timestampNum)) timestampNum = 0;
            if (parts.length > 1) {
              stepId = parts[1];
            }

            const stepIndex = stepId
              ? testSteps.findIndex((s) => s.test_step_id === stepId)
              : -1;
            const stepNumber =
              stepIndex >= 0 ? stepIndex + 1 : stepId || index + 1;

            return {
              id: crypto.randomUUID(),
              text: `Step ${stepNumber} annotation at ${Math.floor(timestampNum / 60)}:${Math.floor(
                timestampNum % 60,
              )
                .toString()
                .padStart(2, "0")}`,
              timestamp: timestampNum,
              step_id: stepId,
            };
          },
        );
        setFreeAnnotations(normalized);
        return;
      }

      if (
        parsed.length > 0 &&
        typeof parsed[0] === "object" &&
        parsed[0] !== null &&
        "timestamp" in parsed[0]
      ) {
        const normalized: FreeAnnotation[] = parsed.map(
          (
            ann: {
              timestamp: string | number;
              step_id?: string | number | null;
            },
            index: number,
          ) => {
            let timestampNum = Number(ann.timestamp);
            if (isNaN(timestampNum)) timestampNum = 0;

            const stepIdStr = ann.step_id ? String(ann.step_id) : undefined;
            const stepIndex = stepIdStr
              ? testSteps.findIndex((s) => s.test_step_id === stepIdStr)
              : -1;
            const stepNumber =
              stepIndex >= 0 ? stepIndex + 1 : stepIdStr || index + 1;

            return {
              id: crypto.randomUUID(),
              text: `Step ${stepNumber} annotation at ${Math.floor(timestampNum / 60)}:${Math.floor(
                timestampNum % 60,
              )
                .toString()
                .padStart(2, "0")}`,
              timestamp: timestampNum,
              step_id: stepIdStr,
            };
          },
        );
        setFreeAnnotations(normalized);
        return;
      }

      setFreeAnnotations([]);
    } catch (error) {
      console.error("Failed to parse annotations:", error);
      setFreeAnnotations([]);
    }
  }, [mode, tcue.annotations, tcue.test_case_steps]);

  useEffect(() => {
    if (!tcue.comments) {
      setComments([]);
      return;
    }

    try {
      const parsed = JSON.parse(tcue.comments);
      setComments(Array.isArray(parsed) ? (parsed as CommentType[]) : []);
    } catch {
      setComments([]);
    }
  }, [tcue.comments]);

  const steps: TestCaseStep[] = Array.isArray(tcue.test_case_steps)
    ? tcue.test_case_steps
    : [];

  const totalSteps = steps.length;
  const currentStep = steps[stepIndex];

  const pill = statusPillForTcue(tcue.status);
  const StatusIcon = pill.icon;
  const isFailedLike = pendingStatus === TestCaseUnderExecutionStatus.FAILED;

  const renderVideoFrame = (fullWidth = false) => {
    const sizeClass = fullWidth
      ? "w-full h-[600px]"
      : "w-full max-w-[280px] h-[600px]";

    if (isVideoPlaying && executionVideoHttp) {
      return (
        <div
          className={`bg-muted rounded-lg relative overflow-hidden border-2 border-primary/20 ${sizeClass}`}
        >
          <VideoPlayer
            src={executionVideoHttp}
            autoPlay={true}
            className="w-full h-full"
            fitMode="contain"
            backgroundColor="transparent"
            onTimeUpdate={(currentTime) => {
              setCurrentVideoTime(currentTime);
            }}
          />
        </div>
      );
    }

    return (
      <div
        className={`bg-muted rounded-lg flex items-center justify-center cursor-pointer group relative overflow-hidden border-2 border-primary/20 hover:border-primary transition-colors duration-fast ${sizeClass}`}
        onClick={() => {
          if (tcue.execution_video_url && executionVideoHttp) {
            setIsVideoPlaying(true);
          }
        }}
      >
        {tcue.execution_video_url ? (
          <>
            {/* Video thumbnail */}
            {executionVideoHttp && (
              <div className="absolute inset-0">
                <VideoPlayer
                  src={executionVideoHttp}
                  className="w-full h-full"
                  fitMode="contain"
                  backgroundColor="transparent"
                  autoPlay={false}
                  currentTime={2} // Shows thumbnail of 2 seconds from video
                  muted={true}
                />
              </div>
            )}
            {/* Play button overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors">
              <Play className="h-10 w-10 text-white group-hover:scale-110 transition-transform duration-fast" />
            </div>
          </>
        ) : (
          <div className="text-center">
            <Play className="h-10 w-10 text-primary mx-auto mb-2" />
            <p className="text-sm text-primary">No video</p>
          </div>
        )}
      </div>
    );
  };

  const metaGraphs = useMemo(() => {
    try {
      if (!tcue?.metadata) {
        return {
          nodes: [] as Array<{ id?: string; data?: Record<string, unknown> }>,
          nodesById: null as Record<string, unknown> | null,
          edgesById: null as Record<string, unknown> | null,
        };
      }
      const meta = JSON.parse(tcue.metadata);
      const graph = meta?.tc_graph_json;
      if (!graph?.nodes || !graph?.edges || !Array.isArray(graph.nodes)) {
        return {
          nodes: [] as Array<{ id?: string; data?: Record<string, unknown> }>,
          nodesById: null as Record<string, unknown> | null,
          edgesById: null as Record<string, unknown> | null,
        };
      }

      const nodesById = (graph.nodes as Array<{ id?: string }>).reduce(
        (acc: Record<string, unknown>, n) => {
          if (n?.id) acc[n.id] = n;
          return acc;
        },
        {} as Record<string, unknown>,
      );
      const edgesById = (graph.edges as Array<{ id?: string }>).reduce(
        (acc: Record<string, unknown>, e) => {
          if (e?.id) acc[e.id] = e;
          return acc;
        },
        {} as Record<string, unknown>,
      );

      return {
        nodes: graph.nodes as Array<{
          id?: string;
          data?: Record<string, unknown>;
        }>,
        nodesById,
        edgesById,
      };
    } catch (error) {
      console.error("Failed to parse TCUE metadata:", error);
      return {
        nodes: [] as Array<{ id?: string; data?: Record<string, unknown> }>,
        nodesById: null as Record<string, unknown> | null,
        edgesById: null as Record<string, unknown> | null,
      };
    }
  }, [tcue?.metadata]);

  const isUIReviewType = testType === "ui-review";
  const isUXReviewType = testType === "ux-review";

  const reviewScreens = useMemo(() => {
    const nodes = metaGraphs.nodes || [];
    const fromNodes = nodes
      .map((n, idx) => {
        const data = (n as { data?: { title?: string; description?: string } })
          ?.data;
        const title = data?.title?.trim();
        const desc = data?.description?.trim();
        return title || desc || `Screen ${idx + 1}`;
      })
      .filter(Boolean);

    if (fromNodes.length > 0) return fromNodes;
    if (steps.length > 0) {
      return Array.from(
        { length: steps.length + 1 },
        (_, i) => `Screen ${i + 1}`,
      );
    }
    return ["Screen 1"];
  }, [metaGraphs.nodes, steps.length]);

  const currentStepEdgeInfo = useMemo(() => {
    try {
      const { nodesById, edgesById, nodes } = metaGraphs;
      if (!currentStep)
        return { screenName: "", sourceNodeId: null, targetNodeId: null };

      const edgeId =
        (currentStep as unknown as { edge_id?: string })?.edge_id ||
        (currentStep as unknown as { edgeId?: string })?.edgeId;

      // First, with edge_id we try to get node IDs from metadata
      if (
        edgeId &&
        edgesById &&
        (edgesById as Record<string, unknown>)[edgeId]
      ) {
        const edge = (edgesById as Record<string, unknown>)[edgeId] as {
          source?: string;
          target?: string;
        };
        const sourceNodeId = edge?.source;
        const targetNodeId = edge?.target;
        const nodeId = sourceNodeId || targetNodeId;

        let screenName = "";
        if (
          nodeId &&
          nodesById &&
          (nodesById as Record<string, unknown>)[nodeId]
        ) {
          const node = (nodesById as Record<string, unknown>)[nodeId] as {
            data?: { title?: string; description?: string };
          };
          const title = node?.data?.title?.trim();
          const desc = node?.data?.description?.trim();
          screenName = title || desc || (nodeId ? `Node ${nodeId}` : "");
        }

        return {
          screenName,
          sourceNodeId: sourceNodeId || null,
          targetNodeId: targetNodeId || null,
        };
      }

      if (tcue.flow_id && flows.length > 0) {
        const flow = flows.find((f) => f.id === tcue.flow_id);
        if (flow?.pathNodeIds && Array.isArray(flow.pathNodeIds)) {
          if (stepIndex >= 0 && stepIndex < flow.pathNodeIds.length - 1) {
            const sourceNodeId = flow.pathNodeIds[stepIndex];
            const targetNodeId = flow.pathNodeIds[stepIndex + 1];
            return {
              screenName: "",
              sourceNodeId: sourceNodeId || null,
              targetNodeId: targetNodeId || null,
            };
          } else if (stepIndex === flow.pathNodeIds.length - 1) {
            const nodeId = flow.pathNodeIds[stepIndex];
            return {
              screenName: "",
              sourceNodeId: nodeId || null,
              targetNodeId: nodeId || null,
            };
          }
        }
      }

      // Fallback: use ordered nodes array by step index if present
      const maybeNode = nodes?.[stepIndex] as
        | { id?: string; data?: { title?: string; description?: string } }
        | undefined;
      const title = maybeNode?.data?.title?.trim();
      const desc = maybeNode?.data?.description?.trim();
      const screenName =
        title || desc || (maybeNode?.id ? `Node ${maybeNode.id}` : "");
      return {
        screenName,
        sourceNodeId: maybeNode?.id || null,
        targetNodeId: null,
      };
    } catch {
      return { screenName: "", sourceNodeId: null, targetNodeId: null };
    }
  }, [currentStep, metaGraphs, stepIndex, tcue.flow_id, flows]);

  const screenNameFromGraph = currentStepEdgeInfo.screenName;

  useEffect(() => {
    if (
      stepIndex === 0 &&
      currentStepEdgeInfo.sourceNodeId &&
      currentStepEdgeInfo.targetNodeId &&
      !hasNavigatedSteps
    ) {
      const timeoutId = setTimeout(() => {
        setHasNavigatedSteps(true);
      }, 150);

      return () => clearTimeout(timeoutId);
    }
  }, [
    tcue.id,
    stepIndex,
    currentStepEdgeInfo.sourceNodeId,
    currentStepEdgeInfo.targetNodeId,
    hasNavigatedSteps,
  ]);

  useEffect(() => {
    if (
      !hasNavigatedSteps ||
      !currentStepEdgeInfo.sourceNodeId ||
      !currentStepEdgeInfo.targetNodeId
    )
      return;

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("testRunStepNavigate", {
          detail: {
            sourceNodeId: currentStepEdgeInfo.sourceNodeId,
            targetNodeId: currentStepEdgeInfo.targetNodeId,
          },
        }),
      );
    }
  }, [currentStepEdgeInfo, stepIndex, hasNavigatedSteps]);

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
      if (stepIndex > 0) {
        setHasNavigatedSteps(true);
        setStepIndex((i) => i - 1);
      }
    },
    onStepNext: () => {
      if (stepIndex < totalSteps - 1 && totalSteps > 0) {
        setHasNavigatedSteps(true);
        setStepIndex((i) => i + 1);
      }
    },
    onClose: onBack,
    canGoToPreviousStep: stepIndex > 0,
    canGoToNextStep: stepIndex < totalSteps - 1 && totalSteps > 0,
    isDialogOpen: showVideoDeleteDialog || showStatusDropdown,
  });

  const parsedStep = useMemo(() => {
    const text = currentStep?.step_description || "";
    if (!text.trim()) return { screen: "", action: "" };

    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length >= 2) {
      return { screen: lines[0], action: lines.slice(1).join("\n") };
    }
    const colonIdx = text.indexOf(":");
    if (colonIdx > 0 && colonIdx < 80) {
      const left = text.slice(0, colonIdx).trim();
      const right = text.slice(colonIdx + 1).trim();
      if (left && right) return { screen: left, action: right };
    }
    return { screen: "On", action: text };
  }, [currentStep?.step_description]);

  const displayScreenName =
    screenNameFromGraph?.trim() ||
    (parsedStep.screen?.trim() && parsedStep.screen.trim() !== "On"
      ? parsedStep.screen.trim()
      : "");

  const handleMarkExecuted = async () => {
    if (!currentStep || isSaving) return;

    const isCurrentlyComplete =
      currentStep.status === TestCaseStepStatus.COMPLETE;
    const newStatus = isCurrentlyComplete
      ? TestCaseStepStatus.INCOMPLETE
      : TestCaseStepStatus.COMPLETE;

    const updatedSteps = steps.map((step, idx) =>
      idx === stepIndex ? { ...step, status: newStatus } : step,
    );

    const success = await saveUpdate({ test_case_steps: updatedSteps });

    if (success) {
      toast.success(
        isCurrentlyComplete
          ? "Step marked as not executed"
          : "Step marked as executed",
      );
    }
  };

  useEffect(() => {
    const fetchVideoSignedUrl = async () => {
      if (!tcue.execution_video_url) {
        setExecutionVideoHttp(null);
        return;
      }

      const raw = tcue.execution_video_url;

      try {
        const response = await fetch(
          raw?.startsWith(GCS_BUCKET_URL)
            ? `${GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT}${raw.substring(GCS_BUCKET_URL.length)}`
            : `${GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT}${raw}`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch video signed URL");
        }

        const { signedUrl } = await response.json();
        setExecutionVideoHttp(signedUrl);
      } catch (error) {
        console.error("Error while fetching the video signed URL:", error);
        setExecutionVideoHttp(null);
      }
    };

    fetchVideoSignedUrl();
  }, [tcue.execution_video_url]);

  const handleAddStepAnnotation = async () => {
    if (!currentStep) {
      toast.error("Cannot add annotation - step not found");
      return;
    }

    if (!tcue.execution_video_url || !executionVideoHttp) {
      toast.error("Cannot add annotation - video is not available");
      return;
    }

    const videoTime = currentVideoTime || 0;

    const testStepId = currentStep.test_step_id || String(stepIndex + 1);

    const existingAnnotation = freeAnnotations.find(
      (ann) => ann.step_id === testStepId,
    );
    if (existingAnnotation) {
      toast.error(`Step ${stepIndex + 1} already has an annotation`);
      return;
    }

    const newAnnotation: FreeAnnotation = {
      id: Date.now().toString(),
      text: `Step ${stepIndex + 1} annotation at ${Math.floor(videoTime / 60)}:${Math.floor(
        videoTime % 60,
      )
        .toString()
        .padStart(2, "0")}`,
      timestamp: videoTime,
      step_id: testStepId,
    };

    const updatedAnnotations = [...freeAnnotations, newAnnotation];
    setFreeAnnotations(updatedAnnotations);

    const annotationData = updatedAnnotations.map((annotation) => {
      if (annotation.step_id) {
        return `${annotation.timestamp}:${annotation.step_id}`;
      } else {
        return annotation.timestamp.toString();
      }
    });

    await saveUpdate({ annotations: annotationData });

    toast.success(
      `Step ${stepIndex + 1} annotation added at ${Math.floor(videoTime / 60)}:${Math.floor(
        videoTime % 60,
      )
        .toString()
        .padStart(2, "0")}`,
    );
  };

  const handleDeleteAnnotation = async (annotationId: string) => {
    const updatedAnnotations = freeAnnotations.filter(
      (ann) => ann.id !== annotationId,
    );
    setFreeAnnotations(updatedAnnotations);

    const annotationData = updatedAnnotations.map((annotation) => {
      if (annotation.step_id) {
        return `${annotation.timestamp}:${annotation.step_id}`;
      } else {
        return annotation.timestamp.toString();
      }
    });

    await saveUpdate({ annotations: annotationData });
    toast.success("Annotation removed");
  };

  const handleGoToAnnotation = (annotationId: string) => {
    const annotation = freeAnnotations.find((ann) => ann.id === annotationId);

    if (!annotation || typeof annotation.timestamp !== "number") {
      toast.error("Cannot navigate to annotation");
      return;
    }

    if (!isVideoPlaying && executionVideoHttp) {
      setIsVideoPlaying(true);
    }

    setTimeout(() => {
      const videoElement = document.querySelector("video") as HTMLVideoElement;
      if (videoElement) {
        videoElement.currentTime = annotation.timestamp;
        videoElement.play();
      }
    }, 100);
  };

  const saveUpdate = async (
    partial: Partial<TestCaseUnderExecutionSchema>,
  ): Promise<boolean> => {
    setIsSaving(true);
    try {
      const resp = await fetch("/api/update-test-case-under-execution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updateTestCaseUnderExecution: {
            test_case_under_execution_id: tcue.id,
            ...partial,
          },
        }),
      });
      if (!resp.ok) {
        const data = await resp
          .json()
          .catch((e: Error) => ({ error: e.message }));
        throw new Error(data?.error || "Failed to update flow");
      }

      const result = await resp.json();
      const updatedTestCase = result.updated_test_case_under_execution;

      if (updatedTestCase) {
        dispatch(updateTestCase({ id: tcue.id, updatedData: updatedTestCase }));
      } else {
        dispatch(updateTestCase({ id: tcue.id, updatedData: partial }));
      }

      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleExecutorStatusChange = async (next: string) => {
    const normalized = (next || "").toUpperCase();
    const nextStatus =
      normalized === TestCaseUnderExecutionStatus.PASSED
        ? TestCaseUnderExecutionStatus.PASSED
        : normalized === TestCaseUnderExecutionStatus.SKIPPED
          ? TestCaseUnderExecutionStatus.SKIPPED
          : normalized === TestCaseUnderExecutionStatus.FAILED
            ? TestCaseUnderExecutionStatus.FAILED
            : TestCaseUnderExecutionStatus.UNTESTED;

    setPendingStatus(nextStatus);

    if (nextStatus === TestCaseUnderExecutionStatus.FAILED) return;

    const success = await saveUpdate({ status: nextStatus });
    if (success) {
      setShowStatusDropdown(false);
    }
  };

  const handleExecutorSave = async () => {
    if (pendingStatus === TestCaseUnderExecutionStatus.FAILED) {
      const reason = notesDraft.trim();
      if (!reason) {
        toast.error("Please enter failure reason");
        return;
      }
      const success = await saveUpdate({
        status: TestCaseUnderExecutionStatus.FAILED,
        notes: reason,
      });
      if (success) {
        setShowStatusDropdown(false);
      }
      return;
    }

    const success = await saveUpdate({ status: pendingStatus });
    if (success) {
      setShowStatusDropdown(false);
    }
  };

  const handleExecutorCancel = () => {
    setPendingStatus(
      normalizeExecutorStatus(
        tcue.status as TestCaseUnderExecutionStatus | undefined,
      ),
    );
    setNotesDraft(tcue.notes || "");
    setShowStatusDropdown(false);
  };

  const handleRemoveFromRun = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const resp = await fetch(
        "/api/delete-test-case-under-execution-from-test-run",
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            test_case_under_execution_ids: [tcue.id],
          }),
        },
      );
      if (!resp.ok) {
        const data = await resp
          .json()
          .catch((e: Error) => ({ error: e.message }));
        throw new Error(data?.error || "Failed to remove from run");
      }
      dispatch(deleteTestCaseUnderExecution(tcue.id));
      toast.success("Removed from test run");
      onBack();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove from run");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleVideoUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    try {
      const file = files[0];
      const finalProductId = productId || productSwitcher.product_id;
      if (!finalProductId || !testRunId) {
        toast.error("Required details not found");
        return;
      }

      const organisationId =
        (user?.publicMetadata?.organisation_id as string | undefined) || "";

      await uploadVideo(
        file,
        tcue.id,
        finalProductId,
        testRunId,
        organisationId,
        async (videoUrl: string) => {
          const response = await fetch(
            "/api/update-test-case-under-execution",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                updateTestCaseUnderExecution: {
                  test_case_under_execution_id: tcue.id,
                  execution_video_url: videoUrl,
                },
              }),
            },
          );

          if (!response.ok) {
            throw new Error(
              "Failed to update test case under execution with video URL",
            );
          }

          const data = await response.json();
          const updatedTestCase = data.updated_test_case_under_execution;

          dispatch(
            updateTestCase({ id: tcue.id, updatedData: updatedTestCase }),
          );

          toast.success("Video uploaded successfully");
        },
      );
    } catch (error) {
      console.error("Error during file upload:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to upload video",
      );
    } finally {
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  };

  const handleDeleteVideo = async () => {
    if (!tcue.id || isSaving) return;

    setIsDeleting(true);

    try {
      const response = await fetch("/api/update-test-case-under-execution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updateTestCaseUnderExecution: {
            test_case_under_execution_id: tcue.id,
            execution_video_url: "",
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete video");
      }

      const data = await response.json();
      const updatedTestCase = data.updated_test_case_under_execution;

      dispatch(
        updateTestCase({
          id: tcue.id,
          updatedData: updatedTestCase,
        }),
      );

      setExecutionVideoHttp(null);
      setIsVideoPlaying(false);
      setCurrentVideoTime(0);

      toast.success("Video deleted successfully");
      setShowVideoDeleteDialog(false);
    } catch (error) {
      console.error("Error deleting video:", error);
      toast.error("Failed to delete video");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveComments: (
    data: Partial<{
      notes: string;
      status: TestCaseUnderExecutionStatus;
      criticality: Criticality;
      execution_video_url: string;
      screenshot_url: string;
      comments: CommentType[];
      test_case_description: string;
      preconditions: string[];
      test_case_steps: TestCaseStep[];
    }>,
  ) => Promise<boolean> = async (data) => {
    if (!data.comments) return false;
    const success = await saveUpdate({
      comments: JSON.stringify(data.comments),
    });
    if (success) {
      setComments(data.comments);
    }
    return success;
  };

  return (
    <div className="h-full flex p-1 flex-col overflow-y-auto">
      <div className="flex-shrink-0 flex flex-col">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground transition-colors duration-fast"
          ></button>
          <div className="flex-1 flex flex-col">
            <div className="text-lg font-semibold text-foreground">
              {tcue.title || "Flow"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Use Shift + Left/Right to switch flows
            </div>
          </div>
          {isEditMode && (
            <button
              onClick={handleRemoveFromRun}
              disabled={isDeleting}
              title="Remove from Run"
              className="text-muted-foreground hover:text-destructive transition-colors duration-fast"
            >
              {isDeleting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Trash2 className="h-5 w-5" />
              )}
            </button>
          )}
        </div>

        {isEditMode ? (
          <div className="mb-3">
            {!showStatusDropdown ? (
              <div className="space-y-2">
                <div
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 flex items-center justify-between text-sm",
                    pill.className,
                  )}
                >
                  <div className="flex items-center gap-2">
                    <StatusIcon className="h-4 w-4" />
                    <span className="font-medium">{pill.label}</span>
                  </div>
                  <button
                    onClick={() => setShowStatusDropdown(true)}
                    className="text-sm text-primary hover:text-primary/80 transition-colors duration-fast"
                  >
                    Change
                  </button>
                </div>
                {/* Shows failed notes outside of dialog when status is Failed */}
                {pill.label === "Failed" && tcue.notes && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md p-2 whitespace-pre-wrap">
                    <span className="font-medium">Outcome: </span>
                    {tcue.notes}
                  </div>
                )}
              </div>
            ) : (
              <div
                className={cn(
                  "w-full rounded-xl border p-4",
                  isFailedLike
                    ? "bg-red-50 border-red-200"
                    : "bg-muted/30 border-border",
                )}
              >
                <Select
                  value={pendingStatus.toLowerCase()}
                  onValueChange={handleExecutorStatusChange}
                  disabled={isSaving}
                >
                  <SelectTrigger className="h-10 w-full border-2 border-purple-500 focus:ring-0 focus:ring-offset-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="untested">Untested</SelectItem>
                    <SelectItem value="passed">Passed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="skipped">Skipped</SelectItem>
                  </SelectContent>
                </Select>

                {pendingStatus === TestCaseUnderExecutionStatus.FAILED && (
                  <div className="mt-3 space-y-3">
                    <Textarea
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      placeholder="Enter failure reason..."
                      className="resize-none text-sm text-foreground min-h-[72px]"
                      disabled={isSaving}
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="v2"
                        size="sm"
                        className="px-6"
                        disabled={isSaving || !notesDraft.trim()}
                        onClick={async () => {
                          await handleExecutorSave();
                          setShowStatusDropdown(false);
                        }}
                      >
                        Save
                      </Button>
                      <Button
                        type="button"
                        variant="v2-outline"
                        size="sm"
                        className="px-6"
                        disabled={isSaving}
                        onClick={handleExecutorCancel}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
                {pendingStatus !== TestCaseUnderExecutionStatus.FAILED && (
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="v2-outline"
                      size="sm"
                      className="px-6"
                      disabled={isSaving}
                      onClick={handleExecutorCancel}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div
              className={cn(
                "w-full rounded-lg border px-3 py-2 flex items-center gap-2 text-sm",
                pill.className,
              )}
            >
              <StatusIcon className="h-4 w-4" />
              <span className="font-medium">{pill.label}</span>
            </div>
            {pill.label === "Failed" && tcue.notes && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md p-2 whitespace-pre-wrap">
                <span className="font-medium">Outcome: </span>
                {tcue.notes}
              </div>
            )}
          </div>
        )}

        <>
          {tcue.test_case_description && (
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed mb-3">
              {tcue.test_case_description}
            </p>
          )}

          {Array.isArray(tcue.preconditions) &&
            tcue.preconditions.length > 0 && (
              <div className="mt-1 mb-3">
                <span className="text-xs font-medium text-muted-foreground mb-1 block">
                  Preconditions:
                </span>
                <div className="text-sm text-foreground whitespace-pre-wrap">
                  {tcue.preconditions.join("\n")}
                </div>
              </div>
            )}

          {flowTcueList.length > 1 && (
            <>
              <div className="border-t border-border my-4 flex-shrink-0" />
              <div className="mt-1 mb-3">
                <span className="text-xs font-medium text-muted-foreground mb-1 block">
                  Scenarios &amp; Credentials:
                </span>
                <ScenariosCredentialsDropdown
                  testCasesUnderExecution={flowTcueList}
                  selectedTcueIndex={
                    selectedTcueIndex >= 0 ? selectedTcueIndex : 0
                  }
                  onTcueSelect={(index) => {
                    const selectedTcue = flowTcueList[index];
                    if (selectedTcue && onTcueChange) {
                      onTcueChange(selectedTcue.id);
                    }
                  }}
                  placeholder="Select scenario / credentials..."
                />
              </div>
            </>
          )}
        </>
      </div>

      <div className="border-t border-border my-4 flex-shrink-0" />

      <div className="flex-1 min-h-0 flex flex-col">
        {isUIReviewType ? (
          <DesignReviewCarousel screens={reviewScreens} />
        ) : isUXReviewType ? (
          <UXReviewCarousel screens={reviewScreens} />
        ) : mode === "reviewer" ? (
          <div className="flex gap-4 items-start">
            <div className="flex-1 flex flex-col">
              <div className="flex items-center justify-center gap-4 mb-3">
                <button
                  onClick={() => {
                    setHasNavigatedSteps(true);
                    setStepIndex((i) => Math.max(0, i - 1));
                  }}
                  disabled={stepIndex === 0}
                  className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors duration-fast"
                >
                  &lt;&lt;
                </button>
                <span className="text-sm font-medium text-foreground">
                  Step {totalSteps === 0 ? 0 : stepIndex + 1} of {totalSteps}
                </span>
                <button
                  onClick={() => {
                    setHasNavigatedSteps(true);
                    setStepIndex((i) => Math.min(totalSteps - 1, i + 1));
                  }}
                  disabled={stepIndex >= totalSteps - 1 || totalSteps === 0}
                  className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors duration-fast"
                >
                  &gt;&gt;
                </button>
              </div>

              {currentStep ? (
                <div
                  className="flex-1 min-h-0 border-2 border-border rounded-lg p-4 flex flex-col gap-2 relative overflow-y-auto"
                  data-tutorial="flow-steps"
                >
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    {displayScreenName ? (
                      <>
                        On{" "}
                        <span className="font-medium text-foreground">
                          {displayScreenName}
                        </span>
                      </>
                    ) : (
                      "On"
                    )}
                  </div>
                  <div className="text-sm text-foreground whitespace-pre-wrap min-h-[72px]">
                    {parsedStep.action || "No step selected"}
                  </div>

                  {currentStep?.expected_results &&
                    currentStep.expected_results.length > 0 && (
                      <div className="mt-auto">
                        <span className="text-xs font-medium text-muted-foreground">
                          Business Logic:
                        </span>
                        <ul className="mt-1 space-y-1">
                          {currentStep.expected_results.map((result, idx) => (
                            <li
                              key={idx}
                              className="text-sm text-foreground list-disc list-inside"
                            >
                              {result}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                  <div className="absolute top-3 right-3 flex items-center gap-2">
                    {(() => {
                      const testStepId =
                        currentStep.test_step_id || String(stepIndex + 1);
                      const stepAnnotation = freeAnnotations.find(
                        (ann) => ann.step_id === testStepId,
                      );

                      if (stepAnnotation) {
                        return (
                          <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                            <span className="text-xs text-blue-700 font-medium">
                              {Math.floor(stepAnnotation.timestamp / 60)}:
                              {Math.floor(stepAnnotation.timestamp % 60)
                                .toString()
                                .padStart(2, "0")}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleGoToAnnotation(stepAnnotation.id);
                              }}
                              className="h-5 w-5 p-0 hover:bg-green-100 rounded flex items-center justify-center"
                              title="Go to annotation"
                            >
                              <Play className="h-3 w-3 text-green-600" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteAnnotation(stepAnnotation.id);
                              }}
                              className="h-5 w-5 p-0 hover:bg-red-100 rounded flex items-center justify-center"
                              title="Delete annotation"
                            >
                              <XCircle className="h-3 w-3 text-red-600" />
                            </button>
                          </div>
                        );
                      }

                      return (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (
                              !tcue.execution_video_url ||
                              !executionVideoHttp
                            ) {
                              toast.error(
                                "Cannot add annotation - video is not available",
                              );
                              return;
                            }
                            if (!isVideoPlaying) {
                              setIsVideoPlaying(true);
                            }
                            handleAddStepAnnotation();
                          }}
                          disabled={
                            !tcue.execution_video_url ||
                            !executionVideoHttp ||
                            isSaving
                          }
                          className="h-8 w-8 p-0 hover:bg-purple-100 rounded flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                          title={
                            !tcue.execution_video_url || !executionVideoHttp
                              ? "No video available for annotation"
                              : `Add annotation for Step ${stepIndex + 1}`
                          }
                        >
                          <Edit className="h-5 w-5 text-purple-600" />
                        </button>
                      );
                    })()}
                  </div>

                  <div className="absolute bottom-3 right-3">
                    {currentStep.status === TestCaseStepStatus.COMPLETE ? (
                      <CheckCircle className="h-4 w-4 text-primary" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed border-border rounded-lg p-4 flex items-center justify-center text-muted-foreground text-sm min-h-[100px]">
                  No steps defined
                </div>
              )}
            </div>
            <div className="flex-1 flex flex-col gap-2 min-w-0">
              <div className="font-medium text-sm text-muted-foreground mb-1">
                Execution Video
              </div>
              {renderVideoFrame(true)}

              {tcue.execution_video_url && (
                <button
                  type="button"
                  onClick={() => setShowVideoDeleteDialog(true)}
                  disabled={isDeleting}
                  className="mt-2 text-xs text-destructive hover:text-destructive/80 transition-colors duration-fast disabled:opacity-50 flex items-center gap-2 justify-center border border-destructive/20 p-2 rounded hover:bg-destructive/5"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3 w-3" />
                      Delete Video
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center gap-4 mb-3">
              <button
                onClick={() => {
                  setHasNavigatedSteps(true);
                  setStepIndex((i) => Math.max(0, i - 1));
                }}
                disabled={stepIndex === 0}
                className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors duration-fast"
              >
                &lt;&lt;
              </button>
              <span className="text-sm font-medium text-foreground">
                Step {totalSteps === 0 ? 0 : stepIndex + 1} of {totalSteps}
              </span>
              <button
                onClick={() => {
                  setHasNavigatedSteps(true);
                  setStepIndex((i) => Math.min(totalSteps - 1, i + 1));
                }}
                disabled={stepIndex >= totalSteps - 1 || totalSteps === 0}
                className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors duration-fast"
              >
                &gt;&gt;
              </button>
            </div>

            {currentStep ? (
              <div
                className="border-2 border-border rounded-lg p-4 flex flex-col gap-2 relative"
                data-tutorial="flow-steps"
              >
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  {displayScreenName ? (
                    <>
                      On{" "}
                      <span className="font-medium text-foreground">
                        {displayScreenName}
                      </span>
                    </>
                  ) : (
                    "On"
                  )}
                </div>
                <div className="text-sm text-foreground whitespace-pre-wrap min-h-[72px]">
                  {parsedStep.action || "No step selected"}
                </div>

                {currentStep?.expected_results &&
                  currentStep.expected_results.length > 0 && (
                    <div className="mt-auto">
                      <span className="text-xs font-medium text-muted-foreground">
                        Business Logic:
                      </span>
                      <ul className="mt-1 space-y-1">
                        {currentStep.expected_results.map((result, idx) => (
                          <li
                            key={idx}
                            className="text-sm text-foreground list-disc list-inside"
                          >
                            {result}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
              </div>
            ) : (
              <div className="border-2 border-dashed border-border rounded-lg p-4 flex items-center justify-center text-muted-foreground text-sm min-h-[100px]">
                No steps defined
              </div>
            )}

            {mode === "executor" && currentStep && (
              <button
                type="button"
                onClick={handleMarkExecuted}
                disabled={isSaving}
                className="mt-3 text-sm text-primary hover:text-primary/80 transition-colors duration-fast disabled:opacity-50 self-center"
              >
                {currentStep.status === TestCaseStepStatus.COMPLETE
                  ? "Mark not executed"
                  : "Mark executed"}
              </button>
            )}
          </>
        )}
      </div>

      <div className="border-t border-border my-4 flex-shrink-0" />
      {!(mode === "reviewer" && !isUIReviewType && !isUXReviewType) && (
        <div
          className={cn(
            "flex-1 min-h-0 flex flex-col items-center justify-center",
            !isEditMode &&
              !tcue.execution_video_url &&
              "invisible pointer-events-none",
          )}
          data-tutorial="flow-video"
        >
          {isEditMode ? (
            <>
              {renderVideoFrame()}
              {mode === "executor" && (
                <>
                  {isUploading && <VideoUploadProgress tcueId={tcue.id} />}
                  <div className="flex flex-col gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => videoInputRef.current?.click()}
                      disabled={isUploading}
                      className="text-sm text-primary hover:text-primary/80 transition-colors duration-fast disabled:opacity-50"
                    >
                      {isUploading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Uploading Video...
                        </span>
                      ) : (
                        "Upload Video"
                      )}
                    </button>
                    {tcue.execution_video_url && (
                      <button
                        type="button"
                        onClick={() => setShowVideoDeleteDialog(true)}
                        disabled={isDeleting || isUploading}
                        className="text-sm text-destructive hover:text-destructive/80 transition-colors duration-fast disabled:opacity-50 flex items-center gap-2 justify-center"
                      >
                        {isDeleting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Deleting...
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4" />
                            Delete Video
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    ref={videoInputRef}
                    onChange={handleVideoUpload}
                    disabled={isUploading}
                  />
                </>
              )}
              {mode === "reviewer" && tcue.execution_video_url && (
                <button
                  type="button"
                  onClick={() => setShowVideoDeleteDialog(true)}
                  disabled={isDeleting}
                  className="mt-2 text-sm text-destructive hover:text-destructive/80 transition-colors duration-fast disabled:opacity-50 flex items-center gap-2 justify-center"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      Delete Video
                    </>
                  )}
                </button>
              )}
            </>
          ) : (
            tcue.execution_video_url && renderVideoFrame()
          )}
        </div>
      )}
      {isEditMode && (
        <>
          <div className="border-t border-border my-4 flex-shrink-0" />
          <div className="flex-1 min-h-0 overflow-y-auto">
            <CommentsSection
              comments={comments}
              isLoading={{
                status: isSaving,
                action: isSaving ? "saving" : null,
              }}
              onSaveTestCase={handleSaveComments}
              readOnly={commentsReadOnly}
            />
          </div>
        </>
      )}

      {mode === "viewer" && (
        <>
          <div className="border-t border-border my-4 flex-shrink-0" />
          <div className="flex-1 min-h-0 overflow-y-auto">
            <CommentsSection
              comments={comments}
              isLoading={{
                status: isSaving,
                action: isSaving ? "saving" : null,
              }}
              onSaveTestCase={handleSaveComments}
              readOnly={false}
            />
          </div>
        </>
      )}

      {/* Executor mode: outcome editor is rendered in the status card above */}

      {/* Video Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showVideoDeleteDialog}
        onOpenChange={setShowVideoDeleteDialog}
        title="Delete video?"
        description="Are you sure you want to delete this execution video? This action cannot be undone."
        confirmText="Delete Video"
        onConfirm={handleDeleteVideo}
        isLoading={isDeleting}
        loadingText="Deleting video..."
      />
    </div>
  );
}

export default function TestRunsV2() {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { productSwitcher } = useProductSwitcher();
  const { user, isLoaded } = useUser();
  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;
  const isQaiUser = isQaiOrgUser(userOrgId) || isQaiOrgAnalystUser(userOrgId);
  const isIOS = isIOSProduct(productSwitcher);
  const { testRuns, loading } = useSelector(
    (state: RootState) => state.testRuns,
  );
  const { testRunUnderExecution, loading: tcueLoading } = useSelector(
    (state: RootState) => state.testRunsUnderExecution,
  );
  const users = useSelector((state: RootState) => state.users.users);
  const features = useSelector(
    (state: RootState) => state.features.features as Feature[],
  );
  const graphFeatures = useSelector(
    (state: RootState) => state.graphFeatures.features,
  );

  const [selectedRun, setSelectedRun] =
    useState<categorizeTestRunSchema | null>(null);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<
    Set<TestCaseUnderExecutionStatus>
  >(() => new Set());
  const [userFilter, setUserFilter] = useState<string | null>(null);
  const [selectedTcueId, setSelectedTcueId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"viewer" | "executor" | "reviewer">(
    () => {
      // If auth loaded and confirmed NOT QAI, force viewer
      if (isLoaded && !isQaiUser) return "viewer";
      // Otherwise (loading OR QAI), check storage
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("testRunsViewMode");
        if (saved && ["viewer", "executor", "reviewer"].includes(saved)) {
          return saved as "viewer" | "executor" | "reviewer";
        }
      }
      return "executor";
    },
  );

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTcues, setSelectedTcues] = useState<
    TestCaseUnderExecutionSchema[]
  >([]);
  const [showBulkAssignDialog, setShowBulkAssignDialog] = useState(false);

  const selectedRunTestType = useMemo(() => {
    return selectedRun?.test_run_type;
  }, [selectedRun?.test_run_id, selectedRun?.test_run_type]);

  const hasHydratedSelectionRef = useRef(false);
  const lastTcueIdForModeRef = useRef<string | null>(null);
  const lastFlowIdForModeRef = useRef<string | null>(null);

  const toggleStatusFilter = (status: TestCaseUnderExecutionStatus) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!isQaiUser || !userOrgId) return;
    if (users.length > 0) return;
    dispatch(fetchUsers(userOrgId));
  }, [dispatch, isQaiUser, userOrgId, users.length]);

  useEffect(() => {
    if (productSwitcher.product_id) {
      dispatch(fetchTestRunsForProduct(productSwitcher.product_id));
      dispatch(fetchCredentials(productSwitcher.product_id));
      dispatch(fetchFeatures(productSwitcher.product_id));
    }
  }, [dispatch, productSwitcher.product_id]);

  const mockTestRuns = useMemo((): categorizeTestRunSchema[] => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const mockRuns: categorizeTestRunSchema[] = [
      {
        test_run_id: "mock-ui-review-1",
        title: "UI Review - Home Flow",
        test_run_type: "ui-review",
        created_at: yesterday.toISOString(),
        updated_at: now.toISOString(),
        status: "COMPLETED",
        platform: "mobile",
        product_id: productSwitcher.product_id || "",
        created_by_user_id: "",
        metrics: {
          passed: 8,
          failed: 2,
          blocked: 0,
        },
        status_counts: {
          passed: "8",
          failed: "2",
        },
        tcue_count: 10,
      },
      {
        test_run_id: "mock-ux-review-1",
        title: "UX Review - Onboarding Flow",
        test_run_type: "ux-review",
        created_at: yesterday.toISOString(),
        updated_at: now.toISOString(),
        status: "COMPLETED",
        platform: "mobile",
        product_id: productSwitcher.product_id || "",
        created_by_user_id: "",
        metrics: {
          passed: 6,
          failed: 1,
          blocked: 0,
        },
        status_counts: {
          passed: "6",
          failed: "1",
        },
        tcue_count: 7,
      },
    ];

    return mockRuns;
  }, [productSwitcher.product_id]);

  const flatRuns = useMemo(() => {
    const realRuns = testRuns.flatMap((section) => section.runs || []);

    return [...realRuns, ...mockTestRuns];
  }, [testRuns, mockTestRuns]);

  const realRunsOnly = useMemo(
    () => testRuns.flatMap((section) => section.runs || []),
    [testRuns],
  );

  const flatRunsWithCalculatedStatus = useMemo(() => {
    const { realRuns, mockRuns } = flatRuns.reduce<{
      realRuns: categorizeTestRunSchema[];
      mockRuns: categorizeTestRunSchema[];
    }>(
      (acc, run) => {
        if (run.test_run_id.startsWith("mock-")) {
          acc.mockRuns.push(run);
        } else {
          acc.realRuns.push(run);
        }
        return acc;
      },
      { realRuns: [], mockRuns: [] },
    );

    const calculatedRealRuns = calculateTestRunStatusCounts(
      realRuns,
      testRunUnderExecution,
      {
        includeTcueCount: true,
      },
    );

    return [...calculatedRealRuns, ...mockRuns];
  }, [flatRuns, testRunUnderExecution]);

  const groupedRuns = useMemo(() => {
    const groups: Record<TimeGroup, categorizeTestRunSchema[]> = {
      Today: [],
      "This Week": [],
      "This Month": [],
      "Last Month": [],
      Earlier: [],
    };
    flatRunsWithCalculatedStatus
      .slice()
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .forEach((run) => {
        const group = getTimeGroup(run.created_at);
        groups[group].push(run);
      });
    return groups;
  }, [flatRunsWithCalculatedStatus]);

  const currentFeatureId = useMemo(
    () => searchParams.get("featureId"),
    [searchParams],
  );

  useEffect(() => {
    if (currentFeatureId === null && !selectedRun) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("featureId", "");
      params.set("showFlows", "true");
      router.replace(`${pathname}?${params.toString()}`);
    }
  }, [pathname, router, currentFeatureId, selectedRun, searchParams]);

  const isMockRun = useMemo(() => {
    return selectedRun?.test_run_id?.startsWith("mock-") ?? false;
  }, [selectedRun?.test_run_id]);

  const mockTcueData = useMemo((): TestCaseUnderExecutionSchema[] => {
    if (!selectedRun || !isMockRun) return [];

    const mockTcue: TestCaseUnderExecutionSchema = {
      id: `mock-tcue-${selectedRun.test_run_id}`,
      test_run_id: selectedRun.test_run_id,
      test_case_id: `mock-test-case-${selectedRun.test_run_id}`,
      title:
        selectedRun.test_run_type === "ui-review"
          ? "UI Review - Home Flow"
          : "UX Review - Onboarding Flow",
      test_case_description:
        selectedRun.test_run_type === "ui-review"
          ? "Review the UI design and visual consistency across different screens in the home flow."
          : "Evaluate the user experience from different persona perspectives in the onboarding flow.",
      test_case_type: TestCaseType.ui,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      assignee_user_id: "",
      device_id: "",
      execution_completed_at: "",
      execution_started_at: "",
      execution_video_url: "",
      functionality_id: "",
      notes: "",
      rationale: "",
      criticality: Criticality.HIGH,
      status: TestCaseUnderExecutionStatus.UNTESTED,
      annotations: [],
      preconditions: [],
      test_case_steps: [
        {
          test_step_id: "step-1",
          step_description:
            selectedRun.test_run_type === "ui-review"
              ? "Screen 1\nReview visual design elements"
              : "Screen 1\nEvaluate user experience",
          expected_results: [],
        },
        {
          test_step_id: "step-2",
          step_description:
            selectedRun.test_run_type === "ui-review"
              ? "Screen 2\nCheck layout consistency"
              : "Screen 2\nAssess navigation flow",
          expected_results: [],
        },
        {
          test_step_id: "step-3",
          step_description:
            selectedRun.test_run_type === "ui-review"
              ? "Screen 3\nVerify color and typography"
              : "Screen 3\nReview interaction patterns",
          expected_results: [],
        },
        {
          test_step_id: "step-4",
          step_description:
            selectedRun.test_run_type === "ui-review"
              ? "Screen 4\nCheck responsive design"
              : "Screen 4\nEvaluate accessibility",
          expected_results: [],
        },
        {
          test_step_id: "step-5",
          step_description:
            selectedRun.test_run_type === "ui-review"
              ? "Screen 5\nReview overall design system"
              : "Screen 5\nAssess overall UX quality",
          expected_results: [],
        },
      ],
      flow_id: `mock-flow-${selectedRun.test_run_id}`,
      feature_id: undefined,
      product_id: productSwitcher.product_id || "",
      metadata: JSON.stringify({
        tc_graph_json: {
          nodes: [
            {
              id: "node-1",
              data: { title: "Screen 1", description: "Home Screen" },
            },
            {
              id: "node-2",
              data: { title: "Screen 2", description: "Navigation Screen" },
            },
            {
              id: "node-3",
              data: { title: "Screen 3", description: "Content Screen" },
            },
            {
              id: "node-4",
              data: { title: "Screen 4", description: "Details Screen" },
            },
            {
              id: "node-5",
              data: { title: "Screen 5", description: "Summary Screen" },
            },
          ],
          edges: [
            { id: "edge-1", source: "node-1", target: "node-2" },
            { id: "edge-2", source: "node-2", target: "node-3" },
            { id: "edge-3", source: "node-3", target: "node-4" },
            { id: "edge-4", source: "node-4", target: "node-5" },
          ],
        },
      }),
    };

    return [mockTcue];
  }, [selectedRun, isMockRun, productSwitcher.product_id]);

  useEffect(() => {
    const getInitialMode = () => {
      if (isLoaded && !isQaiUser) return "viewer";
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("testRunsViewMode");
        if (saved && ["viewer", "executor", "reviewer"].includes(saved)) {
          return saved as "viewer" | "executor" | "reviewer";
        }
      }
      return "executor";
    };

    if (selectedRun?.test_run_id && !isMockRun) {
      dispatch(setTestRunUnderExecution([]));
      dispatch(fetchTestRunUnderExecution(selectedRun.test_run_id));
      setSelectedTcueId(null);
      setViewMode(getInitialMode());
    } else if (isMockRun && selectedRun) {
      dispatch(setTestRunUnderExecution(mockTcueData));
      setSelectedTcueId(null);
      setViewMode(getInitialMode());
    }
  }, [
    dispatch,
    selectedRun?.test_run_id,
    isQaiUser,
    isMockRun,
    mockTcueData,
    isLoaded,
  ]);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{
        mode: "viewer" | "executor" | "reviewer";
      }>;
      if (customEvent.detail?.mode) {
        if (isLoaded && !isQaiUser) {
          setViewMode("viewer");
          return;
        }
        setViewMode(customEvent.detail.mode);
      }
    };

    const requestHandler = () => {
      if (typeof window !== "undefined") {
        const modeToSend = isLoaded && !isQaiUser ? "viewer" : viewMode;
        window.dispatchEvent(
          new CustomEvent("testRunsViewModeUpdate", {
            detail: { mode: modeToSend },
          }),
        );
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("testRunsViewModeChange", handler);
      window.addEventListener("testRunsViewModeRequest", requestHandler);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("testRunsViewModeChange", handler);
        window.removeEventListener("testRunsViewModeRequest", requestHandler);
      }
    };
  }, [viewMode, isQaiUser, isLoaded]);

  useEffect(() => {
    if (typeof window !== "undefined" && isQaiUser) {
      window.dispatchEvent(
        new CustomEvent("testRunsViewModeUpdate", {
          detail: { mode: viewMode },
        }),
      );
    }
  }, [viewMode, isQaiUser]);

  const tcueFeatures = useMemo(() => {
    const featureNameById = new Map<string, string>();

    features.forEach((feature) => {
      if (feature?.id) {
        featureNameById.set(feature.id, feature.name);
      }
    });

    graphFeatures.forEach((feature) => {
      if (feature?.id && !featureNameById.has(feature.id)) {
        featureNameById.set(feature.id, feature.name);
      }
    });

    const ids = new Set<string>();
    testRunUnderExecution.forEach((tc: TestCaseUnderExecutionSchema) => {
      if (tc.feature_id) ids.add(tc.feature_id);
    });

    return Array.from(ids)
      .map((id) => ({
        id,
        name: featureNameById.get(id) || "Unknown Feature",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [testRunUnderExecution, features, graphFeatures]);

  const mapBackendFeatureIdToGraphFeatureId = useCallback(
    (backendFeatureId: string | null): string | null => {
      if (!backendFeatureId || backendFeatureId === "all") return null;

      if (graphFeatures.some((gf) => gf.id === backendFeatureId)) {
        return backendFeatureId;
      }

      const backendFeature = features.find((f) => f.id === backendFeatureId);
      if (!backendFeature) return null;

      const graphFeature = graphFeatures.find(
        (gf) => gf.name === backendFeature.name,
      );

      return graphFeature?.id || null;
    },
    [features, graphFeatures],
  );

  const setGraphFeatureIdInUrl = useCallback(
    (backendFeatureId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());

      if (backendFeatureId === "all") {
        params.set("featureId", "");
        params.set("showFlows", "true");
      } else if (backendFeatureId) {
        const graphFeatureId =
          mapBackendFeatureIdToGraphFeatureId(backendFeatureId);
        if (graphFeatureId) {
          params.set("featureId", graphFeatureId);
          params.set("showFlows", "true");
        } else {
          params.set("featureId", "");
        }
      } else {
        params.delete("featureId");
      }
      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams, mapBackendFeatureIdToGraphFeatureId],
  );

  const filteredTcue = useMemo(() => {
    return testRunUnderExecution.filter((tc: TestCaseUnderExecutionSchema) => {
      let normalizedStatus = tc.status as
        | TestCaseUnderExecutionStatus
        | undefined;
      if (normalizedStatus === TestCaseUnderExecutionStatus.ATTEMPT_FAILED) {
        normalizedStatus = TestCaseUnderExecutionStatus.FAILED;
      } else if (normalizedStatus === TestCaseUnderExecutionStatus.DEFAULT) {
        normalizedStatus = TestCaseUnderExecutionStatus.UNTESTED;
      }

      const statusOk =
        statusFilter.size === 0 ||
        !normalizedStatus ||
        statusFilter.has(normalizedStatus);
      const featureOk =
        selectedFeatureId === "all" || tc.feature_id === selectedFeatureId;
      const userOk = !userFilter || tc.assignee_user_id === userFilter;
      return statusOk && featureOk && userOk;
    });
  }, [testRunUnderExecution, statusFilter, selectedFeatureId, userFilter]);

  const statusCounts = useMemo(() => {
    return filteredTcue.reduce(
      (acc, tc) => {
        if (tc.status) {
          let normalizedStatus = tc.status as TestCaseUnderExecutionStatus;
          if (
            normalizedStatus === TestCaseUnderExecutionStatus.ATTEMPT_FAILED
          ) {
            normalizedStatus = TestCaseUnderExecutionStatus.FAILED;
          } else if (
            normalizedStatus === TestCaseUnderExecutionStatus.DEFAULT
          ) {
            normalizedStatus = TestCaseUnderExecutionStatus.UNTESTED;
          }
          acc[normalizedStatus] = (acc[normalizedStatus] || 0) + 1;
        }
        return acc;
      },
      {} as Record<TestCaseUnderExecutionStatus, number>,
    );
  }, [filteredTcue]);

  const getStatusLabel = (status: TestCaseUnderExecutionStatus): string => {
    switch (status) {
      case TestCaseUnderExecutionStatus.PASSED:
        return "passed";
      case TestCaseUnderExecutionStatus.FAILED:
        return "failed";
      case TestCaseUnderExecutionStatus.SKIPPED:
        return "skipped";
      case TestCaseUnderExecutionStatus.UNTESTED:
        return "untested";
      default:
        return status.toLowerCase();
    }
  };

  const availableStatuses = useMemo(() => {
    const statusOrder = [
      TestCaseUnderExecutionStatus.PASSED,
      TestCaseUnderExecutionStatus.FAILED,
      TestCaseUnderExecutionStatus.SKIPPED,
      TestCaseUnderExecutionStatus.UNTESTED,
    ];
    return statusOrder.filter((status) => (statusCounts[status] ?? 0) > 0);
  }, [statusCounts]);

  // Group by feature_id, then within each feature we'll group by flow_id
  const groupedTcue = useMemo(() => {
    const groups: Record<string, TestCaseUnderExecutionSchema[]> = {};
    filteredTcue.forEach((tc: TestCaseUnderExecutionSchema) => {
      const key = tc.feature_id || "unknown";
      if (!groups[key]) groups[key] = [];
      groups[key].push(tc);
    });
    return groups;
  }, [filteredTcue]);

  const enterSelectionMode = useCallback(() => {
    if (!isQaiUser) return;
    setIsSelectionMode(true);
    setSelectedTcues([]);
  }, [isQaiUser]);

  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedTcues([]);
  }, []);

  const toggleTcuesSelection = useCallback(
    (tcues: TestCaseUnderExecutionSchema[]) => {
      setSelectedTcues((prev) => {
        const prevIds = new Set(prev.map((t) => t.id));
        const allSelected = tcues.every((t) => prevIds.has(t.id));

        if (allSelected) {
          const removeIds = new Set(tcues.map((t) => t.id));
          return prev.filter((t) => !removeIds.has(t.id));
        }

        const next = [...prev];
        for (const tcue of tcues) {
          if (!prevIds.has(tcue.id)) next.push(tcue);
        }
        return next;
      });
    },
    [],
  );

  const isAllVisibleSelected = useMemo(() => {
    if (filteredTcue.length === 0) return false;
    const selectedIds = new Set(selectedTcues.map((t) => t.id));
    return filteredTcue.every((t) => selectedIds.has(t.id));
  }, [filteredTcue, selectedTcues]);

  const handleBulkAssign = useCallback(async () => {
    if (!isQaiUser) return;
    if (selectedTcues.length === 0) {
      toast.error("Please select flows to assign");
      return;
    }

    if (userOrgId) {
      await dispatch(fetchUsers(userOrgId));
    }

    setShowBulkAssignDialog(true);
  }, [dispatch, isQaiUser, selectedTcues.length, userOrgId]);

  const handleRunSelect = useCallback(
    (run: categorizeTestRunSchema) => {
      setSelectedRun(run);
      setSelectedFeatureId("all");
      setStatusFilter(new Set());
      setUserFilter(null);
      setSelectedTcueId(null);

      setIsSelectionMode(false);
      setSelectedTcues([]);
      const params = new URLSearchParams(searchParams.toString());
      params.set("testRunId", run.test_run_id);
      params.delete("tcue");
      params.delete("flow_id");
      const query = params.toString();
      router.replace(`${pathname}?${query}`);
    },
    [pathname, router, searchParams, isQaiUser],
  );

  const handleTcueSelect = useCallback(
    (tcue: TestCaseUnderExecutionSchema) => {
      setSelectedTcueId(tcue.id);
      dispatch(setSelectedTcueIdAction(tcue.id));
      if (typeof window !== "undefined") {
        if (tcue.flow_id) {
          window.dispatchEvent(
            new CustomEvent("testRunFlowSelect", {
              detail: { flowId: tcue.flow_id },
            }),
          );
        }
      }
      const params = new URLSearchParams(searchParams.toString());
      params.set("tcue", tcue.id);

      if (tcue.flow_id) params.set("flow_id", tcue.flow_id);
      else params.delete("flow_id");
      router.replace(`${pathname}?${params.toString()}`);
    },
    [dispatch, pathname, router, searchParams],
  );

  const handleTcueClose = useCallback(() => {
    setSelectedTcueId(null);
    dispatch(setSelectedTcueIdAction(null));
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tcue");
    params.delete("flow_id");
    router.replace(
      params.toString() ? `${pathname}?${params.toString()}` : pathname,
    );
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (hasHydratedSelectionRef.current) return;
    const testRunId = searchParams.get("testRunId");
    if (!testRunId) return;
    const realRunsFlat = testRuns.flatMap((s) => s.runs || []);
    const allRunsFlat = [...realRunsFlat, ...mockTestRuns];
    const match = allRunsFlat.find((r) => r.test_run_id === testRunId) || null;
    if (match) {
      setSelectedRun(match);
      hasHydratedSelectionRef.current = true;
    }
  }, [searchParams, testRuns, mockTestRuns]);

  useEffect(() => {
    const tcueId = searchParams.get("tcue");
    const flowId = searchParams.get("flow_id");

    if (tcueId) {
      const tcue = testRunUnderExecution.find((t) => t.id === tcueId);
      if (tcue) {
        setSelectedTcueId(tcueId);

        const expectedFlowId = tcue.flow_id;
        if (expectedFlowId && flowId !== expectedFlowId) {
          const params = new URLSearchParams(searchParams.toString());
          params.set("tcue", tcueId);
          params.set("flow_id", expectedFlowId);
          const newUrl = `${pathname}?${params.toString()}`;
          router.replace(newUrl);
        } else if (!expectedFlowId && flowId) {
          const params = new URLSearchParams(searchParams.toString());
          params.set("tcue", tcueId);
          params.delete("flow_id");
          router.replace(`${pathname}?${params.toString()}`);
        }
      } else {
        console.log("TCUE not found for tcueId:", tcueId);
      }
      return;
    }

    if (flowId && !tcueId) {
      const tcue = testRunUnderExecution.find((t) => t.flow_id === flowId);
      if (tcue) {
        setSelectedTcueId(tcue.id);

        const params = new URLSearchParams(searchParams.toString());
        params.set("tcue", tcue.id);
        router.replace(`${pathname}?${params.toString()}`);
      }
    }
  }, [searchParams, testRunUnderExecution, router, pathname]);

  useEffect(() => {
    if (!selectedTcueId) return;

    if (lastTcueIdForModeRef.current === selectedTcueId) {
      return;
    }

    const tcue = testRunUnderExecution.find((t) => t.id === selectedTcueId);
    if (!tcue) return;

    // Preserve mode if switching between TCUEs in the same flow

    lastTcueIdForModeRef.current = selectedTcueId;
    lastFlowIdForModeRef.current = tcue.flow_id || null;

    if (typeof window !== "undefined") {
      if (tcue.flow_id) {
        window.dispatchEvent(
          new CustomEvent("testRunFlowSelect", {
            detail: { flowId: tcue.flow_id },
          }),
        );
      }
    }
  }, [selectedTcueId, testRunUnderExecution, isQaiUser]);

  const selectedTcue = useMemo(() => {
    if (!selectedTcueId) return null;
    return testRunUnderExecution.find((t) => t.id === selectedTcueId) || null;
  }, [selectedTcueId, testRunUnderExecution]);

  const tutorial = useSelector((state: RootState) => state.tutorial);
  const [isTourOpen, setIsTourOpen] = useState(false);

  const flowDetailsTourSteps: GuidedTourStep[] = useMemo(
    () => [
      {
        target: '[data-tutorial="flow-video"]',
        title: "See video recording",
        description: "Watch the execution video for this flow.",
      },
      {
        target: '[data-tutorial="flow-steps"]',
        title: "See steps taken",
        description: "Review the steps executed and expected results.",
      },
      {
        target: '[data-tutorial="add-more-flows"]',
        title: "Add more flows",
        description: "Go to Flows to capture and add more flows.",
      },
    ],
    [],
  );

  useEffect(() => {
    if (tutorial.activeKey !== "flow-details") {
      setIsTourOpen(false);
      return;
    }

    if (selectedTcue) {
      setIsTourOpen(true);
      return;
    }

    // If a TCUE is in the URL, wait for data hydration before deciding.
    if (searchParams.get("tcue")) return;

    toast.error("Open a flow to start this tutorial");
    dispatch(clearTutorial());
  }, [
    tutorial.activeKey,
    tutorial.runId,
    selectedTcue,
    searchParams,
    dispatch,
  ]);

  const currentTcueIndex = useMemo(() => {
    if (!selectedTcueId || filteredTcue.length === 0) return -1;
    return filteredTcue.findIndex((tc) => tc.id === selectedTcueId);
  }, [selectedTcueId, filteredTcue]);

  useFlowDetailsKeyboardNavigation({
    enabled: !!selectedTcueId && !!selectedTcue,
    onFlowPrevious: () => {
      if (currentTcueIndex > 0) {
        const prevTcue = filteredTcue[currentTcueIndex - 1];
        handleTcueSelect(prevTcue);
      }
    },
    onFlowNext: () => {
      if (currentTcueIndex < filteredTcue.length - 1) {
        const nextTcue = filteredTcue[currentTcueIndex + 1];
        handleTcueSelect(nextTcue);
      }
    },
    canGoToPreviousFlow: currentTcueIndex > 0,
    canGoToNextFlow:
      currentTcueIndex < filteredTcue.length - 1 && currentTcueIndex >= 0,
    isDialogOpen: false,
  });

  return (
    <>
      <GuidedTour
        open={isTourOpen}
        steps={flowDetailsTourSteps}
        onOpenChange={(open) => {
          setIsTourOpen(open);
          if (!open) dispatch(clearTutorial());
        }}
      />
      <div className="flex h-full bg-transparent pointer-events-none">
        {/* Left pane */}
        <div
          className={cn(
            "border-r border-border overflow-y-auto pointer-events-auto bg-background",
            viewMode === "reviewer" && selectedTcue ? "w-1/2" : "w-1/3",
          )}
        >
          <div className="p-4 space-y-6">
            {selectedRun ? (
              selectedTcue ? (
                <div className="space-y-4">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={handleTcueClose}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleTcueClose();
                      }
                    }}
                    className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors duration-200 w-full cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span className="truncate">{selectedRun.title}</span>
                    <div
                      className="ml-auto flex items-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <TestRunToolbarMenu
                        testRunId={selectedRun?.test_run_id}
                        productId={productSwitcher.product_id}
                        testCases={testRunUnderExecution}
                        isQaiUser={isQaiUser}
                      />
                    </div>
                  </div>

                  <TestRunFlowDetailsPanel
                    tcue={selectedTcue}
                    mode={viewMode}
                    onBack={handleTcueClose}
                    productId={productSwitcher.product_id}
                    testRunId={selectedRun?.test_run_id}
                    testType={selectedRunTestType}
                    onTcueChange={(tcueId) => {
                      const params = new URLSearchParams(
                        searchParams.toString(),
                      );
                      params.set("tcue", tcueId);
                      const nextTcue = testRunUnderExecution.find(
                        (t) => t.id === tcueId,
                      );
                      if (nextTcue?.flow_id)
                        params.set("flow_id", nextTcue.flow_id);
                      else params.delete("flow_id");
                      router.replace(`${pathname}?${params.toString()}`);
                    }}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedRun(null);
                      setSelectedFeatureId("all");
                      setStatusFilter(new Set());
                      setUserFilter(null);
                      setSelectedTcueId(null);
                      exitSelectionMode();
                      const params = new URLSearchParams(
                        searchParams.toString(),
                      );
                      params.delete("testRunId");
                      params.delete("tcue");
                      params.delete("flow_id");
                      const query = params.toString();
                      router.replace(query ? `${pathname}?${query}` : pathname);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedRun(null);
                        setSelectedFeatureId("all");
                        setStatusFilter(new Set());
                        setUserFilter(null);
                        setSelectedTcueId(null);
                        exitSelectionMode();
                        const params = new URLSearchParams(
                          searchParams.toString(),
                        );
                        params.delete("testRunId");
                        params.delete("tcue");
                        params.delete("flow_id");
                        const query = params.toString();
                        router.replace(
                          query ? `${pathname}?${query}` : pathname,
                        );
                      }
                    }}
                    className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors duration-200 w-full cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span className="truncate">{selectedRun.title}</span>
                    <div
                      className="ml-auto flex items-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <TestRunToolbarMenu
                        testRunId={selectedRun?.test_run_id}
                        productId={productSwitcher.product_id}
                        testCases={testRunUnderExecution}
                        isQaiUser={isQaiUser}
                        isSelectionMode={isSelectionMode}
                        selectedTcuesCount={selectedTcues.length}
                        onEnterSelectionMode={enterSelectionMode}
                        onExitSelectionMode={exitSelectionMode}
                        onBulkAssign={handleBulkAssign}
                      />
                    </div>
                  </div>

                  {!tcueLoading && (
                    <div>
                      <div className="text-lg font-medium text-foreground">
                        {filteredTcue.length}{" "}
                        {filteredTcue.length > 1 ? "flows" : "flow"}
                      </div>
                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        {availableStatuses.map((status) => {
                          const count = statusCounts[status] ?? 0;
                          const label = getStatusLabel(status);
                          return (
                            <label
                              key={status}
                              className="flex items-center gap-1.5 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5"
                                checked={statusFilter.has(status)}
                                onChange={() => toggleStatusFilter(status)}
                              />
                              <span className="text-muted-foreground text-xs sm:text-sm">
                                {count} {label}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {isQaiUser && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-foreground">
                        Show flows assigned to
                      </div>
                      <Select
                        value={userFilter || "all"}
                        onValueChange={(value) =>
                          setUserFilter(value === "all" ? null : value)
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="All flows" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All flows</SelectItem>
                          {!isIOS && (
                            <SelectItem
                              key={NOVA_USER.user_id}
                              value={NOVA_USER.user_id}
                            >
                              {NOVA_USER.first_name} {NOVA_USER.last_name}
                            </SelectItem>
                          )}
                          {users?.map((u) => (
                            <SelectItem key={u.user_id} value={u.user_id}>
                              {u.first_name} {u.last_name} ({u.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {isSelectionMode && isQaiUser && !tcueLoading && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={isAllVisibleSelected}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedTcues(filteredTcue);
                          } else {
                            setSelectedTcues([]);
                          }
                        }}
                      />
                      <span className="text-sm text-muted-foreground">
                        Select all visible flows
                      </span>
                    </div>
                  )}

                  <Select
                    value={selectedFeatureId}
                    onValueChange={(value) => {
                      setSelectedFeatureId(value);

                      setGraphFeatureIdInUrl(value === "all" ? "all" : value);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="All Features" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Features</SelectItem>
                      {tcueFeatures.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="space-y-6">
                    {tcueLoading ? (
                      <div className="text-sm text-muted-foreground">
                        Loading flows…
                      </div>
                    ) : (
                      Object.entries(groupedTcue).map(([featureId, cases]) => {
                        const featureName =
                          tcueFeatures.find((f) => f.id === featureId)?.name ||
                          "Miscellaneous";

                        const flowsById = cases.reduce(
                          (acc, tc) => {
                            const key = tc.flow_id || tc.test_case_id || tc.id;
                            if (!acc[key]) acc[key] = [];
                            acc[key].push(tc);
                            return acc;
                          },
                          {} as Record<string, TestCaseUnderExecutionSchema[]>,
                        );

                        return (
                          <div key={featureId} className="space-y-2">
                            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              {featureName}
                            </h4>
                            <div className="space-y-2">
                              {Object.entries(flowsById).map(
                                ([flowId, flowCases]) => {
                                  const selectedIndex = flowCases.findIndex(
                                    (tc) => tc.id === selectedTcueId,
                                  );
                                  const currentSelectedIndex =
                                    selectedIndex >= 0 ? selectedIndex : 0;
                                  const currentSelectedTcue =
                                    flowCases[currentSelectedIndex];

                                  const annotationCount = (() => {
                                    if (!currentSelectedTcue.annotations)
                                      return 0;
                                    try {
                                      const parsed =
                                        typeof currentSelectedTcue.annotations ===
                                        "string"
                                          ? JSON.parse(
                                              currentSelectedTcue.annotations,
                                            )
                                          : currentSelectedTcue.annotations;
                                      return Array.isArray(parsed)
                                        ? parsed.length
                                        : 0;
                                    } catch {
                                      return 0;
                                    }
                                  })();

                                  const commentsCount = (() => {
                                    if (!currentSelectedTcue.comments) return 0;
                                    try {
                                      const parsedComments = JSON.parse(
                                        currentSelectedTcue.comments,
                                      );
                                      return Array.isArray(parsedComments)
                                        ? parsedComments.length
                                        : 0;
                                    } catch {
                                      return currentSelectedTcue.comments.trim()
                                        ? 1
                                        : 0;
                                    }
                                  })();

                                  const hasVideo = !!(
                                    currentSelectedTcue.execution_video_url &&
                                    currentSelectedTcue.execution_video_url.trim()
                                  );

                                  const assignee = (() => {
                                    const assigneeId =
                                      currentSelectedTcue.assignee_user_id;
                                    if (!assigneeId) return null;

                                    if (assigneeId === NOVA_USER.user_id) {
                                      return isIOS ? null : NOVA_USER;
                                    }

                                    return (users || []).find(
                                      (u) => u.user_id === assigneeId,
                                    );
                                  })();

                                  const { icon: Icon, color } =
                                    statusIconForTcue(
                                      currentSelectedTcue.status as TestCaseUnderExecutionStatus,
                                    );
                                  const screenCount =
                                    currentSelectedTcue.test_case_steps
                                      ? currentSelectedTcue.test_case_steps
                                          .length + 1
                                      : 0;
                                  const isFlowSelected = flowCases.some(
                                    (tc) => tc.id === selectedTcueId,
                                  );

                                  const isFlowSelectedForAssign = (() => {
                                    if (!isSelectionMode) return false;
                                    const selectedIds = new Set(
                                      selectedTcues.map((t) => t.id),
                                    );
                                    return flowCases.every((t) =>
                                      selectedIds.has(t.id),
                                    );
                                  })();

                                  const handleMouseEnter = () => {
                                    if (
                                      typeof window !== "undefined" &&
                                      flowId
                                    ) {
                                      window.dispatchEvent(
                                        new CustomEvent("graphFlowHover", {
                                          detail: { flowId },
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

                                  return (
                                    <div
                                      key={flowId}
                                      className={cn(
                                        "bg-card border-2 rounded-lg p-4 cursor-pointer transition-all duration-200 ease-default",
                                        isSelectionMode
                                          ? isFlowSelectedForAssign
                                            ? "border-primary shadow-lg shadow-primary/10"
                                            : "border-border hover:border-primary/30 hover:shadow-md"
                                          : isFlowSelected
                                            ? "border-primary shadow-lg shadow-primary/10"
                                            : "border-border hover:border-primary/30 hover:shadow-md",
                                      )}
                                      onClick={() => {
                                        if (isSelectionMode) {
                                          toggleTcuesSelection(flowCases);
                                          return;
                                        }
                                        handleTcueSelect(currentSelectedTcue);
                                      }}
                                      onMouseEnter={handleMouseEnter}
                                      onMouseLeave={handleMouseLeave}
                                    >
                                      <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-3 flex-1 min-w-0">
                                          {isSelectionMode && isQaiUser && (
                                            <div
                                              className="mt-0.5"
                                              onClick={(e) =>
                                                e.stopPropagation()
                                              }
                                            >
                                              <Checkbox
                                                checked={
                                                  isFlowSelectedForAssign
                                                }
                                                onCheckedChange={() =>
                                                  toggleTcuesSelection(
                                                    flowCases,
                                                  )
                                                }
                                              />
                                            </div>
                                          )}
                                          <Icon
                                            className={cn(
                                              "h-5 w-5 mt-0.5 flex-shrink-0",
                                              color,
                                            )}
                                          />
                                          <div className="flex-1 min-w-0">
                                            <h3 className="font-medium truncate transition-colors duration-200 ease-default text-foreground">
                                              {currentSelectedTcue.title ||
                                                "Test case under execution"}
                                            </h3>
                                            <div className="flex items-center gap-2 mt-1">
                                              <p className="text-sm text-muted-foreground">
                                                {screenCount} screens
                                              </p>
                                              {assignee && (
                                                <div className="flex-shrink-0">
                                                  <UserAvatar
                                                    firstName={
                                                      assignee.first_name
                                                    }
                                                    lastName={
                                                      assignee.last_name
                                                    }
                                                    email={assignee.email}
                                                    className="h-6 w-6"
                                                  />
                                                </div>
                                              )}
                                            </div>
                                            {/* Metrics Row */}
                                            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground flex-wrap">
                                              {annotationCount > 0 && (
                                                <div className="flex items-center gap-1">
                                                  <ClosedCaption className="h-3.5 w-3.5" />
                                                  <span className="font-medium">
                                                    {annotationCount}
                                                  </span>
                                                </div>
                                              )}
                                              {commentsCount > 0 && (
                                                <div className="flex items-center gap-1">
                                                  <MessageCircleMore className="h-3.5 w-3.5" />
                                                  <span className="font-medium">
                                                    {commentsCount}
                                                  </span>
                                                </div>
                                              )}
                                              {hasVideo && (
                                                <div className="flex items-center gap-1">
                                                  <Video className="h-3.5 w-3.5" />
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                },
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )
            ) : (
              <>
                <SectionedRunsList
                  groupedRuns={groupedRuns}
                  selectedRun={selectedRun}
                  onSelect={handleRunSelect}
                />
                {testRuns.length === 0 && !loading && (
                  <div className="text-center text-sm text-muted-foreground py-12">
                    No test runs yet
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right content: selected run shows GraphEditor canvas; list view shows stats */}
        <div className="flex-1 overflow-hidden bg-transparent pointer-events-none">
          {!selectedRun ? (
            <div className="h-full w-full pointer-events-auto bg-background overflow-y-auto">
              {flatRuns.length > 0 ? (
                <TestRunStats
                  testRuns={realRunsOnly}
                  testRunUnderExecution={testRunUnderExecution}
                />
              ) : (
                <div className="h-full w-full pointer-events-auto bg-background">
                  <ProductLoadingScreen
                    message="Analytics coming soon"
                    fullScreen={false}
                  />
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <BulkAssignDialog
        isOpen={showBulkAssignDialog}
        onOpenChange={(open) => {
          setShowBulkAssignDialog(open);
          if (!open) {
            setSelectedTcues([]);
          }
        }}
        selectedTcues={selectedTcues}
        variant="flows"
        onAssignComplete={() => {
          setSelectedTcues([]);
          setShowBulkAssignDialog(false);
          exitSelectionMode();
        }}
      />
    </>
  );
}
