from typing import List, Optional, Dict
from pydantic import BaseModel, Field, field_validator


class NodeData(BaseModel):
    """
    Data payload for a graph node

    Attributes:
        image: Base64 encoded screenshot (optional)
        description: Screen description
    """

    image: Optional[str] = Field(None, description="Base64 encoded screenshot")
    description: str = Field(..., min_length=1, description="Screen description")
    detailed_description: Optional[str] = Field(
        None, description="Detailed screen description"
    )


class GraphNode(BaseModel):
    """
    Represents a node in the TC graph (corresponds to a Screen)

    Attributes:
        id: Unique node identifier (e.g., "node-exec-0000")
        type: Node type (always "customNode")
        position: X/Y coordinates on canvas
        data: Node data payload (image + description)

    Example:
        {
            "id": "node-exec-0000",
            "type": "customNode",
            "position": {"x": 16000, "y": 23000},
            "data": {
                "image": "data:image/jpeg;base64,...",
                "description": "Home Screen"
            }
        }
    """

    id: str = Field(
        ..., pattern=r"^node-exec-\d{4}$", description="Node ID (node-exec-XXXX)"
    )
    type: str = Field(default="customNode", description="Node type")
    position: Dict[str, float] = Field(..., description="Canvas position {x, y}")
    data: NodeData = Field(..., description="Node data")

    @field_validator("position")
    @classmethod
    def validate_position(cls, v: Dict[str, float]) -> Dict[str, float]:
        """Validate position has x and y coordinates"""
        if "x" not in v or "y" not in v:
            raise ValueError("Position must contain 'x' and 'y' coordinates")
        return v

    class Config:
        """Pydantic model configuration"""

        json_schema_extra = {
            "example": {
                "id": "node-exec-0000",
                "type": "customNode",
                "position": {"x": 16000.0, "y": 23000.0},
                "data": {
                    "image": "data:image/jpeg;base64,...",
                    "description": "Home Screen",
                    "detailed_description": "Home Screen with button to navigate to next screen",
                },
            }
        }


class EdgeData(BaseModel):
    """
    Data payload for a graph edge

    Attributes:
        description: Interaction description
        raw_interaction: Raw interaction from web recorder (optional)
        business_logic: Optional business logic annotation
        curvature: Edge curve amount (default 0 for linear)
        source_anchor: Source anchor point (default "right-source")
        target_anchor: Target anchor point (default "left-target")
    """

    description: str = Field(..., min_length=1, description="Interaction description")
    raw_interaction: Optional[str] = Field(
        default=None, description="Raw interaction from web recorder"
    )
    business_logic: str = Field(default="", description="Business logic annotation")
    curvature: float = Field(default=0, description="Edge curvature")
    source_anchor: str = Field(default="right-source", description="Source anchor")
    target_anchor: str = Field(default="left-target", description="Target anchor")


class GraphEdge(BaseModel):
    """
    Represents an edge in the TC graph (corresponds to an Interaction)

    Attributes:
        id: Unique edge identifier (e.g., "edge-exec-0000")
        source: Source node ID
        target: Target node ID
        sourceHandle: Source handle identifier
        targetHandle: Target handle identifier
        type: Edge type (always "customEdge")
        data: Edge data payload

    Example:
        {
            "id": "edge-exec-0000",
            "source": "node-exec-0000",
            "target": "node-exec-0001",
            "sourceHandle": "right-source",
            "targetHandle": "left-target",
            "type": "customEdge",
            "data": {
                "description": "Tap FlixBus app icon",
                "business_logic": "",
                "curvature": 0,
                "source_anchor": "right-source",
                "target_anchor": "left-target"
            }
        }
    """

    id: str = Field(
        ..., pattern=r"^edge-exec-\d{4}$", description="Edge ID (edge-exec-XXXX)"
    )
    source: str = Field(..., pattern=r"^node-exec-\d{4}$", description="Source node ID")
    target: str = Field(..., pattern=r"^node-exec-\d{4}$", description="Target node ID")
    sourceHandle: str = Field(default="right-source", description="Source handle")
    targetHandle: str = Field(default="left-target", description="Target handle")
    type: str = Field(default="customEdge", description="Edge type")
    data: EdgeData = Field(..., description="Edge data")

    @field_validator("source", "target")
    @classmethod
    def validate_no_self_loops(cls, v: str, info) -> str:
        """Validate no self-loops (source != target) for linear graphs"""
        if info.field_name == "target" and "source" in info.data:
            if v == info.data["source"]:
                raise ValueError(
                    f"Self-loops not allowed in linear graphs: source and target cannot be the same ({v})"
                )
        return v

    class Config:
        """Pydantic model configuration"""

        json_schema_extra = {
            "example": {
                "id": "edge-exec-0000",
                "source": "node-exec-0000",
                "target": "node-exec-0001",
                "sourceHandle": "right-source",
                "targetHandle": "left-target",
                "type": "customEdge",
                "data": {
                    "description": "Tap FlixBus app icon",
                    "business_logic": "",
                    "curvature": 0,
                    "source_anchor": "right-source",
                    "target_anchor": "left-target",
                },
            }
        }


class TCGraph(BaseModel):
    """
    Test Case Graph containing nodes and edges in strictly linear structure

    A valid linear graph must satisfy:
        - Nodes connected in a single chain
        - No branching: Each node has at most 1 outgoing edge
        - No merging: Each node has at most 1 incoming edge
        - No orphan nodes: All nodes are connected
        - No cycles: Strictly forward temporal flow

    Attributes:
        nodes: List of graph nodes (screens)
        edges: List of graph edges (interactions)

    Example:
        {
            "nodes": [
                {"id": "node-exec-0000", ...},
                {"id": "node-exec-0001", ...}
            ],
            "edges": [
                {"id": "edge-exec-0000", "source": "node-exec-0000", "target": "node-exec-0001", ...}
            ]
        }
    """

    nodes: List[GraphNode] = Field(..., min_length=1, description="List of graph nodes")
    edges: List[GraphEdge] = Field(..., description="List of graph edges")

    @field_validator("edges")
    @classmethod
    def validate_linear_structure(cls, v: List[GraphEdge], info) -> List[GraphEdge]:
        """
        Validate that the graph maintains a strictly linear structure:
        - No branching (no node has multiple outgoing edges)
        - No merging (no node has multiple incoming edges)
        """
        if "nodes" not in info.data:
            return v

        nodes = info.data["nodes"]
        node_ids = {node.id for node in nodes}

        # Count outgoing and incoming edges for each node
        outgoing_count: Dict[str, int] = {node_id: 0 for node_id in node_ids}
        incoming_count: Dict[str, int] = {node_id: 0 for node_id in node_ids}

        for edge in v:
            outgoing_count[edge.source] = outgoing_count.get(edge.source, 0) + 1
            incoming_count[edge.target] = incoming_count.get(edge.target, 0) + 1

        # Check for branching (node with multiple outgoing edges)
        branching_nodes = [
            node_id for node_id, count in outgoing_count.items() if count > 1
        ]
        if branching_nodes:
            raise ValueError(
                f"Graph branching detected: Nodes {branching_nodes} have multiple outgoing edges. "
                "Linear graphs require each node to have at most 1 outgoing edge."
            )

        # Check for merging (node with multiple incoming edges)
        merging_nodes = [
            node_id for node_id, count in incoming_count.items() if count > 1
        ]
        if merging_nodes:
            raise ValueError(
                f"Graph merging detected: Nodes {merging_nodes} have multiple incoming edges. "
                "Linear graphs require each node to have at most 1 incoming edge."
            )

        return v

    @field_validator("edges")
    @classmethod
    def validate_edges_reference_existing_nodes(
        cls, v: List[GraphEdge], info
    ) -> List[GraphEdge]:
        """Validate that all edges reference existing nodes"""
        if "nodes" not in info.data:
            return v

        node_ids = {node.id for node in info.data["nodes"]}

        for edge in v:
            if edge.source not in node_ids:
                raise ValueError(
                    f"Edge {edge.id} references non-existent source node: {edge.source}"
                )
            if edge.target not in node_ids:
                raise ValueError(
                    f"Edge {edge.id} references non-existent target node: {edge.target}"
                )

        return v

    def validate_no_orphan_nodes(self) -> bool:
        """
        Validate that all nodes are connected (no orphan nodes).
        Returns True if valid, raises ValueError if orphans found.
        """
        if len(self.nodes) == 1:
            # Single node is valid (no edges needed)
            return True

        node_ids = {node.id for node in self.nodes}
        connected_nodes = set()

        for edge in self.edges:
            connected_nodes.add(edge.source)
            connected_nodes.add(edge.target)

        orphan_nodes = node_ids - connected_nodes
        if orphan_nodes:
            raise ValueError(
                f"Orphan nodes detected: {orphan_nodes} are not connected to any edges. "
                "All nodes must be part of the linear flow."
            )

        return True

    def get_node_by_id(self, node_id: str) -> Optional[GraphNode]:
        """Get node by ID"""
        return next((node for node in self.nodes if node.id == node_id), None)

    def get_edge_by_id(self, edge_id: str) -> Optional[GraphEdge]:
        """Get edge by ID"""
        return next((edge for edge in self.edges if edge.id == edge_id), None)

    class Config:
        """Pydantic model configuration"""

        json_schema_extra = {
            "example": {
                "nodes": [
                    {
                        "id": "node-exec-0000",
                        "type": "customNode",
                        "position": {"x": 16000, "y": 23000},
                        "data": {"image": "...", "description": "Home Screen"},
                    }
                ],
                "edges": [
                    {
                        "id": "edge-exec-0000",
                        "source": "node-exec-0000",
                        "target": "node-exec-0001",
                        "type": "customEdge",
                        "data": {"description": "Tap button"},
                    }
                ],
            }
        }
