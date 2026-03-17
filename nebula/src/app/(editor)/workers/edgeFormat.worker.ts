export interface EdgeFormatTask {
  edgeId: string;
  businessLogic: string;
  timestamp: number;
}

export interface EdgeFormatResponse {
  edgeId: string;
  formattedBusinessLogic: string;
  metaLogic?: string;
  success: boolean;
  error?: string;
}

class TaskQueue {
  private queue: EdgeFormatTask[] = [];
  private queuedEdgeIds = new Set<string>();
  private processing = new Set<string>();
  private maxConcurrent = 3;

  addTask(task: EdgeFormatTask): void {
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

  private async processTask(task: EdgeFormatTask): Promise<void> {
    try {
      console.log(`[Worker] Processing task for edge: ${task.edgeId}`);

      const { formattedBusinessLogic, metaLogic } = await this.callFormatAPI(
        task.businessLogic,
        task.edgeId,
      );

      self.postMessage({
        type: "TASK_COMPLETE",
        payload: {
          edgeId: task.edgeId,
          formattedBusinessLogic,
          metaLogic,
          success: true,
        } as EdgeFormatResponse,
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
          formattedBusinessLogic: "",
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        } as EdgeFormatResponse,
      });
    } finally {
      this.processing.delete(task.edgeId);
      this.processQueue();
    }
  }

  private async callFormatAPI(
    businessLogic: string,
    edgeId: string,
  ): Promise<{ formattedBusinessLogic: string; metaLogic?: string }> {
    console.log(`[Worker] Making API call for edge: ${edgeId}`);
    console.log(`[Worker] Business logic length: ${businessLogic.length}`);

    const response = await fetch("/api/call-llm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        business_logic: businessLogic,
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

    const formattedBusinessLogic = result?.formatted_business_logic || "";
    const metaLogic = result?.meta_logic;

    console.log(`[Worker] Extracted formatted text:`, formattedBusinessLogic);
    console.log(`[Worker] Extracted meta logic:`, metaLogic);

    return { formattedBusinessLogic, metaLogic };
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
      const task: EdgeFormatTask = payload;
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
