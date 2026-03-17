import * as THREE from "three";
import type { ViewerMode, CommonModeDeps } from "../types/viewerMode";
import { GridFactory, type FeaturesData } from "../utils/gridFactory";
import {
  FEATURE_VIEWER_CAMERA_POSITION,
  FEATURE_VIEWER_CAMERA_FOCUS_POSITION,
  FEATURE_SCROLL_SENSITIVITY,
  FEATURE_SCROLL_SMOOTHNESS,
  FEATURE_SCROLL_VELOCITY_MULTIPLIER,
  FEATURE_SCROLL_VELOCITY_DECAY,
  FEATURE_SCROLL_MIN_VELOCITY,
  FEATURE_SCROLL_VELOCITY_SAMPLE_TIME,
  MIRROR_ANIMATION_DURATION,
  OVERLAY_FADE_DURATION,
  FEATURE_LIGHT_COLOR,
  FEATURE_LIGHT_DISTANCE,
  FEATURE_LIGHT_BEAM_ANGLE,
  FEATURE_LIGHT_PENUMBRA,
  FEATURE_LIGHT_DECAY,
  FEATURE_LIGHT_POSITION,
  FEATURE_LIGHT_TARGET_POSITION,
  FEATURE_LIGHT_INTENSITY,
  FEATURE_LIGHT_INITIAL_INTENSITY,
  FEATURE_LIGHT_RELATIVE_POSITION,
  FEATURE_LIGHT_RELATIVE_TARGET,
} from "../constants";
import { GRID_CENTER_POSITION } from "../constants/geometry";
import { AnimationUtils, AnimationGroup } from "../utils/animationUtils";
import { clampFeatureScrollZ } from "../utils/scrollUtils";

interface FeatureViewerModeOptions {
  featuresData: FeaturesData;
  onFeatureSelect?: (params: {
    gridPosition: { x: number; y: number; z: number };
    featureName: string;
  }) => void;
}

export class FeatureViewerMode implements ViewerMode {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private onFeatureSelect?: FeatureViewerModeOptions["onFeatureSelect"];

  private featureBlocks: THREE.Mesh[] = [];
  private billboards: THREE.Mesh[] = [];
  private featureLight: THREE.SpotLight | null = null;

  private clickListener: ((e: MouseEvent) => void) | null = null;
  private wheelListener: ((e: WheelEvent) => void) | null = null;

  private initialFeatureCameraZ: number = FEATURE_VIEWER_CAMERA_POSITION.z;
  private targetFeatureScrollZ: number = FEATURE_VIEWER_CAMERA_POSITION.z;
  private featureScrollZ: number = FEATURE_VIEWER_CAMERA_POSITION.z;
  private scrollVelocity: number = 0;
  private lastScrollTime: number = 0;
  private scrollDeltaHistory: { time: number; delta: number }[] = [];

  private featureModeAnimationGroup: AnimationGroup | null = null;

  private isActive = false;

  constructor(deps: CommonModeDeps, options: FeatureViewerModeOptions) {
    this.scene = deps.scene;
    this.camera = deps.camera;
    this.renderer = deps.renderer;
    this.onFeatureSelect = options.onFeatureSelect;

    const { blocks, billboards } = GridFactory.createFeatureGrid(
      options.featuresData.features,
    );
    blocks.forEach((b) => this.scene.add(b));
    billboards.forEach((b) => this.scene.add(b));
    this.featureBlocks = blocks;
    this.billboards = billboards;

    // Light for feature mode
    const featureLight = new THREE.SpotLight(
      FEATURE_LIGHT_COLOR,
      FEATURE_LIGHT_INITIAL_INTENSITY,
      FEATURE_LIGHT_DISTANCE,
      FEATURE_LIGHT_BEAM_ANGLE,
      FEATURE_LIGHT_PENUMBRA,
      FEATURE_LIGHT_DECAY,
    );
    featureLight.position.set(
      FEATURE_LIGHT_POSITION.x,
      FEATURE_LIGHT_POSITION.y,
      FEATURE_LIGHT_POSITION.z,
    );
    featureLight.target.position.set(
      FEATURE_LIGHT_TARGET_POSITION.x,
      FEATURE_LIGHT_TARGET_POSITION.y,
      FEATURE_LIGHT_TARGET_POSITION.z,
    );
    featureLight.castShadow = false;
    this.scene.add(featureLight);
    this.scene.add(featureLight.target);
    this.featureLight = featureLight;
  }

  public activate(): void {
    this.isActive = true;

    // Fade in blocks and billboards
    this.featureModeAnimationGroup = new AnimationGroup();
    const group = this.featureModeAnimationGroup;
    this.featureBlocks.forEach((block) => {
      const cancel = AnimationUtils.animateSquareFadeIn(
        block,
        MIRROR_ANIMATION_DURATION,
      );
      group?.addAnimation(cancel);
    });
    this.billboards.forEach((billboard) => {
      const cancel = AnimationUtils.animateSquareFadeIn(
        billboard,
        MIRROR_ANIMATION_DURATION,
      );
      group?.addAnimation(cancel);
    });

    // Turn on feature light
    if (this.featureLight) {
      this.featureLight.intensity = FEATURE_LIGHT_INTENSITY;
    }

    // Click picking
    this.clickListener = (event: MouseEvent) => {
      if (!this.isActive) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, this.camera);
      const intersects = raycaster.intersectObjects(this.featureBlocks, true);
      if (intersects.length > 0) {
        const clickedSquare = intersects[0].object as THREE.Mesh;
        const userData = clickedSquare.userData as {
          featureName?: string;
          gridPosition?: { x: number; y: number; z: number } | null;
        };
        const featureName = userData?.featureName;
        const gridPosition = userData?.gridPosition ?? null;
        // Clicked a feature block
        if (featureName && gridPosition) {
          this.onFeatureSelect?.({ gridPosition, featureName });
        }
      }
    };
    this.renderer.domElement.addEventListener("click", this.clickListener);

    // Wheel scroll momentum
    this.wheelListener = (event: WheelEvent) => {
      if (!this.isActive) return;
      event.preventDefault();

      const currentTime = Date.now();
      const delta = event.deltaY;

      this.scrollDeltaHistory.push({ time: currentTime, delta });
      const cutoffTime = currentTime - FEATURE_SCROLL_VELOCITY_SAMPLE_TIME;
      this.scrollDeltaHistory = this.scrollDeltaHistory.filter(
        (e) => e.time > cutoffTime,
      );
      if (this.scrollDeltaHistory.length > 1) {
        const totalDelta = this.scrollDeltaHistory.reduce(
          (sum, e) => sum + e.delta,
          0,
        );
        const timeSpan =
          this.scrollDeltaHistory[this.scrollDeltaHistory.length - 1].time -
          this.scrollDeltaHistory[0].time;
        this.scrollVelocity = totalDelta / Math.max(timeSpan, 1);
      }
      this.lastScrollTime = currentTime;

      const baseMovement =
        delta > 0 ? FEATURE_SCROLL_SENSITIVITY : -FEATURE_SCROLL_SENSITIVITY;
      const velocityMultiplier =
        Math.abs(this.scrollVelocity) * FEATURE_SCROLL_VELOCITY_MULTIPLIER;
      const velocityMovement = this.scrollVelocity * velocityMultiplier;
      const newTargetZ =
        this.targetFeatureScrollZ + baseMovement + velocityMovement;
      const clampedZ = clampFeatureScrollZ(
        newTargetZ,
        this.initialFeatureCameraZ,
      );
      this.targetFeatureScrollZ = clampedZ;
    };
    window.addEventListener("wheel", this.wheelListener, { passive: false });
  }

  public deactivate(): void {
    this.isActive = false;

    // Turn off feature light
    if (this.featureLight) {
      this.featureLight.intensity = 0;
    }

    // Fade out blocks and billboards
    this.featureModeAnimationGroup = new AnimationGroup();
    const group = this.featureModeAnimationGroup;
    this.featureBlocks.forEach((block) => {
      const cancel = AnimationUtils.animateSquareFadeOut(
        block,
        OVERLAY_FADE_DURATION,
      );
      group?.addAnimation(cancel);
    });
    this.billboards.forEach((billboard) => {
      const cancel = AnimationUtils.animateSquareFadeOut(
        billboard,
        OVERLAY_FADE_DURATION,
      );
      group?.addAnimation(cancel);
    });

    if (this.clickListener) {
      this.renderer.domElement.removeEventListener("click", this.clickListener);
      this.clickListener = null;
    }
    if (this.wheelListener) {
      window.removeEventListener("wheel", this.wheelListener);
      this.wheelListener = null;
    }
  }

  public dispose(): void {
    this.deactivate();

    // Remove and dispose blocks
    this.featureBlocks.forEach((block) => {
      if (this.scene) this.scene.remove(block);
      block.geometry?.dispose?.();
      const mat = block.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    });
    this.featureBlocks = [];

    // Remove and dispose billboards
    this.billboards.forEach((billboard) => {
      if (this.scene) this.scene.remove(billboard);
      billboard.geometry?.dispose?.();
      const mat = billboard.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat)) {
        mat.forEach((m) => {
          const anyMat = m as unknown as { map?: THREE.Texture | null };
          if (anyMat.map) {
            anyMat.map.dispose();
            anyMat.map = null;
          }
          m.dispose();
        });
      } else {
        const anyMat = mat as unknown as { map?: THREE.Texture | null };
        if (anyMat.map) {
          anyMat.map.dispose();
          anyMat.map = null;
        }
        mat.dispose();
      }
    });
    this.billboards = [];

    // Remove and dispose light
    if (this.featureLight) {
      if (this.scene) {
        this.scene.remove(this.featureLight);
        this.scene.remove(this.featureLight.target);
      }
      this.featureLight.dispose();
      this.featureLight = null;
    }
  }

  public onResize(): void {
    // nothing specific; camera updated by hub
  }

  public tick(_deltaMs: number): void {
    if (!this.isActive) return;
    void _deltaMs;

    // Momentum decay
    if (Math.abs(this.scrollVelocity) > FEATURE_SCROLL_MIN_VELOCITY) {
      const velocityMovement =
        this.scrollVelocity * FEATURE_SCROLL_VELOCITY_MULTIPLIER;
      let targetZ = this.targetFeatureScrollZ + velocityMovement;
      targetZ = clampFeatureScrollZ(targetZ, this.initialFeatureCameraZ);
      this.targetFeatureScrollZ = targetZ;
      this.scrollVelocity *= FEATURE_SCROLL_VELOCITY_DECAY;
    } else {
      this.scrollVelocity = 0;
    }

    // Ease camera Z
    const currentZ = this.camera.position.z;
    const newZ =
      currentZ +
      (this.targetFeatureScrollZ - currentZ) * FEATURE_SCROLL_SMOOTHNESS;
    this.camera.position.z = newZ;
    this.featureScrollZ = newZ;

    // Update light to follow camera
    if (this.featureLight) {
      const cameraX = this.camera.position.x;
      const cameraY = this.camera.position.y;
      const cameraZ = newZ;
      const lightX = cameraX + FEATURE_LIGHT_RELATIVE_POSITION.x;
      const lightY = cameraY + FEATURE_LIGHT_RELATIVE_POSITION.y;
      const lightZ = cameraZ + FEATURE_LIGHT_RELATIVE_POSITION.z;
      const targetX = cameraX + FEATURE_LIGHT_RELATIVE_TARGET.x;
      const targetY = cameraY + FEATURE_LIGHT_RELATIVE_TARGET.y;
      const targetZ = cameraZ + FEATURE_LIGHT_RELATIVE_TARGET.z;
      this.featureLight.position.set(lightX, lightY, lightZ);
      this.featureLight.target.position.set(targetX, targetY, targetZ);
    }
  }

  public setScrollFromFlowZ(flowZ: number): void {
    const firstFeatureBlockZ = GRID_CENTER_POSITION.z;
    const zOffset = flowZ - firstFeatureBlockZ;
    const alignedFeatureCameraZ = FEATURE_VIEWER_CAMERA_POSITION.z + zOffset;
    // Keep original clamp (initialFeatureCameraZ) fixed after initial setup
    this.targetFeatureScrollZ = alignedFeatureCameraZ;
    this.featureScrollZ = alignedFeatureCameraZ;

    // Aim camera to feature focus point with same Z offset
    const initialFeatureFocusZ =
      FEATURE_VIEWER_CAMERA_FOCUS_POSITION.z + zOffset;
    this.camera.lookAt(
      FEATURE_VIEWER_CAMERA_FOCUS_POSITION.x,
      FEATURE_VIEWER_CAMERA_FOCUS_POSITION.y,
      initialFeatureFocusZ,
    );
  }

  public resetScroll(): void {
    this.initialFeatureCameraZ = FEATURE_VIEWER_CAMERA_POSITION.z;
    this.targetFeatureScrollZ = FEATURE_VIEWER_CAMERA_POSITION.z;
    this.featureScrollZ = FEATURE_VIEWER_CAMERA_POSITION.z;
    this.scrollVelocity = 0;
    this.scrollDeltaHistory = [];
  }
}
