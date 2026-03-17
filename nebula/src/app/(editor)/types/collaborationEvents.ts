import { CustomNodeData, CustomEdgeData } from "./graphHandlers";
import { Feature } from "../components/FlowManager";
import { Flow } from "../components/FlowManager";
import { Comment } from "../types/commentTypes";
// import { Comment } from "./commentTypes";
import { io, Socket } from "socket.io-client";
import { GRAPH_COLLABORATION_SERVER_URL } from "@/lib/constants";

// Collaboration event type constants
export const COLLABORATION_EVENT_TYPES = {
  // Node events
  NODE_CREATE: "node_create",
  NODE_DELETE: "node_delete",
  NODE_UPDATE: "node_update",

  // Edge events
  EDGE_CREATE: "edge_create",
  EDGE_DELETE: "edge_delete",
  EDGE_UPDATE: "edge_update",

  // Feature events
  FEATURES_CREATE: "features_create",
  FEATURES_UPDATE: "features_update",
  FEATURES_DELETE: "features_delete",
  REORDER_FEATURES: "reorder_features",

  // Flow events
  FLOW_CREATE: "flow_create",
  FLOWS_CREATE: "flows_create",
  AI_PLANNED_FLOWS: "ai_planned_flows",
  FLOWS_UPDATE: "flows_update",
  FLOW_DELETE: "flow_delete",
  FLOWS_DELETE: "flows_delete",
  FLOWS_REPLACE: "flows_replace",

  // Comment events
  COMMENT_ADD: "comment_add",
  COMMENT_UPDATE: "comment_update",
  COMMENT_DELETE: "comment_delete",

  // Credential events
  CREDENTIAL_ADD: "credential_add",
} as const;

export type CollaborationEventType =
  (typeof COLLABORATION_EVENT_TYPES)[keyof typeof COLLABORATION_EVENT_TYPES];

// Base types for collaboration events
export interface BaseCollaborationEvent {
  userId: string;
  timestamp: string;
  sessionId?: string;
}

export interface Position {
  x: number;
  y: number;
}

// Node Events
export interface NodeCreateEvent extends BaseCollaborationEvent {
  type: typeof COLLABORATION_EVENT_TYPES.NODE_CREATE;
  nodeId: string;
  position: Position;
  data: CustomNodeData;
}

export interface NodeDeleteEvent extends BaseCollaborationEvent {
  type: typeof COLLABORATION_EVENT_TYPES.NODE_DELETE;
  nodeId: string;
  position: Position;
  data: CustomNodeData;
}

export interface NodeUpdateEvent extends BaseCollaborationEvent {
  type: typeof COLLABORATION_EVENT_TYPES.NODE_UPDATE;
  nodeId: string;
  updates: {
    description?: { old: string; new: string };
    image?: { old?: string; new?: string };
    position?: { old: Position; new: Position };
  };
}

// Edge Events
export interface EdgeCreateEvent extends BaseCollaborationEvent {
  type: typeof COLLABORATION_EVENT_TYPES.EDGE_CREATE;
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string;
  targetHandle?: string;
  data: CustomEdgeData;
}

export interface EdgeDeleteEvent extends BaseCollaborationEvent {
  type: typeof COLLABORATION_EVENT_TYPES.EDGE_DELETE;
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string;
  targetHandle?: string;
  data: CustomEdgeData;
}

export interface EdgeUpdateEvent extends BaseCollaborationEvent {
  type: typeof COLLABORATION_EVENT_TYPES.EDGE_UPDATE;
  edgeId: string;
  updates: {
    description?: { old?: string; new?: string };
    business_logic?: { old?: string; new?: string };
    curvature?: { old?: number; new?: number };
    anchors?: {
      oldSourceNodeId: string;
      newSourceNodeId: string;
      oldTargetNodeId: string;
      newTargetNodeId: string;
      oldSourceHandle?: string;
      newSourceHandle?: string;
      oldTargetHandle?: string;
      newTargetHandle?: string;
    };
  };
}

// Feature Events
export interface FeaturesCreateEvent extends BaseCollaborationEvent {
  type: typeof COLLABORATION_EVENT_TYPES.FEATURES_CREATE;
  feature: Feature[];
}

export interface FeaturesUpdateEvent extends BaseCollaborationEvent {
  type: typeof COLLABORATION_EVENT_TYPES.FEATURES_UPDATE;
  updates: Array<{
    featureId: string;
    updates: {
      name?: { old: string; new: string };
      nodeIds?: { old: string[]; new: string[] };
    };
  }>;
}

export interface FeaturesDeleteEvent extends BaseCollaborationEvent {
  type: typeof COLLABORATION_EVENT_TYPES.FEATURES_DELETE;
  feature: Feature[];
}

export interface ReorderFeaturesEvent extends BaseCollaborationEvent {
  type: typeof COLLABORATION_EVENT_TYPES.REORDER_FEATURES;
  features: Feature[];
}

// Flow Events
export interface FlowCreateEvent extends BaseCollaborationEvent {
  type: typeof COLLABORATION_EVENT_TYPES.FLOW_CREATE;
  flow: Flow;
}

export interface FlowsCreateEvent extends BaseCollaborationEvent {
  type: typeof COLLABORATION_EVENT_TYPES.FLOWS_CREATE;
  flows: Flow[];
}

export interface AiPlannedFlowsEvent extends BaseCollaborationEvent {
  type: typeof COLLABORATION_EVENT_TYPES.AI_PLANNED_FLOWS;
  flows: Flow[];
}

export interface FlowsUpdateEvent extends BaseCollaborationEvent {
  type: typeof COLLABORATION_EVENT_TYPES.FLOWS_UPDATE;
  flows: Flow[];
}
export interface FlowsDeleteEvent extends BaseCollaborationEvent {
  type: typeof COLLABORATION_EVENT_TYPES.FLOWS_DELETE;
  flows: Flow[];
}

export interface FlowDeleteEvent extends BaseCollaborationEvent {
  type: typeof COLLABORATION_EVENT_TYPES.FLOW_DELETE;
  flow: Flow;
}

// Comment Events
export interface CommentAddEvent extends BaseCollaborationEvent {
  type: typeof COLLABORATION_EVENT_TYPES.COMMENT_ADD;
  commentId: string;
  position: Position;
  content: string;
}

export interface CommentUpdateEvent extends BaseCollaborationEvent {
  type: typeof COLLABORATION_EVENT_TYPES.COMMENT_UPDATE;
  commentId: string;
  updates: {
    content?: { old: string; new: string };
    position?: { old: Position; new: Position };
  };
}

export interface CommentDeleteEvent extends BaseCollaborationEvent {
  type: typeof COLLABORATION_EVENT_TYPES.COMMENT_DELETE;
  commentId: string;
}

// Credential Events
export interface CredentialAddEvent extends BaseCollaborationEvent {
  type: typeof COLLABORATION_EVENT_TYPES.CREDENTIAL_ADD;
  credential: {
    id: string;
    credentials: Record<string, string>;
    description: string;
    product_id: string;
    created_at: string;
    updated_at: string | null;
  };
}

// Union type for all collaboration events
export type CollaborationEvent =
  | NodeCreateEvent
  | NodeDeleteEvent
  | NodeUpdateEvent
  | EdgeCreateEvent
  | EdgeDeleteEvent
  | EdgeUpdateEvent
  | FeaturesCreateEvent
  | FeaturesUpdateEvent
  | FeaturesDeleteEvent
  | ReorderFeaturesEvent
  | FlowCreateEvent
  | FlowsCreateEvent
  | FlowsDeleteEvent
  | AiPlannedFlowsEvent
  | FlowsUpdateEvent
  | FlowDeleteEvent
  | CommentAddEvent
  | CommentUpdateEvent
  | CommentDeleteEvent
  | CredentialAddEvent;

// Collaboration Events Interface
export interface CollaborationEvents {
  // Node operations (single)
  createNode(
    nodeId: string,
    position: Position,
    data: CustomNodeData,
    userId?: string,
  ): void;

  deleteNode(
    nodeId: string,
    position: Position,
    data: CustomNodeData,
    userId?: string,
  ): void;

  updateNode(
    nodeId: string,
    updates: {
      description?: { old: string; new: string };
      image?: { old?: string; new?: string };
      position?: { old: Position; new: Position };
    },
    userId?: string,
  ): void;

  // Node operations (batch)
  createNodes(
    nodes: Array<{
      nodeId: string;
      position: Position;
      data: CustomNodeData;
    }>,
    userId?: string,
  ): void;

  deleteNodes(
    nodes: Array<{
      nodeId: string;
      position: Position;
      data: CustomNodeData;
    }>,
    userId?: string,
  ): void;

  updateNodes(
    nodes: Array<{
      nodeId: string;
      updates: {
        description?: { old: string; new: string };
        image?: { old?: string; new?: string };
        position?: { old: Position; new: Position };
      };
    }>,
    userId?: string,
  ): void;

  // Edge operations (single)
  createEdge(
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    sourceHandle: string | undefined,
    targetHandle: string | undefined,
    data: CustomEdgeData,
    userId?: string,
  ): void;

  deleteEdge(
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    sourceHandle: string | undefined,
    targetHandle: string | undefined,
    data: CustomEdgeData,
    userId?: string,
  ): void;

  // Edge operations (batch)
  createEdges(
    edges: Array<{
      edgeId: string;
      sourceNodeId: string;
      targetNodeId: string;
      sourceHandle: string | undefined;
      targetHandle: string | undefined;
      data: CustomEdgeData;
    }>,
    userId?: string,
  ): void;

  deleteEdges(
    edges: Array<{
      edgeId: string;
      sourceNodeId: string;
      targetNodeId: string;
      sourceHandle: string | undefined;
      targetHandle: string | undefined;
      data: CustomEdgeData;
    }>,
    userId?: string,
  ): void;

  updateEdge(
    edgeId: string,
    updates: {
      description?: { old?: string; new?: string };
      business_logic?: { old?: string; new?: string };
      curvature?: { old?: number; new?: number };
      anchors?: {
        oldSourceNodeId: string;
        newSourceNodeId: string;
        oldTargetNodeId: string;
        newTargetNodeId: string;
        oldSourceHandle?: string;
        newSourceHandle?: string;
        oldTargetHandle?: string;
        newTargetHandle?: string;
      };
    },
    userId?: string,
  ): void;

  // Edge operations (batch)
  updateEdges(
    edges: Array<{
      edgeId: string;
      updates: {
        description?: { old?: string; new?: string };
        business_logic?: { old?: string; new?: string };
        curvature?: { old?: number; new?: number };
        anchors?: {
          oldSourceNodeId: string;
          newSourceNodeId: string;
          oldTargetNodeId: string;
          newTargetNodeId: string;
          oldSourceHandle?: string;
          newSourceHandle?: string;
          oldTargetHandle?: string;
          newTargetHandle?: string;
        };
      };
    }>,
    userId?: string,
  ): void;

  // Feature operations
  createFeatures(feature: Feature[], userId?: string): void;

  updateFeatures(
    updates: Array<{
      featureId: string;
      updates: {
        name?: { old: string; new: string };
        nodeIds?: { old: string[]; new: string[] };
      };
    }>,
    userId?: string,
  ): void;

  deleteFeatures(feature: Feature[], userId?: string): void;

  // Feature operations (batch)
  createFeatures(features: Array<Feature>, userId?: string): void;

  updateFeatures(
    features: Array<{
      featureId: string;
      updates: {
        name?: { old: string; new: string };
        nodeIds?: { old: string[]; new: string[] };
      };
    }>,
    userId?: string,
  ): void;

  deleteFeatures(features: Array<Feature>, userId?: string): void;

  reorderFeatures(features: Feature[], userId?: string): void;

  // Flow operations (single)
  createFlow(flow: Flow, userId?: string): void;

  createFlows(flows: Flow[], userId?: string): void;

  deleteFlow(flow: Flow, userId?: string): void;

  // Flow operations (batch)
  createFlows(flows: Array<Flow>, userId?: string): void;

  deleteFlows(flows: Array<Flow>, userId?: string): void;

  // Comment operations (single)
  addComment(comment: Comment, position: Position, userId?: string): void;

  updateComment(
    commentId: string,
    updates: {
      content?: { old: string; new: string };
      position?: { old: Position; new: Position };
    },
    userId?: string,
  ): void;

  deleteComment(commentId: string, userId?: string): void;

  // Comment operations (batch)
  addComments(
    comments: Array<Comment>,
    positions: Array<Position>,
    userId?: string,
  ): void;

  updateComments(
    comments: Array<{
      commentId: string;
      updates: {
        content?: { old: string; new: string };
        position?: { old: Position; new: Position };
      };
    }>,
    userId?: string,
  ): void;

  deleteComments(
    comments: Array<{
      commentId: string;
    }>,
    userId?: string,
  ): void;

  // Credential operations
  addCredential(
    credential: {
      id: string;
      credentials: Record<string, string>;
      description: string;
      product_id: string;
      created_at: string;
      updated_at: string | null;
    },
    userId?: string,
  ): void;
}

// Console logging implementation
export class ConsoleCollaborationEvents implements CollaborationEvents {
  public static instance: ConsoleCollaborationEvents;
  private static socket: Socket;
  private static isConnected: boolean = false;
  private static currentProductId: string | null = null;
  private static isRoomJoined: boolean = false;

  private static edgeEventHandler?: (
    eventName:
      | "edges_create"
      | "edges_update"
      | "edges_delete"
      | "edges_replace",
    payload: any,
  ) => void;

  private static featureEventHandler?: (
    eventName:
      | "features_create"
      | "features_update"
      | "features_delete"
      | "reorder_features",
    payload: any,
  ) => void;

  private static nodeEventHandler?: (
    eventName:
      | "nodes_create"
      | "nodes_update"
      | "nodes_delete"
      | "nodes_replace",
    payload: any,
  ) => void;

  // Batching mechanism for node updates
  private pendingNodeUpdates: Map<
    string,
    {
      nodeId: string;
      updates: {
        description?: { old: string; new: string };
        image?: { old?: string; new?: string };
        position?: { old: Position; new: Position };
      };
    }
  > = new Map();
  private nodeUpdateBatchTimer: NodeJS.Timeout | null = null;

  // Handler for flows_create events (to be set by React code)
  private static flowsCreateHandler: ((flows: Flow[]) => void) | null = null;
  static setFlowsCreateHandler(handler: (flows: Flow[]) => void) {
    ConsoleCollaborationEvents.flowsCreateHandler = handler;
  }

  // Handler for flows_delete events (to be set by React code)
  private static flowsDeleteHandler: ((flows: Flow[]) => void) | null = null;
  static setFlowsDeleteHandler(handler: (flows: Flow[]) => void) {
    ConsoleCollaborationEvents.flowsDeleteHandler = handler;
  }

  // Handler for flows_update events (to be set by React code)
  private static flowsUpdateHandler: ((flows: Flow[]) => void) | null = null;
  static setFlowsUpdateHandler(handler: (flows: Flow[]) => void) {
    ConsoleCollaborationEvents.flowsUpdateHandler = handler;
  }

  // Handler for credential_add events (to be set by React code)
  private static credentialAddHandler:
    | ((credential: {
        id: string;
        credentials: Record<string, string>;
        description: string;
        product_id: string;
        created_at: string;
        updated_at: string | null;
      }) => void)
    | null = null;
  static setCredentialAddHandler(
    handler: (credential: {
      id: string;
      credentials: Record<string, string>;
      description: string;
      product_id: string;
      created_at: string;
      updated_at: string | null;
    }) => void,
  ) {
    ConsoleCollaborationEvents.credentialAddHandler = handler;
  }

  constructor(productId?: string) {
    // Use singleton pattern to prevent multiple connections
    if (ConsoleCollaborationEvents.instance) {
      // If product ID changed, reconnect to the new room
      if (
        productId &&
        ConsoleCollaborationEvents.currentProductId !== productId
      ) {
        this.switchToProductRoom(productId);
      }
      return ConsoleCollaborationEvents.instance;
    }

    // Only create connection if not already connected
    if (!ConsoleCollaborationEvents.isConnected) {
      this.initializeConnection(productId);
    }

    ConsoleCollaborationEvents.instance = this;
  }

  // Cleanup method for timers and pending operations
  private cleanup(): void {
    if (this.nodeUpdateBatchTimer) {
      clearTimeout(this.nodeUpdateBatchTimer);
      this.nodeUpdateBatchTimer = null;
    }
    this.pendingNodeUpdates.clear();
  }

  // Method to switch to a different product room
  private switchToProductRoom(productId: string): void {
    if (ConsoleCollaborationEvents.currentProductId) {
      // Leave the current room
      this.socket.emit("leave_room", {
        room_id: ConsoleCollaborationEvents.currentProductId,
      });
      console.log(
        `🚪 Left room for product: ${ConsoleCollaborationEvents.currentProductId}`,
      );
    }

    // Reset room joined status
    ConsoleCollaborationEvents.isRoomJoined = false;

    // Join the new room
    this.joinProductRoom(productId, ConsoleCollaborationEvents.socket.id || "");
  }

  // Method to make API call to join room - simplified, no promises
  private callJoinRoomAPI(productId: string, sessionId: string): void {
    console.log(`🌐 Making API call to join room for product: ${productId}`);

    fetch(`${GRAPH_COLLABORATION_SERVER_URL}/join-room`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        room_id: productId,
        session_id: sessionId,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          console.error(`❌ API call failed with status: ${response.status}`);
          ConsoleCollaborationEvents.isRoomJoined = false;
          // Retry after 30 seconds
          setTimeout(() => {
            console.log(`🔄 Retrying room join for product: ${productId}`);
            this.callJoinRoomAPI(productId, sessionId);
          }, 30000);
          return;
        }
        return response.json();
      })
      .then((data) => {
        if (data) {
          console.log(`✅ API call successful:`, data);
          ConsoleCollaborationEvents.isRoomJoined = true;
        }
      })
      .catch((error) => {
        console.error(`❌ API call failed:`, error);
        ConsoleCollaborationEvents.isRoomJoined = false;
        // Retry after 30 seconds
        setTimeout(() => {
          console.log(`🔄 Retrying room join for product: ${productId}`);
          this.callJoinRoomAPI(productId, sessionId);
        }, 30000);
      });
  }

  // Method to join a specific product room
  private joinProductRoom(productId: string, sessionId: string): void {
    ConsoleCollaborationEvents.currentProductId = productId;
    console.log(`🚪 Attempting to join room for product: ${productId}`);
    console.log(`Session ID: ${sessionId}`);

    // Make the API call to join the room
    this.callJoinRoomAPI(productId, sessionId);
  }

  // Static method to initialize collaboration with product ID
  static initializeForProduct(productId: string): ConsoleCollaborationEvents {
    // Don't initialize if no product ID provided
    if (!productId) {
      console.warn(
        "⚠️ No product ID provided for collaboration initialization",
      );
      return (
        ConsoleCollaborationEvents.instance || new ConsoleCollaborationEvents()
      );
    }

    const instance = new ConsoleCollaborationEvents(productId);

    // If already connected but different product, switch rooms
    if (
      ConsoleCollaborationEvents.isConnected &&
      ConsoleCollaborationEvents.currentProductId !== productId
    ) {
      instance.switchToProductRoom(productId);
    }

    return instance;
  }

  // Method to check if room is successfully joined
  static isRoomReady(): boolean {
    return ConsoleCollaborationEvents.isRoomJoined;
  }

  // Method to wait for room to be ready
  static async waitForRoomReady(): Promise<boolean> {
    return ConsoleCollaborationEvents.isRoomJoined;
  }

  // Method to get current product ID
  static getCurrentProductId(): string | null {
    return ConsoleCollaborationEvents.currentProductId;
  }

  static setEdgeEventHandler(
    handler?:
      | ((
          eventName:
            | "edges_create"
            | "edges_update"
            | "edges_delete"
            | "edges_replace",
          payload: any,
        ) => void)
      | undefined,
  ): void {
    // UI layers register their edge event handler here. We store it so that when
    // socket events arrive, we can forward them without the UI ever touching the
    // socket itself.
    ConsoleCollaborationEvents.edgeEventHandler = handler;
  }

  static setFeatureEventHandler(
    handler?:
      | ((
          eventName:
            | "features_create"
            | "features_update"
            | "features_delete"
            | "reorder_features",
          payload: any,
        ) => void)
      | undefined,
  ): void {
    ConsoleCollaborationEvents.featureEventHandler = handler;
  }
  static setNodeEventHandler(
    handler?:
      | ((
          eventName:
            | "nodes_create"
            | "nodes_update"
            | "nodes_delete"
            | "nodes_replace",
          payload: any,
        ) => void)
      | undefined,
  ): void {
    ConsoleCollaborationEvents.nodeEventHandler = handler;
  }

  private initializeConnection(productId?: string): void {
    // Connect to the collaboration server
    ConsoleCollaborationEvents.socket = io(
      `${GRAPH_COLLABORATION_SERVER_URL}/`,
      {
        transports: ["websocket", "polling"],
        timeout: 20000,
        forceNew: true,
      },
    );

    // Set up connection event handler
    ConsoleCollaborationEvents.socket.on("connect", () => {
      console.log("🔌 Connected to collaboration server");
      console.log(
        "Socket ID:",
        ConsoleCollaborationEvents.socket.id,
        ConsoleCollaborationEvents.currentProductId,
      );

      // Join the product room if product ID is provided
      if (ConsoleCollaborationEvents.currentProductId) {
        this.joinProductRoom(
          ConsoleCollaborationEvents.currentProductId,
          ConsoleCollaborationEvents.socket.id || "",
        );
      } else {
        console.warn("⚠️ No product ID provided for collaboration room");
      }
    });

    // Forward socket edge events to whichever hook/component registered a handler.
    // This keeps socket code centralized here while UI layers just provide handlers.
    ConsoleCollaborationEvents.socket.on("edges_create", (edges: any) => {
      ConsoleCollaborationEvents.edgeEventHandler?.("edges_create", edges);
    });

    ConsoleCollaborationEvents.socket.on("edges_update", (edges: any) => {
      ConsoleCollaborationEvents.edgeEventHandler?.("edges_update", edges);
    });

    ConsoleCollaborationEvents.socket.on("edges_delete", (edgeIds: any) => {
      ConsoleCollaborationEvents.edgeEventHandler?.("edges_delete", edgeIds);
    });

    ConsoleCollaborationEvents.socket.on("edges_replace", (edges: any) => {
      ConsoleCollaborationEvents.edgeEventHandler?.("edges_replace", edges);
    });

    ConsoleCollaborationEvents.socket.on("features_create", (features: any) => {
      ConsoleCollaborationEvents.featureEventHandler?.(
        "features_create",
        features,
      );
    });

    ConsoleCollaborationEvents.socket.on("features_update", (features: any) => {
      ConsoleCollaborationEvents.featureEventHandler?.(
        "features_update",
        features,
      );
    });

    ConsoleCollaborationEvents.socket.on("features_delete", (features: any) => {
      ConsoleCollaborationEvents.featureEventHandler?.(
        "features_delete",
        features,
      );
    });

    ConsoleCollaborationEvents.socket.on(
      "reorder_features",
      (features: any) => {
        ConsoleCollaborationEvents.featureEventHandler?.(
          "reorder_features",
          features,
        );
      },
    );

    ConsoleCollaborationEvents.socket.on("nodes_create", (nodes: any) => {
      ConsoleCollaborationEvents.nodeEventHandler?.("nodes_create", nodes);
    });

    ConsoleCollaborationEvents.socket.on("nodes_update", (nodes: any) => {
      ConsoleCollaborationEvents.nodeEventHandler?.("nodes_update", nodes);
    });

    ConsoleCollaborationEvents.socket.on("nodes_delete", (nodeIds: any) => {
      ConsoleCollaborationEvents.nodeEventHandler?.("nodes_delete", nodeIds);
    });

    ConsoleCollaborationEvents.socket.on("nodes_replace", (nodes: any) => {
      ConsoleCollaborationEvents.nodeEventHandler?.("nodes_replace", nodes);
    });
    ConsoleCollaborationEvents.socket.on(
      COLLABORATION_EVENT_TYPES.FLOWS_CREATE,
      (data) => {
        let flows: Flow[] = [];
        if (Array.isArray(data.data.data)) {
          flows = data.data.data;
        } else if (
          data.data.data.flows &&
          Array.isArray(data.data.data.flows)
        ) {
          flows = data.data.data.flows;
        }
        if (ConsoleCollaborationEvents.flowsCreateHandler && flows.length > 0) {
          ConsoleCollaborationEvents.flowsCreateHandler(flows);
        }
      },
    );
    ConsoleCollaborationEvents.socket.on(
      COLLABORATION_EVENT_TYPES.FLOWS_DELETE,
      (data) => {
        let flows: Flow[] = [];
        if (Array.isArray(data.data.data)) {
          flows = data.data.data;
        } else if (
          data.data.data.flows &&
          Array.isArray(data.data.data.flows)
        ) {
          flows = data.data.data.flows;
        }
        if (ConsoleCollaborationEvents.flowsDeleteHandler && flows.length > 0) {
          ConsoleCollaborationEvents.flowsDeleteHandler(flows);
        }
      },
    );
    ConsoleCollaborationEvents.socket.on(
      COLLABORATION_EVENT_TYPES.FLOWS_UPDATE,
      (data) => {
        let flows: Flow[] = [];
        if (Array.isArray(data.data.data)) {
          flows = data.data.data;
        } else if (
          data.data.data.flows &&
          Array.isArray(data.data.data.flows)
        ) {
          flows = data.data.data.flows;
        }
        if (ConsoleCollaborationEvents.flowsUpdateHandler && flows.length > 0) {
          ConsoleCollaborationEvents.flowsUpdateHandler(flows);
        }
      },
    );
    ConsoleCollaborationEvents.socket.on(
      COLLABORATION_EVENT_TYPES.FLOWS_REPLACE,
      (data) => {
        let flows: Flow[] = [];
        if (Array.isArray(data.data.data)) {
          flows = data.data.data;
        } else if (
          data.data.data.flows &&
          Array.isArray(data.data.data.flows)
        ) {
          flows = data.data.data.flows;
        }
        if (ConsoleCollaborationEvents.flowsUpdateHandler && flows.length > 0) {
          ConsoleCollaborationEvents.flowsUpdateHandler(flows);
        }
      },
    );

    ConsoleCollaborationEvents.socket.on(
      COLLABORATION_EVENT_TYPES.AI_PLANNED_FLOWS,
      (data) => {
        let flows: Flow[] = [];
        if (Array.isArray(data.data.data)) {
          flows = data.data.data;
        } else if (
          data.data.data.flows &&
          Array.isArray(data.data.data.flows)
        ) {
          flows = data.data.data.flows;
        }
        if (ConsoleCollaborationEvents.flowsUpdateHandler && flows.length > 0) {
          ConsoleCollaborationEvents.flowsUpdateHandler(flows);
        }
      },
    );

    // Listener for credential_add events
    ConsoleCollaborationEvents.socket.on("credential_add", (data: any) => {
      // Unwrap the nested payload: {session_id, room_id, timestamp, data: {type: 'credential_add', data: {...}}}
      const credentialPayload = data?.data?.data;
      if (
        ConsoleCollaborationEvents.credentialAddHandler &&
        credentialPayload
      ) {
        ConsoleCollaborationEvents.credentialAddHandler(credentialPayload);
      }
    });

    // Generalized listener for ALL incoming events
    // ConsoleCollaborationEvents.socket.on("collaboration_event", (data) => {
    //   console.log("📨 Received collaboration event:", data);
    //   // Handle flows_create event
    //   if (
    //     data?.data?.type === COLLABORATION_EVENT_TYPES.FLOWS_CREATE &&
    //     data?.data?.data
    //   ) {
    //     let flows: Flow[] = [];
    //     if (Array.isArray(data.data.data)) {
    //       flows = data.data.data;
    //     } else if (
    //       data.data.data.flows &&
    //       Array.isArray(data.data.data.flows)
    //     ) {
    //       flows = data.data.data.flows;
    //     }
    //     if (ConsoleCollaborationEvents.flowsCreateHandler && flows.length > 0) {
    //       ConsoleCollaborationEvents.flowsCreateHandler(flows);
    //     }
    //   }
    //   // Handle flows_delete event
    //   if (
    //     data?.data?.type === COLLABORATION_EVENT_TYPES.FLOWS_DELETE &&
    //     data?.data?.data
    //   ) {
    //     let flows: Flow[] = [];
    //     if (Array.isArray(data.data.data)) {
    //       flows = data.data.data;
    //     } else if (
    //       data.data.data.flows &&
    //       Array.isArray(data.data.data.flows)
    //     ) {
    //       flows = data.data.data.flows;
    //     }
    //     if (ConsoleCollaborationEvents.flowsDeleteHandler && flows.length > 0) {
    //       ConsoleCollaborationEvents.flowsDeleteHandler(flows);
    //     }
    //   }
    //   // Handle flows_update event
    //   if (
    //     (data?.data?.type === COLLABORATION_EVENT_TYPES.FLOWS_UPDATE ||
    //       data?.data?.type === COLLABORATION_EVENT_TYPES.AI_PLANNED_FLOWS) &&
    //     data?.data?.data
    //   ) {
    //     let flows: Flow[] = [];
    //     if (Array.isArray(data.data.data)) {
    //       flows = data.data.data;
    //     } else if (
    //       data.data.data.flows &&
    //       Array.isArray(data.data.data.flows)
    //     ) {
    //       flows = data.data.data.flows;
    //     }
    //     if (ConsoleCollaborationEvents.flowsUpdateHandler && flows.length > 0) {
    //       ConsoleCollaborationEvents.flowsUpdateHandler(flows);
    //     }
    //   }
    // });

    // Add error handling
    ConsoleCollaborationEvents.socket.on("connect_error", (error) => {
      console.error("❌ Connection error:", error);
    });

    ConsoleCollaborationEvents.socket.on("disconnect", (reason) => {
      console.log("🔌 Disconnected from collaboration server:", reason);
      ConsoleCollaborationEvents.isRoomJoined = false;
    });

    // Handle connection events
    ConsoleCollaborationEvents.socket.on("room_joined", (data) => {
      console.log("🟢 Joined collaboration room:", data);
      ConsoleCollaborationEvents.isRoomJoined = true;
    });

    ConsoleCollaborationEvents.socket.on("user_joined", (data) => {
      console.log("👤 User joined room:", data);
    });

    ConsoleCollaborationEvents.socket.on("user_left", (data) => {
      console.log("👋 User left room:", data);
    });

    // Add error handler for room joining
    ConsoleCollaborationEvents.socket.on("error", (error) => {
      console.error("❌ Socket error:", error);
    });

    ConsoleCollaborationEvents.isConnected = true;
  }

  private get socket(): Socket {
    return ConsoleCollaborationEvents.socket;
  }

  private createEvent<T extends CollaborationEvent>(
    type: T["type"],
    data: Omit<T, "type" | "userId" | "timestamp">,
    userId: string = "USER_ID",
  ): T {
    return {
      type,
      userId,
      timestamp: new Date().toISOString(),
      ...data,
    } as T;
  }

  createNode(
    nodeId: string,
    position: Position,
    data: CustomNodeData,
    userId?: string,
  ): void {
    // Convert single operation to batch operation with array of one item
    this.createNodes([{ nodeId, position, data }], userId);
  }

  createNodes(
    nodes: Array<{
      nodeId: string;
      position: Position;
      data: CustomNodeData;
    }>,
    userId?: string,
  ): void {
    console.log(
      `🔹 Node Creation: ${nodes.length} node${nodes.length === 1 ? "" : "s"}`,
    );

    // Emit array of nodes to backend
    const nodeCreateData = nodes.map((node) => ({
      id: node.nodeId,
      x: node.position.x,
      y: node.position.y,
      title: node.data.description || "New Node",
      type: "rectangle",
      description: node.data.description || "",
      width: 150,
      height: 80,
      color: "#3498db",
      metadata: node.data,
    }));

    console.log("🌐 Emitting nodes_create to server:", nodeCreateData);
    this.socket.emit("nodes_create", nodeCreateData);
  }

  deleteNode(
    nodeId: string,
    position: Position,
    data: CustomNodeData,
    userId?: string,
  ): void {
    // Convert single operation to batch operation with array of one item
    this.deleteNodes([{ nodeId, position, data }], userId);
  }

  deleteNodes(
    nodes: Array<{
      nodeId: string;
      position: Position;
      data: CustomNodeData;
    }>,
    userId?: string,
  ): void {
    console.log(
      `🗑️ Node Deletion: ${nodes.length} node${nodes.length === 1 ? "" : "s"}`,
    );

    // Emit array of node IDs to backend
    const nodeDeleteData = nodes.map((node) => node.nodeId);

    console.log("🌐 Emitting nodes_delete to server:", nodeDeleteData);
    this.socket.emit("nodes_delete", nodeDeleteData);
  }

  updateNode(
    nodeId: string,
    updates: {
      description?: { old: string; new: string };
      image?: { old?: string; new?: string };
      position?: { old: Position; new: Position };
    },
    userId?: string,
  ): void {
    // Simply call updateNodes with a single node - batching happens at updateNodes level
    this.updateNodes([{ nodeId, updates }], userId);
  }

  updateNodes(
    nodes: Array<{
      nodeId: string;
      updates: {
        description?: { old: string; new: string };
        image?: { old?: string; new?: string };
        position?: { old: Position; new: Position };
      };
    }>,
    userId?: string,
  ): void {
    // Add all nodes to pending updates (this will merge multiple calls)
    nodes.forEach((node) => {
      // Merge updates for the same node
      const existing = this.pendingNodeUpdates.get(node.nodeId);
      if (existing) {
        // Merge the updates
        this.pendingNodeUpdates.set(node.nodeId, {
          nodeId: node.nodeId,
          updates: {
            ...existing.updates,
            ...node.updates,
          },
        });
      } else {
        this.pendingNodeUpdates.set(node.nodeId, node);
      }
    });

    // Clear existing timer and set a new one to batch updates
    if (this.nodeUpdateBatchTimer) {
      clearTimeout(this.nodeUpdateBatchTimer);
    }

    this.nodeUpdateBatchTimer = setTimeout(() => {
      if (this.pendingNodeUpdates.size > 0) {
        const batchUpdates = Array.from(this.pendingNodeUpdates.values());
        this._emitNodeUpdates(batchUpdates, userId);

        // Clear pending updates
        this.pendingNodeUpdates.clear();
      }
    }, 10); // Short delay to collect rapid calls
  }

  // Internal method that actually emits the updates
  private _emitNodeUpdates(
    nodes: Array<{
      nodeId: string;
      updates: {
        description?: { old: string; new: string };
        image?: { old?: string; new?: string };
        position?: { old: Position; new: Position };
      };
    }>,
    userId?: string,
  ): void {
    console.log(
      `🔄 Node Update: ${nodes.length} node${nodes.length === 1 ? "" : "s"}`,
    );

    // Emit array of node updates to backend
    const nodeUpdateData = nodes.map((node) => ({
      id: node.nodeId,
      updates: {
        description: node.updates.description
          ? {
              old: node.updates.description.old,
              new: node.updates.description.new,
            }
          : undefined,
        image: node.updates.image
          ? {
              old: node.updates.image.old,
              new: node.updates.image.new,
            }
          : undefined,
        position: node.updates.position
          ? {
              old: {
                x: node.updates.position.old.x,
                y: node.updates.position.old.y,
              },
              new: {
                x: node.updates.position.new.x,
                y: node.updates.position.new.y,
              },
            }
          : undefined,
      },
    }));

    console.log("🌐 Emitting nodes_update to server:", nodeUpdateData);
    this.socket.emit("nodes_update", nodeUpdateData);
  }

  createEdge(
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    sourceHandle: string | undefined,
    targetHandle: string | undefined,
    data: CustomEdgeData,
    userId?: string,
  ): void {
    // Convert single operation to batch operation with array of one item
    this.createEdges(
      [
        {
          edgeId,
          sourceNodeId,
          targetNodeId,
          sourceHandle,
          targetHandle,
          data,
        },
      ],
      userId,
    );
  }

  createEdges(
    edges: Array<{
      edgeId: string;
      sourceNodeId: string;
      targetNodeId: string;
      sourceHandle: string | undefined;
      targetHandle: string | undefined;
      data: CustomEdgeData;
    }>,
    userId?: string,
  ): void {
    console.log(
      `🔗 Edge Creation: ${edges.length} edge${edges.length === 1 ? "" : "s"}`,
    );

    // Emit array of edges to backend
    const edgeCreateData = edges.map((edge) => ({
      id: edge.edgeId,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      source_anchor: edge.sourceHandle,
      target_anchor: edge.targetHandle,
      label: edge.data.description,
      business_logic: edge.data.business_logic || "",
      curvature: edge.data.curvature || 0,
      type: "arrow",
      style: "solid",
    }));

    console.log("🌐 Emitting edges_create to server:", edgeCreateData);
    this.socket.emit("edges_create", edgeCreateData);
  }

  deleteEdge(
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    sourceHandle: string | undefined,
    targetHandle: string | undefined,
    data: CustomEdgeData,
    userId?: string,
  ): void {
    // Convert single operation to batch operation with array of one item
    this.deleteEdges(
      [
        {
          edgeId,
          sourceNodeId,
          targetNodeId,
          sourceHandle,
          targetHandle,
          data,
        },
      ],
      userId,
    );
  }

  deleteEdges(
    edges: Array<{
      edgeId: string;
      sourceNodeId: string;
      targetNodeId: string;
      sourceHandle: string | undefined;
      targetHandle: string | undefined;
      data: CustomEdgeData;
    }>,
    userId?: string,
  ): void {
    console.log(
      `🗑️ Edge Deletion: ${edges.length} edge${edges.length === 1 ? "" : "s"}`,
    );

    // Emit array of edge IDs to backend
    const edgeDeleteData = edges.map((edge) => edge.edgeId);

    console.log("🌐 Emitting edges_delete to server:", edgeDeleteData);
    this.socket.emit("edges_delete", edgeDeleteData);
  }

  updateEdge(
    edgeId: string,
    updates: {
      description?: { old?: string; new?: string };
      business_logic?: { old?: string; new?: string };
      curvature?: { old?: number; new?: number };
      anchors?: {
        oldSourceNodeId: string;
        newSourceNodeId: string;
        oldTargetNodeId: string;
        newTargetNodeId: string;
        oldSourceHandle?: string;
        newSourceHandle?: string;
        oldTargetHandle?: string;
        newTargetHandle?: string;
      };
    },
    userId?: string,
  ): void {
    // Convert single operation to batch operation with array of one item
    this.updateEdges([{ edgeId, updates }], userId);
  }

  updateEdges(
    edges: Array<{
      edgeId: string;
      updates: {
        description?: { old?: string; new?: string };
        business_logic?: { old?: string; new?: string };
        curvature?: { old?: number; new?: number };
        anchors?: {
          oldSourceNodeId: string;
          newSourceNodeId: string;
          oldTargetNodeId: string;
          newTargetNodeId: string;
          oldSourceHandle?: string;
          newSourceHandle?: string;
          oldTargetHandle?: string;
          newTargetHandle?: string;
        };
      };
    }>,
    userId?: string,
  ): void {
    console.log(
      `🔄 Edge Update: ${edges.length} edge${edges.length === 1 ? "" : "s"}`,
    );

    // Emit array of edge updates to backend
    const edgeUpdateData = edges.map((edge) => ({
      id: edge.edgeId,
      updates: {
        description: edge.updates.description
          ? {
              old: edge.updates.description.old,
              new: edge.updates.description.new,
            }
          : undefined,
        business_logic: edge.updates.business_logic
          ? {
              old: edge.updates.business_logic.old,
              new: edge.updates.business_logic.new,
            }
          : undefined,
        curvature: edge.updates.curvature
          ? {
              old: edge.updates.curvature.old,
              new: edge.updates.curvature.new,
            }
          : undefined,
        anchors: edge.updates.anchors
          ? {
              old_source: edge.updates.anchors.oldSourceNodeId,
              new_source: edge.updates.anchors.newSourceNodeId,
              old_target: edge.updates.anchors.oldTargetNodeId,
              new_target: edge.updates.anchors.newTargetNodeId,
              old_source_anchor: edge.updates.anchors.oldSourceHandle,
              new_source_anchor: edge.updates.anchors.newSourceHandle,
              old_target_anchor: edge.updates.anchors.oldTargetHandle,
              new_target_anchor: edge.updates.anchors.newTargetHandle,
            }
          : undefined,
      },
    }));

    console.log("🌐 Emitting edges_update to server:", edgeUpdateData);
    this.socket.emit("edges_update", edgeUpdateData);
  }

  createFeatures(features: Feature[], userId?: string): void {
    const event = this.createEvent<FeaturesCreateEvent>(
      COLLABORATION_EVENT_TYPES.FEATURES_CREATE,
      {
        feature: features,
      },
      userId,
    );

    console.log("✨ Features Created:", event);

    const featuresData = features.map((f) => ({
      id: f.id,
      name: f.name,
      nodeIds: f.nodeIds,
      collapsed: f.isCollapsed || false,
    }));

    console.log("🌐 Emitting features_create to server:", featuresData);
    this.socket.emit("features_create", featuresData);
  }

  updateFeatures(
    updates: Array<{
      featureId: string;
      updates: {
        name?: { old: string; new: string };
        nodeIds?: { old: string[]; new: string[] };
      };
    }>,
    userId?: string,
  ): void {
    const event = this.createEvent<FeaturesUpdateEvent>(
      COLLABORATION_EVENT_TYPES.FEATURES_UPDATE,
      {
        updates,
      },
      userId,
    );

    console.log("🔄 Features Updated:", event);

    const featuresUpdateData = updates.map((u) => ({
      id: u.featureId,
      updates: {
        name: u.updates.name
          ? { old: u.updates.name.old, new: u.updates.name.new }
          : undefined,
        nodeIds: u.updates.nodeIds
          ? { old: u.updates.nodeIds.old, new: u.updates.nodeIds.new }
          : undefined,
      },
    }));

    console.log("Sent to server:", featuresUpdateData);
    this.socket.emit("features_update", featuresUpdateData);
  }

  deleteFeatures(features: Feature[], userId?: string): void {
    const event = this.createEvent<FeaturesDeleteEvent>(
      COLLABORATION_EVENT_TYPES.FEATURES_DELETE,
      {
        feature: features,
      },
      userId,
    );

    console.log("🗑️ Features Deleted:", event);
    const featuresDeleteData = features.map((f) => ({ id: f.id }));

    console.log("Sent to server:", featuresDeleteData);
    this.socket.emit("features_delete", featuresDeleteData);
  }
  reorderFeatures(features: Feature[], userId?: string): void {
    const event = this.createEvent<ReorderFeaturesEvent>(
      COLLABORATION_EVENT_TYPES.REORDER_FEATURES,
      {
        features,
      },
      userId,
    );

    console.log("🔀 Features Reordered:", event);
    const featuresData = features.map((f) => ({
      id: f.id,
      name: f.name,
      nodeIds: f.nodeIds,
      collapsed: f.isCollapsed || false,
    }));

    console.log("Sent to server:", featuresData);
    this.socket.emit("reorder_features", featuresData);
  }
  createFlow(flow: Flow, userId?: string): void {
    const event = this.createEvent<FlowCreateEvent>(
      COLLABORATION_EVENT_TYPES.FLOW_CREATE,
      {
        flow,
      },
      userId,
    );

    console.log("🌊 Flow Created:", event);

    // Emit to backend
    const flowCreateData = {
      id: flow.id,
      name: flow.name,
      startNodeId: flow.startNodeId,
      endNodeId: flow.endNodeId,
      viaNodeIds: flow.viaNodeIds,
      pathNodeIds: flow.pathNodeIds,
      precondition: flow.precondition || "",
      description: flow.description || "",
      credentials: flow.credentials || {},
      scenarios: flow.scenarios || [],
      autoPlan: flow.autoPlan || false,
      videoUrl: flow.videoUrl || null,
      feature_id: flow.feature_id || null,
    };
    console.log("Sent to server:", flowCreateData);
    this.socket.emit("flow_create", flowCreateData);
  }

  createFlows(flows: Flow[], userId?: string): void {
    const event = this.createEvent<FlowsCreateEvent>(
      COLLABORATION_EVENT_TYPES.FLOWS_CREATE,
      {
        flows,
      },
      userId,
    );

    console.log("🌊 Flows Created:", event);
    const flowsCreateData = flows.map((flow) => ({
      id: flow.id,
      name: flow.name,
      startNodeId: flow.startNodeId,
      endNodeId: flow.endNodeId,
      viaNodeIds: flow.viaNodeIds,
      pathNodeIds: flow.pathNodeIds,
      precondition: flow.precondition || "",
      description: flow.description || "",
      credentials: flow.credentials || [],
      scenarios: flow.scenarios || [],
      autoPlan: flow.autoPlan || false,
      videoUrl: flow.videoUrl || null,
      feature_id: flow.feature_id || null,
    }));

    console.log("Sent to server:", flowsCreateData);
    this.socket.emit("flows_create", flowsCreateData);
  }

  createAiPlannedFlows(flows: Flow[], userId?: string): void {
    const event = this.createEvent<AiPlannedFlowsEvent>(
      COLLABORATION_EVENT_TYPES.AI_PLANNED_FLOWS,
      {
        flows,
      },
      userId,
    );

    console.log("🤖 AI Planned Flows Created:", event);
    const aiPlannedFlowsData = flows.map((flow) => ({
      id: flow.id,
      name: flow.name,
      startNodeId: flow.startNodeId,
      endNodeId: flow.endNodeId,
      viaNodeIds: flow.viaNodeIds,
      pathNodeIds: flow.pathNodeIds,
      precondition: flow.precondition || "",
      description: flow.description || "",
      credentials: flow.credentials || [],
      scenarios: flow.scenarios || [],
      autoPlan: flow.autoPlan || false,
      videoUrl: flow.videoUrl || null,
      feature_id: flow.feature_id || null,
    }));

    console.log("Sent to server:", aiPlannedFlowsData);
    this.socket.emit("ai_planned_flows", aiPlannedFlowsData);
  }

  updateFlows(flows: Flow[], userId?: string): void {
    const event = this.createEvent<FlowsUpdateEvent>(
      COLLABORATION_EVENT_TYPES.FLOWS_UPDATE,
      {
        flows,
      },
      userId,
    );

    console.log("🔄 Flows Updated:", event);
    const flowsUpdateData = flows.map((flow) => ({
      id: flow.id,
      name: flow.name,
      startNodeId: flow.startNodeId,
      endNodeId: flow.endNodeId,
      viaNodeIds: flow.viaNodeIds,
      pathNodeIds: flow.pathNodeIds,
      precondition: flow.precondition || "",
      description: flow.description || "",
      credentials: flow.credentials || [],
      scenarios: flow.scenarios || [],
      autoPlan: flow.autoPlan || false,
      videoUrl: flow.videoUrl || null,
      feature_id: flow.feature_id || null,
    }));

    console.log("Sent to server:", flowsUpdateData);
    this.socket.emit("flows_update", flowsUpdateData);
  }

  deleteFlow(flow: Flow, userId?: string): void {
    // Convert single operation to batch operation with array of one item
    this.deleteFlows([flow], userId);
  }

  deleteFlows(flows: Flow[], userId?: string): void {
    const event = this.createEvent<FlowsDeleteEvent>(
      COLLABORATION_EVENT_TYPES.FLOWS_DELETE,
      {
        flows,
      },
      userId,
    );

    console.log("🗑️ Flows Deleted:", event);
    const flowsDeleteData = flows.map((flow) => ({
      id: flow.id,
    }));

    console.log("Sent to server:", flowsDeleteData);
    this.socket.emit("flows_delete", flowsDeleteData);
  }

  addComment(comment: Comment, position: Position, userId?: string): void {
    // Convert single operation to batch operation with array of one item
    this.addComments([comment], [position], userId);
  }

  updateComment(
    commentId: string,
    updates: {
      content?: { old: string; new: string };
      position?: { old: Position; new: Position };
    },
    userId?: string,
  ): void {
    // Convert single operation to batch operation with array of one item
    this.updateComments([{ commentId, updates }], userId);
  }

  deleteComment(commentId: string, userId?: string): void {
    const event = this.createEvent<CommentDeleteEvent>(
      COLLABORATION_EVENT_TYPES.COMMENT_DELETE,
      {
        commentId,
      },
      userId,
    );

    console.log("�️ Comment Deleted:", event);

    // Convert single operation to batch operation with array of one item
    this.deleteComments([{ commentId }], userId);
  }

  // Batch methods for comments
  addComments(
    comments: Array<Comment>,
    positions: Array<Position>,
    userId?: string,
  ): void {
    console.log(
      `🆕 Comment Add: ${comments.length} comment${comments.length === 1 ? "" : "s"}`,
    );

    // Build payload to match required schema:
    // { id, content, createdAt, updatedAt, position: { x, y } }
    const now = new Date().toISOString();
    const commentAddData = comments.map((comment, idx) => {
      const pos = (comment as any)?.position ||
        positions?.[idx] || { x: 0, y: 0 };
      return {
        id: comment.id,
        content: comment.content,
        createdAt: now,
        updatedAt: now,
        position: {
          x: pos.x,
          y: pos.y,
        },
      };
    });

    console.log("🌐 Emitting comments_create to server:", commentAddData);
    this.socket.emit("comments_create", commentAddData);
  }

  updateComments(
    comments: Array<{
      commentId: string;
      updates: {
        content?: { old: string; new: string };
        position?: { old: Position; new: Position };
      };
    }>,
    userId?: string,
  ): void {
    console.log(
      `🔄 Comment Update: ${comments.length} comment${comments.length === 1 ? "" : "s"}`,
    );

    // Emit array of comment updates to backend
    const commentUpdateData = comments.map((comment) => ({
      id: comment.commentId,
      updates: {
        content: comment.updates.content
          ? {
              old: comment.updates.content.old,
              new: comment.updates.content.new,
            }
          : undefined,
        position: comment.updates.position
          ? {
              old: {
                x: comment.updates.position.old.x,
                y: comment.updates.position.old.y,
              },
              new: {
                x: comment.updates.position.new.x,
                y: comment.updates.position.new.y,
              },
            }
          : undefined,
      },
    }));

    console.log("🌐 Emitting comments_update to server:", commentUpdateData);
    this.socket.emit("comments_update", commentUpdateData);
  }

  deleteComments(
    comments: Array<{
      commentId: string;
    }>,
    userId?: string,
  ): void {
    console.log(
      `🗑️ Comment Delete: ${comments.length} comment${comments.length === 1 ? "" : "s"}`,
    );

    // Emit array of comment deletions to backend
    const commentDeleteData = comments.map((comment) => ({
      id: comment.commentId,
    }));

    console.log("🌐 Emitting comments_delete to server:", commentDeleteData);
    this.socket.emit("comments_delete", commentDeleteData);
  }

  addCredential(
    credential: {
      id: string;
      credentials: Record<string, string>;
      description: string;
      product_id: string;
      created_at: string;
      updated_at: string | null;
    },
    userId?: string,
  ): void {
    const credentialData = {
      id: credential.id,
      credentials: credential.credentials,
      description: credential.description,
      product_id: credential.product_id,
      created_at: credential.created_at,
      updated_at: credential.updated_at,
    };

    this.socket.emit("credential_add", credentialData);
  }
}
