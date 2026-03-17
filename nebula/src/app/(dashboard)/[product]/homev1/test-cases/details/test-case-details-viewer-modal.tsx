"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Monitor,
  Play,
  Loader2,
} from "lucide-react";
import type { testCaseSchema } from "@/lib/types";
import { Criticality, TestCaseStepStatus } from "@/lib/types";
import {
  GCS_BUCKET_URL,
  GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT,
} from "@/lib/constants";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/app/store/store";
import { fetchTestCases as fetchTestCasesAction } from "@/app/store/testCaseSlice";
import { useFinalSlide } from "@/hooks/use-final-slide";
import { fetchFeatures as fetchFeaturesAction } from "@/app/store/featuresSlice";
import { TCDetailsSection } from "@/app/(dashboard)/[product]/homev1/test-cases/components/tc-details-section";
import { TCHeader } from "@/app/(dashboard)/[product]/homev1/test-cases/components/tc-header";
import {
  TestCaseStepsViewer,
  type ViewerStep,
} from "@/components/ui/test-case-steps-viewer";
import { toast } from "sonner";

interface TestCaseDetailsViewerModalProps {
  testCase: testCaseSchema | null;
  onClose: () => void;
  onNextTestCase?: () => void;
  onPrevTestCase?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  currentPosition?: number;
  totalCount?: number;
  inline?: boolean;
  handleAddTestRun?: () => void;
  testRunId?: string;
  productId?: string;
  isTestRunLoading?: boolean;
  onCriticalityChange?: (value: Criticality) => void;
  onTestCaseUpdate?: (testCase: testCaseSchema) => Promise<boolean>;
  isEditing?: boolean;
  isSaving?: boolean;
}

const FlowImage: React.FC<{
  stepIndex: number;
  testCase: testCaseSchema;
  fallbackSrc: string | null;
  getStepImageFromMetadata: (stepIdx: number) => Promise<string | null>;
  stepImageHttpUrls: Map<number, string | null>;
  stepImageLoadingStates: Map<number, boolean>;
}> = ({
  stepIndex,
  fallbackSrc,
  getStepImageFromMetadata,
  stepImageHttpUrls,
  stepImageLoadingStates,
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadImage = async () => {
      const cached = stepImageHttpUrls.get(stepIndex);
      if (cached !== undefined) {
        setImageSrc(cached);
        return;
      }

      if (stepImageLoadingStates.get(stepIndex)) {
        setIsLoading(true);
        return;
      }

      setIsLoading(true);
      try {
        const src = await getStepImageFromMetadata(stepIndex);
        setImageSrc(src || fallbackSrc);
      } catch (error) {
        console.error(`Failed to load image for step ${stepIndex}:`, error);
        setImageSrc(fallbackSrc);
      } finally {
        setIsLoading(false);
      }
    };

    loadImage();
  }, [
    stepIndex,
    getStepImageFromMetadata,
    fallbackSrc,
    stepImageHttpUrls,
    stepImageLoadingStates,
  ]);

  useEffect(() => {
    const cached = stepImageHttpUrls.get(stepIndex);
    if (cached !== undefined) {
      setImageSrc(cached);
      setIsLoading(false);
    }
  }, [stepImageHttpUrls, stepIndex]);

  if (isLoading || stepImageLoadingStates.get(stepIndex)) {
    return (
      <div className="w-80 h-[640px] bg-gray-100 flex items-center justify-center flex-shrink-0">
        <span className="text-gray-400 text-sm">Loading...</span>
      </div>
    );
  }

  if (!imageSrc) {
    return (
      <div className="w-80 h-[640px] bg-gray-100 flex items-center justify-center flex-shrink-0">
        <span className="text-gray-400 text-sm">No image available</span>
      </div>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={`Step ${stepIndex + 1}`}
      className="w-80 h-[640px] object-cover bg-black/5 flex-shrink-0"
    />
  );
};

export function TestCaseDetailsViewerModal({
  testCase,
  onClose,
  onNextTestCase = () => {},
  onPrevTestCase = () => {},
  hasNext = false,
  hasPrev = false,
  inline = false,
  handleAddTestRun,
  testRunId,
  productId,
  isTestRunLoading = false,
  onTestCaseUpdate,
  isEditing = false,
  isSaving = false,
}: TestCaseDetailsViewerModalProps) {
  const dispatch = useDispatch<AppDispatch>();
  const [localTestCase, setLocalTestCase] = useState<testCaseSchema | null>(
    testCase,
  );
  const [isVisible, setIsVisible] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [flowIndex, setFlowIndex] = useState(0);
  const [isFlowSynced, setIsFlowSynced] = useState(false);
  const [isAutoPlay, setIsAutoPlay] = useState(false);
  const [mode, setMode] = useState<"flow" | "video">("flow");
  const allTestCases = useSelector(
    (state: RootState) => state.testCases.testCases,
  );
  const features = useSelector((state: RootState) => state.features.features);

  const [showTitleInput, setShowTitleInput] = useState(false);
  const [titleValue, setTitleValue] = useState<string>(testCase?.title || "");
  const [isUpdatingTitle, setIsUpdatingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [screenshotHttp, setScreenshotHttp] = useState<string | null>(null);
  const [isScreenshotLoading, setIsScreenshotLoading] = useState(false);
  const [stepImageHttpUrls, setStepImageHttpUrls] = useState<
    Map<number, string | null>
  >(new Map());
  const [stepImageLoadingStates, setStepImageLoadingStates] = useState<
    Map<number, boolean>
  >(new Map());

  useEffect(() => {
    setTitleValue(localTestCase?.title || "");
  }, [localTestCase?.title]);

  useEffect(() => {
    if (showTitleInput && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [showTitleInput]);

  const handleTitleClick = () => {
    if (!isEditing) return;
    setShowTitleInput(true);
  };

  const handleTitleSave = async () => {
    if (!localTestCase?.test_case_id || isUpdatingTitle) return;
    try {
      setIsUpdatingTitle(true);
      const updated = {
        ...localTestCase,
        title: titleValue.trim(),
      } as testCaseSchema;
      setLocalTestCase(updated);
      const ok = onTestCaseUpdate ? await onTestCaseUpdate(updated) : true;
      if (ok) {
        toast.success("Title updated successfully");
        setShowTitleInput(false);
      }
    } catch (err) {
      toast.error("Failed to update title");
    } finally {
      setIsUpdatingTitle(false);
    }
  };

  const handleTitleCancel = () => {
    setTitleValue(localTestCase?.title || "");
    setShowTitleInput(false);
  };

  const handleTitleInputBlur = () => {
    if (titleValue.trim() !== (localTestCase?.title || "")) {
      void handleTitleSave();
    } else {
      handleTitleCancel();
    }
  };

  const handleTitleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleTitleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleTitleCancel();
    }
  };

  const handleSaveTestCase = useCallback(
    async (updateData: Partial<testCaseSchema>) => {
      if (!onTestCaseUpdate) return false;
      const updated = {
        ...localTestCase,
        ...updateData,
      } as testCaseSchema;
      setLocalTestCase(updated);
      return await onTestCaseUpdate(updated);
    },
    [localTestCase, onTestCaseUpdate],
  );

  const handleTestCaseUpdate = useCallback(
    async (updated: testCaseSchema) => {
      if (!onTestCaseUpdate) return false;
      const ok = await onTestCaseUpdate(updated);
      if (ok) setLocalTestCase(updated);
      return ok;
    },
    [onTestCaseUpdate],
  );

  const commonTCDetailsProps = useMemo(
    () => ({
      testCase: localTestCase!,
      allTestCases: allTestCases || [],
      features: features || [],
      onSaveTestCase: handleSaveTestCase,
      onTestCaseUpdate: handleTestCaseUpdate,
      isLoading: { status: !!isSaving, action: "saving" },
      onCriticalityChange: async () => {},
      showCriticality: false,
      showDescription: false,
      showSteps: false,
      canEditPreconditions: true,
      canEditMirrored: true,
      viewerLayout: true,
    }),
    [
      localTestCase,
      allTestCases,
      features,
      handleSaveTestCase,
      handleTestCaseUpdate,
      isSaving,
    ],
  );

  const updateUrlParameter = useCallback((testCaseId: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set("test_case_id", testCaseId);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", newUrl);
  }, []);

  const removeUrlParameter = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete("test_case_id");
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  }, []);

  const steps: ViewerStep[] = useMemo(() => {
    if (!localTestCase?.test_case_steps) return [];
    return localTestCase.test_case_steps.map((s, idx) => ({
      id: idx + 1,
      description: s.step_description,
      expectedResults: Array.isArray(s.expected_results)
        ? s.expected_results
        : [],
      status: s.status || TestCaseStepStatus.INCOMPLETE,
      type: s.type,
      originalIndex: idx,
    }));
  }, [localTestCase]);

  useEffect(() => {
    if (inline) {
      setIsVisible(true);
      return;
    }
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, [inline]);

  useEffect(() => {
    if (productId && (!allTestCases || allTestCases.length === 0)) {
      dispatch(fetchTestCasesAction(productId));
    }
  }, [productId, allTestCases?.length, dispatch]);

  useEffect(() => {
    if (productId && (!features || features.length === 0)) {
      dispatch(fetchFeaturesAction(productId));
    }
  }, [productId, features?.length, dispatch]);

  useEffect(() => {
    if (localTestCase?.test_case_id) {
      updateUrlParameter(localTestCase.test_case_id);
    }
  }, [localTestCase?.test_case_id, updateUrlParameter]);

  useEffect(() => {
    setCurrentStepIndex(-1);
    setFlowIndex(0);
    setIsFlowSynced(false);
    setIsAutoPlay(false);
    setStepImageHttpUrls(new Map());
    setStepImageLoadingStates(new Map());
  }, [localTestCase?.test_case_id]);

  useEffect(() => {
    setLocalTestCase(testCase);
  }, [testCase?.test_case_id]);

  useEffect(() => {
    if (!localTestCase?.screenshot_url) {
      setScreenshotHttp(null);
      setIsScreenshotLoading(false);
      return;
    }

    const fetchSignedUrl = async () => {
      const raw = localTestCase.screenshot_url;
      setIsScreenshotLoading(true);

      try {
        const response = await fetch(
          raw?.startsWith(GCS_BUCKET_URL)
            ? `${GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT}${raw.substring(GCS_BUCKET_URL.length)}`
            : `${GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT}${raw}`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch screenshot signed URL");
        }

        const { signedUrl } = await response.json();
        setScreenshotHttp(signedUrl);
      } catch (error) {
        console.error("Error while fetching the screenshot signed URL:", error);
        setScreenshotHttp(null);
      } finally {
        setIsScreenshotLoading(false);
      }
    };

    fetchSignedUrl();
  }, [localTestCase?.screenshot_url]);

  const handleClose = useCallback(() => {
    if (inline) {
      onClose();
      return;
    }
    setIsVisible(false);
    removeUrlParameter();
    setTimeout(() => onClose(), 300);
  }, [onClose, removeUrlParameter, inline]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isEditingText =
        ["INPUT", "TEXTAREA"].includes(target.tagName) ||
        target.isContentEditable;
      if (event.key === "Escape") {
        handleClose();
        return;
      }
      if (isEditingText) return;

      if (event.key === "ArrowRight") {
        if (currentStepIndex < steps.length - 1)
          setCurrentStepIndex((i) => i + 1);
        else if (hasNext) onNextTestCase();
      } else if (event.key === "ArrowLeft") {
        if (currentStepIndex > 0) setCurrentStepIndex((i) => i - 1);
        else if (hasPrev) onPrevTestCase();
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", handleKeyDown, {
        capture: true,
      } as EventListenerOptions);
  }, [
    currentStepIndex,
    steps.length,
    hasNext,
    hasPrev,
    onNextTestCase,
    onPrevTestCase,
    handleClose,
  ]);

  const metaGraphs = useMemo(() => {
    try {
      if (!localTestCase?.metadata)
        return {
          nodesById: null as Record<string, unknown> | null,
          edgesById: null as Record<string, unknown> | null,
        };
      const meta = JSON.parse(localTestCase.metadata);
      const graph = meta?.tc_graph_json;
      if (!graph?.nodes || !graph?.edges)
        return {
          nodesById: null as Record<string, unknown> | null,
          edgesById: null as Record<string, unknown> | null,
        };
      const nodesById = graph.nodes.reduce(
        (acc: Record<string, unknown>, n: { id?: string }) => {
          if (n?.id) acc[n.id] = n;
          return acc;
        },
        {} as Record<string, unknown>,
      );
      const edgesById = graph.edges.reduce(
        (acc: Record<string, unknown>, e: { id?: string }) => {
          if (e?.id) acc[e.id] = e;
          return acc;
        },
        {} as Record<string, unknown>,
      );
      return { nodesById, edgesById };
    } catch (error) {
      console.error("Failed to parse test case metadata:", error);
      return {
        nodesById: null as Record<string, unknown> | null,
        edgesById: null as Record<string, unknown> | null,
      };
    }
  }, [localTestCase?.metadata]);

  const toHttpUrl = (src: string): string =>
    src?.startsWith("gs://")
      ? `${GCS_BUCKET_URL}${src.replace("gs://", "")}`
      : src;

  const fetchSignedUrlForStepImage = useCallback(
    async (stepIdx: number, imageUrl: string): Promise<string | null> => {
      try {
        if (imageUrl && imageUrl.startsWith(GCS_BUCKET_URL)) {
          const framePath = imageUrl.substring(GCS_BUCKET_URL.length);
          const response = await fetch(
            `${GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT}${framePath}`,
          );

          if (!response.ok) {
            throw new Error("Failed to fetch signed URL");
          }

          const { signedUrl } = await response.json();
          return signedUrl;
        } else {
          return imageUrl;
        }
      } catch (error) {
        console.error(
          `Error while fetching signed URL for step ${stepIdx}:`,
          error,
        );
        return null;
      }
    },
    [],
  );

  const getStepImageFromMetadata = useCallback(
    async (stepIdx: number): Promise<string | null> => {
      try {
        const cached = stepImageHttpUrls.get(stepIdx);
        if (cached !== undefined) {
          return cached;
        }

        if (stepImageLoadingStates.get(stepIdx)) {
          return null;
        }

        const { nodesById, edgesById } = metaGraphs;
        if (!nodesById || !edgesById) return null;

        const step = localTestCase?.test_case_steps?.[stepIdx] as
          | { edge_id?: string }
          | undefined;
        const edgeId: string | undefined = step?.edge_id;
        if (edgeId && (edgesById as Record<string, unknown>)[edgeId]) {
          const edge = (edgesById as Record<string, unknown>)[edgeId] as {
            source?: string;
            target?: string;
          };
          const nodeId =
            (edge?.source as string | undefined) ??
            (edge?.target as string | undefined);
          if (nodeId && (nodesById as Record<string, unknown>)[nodeId]) {
            const node = (nodesById as Record<string, unknown>)[nodeId] as {
              data?: {
                image?: string;
                frame_url?: string;
                screenshot_url?: string;
              };
            };
            const raw =
              node?.data?.image ||
              node?.data?.frame_url ||
              node?.data?.screenshot_url;

            if (typeof raw === "string" && raw.length > 0) {
              const httpUrl = toHttpUrl(raw);

              setStepImageLoadingStates(
                (prev) => new Map(prev.set(stepIdx, true)),
              );

              try {
                const signedUrl = await fetchSignedUrlForStepImage(
                  stepIdx,
                  httpUrl,
                );

                setStepImageHttpUrls(
                  (prev) => new Map(prev.set(stepIdx, signedUrl)),
                );
                setStepImageLoadingStates(
                  (prev) => new Map(prev.set(stepIdx, false)),
                );

                return signedUrl;
              } catch (error) {
                console.error(
                  `Failed to fetch signed URL for step ${stepIdx}:`,
                  error,
                );
                setStepImageLoadingStates(
                  (prev) => new Map(prev.set(stepIdx, false)),
                );
                setStepImageHttpUrls(
                  (prev) => new Map(prev.set(stepIdx, null)),
                );
                return null;
              }
            }
          }
        }

        return null;
      } catch (error) {
        console.error("Failed to get step image from metadata:", error);
        setStepImageLoadingStates((prev) => new Map(prev.set(stepIdx, false)));
        return null;
      }
    },
    [
      metaGraphs,
      localTestCase?.test_case_steps,
      stepImageHttpUrls,
      stepImageLoadingStates,
      fetchSignedUrlForStepImage,
    ],
  );

  const hasStepImageInMetadata = useCallback(
    (stepIdx: number): boolean => {
      try {
        const { nodesById, edgesById } = metaGraphs;
        if (!nodesById || !edgesById) return false;

        const step = localTestCase?.test_case_steps?.[stepIdx] as
          | { edge_id?: string }
          | undefined;
        const edgeId: string | undefined = step?.edge_id;
        if (edgeId && (edgesById as Record<string, unknown>)[edgeId]) {
          const edge = (edgesById as Record<string, unknown>)[edgeId] as {
            source?: string;
            target?: string;
          };
          const nodeId =
            (edge?.source as string | undefined) ??
            (edge?.target as string | undefined);
          if (nodeId && (nodesById as Record<string, unknown>)[nodeId]) {
            const node = (nodesById as Record<string, unknown>)[nodeId] as {
              data?: {
                image?: string;
                frame_url?: string;
                screenshot_url?: string;
              };
            };
            const raw =
              node?.data?.image ||
              node?.data?.frame_url ||
              node?.data?.screenshot_url;

            return typeof raw === "string" && raw.length > 0;
          }
        }

        return false;
      } catch (error) {
        console.error("Failed to check step image from metadata:", error);
        return false;
      }
    },
    [metaGraphs, localTestCase?.test_case_steps],
  );

  const { finalSlideHttp, isFinalSlideLoading } = useFinalSlide({
    localTestCase,
    metaGraphs,
    fetchSignedUrlForStepImage,
    toHttpUrl,
    flowStepsLength: steps.length,
  });

  useEffect(() => {
    if (!steps.length || !localTestCase?.metadata) return;

    const preloadImages = async () => {
      const prioritySteps = [flowIndex, flowIndex - 1, flowIndex + 1].filter(
        (idx) => idx >= 0 && idx < steps.length,
      );

      for (const stepIdx of prioritySteps) {
        if (
          !stepImageHttpUrls.has(stepIdx) &&
          !stepImageLoadingStates.get(stepIdx)
        ) {
          await getStepImageFromMetadata(stepIdx);
        }
      }

      setTimeout(async () => {
        for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
          if (
            !prioritySteps.includes(stepIdx) &&
            !stepImageHttpUrls.has(stepIdx) &&
            !stepImageLoadingStates.get(stepIdx)
          ) {
            await getStepImageFromMetadata(stepIdx);
          }
        }
      }, 100);
    };

    preloadImages();
  }, [
    steps.length,
    localTestCase?.metadata,
    flowIndex,
    getStepImageFromMetadata,
    stepImageHttpUrls,
    stepImageLoadingStates,
  ]);

  useEffect(() => {
    if (isFlowSynced && currentStepIndex >= 0) {
      setFlowIndex(currentStepIndex + 1);
    } else if (currentStepIndex === -1) {
      setFlowIndex(0);
    }
  }, [currentStepIndex, isFlowSynced]);

  useEffect(() => {
    if (mode !== "flow") return;
    if (!isAutoPlay) return;
    if (currentStepIndex < 0) return;

    return;
  }, [mode, isAutoPlay, isFlowSynced, currentStepIndex]);

  if (!localTestCase) return null;

  return (
    <div className={inline ? "flex w-full h-full" : "fixed inset-0 z-50 flex"}>
      {!inline && (
        <div
          className={`absolute inset-0 bg-black transition-opacity duration-300 ease-in-out ${isVisible ? "opacity-50" : "opacity-0"}`}
          onClick={handleClose}
        />
      )}
      {!inline && hasPrev && (
        <div
          className="absolute left-64 top-1/2 transform -translate-y-1/2 z-50"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onPrevTestCase}
            className="flex items-center justify-center w-12 h-12 rounded-full bg-white shadow-lg hover:bg-gray-100 transition-all duration-200 border border-gray-200"
            aria-label="Previous test case"
          >
            <ChevronLeft className="h-6 w-6 text-gray-600" />
          </button>
        </div>
      )}

      {!inline && hasNext && (
        <div
          className="absolute right-5 top-1/2 transform -translate-y-1/2 z-50"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onNextTestCase}
            className="flex items-center justify-center w-12 h-12 rounded-full bg-white shadow-lg hover:bg-gray-100 transition-all duration-200 border border-gray-200"
            aria-label="Next test case"
          >
            <ChevronRight className="h-6 w-6 text-gray-600" />
          </button>
        </div>
      )}
      <div
        className={
          inline
            ? "relative w-full h-full bg-white"
            : `absolute right-0 top-0 bottom-0 ml-[280px] max-w-[calc(100%-280px)] w-full bg-white shadow-xl transition-transform duration-300 ease-in-out ${
                isVisible ? "translate-x-0" : "translate-x-full"
              }`
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-full bg-gradient-to-br from-background to-muted">
          <div className="w-2/5 min-w-[380px] h-full flex flex-col items-center justify-start p-6">
            <div className="glass-effect rounded-full p-1 mb-4 mt-8">
              <div className="flex gap-1">
                <Button
                  variant={mode === "flow" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setMode("flow")}
                  className={`rounded-full px-6 ${mode === "flow" ? "bg-purple-600 hover:bg-purple-700" : "text-white hover:bg-white/20"}`}
                >
                  <Monitor size={16} className="mr-2" />
                  Flow
                </Button>
                <Button
                  variant={mode === "video" ? "default" : "ghost"}
                  size="sm"
                  disabled
                  className={`rounded-full px-6 ${mode === "video" ? "bg-purple-600 hover:bg-purple-700" : "text-white hover:bg-white/20"} opacity-50 cursor-not-allowed`}
                >
                  <Play size={16} className="mr-2" />
                  Video
                </Button>
              </div>
            </div>

            <div
              className="relative w-80 h-[640px] rounded-2xl overflow-hidden bg-muted shadow portal-container mb-8"
              onClick={() => {
                setIsFlowSynced(false);
                setIsAutoPlay(false);
                setCurrentStepIndex(-1);
              }}
            >
              {(() => {
                const hasAnyFlow = steps.some((_, idx) => {
                  const cached = stepImageHttpUrls.get(idx);
                  if (cached !== undefined) {
                    return cached !== null;
                  }
                  return hasStepImageInMetadata(idx);
                });
                if (!hasAnyFlow) {
                  if (isScreenshotLoading) {
                    return (
                      <div className="w-80 h-[640px] bg-gray-100 flex items-center justify-center">
                        <div className="text-gray-400 text-sm flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                          Loading...
                        </div>
                      </div>
                    );
                  }

                  if (!screenshotHttp) {
                    return (
                      <div className="w-80 h-[640px] bg-gray-100 flex items-center justify-center">
                        <span className="text-gray-400 text-sm">
                          No image available
                        </span>
                      </div>
                    );
                  }
                  return (
                    <img
                      src={screenshotHttp}
                      alt={localTestCase.title || "Test Case"}
                      className="w-80 h-[640px] object-cover bg-black/5"
                    />
                  );
                }
                return (
                  <div
                    className="flex w-full h-full transition-transform duration-300 ease-in-out"
                    style={{ transform: `translateX(-${flowIndex * 100}%)` }}
                  >
                    {steps.length > 0 ? (
                      steps.map((s, idx) => (
                        <FlowImage
                          key={s.id}
                          testCase={localTestCase}
                          fallbackSrc={
                            isScreenshotLoading ? null : screenshotHttp
                          }
                          stepIndex={idx}
                          getStepImageFromMetadata={getStepImageFromMetadata}
                          stepImageHttpUrls={stepImageHttpUrls}
                          stepImageLoadingStates={stepImageLoadingStates}
                        />
                      ))
                    ) : (
                      <FlowImage
                        testCase={localTestCase}
                        fallbackSrc={
                          isScreenshotLoading ? null : screenshotHttp
                        }
                        stepIndex={0}
                        getStepImageFromMetadata={getStepImageFromMetadata}
                        stepImageHttpUrls={stepImageHttpUrls}
                        stepImageLoadingStates={stepImageLoadingStates}
                      />
                    )}

                    <div className="w-80 h-[640px] flex-shrink-0 flex items-center justify-center bg-gray-100">
                      {isFinalSlideLoading ? (
                        <span className="text-gray-400 text-sm">
                          Loading...
                        </span>
                      ) : finalSlideHttp ? (
                        <img
                          src={finalSlideHttp}
                          alt="Final"
                          className="w-80 h-[640px] object-cover bg-black/5"
                        />
                      ) : (
                        <span className="text-gray-400 text-sm">
                          No image available
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {steps.some((_, idx) => {
                const cached = stepImageHttpUrls.get(idx);
                if (cached !== undefined) {
                  return cached !== null;
                }
                return hasStepImageInMetadata(idx);
              }) &&
                steps.length > 0 && (
                  <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-md">
                    {flowIndex + 1} / {steps.length + 1}
                  </div>
                )}

              {steps.some((_, idx) => {
                const cached = stepImageHttpUrls.get(idx);
                if (cached !== undefined) {
                  return cached !== null;
                }
                return hasStepImageInMetadata(idx);
              }) &&
                steps.length > 1 && (
                  <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 flex justify-between">
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() => {
                        setFlowIndex((i) => Math.max(0, i - 1));
                        setIsFlowSynced(false);
                        setIsAutoPlay(false);
                      }}
                      disabled={flowIndex === 0}
                      className="bg-black/40 text-white hover:bg-black/60 border border-white/10"
                      aria-label="Previous step"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() => {
                        setFlowIndex((i) => Math.min(steps.length, i + 1));
                        setIsFlowSynced(false);
                        setIsAutoPlay(false);
                      }}
                      disabled={flowIndex === steps.length}
                      className="bg-black/40 text-white hover:bg-black/60 border border-white/10"
                      aria-label="Next step"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </div>
                )}
            </div>
          </div>

          <div className="w-3/5 h-full flex flex-col">
            <div className="flex justify-between items-start p-6 pb-4 border-b bg-white/80 backdrop-blur-sm">
              <div className="flex-1">
                {showTitleInput ? (
                  <div className="mb-2 max-w-2xl">
                    <input
                      ref={titleInputRef}
                      value={titleValue}
                      onChange={(e) => setTitleValue(e.target.value)}
                      onBlur={handleTitleInputBlur}
                      onKeyDown={handleTitleInputKeyDown}
                      placeholder="Enter title"
                      className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-3xl"
                      disabled={isUpdatingTitle || isSaving}
                    />
                    {isUpdatingTitle && (
                      <Loader2 className="h-4 w-4 animate-spin text-purple-600 mt-1" />
                    )}
                  </div>
                ) : (
                  <h1
                    className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent mb-2 cursor-pointer"
                    title={localTestCase.title || localTestCase.test_case_id}
                    onClick={handleTitleClick}
                  >
                    {localTestCase.title || localTestCase.test_case_id}
                  </h1>
                )}
                <TCHeader
                  testCase={localTestCase}
                  features={features || []}
                  onClose={() => {}}
                  onCopy={() => {}}
                  onDelete={() => {}}
                  onCriticalityChange={async () => {}}
                  onStatusChange={async () => {}}
                  onTestCaseUpdate={async (updated) => {
                    if (!onTestCaseUpdate) return true;
                    const ok = await onTestCaseUpdate(updated);
                    if (ok) setLocalTestCase(updated);
                    return ok;
                  }}
                  isLoading={{
                    status: !!isSaving,
                    action: isSaving ? "saving" : null,
                  }}
                  isStatusLoading={false}
                  showFlowViewer={() => {}}
                  isBrowserDroid={false}
                  variant="minimal"
                  showTitle={false}
                  showFeatureSelector={false}
                />
                {localTestCase.test_case_description && (
                  <p className="text-muted-foreground leading-relaxed">
                    {localTestCase.test_case_description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 ml-4">
                {inline && (
                  <>
                    {handleAddTestRun && (
                      <Button
                        onClick={handleAddTestRun}
                        variant="outline"
                        disabled={isTestRunLoading}
                      >
                        {isTestRunLoading ? "Starting Test..." : "Run Test"}
                      </Button>
                    )}
                    {testRunId && productId && (
                      <Button
                        onClick={() => {
                          window.location.href = `/${productId}/test-runs/${testRunId}`;
                        }}
                        variant="outline"
                      >
                        View Test Run
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onClose()}
                      aria-label="Close"
                      className="ml-2"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </>
                )}
                {!inline && (
                  <div className="min-w-[160px]">
                    <Select value="viewer" disabled>
                      <SelectTrigger className="bg-white border-gray-200">
                        <SelectValue placeholder="Viewer Mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">Viewer Mode</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {!inline && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClose}
                    aria-label="Close"
                    className="ml-2"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0">
              <ScrollArea className="h-full">
                <div className="px-6 py-6 space-y-6 pb-24">
                  {/* Feature + Preconditions & Credentials */}
                  <div className="space-y-6">
                    <TCDetailsSection
                      {...commonTCDetailsProps}
                      renderTopSections={true}
                    />
                  </div>

                  <hr className="border-gray-300" />

                  {/* Steps */}
                  <div
                    className="px-4 py-2"
                    onClick={() => {
                      setCurrentStepIndex(-1);
                    }}
                  >
                    <TestCaseStepsViewer
                      steps={steps}
                      currentStepIndex={currentStepIndex}
                      onStepClick={(idx) => {
                        setCurrentStepIndex(idx);
                        setIsFlowSynced(true);
                        setIsAutoPlay(true);
                      }}
                    />
                  </div>

                  <hr className="border-gray-300" />

                  {/* Scenarios & Mirrored (bottom) */}
                  <div className="space-y-6">
                    <TCDetailsSection
                      {...commonTCDetailsProps}
                      renderBottomSections={true}
                    />
                  </div>
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
