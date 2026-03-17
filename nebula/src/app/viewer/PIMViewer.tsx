"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import CarouselOverlay from "./components/CarouselOverlay";
import TabSwitcherOverlay from "./components/TabSwitcherOverlay";
import { AnimationUtils } from "./utils/animationUtils";
import { StarryBackdrop } from "./utils/StarryBackdrop";
import { FlowViewerMode } from "./modes/FlowViewerMode";
import { FeatureViewerMode } from "./modes/FeatureViewerMode";

import { useViewMode } from "./hooks/useViewMode";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { FEATURE_VIEWER_ENABLED, DEFAULT_TEST_DATA } from "./config";

import {
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_FAR,
  FLOW_VIEWER_CAMERA_POSITION,
  FEATURE_VIEWER_CAMERA_POSITION,
  VIEWING_NODE_POSITION,
  FEATURE_VIEWER_CAMERA_FOCUS_POSITION,
  SCENE_BACKGROUND_COLOR,
  CAMERA_TRANSITION_DURATION,
  OVERLAY_FADE_DURATION,
} from "./constants";
import { GRID_CENTER_POSITION } from "./constants/geometry";
import type { GraphData } from "./types/carousel";
import type { FeaturesData } from "./utils/gridFactory";

interface PIMViewerProps {
  onClose?: () => void;
  metadata?: string;
}

export default function PIMViewer({ onClose, metadata }: PIMViewerProps = {}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [isClient, setIsClient] = useState(false);

  const [containerOpacity, setContainerOpacity] = useState(0); // Start hidden
  const [overlayOpacity, setOverlayOpacity] = useState(1); // Default opacity
  const overlayOpacityRef = useRef(overlayOpacity);

  // Add state management for overlay information
  const [currentNodeIndex, setCurrentNodeIndex] = useState(0);
  const [overlayTotalNodes, setOverlayTotalNodes] = useState(0);
  const [currentDescription, setCurrentDescription] = useState("");
  const [outgoingEdgeDescription, setOutgoingEdgeDescription] =
    useState("Next");

  // Toast functionality
  const { toast } = useToast();

  // Viewer modes
  const flowModeRef = useRef<FlowViewerMode | null>(null);
  const featureModeRef = useRef<FeatureViewerMode | null>(null);
  const activeModeRef = useRef<"flow" | "feature">("flow");

  // Centralized view mode state
  const { viewMode, setViewMode } = useViewMode();
  const viewModeRef = useRef(viewMode);

  const animationFrameRef = useRef<number | null>(null);
  const starryBackdropRef = useRef<StarryBackdrop | null>(null);

  const cameraAnimationCancelRef = useRef<(() => void) | null>(null);
  const overlayAnimationCancelRef = useRef<(() => void) | null>(null);

  // Feature selection handler from FeatureViewerMode
  const handleFeatureSelect = useCallback(
    (params: {
      gridPosition: { x: number; y: number; z: number };
      featureName: string;
    }) => {
      if (flowModeRef.current) {
        flowModeRef.current.updateFlowBlockPosition(params.gridPosition);
        // Restore original behavior: reset carousel to first node when switching to flow
        flowModeRef.current.resetToFirstNode();
      }
      toast({
        title: "Feature Selected",
        description: params.featureName,
        duration: 2000,
      });
      // Switch to flow mode programmatically after selection
      setViewMode("flow");
    },
    [toast, setViewMode],
  );

  const handleFeatureSelectRef = useRef(handleFeatureSelect);
  useEffect(() => {
    handleFeatureSelectRef.current = handleFeatureSelect;
  }, [handleFeatureSelect]);

  // Handle tab change - delegate to modes
  const handleTabChange = (newTab: "flow" | "feature") => {
    if (newTab === viewMode) return;
    if (newTab === "flow") {
      flowModeRef.current?.resetToFirstNode();
    }
    setViewMode(newTab);
  };

  // Set client-side flag for portal rendering and prevent body scrolling
  useEffect(() => {
    setIsClient(true);

    // Prevent all scrolling
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    document.body.style.height = "100%";

    // Cleanup: restore scrolling when component unmounts
    return () => {
      document.documentElement.style.overflow = "auto";
      document.body.style.overflow = "auto";
      document.body.style.position = "static";
      document.body.style.width = "auto";
      document.body.style.height = "auto";
    };
  }, []);

  // Feature scroll wheel handled by FeatureViewerMode

  // Update viewMode ref
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  // Click picking handled inside FeatureViewerMode

  // Camera transition effect - updates camera position when viewMode changes
  useEffect(() => {
    if (!cameraRef.current) return;

    // Mode classes manage their own animations

    // Cancel any existing camera animation
    if (cameraAnimationCancelRef.current) {
      cameraAnimationCancelRef.current();
      cameraAnimationCancelRef.current = null;
    }

    // Cancel any existing overlay animation
    if (overlayAnimationCancelRef.current) {
      overlayAnimationCancelRef.current();
      overlayAnimationCancelRef.current = null;
    }

    const currentFlowBlockPosition =
      flowModeRef.current?.getCurrentFlowBlockPosition();
    // Calculate initial feature camera Z position based on current flow block position
    const firstFeatureBlockZ = GRID_CENTER_POSITION.z; // First feature block is at grid center
    const currentFlowBlockZ =
      currentFlowBlockPosition?.z || GRID_CENTER_POSITION.z;
    const zOffset = currentFlowBlockZ - firstFeatureBlockZ; // How far the flow block is from first feature block
    const initialFeatureCameraZ = FEATURE_VIEWER_CAMERA_POSITION.z + zOffset; // Add offset to base feature camera Z

    const targetPosition =
      viewMode === "flow"
        ? new THREE.Vector3(
            // Flow camera position relative to current flow block position
            (currentFlowBlockPosition?.x || GRID_CENTER_POSITION.x) +
              FLOW_VIEWER_CAMERA_POSITION.x,
            (currentFlowBlockPosition?.y || GRID_CENTER_POSITION.y) +
              FLOW_VIEWER_CAMERA_POSITION.y,
            (currentFlowBlockPosition?.z || GRID_CENTER_POSITION.z) +
              FLOW_VIEWER_CAMERA_POSITION.z,
          )
        : new THREE.Vector3(
            FEATURE_VIEWER_CAMERA_POSITION.x,
            FEATURE_VIEWER_CAMERA_POSITION.y,
            initialFeatureCameraZ,
          );

    // Calculate dynamic feature camera focus position based on current flow block position
    const initialFeatureFocusZ =
      FEATURE_VIEWER_CAMERA_FOCUS_POSITION.z + zOffset; // Add same offset to focus Z

    const targetFocus =
      viewMode === "flow"
        ? new THREE.Vector3(
            // Flow focus position relative to current flow block position
            (currentFlowBlockPosition?.x || GRID_CENTER_POSITION.x) +
              VIEWING_NODE_POSITION.x,
            (currentFlowBlockPosition?.y || GRID_CENTER_POSITION.y) +
              VIEWING_NODE_POSITION.y,
            (currentFlowBlockPosition?.z || GRID_CENTER_POSITION.z) +
              VIEWING_NODE_POSITION.z,
          )
        : new THREE.Vector3(
            FEATURE_VIEWER_CAMERA_FOCUS_POSITION.x,
            FEATURE_VIEWER_CAMERA_FOCUS_POSITION.y,
            initialFeatureFocusZ, // Use dynamic focus Z position based on current flow square
          );

    // Start camera animation
    const cancelCameraAnimation = AnimationUtils.animateCameraTransition(
      cameraRef.current,
      targetPosition,
      targetFocus,
      CAMERA_TRANSITION_DURATION,
      () => {
        cameraAnimationCancelRef.current = null;
      },
    );

    // Start overlay fade animation
    const cancelOverlayAnimation =
      viewMode === "feature"
        ? AnimationUtils.animateOverlayFadeOut(
            setOverlayOpacity,
            overlayOpacityRef.current,
            OVERLAY_FADE_DURATION,
            () => {
              overlayAnimationCancelRef.current = null;
            },
          )
        : AnimationUtils.animateOverlayFadeIn(
            setOverlayOpacity,
            overlayOpacityRef.current,
            OVERLAY_FADE_DURATION,
            () => {
              overlayAnimationCancelRef.current = null;
            },
          );

    cameraAnimationCancelRef.current = cancelCameraAnimation;
    overlayAnimationCancelRef.current = cancelOverlayAnimation;

    // Delegate view mode visual changes to mode classes
    if (viewMode === "feature") {
      flowModeRef.current?.deactivate();
      // Align feature camera position with current flow Z
      featureModeRef.current?.setScrollFromFlowZ(currentFlowBlockZ);
      featureModeRef.current?.activate();
      activeModeRef.current = "feature";
    } else {
      featureModeRef.current?.deactivate();
      featureModeRef.current?.resetScroll();
      flowModeRef.current?.activate();
      activeModeRef.current = "flow";
      // Ensure overlay is synced with current Flow mode state upon switch
      const state = flowModeRef.current?.getState();
      if (state) {
        setCurrentNodeIndex(state.currentNodeIndex);
        setOverlayTotalNodes(state.totalNodes);
        setCurrentDescription(
          flowModeRef.current?.getCurrentNodeDescription() || "",
        );
        setOutgoingEdgeDescription(
          flowModeRef.current?.getOutgoingEdgeDescription() || "Next",
        );
      }
    }
  }, [viewMode]);

  useEffect(() => {
    overlayOpacityRef.current = overlayOpacity;
  }, [overlayOpacity]);

  useEffect(() => {
    if (!mountRef.current) return;

    const mount = mountRef.current;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SCENE_BACKGROUND_COLOR);
    sceneRef.current = scene;

    // Camera setup - positioned relative to flow square center
    const camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      window.innerWidth / window.innerHeight,
      CAMERA_NEAR,
      CAMERA_FAR,
    );
    camera.position.set(
      GRID_CENTER_POSITION.x + FLOW_VIEWER_CAMERA_POSITION.x,
      GRID_CENTER_POSITION.y + FLOW_VIEWER_CAMERA_POSITION.y,
      GRID_CENTER_POSITION.z + FLOW_VIEWER_CAMERA_POSITION.z,
    );
    camera.lookAt(
      GRID_CENTER_POSITION.x + VIEWING_NODE_POSITION.x,
      GRID_CENTER_POSITION.y + VIEWING_NODE_POSITION.y,
      GRID_CENTER_POSITION.z + VIEWING_NODE_POSITION.z,
    ); // Look at the viewing node position relative to grid center
    cameraRef.current = camera;

    // Renderer setup with optimized settings for texture reduction
    const renderer = new THREE.WebGLRenderer({
      antialias: false, // Disable antialiasing to reduce texture units
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Basic shadow settings to reduce texture usage
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap; // Use basic shadows instead of PCF

    // Limit pixel ratio for better performance
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0));
    rendererRef.current = renderer;

    mountRef.current.appendChild(renderer.domElement);

    // Content loaded handler
    const handleContentLoaded = () => {
      // Animate container opacity from 0 to 1 with a smooth transition
      setTimeout(() => {
        setContainerOpacity(1);
      }, 50); // Small delay to ensure state is updated
    };

    let tcGraphJson: any = undefined;
    if (metadata) {
      let parsedMeta: any = metadata;
      if (typeof parsedMeta === "string") {
        try {
          parsedMeta = JSON.parse(parsedMeta);
        } catch (e) {
          console.error("Error parsing metadata:", e);
          parsedMeta = undefined;
        }
      }
      if (parsedMeta && typeof parsedMeta === "object") {
        tcGraphJson = (parsedMeta as any)["tc_graph_json"];
      }
    }

    // Create Flow mode and Feature mode instances
    const flowMode = new FlowViewerMode(
      { scene, camera, renderer, mountElement: mount },
      {
        graphData:
          (tcGraphJson as GraphData) || (DEFAULT_TEST_DATA.graph as GraphData),
        onNodeChange: (nodeIndex: number) => {
          setCurrentNodeIndex(nodeIndex);
          const state = flowMode.getState();
          setOverlayTotalNodes(state.totalNodes);
          setCurrentDescription(flowMode.getCurrentNodeDescription());
          setOutgoingEdgeDescription(flowMode.getOutgoingEdgeDescription());
        },
        onContentLoaded: handleContentLoaded,
      },
    );
    flowModeRef.current = flowMode;

    // Initialize overlay state with initial FlowBlock state (from mode)
    const initState = flowMode.getState();
    setCurrentNodeIndex(initState.currentNodeIndex);
    setOverlayTotalNodes(initState.totalNodes);
    setCurrentDescription(flowMode.getCurrentNodeDescription());
    setOutgoingEdgeDescription(flowMode.getOutgoingEdgeDescription());

    const featureMode = new FeatureViewerMode(
      { scene, camera, renderer },
      {
        featuresData: DEFAULT_TEST_DATA.features as FeaturesData,
        onFeatureSelect: (params) => handleFeatureSelectRef.current(params),
      },
    );
    featureModeRef.current = featureMode;

    // Get mirrors from FlowBlock via internal instance if available later
    // Note: FlowBlock instance is internal to FlowViewerMode; keep mirrorsRef for parity if needed

    // Create and add the starry backdrop
    const starryBackdrop = new StarryBackdrop();
    starryBackdrop.createStarryBackdrop(scene);
    starryBackdropRef.current = starryBackdrop;

    // Create and add the grid light

    // FlowBlock handles flow block creation and lighting setup

    // Activate initial mode
    flowMode.activate();
    activeModeRef.current = "flow";

    // Animation loop with proper cleanup
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      // Tick active mode
      if (activeModeRef.current === "feature") {
        featureModeRef.current?.tick(16);
      } else {
        flowModeRef.current?.tick(16);
      }

      renderer.render(scene, camera);
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      if (cameraRef.current && rendererRef.current) {
        cameraRef.current.aspect = window.innerWidth / window.innerHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(window.innerWidth, window.innerHeight);
      }
    };
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);

      // Remove renderer from DOM
      if (mount && rendererRef.current) {
        mount.removeChild(renderer.domElement);
      }

      // Comprehensive cleanup of Three.js resources
      // Cancel animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      featureModeRef.current?.dispose();
      featureModeRef.current = null;
      flowModeRef.current?.dispose();
      flowModeRef.current = null;

      // Dispose of starry backdrop
      if (starryBackdropRef.current) {
        starryBackdropRef.current.dispose();
        starryBackdropRef.current = null;
      }

      // Dispose of renderer
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }

      // Clear scene and camera
      if (sceneRef.current) {
        sceneRef.current.clear();
        sceneRef.current = null;
      }
      cameraRef.current = null;
    };
  }, []);

  return (
    <>
      <div
        ref={mountRef}
        className="fixed inset-0 w-screen h-screen overflow-hidden"
        style={{
          position: "fixed",
          top: 42, // add a little top margin for DialogTitle
          left: 0,
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
          zIndex: 0,
          opacity: containerOpacity,
          transition: "opacity 0.3s ease-out",
        }}
      />

      {/* Close button - only show if onClose is provided */}
      {onClose && (
        <button
          onClick={onClose}
          className="fixed top-4 right-4 z-[10000] bg-transparent border-none hover:opacity-70 p-2 transition-opacity duration-200"
          style={{
            position: "fixed",
            top: "1rem",
            right: "1rem",
            zIndex: 10000,
          }}
          aria-label="Close viewer"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="black"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      )}

      {FEATURE_VIEWER_ENABLED && (
        <TabSwitcherOverlay
          isClient={isClient}
          activeTab={viewMode}
          onTabChange={handleTabChange}
        />
      )}

      <CarouselOverlay
        isClient={isClient}
        currentNodeIndex={currentNodeIndex}
        totalNodes={overlayTotalNodes}
        currentDescription={currentDescription}
        outgoingEdgeDescription={outgoingEdgeDescription}
        onPrevious={() => flowModeRef.current?.moveToPrevious()}
        onNext={() => flowModeRef.current?.moveToNext()}
        overlayOpacity={overlayOpacity}
      />
      <Toaster />
    </>
  );
}
