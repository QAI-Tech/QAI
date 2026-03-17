// Web Worker for automatically generating node titles and descriptions
// This worker handles API calls to generate titles and descriptions for nodes

export interface NodeAutoTitleTask {
  nodeId: string;
  image: string; // base64 image string
  timestamp: number;
}

export interface NodeAutoTitleResponse {
  nodeId: string;
  title: string;
  description: string;
  success: boolean;
  error?: string;
}

// Queue to manage parallel processing
class TaskQueue {
  private queue: NodeAutoTitleTask[] = [];
  private processing = new Set<string>();
  private maxConcurrent = 3; // Maximum concurrent API calls

  addTask(task: NodeAutoTitleTask): void {
    // Remove any existing task for the same node
    this.queue = this.queue.filter((t) => t.nodeId !== task.nodeId);
    this.queue.push(task);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    while (this.queue.length > 0 && this.processing.size < this.maxConcurrent) {
      const task = this.queue.shift();
      if (!task || this.processing.has(task.nodeId)) {
        continue;
      }

      this.processing.add(task.nodeId);
      this.processTask(task);
    }
  }

  private async processTask(task: NodeAutoTitleTask): Promise<void> {
    try {
      console.log(`[Worker] Processing task for node: ${task.nodeId}`);

      const response = await this.callAutoTitleAPI(task.image, task.nodeId);

      // Send success response back to main thread
      self.postMessage({
        type: "TASK_COMPLETE",
        payload: {
          nodeId: task.nodeId,
          title: response.title,
          description: response.description,
          success: true,
        } as NodeAutoTitleResponse,
      });
    } catch (error) {
      console.error(
        `[Worker] Error processing task for node ${task.nodeId}:`,
        error,
      );

      // Send error response back to main thread
      self.postMessage({
        type: "TASK_COMPLETE",
        payload: {
          nodeId: task.nodeId,
          title: "",
          description: "",
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        } as NodeAutoTitleResponse,
      });
    } finally {
      this.processing.delete(task.nodeId);
      // Continue processing queue
      this.processQueue();
    }
  }

  private async callAutoTitleAPI(
    image: string,
    nodeId: string,
  ): Promise<{ title: string; description: string }> {
    const apiUrl = "/api/title-generation-for-nodes";

    const requestBody = {
      nodeId,
      image, // base64 string
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log(
      `[Worker] API Response Status: ${response.status} ${response.statusText}`,
    );
    console.log(
      `[Worker] API Response Headers:`,
      Object.fromEntries(response.headers.entries()),
    );

    if (!response.ok) {
      throw new Error(
        `API call failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    console.log(`[Worker] API Response Data for node ${nodeId}:`, data);
    console.log(`[Worker] API Response Type:`, typeof data);
    console.log(
      `[Worker] API Response Keys:`,
      data ? Object.keys(data) : "null/undefined",
    );

    // Expected API response format:
    // {
    //   nodeId: string,
    //   title: string,
    //   description: string
    // }

    const result = {
      title: data.title || `Auto-generated title`,
      description:
        data.description || `Auto-generated description for node ${nodeId}`,
    };

    console.log(`[Worker] Processed result for node ${nodeId}:`, result);

    return result;
  }

  getQueueStatus(): { queueLength: number; processing: number } {
    return {
      queueLength: this.queue.length,
      processing: this.processing.size,
    };
  }
}

// Initialize the task queue
const taskQueue = new TaskQueue();

// Handle messages from main thread
self.addEventListener("message", (event) => {
  const { type, payload } = event.data;

  switch (type) {
    case "ADD_TASK":
      const task: NodeAutoTitleTask = payload;
      console.log(`[Worker] Received task for node: ${task.nodeId}`);
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

// Send ready signal
self.postMessage({
  type: "WORKER_READY",
  payload: null,
});

console.log("[Worker] Node Auto Title Worker initialized");
