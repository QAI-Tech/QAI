// Mirror geometry scaling constants
export const MIRROR_HEIGHT = 4; // Fixed height
export const MIRROR_DEPTH = 0.1;
export const VIEWING_DISTANCE = 4;

// Image scaling constants
export const IMAGE_SCALE_FACTOR = 0.95;
export const IMAGE_DEPTH_SCALE = 0.8;

// Material properties constants
export const IMAGE_SHININESS = -100;

// Render order constants
export const IMAGE_RENDER_ORDER = 1;

// Node positioning constants
export const VIEWING_NODE_POSITION = {
  x: 0,
  y: 2,
  z: 9,
};
export const FIRST_BACKGROUND_NODE_X = 4;
export const FIRST_BACKGROUND_NODE_Z = 6;
export const SECOND_BACKGROUND_NODE_X = 8;
export const SECOND_BACKGROUND_NODE_Z = 3;
export const DISTANCE_BETWEEN_PARALLEL_BACKGROUND_NODES = 3;

export const FEATURE_GRID_X_OFFSET = 20;
export const FEATURE_GRID_Z_OFFSET = -50; // Fixed typo

// Grid layout constants
export const GRID_COLUMN_SPACING = 100; // Space between columns
export const GRID_ROW_SPACING = -100; // Space between rows
export const GRID_START_X_LEFT = -GRID_COLUMN_SPACING; // Left column X position
export const GRID_START_X_RIGHT = GRID_COLUMN_SPACING; // Right column X position
export const GRID_START_Z = -50; // Starting Z position for grid

// Square geometry constants
export const SQUARE_WIDTH = 80; // 80 units wide (x-axis: -40 to +40) - doubled from 40
export const SQUARE_DEPTH = 40; // 40 units deep (z-axis: 0 to -40)
export const SQUARE_HEIGHT = 0.1; // Thin square for xz plane
export const SQUARE_COLOR = 0xaaaaaa; // Light gray color
export const SQUARE_OPACITY = 1; // Increased opacity for better visibility (was 0.5)

// Feature light constants
export const FEATURE_LIGHT_COLOR = 0x9370db; // Medium purple (medium slate blue)
export const FEATURE_LIGHT_DISTANCE = 2000; // Much larger distance to cover the entire grid
export const FEATURE_LIGHT_BEAM_ANGLE = Math.PI / 3; // 60 degrees - wider beam
export const FEATURE_LIGHT_PENUMBRA = 0.3; // Tighter penumbra
export const FEATURE_LIGHT_DECAY = 0; // No decay for better coverage
export const FEATURE_LIGHT_POSITION = {
  x: 0, // Center of the grid
  y: 2000, // Much higher position to cover the entire grid
  z: 100, // At camera level
};
export const FEATURE_LIGHT_TARGET_POSITION = {
  x: 0, // Center of the grid
  y: 0, // Point at the center of the grid
  z: -1000, // Point towards the middle of the grid
};
export const FEATURE_LIGHT_INTENSITY = 25.0; // Full intensity for feature mode
export const FEATURE_LIGHT_INITIAL_INTENSITY = 0.0; // Start with visible intensity for immediate effect

// Feature light relative position to camera (will move with camera)
export const FEATURE_LIGHT_RELATIVE_POSITION = {
  x: 0, // Same X as camera
  y: 300, // 100 (camera Y) - 8 (light Y) = 92 units below camera
  z: 0, // 60 (camera Z) - (-10) (light Z) = 70 units in front of camera
};
export const FEATURE_LIGHT_RELATIVE_TARGET = {
  x: 0, // Same X as camera
  y: -75, // 100 (camera Y) - 25 (focus Y) = 75 units below camera
  z: 10, // 60 (camera Z) - (-70) (focus Z) = 130 units in front of camera, but we want it closer
};

// Grid center position constants
export const GRID_CENTER_POSITION = {
  x: 0, // Center of the grid
  y: 0, // 2 units above the ground (original is at y: -2)
  z: -10, // Starting Z position for the grid
};
