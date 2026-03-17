// @ts-nocheck
/**
 * Point interface for convex hull calculations
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Calculate cross product of vectors OA and OB
 * Returns positive if OAB makes a counter-clockwise turn
 */
function crossProduct(O: Point, A: Point, B: Point): number {
  return (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
}

/**
 * Andrew's algorithm for computing convex hull
 * Time complexity: O(n log n)
 */
export function convexHull(points: Point[]): Point[] {
  if (points.length <= 3) {
    return points;
  }

  // Sort points lexicographically (first by x-coordinate, then by y-coordinate)
  const sortedPoints = [...points].sort((a, b) => {
    if (a.x === b.x) return a.y - b.y;
    return a.x - b.x;
  });

  // Build lower hull
  const lower: Point[] = [];
  for (const point of sortedPoints) {
    while (
      lower.length >= 2 &&
      crossProduct(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }

  // Build upper hull
  const upper: Point[] = [];
  for (let i = sortedPoints.length - 1; i >= 0; i--) {
    const point = sortedPoints[i];
    while (
      upper.length >= 2 &&
      crossProduct(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }

  // Remove last point of each half because it's repeated
  lower.pop();
  upper.pop();

  return [...lower, ...upper];
}

/**
 * Get corner points of a node with margin
 */
export function getNodeCornerPoints(node: any, margin: number = 20): Point[] {
  const x = node.position.x;
  const y = node.position.y;

  // Try multiple ways to get dimensions, with sensible defaults
  let width = 100; // default width
  let height = 50; // default height

  // Check measured dimensions first (most accurate)
  if (node.measured?.width && node.measured?.height) {
    width = node.measured.width;
    height = node.measured.height;
  }
  // Fall back to style dimensions
  else if (node.style?.width && node.style?.height) {
    width =
      typeof node.style.width === "string"
        ? parseFloat(node.style.width)
        : node.style.width;
    height =
      typeof node.style.height === "string"
        ? parseFloat(node.style.height)
        : node.style.height;
  }
  // Fall back to data dimensions if available
  else if (node.data?.width && node.data?.height) {
    width = node.data.width;
    height = node.data.height;
  }

  return [
    { x: x - margin, y: y - margin }, // top-left
    { x: x + width + margin, y: y - margin }, // top-right
    { x: x + width + margin, y: y + height + margin }, // bottom-right
    { x: x - margin, y: y + height + margin }, // bottom-left
  ];
}

/**
 * Convert hull points to SVG path string
 */
export function hullToSVGPath(hull: Point[]): string {
  if (hull.length < 3) return "";

  const pathCommands = hull.map((point, index) => {
    const command = index === 0 ? "M" : "L";
    return `${command} ${point.x} ${point.y}`;
  });

  pathCommands.push("Z"); // Close the path
  return pathCommands.join(" ");
}
