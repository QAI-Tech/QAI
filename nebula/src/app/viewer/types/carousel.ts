export interface Node {
  id: string;
  data: {
    image: string;
    description: string;
  };
}

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  data: {
    description: string;
  };
}
