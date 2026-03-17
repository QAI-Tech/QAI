// @ts-nocheck
import { Node } from "@xyflow/react";

// Function to calculate the closest connection handles between two nodes
export const getClosestConnectionHandles = (
  sourceNode: Node,
  targetNode: Node,
) => {
  const nodeWidth = 144; // Fixed width from our CustomNode
  const nodeHeight = 100; // Approximate height

  const sourceCenter = {
    x: sourceNode.position.x + nodeWidth / 2,
    y: sourceNode.position.y + nodeHeight / 2,
  };

  const targetCenter = {
    x: targetNode.position.x + nodeWidth / 2,
    y: targetNode.position.y + nodeHeight / 2,
  };

  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;

  // Determine the best connection points based on direction
  let sourceHandle: string;
  let targetHandle: string;

  // Use the larger absolute difference to determine primary direction
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal connection is preferred
    if (dx > 0) {
      // Target is to the right of source
      sourceHandle = "right-source";
      targetHandle = "left-target";
    } else {
      // Target is to the left of source
      sourceHandle = "left-source";
      targetHandle = "right-target";
    }
  } else {
    // Vertical connection is preferred
    if (dy > 0) {
      // Target is below source
      sourceHandle = "bottom-source";
      targetHandle = "top-target";
    } else {
      // Target is above source
      sourceHandle = "top-source";
      targetHandle = "bottom-target";
    }
  }

  return { sourceHandle, targetHandle };
};
