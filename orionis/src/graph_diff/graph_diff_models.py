from typing import List, Optional, Dict, Any
from test_cases.test_case_models import (
    Scenario,
)
from pydantic import BaseModel


class NodeData(BaseModel):
    image: Optional[str] = None
    description: str


class Node(BaseModel):
    id: str
    type: str
    position: Dict[str, float]
    data: NodeData


class EdgeData(BaseModel):
    description: str


class Edge(BaseModel):
    id: str
    source: str
    target: str
    type: str
    data: EdgeData


class Graph(BaseModel):
    nodes: List[Node]
    edges: List[Edge]


class NodeAddition(BaseModel):
    id: str
    properties: Dict[str, Any]


class EdgeAddition(BaseModel):
    id: str
    source: str
    target: str
    properties: Dict[str, Any]


class Additions(BaseModel):
    nodes: List[NodeAddition]
    edges: List[EdgeAddition]


class NodeDeletion(BaseModel):
    id: str


class EdgeDeletion(BaseModel):
    id: str


class Deletions(BaseModel):
    nodes: List[NodeDeletion]
    edges: List[EdgeDeletion]


class NodeChange(BaseModel):
    id: str
    old_properties: Dict[str, Any]
    new_properties: Dict[str, Any]
    changed_fields: List[str]


class EdgeChange(BaseModel):
    id: str
    source: str
    target: str
    old_properties: Dict[str, Any]
    new_properties: Dict[str, Any]
    changed_fields: List[str]


class Changes(BaseModel):
    nodes: List[NodeChange]
    edges: List[EdgeChange]


class Flow(BaseModel):
    id: str
    name: str
    startNodeId: str
    endNodeId: str
    viaNodeIds: List[str]
    pathNodeIds: List[str]
    precondition: Optional[str] = None
    scenarios: Optional[List[Scenario]] = None
    credentials: Optional[List[str]] = None


class AffectedFlow(BaseModel):
    id: str
    name: str
    startNodeId: str
    endNodeId: str
    cause: str


class GraphDiff(BaseModel):
    additions: Additions
    deletions: Deletions
    changes: Changes


class FlowDiff(BaseModel):
    additions: List[Flow]
    deletions: List[Flow]
    affected_flows: List[AffectedFlow]


class DiffCheckResult(BaseModel):
    graph_diff: GraphDiff
    flow_diff: FlowDiff
