export interface Node {
  id: string;
  description: string;
  image?: string;
  position?: {
    x: number;
    y: number;
    z: number;
  };
}

export interface Edge {
  from: string;
  to: string;
  description: string;
}

export interface FlowData {
  nodes: Node[];
  edges: Edge[];
}

export interface JourneyPosition {
  current: number;
  target: number;
  isMoving: boolean;
}

export interface CameraState {
  position: {
    x: number;
    y: number;
    z: number;
  };
  target: {
    x: number;
    y: number;
    z: number;
  };
}
