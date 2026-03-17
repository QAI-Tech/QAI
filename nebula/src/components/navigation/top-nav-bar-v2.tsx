"use client";
import { useMemo, useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  Plus,
  LayoutList,
  LayoutGrid,
  Loader2,
  Edit2,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useLoading } from "@/app/context/loading-context";
import { useUser } from "@clerk/nextjs";
import { isQaiOrgAnalystUser, isQaiOrgUser } from "@/lib/constants";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "@/app/store/store";
import { useProductSwitcher } from "@/providers/product-provider";
import { fetchTestCases } from "@/app/store/testCaseSlice";
import { fetchFeatures } from "@/app/store/featuresSlice";
import { fetchTestSuites } from "@/app/store/testSuiteSlice";
import { fetchTestRunsForProduct } from "@/app/store/testRunSlice";
import { useRouter, useSearchParams } from "next/navigation";
import { useGraphFlows } from "@/app/context/graph-flows-context";
import { StartTestRunDialog } from "@/app/(dashboard)/_components/start-test-run-dialog";
import { ChooseTestTypeDialog } from "@/app/(dashboard)/_components/choose-test-type-dialog";
import { CaptureNewFlowDialog } from "./capture-new-flow-dialog";
import { AddFeatureDialog } from "./add-feature-dialog";
import { Feature } from "@/lib/types";
import {
  fetchOrganizations,
  setSelectedOrganization,
} from "@/app/store/organizationSlice";
import { setGraphFeatures } from "@/app/store/graphFeaturesSlice";
import AddProductDialog from "@/components/global/AddProductDialog";
import { updateProduct, deleteProduct } from "@/app/store/productSlice";
import { ConfirmationDialog } from "@/components/global/delete-confirmation-dialog";
import { Combobox } from "@/components/ui/combobox-pop-search";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WebRecorderIndicator } from "./web-recorder-indicator";

function TestRunsModeSelector() {
  const [currentMode, setCurrentMode] = useState<
    "viewer" | "executor" | "reviewer"
  >(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("testRunsViewMode");
      if (saved && ["viewer", "executor", "reviewer"].includes(saved)) {
        return saved as "viewer" | "executor" | "reviewer";
      }
    }
    return "executor";
  });

  useEffect(() => {
    // Initialize from localStorage if available
    if (typeof window !== "undefined") {
      const savedMode = localStorage.getItem("testRunsViewMode") as
        | "viewer"
        | "executor"
        | "reviewer";
      if (savedMode) {
        // Dispatch the initial mode to ensure other components are in sync
        window.dispatchEvent(
          new CustomEvent("testRunsViewModeChange", {
            detail: { mode: savedMode },
          }),
        );
      }
    }

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{
        mode: "viewer" | "executor" | "reviewer";
      }>;
      if (customEvent.detail?.mode) {
        setCurrentMode(customEvent.detail.mode);
        // Do not update localStorage here to avoid overwriting user preference
        // with default initialization values from other components.
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("testRunsViewModeUpdate", handler);
      window.dispatchEvent(
        new CustomEvent("testRunsViewModeRequest", {
          detail: {},
        }),
      );
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("testRunsViewModeUpdate", handler);
      }
    };
  }, []);

  return (
    <Select
      value={currentMode}
      onValueChange={(next) => {
        const mode = next as "viewer" | "executor" | "reviewer";
        setCurrentMode(mode);
        if (typeof window !== "undefined") {
          localStorage.setItem("testRunsViewMode", mode);
          window.dispatchEvent(
            new CustomEvent("testRunsViewModeChange", {
              detail: { mode: next },
            }),
          );
        }
      }}
    >
      <SelectTrigger className="h-10 w-[140px]">
        <SelectValue placeholder="Viewer" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="viewer">Viewer</SelectItem>
        <SelectItem value="executor">Executor</SelectItem>
        <SelectItem value="reviewer">Reviewer</SelectItem>
      </SelectContent>
    </Select>
  );
}

interface AppHeaderProps {
  hasFlows?: boolean;
  isLinearViewEnabled: boolean;
  onToggleLinearView: (enabled: boolean) => void;
}

export function AppHeader({
  hasFlows = false,
  isLinearViewEnabled,
  onToggleLinearView,
}: AppHeaderProps) {
  const pathname = usePathname();
  const { isAppLoading } = useLoading();
  const { user, isLoaded, isSignedIn } = useUser();
  const { productSwitcher, setProductSwitcher } = useProductSwitcher();
  const productData = useSelector(
    (state: RootState) => state.products.products,
  );
  const {
    organizations,
    selectedOrgId,
    loading: orgsLoading,
  } = useSelector((state: RootState) => state.organizations);

  const graphFeatures = useSelector(
    (state: RootState) => state.graphFeatures.features,
  );
  const { flows: graphFlows, isLoading: isGraphLoading } = useGraphFlows();

  const hasFlowsValue = !isGraphLoading && graphFlows.length > 0;
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const searchParams = useSearchParams();
  const isFlowsPage =
    pathname.endsWith(`/${productSwitcher.product_id}`) ||
    pathname.endsWith(`/${productSwitcher.product_id}/`);
  const isTestRunsPage = pathname.includes(
    `/${productSwitcher.product_id}/test-runs`,
  );
  const selectedTcueId = searchParams.get("tcue");
  const selectedTestRunId = searchParams.get("testRunId");
  const addFlowsMode = searchParams.get("addFlowsMode");

  const addFlowsToTestRunContext =
    addFlowsMode === "true" && selectedTestRunId
      ? { testRunId: selectedTestRunId, productId: productSwitcher.product_id }
      : null;

  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;
  const isQaiUser = isQaiOrgUser(userOrgId);
  const [showNewFlowDialog, setShowNewFlowDialog] = useState(false);
  const [showNewFeatureDialog, setShowNewFeatureDialog] = useState(false);
  const [showTestRunDialog, setShowTestRunDialog] = useState(false);
  const [showChooseTestTypeDialog, setShowChooseTestTypeDialog] =
    useState(false);
  const [selectedTestType, setSelectedTestType] =
    useState<string>("functional");

  // Flow selection state for v2 "New Test Run" (flows-first)
  const [isFlowSelectionMode, setIsFlowSelectionMode] = useState(false);
  const [selectedFlowIdsForTestRun, setSelectedFlowIdsForTestRun] = useState<
    string[]
  >([]);

  const [isAddingFlowsToRun, setIsAddingFlowsToRun] = useState(false);

  const cancelFlowSelection = (options?: { clearAddFlowsParams?: boolean }) => {
    setIsFlowSelectionMode(false);
    setSelectedFlowIdsForTestRun([]);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("graphCancelTestRunSelection"));
    }

    if (options?.clearAddFlowsParams && addFlowsToTestRunContext) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("addFlowsMode");
      params.delete("testRunId");

      const qs = params.toString();
      const nextUrl = qs
        ? `/${productSwitcher.product_id}?${qs}`
        : `/${productSwitcher.product_id}`;

      router.replace(nextUrl);
    }
  };
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingProductName, setEditingProductName] = useState("");
  const [isDeletingProduct, setIsDeletingProduct] = useState(false);
  const [productToDelete, setProductToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);

  const handleStartEdit = (e: React.MouseEvent, id: string, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingProductId(id);
    setEditingProductName(name);
  };

  const handleCancelEdit = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingProductId(null);
    setEditingProductName("");
  };

  const handleSaveEdit = async (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const productId = editingProductId;
    const newName = editingProductName.trim();
    if (!productId) return;

    const originalName =
      productData?.find((p) => p.product_id === productId)?.product_name || "";

    if (!newName || newName === originalName) {
      setEditingProductId(null);
      setEditingProductName("");
      return;
    }
    dispatch(updateProduct({ id: productId, name: newName }));
    setEditingProductId(null);
    setEditingProductName("");

    try {
      const response = await fetch("/api/update-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, name: newName }),
      });

      if (!response.ok) {
        throw new Error("Failed to update product");
      }
    } catch (error) {
      dispatch(updateProduct({ id: productId, name: originalName }));
      toast.error("Failed to update product");
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    setProductToDelete({ id, name });
    setIsDeletingProduct(true);
  };

  const confirmDelete = async () => {
    if (!productToDelete) return;

    try {
      setIsDeleteSubmitting(true);
      const response = await fetch("/api/delete-product", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productToDelete.id }),
      });

      if (response.ok) {
        dispatch(deleteProduct(productToDelete.id));
        toast.success("Product deleted successfully");
        setIsDeletingProduct(false);
      } else {
        toast.error("Failed to delete product");
      }
    } catch (error) {
      toast.error("Error deleting product");
    } finally {
      setIsDeleteSubmitting(false);
    }
  };

  const handleProductSelectChange = (value: string) => {
    if (productData) {
      const selected = productData.find(
        (product) => product.product_id === value,
      );
      if (selected && selected.product_id != productSwitcher.product_id) {
        localStorage.setItem("product_id", selected.product_id);
        setProductSwitcher(selected);
        router.push(`/${selected.product_id}?showFlows=true`);
      }
    }
  };

  const handleOrgChange = (value: string) => {
    dispatch(setSelectedOrganization(value));
  };

  const handleAddFlowsToTestRun = async () => {
    if (!addFlowsToTestRunContext || selectedFlowIdsForTestRun.length === 0) {
      return;
    }

    try {
      setIsAddingFlowsToRun(true);
      const response = await fetch("/api/add-flows-to-existing-test-run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product_id: addFlowsToTestRunContext.productId,
          test_run_id: addFlowsToTestRunContext.testRunId,
          flow_ids: selectedFlowIdsForTestRun,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "Failed to add flows to test run");
      }

      // Cancel selection and strip add-flows params so returning to flows isn't stuck in selection mode.
      cancelFlowSelection({
        clearAddFlowsParams: true,
      });

      router.push(
        `/${addFlowsToTestRunContext.productId}/test-runs?testRunId=${addFlowsToTestRunContext.testRunId}`,
      );
    } catch (error) {
      console.error("Error adding flows to test run:", error);
      toast.error("Failed to add flows to test run");
    } finally {
      setIsAddingFlowsToRun(false);
    }
  };

  const handleFeatureSelectChange = (value: string) => {
    if (value === "__add_new__") {
      setShowNewFeatureDialog(true);
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("featureId", value);
    } else {
      params.delete("featureId");
    }

    // Always preserve showFlows=true (default behavior)
    const showFlows = searchParams.get("showFlows");
    if (showFlows !== "false") {
      params.set("showFlows", "true");
    }
    router.push(`/${productSwitcher.product_id}?${params.toString()}`);
  };

  const handleFeatureCreated = (newFeature: Feature) => {
    const normalizedFeature = {
      id: newFeature.id,
      name: newFeature.name,
      nodeIds:
        (graphFeatures.find((f) => f.id === newFeature.id)
          ?.nodeIds as string[]) || [],
    };

    const exists = graphFeatures.some((f) => f.id === normalizedFeature.id);
    const updatedGraphFeatures = exists
      ? graphFeatures
      : [...graphFeatures, normalizedFeature];
    dispatch(setGraphFeatures(updatedGraphFeatures));

    handleFeatureSelectChange(newFeature.id);
  };

  useEffect(() => {
    if (!productSwitcher.product_id) return;

    dispatch(fetchTestRunsForProduct(productSwitcher.product_id));
    dispatch(fetchTestSuites(productSwitcher.product_id));
    dispatch(fetchFeatures(productSwitcher.product_id))
      .then(() => {
        dispatch(fetchTestCases(productSwitcher.product_id));
      })
      .catch((error) => {
        console.error("Error fetching data:", error);
      });
  }, [productSwitcher.product_id, dispatch]);

  useEffect(() => {
    if (!isQaiUser) return;
    dispatch(fetchOrganizations());
  }, [dispatch, isQaiUser]);

  // Listen for flow selection updates from the flows panel (FlowManager).
  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{
        isSelectionMode: boolean;
        selectedFlowIds: string[];
      }>;
      const detail = customEvent.detail || {
        isSelectionMode: false,
        selectedFlowIds: [],
      };
      setIsFlowSelectionMode(!!detail.isSelectionMode);
      setSelectedFlowIdsForTestRun(detail.selectedFlowIds || []);
    };

    const cancelHandler = () => {
      setIsFlowSelectionMode(false);
      setSelectedFlowIdsForTestRun([]);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("graphFlowSelectionUpdate", handler);
      window.addEventListener("graphCancelTestRunSelection", cancelHandler);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("graphFlowSelectionUpdate", handler);
        window.removeEventListener(
          "graphCancelTestRunSelection",
          cancelHandler,
        );
      }
    };
  }, []);

  const productOptions = useMemo(() => {
    if (!productData) return [];

    let filtered = productData;
    if (isQaiUser && selectedOrgId !== "all") {
      filtered = productData.filter((p) => p.organisation_id === selectedOrgId);
    }

    return filtered.map((product) => ({
      value: product.product_id,
      label: product.product_name,
    }));
  }, [productData, isQaiUser, selectedOrgId]);

  const orgOptions = useMemo(() => {
    return [
      { value: "all", label: "All Organizations" },
      ...(organizations?.map((org) => ({
        value: org.organization_id,
        label: org.organization_name,
      })) || []),
    ];
  }, [organizations]);

  // Special paths that should not show the top nav
  const isOnboardingPath = pathname.startsWith("/onboarding");
  const isAuthPath =
    pathname.includes("sign-in") || pathname.includes("sign-up");
  const isAuthRelatedPath =
    pathname.includes("verify") || pathname.includes("sso-callback");

  // Also hide top nav if user is signed in but has no organization ID
  const hasNoOrganization =
    isLoaded && isSignedIn && user && !user.publicMetadata?.organisation_id;

  // Don't render top nav for special paths, while loading, or if no organization
  if (
    isAuthPath ||
    isOnboardingPath ||
    isAuthRelatedPath ||
    isAppLoading ||
    hasNoOrganization
  ) {
    return null;
  }

  const handleNewTestRunClick = () => {
    if (isFlowsPage) {
      // First click: enter flow selection mode in the flows panel
      if (!isFlowSelectionMode) {
        setShowChooseTestTypeDialog(true);
        return;
      }

      // In selection mode: only open dialog if we have selected flows
      if (selectedFlowIdsForTestRun.length === 0) {
        return;
      }

      setShowTestRunDialog(true);
      return;
    }

    if (isTestRunsPage) {
      setShowChooseTestTypeDialog(true);
      return;
    }

    setShowTestRunDialog(true);
  };

  const startSelectionAfterChoosingType = (testType: string) => {
    setSelectedTestType(testType);

    if (isTestRunsPage) {
      router.push(`/${productSwitcher.product_id}?showFlows=true`);
      setTimeout(() => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("graphStartTestRunSelection"));
        }
      }, 150);
      return;
    }

    if (isFlowsPage) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("graphStartTestRunSelection"));
      }
      return;
    }
  };

  const renderProductOption = (option: { value: string; label: string }) => {
    const isEditing = editingProductId === option.value;

    return (
      <div className="flex items-center justify-between w-full group py-0.5">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isEditing ? (
            <div className="flex-1 min-w-0 mr-1">
              <Input
                value={editingProductName}
                onChange={(e) => setEditingProductName(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") handleSaveEdit(e);
                  if (e.key === "Escape") handleCancelEdit(e);
                }}
                onBlur={() => handleSaveEdit()}
                className="h-8 py-0 px-2 text-sm bg-background text-foreground border-primary focus-visible:ring-1 focus-visible:ring-primary placeholder:text-muted-foreground"
                autoFocus
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              />
            </div>
          ) : (
            <span className="truncate flex-1">{option.label}</span>
          )}
        </div>
        {!isEditing && (
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity pr-1">
            <button
              onClick={(e) => handleStartEdit(e, option.value, option.label)}
              className="p-1.5 rounded text-white transition-colors"
              title="Edit product"
            >
              <Edit2 className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => handleDeleteClick(e, option.value, option.label)}
              className="p-1.5 hover:bg-accent rounded text-foreground/60 hover:text-destructive transition-colors"
              title="Delete product"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <header className="h-16 bg-background border-b border-border flex items-center">
        <div className="w-2/6 h-full flex items-center px-4 gap-2">
          {isQaiUser ? (
            <Combobox
              options={orgOptions}
              value={selectedOrgId}
              onChange={handleOrgChange}
              placeholder="Search organization..."
              emptyMessage="No organization found"
              buttonLabel={orgsLoading ? "Loading..." : "Select organization"}
              buttonVariant={null}
              className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground cursor-pointer ring-offset-background placeholder:text-muted-foreground hover:bg-background hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              popoverClassName="w-[var(--radix-popover-trigger-width)]"
            />
          ) : (
            <>
              <Combobox
                options={productOptions}
                value={productSwitcher.product_id || ""}
                onChange={handleProductSelectChange}
                placeholder="Search product..."
                emptyMessage="No product found"
                buttonLabel="Select product"
                buttonVariant={null}
                renderOption={renderProductOption}
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground cursor-pointer ring-offset-background placeholder:text-muted-foreground hover:bg-background hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                popoverClassName="w-[var(--radix-popover-trigger-width)]"
              />
              <AddProductDialog />
            </>
          )}
        </div>

        <div className="flex-1 h-full flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            {isQaiUser && (
              <>
                <Combobox
                  options={productOptions}
                  value={productSwitcher.product_id || ""}
                  onChange={handleProductSelectChange}
                  placeholder="Search product..."
                  emptyMessage="No product found"
                  buttonLabel="Select product"
                  buttonVariant={null}
                  renderOption={renderProductOption}
                  className="flex h-10 w-72 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground cursor-pointer ring-offset-background placeholder:text-muted-foreground hover:bg-background hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  popoverClassName="w-72"
                />
                <AddProductDialog />
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <WebRecorderIndicator />
            {isTestRunsPage &&
              (selectedTestRunId || selectedTcueId) &&
              (isQaiOrgUser(
                user?.publicMetadata?.organisation_id as string | undefined,
              ) ||
                isQaiOrgAnalystUser(
                  user?.publicMetadata?.organisation_id as string | undefined,
                )) && <TestRunsModeSelector />}
            {isTestRunsPage && !selectedTestRunId && !selectedTcueId && (
              <Button
                variant="v2"
                onClick={handleNewTestRunClick}
                data-tutorial="start-test-run"
              >
                New Test Run
              </Button>
            )}
            {isFlowsPage && (
              <>
                <div className="relative flex items-center p-1 mr-3 bg-muted rounded-lg border border-border select-none">
                  <div
                    className={cn(
                      "absolute top-1 bottom-1 w-[calc(50%-0.25rem)] bg-[#7c3aed] rounded-md shadow-md transition-all duration-300 ease-out",
                      isLinearViewEnabled ? "left-1" : "left-1/2",
                    )}
                  />
                  <button
                    onClick={() => onToggleLinearView(true)}
                    className={cn(
                      "relative z-10 flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors duration-300 w-24",
                      isLinearViewEnabled
                        ? "text-white"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <LayoutList className="w-4 h-4" />
                    <span>Linear</span>
                  </button>
                  <button
                    onClick={() => onToggleLinearView(false)}
                    className={cn(
                      "relative z-10 flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors duration-300 w-24",
                      !isLinearViewEnabled
                        ? "text-white"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <LayoutGrid className="w-4 h-4" />
                    <span>Graph</span>
                  </button>
                </div>
                {isFlowSelectionMode ? (
                  <Button
                    variant="v2-outline"
                    onClick={() => {
                      cancelFlowSelection({
                        clearAddFlowsParams: !!addFlowsToTestRunContext,
                      });
                    }}
                  >
                    Cancel
                  </Button>
                ) : (
                  <Button
                    variant="v2-outline"
                    onClick={() => setShowNewFlowDialog(true)}
                    data-tutorial="new-flow"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    New Flow
                  </Button>
                )}
                {(hasFlows || hasFlowsValue) && (
                  <Button
                    variant="v2"
                    onClick={
                      addFlowsToTestRunContext
                        ? handleAddFlowsToTestRun
                        : handleNewTestRunClick
                    }
                    data-tutorial="start-test-run"
                    disabled={
                      (isFlowSelectionMode &&
                        selectedFlowIdsForTestRun.length === 0) ||
                      isAddingFlowsToRun
                    }
                  >
                    {addFlowsToTestRunContext ? (
                      isAddingFlowsToRun ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Adding...
                        </span>
                      ) : (
                        `Add ${selectedFlowIdsForTestRun.length} flow${
                          selectedFlowIdsForTestRun.length === 1 ? "" : "s"
                        } to Run`
                      )
                    ) : isFlowSelectionMode ? (
                      `Test ${selectedFlowIdsForTestRun.length} flow${
                        selectedFlowIdsForTestRun.length === 1 ? "" : "s"
                      }`
                    ) : (
                      "New Test Run"
                    )}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      <CaptureNewFlowDialog
        open={showNewFlowDialog}
        onOpenChange={setShowNewFlowDialog}
      />
      <AddFeatureDialog
        open={showNewFeatureDialog}
        onOpenChange={setShowNewFeatureDialog}
        onFeatureCreated={handleFeatureCreated}
      />
      <StartTestRunDialog
        open={showTestRunDialog}
        onOpenChange={(open: boolean) => {
          setShowTestRunDialog(open);
          if (!open && isFlowsPage && isFlowSelectionMode) {
            // Exit selection mode when dialog closes
            cancelFlowSelection();
          }
        }}
        showTrigger={false}
        variant="v2"
        selectedFlowIds={selectedFlowIdsForTestRun}
        testType={selectedTestType}
      />

      <ChooseTestTypeDialog
        open={showChooseTestTypeDialog}
        onOpenChange={setShowChooseTestTypeDialog}
        onSelectTestType={startSelectionAfterChoosingType}
      />

      <ConfirmationDialog
        isOpen={isDeletingProduct}
        onOpenChange={(open: boolean) => {
          setIsDeletingProduct(open);
          if (!open) {
            setProductToDelete(null);
          }
        }}
        onConfirm={confirmDelete}
        title="Delete Product"
        description={`Are you sure you want to delete the product "${productToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        isLoading={isDeleteSubmitting}
      />
    </>
  );
}

export default AppHeader;
