"use client";

import { useState, useEffect } from "react";
import {
  Play,
  Loader2,
  Copy,
  Trash2,
  Pencil,
  ImageIcon,
  Key,
  X,
  FolderPlus,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TestCaseDetailsModal } from "./details/test-case-details-modal";
import type {
  FeatureIdBasedGroupedTestCase,
  FeaturesById,
  testCaseSchema,
  Feature,
  ProductSwitcherSchema,
  TestSuite,
} from "@/lib/types";
import { useProductSwitcher } from "@/providers/product-provider";
import { useSelector, useDispatch } from "react-redux";
import type { RootState } from "@/app/store/store";
import type { AppDispatch } from "@/app/store/store";
import AddTestCaseDialog from "./components/add-test-case-dailog";
import Loading from "@/components/global/loading";
import { StartTestRunDialog } from "@/app/(dashboard)/_components/start-test-run-dialog";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  closestCorners,
  MeasuringStrategy,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableFeature } from "./components/sortable-feature";
import {
  reorderFeatures,
  reorderFeaturesLocal,
} from "@/app/store/featuresSlice";
import {
  reorderTestCases,
  reorderTestCasesLocal,
} from "@/app/store/testCaseSlice";
import { CopyToProductDialog } from "./components/copy-to-product-dialog";
import { ConfirmationDialog } from "@/components/global/delete-confirmation-dialog";
import { deleteTestCase } from "@/app/store/testCaseSlice";
import { isQaiOrgUser, isQaiOrgAnalystUser } from "@/lib/constants";
import { useUser } from "@clerk/nextjs";
import { fetchFeatures } from "@/app/store/featuresSlice";
import { fetchTestCases } from "@/app/store/testCaseSlice";
import { fetchTestRunsForProduct } from "@/app/store/testRunSlice";
import { deleteTestSuite } from "@/app/store/testSuiteSlice";
import { MultipleScreenshotUpdateDialog } from "./components/multiple-screenshot-update-dialog";
import { BulkFeatureUpdateDialog } from "./components/bulk-feature-update-dialog";
import { BulkCredentialsDialog } from "./components/bulk-credentials-dialog";
import { BulkPreconditionsDialog } from "./components/bulk-preconditions-dialog";
import { CreateSuiteDialog } from "./components/create-suite-dialog";
import * as Sentry from "@sentry/nextjs";

export default function TestCasesPage({
  searchParams: initialSearchParams,
}: {
  searchParams?: { selectionMode?: string; testRunId?: string };
}) {
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    Login: true,
    Home: true,
  });
  const [selectedTestCase, setSelectedTestCase] =
    useState<testCaseSchema | null>(null);
  const { productSwitcher, setProductSwitcher } = useProductSwitcher();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddTestCaseDialogBoxOpen, setIsAddTestCaseDialogBoxOpen] =
    useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(
    initialSearchParams?.selectionMode === "true",
  );
  const [selectionModeType, setSelectionModeType] = useState<
    "testRun" | "edit"
  >("testRun");
  const [selectedTestCases, setSelectedTestCases] = useState<testCaseSchema[]>(
    [],
  );
  const [isStartTestRunDialogOpen, setIsStartTestRunDialogOpen] =
    useState(false);
  const [isAddingTestCases, setIsAddingTestCases] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMultipleScreenshotDialog, setShowMultipleScreenshotDialog] =
    useState(false);
  const [showBulkFeatureDialog, setShowBulkFeatureDialog] = useState(false);
  const [showBulkCredentialsDialog, setShowBulkCredentialsDialog] =
    useState(false);
  const [showBulkPreconditionsDialog, setShowBulkPreconditionsDialog] =
    useState(false);
  const [showCreateSuiteDialog, setShowCreateSuiteDialog] = useState(false);
  const [isDeletingTestCases, setIsDeletingTestCases] = useState(false);
  const [sendToNova, setSendToNova] = useState(false);
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const dispatch = useDispatch<AppDispatch>();

  const [currentTestCaseIndex, setCurrentTestCaseIndex] = useState<number>(-1);
  const [activeId, setActiveId] = useState<string | null>(null);
  console.log("Current active feature ID:", activeId); // Debug log to prevent lint error
  const [activeTestCaseId, setActiveTestCaseId] = useState<string | null>(null);
  const [currentDragFeatureId, setCurrentDragFeatureId] = useState<
    string | null
  >(null);
  const { user } = useUser();
  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;
  const isQaiUser = isQaiOrgUser(userOrgId) || isQaiOrgAnalystUser(userOrgId);

  // Add state for tracking product switching
  const [lastProductId, setLastProductId] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);

  // Get products from Redux store
  const products = useSelector((state: RootState) => state.products.products);

  // Check if we're in test run selection mode
  const isTestRunSelection =
    initialSearchParams?.selectionMode === "true" &&
    initialSearchParams?.testRunId;

  // Configured sensors for drag detection with appropriate sensitivity
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Added this useEffect to handle product switching when URL product doesn't match current productSwitcher
  useEffect(() => {
    const setCorrectProduct = async () => {
      if (params.product) {
        setLocalLoading(true);
        const productId = Array.isArray(params.product)
          ? params.product[0]
          : params.product.toString();

        // Check if this is the same product we already processed
        if (productId === lastProductId) {
          setLocalLoading(false);
          return;
        }

        console.log("Current product from URL:", productId);
        console.log(
          "Current productSwitcher product:",
          productSwitcher.product_id,
        );

        // If URL product doesn't match current productSwitcher, switch to the correct product
        if (productId !== productSwitcher.product_id) {
          const product = products.find(
            (product) => product.product_id === productId,
          );

          if (product) {
            console.log("Switching to product:", product);
            setProductSwitcher(product as ProductSwitcherSchema);

            // Fetch data for the new product
            await dispatch(fetchFeatures(product.product_id));
            await dispatch(fetchTestCases(productId));
            await dispatch(fetchTestRunsForProduct(productId));

            setLastProductId(productId);
          }
        }
        setLocalLoading(false);
      }
    };

    setCorrectProduct();
  }, [params.product]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleTestCaseClick = (testCase: testCaseSchema) => {
    // Find the index of the clicked test case in the flattened array
    const index = allTestCases.findIndex(
      (tc) => tc.test_case_id === testCase.test_case_id,
    );
    setCurrentTestCaseIndex(index);
    setSelectedTestCase(testCase);
  };

  const handleCloseModal = () => {
    setSelectedTestCase(null);
    setCurrentTestCaseIndex(-1);
  };

  // Function to navigate to the next test case
  const handleNextTestCase = () => {
    if (currentTestCaseIndex < allTestCases.length - 1) {
      const nextIndex = currentTestCaseIndex + 1;
      setCurrentTestCaseIndex(nextIndex);
      setSelectedTestCase(allTestCases[nextIndex]);
    }
  };

  // Function to navigate to the previous test case
  const handlePrevTestCase = () => {
    if (currentTestCaseIndex > 0) {
      const prevIndex = currentTestCaseIndex - 1;
      setCurrentTestCaseIndex(prevIndex);
      setSelectedTestCase(allTestCases[prevIndex]);
    }
  };

  const toggleTestCaseSelection = (testCase: testCaseSchema) => {
    setSelectedTestCases((prev) => {
      const isSelected = prev.some(
        (tc) => tc.test_case_id === testCase.test_case_id,
      );
      if (isSelected) {
        return prev.filter((tc) => tc.test_case_id !== testCase.test_case_id);
      } else {
        return [...prev, testCase];
      }
    });
  };

  const handleStartTestRun = async () => {
    if (selectedTestCases.length === 0) return;
    setIsAddingTestCases(true);
    try {
      if (initialSearchParams?.testRunId) {
        const requestBody = {
          test_run_id: initialSearchParams.testRunId,
          test_case_ids: selectedTestCases.map((tc) => String(tc.test_case_id)),
          send_to_nova: sendToNova,
        };

        console.log("Sending request with body:", requestBody); // Debug log

        const response = await fetch("/api/add-new-test-cases-to-test-run", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error || "Failed to add test cases to existing test run",
          );
        }

        toast.success("Test cases added successfully");
        const productId = Array.isArray(params.product)
          ? params.product[0]
          : params.product;
        router.push(`/${productId}/test-runs/${initialSearchParams.testRunId}`);
      } else {
        setIsStartTestRunDialogOpen(true);
      }
    } catch (error) {
      console.error("Error adding test cases:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error(
        error instanceof Error ? error.message : "Failed to add test cases",
      );
    } finally {
      setIsAddingTestCases(false);
    }
  };

  const handleCopyTestCases = () => {
    if (selectedTestCases.length === 0) {
      toast.error("Please select test cases to copy");
      return;
    }
    setShowCopyDialog(true);
  };

  const handleDeleteTestCases = () => {
    if (selectedTestCases.length === 0) {
      toast.error("Please select test cases to delete");
      return;
    }
    setShowDeleteDialog(true);
  };

  const handleMultipleScreenshotUpdate = () => {
    if (selectedTestCases.length === 0) {
      toast.error("Please select test cases to update screenshots");
      return;
    }
    setShowMultipleScreenshotDialog(true);
  };

  const handleBulkFeatureUpdate = () => {
    setShowBulkFeatureDialog(true);
  };

  const handleBulkCredentialsUpdate = () => {
    if (selectedTestCases.length === 0) {
      toast.error("Please select test cases to update credentials");
      return;
    }
    setShowBulkCredentialsDialog(true);
  };

  const handleBulkPreconditionsUpdate = () => {
    if (selectedTestCases.length === 0) {
      toast.error("Please select test cases to update preconditions");
      return;
    }
    setShowBulkPreconditionsDialog(true);
  };

  const handleCreateSuite = () => {
    // Added handler for create suite
    if (selectedTestCases.length === 0) {
      toast.error("Please select test cases to create a suite");
      return;
    }
    setShowCreateSuiteDialog(true);
  };

  const handleMultipleScreenshotUpdateConfirm = () => {
    // Clear selection and exit selection mode
    setSelectedTestCases([]);
    exitSelectionMode();
  };

  const confirmDeleteTestCases = async () => {
    setIsDeletingTestCases(true);
    try {
      const testCaseIds = selectedTestCases.map((tc) =>
        String(tc.test_case_id),
      );

      const response = await fetch("/api/delete-test-cases", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ test_case_ids: testCaseIds }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete test cases");
      }

      // Update Redux store for each deleted test case
      selectedTestCases.forEach((testCase) => {
        dispatch(deleteTestCase(testCase.test_case_id));
      });

      toast.success(
        `${selectedTestCases.length} test cases deleted successfully`,
      );
      setSelectedTestCases([]);
      setShowDeleteDialog(false);
      exitSelectionMode(); // Exit selection mode after successful delete
    } catch (error) {
      console.error("Error deleting test cases:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error(
        error instanceof Error ? error.message : "Failed to delete test cases",
      );
    } finally {
      setIsDeletingTestCases(false);
    }
  };

  const enterSelectionMode = (mode: "testRun" | "edit" = "testRun") => {
    setIsSelectionMode(true);
    setSelectionModeType(mode);
    setSelectedTestCases([]);

    router.push("test-cases?selectionMode=true");
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectionModeType("testRun");
    setSelectedTestCases([]);
    router.push("test-cases");
  };

  const features = useSelector((state: RootState) => state.features.features);
  const testCasesFromStore = useSelector(
    (state: RootState) => state.testCases.testCases,
  );

  const groupTestCasesByFeature = (
    testCases: testCaseSchema[] | null | undefined,
  ): FeatureIdBasedGroupedTestCase => {
    // Handle null/undefined inputs by defaulting to empty arrays
    const safeTestCases = testCases || [];
    const safeFeatures = features || [];

    // Created a map for quick lookup of feature sort_index or created_at timestamps
    const featureMap = safeFeatures.reduce(
      (acc, feature) => {
        acc[feature.id] = {
          sort_index: feature.sort_index,
          created_at: feature.created_at,
        };
        return acc;
      },
      {} as Record<
        string,
        { sort_index: number | undefined; created_at: string }
      >,
    );

    // Group test cases by feature_id
    const grouped = safeTestCases.reduce((acc, testCase) => {
      const feature_id = testCase.feature_id || "Miscellaneous";
      if (!acc[feature_id]) {
        acc[feature_id] = [];
      }
      acc[feature_id].push(testCase);
      return acc;
    }, {} as FeatureIdBasedGroupedTestCase);

    // Sorted the grouped test cases by the sort_index or created_at timestamp of their features
    const sortedGrouped = Object.keys(grouped)
      .sort((a, b) => {
        const a_info = featureMap[a] || {
          sort_index: Number.MAX_SAFE_INTEGER,
          created_at: "9999-12-31T23:59:59.999Z",
        };
        const b_info = featureMap[b] || {
          sort_index: Number.MAX_SAFE_INTEGER,
          created_at: "9999-12-31T23:59:59.999Z",
        };

        // If both have sort_index, use that
        if (
          a_info.sort_index !== undefined &&
          b_info.sort_index !== undefined
        ) {
          return a_info.sort_index - b_info.sort_index;
        }

        // Otherwise fall back to created_at
        return (
          new Date(a_info.created_at).getTime() -
          new Date(b_info.created_at).getTime()
        );
      })
      .reduce((acc, feature_id) => {
        // Sort test cases within each feature group by their sort_index or created_at field
        acc[feature_id] = grouped[feature_id].sort((a, b) => {
          // First priority: sort_index (if both have it)
          if (a.sort_index !== undefined && b.sort_index !== undefined) {
            return a.sort_index - b.sort_index;
          }

          // Second priority: if only one has sort_index, prioritize it
          if (a.sort_index !== undefined && b.sort_index === undefined) {
            return -1;
          }
          if (a.sort_index === undefined && b.sort_index !== undefined) {
            return 1;
          }

          // Third priority: fall back to created_at
          return (
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        });
        return acc;
      }, {} as FeatureIdBasedGroupedTestCase);

    return sortedGrouped;
  };

  const testCaseloading = useSelector(
    (state: RootState) => state.testCases.loading,
  );
  const featureloading = useSelector(
    (state: RootState) => state.features.loading,
  );
  const testCases = groupTestCasesByFeature(testCasesFromStore);

  // Create a flattened array of all test cases for easier navigation
  const allTestCases = Object.values(testCases).flat();

  const featuresById: FeaturesById = {};

  features?.forEach((feature: Feature) => {
    featuresById[feature.id] = feature;
  });

  const getFeatureName = (section: string): string => {
    if (!featuresById) return section;
    return featuresById[section]?.name || "Miscellaneous";
  };

  const filteredTestCases = Object.entries(testCases).reduce(
    (acc, [section, cases]) => {
      const filteredCases = cases.filter((testCase) => {
        // Search by ID, description, or flow_id
        const matchesIdOrDescription =
          String(testCase.test_case_id)
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          (testCase.test_case_description || "")
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          (testCase.flow_id || "")
            .toLowerCase()
            .includes(searchQuery.toLowerCase());

        if (matchesIdOrDescription) return true;

        if (searchQuery.includes("{{")) {
          // Check preconditions for parameters
          if (testCase.preconditions && Array.isArray(testCase.preconditions)) {
            if (
              testCase.preconditions.some((precondition) =>
                precondition.toLowerCase().includes(searchQuery.toLowerCase()),
              )
            ) {
              return true;
            }
          }

          // Check test steps and expected results for parameters
          if (
            testCase.test_case_steps &&
            Array.isArray(testCase.test_case_steps)
          ) {
            for (const step of testCase.test_case_steps) {
              // Check step description
              if (
                (step.step_description || "")
                  .toLowerCase()
                  .includes(searchQuery.toLowerCase())
              ) {
                return true;
              }

              // Check expected results
              if (
                step.expected_results &&
                Array.isArray(step.expected_results)
              ) {
                if (
                  step.expected_results.some((result) =>
                    result.toLowerCase().includes(searchQuery.toLowerCase()),
                  )
                ) {
                  return true;
                }
              }
            }
          }
        }

        return false;
      });

      if (filteredCases.length > 0) {
        acc[section] = filteredCases;
      }
      return acc;
    },
    {} as typeof testCases,
  );

  const isFeatureSelected = (featureId: string, cases: testCaseSchema[]) => {
    if (cases.length === 0) return false;
    const selectedCount = cases.filter((testCase) =>
      selectedTestCases.some(
        (selected) => selected.test_case_id === testCase.test_case_id,
      ),
    ).length;
    return selectedCount === cases.length;
  };

  const toggleFeatureSelection = (
    featureId: string,
    cases: testCaseSchema[],
  ) => {
    const isSelected = isFeatureSelected(featureId, cases);
    if (isSelected === true) {
      // Deselect all test cases in this feature
      setSelectedTestCases((prev) =>
        prev.filter(
          (tc) => !cases.some((c) => c.test_case_id === tc.test_case_id),
        ),
      );
    } else {
      // Select all test cases in this feature that aren't already selected
      const newTestCases = cases.filter(
        (testCase) =>
          !selectedTestCases.some(
            (selected) => selected.test_case_id === testCase.test_case_id,
          ),
      );
      setSelectedTestCases((prev) => [...prev, ...newTestCases]);
    }
  };

  const toggleAllFeatures = () => {
    const allTestCases = Object.values(filteredTestCases).flat();
    const allSelected = allTestCases.every((testCase) =>
      selectedTestCases.some(
        (selected) => selected.test_case_id === testCase.test_case_id,
      ),
    );

    if (allSelected) {
      setSelectedTestCases([]);
    } else {
      setSelectedTestCases(allTestCases);
    }
  };

  const isAllFeaturesSelected = () => {
    const allTestCases = Object.values(filteredTestCases).flat();
    if (allTestCases.length === 0) return false;

    const selectedCount = allTestCases.filter((testCase) =>
      selectedTestCases.some(
        (selected) => selected.test_case_id === testCase.test_case_id,
      ),
    ).length;

    return selectedCount === allTestCases.length;
  };

  // Track which item is being dragged
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;

    if (active.id.toString().startsWith("feature-")) {
      // If dragging a feature, store the feature ID
      setActiveId(active.id.toString().replace("feature-", ""));
    } else {
      // If dragging a test case, store the test case ID and its feature ID
      setActiveTestCaseId(active.id.toString());
      const featureId = active.data.current?.featureId as string;
      setCurrentDragFeatureId(featureId);
    }
  };

  // Handle the end of a drag operation
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      // Reset active states if dropped outside a valid target
      setActiveId(null);
      setActiveTestCaseId(null);
      setCurrentDragFeatureId(null);
      return;
    }

    // Handle feature reordering
    if (
      active.id.toString().startsWith("feature-") &&
      over.id.toString().startsWith("feature-")
    ) {
      const activeId = active.id.toString().replace("feature-", "");
      const overId = over.id.toString().replace("feature-", "");

      if (activeId !== overId) {
        const featureIds = Object.keys(filteredTestCases);
        const oldIndex = featureIds.indexOf(activeId);
        const newIndex = featureIds.indexOf(overId);

        if (oldIndex !== -1 && newIndex !== -1) {
          // Reorder the feature IDs
          const newFeatureIds = arrayMove(featureIds, oldIndex, newIndex);

          // Calculate new sort indexes for the features
          const featureInputs = newFeatureIds.map((featureId, index) => ({
            feature_id: featureId,
            sort_index: index + 1,
          }));

          // Update the Redux store immediately for UI update
          const updatedFeatures = [...features].map((feature) => {
            const newSortIndex = featureInputs.find(
              (f) => f.feature_id === feature.id,
            )?.sort_index;
            return newSortIndex !== undefined
              ? { ...feature, sort_index: newSortIndex }
              : feature;
          });
          dispatch(reorderFeaturesLocal(updatedFeatures));

          // Sent the update to the backend
          dispatch(
            reorderFeatures({
              feature_changed: activeId,
              features: featureInputs,
            }),
          )
            .unwrap()
            .then((response) => {
              if (!response.result || !response.result.features) {
                toast.warning("Failed to update feature order");
              }
            })
            .catch((error) => {
              Sentry.captureException(error, {
                level: "error",
                tags: { priority: "high" },
              });
              toast.error("Failed to save feature order: " + error.message);

              if (features && features.length > 0) {
                // Re-dispatch the current features to force a UI update with correct order
                dispatch(reorderFeaturesLocal([...features]));
              }
            });
        }
      }
    }

    // Handle test case reordering
    else if (
      activeTestCaseId &&
      currentDragFeatureId &&
      !active.id.toString().startsWith("feature-")
    ) {
      const testCasesForFeature = [...filteredTestCases[currentDragFeatureId]];
      const activeIndex = testCasesForFeature.findIndex(
        (tc) => tc.test_case_id.toString() === activeTestCaseId,
      );
      const overIndex = testCasesForFeature.findIndex(
        (tc) => tc.test_case_id.toString() === over.id.toString(),
      );

      if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
        // Reorder the test cases
        const newTestCasesOrder = arrayMove(
          testCasesForFeature,
          activeIndex,
          overIndex,
        );

        // Calculate new sort indexes for the test cases
        const testCaseInputs = newTestCasesOrder.map((testCase, index) => ({
          test_case_id: String(testCase.test_case_id),
          sort_index: index + 1,
        }));

        // Updated the Reduxx store immediately for UI update
        const updatedTestCases = testCasesFromStore.map((testCase) => {
          if (testCase.feature_id === currentDragFeatureId) {
            const newSortIndex = testCaseInputs.find(
              (tc) => tc.test_case_id === String(testCase.test_case_id),
            )?.sort_index;
            return newSortIndex !== undefined
              ? { ...testCase, sort_index: newSortIndex }
              : testCase;
          }
          return testCase;
        });

        // Dispatch the updated test cases to Redux store
        dispatch(reorderTestCasesLocal(updatedTestCases));

        // Send the update to the backend
        dispatch(
          reorderTestCases({
            test_case_changed: activeTestCaseId,
            test_cases: testCaseInputs,
          }),
        )
          .unwrap()
          .then(() => {
            toast.success("Test Case order saved successfully");
          })
          .catch((error) => {
            Sentry.captureException(error, {
              level: "error",
              tags: { priority: "high" },
            });
            toast.error("Failed to save test case order: " + error.message);
            // Rollback on error - the slice already handles this
          });
      }
    }

    // Reset active states
    setActiveId(null);
    setActiveTestCaseId(null);
    setCurrentDragFeatureId(null);
  };

  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null);
  const testSuites = useSelector(
    (state: RootState) => state.testSuites.testSuites,
  );
  const isLoadingSuites = useSelector(
    (state: RootState) => state.testSuites.loading,
  );

  const [deleteTestSuiteDialogOpen, setDeleteTestSuiteDialogOpen] =
    useState(false);
  const [testSuiteToDelete, setTestSuiteToDelete] = useState<string | null>(
    null,
  );
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isSelectAllActive, setIsSelectAllActive] = useState(false);

  const handleSuiteSelection = (suite: TestSuite) => {
    if (selectedSuiteId === suite.test_suite_id) {
      // If clicking the same suite, deselect it
      setSelectedSuiteId(null);
      setSelectedTestCases([]);
    } else {
      // Clear any previous selections
      setIsSelectAllActive(false);
      setSelectedSuiteId(suite.test_suite_id);

      // Created a map of test cases by ID
      const suiteTestCasesById = allTestCases.reduce(
        (acc, testCase) => {
          acc[testCase.test_case_id] = testCase;
          return acc;
        },
        {} as Record<string, testCaseSchema>,
      );

      // Directly get the test case objects using their IDs from the suite
      const suiteTestCases = suite.test_case_ids
        .map((id) => suiteTestCasesById[id])
        .filter(Boolean);

      setSelectedTestCases(suiteTestCases);
    }
  };

  const [isDeletingSuite, setIsDeletingSuite] = useState<string | null>(null);

  // Handler function
  const handleDeleteSuite = (suiteId: string) => {
    setTestSuiteToDelete(suiteId);
    setDeleteTestSuiteDialogOpen(true);
  };

  const confirmDeleteSuite = async () => {
    try {
      if (!testSuiteToDelete) return;

      setIsDeletingSuite(testSuiteToDelete);
      await dispatch(deleteTestSuite(testSuiteToDelete)).unwrap();
      toast.success("Test suite deleted successfully");

      // If the deleted suite was selected, clear the selection
      if (selectedSuiteId === testSuiteToDelete) {
        setSelectedSuiteId(null);
        setSelectedTestCases([]);
      }
    } catch (error) {
      console.error("Error deleting test suite:", error);
      Sentry.captureException(error, {
        level: "error",
        tags: { priority: "high" },
      });
      toast.error(
        error instanceof Error ? error.message : "Failed to delete test suite",
      );
    } finally {
      setIsDeletingSuite(null);
      setDeleteTestSuiteDialogOpen(false);
      setTestSuiteToDelete(null);
    }
  };

  // Added this useEffect to handle test run selection mode
  useEffect(() => {
    if (
      initialSearchParams?.selectionMode === "true" &&
      initialSearchParams?.testRunId
    ) {
      setIsSelectionMode(true);
      setSelectionModeType("testRun");
    }
  }, [initialSearchParams?.selectionMode, initialSearchParams?.testRunId]);

  // Handle URL parameter for auto-opening test case modal
  useEffect(() => {
    const testCaseIdFromUrl = searchParams.get("test_case_id");

    if (testCaseIdFromUrl && !selectedTestCase && allTestCases.length > 0) {
      // Find the test case with the matching ID
      const testCaseToOpen = allTestCases.find(
        (tc) => tc.test_case_id === testCaseIdFromUrl,
      );

      if (testCaseToOpen) {
        // Find the index and set the selected test case
        const index = allTestCases.findIndex(
          (tc) => tc.test_case_id === testCaseIdFromUrl,
        );
        setCurrentTestCaseIndex(index);
        setSelectedTestCase(testCaseToOpen);
      }
    } else if (!testCaseIdFromUrl) {
      setSelectedTestCase(null);
      setCurrentTestCaseIndex(-1);
    }
  }, [searchParams, allTestCases, selectedTestCase]);

  if (!productSwitcher.product_id) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        Please select product id
      </div>
    );
  }

  if (testCaseloading || featureloading || localLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loading />
      </div>
    );
  }

  return (
    <div className="mt-2">
      {selectedTestCase && (
        <TestCaseDetailsModal
          testCase={selectedTestCase}
          features={features || []}
          allTestCases={allTestCases}
          onClose={handleCloseModal}
          onNextTestCase={handleNextTestCase}
          onPrevTestCase={handlePrevTestCase}
          hasNext={currentTestCaseIndex < allTestCases.length - 1}
          hasPrev={currentTestCaseIndex > 0}
        />
      )}

      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Test Cases</h1>
            <p className="text-sm text-gray-600">
              {`${Object.values(testCases ?? {}).reduce((acc, testCases) => acc + (testCases?.length ?? 0), 0)} test cases across ${Object.keys(testCases ?? {}).length} features`}
            </p>
          </div>
          <div className="flex gap-4">
            {!isSelectionMode ? (
              <>
                <AddTestCaseDialog
                  open={isAddTestCaseDialogBoxOpen}
                  onClose={() =>
                    setIsAddTestCaseDialogBoxOpen(!isAddTestCaseDialogBoxOpen)
                  }
                />
                {isQaiUser && (
                  <Button
                    onClick={() => enterSelectionMode("edit")}
                    variant="outline"
                    className="h-10 w-10 p-0 relative group"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  onClick={() => enterSelectionMode("testRun")}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  title="Start Test Run"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start a New Test Run
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">
                  {selectedTestCases.length} test cases selected
                </span>
                <Button
                  variant="outline"
                  onClick={exitSelectionMode}
                  title="Cancel Selection"
                >
                  Cancel
                </Button>

                {selectionModeType === "testRun" ? (
                  // Test Run selection mode buttons
                  <div className="flex flex-col items-start gap-2">
                    {/* Button */}
                    <Button
                      onClick={handleStartTestRun}
                      disabled={
                        selectedTestCases.length === 0 || isAddingTestCases
                      }
                      className="bg-purple-600 hover:bg-purple-700 text-white flex items-center"
                    >
                      {isAddingTestCases ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {isTestRunSelection
                            ? "Adding Test Cases..."
                            : "Starting Test Run..."}
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 h-4 w-4" />
                          {isTestRunSelection
                            ? "Add Test Cases To Test Run"
                            : "Start Test Run"}
                        </>
                      )}
                    </Button>
                    {isQaiUser && isTestRunSelection && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={sendToNova}
                          className="h-4 w-4 rounded border border-gray-300 focus:outline-none data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                          onCheckedChange={(checked) =>
                            setSendToNova(!!checked)
                          }
                        />
                        <span className="text-sm text-gray-600">
                          Test with Nova
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  // Edit selection mode buttons with creative layout
                  <div className="flex gap-2">
                    <div className="flex items-center bg-gray-50 rounded-lg p-1 gap-1">
                      <Button
                        onClick={handleCopyTestCases}
                        variant="ghost"
                        className="h-9 px-3 hover:bg-white hover:shadow-sm transition-all duration-200"
                        disabled={selectedTestCases.length === 0}
                        title="Copy Test Cases"
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy
                      </Button>
                      <div className="w-px h-6 bg-gray-300" />
                      <Button
                        onClick={handleCreateSuite}
                        variant="ghost"
                        className="h-9 px-3 hover:bg-white hover:shadow-sm transition-all duration-200"
                        disabled={selectedTestCases.length === 0}
                        title="Create Test Suite"
                      >
                        <FolderPlus className="h-4 w-4 mr-2" />
                        Create Suite
                      </Button>
                      <div className="w-px h-6 bg-gray-300" />
                      <Button
                        onClick={handleMultipleScreenshotUpdate}
                        variant="ghost"
                        className="h-9 px-3 hover:bg-white hover:shadow-sm transition-all duration-200"
                        disabled={selectedTestCases.length === 0}
                        title="Update Screenshots"
                      >
                        <ImageIcon className="h-4 w-4 mr-2" />
                        Screenshots
                      </Button>
                      <div className="w-px h-6 bg-gray-300" />
                      <Button
                        onClick={handleBulkFeatureUpdate}
                        variant="ghost"
                        className="h-9 px-3 hover:bg-white hover:shadow-sm transition-all duration-200"
                        disabled={selectedTestCases.length === 0}
                        title="Update Features"
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Features
                      </Button>
                      <div className="w-px h-6 bg-gray-300" />
                      <Button
                        onClick={handleBulkCredentialsUpdate}
                        variant="ghost"
                        className="h-9 px-3 hover:bg-white hover:shadow-sm hover:text-red-600 transition-all duration-200"
                        disabled={selectedTestCases.length === 0}
                        title="Update Credentials"
                      >
                        <Key className="h-4 w-4 mr-2" />
                        Credentials
                      </Button>
                      <div className="w-px h-6 bg-gray-300" />
                      <Button
                        onClick={handleBulkPreconditionsUpdate}
                        variant="ghost"
                        className="h-9 px-3 hover:bg-white hover:shadow-sm hover:text-red-600 transition-all duration-200"
                        disabled={selectedTestCases.length === 0}
                        title="Update Preconditions"
                      >
                        <svg
                          className="h-4 w-4 mr-2"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path
                            d="M4 9h16M4 15h16"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        Preconditions
                      </Button>
                      <div className="w-px h-6 bg-gray-300" />
                      <Button
                        onClick={handleDeleteTestCases}
                        variant="ghost"
                        className="h-9 px-3 hover:bg-white hover:shadow-sm hover:text-red-600 transition-all duration-200"
                        disabled={selectedTestCases.length === 0}
                        title="Delete Test Cases"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-4">
          <div className="flex-1">
            <Input
              type="search"
              placeholder="Search by test case ID or flow ID or description"
              className="w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {isSelectionMode && (
            <div className="flex flex-col gap-3">
              {/* Select All Features option */}
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={isAllFeaturesSelected()}
                  className="h-4 w-4 rounded border border-gray-300 focus:outline-none data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                  onCheckedChange={toggleAllFeatures}
                />
                <span className="text-sm text-gray-600">
                  Select All Features
                </span>
              </div>

              {selectionModeType === "testRun" && (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-gray-700">
                    Or select a test suite:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {isLoadingSuites ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm text-gray-500">
                          Loading suites...
                        </span>
                      </div>
                    ) : testSuites.length > 0 ? (
                      testSuites.map((suite) => (
                        <div
                          key={suite.test_suite_id}
                          className="relative group"
                        >
                          <Button
                            variant={
                              selectedSuiteId === suite.test_suite_id
                                ? "default"
                                : "outline"
                            }
                            size="sm"
                            onClick={() => handleSuiteSelection(suite)}
                            className={`text-sm ${
                              selectedSuiteId === suite.test_suite_id
                                ? "bg-purple-600 hover:bg-purple-700 text-white"
                                : "hover:bg-purple-50 hover:border-purple-300"
                            } pr-8`}
                          >
                            {suite.name}
                            <span className="ml-1 text-xs opacity-75">
                              ({suite.test_case_ids.length})
                            </span>
                          </Button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSuite(suite.test_suite_id);
                            }}
                            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-gray-200 transition-opacity duration-200"
                            title="Delete suite"
                          >
                            {isDeletingSuite === suite.test_suite_id ? (
                              <Loader2 className="h-3 w-3 animate-spin text-gray-500" />
                            ) : (
                              <X className="h-4 w-4 font-bold text-red-500" />
                            )}
                          </button>
                        </div>
                      ))
                    ) : (
                      <span className="text-sm text-gray-500">
                        No test suites available
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          measuring={{
            droppable: {
              strategy: MeasuringStrategy.Always,
            },
          }}
        >
          <div className="space-y-6">
            <SortableContext
              items={Object.keys(filteredTestCases).map(
                (id) => `feature-${id}`,
              )}
              strategy={rectSortingStrategy}
            >
              {Object.entries(filteredTestCases).map(([section, cases]) => (
                <SortableFeature
                  key={section}
                  id={section}
                  name={getFeatureName(section)}
                  cases={cases}
                  isExpanded={!!expandedSections[section]}
                  toggleSection={() => toggleSection(section)}
                  isSelectionMode={isSelectionMode}
                  isSelected={isFeatureSelected(section, cases)}
                  toggleSelection={() => toggleFeatureSelection(section, cases)}
                  selectedTestCases={selectedTestCases}
                  toggleTestCaseSelection={toggleTestCaseSelection}
                  handleTestCaseClick={handleTestCaseClick}
                />
              ))}
            </SortableContext>
          </div>
        </DndContext>
      </div>

      {/* Dialogs */}
      {isStartTestRunDialogOpen && !initialSearchParams?.testRunId && (
        <StartTestRunDialog
          open={isStartTestRunDialogOpen}
          onOpenChange={setIsStartTestRunDialogOpen}
          showTrigger={false}
          selectedTestCaseIds={selectedTestCases.map((tc) => tc.test_case_id)}
        />
      )}

      <CopyToProductDialog
        isOpen={showCopyDialog}
        onOpenChange={setShowCopyDialog}
        selectedTestCases={selectedTestCases}
        exitSelectionMode={exitSelectionMode}
      />

      <MultipleScreenshotUpdateDialog
        isOpen={showMultipleScreenshotDialog}
        onOpenChange={setShowMultipleScreenshotDialog}
        selectedTestCases={selectedTestCases}
        onComplete={handleMultipleScreenshotUpdateConfirm}
      />

      <BulkFeatureUpdateDialog
        isOpen={showBulkFeatureDialog}
        onOpenChange={setShowBulkFeatureDialog}
        selectedTestCases={selectedTestCases}
        features={features}
        exitSelectionMode={exitSelectionMode}
      />

      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Test Cases"
        description={`Are you sure you want to delete ${selectedTestCases.length} test cases?`}
        confirmText="Delete"
        onConfirm={confirmDeleteTestCases}
        isLoading={isDeletingTestCases}
      />

      <BulkCredentialsDialog
        isOpen={showBulkCredentialsDialog}
        onOpenChange={setShowBulkCredentialsDialog}
        selectedTestCases={selectedTestCases}
        exitSelectionMode={exitSelectionMode}
      />

      <BulkPreconditionsDialog
        isOpen={showBulkPreconditionsDialog}
        onOpenChange={setShowBulkPreconditionsDialog}
        selectedTestCases={selectedTestCases}
        exitSelectionMode={exitSelectionMode}
      />

      <CreateSuiteDialog
        isOpen={showCreateSuiteDialog}
        onOpenChange={setShowCreateSuiteDialog}
        selectedTestCases={selectedTestCases}
        exitSelectionMode={exitSelectionMode}
      />

      <ConfirmationDialog
        isOpen={deleteTestSuiteDialogOpen}
        onOpenChange={setDeleteTestSuiteDialogOpen}
        title="Delete Test Suite"
        description="Are you sure you want to delete this suite?"
        confirmText="Delete"
        onConfirm={confirmDeleteSuite}
        isLoading={!!isDeletingSuite}
        loadingText="Deleting..."
      />
    </div>
  );
}
