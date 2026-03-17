import * as THREE from "three";
import {
  SQUARE_COLOR,
  GRID_ROW_SPACING,
  GRID_START_X_LEFT,
  GRID_START_X_RIGHT,
  GRID_CENTER_POSITION,
} from "../constants/geometry";
import { SquareFactory } from "./squareFactory";
import { BillboardFactory } from "./billboardFactory";

export interface Feature {
  id: string;
  name: string;
  nodeIds: string[];
  isCollapsed?: boolean;
  flowsOriginationCount?: number;
}

export interface FeaturesData {
  features: Feature[];
  exportedAt: string;
}

export interface GridPosition {
  x: number;
  y: number;
  z: number;
  column: "left" | "right" | "center";
  row: number;
}

export interface GridLight {
  light: THREE.SpotLight;
  target: THREE.Object3D;
}

export class GridFactory {
  /**
   * Calculates grid positions for a given number of features
   * Creates a row-based grid where:
   * - First row: 1 block in center
   * - All subsequent rows: 2 blocks (left and right columns)
   */
  static calculateGridPositions(features: Feature[]): GridPosition[] {
    const positions: GridPosition[] = [];
    const totalFeatures = features.length;

    let featureIndex = 0;
    let rowIndex = 0;

    // First row: single block in center
    if (featureIndex < totalFeatures) {
      positions.push({
        x: GRID_CENTER_POSITION.x,
        y: GRID_CENTER_POSITION.y,
        z: GRID_CENTER_POSITION.z + rowIndex * GRID_ROW_SPACING,
        column: "center",
        row: rowIndex,
      });
      featureIndex++;
      rowIndex++;
    }

    // All subsequent rows: two blocks per row (left and right columns)
    while (featureIndex < totalFeatures) {
      // Left column block
      if (featureIndex < totalFeatures) {
        positions.push({
          x: GRID_START_X_LEFT,
          y: GRID_CENTER_POSITION.y,
          z: GRID_CENTER_POSITION.z + rowIndex * GRID_ROW_SPACING,
          column: "left",
          row: rowIndex,
        });
        featureIndex++;
      }

      // Right column block
      if (featureIndex < totalFeatures) {
        positions.push({
          x: GRID_START_X_RIGHT,
          y: GRID_CENTER_POSITION.y,
          z: GRID_CENTER_POSITION.z + rowIndex * GRID_ROW_SPACING,
          column: "right",
          row: rowIndex,
        });
        featureIndex++;
      }

      rowIndex++;
    }

    return positions;
  }

  /**
   * Creates a grid of blocks for all features with billboards
   */
  static createFeatureGrid(features: Feature[]): {
    blocks: THREE.Mesh[];
    billboards: THREE.Mesh[];
  } {
    const blocks: THREE.Mesh[] = [];
    const billboards: THREE.Mesh[] = [];
    const positions = this.calculateGridPositions(features);

    // Create a shared material to reduce texture units
    const sharedMaterial = new THREE.MeshPhongMaterial({
      color: SQUARE_COLOR,
      transparent: true,
      opacity: 0, // Start hidden in flow mode
      side: THREE.DoubleSide,
    });

    features.forEach((feature, index) => {
      const position = positions[index];
      if (!position) {
        console.error(
          `GridFactory: No position found for feature ${index} - "${feature.name}"`,
        );
        return;
      }

      const block = SquareFactory.createSquareWithSharedGeometry();

      // Position the block
      block.position.set(position.x, position.y, position.z);

      // Use shared material to reduce texture units
      block.material = sharedMaterial;

      // Set a unique name for each feature block
      block.name = `featureBlock_${feature.id}`;

      // Store feature data as userData for potential future use
      block.userData = {
        featureId: feature.id,
        featureName: feature.name,
        gridPosition: position,
      };

      blocks.push(block);

      // Create billboard for this feature
      const billboard = BillboardFactory.createBillboard(
        feature.name,
        feature.flowsOriginationCount,
      );

      // Position the billboard slightly above the feature block so it's visible
      billboard.position.set(position.x, position.y + 0.1, position.z);

      // Set a unique name for each billboard
      billboard.name = `billboard_${feature.id}`;

      // Store feature data as userData for potential future use
      billboard.userData = {
        featureId: feature.id,
        featureName: feature.name,
        flowsOriginationCount: feature.flowsOriginationCount,
        gridPosition: position,
      };

      billboards.push(billboard);
    });

    return { blocks, billboards };
  }

  /**
   * Creates a single light to illuminate the entire grid
   */
  static createGridLight(): GridLight {
    // Calculate grid center
    const gridLightX = 0;
    const gridLightZ = -80;
    const gridLightY = 0;

    // Create spot light positioned above the grid center
    const light = new THREE.SpotLight(
      0xffffff, // White light
      0, // Start off (will be controlled by view mode)
      0, // Large distance to cover the entire grid
      Math.PI / 2, // 90 degree beam angle for wide coverage
      0.3, // Penumbra for soft edges
      0, // Decay
    );

    // Position light above the grid center
    light.position.set(gridLightX, gridLightY + 60, gridLightZ);

    // Create target at the grid center
    const target = new THREE.Object3D();
    target.position.set(gridLightX, gridLightY, gridLightZ);

    // Set the light's target
    light.target = target;

    // Disable shadows to reduce texture units
    light.castShadow = false;

    // Set unique name for the light
    light.name = "gridLight";
    target.name = "gridLightTarget";

    return {
      light,
      target,
    };
  }
}
