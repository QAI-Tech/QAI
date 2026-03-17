import * as THREE from "three";

export interface ViewerMode {
  activate(): void;
  deactivate(): void;
  dispose(): void;
  onResize(): void;
  tick(deltaMs: number): void;
}

export interface CommonModeDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
}
