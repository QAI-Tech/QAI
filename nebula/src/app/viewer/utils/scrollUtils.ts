import {
  FEATURE_VIEWER_CAMERA_POSITION,
  FEATURE_SCROLL_BUFFER,
} from "../constants/camera";
import { GRID_START_Z, GRID_ROW_SPACING } from "../constants/geometry";
import { DEFAULT_TEST_DATA } from "../config";

/**
 * Calculates the scroll boundaries for feature mode camera
 * @param dynamicCameraZ Optional dynamic camera Z position to use as upper limit
 * @returns Object with min and max Z values for camera scrolling
 */
export function calculateFeatureScrollBoundaries(dynamicCameraZ?: number) {
  const totalFeatures = DEFAULT_TEST_DATA.features.features.length;
  const leftColumnCount = Math.ceil(totalFeatures / 2);
  const rightColumnCount = totalFeatures - leftColumnCount;

  // Find the maximum row index (0-based)
  const maxRowIndex = Math.max(leftColumnCount - 1, rightColumnCount - 1);

  // Calculate the Z position of the last grid item
  const lastGridItemZ = GRID_START_Z + maxRowIndex * GRID_ROW_SPACING;

  // Upper limit is the dynamic camera position or the default feature viewer camera position
  const upperLimit =
    dynamicCameraZ !== undefined
      ? dynamicCameraZ
      : FEATURE_VIEWER_CAMERA_POSITION.z;

  // Lower limit is the last grid item Z position minus buffer
  const lowerLimit = lastGridItemZ - FEATURE_SCROLL_BUFFER;

  return {
    upperLimit,
    lowerLimit,
    lastGridItemZ,
    maxRowIndex,
  };
}

/**
 * Clamps a Z value between the feature scroll boundaries
 * @param zValue The Z value to clamp
 * @param dynamicCameraZ Optional dynamic camera Z position to use as upper limit
 * @returns The clamped Z value
 */
export function clampFeatureScrollZ(
  zValue: number,
  dynamicCameraZ?: number,
): number {
  const { upperLimit, lowerLimit } =
    calculateFeatureScrollBoundaries(dynamicCameraZ);
  const clampedValue = Math.max(lowerLimit, Math.min(upperLimit, zValue));

  return clampedValue;
}
