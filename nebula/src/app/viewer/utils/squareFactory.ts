import * as THREE from "three";
import {
  SQUARE_WIDTH,
  SQUARE_DEPTH,
  SQUARE_COLOR,
  SQUARE_OPACITY,
} from "../constants";

export class SquareFactory {
  /**
   * Creates a square plane positioned along the xz plane
   */
  static createSquare(): THREE.Mesh {
    // Create a plane geometry for the square
    const geometry = new THREE.PlaneGeometry(SQUARE_WIDTH, SQUARE_DEPTH);

    // Create material with the specified color and opacity
    const material = new THREE.MeshPhongMaterial({
      color: SQUARE_COLOR,
      transparent: true,
      opacity: SQUARE_OPACITY,
      side: THREE.DoubleSide, // Render both sides of the plane
    });

    // Create the mesh
    const square = new THREE.Mesh(geometry, material);

    // Rotate the plane to lie flat on the xz plane (rotate 90 degrees around x-axis)
    square.rotation.x = -Math.PI / 2;

    // Set the name for easy identification
    square.name = "xzPlaneSquare";

    // Enable shadow receiving but not casting
    square.castShadow = false;
    square.receiveShadow = true;

    return square;
  }

  /**
   * Creates a square plane with shared geometry (for grid optimization)
   */
  static createSquareWithSharedGeometry(): THREE.Mesh {
    // Create a plane geometry for the square
    const geometry = new THREE.PlaneGeometry(SQUARE_WIDTH, SQUARE_DEPTH);

    // Create the mesh without material (will be set externally)
    const square = new THREE.Mesh(geometry);

    // Rotate the plane to lie flat on the xz plane (rotate 90 degrees around x-axis)
    square.rotation.x = -Math.PI / 2;

    // Set the name for easy identification
    square.name = "xzPlaneSquare";

    // Enable shadow receiving but not casting
    square.castShadow = false;
    square.receiveShadow = true;

    return square;
  }
}
