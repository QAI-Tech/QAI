import * as THREE from "three";

export interface DisposableMirrorGroup extends THREE.Group {
  dispose: () => void;
}
