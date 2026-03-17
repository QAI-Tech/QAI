from flow_recommendations.flow_recommendation_controller import (
    FlowRecommendationController,
    FlowRecommendationOutput,
    trigger_flow_recommendations,
)
from flow_recommendations.flow_recommendation_service import FlowRecommendationService
from flow_recommendations.graph_constructor import GraphConstructor
from flow_recommendations.models import (
    FlowContext,
    FlowComparisonRequest,
    FlowComparisonResult,
    ScreenMatch,
    MergeRecommendation,
    MergeType,
    FlowDepth,
    FlowDepthClassification,
)

__all__ = [
    # Main entry point
    "trigger_flow_recommendations",
    # Controller
    "FlowRecommendationController",
    "FlowRecommendationOutput",
    # Service & Constructor
    "FlowRecommendationService",
    "GraphConstructor",
    # Models
    "FlowContext",
    "FlowComparisonRequest",
    "FlowComparisonResult",
    "ScreenMatch",
    "MergeRecommendation",
    "MergeType",
    "FlowDepth",
    "FlowDepthClassification",
]
