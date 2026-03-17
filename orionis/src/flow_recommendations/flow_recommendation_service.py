"""
Flow Recommendation Service

This service analyzes multiple flows to:
1. Find common screens between flows using description + image comparison
2. Recommend merge operations (same edge vs different edge)
3. Classify flows as shallow/deep when no common screens exist
4. Support incremental graph building over multiple iterations
"""

import json
from typing import List, Dict, Tuple, Optional
from utils.util import orionis_log
from llm_model import LLMModelWrapper
from flow_recommendations.models import (
    FlowContext,
    FlowComparisonRequest,
    FlowComparisonResult,
    ScreenMatch,
    EdgeMatch,
    MergeRecommendation,
    MergeType,
    FlowDepth,
    FlowDepthClassification,
)
from flow_recommendations.prompts import (
    SCREEN_DESCRIPTION_MATCHING_PROMPT,
    IMAGE_VERIFICATION_PROMPT,
    EDGE_COMPARISON_PROMPT,
    FLOW_DEPTH_CLASSIFICATION_PROMPT,
    MULTI_FLOW_SCREEN_MATCHING_PROMPT,
)
from flow_recommendations.response_schemas import (
    DESCRIPTION_MATCH_SCHEMA,
    IMAGE_VERIFICATION_SCHEMA,
    EDGE_COMPARISON_SCHEMA,
    FLOW_DEPTH_CLASSIFICATION_SCHEMA,
    MULTI_FLOW_SCREEN_MATCHING_SCHEMA,
)


class FlowRecommendationService:
    """
    Service for analyzing and recommending flow merges based on common screens.

    The service follows this algorithm:
    1. Create description dicts for each flow {node_id: description}
    2. LLM call to find potential screen matches based on descriptions
    3. If matches found: verify with images, then compare edges
    4. If no matches: classify flows as shallow/deep for positioning
    """

    def __init__(self, llm_model: LLMModelWrapper):
        """
        Initialize the FlowRecommendationService.

        Args:
            llm_model: LLMModelWrapper instance for AI analysis
        """
        self.llm_model = llm_model

    def compare_flows(self, request: FlowComparisonRequest) -> FlowComparisonResult:
        """
        Main entry point: Compare multiple flows and return recommendations.

        Args:
            request: FlowComparisonRequest containing flows to compare

        Returns:
            FlowComparisonResult with matches, recommendations, or classifications
        """
        orionis_log(
            f"[1] Starting flow comparison for {len(request.flows)} flows, "
            f"product_id: {request.product_id}"
        )
        for flow in request.flows:
            orionis_log(
                f"    - {flow.flow_id}: {len(flow.nodes)} nodes, "
                f"{len(flow.edges)} edges"
            )

        if len(request.flows) < 2:
            orionis_log("    Need at least 2 flows to compare")
            return FlowComparisonResult(
                has_common_screens=False,
                unprocessed_flow_ids=[f.flow_id for f in request.flows],
            )

        # Step 1: Find potential matches based on descriptions
        orionis_log("[2] Comparing screen descriptions with LLM...")
        potential_matches = self._find_description_matches(request.flows)
        orionis_log(f"    Potential matches: {len(potential_matches)}")

        if not potential_matches:
            # No common screens - classify flows by depth
            orionis_log("[3] No common screens found, classifying flows by depth...")
            depth_classifications = self._classify_flow_depths(request.flows)
            return FlowComparisonResult(
                has_common_screens=False,
                depth_classifications=depth_classifications,
                unprocessed_flow_ids=[f.flow_id for f in request.flows],
            )

        # Log potential matches
        for match in potential_matches:
            orionis_log(f"    - {match.flow_a_node_id} <-> {match.flow_b_node_id}")

        # Step 2: Verify matches with images (if enabled)
        confirmed_matches = potential_matches
        if request.include_image_verification:
            orionis_log("[3] Verifying matches with images...")
            confirmed_matches = self._verify_matches_with_images(
                potential_matches, request.flows
            )
            orionis_log(f"    Confirmed matches: {len(confirmed_matches)}")

        if not confirmed_matches:
            # Matches didn't verify - classify flows by depth
            orionis_log("[4] No matches confirmed, classifying flows by depth...")
            depth_classifications = self._classify_flow_depths(request.flows)
            return FlowComparisonResult(
                has_common_screens=False,
                depth_classifications=depth_classifications,
                unprocessed_flow_ids=[f.flow_id for f in request.flows],
            )

        # Step 3: Compare edges leading to common screens
        orionis_log("[4] Comparing edges leading to common screens...")
        merge_recommendations = self._generate_merge_recommendations(
            confirmed_matches, request.flows
        )
        orionis_log(f"    Generated {len(merge_recommendations)} merge recommendations")

        return FlowComparisonResult(
            has_common_screens=True,
            screen_matches=confirmed_matches,
            merge_recommendations=merge_recommendations,
        )

    def _find_description_matches(self, flows: List[FlowContext]) -> List[ScreenMatch]:
        """
        Step 1: Find potential screen matches based on descriptions.

        Creates a dict for each flow {node_id: description} and asks LLM
        which node IDs appear to be the same screen.

        Args:
            flows: List of FlowContext objects

        Returns:
            List of ScreenMatch objects (potential matches, not yet verified)
        """
        if len(flows) == 2:
            return self._find_pairwise_description_matches(flows[0], flows[1])
        else:
            return self._find_multi_flow_description_matches(flows)

    def _find_pairwise_description_matches(
        self, flow_a: FlowContext, flow_b: FlowContext
    ) -> List[ScreenMatch]:
        """Find matches between exactly two flows."""
        # Format descriptions for prompt
        flow_a_desc = self._format_node_descriptions(flow_a)
        flow_b_desc = self._format_node_descriptions(flow_b)

        prompt = SCREEN_DESCRIPTION_MATCHING_PROMPT.format(
            flow_a_descriptions=flow_a_desc,
            flow_b_descriptions=flow_b_desc,
        )

        try:
            response_text = self.llm_model.call_llm_v3(
                prompt=prompt,
                response_schema=DESCRIPTION_MATCH_SCHEMA,
            )
            response = json.loads(response_text)

            # Log reasoning from LLM
            reasoning = response.get("reasoning", "")
            if reasoning:
                orionis_log(f"    Reasoning: {reasoning}")

            matches = []
            for match in response.get("potential_matches", []):
                # Prefix node IDs with flow IDs for consistency with multi-flow matching
                matches.append(
                    ScreenMatch(
                        flow_a_node_id=f"{flow_a.flow_id}:{match['flow_a_node_id']}",
                        flow_b_node_id=f"{flow_b.flow_id}:{match['flow_b_node_id']}",
                        matched_by_description=True,
                        matched_by_image=False,
                    )
                )
            return matches

        except Exception as e:
            orionis_log(f"Error in description matching: {e}", e)
            return []

    def _find_multi_flow_description_matches(
        self, flows: List[FlowContext]
    ) -> List[ScreenMatch]:
        """Find matches across multiple flows (3+)."""
        # Format all flows for prompt
        flows_desc = ""
        for i, flow in enumerate(flows):
            flows_desc += f"\n### Flow {i + 1} (ID: {flow.flow_id}):\n"
            flows_desc += self._format_node_descriptions(flow)

        prompt = MULTI_FLOW_SCREEN_MATCHING_PROMPT.format(
            num_flows=len(flows),
            flows_descriptions=flows_desc,
        )

        try:
            response_text = self.llm_model.call_llm_v3(
                prompt=prompt,
                response_schema=MULTI_FLOW_SCREEN_MATCHING_SCHEMA,
            )
            response = json.loads(response_text)
            orionis_log(f"Multi-flow matching response: {response}")

            # Convert screen groups to pairwise matches
            matches = []
            for group in response.get("screen_groups", []):
                if len(group) >= 2:
                    # Create pairwise matches within the group
                    for i in range(len(group)):
                        for j in range(i + 1, len(group)):
                            matches.append(
                                ScreenMatch(
                                    flow_a_node_id=f"{group[i]['flow_id']}:{group[i]['node_id']}",
                                    flow_b_node_id=f"{group[j]['flow_id']}:{group[j]['node_id']}",
                                    matched_by_description=True,
                                    matched_by_image=False,
                                )
                            )
            return matches

        except Exception as e:
            orionis_log(f"Error in multi-flow matching: {e}", e)
            return []

    def _verify_matches_with_images(
        self,
        potential_matches: List[ScreenMatch],
        flows: List[FlowContext],
    ) -> List[ScreenMatch]:
        """
        Step 2: Verify potential matches using screen images.

        For each potential match, sends the base64 images to LLM
        to confirm if they are actually the same screen from the same app.

        Args:
            potential_matches: List of ScreenMatch from description matching
            flows: Original flows with image data

        Returns:
            List of confirmed ScreenMatch objects
        """
        # Build lookup for node images
        node_images = self._build_node_image_lookup(flows)

        confirmed_matches = []
        for match in potential_matches:
            orionis_log(
                f"    Verifying: {match.flow_a_node_id} <-> {match.flow_b_node_id}"
            )

            # Get images for both nodes
            image_a = node_images.get(match.flow_a_node_id)
            image_b = node_images.get(match.flow_b_node_id)

            if not image_a or not image_b:
                orionis_log("      Missing image, assuming match")
                # Keep the match but mark as unverified
                confirmed_matches.append(match)
                continue

            # Verify with LLM
            is_verified, confidence, reasoning = self._verify_single_match_with_images(
                image_a, image_b
            )

            orionis_log(f"      Same screen: {is_verified}")
            orionis_log(f"      Confidence: {confidence}")
            if reasoning:
                orionis_log(f"      Reasoning: {reasoning}")

            if is_verified:
                confirmed_matches.append(
                    ScreenMatch(
                        flow_a_node_id=match.flow_a_node_id,
                        flow_b_node_id=match.flow_b_node_id,
                        confidence=confidence,
                        matched_by_description=True,
                        matched_by_image=True,
                    )
                )
                orionis_log("      -> CONFIRMED")
            else:
                orionis_log("      -> REJECTED")

        return confirmed_matches

    def _verify_single_match_with_images(
        self, image_a: str, image_b: str
    ) -> Tuple[bool, float, str]:
        """Verify a single match using images."""
        try:
            response_text = self.llm_model.call_llm_v3_base64(
                prompt=IMAGE_VERIFICATION_PROMPT,
                image_base64_list=[image_a, image_b],
                response_schema=IMAGE_VERIFICATION_SCHEMA,
            )
            response = json.loads(response_text)

            is_same = response.get("is_same_screen", False) and response.get(
                "is_same_app", False
            )
            confidence = response.get("confidence", 0.5)
            reasoning = response.get("reasoning", "")

            return is_same, confidence, reasoning

        except Exception as e:
            orionis_log(f"Error in image verification: {e}", e)
            return False, 0.0, str(e)

    def _generate_merge_recommendations(
        self,
        confirmed_matches: List[ScreenMatch],
        flows: List[FlowContext],
    ) -> List[MergeRecommendation]:
        """
        Step 3: Generate merge recommendations based on edge comparison.

        For each confirmed screen match, compares the edges leading to
        that screen to determine merge type (SAME_EDGE or DIFFERENT_EDGE).

        Args:
            confirmed_matches: List of confirmed ScreenMatch objects
            flows: Original flows for edge data

        Returns:
            List of MergeRecommendation objects
        """
        recommendations = []
        for match in confirmed_matches:
            # Get the edges leading to these nodes
            edge_a = self._get_incoming_edge(match.flow_a_node_id, flows)
            edge_b = self._get_incoming_edge(match.flow_b_node_id, flows)

            if not edge_a or not edge_b:
                # Can't compare edges, default to DIFFERENT_EDGE
                orionis_log(
                    f"    {match.flow_a_node_id}/{match.flow_b_node_id}: "
                    f"No incoming edges, using DIFFERENT_EDGE"
                )
                recommendations.append(
                    MergeRecommendation(
                        common_screen=match,
                        merge_type=MergeType.DIFFERENT_EDGE,
                        merge_at_node_id=match.flow_b_node_id,
                        rationale="Unable to compare edges - missing edge data",
                    )
                )
                continue

            # Log edge details
            orionis_log(
                f"    Comparing edges to {match.flow_a_node_id}/{match.flow_b_node_id}:"
            )
            orionis_log(f"      Edge A: {edge_a.get('description', 'Unknown')}")
            orionis_log(f"      Edge B: {edge_b.get('description', 'Unknown')}")

            # Compare edges with LLM
            edge_match, reasoning = self._compare_edges(edge_a, edge_b, flows)

            orionis_log(f"      Same action: {edge_match.are_same_action}")
            if reasoning:
                orionis_log(f"      Reasoning: {reasoning}")

            recommendations.append(
                MergeRecommendation(
                    common_screen=match,
                    edge_comparison=edge_match,
                    merge_type=edge_match.merge_type,
                    merge_at_node_id=match.flow_b_node_id,
                    rationale=reasoning
                    or f"Edge comparison: {edge_match.merge_type.value}",
                )
            )

        return recommendations

    def _compare_edges(
        self,
        edge_a: Dict[str, str],
        edge_b: Dict[str, str],
        flows: List[FlowContext],
    ) -> Tuple[EdgeMatch, str]:
        """Compare two edges to determine if they represent the same action."""
        # Get source node descriptions
        source_a_desc = self._get_node_description(edge_a.get("source", ""), flows)
        source_b_desc = self._get_node_description(edge_b.get("source", ""), flows)
        target_desc = self._get_node_description(edge_a.get("target", ""), flows)

        prompt = EDGE_COMPARISON_PROMPT.format(
            flow_a_source_description=source_a_desc,
            flow_a_edge_description=edge_a.get("description", ""),
            flow_b_source_description=source_b_desc,
            flow_b_edge_description=edge_b.get("description", ""),
            common_screen_description=target_desc,
        )

        try:
            response_text = self.llm_model.call_llm_v3(
                prompt=prompt,
                response_schema=EDGE_COMPARISON_SCHEMA,
            )
            response = json.loads(response_text)

            are_same = response.get("are_same_action", False)
            reasoning = response.get("reasoning", "")

            return (
                EdgeMatch(
                    flow_a_edge_id=edge_a.get("id", ""),
                    flow_b_edge_id=edge_b.get("id", ""),
                    are_same_action=are_same,
                    merge_type=(
                        MergeType.SAME_EDGE if are_same else MergeType.DIFFERENT_EDGE
                    ),
                ),
                reasoning,
            )

        except Exception as e:
            orionis_log(f"Error in edge comparison: {e}", e)
            return EdgeMatch(
                flow_a_edge_id=edge_a.get("id", ""),
                flow_b_edge_id=edge_b.get("id", ""),
                are_same_action=False,
                merge_type=MergeType.DIFFERENT_EDGE,
            ), str(e)

    def _classify_flow_depths(
        self, flows: List[FlowContext]
    ) -> List[FlowDepthClassification]:
        """
        Step 3b: Classify flows as shallow/deep when no common screens exist.

        Uses full flow context (nodes + edges) to determine which flows
        are closer to app entry points vs deeper in the hierarchy.

        Args:
            flows: List of FlowContext objects

        Returns:
            List of FlowDepthClassification objects
        """
        # Format flows for prompt
        flows_context = ""
        for i, flow in enumerate(flows):
            flows_context += f"\n### Flow {i + 1} (ID: {flow.flow_id}):\n"
            flows_context += f"Name: {flow.flow_name or 'Unknown'}\n"
            flows_context += "Screens:\n"
            for node_id, desc in flow.nodes.items():
                flows_context += f"  - {node_id}: {desc}\n"
            flows_context += "Actions (edges):\n"
            for edge in flow.edges:
                flows_context += (
                    f"  - From {edge.get('source', '?')} to {edge.get('target', '?')}: "
                    f"{edge.get('description', 'No description')}\n"
                )

        prompt = FLOW_DEPTH_CLASSIFICATION_PROMPT.format(flows_context=flows_context)

        try:
            response_text = self.llm_model.call_llm_v3(
                prompt=prompt,
                response_schema=FLOW_DEPTH_CLASSIFICATION_SCHEMA,
            )
            response = json.loads(response_text)
            orionis_log(f"Flow depth classification response: {response}")

            classifications = []
            for item in response.get("classifications", []):
                classifications.append(
                    FlowDepthClassification(
                        flow_id=item["flow_id"],
                        depth=FlowDepth(item["depth"]),
                        position_hint=item.get("position_hint", "center"),
                        rationale=item.get("reasoning", ""),
                    )
                )
            return classifications

        except Exception as e:
            orionis_log(f"Error in flow depth classification: {e}", e)
            # Return default classifications
            return [
                FlowDepthClassification(
                    flow_id=f.flow_id,
                    depth=FlowDepth.SHALLOW,
                    position_hint="center",
                    rationale="Default classification due to error",
                )
                for f in flows
            ]

    # Helper methods

    def _format_node_descriptions(self, flow: FlowContext) -> str:
        """Format node descriptions for LLM prompt.

        Includes detailed_description when available for better context.
        """
        lines = []
        for node_id, description in flow.nodes.items():
            detailed = None
            if flow.node_detailed_descriptions:
                detailed = flow.node_detailed_descriptions.get(node_id)

            if detailed:
                lines.append(f"- {node_id}: {description} ({detailed})")
            else:
                lines.append(f"- {node_id}: {description}")
        return "\n".join(lines)

    def _build_node_image_lookup(self, flows: List[FlowContext]) -> Dict[str, str]:
        """Build a lookup dict from node_id to base64 image.

        Uses flow_id:node_id as key for uniqueness to avoid overwrites
        when different flows contain nodes with the same ID.
        """
        lookup = {}
        for flow in flows:
            if flow.node_images:
                for node_id, image in flow.node_images.items():
                    # Always use flow_id:node_id as key for uniqueness
                    key = f"{flow.flow_id}:{node_id}"
                    lookup[key] = image
        return lookup

    def _get_incoming_edge(
        self, node_id: str, flows: List[FlowContext]
    ) -> Optional[Dict[str, str]]:
        """Get the edge that leads to a specific node.

        IMPORTANT: This searches for edges within the flow that OWNS the node,
        not across all flows. This ensures we get the correct edge for merging.
        """
        # Parse flow_id from node_id if present
        target_flow_id = None
        target_node_id = node_id
        if ":" in node_id:
            target_flow_id, target_node_id = node_id.split(":", 1)

        # First, find which flow owns this node
        owning_flow = None
        for flow in flows:
            if target_flow_id and flow.flow_id == target_flow_id:
                owning_flow = flow
                break
            elif not target_flow_id and target_node_id in flow.nodes:
                owning_flow = flow
                break

        # Search only within the owning flow
        if owning_flow:
            for edge in owning_flow.edges:
                if edge.get("target") == target_node_id:
                    return edge

        return None

    def _get_node_description(self, node_id: str, flows: List[FlowContext]) -> str:
        """Get description for a node by ID."""
        for flow in flows:
            if node_id in flow.nodes:
                return flow.nodes[node_id]
        return "Unknown screen"
