import {
  EdgeDescriptionFormatTask,
  EdgeDescriptionFormatResponse,
} from "../workers/edgeDescriptionFormat.worker";

export type EdgeDescriptionUpdateCallback = (
  edgeId: string,
  formattedDescription: string,
) => void;

export type EdgeDescriptionFormatErrorCallback = (
  edgeId: string,
  metaLogic?: string,
) => void;

export class EdgeDescriptionFormatManager {
  private worker: Worker | null = null;
  private onEdgeUpdate: EdgeDescriptionUpdateCallback | null = null;
  private onFormatError: EdgeDescriptionFormatErrorCallback | null = null;
  private isInitialized = false;
  private pendingTasks: EdgeDescriptionFormatTask[] = [];

  constructor(
    onEdgeUpdate: EdgeDescriptionUpdateCallback,
    onFormatError?: EdgeDescriptionFormatErrorCallback,
  ) {
    this.onEdgeUpdate = onEdgeUpdate;
    this.onFormatError = onFormatError || null;
    this.initializeWorker();
  }

  private initializeWorker(): void {
    try {
      this.worker = new Worker(
        new URL("../workers/edgeDescriptionFormat.worker.ts", import.meta.url),
        { type: "module" },
      );

      this.worker.onmessage = (event) => {
        const { type, payload } = event.data;

        switch (type) {
          case "WORKER_READY":
            console.log("[EdgeDescriptionFormatManager] Worker ready");
            this.isInitialized = true;
            this.processPendingTasks();
            break;

          case "TASK_COMPLETE":
            this.handleTaskComplete(payload);
            break;

          case "QUEUE_STATUS":
            console.log(
              "[EdgeDescriptionFormatManager] Queue status:",
              payload,
            );
            break;

          default:
            console.warn(
              `[EdgeDescriptionFormatManager] Unknown message type: ${type}`,
            );
        }
      };

      this.worker.onerror = (error) => {
        console.error("[EdgeDescriptionFormatManager] Worker error:", error);
      };
    } catch (error) {
      console.error(
        "[EdgeDescriptionFormatManager] Failed to initialize worker:",
        error,
      );
    }
  }

  private handleTaskComplete(payload: EdgeDescriptionFormatResponse): void {
    const {
      edgeId,
      formattedDescription,
      originalDescription,
      metaLogic,
      success,
      error,
    } = payload;

    console.log(
      `[EdgeDescriptionFormatManager] Received task complete for edge ${edgeId}:`,
      {
        success,
        formattedDescription: formattedDescription
          ? formattedDescription.substring(0, 100) + "..."
          : "empty",
        metaLogic,
        error,
      },
    );

    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("edgeDescriptionFormatTaskComplete", {
            detail: {
              edgeId,
              success,
              formattedDescription,
              originalDescription,
              metaLogic,
              error,
              isEmpty:
                !formattedDescription || formattedDescription.trim() === "",
            },
          }),
        );
      }
    } catch {
      console.error(
        `[EdgeDescriptionFormatManager] Failed to handle task complete for edge ${edgeId}:`,
        error,
      );
    }

    if (success && this.onEdgeUpdate) {
      // Check if formatted description is empty
      if (!formattedDescription || formattedDescription.trim() === "") {
        console.warn(
          `[EdgeDescriptionFormatManager] Empty formatted description for edge ${edgeId}`,
        );

        // Call error callback if available
        if (this.onFormatError) {
          this.onFormatError(edgeId, metaLogic);
        }
        return;
      }

      console.log(
        `[EdgeDescriptionFormatManager] Updating edge ${edgeId} with formatted description`,
      );
      this.onEdgeUpdate(edgeId, formattedDescription);

      // Emit collaboration event for the description update
      import("../types/collaborationEvents").then(
        ({ ConsoleCollaborationEvents }) => {
          try {
            const currentProductId =
              ConsoleCollaborationEvents.getCurrentProductId();
            const collaborationEvents =
              ConsoleCollaborationEvents.initializeForProduct(
                currentProductId || "",
              );

            collaborationEvents.updateEdge(
              edgeId,
              {
                description: {
                  old: originalDescription,
                  new: formattedDescription,
                },
              },
              "EDGE_DESCRIPTION_FORMATTER",
            );
          } catch (error) {
            console.error(
              "[EdgeDescriptionFormatManager] Failed to emit collaboration event:",
              error,
            );
          }
        },
      );
    } else {
      console.error(
        `[EdgeDescriptionFormatManager] Task failed for edge ${edgeId}:`,
        error,
      );

      // Call error callback if available
      if (this.onFormatError) {
        this.onFormatError(edgeId, metaLogic || error);
      }
    }
  }

  private processPendingTasks(): void {
    if (!this.isInitialized || !this.worker || this.pendingTasks.length === 0) {
      return;
    }

    this.pendingTasks.forEach((task) => {
      this.worker!.postMessage({
        type: "ADD_TASK",
        payload: task,
      });
    });

    this.pendingTasks = [];
  }

  public formatDescription(edgeId: string, description: string): void {
    const task: EdgeDescriptionFormatTask = {
      edgeId,
      description,
      timestamp: Date.now(),
    };

    if (this.isInitialized && this.worker) {
      this.worker.postMessage({
        type: "ADD_TASK",
        payload: task,
      });
    } else {
      this.pendingTasks.push(task);
    }

    console.log(
      `[EdgeDescriptionFormatManager] Queued task for edge: ${edgeId}`,
    );
  }

  /**
   * Update the callback function for edge updates
   */
  public updateCallback(onEdgeUpdate: EdgeDescriptionUpdateCallback): void {
    this.onEdgeUpdate = onEdgeUpdate;
  }

  /**
   * Update both callbacks
   */
  public setCallbacks(
    onEdgeUpdate: EdgeDescriptionUpdateCallback,
    onFormatError?: EdgeDescriptionFormatErrorCallback,
  ): void {
    this.onEdgeUpdate = onEdgeUpdate;
    this.onFormatError = onFormatError || null;
  }

  /**
   * Get current queue status from worker
   */
  public getQueueStatus(): void {
    if (this.worker) {
      this.worker.postMessage({ type: "GET_QUEUE_STATUS" });
    }
  }

  /**
   * Destroy the worker and cleanup
   */
  public destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isInitialized = false;
    this.pendingTasks = [];
  }
}

// Singleton instance management
let edgeDescriptionFormatManagerInstance: EdgeDescriptionFormatManager | null =
  null;

export function getEdgeDescriptionFormatManager(
  onEdgeUpdate?: EdgeDescriptionUpdateCallback,
  onFormatError?: EdgeDescriptionFormatErrorCallback,
): EdgeDescriptionFormatManager {
  if (!edgeDescriptionFormatManagerInstance) {
    if (!onEdgeUpdate) {
      throw new Error(
        "EdgeDescriptionFormatManager requires onEdgeUpdate callback for initialization",
      );
    }
    edgeDescriptionFormatManagerInstance = new EdgeDescriptionFormatManager(
      onEdgeUpdate,
      onFormatError,
    );

    if (
      typeof window !== "undefined" &&
      (window as any).__edgeDescriptionFormatQueue
    ) {
      const queuedTasks = (window as any).__edgeDescriptionFormatQueue;
      console.log(
        `[EdgeDescriptionFormatManager] Processing ${queuedTasks.length} queued tasks`,
      );
      queuedTasks.forEach((task: { edgeId: string; description: string }) => {
        edgeDescriptionFormatManagerInstance!.formatDescription(
          task.edgeId,
          task.description,
        );
      });

      (window as any).__edgeDescriptionFormatQueue = [];
    }
  } else if (onEdgeUpdate) {
    // Update callbacks on subsequent calls to prevent stale callbacks
    edgeDescriptionFormatManagerInstance.setCallbacks(
      onEdgeUpdate,
      onFormatError,
    );
  }
  return edgeDescriptionFormatManagerInstance;
}

export function destroyEdgeDescriptionFormatManager(): void {
  if (edgeDescriptionFormatManagerInstance) {
    edgeDescriptionFormatManagerInstance.destroy();
    edgeDescriptionFormatManagerInstance = null;
  }
}

export function formatEdgeDescription(
  edgeId: string,
  description: string,
): boolean {
  if (!edgeDescriptionFormatManagerInstance) {
    console.warn(
      "EdgeDescriptionFormatManager not initialized yet. Queuing task for later...",
    );

    if (typeof window !== "undefined") {
      if (!(window as any).__edgeDescriptionFormatQueue) {
        (window as any).__edgeDescriptionFormatQueue = [];
      }
      (window as any).__edgeDescriptionFormatQueue.push({
        edgeId,
        description,
      });
    }
    return false;
  }
  edgeDescriptionFormatManagerInstance.formatDescription(edgeId, description);
  return true;
}
