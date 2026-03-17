export interface EdgeDescriptionFormatTask {
  edgeId: string;
  description: string;
  timestamp: number;
}

export interface EdgeDescriptionFormatResponse {
  edgeId: string;
  formattedDescription: string;
  originalDescription: string;
  metaLogic?: string;
  success: boolean;
  error?: string;
}

class TaskQueue {
  private queue: EdgeDescriptionFormatTask[] = [];
  private queuedEdgeIds = new Set<string>();
  private processing = new Set<string>();
  private maxConcurrent = 3;

  addTask(task: EdgeDescriptionFormatTask): void {
    if (
      !this.queuedEdgeIds.has(task.edgeId) &&
      !this.processing.has(task.edgeId)
    ) {
      this.queue.push(task);
      this.queuedEdgeIds.add(task.edgeId);
    }
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    while (this.queue.length > 0 && this.processing.size < this.maxConcurrent) {
      const task = this.queue.shift();
      if (!task) break;

      this.queuedEdgeIds.delete(task.edgeId);
      this.processing.add(task.edgeId);
      this.processTask(task);
    }
  }

  private async processTask(task: EdgeDescriptionFormatTask): Promise<void> {
    try {
      console.log(`[Worker] Processing task for edge: ${task.edgeId}`);

      const { formattedDescription, metaLogic } = await this.callFormatAPI(
        task.description,
        task.edgeId,
      );

      self.postMessage({
        type: "TASK_COMPLETE",
        payload: {
          edgeId: task.edgeId,
          formattedDescription,
          originalDescription: task.description,
          metaLogic,
          success: true,
        } as EdgeDescriptionFormatResponse,
      });
    } catch (error) {
      console.error(
        `[Worker] Error processing task for edge ${task.edgeId}:`,
        error,
      );

      self.postMessage({
        type: "TASK_COMPLETE",
        payload: {
          edgeId: task.edgeId,
          formattedDescription: "",
          originalDescription: task.description,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        } as EdgeDescriptionFormatResponse,
      });
    } finally {
      this.processing.delete(task.edgeId);
      this.processQueue();
    }
  }

  private async callFormatAPI(
    description: string,
    edgeId: string,
  ): Promise<{ formattedDescription: string; metaLogic?: string }> {
    console.log(`[Worker] Making API call for edge: ${edgeId}`);
    console.log(`[Worker] Description length: ${description.length}`);

    const response = await fetch("/api/format-edge-description", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        description: description,
        edge_id: edgeId,
      }),
    });

    console.log(
      `[Worker] API Response Status: ${response.status} ${response.statusText}`,
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`[Worker] API Error:`, errorData);
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const result = await response.json();
    console.log(`[Worker] API Response Data:`, result);

    const formattedDescription = result?.formatted_description || "";
    const metaLogic = result?.meta_logic;

    console.log(`[Worker] Extracted formatted text:`, formattedDescription);
    console.log(`[Worker] Extracted meta logic:`, metaLogic);

    return { formattedDescription, metaLogic };
  }

  getQueueStatus(): { queueLength: number; processing: number } {
    return {
      queueLength: this.queue.length,
      processing: this.processing.size,
    };
  }
}

const taskQueue = new TaskQueue();

self.addEventListener("message", (event) => {
  const { type, payload } = event.data;

  switch (type) {
    case "ADD_TASK":
      const task: EdgeDescriptionFormatTask = payload;
      console.log(`[Worker] Received task for edge: ${task.edgeId}`);
      taskQueue.addTask(task);
      break;

    case "GET_QUEUE_STATUS":
      const status = taskQueue.getQueueStatus();
      self.postMessage({
        type: "QUEUE_STATUS",
        payload: status,
      });
      break;

    default:
      console.warn(`[Worker] Unknown message type: ${type}`);
  }
});

self.postMessage({
  type: "WORKER_READY",
  payload: null,
});
