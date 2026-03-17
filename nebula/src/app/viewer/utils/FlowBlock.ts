import * as THREE from "three";
import { MirrorFactory } from "./mirrorFactory";
import { AnimationUtils, AnimationGroup } from "./animationUtils";
import {
  SQUARE_WIDTH,
  SQUARE_DEPTH,
  SQUARE_COLOR,
  SQUARE_OPACITY,
  GRID_CENTER_POSITION,
  FIRST_BACKGROUND_NODE_X,
  FIRST_BACKGROUND_NODE_Z,
  SECOND_BACKGROUND_NODE_X,
  SECOND_BACKGROUND_NODE_Z,
  DISTANCE_BETWEEN_PARALLEL_BACKGROUND_NODES,
  VIEWING_NODE_POSITION,
  FLOW_VIEWER_CAMERA_POSITION,
  AMBIENT_LIGHT_COLOR,
  AMBIENT_LIGHT_INTENSITY,
  DIRECTIONAL_LIGHT_COLOR,
  DIRECTIONAL_LIGHT_INTENSITY,
  DIRECTIONAL_LIGHT_POSITION,
  MIRROR_ANIMATION_DURATION,
  OVERLAY_FADE_DURATION,
} from "../constants";
import type { GraphData } from "../types/carousel";

export interface FlowBlockConfig {
  graphData: GraphData;
  onNodeChange?: (nodeIndex: number) => void;
  onContentLoaded?: () => void;
  viewMode?: "flow" | "feature";
}

export interface FlowBlockState {
  currentNodeIndex: number;
  totalNodes: number;
}

export class FlowBlock {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private mountElement: HTMLElement;

  // Core elements
  private flowBlock!: THREE.Mesh;
  private mirrors: THREE.Group[] = [];
  private mirrorsRef: THREE.Group[] = [];

  // Lighting
  private ambientLight!: THREE.AmbientLight;
  private directionalLight!: THREE.DirectionalLight;
  private frontLight!: THREE.SpotLight;

  // State management
  private config: FlowBlockConfig;
  private state: FlowBlockState;
  private animationFrameId: number | null = null;
  private mirrorTiltAnimations: (() => void)[] = [];
  private viewMode: "flow" | "feature" = "flow";
  public readonly ready: Promise<void>;

  // Animation groups
  private flowModeAnimationGroup: AnimationGroup | null = null;
  private keydownListener: ((event: KeyboardEvent) => void) | null = null;

  // Texture loading tracking
  private texturesLoaded = 0;
  private totalTextures = 0;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    mountElement: HTMLElement,
    config: FlowBlockConfig,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.mountElement = mountElement;
    this.config = config;
    this.viewMode = config.viewMode || "flow";

    // Initialize state
    this.state = {
      currentNodeIndex: 0,
      totalNodes: config.graphData.nodes.length,
    };

    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    this.createFlowBlock();
    await this.createCarousel();
    this.setupLighting();
    this.setupCamera();
    this.setupEventListeners();
  }

  private createFlowBlock(): void {
    // Create the flow block (same as feature blocks)
    const geometry = new THREE.PlaneGeometry(SQUARE_WIDTH, SQUARE_DEPTH);
    const material = new THREE.MeshPhongMaterial({
      color: SQUARE_COLOR, // Same color as feature blocks
      transparent: true,
      opacity: SQUARE_OPACITY,
      side: THREE.DoubleSide,
    });

    this.flowBlock = new THREE.Mesh(geometry, material);
    this.flowBlock.rotation.x = -Math.PI / 2; // Rotate to lie flat on xz plane
    this.flowBlock.position.set(
      GRID_CENTER_POSITION.x,
      GRID_CENTER_POSITION.y,
      GRID_CENTER_POSITION.z,
    );
    this.flowBlock.name = "flowBlock";
    this.flowBlock.castShadow = false;
    this.flowBlock.receiveShadow = true;

    this.scene.add(this.flowBlock);
  }

  private async createCarousel(): Promise<void> {
    const nodesToUse = this.config.graphData.nodes;
    const flowBlockPosition = this.flowBlock.position;

    // Initialize texture loading tracking
    this.totalTextures = nodesToUse.length;
    this.texturesLoaded = 0;

    for (let index = 0; index < nodesToUse.length; index++) {
      const node = nodesToUse[index];
      const opacity = AnimationUtils.calculateNodeOpacity(
        index,
        this.state.currentNodeIndex,
      );
      const mirror = await MirrorFactory.createMirrorWithTexture(
        node.data.image,
        opacity,
        {
          onLoad: () => {
            this.texturesLoaded++;
            this.checkIfAllTexturesLoaded();
          },
          onError: (error) => {
            console.error(`Failed to load texture for node ${index}:`, error);
            this.texturesLoaded++;
            this.checkIfAllTexturesLoaded();
          },
        },
      );

      // Position mirrors relative to flow block center
      if (index === 0) {
        // First node (currently viewing) at viewing position relative to flow block
        mirror.position.set(
          flowBlockPosition.x + VIEWING_NODE_POSITION.x,
          flowBlockPosition.y + VIEWING_NODE_POSITION.y,
          flowBlockPosition.z + VIEWING_NODE_POSITION.z,
        );
      } else if (index === 1) {
        // Second node: higher X, lower Z relative to flow block
        mirror.position.set(
          flowBlockPosition.x + FIRST_BACKGROUND_NODE_X,
          flowBlockPosition.y + VIEWING_NODE_POSITION.y,
          flowBlockPosition.z + FIRST_BACKGROUND_NODE_Z,
        );
      } else if (index === 2) {
        // Third node: even higher X, even lower Z relative to flow block
        mirror.position.set(
          flowBlockPosition.x + SECOND_BACKGROUND_NODE_X,
          flowBlockPosition.y + VIEWING_NODE_POSITION.y,
          flowBlockPosition.z + SECOND_BACKGROUND_NODE_Z,
        );
      } else {
        // Subsequent nodes: continue with lower and lower Z relative to flow block
        const zOffset =
          (index - 2) * DISTANCE_BETWEEN_PARALLEL_BACKGROUND_NODES;
        mirror.position.set(
          flowBlockPosition.x + SECOND_BACKGROUND_NODE_X,
          flowBlockPosition.y + VIEWING_NODE_POSITION.y,
          flowBlockPosition.z + SECOND_BACKGROUND_NODE_Z - zOffset,
        );
      }

      this.scene.add(mirror);
      this.mirrors.push(mirror);
      this.mirrorsRef.push(mirror);
    }
  }

  private setupLighting(): void {
    // Ambient light
    this.ambientLight = new THREE.AmbientLight(
      AMBIENT_LIGHT_COLOR,
      AMBIENT_LIGHT_INTENSITY,
    );
    this.scene.add(this.ambientLight);

    // Directional light
    this.directionalLight = new THREE.DirectionalLight(
      DIRECTIONAL_LIGHT_COLOR,
      DIRECTIONAL_LIGHT_INTENSITY,
    );
    this.directionalLight.position.set(
      DIRECTIONAL_LIGHT_POSITION.x,
      DIRECTIONAL_LIGHT_POSITION.y,
      DIRECTIONAL_LIGHT_POSITION.z,
    );
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.width = 256;
    this.directionalLight.shadow.mapSize.height = 256;
    this.directionalLight.shadow.bias = -0.01;
    this.directionalLight.shadow.normalBias = 0.02;
    this.directionalLight.shadow.intensity = 0.25;
    this.directionalLight.shadow.camera.near = 0.1;
    this.directionalLight.shadow.camera.far = 50;
    this.directionalLight.shadow.camera.left = -10;
    this.directionalLight.shadow.camera.right = 10;
    this.directionalLight.shadow.camera.top = 10;
    this.directionalLight.shadow.camera.bottom = -10;
    this.scene.add(this.directionalLight);

    // Front light positioned at the same location as the camera
    this.frontLight = new THREE.SpotLight(
      0xffffff,
      2.0,
      20,
      Math.PI / 3,
      0.5,
      1,
    );
    this.frontLight.position.set(
      GRID_CENTER_POSITION.x + FLOW_VIEWER_CAMERA_POSITION.x,
      GRID_CENTER_POSITION.y + FLOW_VIEWER_CAMERA_POSITION.y,
      GRID_CENTER_POSITION.z + FLOW_VIEWER_CAMERA_POSITION.z,
    );
    this.frontLight.target.position.set(
      GRID_CENTER_POSITION.x + VIEWING_NODE_POSITION.x,
      GRID_CENTER_POSITION.y + VIEWING_NODE_POSITION.y,
      GRID_CENTER_POSITION.z + VIEWING_NODE_POSITION.z,
    );
    this.frontLight.castShadow = false;
    this.scene.add(this.frontLight);
    this.scene.add(this.frontLight.target);
  }

  private setupCamera(): void {
    // Position camera relative to flow block center
    this.camera.position.set(
      GRID_CENTER_POSITION.x + FLOW_VIEWER_CAMERA_POSITION.x,
      GRID_CENTER_POSITION.y + FLOW_VIEWER_CAMERA_POSITION.y,
      GRID_CENTER_POSITION.z + FLOW_VIEWER_CAMERA_POSITION.z,
    );
    this.camera.lookAt(
      GRID_CENTER_POSITION.x + VIEWING_NODE_POSITION.x,
      GRID_CENTER_POSITION.y + VIEWING_NODE_POSITION.y,
      GRID_CENTER_POSITION.z + VIEWING_NODE_POSITION.z,
    );
  }

  private setupEventListeners(): void {
    // Keyboard navigation
    this.keydownListener = (event: KeyboardEvent) => {
      if (this.viewMode === "flow") {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          this.moveToNext();
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          this.moveToPrevious();
        }
      }
    };

    window.addEventListener("keydown", this.keydownListener);
  }

  private checkIfAllTexturesLoaded(): void {
    if (this.texturesLoaded >= this.totalTextures) {
      // All textures have been loaded (or failed to load)
      this.config.onContentLoaded?.();
    }
  }

  public moveToNext(): void {
    if (this.state.currentNodeIndex >= this.state.totalNodes - 1) return;

    const newIndex = this.state.currentNodeIndex + 1;
    this.state.currentNodeIndex = newIndex;

    this.animateCarouselTransition();
    this.config.onNodeChange?.(newIndex);
  }

  public moveToPrevious(): void {
    if (this.state.currentNodeIndex <= 0) return;

    const newIndex = this.state.currentNodeIndex - 1;
    this.state.currentNodeIndex = newIndex;

    this.animateCarouselTransition();
    this.config.onNodeChange?.(newIndex);
  }

  private animateCarouselTransition(): void {
    if (this.mirrorsRef.length === 0) return;

    const mirrors = this.mirrorsRef;
    const currentIndex = this.state.currentNodeIndex;
    const flowBlockPosition = this.flowBlock.position;

    // Animate all mirrors to their new positions relative to the flow block
    mirrors.forEach((mirror, index) => {
      const { targetX, targetZ, targetOpacity } =
        AnimationUtils.calculateTargetPositionAndOpacity(index, currentIndex);

      // Add flow block position to make coordinates relative to the flow block
      const relativeTargetX = flowBlockPosition.x + targetX;
      const relativeTargetZ = flowBlockPosition.z + targetZ;

      AnimationUtils.animateMirror(
        mirror,
        relativeTargetX,
        relativeTargetZ,
        targetOpacity,
        currentIndex,
        () => {},
      );
    });
  }

  public getCurrentNodeDescription(): string {
    return (
      this.config.graphData.nodes[this.state.currentNodeIndex]?.data
        .description || ""
    );
  }

  public getOutgoingEdgeDescription(): string {
    const currentNode =
      this.config.graphData.nodes[this.state.currentNodeIndex];

    if (!currentNode) {
      return "Next";
    }

    const outgoingEdge = this.config.graphData.edges.find(
      (edge) => edge.source === currentNode.id,
    );

    return outgoingEdge ? outgoingEdge.data.description : "Next";
  }

  public getState(): FlowBlockState {
    return { ...this.state };
  }

  public getFlowBlock(): THREE.Mesh {
    return this.flowBlock;
  }

  public getMirrors(): THREE.Group[] {
    return this.mirrorsRef;
  }

  public updateViewMode(viewMode: "flow" | "feature"): void {
    this.viewMode = viewMode;
  }

  public getCurrentFlowBlockPosition(): { x: number; y: number; z: number } {
    return {
      x: this.flowBlock.position.x,
      y: this.flowBlock.position.y,
      z: this.flowBlock.position.z,
    };
  }

  public resetToFirstNode(): void {
    this.state.currentNodeIndex = 0;

    // Update mirror positions and opacities to reflect the reset state
    this.mirrorsRef.forEach((mirror, index) => {
      const { targetX, targetZ, targetOpacity } =
        AnimationUtils.calculateTargetPositionAndOpacity(index, 0); // 0 = first node

      // Get current flow block position
      const flowBlockPosition = this.flowBlock.position;

      // Position mirrors relative to flow block
      const relativeTargetX = flowBlockPosition.x + targetX;
      const relativeTargetZ = flowBlockPosition.z + targetZ;

      // Update position and opacity immediately
      mirror.position.set(relativeTargetX, mirror.position.y, relativeTargetZ);

      // Update opacity
      const imageMesh = mirror.getObjectByName("imageMesh") as THREE.Mesh;
      if (imageMesh && imageMesh.material) {
        (imageMesh.material as THREE.MeshPhongMaterial).opacity = targetOpacity;
      }
    });

    // Notify listeners that the node index has changed
    this.config.onNodeChange?.(0);
  }

  public handleViewModeChange(viewMode: "flow" | "feature"): void {
    if (viewMode === "feature") {
      // Fade out flow block
      AnimationUtils.animateSquareFadeOut(
        this.flowBlock,
        MIRROR_ANIMATION_DURATION,
      );

      // Fade out all mirrors
      this.mirrorsRef.forEach((mirror) => {
        // Animate mirror to current position but with opacity 0
        AnimationUtils.animateMirror(
          mirror,
          mirror.position.x,
          mirror.position.z,
          0, // Fade to transparent
          this.state.currentNodeIndex,
        );
      });

      // Make mirrors invisible after fade-out completes
      setTimeout(() => {
        this.mirrorsRef.forEach((mirror) => {
          mirror.visible = false;
        });
      }, MIRROR_ANIMATION_DURATION);
    } else {
      // Fade in flow block and show mirrors
      AnimationUtils.animateSquareFadeIn(this.flowBlock, OVERLAY_FADE_DURATION);

      // Make mirrors visible and animate to correct positions
      this.mirrorsRef.forEach((mirror) => {
        mirror.visible = true;
      });

      this.animateMirrorsForViewModeTransition();
    }
  }

  public animateMirrorsForViewModeTransition(): void {
    // Animate mirrors to their correct positions for the current carousel state
    this.mirrorsRef.forEach((mirror, index) => {
      const { targetX, targetZ, targetOpacity } =
        AnimationUtils.calculateTargetPositionAndOpacity(
          index,
          this.state.currentNodeIndex,
        );

      // Get current flow block position
      const flowBlockPosition = this.flowBlock.position;

      // Position mirrors relative to flow block
      const relativeTargetX = flowBlockPosition.x + targetX;
      const relativeTargetZ = flowBlockPosition.z + targetZ;

      // Animate to the target position and opacity
      AnimationUtils.animateMirror(
        mirror,
        relativeTargetX,
        relativeTargetZ,
        targetOpacity,
        this.state.currentNodeIndex,
      );
    });
  }

  public updateFlowBlockPosition(newPosition: {
    x: number;
    y: number;
    z: number;
  }): void {
    console.log("Moving flow block to:", newPosition);

    // Update flow block position
    this.flowBlock.position.set(newPosition.x, newPosition.y, newPosition.z);

    // Update all mirrors to be positioned relative to the new flow block position
    // while preserving the current carousel state
    this.mirrorsRef.forEach((mirror, index) => {
      const { targetX, targetZ } =
        AnimationUtils.calculateTargetPositionAndOpacity(
          index,
          this.state.currentNodeIndex,
        );

      // Add flow block position to make coordinates relative to the flow block
      const relativeTargetX = newPosition.x + targetX;
      const relativeTargetZ = newPosition.z + targetZ;

      // Keep the current Y position
      mirror.position.set(relativeTargetX, mirror.position.y, relativeTargetZ);
    });
  }

  public dispose(): void {
    // Remove event listeners
    if (this.keydownListener) {
      window.removeEventListener("keydown", this.keydownListener);
      this.keydownListener = null;
    }

    // Cancel animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Cancel mirror tilt animations
    this.mirrorTiltAnimations.forEach((cancelAnimation) => {
      if (cancelAnimation) {
        cancelAnimation();
      }
    });
    this.mirrorTiltAnimations = [];

    // Cancel animation groups
    if (this.flowModeAnimationGroup) {
      this.flowModeAnimationGroup.cancelAll();
      this.flowModeAnimationGroup = null;
    }

    // Dispose of mirrors (use mirror's own dispose if available for full cleanup)
    this.mirrorsRef.forEach((mirror) => {
      const disposable = mirror as unknown as { dispose?: () => void };
      if (typeof disposable.dispose === "function") {
        try {
          disposable.dispose();
        } catch (_e) {
          // Fallback to manual disposal on error
          mirror.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              if (child.geometry) child.geometry.dispose();
              if (child.material) {
                if (Array.isArray(child.material)) {
                  child.material.forEach((material) => material.dispose());
                } else {
                  child.material.dispose();
                }
              }
            }
          });
        }
      } else {
        mirror.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((material) => material.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
      }

      if (this.scene) {
        this.scene.remove(mirror);
      }
    });

    // Dispose of lights
    if (this.frontLight) {
      if (this.scene) {
        this.scene.remove(this.frontLight);
        this.scene.remove(this.frontLight.target);
      }
      this.frontLight.dispose();
    }

    if (this.ambientLight) {
      if (this.scene) {
        this.scene.remove(this.ambientLight);
      }
      this.ambientLight.dispose();
    }

    if (this.directionalLight) {
      if (this.scene) {
        this.scene.remove(this.directionalLight);
      }
      this.directionalLight.dispose();
    }

    // Dispose of flow block
    if (this.flowBlock) {
      if (this.scene) {
        this.scene.remove(this.flowBlock);
      }
      if (this.flowBlock.geometry) {
        this.flowBlock.geometry.dispose();
      }
      if (this.flowBlock.material) {
        if (Array.isArray(this.flowBlock.material)) {
          this.flowBlock.material.forEach((material) => {
            material.dispose();
          });
        } else {
          this.flowBlock.material.dispose();
        }
      }
    }

    // Clear arrays
    this.mirrors = [];
    this.mirrorsRef = [];
  }
}
