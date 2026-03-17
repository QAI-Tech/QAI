from typing import List, Optional, Dict, Any
from pydantic import BaseModel


class TestCaseParameter(BaseModel):
    parameter_name: str
    parameter_value: str

class Scenario(BaseModel):
    id: str
    description: str
    params: Optional[List[TestCaseParameter]] = None


class NodeData(BaseModel):
    image: Optional[str] = None
    description: str
    detailed_description: Optional[str] = None


class Node(BaseModel):
    id: str
    type: str
    position: Dict[str, float]
    data: NodeData


class EdgeData(BaseModel):
    description: str
    rawInteraction: Optional[str] = None  # Raw interaction from web recorder
    business_logic: Optional[str] = None
    curvature: Optional[float] = None
    source_anchor: Optional[str] = None
    target_anchor: Optional[str] = None


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
    videoUrl: Optional[str] = None
    autoPlan: bool = True
    description: Optional[str] = None
    feature_id: str
    product_id: str

class Feature(BaseModel):
    id: str
    name: str
    nodeIds: List[str]

class CommentPosition(BaseModel):
    x: float
    y: float

class Comment(BaseModel):
    id: str
    content: str
    createdAt: str
    updatedAt: str
    position: CommentPosition


# Operation Data Models

# Node Operation Data Models
class NodeCreateData(BaseModel):
    id: str
    x: float
    y: float
    title: str
    type: str = "rectangle"
    description: str
    width: int = 150
    height: int = 80
    color: str = "#3498db"
    metadata: Dict[str, Any]


class NodeDeleteData(BaseModel):
    id: str


class NodeDescriptionUpdate(BaseModel):
    old: str
    new: str


class NodeImageUpdate(BaseModel):
    old: Optional[str] = None
    new: Optional[str] = None


class NodePositionOld(BaseModel):
    x: float
    y: float


class NodePositionNew(BaseModel):
    x: float
    y: float


class NodePositionUpdate(BaseModel):
    old: NodePositionOld
    new: NodePositionNew


class NodeUpdates(BaseModel):
    description: Optional[NodeDescriptionUpdate] = None
    image: Optional[NodeImageUpdate] = None
    position: Optional[NodePositionUpdate] = None


class NodeUpdateData(BaseModel):
    id: str
    updates: NodeUpdates


# Edge Operation Data Models
class EdgeCreateData(BaseModel):
    id: str
    source: str
    target: str
    source_anchor: Optional[str] = None
    target_anchor: Optional[str] = None
    label: str
    type: str = "arrow"
    style: str = "solid"


class EdgeDeleteData(BaseModel):
    id: str


class EdgeDescriptionUpdate(BaseModel):
    old: Optional[str] = None
    new: Optional[str] = None


class EdgeAnchorsUpdate(BaseModel):
    old_source: str
    new_source: str
    old_target: str
    new_target: str
    old_source_anchor: Optional[str] = None
    new_source_anchor: Optional[str] = None
    old_target_anchor: Optional[str] = None
    new_target_anchor: Optional[str] = None


class EdgeUpdates(BaseModel):
    description: Optional[EdgeDescriptionUpdate] = None
    anchors: Optional[EdgeAnchorsUpdate] = None


class EdgeUpdateData(BaseModel):
    id: str
    updates: EdgeUpdates


# Feature Operation Data Models
class FeatureCreateData(BaseModel):
    id: str
    name: str
    nodeIds: List[str]
    collapsed: bool = False


class FeatureNameUpdate(BaseModel):
    old: str
    new: str


class FeatureNodeIdsUpdate(BaseModel):
    old: List[str]
    new: List[str]


class FeatureUpdates(BaseModel):
    name: Optional[FeatureNameUpdate] = None
    nodeIds: Optional[FeatureNodeIdsUpdate] = None


class FeatureUpdateData(BaseModel):
    id: str
    updates: FeatureUpdates


class FeatureDeleteData(BaseModel):
    id: str


# Flow Operation Data Models
class FlowCreateData(BaseModel):
    id: str
    name: str
    startNodeId: str
    endNodeId: str
    viaNodeIds: List[str]
    pathNodeIds: List[str]
    precondition: str = ""
    autoPlan: bool = False
    description: str = ""
    feature_id: str
    product_id: str


class FlowDeleteData(BaseModel):
    id: str


# Comment Operation Data Models
class CommentAddData(BaseModel):
    id: str
    x: float
    y: float
    text: str
    author: str = "Unknown User"


class CommentEditData(BaseModel):
    id: str
    text: str


class CommentMoveData(BaseModel):
    id: str
    x: float
    y: float


class CommentDeleteData(BaseModel):
    id: str


# Credential Operation Data Models
class CredentialAddData(BaseModel):
    id: str
    credentials: Dict[str, str]
    description: str
    product_id: str
    created_at: str
    updated_at: Optional[str] = None


# Operation Models
class NodeCreateOperation(BaseModel):
    type: str = "node_create"
    data: NodeCreateData


class NodeDeleteOperation(BaseModel):
    type: str = "node_delete"
    data: NodeDeleteData


class NodeUpdateOperation(BaseModel):
    type: str = "node_update"
    data: NodeUpdateData


class EdgeCreateOperation(BaseModel):
    type: str = "edge_create"
    data: EdgeCreateData


class EdgeDeleteOperation(BaseModel):
    type: str = "edge_delete"
    data: EdgeDeleteData


class EdgeUpdateOperation(BaseModel):
    type: str = "edge_update"
    data: EdgeUpdateData


class FeatureCreateOperation(BaseModel):
    type: str = "feature_create"
    data: FeatureCreateData


class FeatureUpdateOperation(BaseModel):
    type: str = "feature_update"
    data: FeatureUpdateData


class FeatureDeleteOperation(BaseModel):
    type: str = "feature_delete"
    data: FeatureDeleteData


class FlowCreateOperation(BaseModel):
    type: str = "flow_create"
    data: FlowCreateData


class FlowDeleteOperation(BaseModel):
    type: str = "flow_delete"
    data: FlowDeleteData


class CommentAddOperation(BaseModel):
    type: str = "comment_add"
    data: CommentAddData


class CommentEditOperation(BaseModel):
    type: str = "comment_edit"
    data: CommentEditData


class CommentMoveOperation(BaseModel):
    type: str = "comment_move"
    data: CommentMoveData


class CommentDeleteOperation(BaseModel):
    type: str = "comment_delete"
    data: CommentDeleteData


class CredentialAddOperation(BaseModel):
    type: str = "credential_add"
    data: CredentialAddData