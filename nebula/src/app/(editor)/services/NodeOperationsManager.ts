import { Node } from "@xyflow/react";
import { CustomNodeData } from "../types/graphHandlers";
import {
  ConsoleCollaborationEvents,
  CollaborationEvents,
  Position,
} from "../types/collaborationEvents";

/**
 * Centralized manager for all node operations that interfaces with the data structure
 * and handles collaboration events consistently across the application.
 */
export class NodeOperationsManager {
  private collaborationEvents: CollaborationEvents;
  private setNodes: React.Dispatch<React.SetStateAction<Node[]>>;

  constructor(
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
    collaborationEvents?: CollaborationEvents,
  ) {
    this.setNodes = setNodes;
    this.collaborationEvents =
      collaborationEvents || new ConsoleCollaborationEvents();
  }

  /**
   * Create new nodes and emit collaboration events
   */
  createNodes(newNodes: Node[], userId?: string): void {
    // Prepare batch data for collaboration events
    const batchNodesData = newNodes.map((node) => ({
      nodeId: node.id,
      position: node.position,
      data: node.data as unknown as CustomNodeData,
    }));

    // Emit batch collaboration event
    this.collaborationEvents.createNodes(batchNodesData, userId);

    // Add originalPosition to node data for tracking position changes
    const nodesWithOriginalPosition = newNodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        originalPosition: node.position,
      },
    }));

    // Add nodes to the state
    this.setNodes((nds) => [...nds, ...nodesWithOriginalPosition]);
  }

  /**
   * Delete nodes by IDs and emit collaboration events
   */
  deleteNodes(nodeIds: string[], userId?: string): void {
    this.setNodes((currentNodes) => {
      // Find nodes to delete and prepare batch data for collaboration events
      const nodesToDelete = currentNodes.filter((node) =>
        nodeIds.includes(node.id),
      );

      const batchDeleteData = nodesToDelete.map((node) => ({
        nodeId: node.id,
        position: node.position,
        data: node.data as unknown as CustomNodeData,
      }));

      // Emit batch collaboration event
      this.collaborationEvents.deleteNodes(batchDeleteData, userId);

      // Return the filtered nodes (without deleted ones)
      return currentNodes.filter((node) => !nodeIds.includes(node.id));
    });
  }

  /**
   * Update node position and emit collaboration events
   */
  moveNode(
    nodeId: string,
    oldPosition: Position,
    newPosition: Position,
    userId?: string,
  ): void {
    this.collaborationEvents.updateNode(
      nodeId,
      {
        position: { old: oldPosition, new: newPosition },
      },
      userId,
    );

    this.setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              position: newPosition,
              data: {
                ...node.data,
                originalPosition: newPosition, // Update originalPosition for future moves
              },
            }
          : node,
      ),
    );
  }

  /**
   * Update multiple node positions and emit batch collaboration events
   */
  moveNodes(
    nodeMovements: Array<{
      nodeId: string;
      oldPosition: Position;
      newPosition: Position;
    }>,
    userId?: string,
  ): void {
    // Prepare batch data for collaboration events
    const batchUpdateData = nodeMovements.map((movement) => ({
      nodeId: movement.nodeId,
      updates: {
        position: { old: movement.oldPosition, new: movement.newPosition },
      },
    }));

    // Emit batch collaboration event
    this.collaborationEvents.updateNodes(batchUpdateData, userId);

    if (nodeMovements.length === 0) {
      return;
    }

    const newPositions = new Map(
      nodeMovements.map((movement) => [movement.nodeId, movement.newPosition]),
    );

    this.setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const updatedPosition = newPositions.get(node.id);
        if (!updatedPosition) {
          return node;
        }
        return {
          ...node,
          position: updatedPosition,
          data: {
            ...node.data,
            originalPosition: updatedPosition,
          },
        };
      }),
    );
  }

  /**
   * Update node description and emit collaboration events
   */
  updateNodeDescription(
    nodeId: string,
    newDescription: string,
    userId?: string,
  ): void {
    this.setNodes((currentNodes) => {
      const updatedNodes = currentNodes.map((node) => {
        if (node.id === nodeId) {
          const oldDescription =
            (node.data as unknown as CustomNodeData)?.description || "";

          // Emit collaboration event
          this.collaborationEvents.updateNode(
            nodeId,
            {
              description: { old: oldDescription, new: newDescription },
            },
            userId,
          );

          return {
            ...node,
            data: {
              ...node.data,
              description: newDescription,
            },
          };
        }
        return node;
      });

      return updatedNodes;
    });
  }

  /**
   * Update node image and emit collaboration events
   */
  updateNodeImage(
    nodeId: string,
    newImage: string | undefined,
    userId?: string,
  ): void {
    this.setNodes((currentNodes) => {
      const updatedNodes = currentNodes.map((node) => {
        if (node.id === nodeId) {
          const oldImage = (node.data as unknown as CustomNodeData)?.image;

          // Emit collaboration event
          this.collaborationEvents.updateNode(
            nodeId,
            {
              image: { old: oldImage, new: newImage },
            },
            userId,
          );

          return {
            ...node,
            data: {
              ...node.data,
              image: newImage,
            },
          };
        }
        return node;
      });

      return updatedNodes;
    });
  }

  /**
   * Get current collaboration events instance
   */
  getCollaborationEvents(): CollaborationEvents {
    return this.collaborationEvents;
  }

  /**
   * Update the collaboration events instance
   */
  setCollaborationEvents(collaborationEvents: CollaborationEvents): void {
    this.collaborationEvents = collaborationEvents;
  }
}
