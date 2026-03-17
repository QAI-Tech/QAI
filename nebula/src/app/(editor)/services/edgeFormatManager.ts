import {
  EdgeFormatTask,
  EdgeFormatResponse,
} from "../workers/edgeFormat.worker";

export type EdgeUpdateCallback = (
  edgeId: string,
  formattedBusinessLogic: string,
) => void;

export type EdgeFormatErrorCallback = (
  edgeId: string,
  metaLogic?: string,
) => void;

export class EdgeFormatManager {
  private worker: Worker | null = null;
  private onEdgeUpdate: EdgeUpdateCallback | null = null;
  private onFormatError: EdgeFormatErrorCallback | null = null;
  private isInitialized = false;
  private pendingTasks: EdgeFormatTask[] = [];

  constructor(
    onEdgeUpdate: EdgeUpdateCallback,
    onFormatError?: EdgeFormatErrorCallback,
  ) {
    this.onEdgeUpdate = onEdgeUpdate;
    this.onFormatError = onFormatError || null;
    this.initializeWorker();
  }

  private initializeWorker(): void {
    try {
      this.worker = new Worker(
        new URL("../workers/edgeFormat.worker.ts", import.meta.url),
        { type: "module" },
      );

      this.worker.onmessage = (event) => {
        const { type, payload } = event.data;

        switch (type) {
          case "WORKER_READY":
            console.log("[EdgeFormatManager] Worker ready");
            this.isInitialized = true;
            this.processPendingTasks();
            break;

          case "TASK_COMPLETE":
            this.handleTaskComplete(payload);
            break;

          case "QUEUE_STATUS":
            console.log("[EdgeFormatManager] Queue status:", payload);
            break;

          default:
            console.warn(`[EdgeFormatManager] Unknown message type: ${type}`);
        }
      };

      this.worker.onerror = (error) => {
        console.error("[EdgeFormatManager] Worker error:", error);
      };
    } catch (error) {
      console.error("[EdgeFormatManager] Failed to initialize worker:", error);
    }
  }

  private handleTaskComplete(payload: EdgeFormatResponse): void {
    const { edgeId, formattedBusinessLogic, metaLogic, success, error } =
      payload;

    console.log(
      `[EdgeFormatManager] Received task complete for edge ${edgeId}:`,
      {
        success,
        formattedBusinessLogic: formattedBusinessLogic
          ? formattedBusinessLogic.substring(0, 100) + "..."
          : "empty",
        metaLogic,
        error,
      },
    );

    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("edgeBusinessLogicFormatTaskComplete", {
            detail: {
              edgeId,
              success,
              formattedBusinessLogic,
              metaLogic,
              error,
              isEmpty:
                !formattedBusinessLogic || formattedBusinessLogic.trim() === "",
            },
          }),
        );
      }
    } catch {
      console.error(
        `[EdgeFormatManager] Failed to handle task complete for edge ${edgeId}:`,
        error,
      );
    }

    if (success && this.onEdgeUpdate) {
      // Check if formatted business logic is empty
      if (!formattedBusinessLogic || formattedBusinessLogic.trim() === "") {
        console.warn(
          `[EdgeFormatManager] Empty formatted business logic for edge ${edgeId}`,
        );

        // Call error callback if available
        if (this.onFormatError) {
          this.onFormatError(edgeId, metaLogic);
        }
        return;
      }

      console.log(
        `[EdgeFormatManager] Updating edge ${edgeId} with formatted business logic`,
      );
      this.onEdgeUpdate(edgeId, formattedBusinessLogic);

      // Emit collaboration event for the business logic update
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
                business_logic: {
                  old: "Unformatted business logic", // Simple placeholder since we don't know the old value
                  new: formattedBusinessLogic,
                },
              },
              "BUSINESS_LOGIC_FORMATTER",
            );
          } catch (error) {
            console.error(
              "[EdgeFormatManager] Failed to emit collaboration event:",
              error,
            );
          }
        },
      );
    } else {
      console.error(
        `[EdgeFormatManager] Task failed for edge ${edgeId}:`,
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

  public formatBusinessLogic(edgeId: string, businessLogic: string): void {
    const task: EdgeFormatTask = {
      edgeId,
      businessLogic,
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

    console.log(`[EdgeFormatManager] Queued task for edge: ${edgeId}`);
  }

  /**
   * Update the callback function for edge updates
   */
  public updateCallback(onEdgeUpdate: EdgeUpdateCallback): void {
    this.onEdgeUpdate = onEdgeUpdate;
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
let edgeFormatManagerInstance: EdgeFormatManager | null = null;

export function getEdgeFormatManager(
  onEdgeUpdate?: EdgeUpdateCallback,
  onFormatError?: EdgeFormatErrorCallback,
): EdgeFormatManager {
  if (!edgeFormatManagerInstance) {
    if (!onEdgeUpdate) {
      throw new Error(
        "EdgeFormatManager requires onEdgeUpdate callback for initialization",
      );
    }
    edgeFormatManagerInstance = new EdgeFormatManager(
      onEdgeUpdate,
      onFormatError,
    );

    if (typeof window !== "undefined" && (window as any).__edgeFormatQueue) {
      const queuedTasks = (window as any).__edgeFormatQueue;
      console.log(
        `[EdgeFormatManager] Processing ${queuedTasks.length} queued tasks`,
      );
      queuedTasks.forEach((task: { edgeId: string; businessLogic: string }) => {
        edgeFormatManagerInstance!.formatBusinessLogic(
          task.edgeId,
          task.businessLogic,
        );
      });

      (window as any).__edgeFormatQueue = [];
    }
  }
  return edgeFormatManagerInstance;
}

export function destroyEdgeFormatManager(): void {
  if (edgeFormatManagerInstance) {
    edgeFormatManagerInstance.destroy();
    edgeFormatManagerInstance = null;
  }
}

export function formatEdgeBusinessLogic(
  edgeId: string,
  businessLogic: string,
): boolean {
  if (!edgeFormatManagerInstance) {
    console.warn(
      "EdgeFormatManager not initialized yet. Queuing task for later...",
    );

    if (typeof window !== "undefined") {
      if (!(window as any).__edgeFormatQueue) {
        (window as any).__edgeFormatQueue = [];
      }
      (window as any).__edgeFormatQueue.push({ edgeId, businessLogic });
    }
    return false;
  }
  edgeFormatManagerInstance.formatBusinessLogic(edgeId, businessLogic);
  return true;
}
