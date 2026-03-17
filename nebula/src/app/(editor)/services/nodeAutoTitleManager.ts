// Manager to handle communication with the node auto-title worker
import {
  NodeAutoTitleTask,
  NodeAutoTitleResponse,
} from "../workers/nodeAutoTitle.worker";

export type NodeUpdateCallback = (
  nodeId: string,
  title: string,
  description: string,
) => void;

export class NodeAutoTitleManager {
  private worker: Worker | null = null;
  private onNodeUpdate: NodeUpdateCallback | null = null;
  private isInitialized = false;
  private pendingTasks: NodeAutoTitleTask[] = [];

  constructor(onNodeUpdate: NodeUpdateCallback) {
    this.onNodeUpdate = onNodeUpdate;
    this.initializeWorker();
  }

  private initializeWorker(): void {
    try {
      // Create worker from the worker file
      this.worker = new Worker(
        new URL("../workers/nodeAutoTitle.worker.ts", import.meta.url),
        { type: "module" },
      );

      this.worker.addEventListener(
        "message",
        this.handleWorkerMessage.bind(this),
      );
      this.worker.addEventListener("error", this.handleWorkerError.bind(this));

      console.log("[NodeAutoTitleManager] Worker initialized");
    } catch (error) {
      console.error(
        "[NodeAutoTitleManager] Failed to initialize worker:",
        error,
      );
    }
  }

  private handleWorkerMessage(event: MessageEvent): void {
    const { type, payload } = event.data;

    switch (type) {
      case "WORKER_READY":
        console.log("[NodeAutoTitleManager] Worker is ready");
        this.isInitialized = true;
        this.processPendingTasks();
        break;

      case "TASK_COMPLETE":
        const response: NodeAutoTitleResponse = payload;
        this.handleTaskComplete(response);
        break;

      case "QUEUE_STATUS":
        console.log("[NodeAutoTitleManager] Queue status:", payload);
        break;

      default:
        console.warn(`[NodeAutoTitleManager] Unknown message type: ${type}`);
    }
  }

  private handleWorkerError(error: ErrorEvent): void {
    console.error("[NodeAutoTitleManager] Worker error:", error);
  }

  private handleTaskComplete(response: NodeAutoTitleResponse): void {
    console.log(
      `[NodeAutoTitleManager] Task completed for node: ${response.nodeId}`,
      response,
    );

    if (response.success && this.onNodeUpdate) {
      // Update the node with the generated title and description
      this.onNodeUpdate(response.nodeId, response.title, response.description);

      // Emit collaboration event for the auto-title update
      import("../types/collaborationEvents").then(
        ({ ConsoleCollaborationEvents }) => {
          try {
            const currentProductId =
              ConsoleCollaborationEvents.getCurrentProductId();
            const collaborationEvents =
              ConsoleCollaborationEvents.initializeForProduct(
                currentProductId || "",
              );

            collaborationEvents.updateNode(
              response.nodeId,
              {
                description: {
                  old: "Auto-generated title", // Simple placeholder since we don't know the old value
                  new: response.title,
                },
              },
              "AUTO_TITLE_SYSTEM",
            );
          } catch (error) {
            console.error(
              "[NodeAutoTitleManager] Failed to emit collaboration event:",
              error,
            );
          }
        },
      );
    } else if (!response.success) {
      console.error(
        `[NodeAutoTitleManager] Task failed for node ${response.nodeId}:`,
        response.error,
      );
    }
  }

  private processPendingTasks(): void {
    if (!this.isInitialized || !this.worker) {
      return;
    }

    // Send all pending tasks to worker
    this.pendingTasks.forEach((task) => {
      this.worker!.postMessage({
        type: "ADD_TASK",
        payload: task,
      });
    });

    // Clear pending tasks
    this.pendingTasks = [];
  }

  /**
   * Add a node for auto-title generation
   * @param nodeId - Unique identifier for the node
   * @param image - Base64 encoded image string
   */
  public generateTitleForNode(nodeId: string, image: string): void {
    const task: NodeAutoTitleTask = {
      nodeId,
      image,
      timestamp: Date.now(),
    };

    if (this.isInitialized && this.worker) {
      // Send task directly to worker
      this.worker.postMessage({
        type: "ADD_TASK",
        payload: task,
      });
    } else {
      // Queue task for when worker is ready
      this.pendingTasks.push(task);
    }

    console.log(`[NodeAutoTitleManager] Queued task for node: ${nodeId}`);
  }

  /**
   * Get current queue status from worker
   */
  public getQueueStatus(): void {
    if (this.worker) {
      this.worker.postMessage({
        type: "GET_QUEUE_STATUS",
        payload: null,
      });
    }
  }

  /**
   * Update the callback function for node updates
   */
  public setNodeUpdateCallback(callback: NodeUpdateCallback): void {
    this.onNodeUpdate = callback;
  }

  /**
   * Terminate the worker and cleanup
   */
  public destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isInitialized = false;
    this.pendingTasks = [];
    console.log("[NodeAutoTitleManager] Manager destroyed");
  }
}

// Singleton instance for the auto-title manager
let managerInstance: NodeAutoTitleManager | null = null;

/**
 * Get or create the singleton NodeAutoTitleManager instance
 */
export function getNodeAutoTitleManager(
  onNodeUpdate?: NodeUpdateCallback,
): NodeAutoTitleManager {
  if (!managerInstance && onNodeUpdate) {
    managerInstance = new NodeAutoTitleManager(onNodeUpdate);
  } else if (managerInstance && onNodeUpdate) {
    // Update callback if provided
    managerInstance.setNodeUpdateCallback(onNodeUpdate);
  }

  if (!managerInstance) {
    throw new Error(
      "NodeAutoTitleManager requires an onNodeUpdate callback for initialization",
    );
  }

  return managerInstance;
}

/**
 * Destroy the singleton instance
 */
export function destroyNodeAutoTitleManager(): void {
  if (managerInstance) {
    managerInstance.destroy();
    managerInstance = null;
  }
}
