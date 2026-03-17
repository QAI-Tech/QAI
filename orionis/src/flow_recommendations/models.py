from enum import Enum
from typing import List, Optional, Dict
from pydantic import BaseModel, Field


class MergeType(str, Enum):
    """Type of merge operation for common screens"""

    SAME_EDGE = "SAME_EDGE"  # Same screen + Same edge description -> Simple merge
    DIFFERENT_EDGE = "DIFFERENT_EDGE"  # Same screen + Different edge -> Keep both edges


class FlowDepth(str, Enum):
    """Classification of flow depth in app graph"""

    SHALLOW = "SHALLOW"  # Closer to app start (e.g., login, home)
    DEEP = "DEEP"  # Deeper in app hierarchy (e.g., settings, checkout)


class NodeDescriptionDict(BaseModel):
    """Dictionary mapping node IDs to descriptions for a single flow"""

    flow_id: str
    nodes: Dict[str, str] = Field(
        ..., description="Mapping of node_id to screen description"
    )


class EdgeDescriptionDict(BaseModel):
    """Dictionary mapping edge info for a single flow"""

    flow_id: str
    edges: Dict[str, Dict[str, str]] = Field(
        ...,
        description="Mapping of edge_id to {source, target, description}",
    )


class ScreenMatch(BaseModel):
    """Represents a confirmed match between screens from different flows"""

    flow_a_node_id: str = Field(..., description="Node ID from first flow")
    flow_b_node_id: str = Field(..., description="Node ID from second flow")
    confidence: float = Field(
        default=1.0, ge=0.0, le=1.0, description="Match confidence score"
    )
    matched_by_description: bool = Field(
        default=False, description="Whether matched by description analysis"
    )
    matched_by_image: bool = Field(
        default=False, description="Whether confirmed by image analysis"
    )


class EdgeMatch(BaseModel):
    """Represents comparison result for edges leading to common screens"""

    flow_a_edge_id: str
    flow_b_edge_id: str
    are_same_action: bool = Field(
        ..., description="Whether edges describe the same user action"
    )
    merge_type: MergeType


class MergeRecommendation(BaseModel):
    """Recommendation for how to merge two flows at a common screen"""

    common_screen: ScreenMatch
    edge_comparison: Optional[EdgeMatch] = None
    merge_type: MergeType
    merge_at_node_id: str = Field(
        ..., description="The node ID to merge at (from the target/merged flow)"
    )
    rationale: str = Field(default="", description="LLM explanation for the decision")


class FlowDepthClassification(BaseModel):
    """Classification result when no common screens are found"""

    flow_id: str
    depth: FlowDepth
    position_hint: str = Field(
        default="center",
        description="Suggested position in graph: 'left', 'center', 'right'",
    )
    rationale: str = Field(default="", description="LLM explanation for classification")


class FlowContext(BaseModel):
    """Full context of a flow for LLM analysis"""

    flow_id: str
    flow_name: Optional[str] = None
    nodes: Dict[str, str] = Field(
        ..., description="Mapping of node_id to screen description"
    )
    edges: List[Dict[str, str]] = Field(
        ...,
        description="List of edges with source, target, description",
    )
    node_images: Optional[Dict[str, str]] = Field(
        default=None, description="Mapping of node_id to base64 image (optional)"
    )
    node_detailed_descriptions: Optional[Dict[str, str]] = Field(
        default=None,
        description="Mapping of node_id to detailed screen description (optional)",
    )


class FlowComparisonRequest(BaseModel):
    """Request to compare multiple flows for recommendations"""

    flows: List[FlowContext] = Field(
        ..., min_length=2, description="List of flows to compare (minimum 2)"
    )
    product_id: str
    include_image_verification: bool = Field(
        default=True, description="Whether to verify matches with images"
    )


class FlowComparisonResult(BaseModel):
    """Result of comparing flows for merge recommendations"""

    has_common_screens: bool = Field(
        ..., description="Whether any common screens were found"
    )
    screen_matches: List[ScreenMatch] = Field(
        default_factory=list, description="List of confirmed screen matches"
    )
    merge_recommendations: List[MergeRecommendation] = Field(
        default_factory=list, description="Recommendations for merging flows"
    )
    depth_classifications: List[FlowDepthClassification] = Field(
        default_factory=list,
        description="Depth classifications (only when no common screens)",
    )
    unprocessed_flow_ids: List[str] = Field(
        default_factory=list,
        description="Flow IDs that couldn't be processed/merged",
    )


# Note: LLM response schemas are defined as JSON schemas in response_schemas.py
# and used directly with the LLM. No Pydantic models needed here.
