import { Node, Edge, Connection } from "@xyflow/react";
import { Flow } from "../components/FlowManager";
import { PlanFlowState } from "../components/PlanFlowManager";

// Add proper interfaces for Edge and Node data
export interface CustomEdgeData {
  description?: string;
  rawInteraction?: string; // Raw interaction from web recorder
  business_logic?: string;
  paramValues?: string[];
  curvature?: number;
  isNewEdge?: boolean;
  source?: string;
  target?: string;
  sourceHandle?: string;
  targetHandle?: string;
  [key: string]: unknown;
}

export interface CustomNodeData {
  image?: string;
  description: string;
  title?: string; // Auto-generated title from the worker
  featureId?: string;
  isFeatureNode?: boolean;
  featureType?: string;
  featureData?: any;
  [key: string]: unknown;
}

// Extend the base types with our custom data
export type CustomEdge = Edge<CustomEdgeData>;
export type CustomNode = Node<CustomNodeData>;

export type GraphMode =
  | "select"
  | "addNode"
  | "addEdge"
  | "planFlow"
  | "groupPreview"
  | "addFeature";

export interface BaseHandlerProps {
  nodes: Node[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  mode: GraphMode;
  setMode: React.Dispatch<React.SetStateAction<GraphMode>>;
  undoRedo: {
    saveState: () => void;
  };
}

export interface PlanFlowHandlerProps extends BaseHandlerProps {
  planFlowState: PlanFlowState;
  setPlanFlowState: React.Dispatch<React.SetStateAction<PlanFlowState>>;
  flowManagement: {
    flows: Flow[];
  };
}

export interface FeatureHandlerProps extends BaseHandlerProps {
  featureManagement?: {
    getNodeFeature: (nodeId: string) => any;
  };
  editingFeatureId?: string | null;
}

export interface EdgeHandlerProps extends BaseHandlerProps {
  edgeSource: string | null;
  setEdgeSource: React.Dispatch<React.SetStateAction<string | null>>;
  edgeCounter: number;
  setEdgeCounter: React.Dispatch<React.SetStateAction<number>>;
  setSelectedEdge: React.Dispatch<React.SetStateAction<Edge | null>>;
}

export interface DeletionHandlerProps extends BaseHandlerProps {
  deleteManagement: {
    pendingDeletion: any;
    cancelDelete: () => void;
    confirmDelete: () => void;
  };
}

export interface UseGraphEventHandlersProps extends BaseHandlerProps {
  edgeSource: string | null;
  setEdgeSource: React.Dispatch<React.SetStateAction<string | null>>;
  edgeCounter: number;
  setEdgeCounter: React.Dispatch<React.SetStateAction<number>>;

  // Edge selection
  selectedEdge: Edge | null;
  setSelectedEdge: React.Dispatch<React.SetStateAction<Edge | null>>;

  // Plan flow state
  planFlowState: PlanFlowState;
  setPlanFlowState: React.Dispatch<React.SetStateAction<PlanFlowState>>;

  // Flow management
  flowManagement: {
    flows: Flow[];
  };

  // Other dependencies
  camera: {
    panToChoiceNodes: (branchNode: Node, choiceNodes: Node[]) => void;
    panToFlowPath: (flowNodes: Node[]) => void;
  };
  deleteManagement: {
    pendingDeletion: any;
    cancelDelete: () => void;
    confirmDelete: () => void;
  };
  featureManagement?: {
    getNodeFeature: (nodeId: string) => any;
    features: any[];
    setFeatures: React.Dispatch<React.SetStateAction<any[]>>;
  };
  editingFeatureId?: string | null;
  commentManagement?: {
    deleteComment: (commentId: string) => void;
    updateComment: (commentId: string, content: string) => void;
  };
}
