// Camera constants
export const CAMERA_FOV = 75;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 2000;
export const MAX_PIXEL_RATIO = 2;

// Flow viewer camera position
export const FLOW_VIEWER_CAMERA_POSITION = {
  x: 0,
  y: 2,
  z: 13, // VIEWING_DISTANCE
};

// Feature viewer camera position
export const FEATURE_VIEWER_CAMERA_POSITION = {
  x: 0,
  y: 180,
  z: 20, // VIEWING_DISTANCE
};

export const FEATURE_VIEWER_CAMERA_FOCUS_POSITION = {
  x: 0,
  y: 0,
  z: -10,
};

// Feature mode scroll constants
export const FEATURE_SCROLL_SENSITIVITY = 1; // Units per scroll event (reduced from 5)
export const FEATURE_SCROLL_BUFFER = -120; // Buffer space below last grid item (reduced from 50)
export const FEATURE_SCROLL_SMOOTHNESS = 0.1; // Smoothing factor for continuous scrolling (increased from 0.3 to reduce tail)

// Velocity-based scroll constants
export const FEATURE_SCROLL_VELOCITY_MULTIPLIER = 0.2; // How much velocity affects movement
export const FEATURE_SCROLL_VELOCITY_DECAY = 0.95; // How quickly velocity decays (0.95 = 5% decay per frame)
export const FEATURE_SCROLL_MIN_VELOCITY = 0.01; // Minimum velocity before stopping
export const FEATURE_SCROLL_VELOCITY_SAMPLE_TIME = 100; // Time window to calculate velocity (ms)

// Mirror tilt angles (in radians)
export const FLOW_VIEWER_MIRROR_TILT = 0; // No tilt for flow view
export const FEATURE_VIEWER_MIRROR_TILT = -Math.PI / 2; // Tilt backwards completely flat (90 degrees)

// Mirror opacity values
export const FLOW_VIEWER_MIRROR_OPACITY = 1; // Full opacity for flow view
export const FEATURE_VIEWER_MIRROR_OPACITY = 0; // Zero opacity for feature view
