import * as THREE from "three";
import {
  FOREGROUND_OPACITY,
  FIRST_BACKGROUND_OPACITY,
  SECOND_BACKGROUND_OPACITY,
  SUBSEQUENT_BACKGROUND_OPACITY,
  VIEWING_NODE_POSITION,
  FIRST_BACKGROUND_NODE_X,
  FIRST_BACKGROUND_NODE_Z,
  SECOND_BACKGROUND_NODE_X,
  SECOND_BACKGROUND_NODE_Z,
  DISTANCE_BETWEEN_PARALLEL_BACKGROUND_NODES,
  TRANSITION_DURATION,
  EASING_POWER,
} from "../constants";

/**
 * Animation Group for managing multiple synchronized animations
 */
export class AnimationGroup {
  private animations: (() => void)[] = [];
  private isCancelled = false;

  /**
   * Adds an animation to the group
   */
  addAnimation(cancelFunction: () => void): void {
    this.animations.push(cancelFunction);
  }

  /**
   * Cancels all animations in the group
   */
  cancelAll(): void {
    this.isCancelled = true;
    this.animations.forEach((cancelAnimation) => {
      if (cancelAnimation) {
        cancelAnimation();
      }
    });
    this.animations = [];
  }

  /**
   * Checks if the group has been cancelled
   */
  getCancelled(): boolean {
    return this.isCancelled;
  }

  /**
   * Clears the animation list
   */
  clear(): void {
    this.animations = [];
  }
}

export class AnimationUtils {
  /**
   * Calculates opacity based on node position relative to current index
   */
  static calculateNodeOpacity(nodeIndex: number, currentIndex: number): number {
    if (nodeIndex === currentIndex) {
      return FOREGROUND_OPACITY;
    } else if (
      nodeIndex === currentIndex + 1 ||
      nodeIndex === currentIndex - 1
    ) {
      return FIRST_BACKGROUND_OPACITY;
    } else if (
      nodeIndex === currentIndex + 2 ||
      nodeIndex === currentIndex - 2
    ) {
      return SECOND_BACKGROUND_OPACITY;
    } else {
      return SUBSEQUENT_BACKGROUND_OPACITY;
    }
  }

  /**
   * Calculates target position and opacity for a mirror based on its index and current viewing index
   */
  static calculateTargetPositionAndOpacity(
    index: number,
    currentIndex: number,
  ): { targetX: number; targetZ: number; targetOpacity: number } {
    let targetX = 0;
    let targetZ = 0;
    let targetOpacity = 1.0;

    if (index === currentIndex) {
      // Current viewing node
      targetX = VIEWING_NODE_POSITION.x;
      targetZ = VIEWING_NODE_POSITION.z;
      targetOpacity = FOREGROUND_OPACITY;
    } else if (index === currentIndex + 1) {
      // Next node: higher X, lower Z
      targetX = FIRST_BACKGROUND_NODE_X;
      targetZ = FIRST_BACKGROUND_NODE_Z;
      targetOpacity = FIRST_BACKGROUND_OPACITY;
    } else if (index === currentIndex + 2) {
      // Third node: even higher X, even lower Z
      targetX = SECOND_BACKGROUND_NODE_X;
      targetZ = SECOND_BACKGROUND_NODE_Z;
      targetOpacity = SECOND_BACKGROUND_OPACITY;
    } else if (index > currentIndex + 2) {
      // Subsequent nodes: continue with lower and lower Z
      const zOffset =
        (index - currentIndex - 2) * DISTANCE_BETWEEN_PARALLEL_BACKGROUND_NODES;
      targetX = SECOND_BACKGROUND_NODE_X;
      targetZ = SECOND_BACKGROUND_NODE_Z - zOffset;
      targetOpacity = SUBSEQUENT_BACKGROUND_OPACITY;
    } else {
      // Previous nodes: opposite X axis (negative)
      if (index === currentIndex - 1) {
        targetX = -FIRST_BACKGROUND_NODE_X;
        targetZ = FIRST_BACKGROUND_NODE_Z;
        targetOpacity = FIRST_BACKGROUND_OPACITY;
      } else if (index === currentIndex - 2) {
        targetX = -SECOND_BACKGROUND_NODE_X;
        targetZ = SECOND_BACKGROUND_NODE_Z;
        targetOpacity = SECOND_BACKGROUND_OPACITY;
      } else {
        const zOffset =
          (currentIndex - index - 2) *
          DISTANCE_BETWEEN_PARALLEL_BACKGROUND_NODES;
        targetX = -SECOND_BACKGROUND_NODE_X;
        targetZ = SECOND_BACKGROUND_NODE_Z - zOffset;
        targetOpacity = SUBSEQUENT_BACKGROUND_OPACITY;
      }
    }

    return { targetX, targetZ, targetOpacity };
  }

  /**
   * Applies easeOutCubic easing to a progress value
   */
  static easeOutCubic(progress: number): number {
    return 1 - Math.pow(1 - progress, EASING_POWER);
  }

  /**
   * Applies easeInOutCubic easing to a progress value
   * Starts slow, speeds up in the middle, then slows down at the end
   */
  static easeInOutCubic(progress: number): number {
    if (progress < 0.5) {
      // First half: ease in (slow to fast)
      return 4 * progress * progress * progress;
    } else {
      // Second half: ease out (fast to slow)
      const t = 2 * progress - 2;
      return 0.5 * t * t * t + 1;
    }
  }

  /**
   * Applies smooth overshoot easing to a progress value
   * Creates a smooth transition with a slight overshoot and settle
   */
  static smoothOvershoot(progress: number): number {
    // Use a combination of easeOutBack and easeOutElastic for smooth overshoot
    const overshoot = 1.70158; // Overshoot factor
    const t = progress - 1;
    return t * t * ((overshoot + 1) * t + overshoot) + 1;
  }

  /**
   * Animates a mirror to its target position and opacity
   */
  static animateMirror(
    mirror: THREE.Group,
    targetX: number,
    targetZ: number,
    targetOpacity: number,
    currentIndex: number,
    onComplete?: () => void,
  ): void {
    // Get current opacity from the image material
    const imageMesh = mirror.getObjectByName("imageMesh") as THREE.Mesh;
    const currentOpacity = imageMesh
      ? (imageMesh.material as THREE.MeshPhongMaterial).opacity
      : 1.0;

    // Smooth transition to new position and opacity
    const startPosition = mirror.position.clone();
    const targetPosition = new THREE.Vector3(
      targetX,
      startPosition.y, // Keep current Y position
      targetZ,
    );

    const startTime = Date.now();
    const duration = TRANSITION_DURATION;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = this.easeOutCubic(progress);

      mirror.position.lerpVectors(startPosition, targetPosition, easedProgress);

      // Animate opacity
      if (imageMesh) {
        const newOpacity =
          currentOpacity + (targetOpacity - currentOpacity) * easedProgress;
        (imageMesh.material as THREE.MeshPhongMaterial).opacity = newOpacity;
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        onComplete?.();
      }
    };

    animate();
  }

  /**
   * Animates camera transition between flow and feature viewer positions
   */
  static animateCameraTransition(
    camera: THREE.PerspectiveCamera,
    targetPosition: THREE.Vector3,
    targetFocus: THREE.Vector3,
    duration: number = 1000,
    onComplete?: () => void,
  ): () => void {
    const startPosition = camera.position.clone();

    // Get current focus point by calculating where camera is currently looking
    const startFocus = new THREE.Vector3();
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    // Calculate current focus point based on camera position and direction
    // Use a reasonable distance that matches the typical viewing distance
    const focusDistance = 4; // Match the typical z-distance used in camera positions
    startFocus
      .copy(camera.position)
      .add(direction.multiplyScalar(focusDistance));

    const startTime = Date.now();
    let animationFrameId: number | null = null;
    let isCancelled = false;

    const animate = () => {
      if (isCancelled) return;

      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = this.easeInOutCubic(progress);

      // Interpolate camera position
      camera.position.lerpVectors(startPosition, targetPosition, easedProgress);

      // Interpolate focus point
      const currentFocus = new THREE.Vector3();
      currentFocus.lerpVectors(startFocus, targetFocus, easedProgress);

      // Update camera lookAt with interpolated focus point
      camera.lookAt(currentFocus);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        onComplete?.();
      }
    };

    animate();

    // Return cancel function
    return () => {
      isCancelled = true;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }

  /**
   * Animates overlay fade out with quadratic easing (slowly first, then fast)
   */
  static animateOverlayFadeOut(
    onOpacityChange: (opacity: number) => void,
    startOpacity: number = 1,
    duration: number = 1000,
    onComplete?: () => void,
  ): () => void {
    const startTime = Date.now();
    let animationFrameId: number | null = null;
    let isCancelled = false;

    const animate = () => {
      if (isCancelled) return;

      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Quadratic fade out: opacity = startOpacity * (1 - progress)^2
      const opacity = startOpacity * Math.pow(1 - progress, 2);

      onOpacityChange(opacity);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        onComplete?.();
      }
    };

    animate();

    // Return cancel function
    return () => {
      isCancelled = true;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }

  /**
   * Animates mirror tilt based on camera view mode
   */
  static animateMirrorTilt(
    mirror: THREE.Group,
    targetTiltAngle: number,
    targetOpacity: number,
    startRotation?: number,
    startOpacity?: number,
    duration: number = 3000,
    onComplete?: () => void,
  ): () => void {
    const currentRotation =
      startRotation !== undefined ? startRotation : mirror.rotation.x;
    const currentOpacity = startOpacity !== undefined ? startOpacity : 1;
    const startTime = Date.now();
    let animationFrameId: number | null = null;
    let isCancelled = false;

    const animate = () => {
      if (isCancelled) return;

      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = this.easeOutCubic(progress); // Use cubic easing

      // Interpolate rotation around X-axis (tilt backwards)
      mirror.rotation.x =
        currentRotation + (targetTiltAngle - currentRotation) * easedProgress;

      // Interpolate opacity (alpha)
      const newOpacity =
        currentOpacity + (targetOpacity - currentOpacity) * easedProgress;

      // Apply opacity to all mesh materials in the mirror group
      mirror.traverse((child) => {
        if (
          child instanceof THREE.Mesh &&
          child.material instanceof THREE.MeshPhongMaterial
        ) {
          // Apply opacity to image materials
          child.material.opacity = newOpacity;
          // Disable shadow receiving when they become very transparent
          if (newOpacity < 0.1) {
            child.receiveShadow = false;
          } else {
            child.receiveShadow = true;
          }
          child.material.transparent = true;
        }
      });

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        onComplete?.();
      }
    };

    animate();

    // Return cancel function
    return () => {
      isCancelled = true;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }

  /**
   * Animates overlay fade in with linear easing
   */
  static animateOverlayFadeIn(
    onOpacityChange: (opacity: number) => void,
    startOpacity: number = 0,
    duration: number = 1000,
    onComplete?: () => void,
  ): () => void {
    const startTime = Date.now();
    let animationFrameId: number | null = null;
    let isCancelled = false;

    const animate = () => {
      if (isCancelled) return;

      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Linear fade in: opacity = startOpacity + (1 - startOpacity) * progress
      const opacity = startOpacity + (1 - startOpacity) * progress;

      onOpacityChange(opacity);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        onComplete?.();
      }
    };

    animate();

    // Return cancel function
    return () => {
      isCancelled = true;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }

  /**
   * Animates light intensity fade out
   */
  static animateLightFadeOut(
    lights: (THREE.Light | null)[],
    startIntensities: number[],
    duration: number = 3000,
    onComplete?: () => void,
  ): () => void {
    const startTime = Date.now();
    let animationFrameId: number | null = null;
    let isCancelled = false;

    const animate = () => {
      if (isCancelled) return;

      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out fade out: intensity = startIntensity * (1 - easedProgress)
      const easedProgress = this.easeOutCubic(progress);
      lights.forEach((light, index) => {
        if (light) {
          const intensity = startIntensities[index] * (1 - easedProgress);
          light.intensity = intensity;
        }
      });

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        onComplete?.();
      }
    };

    animate();

    // Return cancel function
    return () => {
      isCancelled = true;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }

  /**
   * Animates light intensity fade in
   */
  static animateLightFadeIn(
    lights: (THREE.Light | null)[],
    targetIntensities: number[],
    duration: number = 3000,
    onComplete?: () => void,
  ): () => void {
    const startTime = Date.now();
    let animationFrameId: number | null = null;
    let isCancelled = false;

    const startIntensities = lights.map((light) => light?.intensity || 0);

    const animate = () => {
      if (isCancelled) return;

      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Use ease-out for smooth transition: starts fast, slows down at the end
      const easedProgress = this.easeOutCubic(progress);

      // Ease-out fade in: intensity = startIntensity + (targetIntensity - startIntensity) * easedProgress
      lights.forEach((light, index) => {
        if (light) {
          const intensity =
            startIntensities[index] +
            (targetIntensities[index] - startIntensities[index]) *
              easedProgress;
          light.intensity = intensity;
        }
      });

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        onComplete?.();
      }
    };

    animate();

    // Return cancel function
    return () => {
      isCancelled = true;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }

  /**
   * Animates square opacity fade out
   */
  static animateSquareFadeOut(
    square: THREE.Mesh,
    duration: number = 1500,
    onComplete?: () => void,
  ): () => void {
    const startTime = Date.now();
    let animationFrameId: number | null = null;
    let isCancelled = false;

    const startOpacity = (square.material as THREE.MeshPhongMaterial).opacity;

    const animate = () => {
      if (isCancelled) return;

      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = this.easeOutCubic(progress);

      const newOpacity = startOpacity * (1 - easedProgress);
      (square.material as THREE.MeshPhongMaterial).opacity = newOpacity;

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        onComplete?.();
      }
    };

    animate();

    // Return cancel function
    return () => {
      isCancelled = true;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }

  /**
   * Animates square opacity fade in
   */
  static animateSquareFadeIn(
    square: THREE.Mesh,
    duration: number = 1500,
    onComplete?: () => void,
  ): () => void {
    const startTime = Date.now();
    let animationFrameId: number | null = null;
    let isCancelled = false;

    const startOpacity = (square.material as THREE.MeshPhongMaterial).opacity;
    const targetOpacity = 0.8; // SQUARE_OPACITY

    const animate = () => {
      if (isCancelled) return;

      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = this.easeOutCubic(progress);

      const newOpacity =
        startOpacity + (targetOpacity - startOpacity) * easedProgress;
      (square.material as THREE.MeshPhongMaterial).opacity = newOpacity;

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        onComplete?.();
      }
    };

    animate();

    // Return cancel function
    return () => {
      isCancelled = true;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }
}
