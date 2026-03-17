"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import AppHeader from "@/components/navigation/top-nav-bar-v2";
import SideNavigationBarV2 from "@/components/navigation/side-nav-bar-v2";
import { GraphFlowsProvider } from "@/app/context/graph-flows-context";
import "@/app/(editor)/index.css";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import GraphEditor from "@/app/(editor)/components/GraphEditor";
import { useProductSwitcher } from "@/providers/product-provider";
import { AddFeatureDialog } from "@/components/navigation/add-feature-dialog";
import { Feature } from "@/lib/types";
import { AppDispatch, RootState } from "@/app/store/store";
import {
  addGraphFeature,
  setGraphFeatures,
} from "@/app/store/graphFeaturesSlice";
import { GuidedTour, GuidedTourStep } from "@/components/global/guided-tour";
import { clearTutorial } from "@/app/store/tutorialSlice";
import SideNavigationBar from "@/components/navigation/side-nav-bar";

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.classList.add("homev2-theme");
    return () => {
      document.body.classList.remove("homev2-theme");
    };
  }, []);

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { productSwitcher } = useProductSwitcher();
  const [isLinearViewEnabled, setIsLinearViewEnabled] = useState(false);
  const dispatch = useDispatch<AppDispatch>();
  const graphFeatures = useSelector(
    (state: RootState) => state.graphFeatures.features,
  );
  const tutorial = useSelector((state: RootState) => state.tutorial);

  const [isAddFeatureDialogOpen, setIsAddFeatureDialogOpen] = useState(false);
  const [isFlowsTourOpen, setIsFlowsTourOpen] = useState(false);
  const [isFlowDetailsTourOpen, setIsFlowDetailsTourOpen] = useState(false);

  const isHomeV2Route = true;
  const isOldUi = useMemo(() => {
    return pathname?.includes("/editor") || pathname?.includes("/homev1");
  }, [pathname]);
  const showFlowsPanel = useMemo(() => {
    if (!isHomeV2Route) return false;
    const showFlowsParam = searchParams.get("showFlows");
    return showFlowsParam !== "false";
  }, [isHomeV2Route, searchParams]);

  const isFlowsRoute = useMemo(() => {
    return (
      pathname.endsWith(`/${productSwitcher.product_id}`) ||
      pathname.endsWith(`/${productSwitcher.product_id}/`)
    );
  }, [pathname, productSwitcher.product_id]);

  const flowsTourSteps: GuidedTourStep[] = useMemo(
    () => [
      {
        target: '[data-tutorial="new-flow"]',
        title: "Add new flow",
        description: "Click New Flow to start recording a flow.",
      },
      {
        target: '[data-tutorial="fine-tune-flow"]',
        title: "Fine tune flow",
        description:
          "Select a flow card in the left panel to open flow details.",
      },
    ],
    [],
  );

  const flowDetailsTourSteps: GuidedTourStep[] = useMemo(
    () => [
      {
        target: '[data-tutorial="step-controls"]',
        title: "Review the steps and add business logic",
        description:
          "Use step navigation to review each step in the flow and add business logic for transitions.",
      },
      {
        target: '[data-tutorial="flow-config"]',
        title: "Add credentials and scenarios",
        description: "Manage scenarios and credentials for this flow here.",
      },
      {
        target: '[data-tutorial="start-test-run"]',
        title: "Start new test run",
        description: "Start a new test run once your flow is ready.",
      },
    ],
    [],
  );

  useEffect(() => {
    if (tutorial.activeKey !== "flows") {
      setIsFlowsTourOpen(false);
      return;
    }

    if (!isFlowsRoute || !showFlowsPanel) {
      setIsFlowsTourOpen(false);
      return;
    }

    setIsFlowsTourOpen(true);
  }, [tutorial.activeKey, tutorial.runId, isFlowsRoute, showFlowsPanel]);

  useEffect(() => {
    if (tutorial.activeKey !== "flows-details") {
      setIsFlowDetailsTourOpen(false);
      return;
    }

    if (!isFlowsRoute || !showFlowsPanel) {
      setIsFlowDetailsTourOpen(false);
      return;
    }

    const hasFlowDetails =
      typeof document !== "undefined" &&
      !!document.querySelector('[data-tutorial="step-controls"]');

    setIsFlowDetailsTourOpen(hasFlowDetails);
  }, [tutorial.activeKey, tutorial.runId, isFlowsRoute, showFlowsPanel]);

  const selectedFeatureId = useMemo(() => {
    if (!isHomeV2Route) return null;
    return searchParams.get("featureId");
  }, [isHomeV2Route, searchParams]);

  const handleFeatureSelectChange = useCallback(
    (featureId: string | null) => {
      if (!productSwitcher.product_id) return;
      const params = new URLSearchParams(searchParams.toString());
      if (featureId) {
        params.set("featureId", featureId);
      } else {
        params.delete("featureId");
      }

      const showFlows = searchParams.get("showFlows");
      if (showFlows !== "false") {
        params.set("showFlows", "true");
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [productSwitcher.product_id, searchParams, router, pathname],
  );

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
    // Best-effort: keep graph-features list in sync for flows panel & test-runs mapping.
    dispatch(setGraphFeatures(updatedGraphFeatures));
    dispatch(addGraphFeature(normalizedFeature));

    handleFeatureSelectChange(newFeature.id);
  };

  const isAuthPath =
    pathname?.includes("/sign-in") ||
    pathname?.includes("/sign-up") ||
    pathname?.includes("/verify") ||
    pathname?.includes("/sso-callback") ||
    pathname?.startsWith("/onboarding");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isOldUi || isAuthPath) return;
    if (isFlowsRoute && showFlowsPanel) return;

    window.dispatchEvent(new CustomEvent("graphCancelTestRunSelection"));
  }, [isOldUi, isAuthPath, isFlowsRoute, showFlowsPanel]);

  return (
    <div className="flex h-screen bg-gray-50">
      <GuidedTour
        open={isFlowsTourOpen}
        steps={flowsTourSteps}
        onOpenChange={(open) => {
          setIsFlowsTourOpen(open);
          if (!open) dispatch(clearTutorial());
        }}
      />
      <GuidedTour
        open={isFlowDetailsTourOpen}
        steps={flowDetailsTourSteps}
        onOpenChange={(open) => {
          setIsFlowDetailsTourOpen(open);
          if (!open) dispatch(clearTutorial());
        }}
      />
      {isOldUi ? (
        <SideNavigationBar />
      ) : !isAuthPath ? (
        <SideNavigationBarV2 />
      ) : null}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {!isOldUi && !isAuthPath ? (
          <AppHeader
            isLinearViewEnabled={isLinearViewEnabled}
            onToggleLinearView={setIsLinearViewEnabled}
          />
        ) : null}
        <main className="flex-1 overflow-hidden min-h-0 relative">
          {/* Persistent GraphEditor: stays mounted across homev2 route changes */}
          {!isOldUi && !isAuthPath && (
            <div className="absolute inset-0 z-0">
              <GraphEditor
                hideSidebar={true}
                hideTopButtons={true}
                showFlowsPanel={showFlowsPanel}
                selectedFeatureId={selectedFeatureId}
                onFeatureSelectChange={handleFeatureSelectChange}
                onAddFeatureClick={() => setIsAddFeatureDialogOpen(true)}
                enableLinearFlowView={
                  pathname?.includes("/test-runs") ||
                  (isLinearViewEnabled &&
                    searchParams.get("showFlows") === "true")
                }
              />
            </div>
          )}
          {/* Page content overlays on top of the persistent graph */}
          <div
            className={`relative z-10 h-full ${
              !isOldUi && !isAuthPath ? "pointer-events-none" : "mt-12"
            }`}
          >
            {children}
          </div>

          <AddFeatureDialog
            open={isAddFeatureDialogOpen}
            onOpenChange={setIsAddFeatureDialogOpen}
            onFeatureCreated={handleFeatureCreated}
          />
        </main>
      </div>
    </div>
  );
}

export default function DashboardClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GraphFlowsProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </GraphFlowsProvider>
  );
}
