"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { TestRunTimeSection } from "../_components/test-section";
import { Header } from "../_components/test-run-header";
import {
  Feature,
  FeatureIdBasedGroupedTestCaseUnderExecution,
  FeaturesById,
  ProductSwitcherSchema,
  TestCaseUnderExecutionSchema,
  testCaseSchema,
} from "@/lib/types";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "@/app/store/store";
import Loading from "@/components/global/loading";
import {
  fetchTestRunUnderExecution,
  deleteTestCasesUnderExecution,
} from "@/app/store/testRunUnderExecutionSlice";
import type { AppDispatch } from "@/app/store/store";
import { useUser } from "@clerk/nextjs";
import { isQaiOrgUser, isQaiOrgAnalystUser, getBaseUrl } from "@/lib/constants";
import { useProductSwitcher } from "@/providers/product-provider";
import { fetchFeatures } from "@/app/store/featuresSlice";
import { fetchTestCases } from "@/app/store/testCaseSlice";
import { fetchTestRunsForProduct } from "@/app/store/testRunSlice";
import { TestCaseUnderExecutionStatus } from "@/lib/types";
import { fetchUsers } from "@/app/store/userSlice";
import { CopyTCUEToProductDialog } from "@/app/(dashboard)/[product]/homev1/test-runs/_components/copy-tcue-to-product-dialog";
import { toast } from "sonner";
import usePersistentState from "@/hooks/use-persistent-state";
import { ConfirmationDialog } from "@/components/global/delete-confirmation-dialog";
import { TCUEUnified } from "./detail/tcue-unified";
import { generateTestRunReport } from "../_components/test-run-report-template";
import { BulkAssignDialog } from "../_components/bulk-assign-dialog";
import * as Sentry from "@sentry/nextjs";

export default function TestRunPage({
  searchParams: urlSearchParams,
}: {
  searchParams?: { selectionMode?: string; testRunId?: string };
}) {
  const groupTestRunsUnderExecutionByFeature = (
    testCasesUnderExecution: TestCaseUnderExecutionSchema[] | null | undefined,
    features: Feature[],
    testCases: testCaseSchema[],
  ): FeatureIdBasedGroupedTestCaseUnderExecution => {
    // Handle null/undefined inputs by defaulting to empty arrays
    const safeTestCasesUnderExecution = testCasesUnderExecution || [];
    const safeFeatures = features || [];
    const safeTestCases = testCases || [];

    const tcuesWithTestCaseId: TestCaseUnderExecutionSchema[] = [];
    const tcuesWithoutTestCaseId: TestCaseUnderExecutionSchema[] = [];

    safeTestCasesUnderExecution.forEach((tcue) => {
      if (tcue.test_case_id) {
        tcuesWithTestCaseId.push(tcue);
      } else {
        tcuesWithoutTestCaseId.push(tcue);
      }
    });

    const groupedByTestCase = tcuesWithTestCaseId.reduce(
      (acc, tcue) => {
        const key = tcue.test_case_id || "undefined";
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(tcue);
        return acc;
      },
      {} as Record<string, TestCaseUnderExecutionSchema[]>,
    );

    const statusPriority = {
      FAILED: 0,
      UNTESTED: 1,
      PASSED: 2,
      SKIPPED: 3,
      DEFAULT: 4,
      ATTEMPT_FAILED: 5,
    };

    const TestCaseMappedTCUESs = Object.values(groupedByTestCase).map(
      (tcues) => {
        return tcues.sort((a, b) => {
          const aStatus = a.status || "DEFAULT";
          const bStatus = b.status || "DEFAULT";
          return statusPriority[aStatus] - statusPriority[bStatus];
        })[0];
      },
    );

    const groupedByFlowId = tcuesWithoutTestCaseId.reduce(
      (acc, tcue) => {
        const key = tcue.flow_id || tcue.id || "no-flow-id";
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(tcue);
        return acc;
      },
      {} as Record<string, TestCaseUnderExecutionSchema[]>,
    );

    const flowIdMappedTCUESs = Object.values(groupedByFlowId).flat();

    const allMappedTCUESs = [...TestCaseMappedTCUESs, ...flowIdMappedTCUESs];

    // Created a map for quick lookup of current test case sort_index
    const testCaseMap = safeTestCases.reduce(
      (acc, testCase) => {
        acc[testCase.test_case_id] = {
          sort_index: testCase.sort_index,
          created_at: testCase.created_at,
        };
        return acc;
      },
      {} as Record<
        string,
        { sort_index: number | undefined; created_at: string }
      >,
    );

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

    // Grouped test cases under execution by feature_id
    const grouped = allMappedTCUESs.reduce((acc, testCaseUnderExecution) => {
      const feature_id = testCaseUnderExecution.feature_id || "Miscellaneous";
      if (!acc[feature_id]) {
        acc[feature_id] = [];
      }
      acc[feature_id].push(testCaseUnderExecution);
      return acc;
    }, {} as FeatureIdBasedGroupedTestCaseUnderExecution);

    // Sorted the grouped test cases under execution by the sort_index or created_at timestamp of their features
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

        if (
          a_info.sort_index !== undefined &&
          b_info.sort_index !== undefined
        ) {
          return a_info.sort_index - b_info.sort_index;
        }

        return (
          new Date(a_info.created_at).getTime() -
          new Date(b_info.created_at).getTime()
        );
      })
      .reduce((acc, feature_id) => {
        // Sort test cases under execution within each feature group by their CURRENT sort_index from testCaseMap
        acc[feature_id] = grouped[feature_id].sort((a, b) => {
          const a_info = a.test_case_id
            ? testCaseMap[a.test_case_id] || {
                sort_index: a.sort_index,
                created_at: a.created_at,
              }
            : {
                sort_index: a.sort_index,
                created_at: a.created_at,
              };
          const b_info = b.test_case_id
            ? testCaseMap[b.test_case_id] || {
                sort_index: b.sort_index,
                created_at: b.created_at,
              }
            : {
                sort_index: b.sort_index,
                created_at: b.created_at,
              };

          if (
            a_info.sort_index !== undefined &&
            b_info.sort_index !== undefined
          ) {
            return a_info.sort_index - b_info.sort_index;
          }

          if (
            a_info.sort_index !== undefined &&
            b_info.sort_index === undefined
          ) {
            return -1;
          }
          if (
            a_info.sort_index === undefined &&
            b_info.sort_index !== undefined
          ) {
            return 1;
          }

          return (
            new Date(a_info.created_at).getTime() -
            new Date(b_info.created_at).getTime()
          );
        });
        return acc;
      }, {} as FeatureIdBasedGroupedTestCaseUnderExecution);

    return sortedGrouped;
  };

  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { productSwitcher, setProductSwitcher } = useProductSwitcher();
  const dispatch = useDispatch<AppDispatch>();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const testRuns = useSelector((state: RootState) => state.testRuns.testRuns);
  const features = useSelector((state: RootState) => state.features.features);
  const testCases = useSelector(
    (state: RootState) => state.testCases.testCases,
  );

  const allTcues = useSelector(
    (state: RootState) => state.testRunsUnderExecution.testRunUnderExecution,
  );
  const [lastProductId, setLastProductId] = useState<string | null>(null);

  const [shouldAutoReload, setShouldAutoReload] = usePersistentState(
    "shouldAutoReload",
    false,
  );
  const products = useSelector((state: RootState) => state.products.products);
  const users = useSelector((state: RootState) => state.users.users);
  const [localLoading, setLocalLoading] = useState(false);

  // Selection mode state
  const [isSelectionMode, setIsSelectionMode] = useState(
    urlSearchParams?.selectionMode === "true",
  );
  const [selectedTestCases, setSelectedTestCases] = useState<
    TestCaseUnderExecutionSchema[]
  >([]);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);
  const [showExportConfirmation, setShowExportConfirmation] = useState(false);
  const [showBulkAssignDialog, setShowBulkAssignDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSyncConfirmation, setShowSyncConfirmation] = useState(false);
  const [hasJiraIntegration, setHasJiraIntegration] = useState(false);
  const [isCreatingJiraTickets, setIsCreatingJiraTickets] = useState(false);
  const [syncCounts, setSyncCounts] = useState({
    create: 0,
    update: 0,
    delete: 0,
  });
  const [cachedSyncPreview, setCachedSyncPreview] = useState<{
    counts: { create: number; update: number; delete: number };
    totalAffected: number;
    timestamp: number;
    testRunId: string;
  } | null>(null);

  // Get user data from Clerk
  const { user } = useUser();

  // Get the user's organization ID from Clerk metadata
  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;
  const isQaiUser = isQaiOrgUser(userOrgId) || isQaiOrgAnalystUser(userOrgId);

  // State for modal control
  const [selectedTestCaseId, setSelectedTestCaseId] = useState<string | null>(
    null,
  );
  const [currentTestCaseIndex, setCurrentTestCaseIndex] = useState<number>(-1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const tcueParam = searchParams.get("tcue");
  const [currentTcueId, setCurrentTcueId] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState<string | null>(null);

  // State for mode selection - default to executor for QAI users, viewer for others
  const [viewMode, setViewMode] = useState<"viewer" | "executor" | "reviewer">(
    isQaiUser ? "executor" : "viewer",
  );

  const { loading, error } = useSelector(
    (state: RootState) => state.testRunsUnderExecution,
  );

  const testRunsUnderExecutions = groupTestRunsUnderExecutionByFeature(
    useSelector(
      (state: RootState) => state.testRunsUnderExecution.testRunUnderExecution,
    ),
    features,
    testCases,
  );

  // Get a flat array of all test cases for navigation
  const flatTestRuns = Object.values(testRunsUnderExecutions).flat();

  // NEW: Created filtered flat array based on current filters
  const getFilteredTestRuns = () => {
    let filteredCases = flatTestRuns.filter(
      (testRunUnderExecution) =>
        String(testRunUnderExecution.test_case_id)
          .toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        testRunUnderExecution.test_case_description
          .toLowerCase()
          .includes(searchQuery.toLowerCase()),
    );

    // Apply status filter if one is selected
    if (statusFilter) {
      filteredCases = filteredCases.filter((testRunUnderExecution) =>
        (allTcues || []).some(
          (tcue) =>
            tcue.test_case_id === testRunUnderExecution.test_case_id &&
            tcue.status === statusFilter,
        ),
      );
      if (statusFilter === TestCaseUnderExecutionStatus.FAILED) {
        // Created a criticality order mapping for sorting
        const criticalityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };

        // Sorted the filtered cases by criticality
        filteredCases = [...filteredCases].sort((a, b) => {
          return (
            criticalityOrder[a.criticality] - criticalityOrder[b.criticality]
          );
        });
      }
    }

    // Apply user filter if selected
    if (userFilter) {
      filteredCases = filteredCases.filter(
        (testCase) => testCase.assignee_user_id === userFilter,
      );
    }

    return filteredCases;
  };

  const filteredFlatTestRuns = getFilteredTestRuns();

  // Selection mode functions
  const enterSelectionMode = () => {
    setIsSelectionMode(true);
    setSelectedTestCases([]);
    router.push(`${window.location.pathname}?selectionMode=true`);
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedTestCases([]);
    router.push(window.location.pathname);
  };

  const toggleTestCaseSelection = (testCase: TestCaseUnderExecutionSchema) => {
    setSelectedTestCases((prev) => {
      const isSelected = prev.some((tc) => tc.id === testCase.id);
      if (isSelected) {
        return prev.filter((tc) => tc.id !== testCase.id);
      } else {
        return [...prev, testCase];
      }
    });
  };

  const checkJiraIntegration = useCallback(async () => {
    try {
      const productId = Array.isArray(params.product)
        ? params.product[0]
        : params.product;
      if (!productId) return;

      const response = await fetch(
        `/api/get-jira-credentials-for-product?product_id=${productId}`,
      );
      if (response.ok) {
        const data = await response.json();
        setHasJiraIntegration(!!data && Object.keys(data).length > 0);
      } else {
        setHasJiraIntegration(false);
      }
    } catch (error) {
      console.error("Error checking Jira integration:", error);
      setHasJiraIntegration(false);
    }
  }, [params.product]);

  // CReate Jira Ticket function
  const handleCreateJiraTickets = () => {
    if (isCreatingJiraTickets) return;

    const failedTestCases =
      allTcues?.filter((tc) => tc.status === "FAILED") || [];
    if (failedTestCases.length === 0) {
      toast.error("No failed test cases found");
      return;
    }

    try {
      setIsCreatingJiraTickets(true);
      toast.info("Creating Jira tickets for failed tests...");

      const testRunId = Array.isArray(params.id) ? params.id[0] : params.id;
      const productId = Array.isArray(params.product)
        ? params.product[0]
        : params.product;

      // Call API in background without blocking UI
      fetch("/api/create-jira-tickets-for-failed-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          test_run_id: testRunId,
          failed_test_case_ids: failedTestCases.map((tc) => tc.id),
        }),
      })
        .then((response) => {
          if (!response.ok) {
            return response.json().then((data) => {
              throw new Error(data.error || "Failed to create Jira tickets");
            });
          }
          return response.json();
        })
        .then((result) => {
          toast.success(
            `Successfully created ${result.tickets_created} Jira ticket(s)`,
          );
        })
        .catch((error) => {
          console.error("Error creating Jira tickets:", error);
          toast.error(error.message || "Failed to create Jira tickets");
        })
        .finally(() => {
          setIsCreatingJiraTickets(false);
        });
    } catch (error) {
      console.error("Error initiating Jira ticket creation:", error);
      toast.error("Failed to initiate Jira ticket creation");
      setIsCreatingJiraTickets(false);
    }
  };

  useEffect(() => {
    checkJiraIntegration();
  }, [checkJiraIntegration]);

  const isFeatureSelected = (
    featureId: string,
    cases: TestCaseUnderExecutionSchema[],
  ) => {
    if (cases.length === 0) return false;
    const selectedCount = cases.filter((testCase) =>
      selectedTestCases.some((selected) => selected.id === testCase.id),
    ).length;
    return selectedCount === cases.length;
  };

  const toggleFeatureSelection = (
    featureId: string,
    cases: TestCaseUnderExecutionSchema[],
  ) => {
    const isSelected = isFeatureSelected(featureId, cases);
    if (isSelected) {
      // Deselect all test cases in this feature
      setSelectedTestCases((prev) =>
        prev.filter((tc) => !cases.some((c) => c.id === tc.id)),
      );
    } else {
      // Select all test cases in this feature that aren't already selected
      const newTestCases = cases.filter(
        (testCase) =>
          !selectedTestCases.some((selected) => selected.id === testCase.id),
      );
      setSelectedTestCases((prev) => [...prev, ...newTestCases]);
    }
  };

  const toggleAllFeatures = () => {
    const allTestCases = Object.values(filteredSections).flat();
    const allSelected = allTestCases.every((testCase) =>
      selectedTestCases.some((selected) => selected.id === testCase.id),
    );

    if (allSelected) {
      setSelectedTestCases([]);
    } else {
      setSelectedTestCases(allTestCases);
    }
  };

  const isAllFeaturesSelected = () => {
    const allTestCases = Object.values(filteredSections).flat();
    if (allTestCases.length === 0) return false;

    const selectedCount = allTestCases.filter((testCase) =>
      selectedTestCases.some((selected) => selected.id === testCase.id),
    ).length;

    return selectedCount === allTestCases.length;
  };

  const handleCopyTestCases = () => {
    if (selectedTestCases.length === 0) {
      toast.error("Please select test cases to copy");
      return;
    }
    setShowCopyDialog(true);
  };

  const handleBulkAssign = async () => {
    if (selectedTestCases.length === 0) {
      toast.error("Please select test cases to assign");
      return;
    }
    if (userOrgId) {
      await dispatch(fetchUsers(userOrgId));
    }
    setShowBulkAssignDialog(true);
  };

  const getAllRelatedTcues = (
    selectedCases: TestCaseUnderExecutionSchema[],
  ) => {
    const selectedTestCaseIds = selectedCases.map((tc) => tc.test_case_id);
    return allTcues.filter((tcue) =>
      selectedTestCaseIds.includes(tcue.test_case_id),
    );
  };

  const handleDeleteTestCases = async () => {
    if (selectedTestCases.length === 0 || isDeleting) return;

    try {
      setIsDeleting(true);
      const allRelatedTcues = getAllRelatedTcues(selectedTestCases);
      const response = await fetch(
        "/api/delete-test-case-under-execution-from-test-run",
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            test_case_under_execution_ids: allRelatedTcues.map((tc) => tc.id),
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMessage = errorData?.error || "Failed to delete test cases";
        throw new Error(errorMessage);
      }

      dispatch(
        deleteTestCasesUnderExecution(allRelatedTcues.map((tc) => tc.id)),
      );

      toast.success(
        `${allRelatedTcues.length} test cases removed from test run successfully`,
      );
      exitSelectionMode();
    } catch (error) {
      console.error("Error deleting test cases:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error("Failed to delete test cases");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirmation(false);
    }
  };

  // Handle URL parameter changes
  useEffect(() => {
    if (tcueParam) {
      if (filteredFlatTestRuns.length > 0) {
        const inFiltered = filteredFlatTestRuns.find(
          (tc) => tc.id === tcueParam,
        );
        if (inFiltered) {
          const index = filteredFlatTestRuns.findIndex(
            (tc) => tc.id === tcueParam,
          );
          setSelectedTestCaseId(inFiltered.test_case_id);
          setCurrentTestCaseIndex(index);
          setCurrentTcueId(tcueParam);
          setIsModalOpen(true);
          return;
        }
      }

      const allList = allTcues || [];
      const inAll = allList.find((tc) => tc.id === tcueParam);
      if (inAll) {
        setSelectedTestCaseId(inAll.test_case_id);
        const representativeIndex = filteredFlatTestRuns.findIndex(
          (tc) => tc.test_case_id === inAll.test_case_id,
        );
        setCurrentTestCaseIndex(representativeIndex);
        setCurrentTcueId(tcueParam);
        setIsModalOpen(true);
      }
    } else {
      // Reset modal state when tcue parameter is removed
      setSelectedTestCaseId(null);
      setCurrentTestCaseIndex(-1);
      setCurrentTcueId(null);
      setIsModalOpen(false);
    }
  }, [tcueParam, filteredFlatTestRuns, allTcues]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const currentTcueParam = params.get("tcue");

      if (!currentTcueParam) {
        setSelectedTestCaseId(null);
        setCurrentTestCaseIndex(-1);
        setIsModalOpen(false);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleCloseModal = () => {
    // Reset states first
    setSelectedTestCaseId(null);
    setCurrentTestCaseIndex(-1);
    setIsModalOpen(false);

    // Remove URL parameter
    const params = new URLSearchParams(window.location.search);
    params.delete("tcue");
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  };

  // Modified useEffect to handle potential string array type of params.id
  useEffect(() => {
    if (params.id) {
      // Convert params.id to string if it's not already
      const testRunId = Array.isArray(params.id)
        ? params.id[0]
        : params.id.toString();
      dispatch(fetchTestRunUnderExecution(testRunId));
    }
  }, [params.id, dispatch]);

  const updateTcueParameter = useCallback((tcueId: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (tcueId) {
      params.set("tcue", tcueId);
    } else {
      params.delete("tcue");
    }
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  }, []);

  const handleNextTestCase = () => {
    if (currentTestCaseIndex < filteredFlatTestRuns.length - 1) {
      const nextIndex = currentTestCaseIndex + 1;
      const nextTestCase = filteredFlatTestRuns[nextIndex];
      setCurrentTestCaseIndex(nextIndex);
      setSelectedTestCaseId(nextTestCase.test_case_id);
      setCurrentTcueId(nextTestCase.id);
      updateTcueParameter(nextTestCase.id);
    }
  };

  const handlePrevTestCase = () => {
    if (currentTestCaseIndex > 0) {
      const prevIndex = currentTestCaseIndex - 1;
      const prevTestCase = filteredFlatTestRuns[prevIndex];
      setCurrentTestCaseIndex(prevIndex);
      setSelectedTestCaseId(prevTestCase.test_case_id);
      setCurrentTcueId(prevTestCase.id);
      updateTcueParameter(prevTestCase.id);
    }
  };

  // Fix the useEffect with missing dependencies
  useEffect(() => {
    const setCorrectProduct = async () => {
      if (params.product) {
        setLocalLoading(true);
        const productId = Array.isArray(params.product)
          ? params.product[0]
          : params.product.toString();
        const testRunId = Array.isArray(params.id)
          ? params.id[0]
          : params.id.toString();
        if (productId == lastProductId) {
          return;
        }
        dispatch(fetchTestRunUnderExecution(testRunId));
        console.log("here is you pid: " + productId);
        if (productId != productSwitcher.product_id) {
          const product = products.find(
            (product) => product.product_id == productId,
          );
          setProductSwitcher(product as ProductSwitcherSchema);
          await dispatch(fetchFeatures(product?.product_id as string));
          await dispatch(fetchTestCases(productId));
          await dispatch(fetchTestRunsForProduct(productId));
          await dispatch(fetchTestRunUnderExecution(testRunId));
          setLastProductId(productId);
        }
        setLocalLoading(false);
      }
    };
    setCorrectProduct();
  }, [params.product, products]);

  const handleAddNewTestCases = () => {
    const testRunId = Array.isArray(params.id) ? params.id[0] : params.id;
    const productId = Array.isArray(params.product)
      ? params.product[0]
      : params.product;
    router.push(
      `/${productId}/test-cases?selectionMode=true&testRunId=${testRunId}`,
    );
  };

  const handleExportClick = () => {
    setShowExportConfirmation(true);
  };

  const handleExport = () => {
    if (isExporting) return;

    try {
      setIsExporting(true);
      const testRunId = Array.isArray(params.id) ? params.id[0] : params.id;

      const failedTestCases =
        allTcues?.filter((tc) => tc.status === "FAILED") || [];

      const markdownContent = generateTestRunReport(
        testRunHeader?.title || "Test Run",
        {
          total: metrics.passed + metrics.failed + metrics.untested,
          progress: metrics.progress,
          passed: metrics.passed,
          failed: metrics.failed,
          untested: metrics.untested,
        },
        failedTestCases,
        `${getBaseUrl()}/${productSwitcher.product_id}/test-runs/${testRunId}`,
      );

      const blob = new Blob([markdownContent], { type: "text/markdown" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `test-run-report-${testRunId}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("Test run report exported successfully");
      setShowExportConfirmation(false);
    } catch (error) {
      console.error("Error exporting test run report:", error);
      Sentry.captureException(error, {
        level: "error",
        tags: { priority: "high" },
      });
      toast.error("Failed to export test run report");
    } finally {
      setIsExporting(false);
    }
  };

  const handleSendEmailClick = () => {
    setShowEmailConfirmation(true);
  };

  const handleSendEmail = async () => {
    if (isSendingEmail) return;

    try {
      setIsSendingEmail(true);
      const testRunId = Array.isArray(params.id) ? params.id[0] : params.id;
      const response = await fetch("/api/send-test-run-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ test_run_id: testRunId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMessage = errorData?.error || "Failed to send email";
        throw new Error(errorMessage);
      }

      toast.success("Test run email sent successfully");
      setShowEmailConfirmation(false);
    } catch (error) {
      console.error("Error sending test run email:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to send test run email",
      );
      Sentry.captureException(error, {
        level: "error",
        tags: { priority: "high" },
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleSyncAllTestCases = async () => {
    if (isSyncing) return;

    try {
      setIsSyncing(true);
      const testRunId = Array.isArray(params.id) ? params.id[0] : params.id;
      const now = Date.now();
      const CACHE_DURATION = 30 * 1000; // 30 seconds

      if (
        cachedSyncPreview &&
        cachedSyncPreview.testRunId === testRunId &&
        now - cachedSyncPreview.timestamp < CACHE_DURATION
      ) {
        setSyncCounts(cachedSyncPreview.counts);
        setShowSyncConfirmation(true);
        return;
      }

      const previewResponse = await fetch("/api/sync-tcue-in-test-run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          test_run_id: testRunId,
          preview: true,
        }),
      });

      if (!previewResponse.ok) {
        const errorData = await previewResponse.json().catch(() => null);
        const errorMessage = errorData?.error || "Failed to get sync preview";
        throw new Error(errorMessage);
      }

      const previewData = await previewResponse.json();
      const counts = {
        create: previewData.operations?.will_create || 0,
        update: previewData.operations?.will_update || 0,
        delete: previewData.operations?.will_delete || 0,
      };
      const totalAffected = previewData.operations?.total_affected || 0;

      setCachedSyncPreview({
        counts,
        totalAffected,
        timestamp: now,
        testRunId,
      });

      setSyncCounts(counts);
      setShowSyncConfirmation(true);
    } catch (error) {
      console.error("Error getting sync preview:", error);
      Sentry.captureException(error, {
        level: "error",
        tags: { priority: "high" },
      });
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to get sync preview. Please try again.",
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const handleConfirmSync = async () => {
    if (isSyncing) return;

    try {
      setIsSyncing(true);
      const testRunId = Array.isArray(params.id) ? params.id[0] : params.id;

      const response = await fetch("/api/sync-tcue-in-test-run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          test_run_id: testRunId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMessage =
          errorData?.error || "Failed to sync test case under executions";
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const countOfSyncedTcues =
        (data.count_of_synced_test_cases_under_execution || 0) -
        (syncCounts.delete || 0);

      dispatch(fetchTestRunUnderExecution(testRunId));

      toast.success(
        `Successfully synced ${countOfSyncedTcues} test case${countOfSyncedTcues !== 1 ? "s" : ""} under execution`,
      );

      setCachedSyncPreview(null);
      setShowSyncConfirmation(false);
    } catch (error) {
      console.error("Error syncing test case under executions:", error);
      Sentry.captureException(error, {
        level: "error",
        tags: { priority: "high" },
      });
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to sync test case under executions. Please try again.",
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const testRunHeader = testRuns
    .map((testRun) => testRun.runs.find((run) => run.test_run_id === params.id))
    .find(Boolean);

  const featuresById: FeaturesById = {};

  features?.forEach((feature: Feature) => {
    featuresById[feature.id] = feature;
  });

  const getFeatureName = (section: string): string => {
    if (!featuresById) return section;
    return featuresById[section]?.name || "Miscellaneous";
  };

  const totalSyncChanges = syncCounts.create + syncCounts.update;

  // New useEffect for conditional reloading -  WILL BE RELOADED ONLY IF THERE ARE 0 TEST CASES
  useEffect(() => {
    // Only set up auto-reload if there are 0 test cases
    let intervalId: NodeJS.Timeout | null = null;
    if (shouldAutoReload) {
      intervalId = setInterval(() => {
        if (params.id) {
          const testRunId = Array.isArray(params.id)
            ? params.id[0]
            : params.id.toString();
          dispatch(fetchTestRunUnderExecution(testRunId));
        }
      }, 30000); // 30 seconds
    }

    // Clean up interval on component unmount
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [testRunsUnderExecutions, params.id, dispatch]);

  const calculateMetrics = () => {
    const allTestCases = allTcues || [];
    const total = allTestCases.length;
    const passed = allTestCases.filter(
      (test) => test.status === "PASSED",
    ).length;
    const failed = allTestCases.filter(
      (test) => test.status === "FAILED",
    ).length;
    const untested = allTestCases.filter(
      (test) => test.status === "UNTESTED",
    ).length;
    const attemptFailed = allTestCases.filter(
      (test) => test.status === "ATTEMPT_FAILED",
    ).length;
    const skipped = allTestCases.filter(
      (test) => test.status === "SKIPPED",
    ).length;

    return {
      progress: total
        ? Math.round(((passed + failed + skipped) / total) * 100)
        : 0,
      passed,
      failed,
      untested,
      attemptFailed,
      skipped,
    };
  };

  const metrics = calculateMetrics();

  const getTestCaseUnderExecutionDetail = (tcueId: string) => {
    return allTcues?.find((tcue) => tcue.id === tcueId) || null;
  };

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p>{error}</p>
      </div>
    );
  }
  if (loading || localLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loading />
      </div>
    );
  }

  const filteredSections = Object?.entries(testRunsUnderExecutions)?.reduce(
    (acc, [section, cases]) => {
      let filteredCases = cases.filter(
        (testRunUnderExecution) =>
          String(testRunUnderExecution.test_case_id)
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          testRunUnderExecution.test_case_description
            .toLowerCase()
            .includes(searchQuery.toLowerCase()),
      );

      // Then apply status filter if one is selected
      if (statusFilter) {
        filteredCases = filteredCases.filter((testRunUnderExecution) =>
          (allTcues || []).some(
            (tcue) =>
              tcue.test_case_id === testRunUnderExecution.test_case_id &&
              tcue.status === statusFilter,
          ),
        );
        if (statusFilter === TestCaseUnderExecutionStatus.FAILED) {
          // Created a criticality order mapping for sorting
          const criticalityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };

          // Sorted the filtered cases by criticality
          filteredCases = [...filteredCases].sort((a, b) => {
            return (
              criticalityOrder[a.criticality] - criticalityOrder[b.criticality]
            );
          });
        }
      }

      // Apply user filter if selected
      if (userFilter) {
        filteredCases = filteredCases.filter(
          (testCase) => testCase.assignee_user_id === userFilter,
        );
      }

      if (filteredCases.length > 0) {
        acc[section] = filteredCases;
      }
      return acc;
    },
    {} as typeof testRunsUnderExecutions,
  );

  return (
    <div className="mt-8">
      <Header
        title={testRunHeader?.title || ""}
        metrics={metrics}
        onSearch={setSearchQuery}
        onFilter={setStatusFilter}
        onUserFilter={setUserFilter}
        selectedUser={userFilter}
        users={users}
        isQaiUser={isQaiUser}
        onAddNewTestCases={isQaiUser ? handleAddNewTestCases : undefined}
        onSendEmail={isQaiUser ? handleSendEmailClick : undefined}
        onExport={handleExportClick}
        isSelectionMode={isSelectionMode}
        selectedCount={selectedTestCases.length}
        onEnterSelectionMode={enterSelectionMode}
        onExitSelectionMode={exitSelectionMode}
        onCopyTestCases={handleCopyTestCases}
        onDeleteTestCases={() => setShowDeleteConfirmation(true)}
        onBulkAssign={handleBulkAssign}
        isAllSelected={isAllFeaturesSelected()}
        onToggleAll={toggleAllFeatures}
        shouldAutoReload={shouldAutoReload}
        setShouldAutoReload={setShouldAutoReload}
        onSync={isQaiUser ? handleSyncAllTestCases : undefined}
        isSyncing={isSyncing}
        onCreateJiraTickets={isQaiUser ? handleCreateJiraTickets : undefined}
        isCreatingJiraTickets={isCreatingJiraTickets}
        hasJiraIntegration={hasJiraIntegration}
      />
      <main className="p-6">
        {Object.keys(filteredSections).length === 0 ? (
          Object.values(testRunsUnderExecutions).flat().length === 0 ? (
            <div className="discovering-container h-80 flex items-center justify-center overflow-hidden relative bg-transparent">
              <div className="absolute z-10 flex flex-col items-center">
                {/* Animated hexagon icon */}
                <div className="hexagon-container mb-8 bg-transparent">
                  <svg
                    className="hexagon-icon"
                    viewBox="0 0 24 24"
                    width="80"
                    style={{ height: "auto" }}
                  >
                    <path
                      className="hexagon-path"
                      d="M12,2 L20,7 L20,17 L12,22 L4,17 L4,7 L12,2 Z"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    {/* Lines that converge to center from sides */}
                    <path className="synapse converge-line" d="M12 2 L12 12" />
                    <path className="synapse converge-line" d="M12 22 L12 12" />
                    <path className="synapse converge-line" d="M4 7 L12 12" />
                    <path className="synapse converge-line" d="M20 7 L12 12" />
                    <path className="synapse converge-line" d="M4 17 L12 12" />
                    <path className="synapse converge-line" d="M20 17 L12 12" />
                  </svg>
                </div>

                {/* Text content with gradient */}
                <div className="text-center relative">
                  <h2 className="text-3xl font-bold mb-3 text-purple-600">
                    QAI is running your tests
                  </h2>
                  <div className="flex items-center justify-center mb-6">
                    <div className="text-base text-gray-600 mb-1">
                      You&apos;ll see your test results here in a moment
                    </div>
                  </div>

                  {/* Dynamic progress indicators */}
                  <div className="processing-indicators justify-center items-center gap-4 mb-5 hidden">
                    <div className="process-step active">
                      <div className="process-dot"></div>
                      <span>Initializing</span>
                    </div>
                    <div className="h-0.5 w-6 bg-gray-200 process-line">
                      <div className="h-full bg-blue-400 process-progress"></div>
                    </div>
                    <div className="process-step active">
                      <div className="process-dot"></div>
                      <span>Analyzing</span>
                    </div>
                    <div className="h-0.5 w-6 bg-gray-200 process-line">
                      <div className="h-full bg-blue-400 process-progress progress-partial"></div>
                    </div>
                    <div className="process-step">
                      <div className="process-dot"></div>
                      <span>Generating</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* CSS for animations */}
              <style jsx>{`
                .discovering-container {
                  perspective: 1000px;
                }

                /* hexagon Animation */
                .hexagon-container {
                  position: relative;
                  width: 80px;
                  animation: float 4s ease-in-out infinite;
                }

                @keyframes float {
                  0%,
                  100% {
                    transform: translateY(0);
                  }
                  50% {
                    transform: translateY(-10px);
                  }
                }

                .hexagon-icon {
                  fill: white;
                  stroke: #8a2be2; /* Purple color for hexagon border */
                  stroke-width: 1.5;
                  position: relative;
                  z-index: 2;
                }

                .hexagon-path {
                  stroke-dasharray: 100;
                  stroke-dashoffset: 100;
                  animation:
                    drawhexagon 1.5s ease forwards,
                    glowPulse 3s ease-in-out infinite;
                  animation-delay: 0s, 1.5s;
                }

                @keyframes drawhexagon {
                  to {
                    stroke-dashoffset: 0;
                  }
                }

                @keyframes glowPulse {
                  0%,
                  100% {
                    stroke-width: 1.5;
                    filter: none;
                  }
                  50% {
                    stroke-width: 2;
                    filter: none;
                  }
                }
                /* Converging lines */
                .synapse {
                  opacity: 0;
                  stroke: #8a2be2; /* Purple color for lines */
                  stroke-width: 0.5;
                }

                .converge-line {
                  stroke-dasharray: 12;
                  stroke-dashoffset: 12;
                  animation:
                    drawToCenter 1.5s ease-in forwards,
                    pulseFlow 3s linear infinite;
                  animation-delay: 1.5s, 3s; /* Lines appear after hexagon draws */
                }

                @keyframes drawToCenter {
                  to {
                    opacity: 0.7;
                    stroke-dashoffset: 0;
                  }
                }

                @keyframes pulseFlow {
                  0% {
                    stroke-dashoffset: 12;
                    opacity: 0.3;
                  }
                  50% {
                    opacity: 0.7;
                  }
                  100% {
                    stroke-dashoffset: 0;
                    opacity: 0.3;
                  }
                }

                /* Text animations */
                @keyframes fadeIn {
                  from {
                    opacity: 0;
                  }
                  to {
                    opacity: 1;
                  }
                }

                /* Processing steps */
                .processing-indicators {
                  animation: fadeIn 0.5s ease-out forwards;
                  animation-delay: 0.5s;
                  opacity: 0;
                }

                .process-step {
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  gap: 4px;
                  font-size: 0.7rem;
                  color: #94a3b8;
                  position: relative;
                }

                .process-step.active {
                  color: #8a2be2; /* Purple color for active steps */
                }

                .process-dot {
                  width: 10px;
                  height: 10px;
                  border-radius: 50%;
                  background-color: #e2e8f0;
                  position: relative;
                }

                .process-step.active .process-dot {
                  background-color: #8a2be2; /* Purple color for active dots */
                }

                .process-step.active .process-dot::after {
                  content: "";
                  position: absolute;
                  inset: -4px;
                  border-radius: 50%;
                  border: 1px solid #8a2be2; /* Purple color for dot rings */
                  opacity: 0.5;
                }

                .process-line {
                  position: relative;
                  overflow: hidden;
                }

                .process-progress {
                  width: 100%;
                  transform: translateX(-100%);
                  animation: lineProgress 2s ease-in-out forwards;
                  background-color: #8a2be2; /* Purple color for progress */
                }

                .progress-partial {
                  animation: lineProgressPartial 2s ease-in-out forwards;
                }

                @keyframes lineProgress {
                  to {
                    transform: translateX(0);
                  }
                }

                @keyframes lineProgressPartial {
                  to {
                    transform: translateX(-30%);
                  }
                }

                /* Stagger the line animations */
                .converge-line:nth-child(2) {
                  animation-delay: 1.5s, 3.1s;
                }
                .converge-line:nth-child(3) {
                  animation-delay: 1.6s, 3.2s;
                }
                .converge-line:nth-child(4) {
                  animation-delay: 1.7s, 3.3s;
                }
                .converge-line:nth-child(5) {
                  animation-delay: 1.8s, 3.4s;
                }
                .converge-line:nth-child(6) {
                  animation-delay: 1.9s, 3.5s;
                }
                .converge-line:nth-child(7) {
                  animation-delay: 2s, 3.6s;
                }
              `}</style>
            </div>
          ) : (
            <div className="flex justify-center items-center h-40 text-gray-500">
              {statusFilter
                ? `No ${statusFilter} test cases found`
                : "No test case under execution"}
            </div>
          )
        ) : (
          Object.entries(filteredSections).map(
            ([category, testRunUnderExecution], key) => (
              <TestRunTimeSection
                key={key}
                category={getFeatureName(category)}
                categoryId={category}
                testRuns={testRunUnderExecution}
                productId={
                  typeof params.id === "string"
                    ? params.id
                    : Array.isArray(params.id)
                      ? params.id[0]
                      : ""
                }
                statusFilter={statusFilter}
                isSelectionMode={isSelectionMode}
                isSelected={isFeatureSelected(category, testRunUnderExecution)}
                toggleSelection={() =>
                  toggleFeatureSelection(category, testRunUnderExecution)
                }
                selectedTestCases={selectedTestCases}
                toggleTestCaseSelection={toggleTestCaseSelection}
              />
            ),
          )
        )}
      </main>

      {/* Modal - UPDATED: Now uses filtered arrays for navigation */}
      {isModalOpen && (selectedTestCaseId || currentTcueId) && (
        <TCUEUnified
          onClose={handleCloseModal}
          onNextTestCase={handleNextTestCase}
          onPrevTestCase={handlePrevTestCase}
          hasNext={currentTestCaseIndex < filteredFlatTestRuns.length - 1}
          hasPrev={currentTestCaseIndex > 0}
          testCaseUnderExecutionId={
            currentTcueId || filteredFlatTestRuns[currentTestCaseIndex]?.id
          }
          productId={
            Array.isArray(params.product) ? params.product[0] : params.product
          }
          testRunId={Array.isArray(params.id) ? params.id[0] : params.id}
          testCaseUnderExecutionDetail={getTestCaseUnderExecutionDetail(
            currentTcueId ||
              filteredFlatTestRuns[currentTestCaseIndex]?.id ||
              "",
          )}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          showModeSelector={isQaiUser}
        />
      )}

      {/* Copy TCUE to another product Dialog */}
      <CopyTCUEToProductDialog
        isOpen={showCopyDialog}
        onOpenChange={setShowCopyDialog}
        selectedTestCases={selectedTestCases}
      />

      <ConfirmationDialog
        isOpen={showDeleteConfirmation}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setShowDeleteConfirmation(false);
          }
        }}
        title="Delete Test Cases"
        description={`Are you sure you want to remove ${getAllRelatedTcues(selectedTestCases).length} test case${getAllRelatedTcues(selectedTestCases).length > 1 ? "s" : ""} from this test run?`}
        confirmText="Delete"
        onConfirm={handleDeleteTestCases}
        isLoading={isDeleting}
      />

      <ConfirmationDialog
        isOpen={showEmailConfirmation}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setShowEmailConfirmation(false);
          }
        }}
        title="Send Test Run Email"
        description="Are you sure you want to send an email with the test run results?"
        confirmText="Send"
        onConfirm={handleSendEmail}
        isLoading={isSendingEmail}
        loadingText="Sending..."
      />

      <ConfirmationDialog
        isOpen={showExportConfirmation}
        onOpenChange={setShowExportConfirmation}
        title="Export Test Run Report"
        description="Are you sure you want to export the test run report?"
        confirmText="Export"
        onConfirm={handleExport}
        isLoading={isExporting}
        loadingText="Exporting..."
      />

      <BulkAssignDialog
        isOpen={showBulkAssignDialog}
        onOpenChange={setShowBulkAssignDialog}
        selectedTcues={selectedTestCases}
        onAssignComplete={exitSelectionMode}
      />

      <ConfirmationDialog
        isOpen={showSyncConfirmation}
        onOpenChange={setShowSyncConfirmation}
        title="Sync Test Cases Under Execution"
        description={
          <div>
            <p className="mb-3">
              The following changes will be made to sync test cases under
              execution:
            </p>
            {totalSyncChanges === 0 ? (
              <p>No changes to sync</p>
            ) : (
              <div className="space-y-1">
                {syncCounts.create > 0 && (
                  <p>
                    • Create (new Scenarios TCUES):{" "}
                    <strong>{syncCounts.create}</strong>
                  </p>
                )}
                {syncCounts.update > 0 && (
                  <p>
                    • Update: <strong>{syncCounts.update}</strong>
                  </p>
                )}
                {syncCounts.delete > 0 && (
                  <p>
                    • Delete: <strong>{syncCounts.delete}</strong>
                  </p>
                )}
                <p>
                  Total TCUEs to be synced: <strong>{totalSyncChanges}</strong>
                </p>
              </div>
            )}
          </div>
        }
        confirmText="Sync"
        onConfirm={handleConfirmSync}
        isLoading={isSyncing}
        loadingText="Syncing..."
        confirmButtonClassName="bg-purple-600 hover:bg-purple-700 text-white"
        isConfirmDisabled={totalSyncChanges === 0}
      />
    </div>
  );
}
