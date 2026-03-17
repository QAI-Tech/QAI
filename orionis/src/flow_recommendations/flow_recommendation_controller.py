"""
Flow Recommendation Controller

Single entry point for triggering flow recommendations.
Handles parsing, comparison, graph construction, and saving.
"""

import json
from typing import List, Dict, Optional, Set, Any, cast
from utils.util import orionis_log
from llm_model import LLMModelWrapper
from flow_recommendations.flow_recommendation_service import FlowRecommendationService
from flow_recommendations.graph_constructor import GraphConstructor
from flow_recommendations.models import (
    FlowContext,
    FlowComparisonRequest,
    FlowComparisonResult,
    FlowDepthClassification,
)
from common.google_cloud_wrappers import GCPFileStorageWrapper
from common.collaboration_client import collaboration_manager


class FlowRecommendationOutput:
    """Output from flow recommendation processing."""

    def __init__(
        self,
        comparison_result: FlowComparisonResult,
        new_graph: Optional[Dict] = None,
        new_flows: Optional[List[Dict]] = None,
        result_info: Optional[Dict[str, Any]] = None,
    ):
        self.comparison_result = comparison_result
        self.new_graph = new_graph
        self.new_flows = new_flows
        self.result_info = result_info or {}

    @property
    def has_common_screens(self) -> bool:
        return self.comparison_result.has_common_screens

    @property
    def was_merged(self) -> bool:
        return len(self.comparison_result.merge_recommendations) > 0

    @property
    def unprocessed_flow_ids(self) -> List[str]:
        """Flow IDs that weren't merged - use these as old_flow_ids in next iteration."""
        return self.comparison_result.unprocessed_flow_ids


class FlowRecommendationController:
    """
    Controller for flow recommendations with incremental comparison.

    Key behavior:
    - Only compares NEW flows against OLD flows (not old vs old)
    - Constructs merged graph when common screens found
    - Repositions flows left/right when no common screens
    """

    def __init__(self, llm_model: Optional[LLMModelWrapper] = None):
        self.llm_model = llm_model or LLMModelWrapper()
        self.service = FlowRecommendationService(self.llm_model)
        self.graph_constructor = GraphConstructor()

    def trigger(
        self,
        graph_file_path: str,
        flow_file_path: str,
        old_flow_ids: List[str],
        new_flow_ids: List[str],
        product_id: str,
        gcp_bucket_path: Optional[str] = None,
        include_image_verification: bool = True,
    ) -> FlowRecommendationOutput:
        """
        Single entry point: Process flows, construct graph, and emit changes.

        By default emits changes to Graph Collaboration Client.
        Optionally saves to GCP bucket if gcp_bucket_path is provided.

        Args:
            graph_file_path: Path to the graph JSON file (local or GCP URI)
                e.g., "gs://bucket-name/path/to/graph.json" or "/local/path/graph.json"
            flow_file_path: Path to the flows JSON file (local or GCP URI)
                e.g., "gs://bucket-name/path/to/flows.json" or "/local/path/flows.json"
            old_flow_ids: Flow IDs already compared (from previous iterations)
            new_flow_ids: New flow IDs to compare
            product_id: Product ID for emitting changes
            gcp_bucket_path: Optional GCP bucket path to save output files
                (e.g., "gs://bucket-name/path/to/folder")
            include_image_verification: Whether to verify with images

        Returns:
            FlowRecommendationOutput with new graph and comparison results
        """
        orionis_log(
            f"Triggering flow recommendations - Old: {len(old_flow_ids)}, "
            f"New: {len(new_flow_ids)}"
        )

        # Parse files
        # Fetch data via API
        artifacts = collaboration_manager.get_graph_data(product_id)
        graph_data = cast(Dict[str, Any], artifacts.get("graph") or {})
        flows_data = cast(List[Dict[str, Any]], artifacts.get("flows") or [])

        # Build lookups
        node_lookup = self._build_node_lookup(graph_data)
        edge_lookup = self._build_edge_lookup(graph_data)

        # Build FlowContext for each flow
        old_flow_contexts = self._build_flow_contexts(
            flows_data, old_flow_ids, node_lookup, edge_lookup
        )
        new_flow_contexts = self._build_flow_contexts(
            flows_data, new_flow_ids, node_lookup, edge_lookup
        )

        # Edge case: no new flows
        if not new_flow_contexts:
            orionis_log("No new flows to process")
            return FlowRecommendationOutput(
                comparison_result=FlowComparisonResult(
                    has_common_screens=False,
                    unprocessed_flow_ids=old_flow_ids,
                ),
                new_graph=graph_data,
                new_flows=flows_data,
            )

        # Execute incremental comparison
        comparison_result = self._compare_incrementally(
            old_flow_contexts=old_flow_contexts,
            new_flow_contexts=new_flow_contexts,
            product_id=product_id,
            include_image_verification=include_image_verification,
        )

        # Construct graph and emit changes (default) / save to GCP (optional)
        new_graph, new_flows, result_info = self.graph_constructor.construct_graph(
            original_graph=graph_data,
            original_flows=flows_data,
            comparison_result=comparison_result,
            product_id=product_id,
            gcp_bucket_path=gcp_bucket_path,
        )

        return FlowRecommendationOutput(
            comparison_result=comparison_result,
            new_graph=new_graph,
            new_flows=new_flows,
            result_info=result_info,
        )

    def _compare_incrementally(
        self,
        old_flow_contexts: List[FlowContext],
        new_flow_contexts: List[FlowContext],
        product_id: str,
        include_image_verification: bool,
    ) -> FlowComparisonResult:
        """
        Compare flows incrementally: new vs old, then new vs new if needed.
        Never compares old vs old (already done in previous iterations).
        """
        all_screen_matches = []
        all_merge_recommendations = []
        all_depth_classifications: List[FlowDepthClassification] = []
        merged_flow_ids: Set[str] = set()
        unprocessed_flow_ids: Set[str] = set()

        # Compare each new flow against all old flows
        if old_flow_contexts:
            for new_flow in new_flow_contexts:
                for old_flow in old_flow_contexts:
                    result = self.service.compare_flows(
                        FlowComparisonRequest(
                            flows=[new_flow, old_flow],
                            product_id=product_id,
                            include_image_verification=include_image_verification,
                        )
                    )

                    if result.has_common_screens:
                        all_screen_matches.extend(result.screen_matches)
                        all_merge_recommendations.extend(result.merge_recommendations)
                        merged_flow_ids.add(new_flow.flow_id)
                        merged_flow_ids.add(old_flow.flow_id)
                        break  # Found match, move to next new flow

                if new_flow.flow_id not in merged_flow_ids:
                    unprocessed_flow_ids.add(new_flow.flow_id)

        # Compare unmerged new flows against each other
        unmerged_new = [
            f for f in new_flow_contexts if f.flow_id not in merged_flow_ids
        ]

        if len(unmerged_new) >= 2:
            result = self.service.compare_flows(
                FlowComparisonRequest(
                    flows=unmerged_new,
                    product_id=product_id,
                    include_image_verification=include_image_verification,
                )
            )

            if result.has_common_screens:
                all_screen_matches.extend(result.screen_matches)
                all_merge_recommendations.extend(result.merge_recommendations)
                for match in result.screen_matches:
                    # Node IDs are prefixed as 'flow_id:node_id' in multi-flow comparisons
                    if ":" in match.flow_a_node_id:
                        flow_a_id, _ = match.flow_a_node_id.split(":", 1)
                        merged_flow_ids.add(flow_a_id)
                        unprocessed_flow_ids.discard(flow_a_id)
                    if ":" in match.flow_b_node_id:
                        flow_b_id, _ = match.flow_b_node_id.split(":", 1)
                        merged_flow_ids.add(flow_b_id)
                        unprocessed_flow_ids.discard(flow_b_id)
            else:
                all_depth_classifications.extend(result.depth_classifications)

        # Track unmerged old flows
        for old_flow in old_flow_contexts:
            if old_flow.flow_id not in merged_flow_ids:
                unprocessed_flow_ids.add(old_flow.flow_id)

        return FlowComparisonResult(
            has_common_screens=len(all_screen_matches) > 0,
            screen_matches=all_screen_matches,
            merge_recommendations=all_merge_recommendations,
            depth_classifications=all_depth_classifications,
            unprocessed_flow_ids=list(unprocessed_flow_ids),
        )

    # ==================== Helpers ====================

    def _load_json_file(self, file_path: str) -> Any:
        """
        Load and return JSON data from file.

        Supports both local file paths and GCP URIs (gs://bucket-name/path/to/file.json).
        Caller should cast to expected type.
        """
        try:
            if file_path.startswith("gs://"):
                # Load from GCP
                storage = GCPFileStorageWrapper()
                local_path = storage.download_file_locally(
                    uri=file_path,
                    use_constructed_bucket_name=False,
                )
                with open(local_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            else:
                # Load from local file
                with open(file_path, "r", encoding="utf-8") as f:
                    return json.load(f)
        except Exception as e:
            orionis_log(f"Error loading JSON file {file_path}: {e}", e)
            raise ValueError(f"Failed to load JSON file: {file_path}") from e

    def _build_node_lookup(
        self, graph_data: Dict[str, Any]
    ) -> Dict[str, Dict[str, Any]]:
        lookup = {}
        for node in graph_data.get("nodes", []):
            node_id = node.get("id")
            if node_id:
                data = node.get("data", {})
                lookup[node_id] = {
                    "id": node_id,
                    "description": data.get("description", ""),
                    "detailed_description": data.get("detailed_description"),
                    "image": data.get("image"),
                    "position": node.get("position", {}),
                }
        return lookup

    def _build_edge_lookup(self, graph_data: Dict[str, Any]) -> Dict[str, Any]:
        by_source: Dict[str, List[Dict]] = {}
        for edge in graph_data.get("edges", []):
            source = edge.get("source")
            data = edge.get("data", {})
            edge_info = {
                "id": edge.get("id"),
                "source": source,
                "target": edge.get("target"),
                "description": data.get("description", ""),
            }
            if source:
                if source not in by_source:
                    by_source[source] = []
                by_source[source].append(edge_info)
        return {"by_source": by_source}

    def _build_flow_contexts(
        self,
        flows_data: List[Dict[str, Any]],
        flow_ids: List[str],
        node_lookup: Dict[str, Dict[str, Any]],
        edge_lookup: Dict[str, Any],
    ) -> List[FlowContext]:
        flow_lookup = {f.get("id"): f for f in flows_data if f.get("id")}
        contexts = []

        for flow_id in flow_ids:
            flow = flow_lookup.get(flow_id)
            if not flow:
                orionis_log(f"Flow {flow_id} not found, skipping")
                continue

            path_node_ids = flow.get("pathNodeIds", [])
            if not path_node_ids:
                continue

            # Build nodes dict
            nodes: Dict[str, str] = {}
            node_images: Dict[str, str] = {}
            node_detailed_descriptions: Dict[str, str] = {}
            for node_id in path_node_ids:
                node_data = node_lookup.get(node_id)
                if node_data:
                    nodes[node_id] = node_data.get("description", "Unknown screen")
                    if node_data.get("image"):
                        node_images[node_id] = node_data["image"]
                    if node_data.get("detailed_description"):
                        node_detailed_descriptions[node_id] = node_data[
                            "detailed_description"
                        ]
                else:
                    nodes[node_id] = "Unknown screen"

            # Build edges list
            edges: List[Dict[str, str]] = []
            by_source = edge_lookup.get("by_source", {})
            for i in range(len(path_node_ids) - 1):
                source_id = path_node_ids[i]
                target_id = path_node_ids[i + 1]
                source_edges = by_source.get(source_id, [])
                edge_found = next(
                    (e for e in source_edges if e.get("target") == target_id), None
                )
                if edge_found:
                    edges.append(
                        {
                            "id": edge_found.get("id", ""),
                            "source": source_id,
                            "target": target_id,
                            "description": edge_found.get("description", ""),
                        }
                    )
                else:
                    edges.append(
                        {
                            "id": f"edge-{source_id}-{target_id}",
                            "source": source_id,
                            "target": target_id,
                            "description": "Unknown action",
                        }
                    )

            contexts.append(
                FlowContext(
                    flow_id=flow_id,
                    flow_name=flow.get("name"),
                    nodes=nodes,
                    edges=edges,
                    node_images=node_images if node_images else None,
                    node_detailed_descriptions=(
                        node_detailed_descriptions
                        if node_detailed_descriptions
                        else None
                    ),
                )
            )

        return contexts


# Single convenience function
def trigger_flow_recommendations(
    graph_file_path: str,
    flow_file_path: str,
    old_flow_ids: List[str],
    new_flow_ids: List[str],
    product_id: str,
    gcp_bucket_path: Optional[str] = None,
    include_image_verification: bool = True,
    llm_model: Optional[LLMModelWrapper] = None,
) -> FlowRecommendationOutput:
    """
    Main entry point for flow recommendations.

    By default emits changes to Graph Collaboration Client.
    Optionally saves to GCP bucket if gcp_bucket_path is provided.

    Args:
        graph_file_path: Path to graph JSON file (local or GCP URI)
            e.g., "gs://bucket-name/path/to/graph.json" or "/local/path/graph.json"
        flow_file_path: Path to flows JSON file (local or GCP URI)
            e.g., "gs://bucket-name/path/to/flows.json" or "/local/path/flows.json"
        old_flow_ids: Flow IDs from previous iterations (already compared)
        new_flow_ids: New flow IDs to compare
        product_id: Product ID for emitting changes
        gcp_bucket_path: Optional GCP bucket path to save output files
            (e.g., "gs://bucket-name/path/to/folder")
            Files saved as: graph-export-recommend.json, flows-export-recommend.json
        include_image_verification: Verify matches with images
        llm_model: Optional LLM wrapper

    Returns:
        FlowRecommendationOutput with new graph and results
        - result_info["emit_result"]: Result from Graph Collaboration Client
        - result_info["gcp_paths"]: GCP URIs if gcp_bucket_path was provided

    Example:
        # With GCP input files - emits changes to Graph Collaboration Client
        output = trigger_flow_recommendations(
            graph_file_path="gs://my-bucket/data/graph.json",
            flow_file_path="gs://my-bucket/data/flows.json",
            old_flow_ids=[],
            new_flow_ids=["flow-A", "flow-B"],
            product_id="prod-123",
        )

        # With GCP input and output
        output = trigger_flow_recommendations(
            graph_file_path="gs://my-bucket/data/graph.json",
            flow_file_path="gs://my-bucket/data/flows.json",
            old_flow_ids=[],
            new_flow_ids=["flow-A", "flow-B"],
            product_id="prod-123",
            gcp_bucket_path="gs://my-bucket/recommendations",
        )
        # Output files saved to:
        #   gs://my-bucket/recommendations/graph-export-recommend.json
        #   gs://my-bucket/recommendations/flows-export-recommend.json
    """
    controller = FlowRecommendationController(llm_model=llm_model)
    return controller.trigger(
        graph_file_path=graph_file_path,
        flow_file_path=flow_file_path,
        old_flow_ids=old_flow_ids,
        new_flow_ids=new_flow_ids,
        product_id=product_id,
        gcp_bucket_path=gcp_bucket_path,
        include_image_verification=include_image_verification,
    )
