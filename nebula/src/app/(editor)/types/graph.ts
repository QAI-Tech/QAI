import type { Scenario, Credential } from "@/lib/types";

export interface BackendMergeResponse {
  flow_ids?: string[];
}

export interface FlowEndpointRef {
  id: string;
}

export interface MergedFlow {
  id?: string;
  name?: string;
  startNodeId?: string;
  startNode?: FlowEndpointRef;
  endNodeId?: string;
  endNode?: FlowEndpointRef;
  viaNodeIds?: string[];
  viaNodes?: FlowEndpointRef[];
  pathNodeIds?: string[];
  nodeSequence?: FlowEndpointRef[];
  precondition?: string;
  description?: string;
  scenarios?: Scenario[];
  credentials?: Credential[];
  autoPlan?: boolean;
  videoUrl?: string;
  feature_id?: string;
}

export interface GraphPosition {
  x: number;
  y: number;
}

export interface GraphNodeData {
  originalPosition?: GraphPosition;
  isCollapsed?: boolean;
  [key: string]: unknown;
}

export interface GraphNodeExport {
  id: string;
  position: GraphPosition;
  originalPosition?: GraphPosition;
  data: GraphNodeData;
  type?: string;
  deletable?: boolean;
}

export interface GraphEdgeExport {
  id: string;
  source: string;
  target: string;
  type?: string;
  markerEnd?: { type: any; width: number; height: number };
  [key: string]: unknown;
}

export interface GraphExport {
  nodes: GraphNodeExport[];
  edges: GraphEdgeExport[];
}
