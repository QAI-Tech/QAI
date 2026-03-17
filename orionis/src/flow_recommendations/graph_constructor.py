"""
Graph Constructor for Flow Recommendations

This module handles:
1. Constructing merged graphs when common screens are found
2. Repositioning flows (left/right from center) when no common screens exist
3. Emitting changes to Graph Collaboration Client (default)
4. Optionally saving to GCP bucket
"""

import json
from typing import List, Dict, Optional, Tuple, Set, Any
from copy import deepcopy

from utils.util import orionis_log
from flow_recommendations.models import (
    FlowComparisonResult,
    MergeRecommendation,
    MergeType,
    FlowDepthClassification,
    ScreenMatch,
)
from common.collaboration_client import GraphEventsClient
from common.google_cloud_wrappers import GCPFileStorageWrapper


class GraphConstructor:
    """
    Constructs new graph files based on flow comparison results.

    Handles two scenarios:
    1. Merge scenario: Combine flows at common screens
    2. No-merge scenario: Position flows left/right based on depth
    """

    # Graph positioning constants
    DEFAULT_CENTER_X = 16000
    DEFAULT_CENTER_Y = 23000
    HORIZONTAL_SPACING = 600  # Space between nodes horizontally
    VERTICAL_SPACING = 400  # Space between parallel flows vertically
    FLOW_SEPARATION = 600  # Distance between left/right flows from center

    def __init__(
        self,
        center_x: float = DEFAULT_CENTER_X,
        center_y: float = DEFAULT_CENTER_Y,
    ):
        """
        Initialize the GraphConstructor.

        Args:
            center_x: X coordinate of graph center
            center_y: Y coordinate of graph center
        """
        self.center_x = center_x
        self.center_y = center_y

    def construct_graph(
        self,
        original_graph: Dict,
        original_flows: List[Dict],
        comparison_result: FlowComparisonResult,
        product_id: Optional[str] = None,
        gcp_bucket_path: Optional[str] = None,
    ) -> Tuple[Dict, List[Dict], Dict[str, Any]]:
        """
        Construct a new graph based on comparison results.

        By default, emits changes to Graph Collaboration Client.
        Optionally saves to GCP bucket if gcp_bucket_path is provided.

        Args:
            original_graph: Original graph data with nodes and edges
            original_flows: Original flows data (list of flow objects)
            comparison_result: Result from FlowRecommendationService
            product_id: Product ID for emitting changes (required for emit)
            gcp_bucket_path: Optional GCP bucket path to save files
                (e.g., "gs://bucket-name/path/to/folder")

        Returns:
            Tuple of (new_graph, new_flows, result_info)
            result_info contains: emit_result and/or gcp_paths
        """
        if comparison_result.has_common_screens:
            # Merge scenario
            orionis_log("Constructing merged graph")
            new_graph, new_flows = self._construct_merged_graph(
                original_graph=original_graph,
                original_flows=original_flows,
                merge_recommendations=comparison_result.merge_recommendations,
                screen_matches=comparison_result.screen_matches,
            )
        else:
            # No-merge scenario - reposition flows
            orionis_log("Repositioning flows (no common screens)")
            new_graph, new_flows = self._reposition_flows(
                original_graph=original_graph,
                original_flows=original_flows,
                depth_classifications=comparison_result.depth_classifications,
                unprocessed_flow_ids=comparison_result.unprocessed_flow_ids,
            )

        result_info: Dict[str, Any] = {}

        # Default behavior: emit changes to Graph Collaboration Client
        if product_id:
            emit_result = self._emit_graph_changes(
                product_id=product_id,
                graph=new_graph,
                flows=new_flows,
            )
            result_info["emit_result"] = emit_result
            orionis_log(f"Emitted graph changes for product {product_id}")
        else:
            orionis_log(
                "No product_id provided, skipping emit to Graph Collaboration Client"
            )

        # Optional: save to GCP bucket
        if gcp_bucket_path:
            gcp_paths = self._save_to_gcp(
                graph=new_graph,
                flows=new_flows,
                gcp_bucket_path=gcp_bucket_path,
            )
            result_info["gcp_paths"] = gcp_paths
            orionis_log(f"Saved graph files to GCP: {gcp_paths}")

        return new_graph, new_flows, result_info

    def _construct_merged_graph(
        self,
        original_graph: Dict,
        original_flows: List[Dict],
        merge_recommendations: List[MergeRecommendation],
        screen_matches: List[ScreenMatch],
    ) -> Tuple[Dict, List[Dict]]:
        """
        Construct a merged graph based on merge recommendations.

        Merge logic:
        - SAME_EDGE: Remove duplicate node/edge, update flow references
        - DIFFERENT_EDGE: Keep both edges pointing to merged node

        Args:
            original_graph: Original graph data
            original_flows: Original flows data
            merge_recommendations: List of merge recommendations
            screen_matches: List of confirmed screen matches

        Returns:
            Tuple of (merged_graph, merged_flows)
        """
        # Deep copy to avoid modifying originals
        new_graph = deepcopy(original_graph)
        new_flows = deepcopy(original_flows)

        # Build lookup for quick access
        edge_lookup = {e["id"]: e for e in new_graph.get("edges", [])}

        # Track which nodes/edges to remove and node ID mappings
        nodes_to_remove: Set[str] = set()
        edges_to_remove: Set[str] = set()
        node_id_mapping: Dict[str, str] = {}  # old_id -> new_id (merged)

        for recommendation in merge_recommendations:
            match = recommendation.common_screen
            merge_type = recommendation.merge_type

            # Parse node IDs (handle flow_id:node_id format)
            node_a_id = self._parse_node_id(match.flow_a_node_id)
            node_b_id = self._parse_node_id(match.flow_b_node_id)

            orionis_log(f"Processing merge: {node_a_id} -> {node_b_id}")

            # Skip if node maps to itself (same node in both flows)
            if node_a_id == node_b_id:
                orionis_log("  Skipping: same node in both flows")
                continue

            # Map node_a to node_b (merge node_a into node_b)
            node_id_mapping[node_a_id] = node_b_id
            nodes_to_remove.add(node_a_id)

            # Get incoming edges for both nodes
            edge_a = None
            edge_b = None
            if recommendation.edge_comparison:
                edge_a_id = recommendation.edge_comparison.flow_a_edge_id
                edge_b_id = recommendation.edge_comparison.flow_b_edge_id
                edge_a = edge_lookup.get(edge_a_id)
                edge_b = edge_lookup.get(edge_b_id)

            if merge_type == MergeType.SAME_EDGE:
                orionis_log("  Same action: True")

                if edge_a and edge_b:
                    source_a = edge_a.get("source")
                    source_b = edge_b.get("source")

                    # Check effective sources (considering any prior merges)
                    effective_source_a = node_id_mapping.get(source_a, source_a)
                    effective_source_b = node_id_mapping.get(source_b, source_b)

                    if effective_source_a == effective_source_b:
                        # True SAME_EDGE - sources are the same, remove duplicate
                        if edge_a.get("id"):
                            edges_to_remove.add(edge_a["id"])
                            orionis_log(
                                f"  TRUE same edge (same source) - "
                                f"Removing duplicate edge: {edge_a['id']}"
                            )
                    else:
                        # Different sources - NOT actually same edge, keep both
                        orionis_log(
                            f"  FALSE same edge (different sources: "
                            f"{source_a} vs {source_b}) - Keeping both edges"
                        )
                else:
                    orionis_log("  No edges to compare")

            elif merge_type == MergeType.DIFFERENT_EDGE:
                orionis_log("  Same action: False")
                orionis_log("  Keeping both edges (different actions)")

                # Update the edge from flow_a to point to node_b
                if edge_a:
                    edge_a["target"] = node_b_id

        # Apply node ID mappings to all edges
        for edge in new_graph.get("edges", []):
            if edge["source"] in node_id_mapping:
                edge["source"] = node_id_mapping[edge["source"]]
            if edge["target"] in node_id_mapping:
                edge["target"] = node_id_mapping[edge["target"]]

        # Remove merged nodes and edges
        new_graph["nodes"] = [
            n for n in new_graph.get("nodes", []) if n["id"] not in nodes_to_remove
        ]
        new_graph["edges"] = [
            e for e in new_graph.get("edges", []) if e["id"] not in edges_to_remove
        ]

        # Remove self-loop edges (source == target) that can occur after merging
        self_loops = [
            e["id"]
            for e in new_graph.get("edges", [])
            if e.get("source") == e.get("target")
        ]
        if self_loops:
            orionis_log(f"Removing {len(self_loops)} self-loop edges: {self_loops}")
            new_graph["edges"] = [
                e for e in new_graph["edges"] if e["id"] not in self_loops
            ]

        # Remove duplicate edges (same source->target pair) keeping the first one
        seen_pairs: Set[Tuple[str, str]] = set()
        duplicate_edge_ids: Set[str] = set()
        for edge in new_graph.get("edges", []):
            pair = (edge.get("source"), edge.get("target"))
            if pair in seen_pairs:
                duplicate_edge_ids.add(edge["id"])
            else:
                seen_pairs.add(pair)
        if duplicate_edge_ids:
            orionis_log(
                f"Removing {len(duplicate_edge_ids)} duplicate edges: {duplicate_edge_ids}"
            )
            new_graph["edges"] = [
                e for e in new_graph["edges"] if e["id"] not in duplicate_edge_ids
            ]

        # Detect and remove edges that would create cycles
        cycle_edges = self._find_cycle_edges(new_graph.get("edges", []))
        if cycle_edges:
            orionis_log(
                f"Removing {len(cycle_edges)} edges that create cycles: {cycle_edges}"
            )
            new_graph["edges"] = [
                e for e in new_graph["edges"] if e["id"] not in cycle_edges
            ]

        # =====================================================================
        # BUILD COMPLETE MAPPING SUMMARY FOR FLOW UPDATES
        # =====================================================================

        # 1. Resolve transitive node mappings (A->B, B->C becomes A->C)
        def resolve_mapping(nid: str) -> str:
            visited: Set[str] = set()
            current = nid
            while current in node_id_mapping and current not in visited:
                visited.add(current)
                current = node_id_mapping[current]
            return current

        resolved_node_mapping: Dict[str, str] = {
            nid: resolve_mapping(nid) for nid in node_id_mapping
        }

        # 2. Build edge mapping: edge_id -> {source, target} after all changes
        edge_changes: Dict[str, Dict[str, str]] = {}
        for edge in new_graph.get("edges", []):
            edge_changes[edge["id"]] = {
                "source": edge.get("source"),
                "target": edge.get("target"),
            }

        # 3. Set of nodes that exist in the final merged graph
        existing_nodes: Set[str] = {n["id"] for n in new_graph.get("nodes", [])}

        # 4. Build adjacency map from edges for path validation
        adjacency: Dict[str, Set[str]] = {}
        for edge in new_graph.get("edges", []):
            source = edge.get("source")
            target = edge.get("target")
            if source and target:
                if source not in adjacency:
                    adjacency[source] = set()
                adjacency[source].add(target)

        # =====================================================================
        # UPDATE FLOWS - Simple linear mapping
        # A flow is a linear path. We just map nodes to merged equivalents
        # and remove consecutive duplicates to maintain linearity.
        # =====================================================================
        for flow in new_flows:
            original_path = flow.get("pathNodeIds", [])

            # Step 1: Map all nodes to their merged equivalents
            # and remove consecutive duplicates (when adjacent nodes merge to same)
            new_path: List[str] = []
            for nid in original_path:
                mapped_nid = resolved_node_mapping.get(nid, nid)

                # Only include nodes that exist in the final graph
                if mapped_nid not in existing_nodes:
                    continue

                # Skip consecutive duplicates to maintain linearity
                if new_path and new_path[-1] == mapped_nid:
                    continue

                new_path.append(mapped_nid)

            # Step 2: Ensure consecutive nodes are connected by an edge
            filtered_path: List[str] = []
            for nid in new_path:
                if not filtered_path:
                    filtered_path.append(nid)
                    continue
                prev = filtered_path[-1]
                if nid in adjacency.get(prev, set()):
                    filtered_path.append(nid)

            flow["pathNodeIds"] = filtered_path

            # Update startNodeId and endNodeId from the path
            if flow["pathNodeIds"]:
                flow["startNodeId"] = flow["pathNodeIds"][0]
                flow["endNodeId"] = flow["pathNodeIds"][-1]
            else:
                flow["startNodeId"] = ""
                flow["endNodeId"] = ""

            # Derive viaNodeIds from pathNodeIds (all except first and last)
            if len(flow["pathNodeIds"]) > 2:
                flow["viaNodeIds"] = flow["pathNodeIds"][1:-1]
            else:
                flow["viaNodeIds"] = []

        orionis_log(
            f"Merged graph: {len(new_graph['nodes'])} nodes, {len(new_graph['edges'])} edges"
        )

        return new_graph, new_flows

    def _reposition_flows(
        self,
        original_graph: Dict,
        original_flows: List[Dict],
        depth_classifications: List[FlowDepthClassification],
        unprocessed_flow_ids: List[str],
    ) -> Tuple[Dict, List[Dict]]:
        """
        Reposition flows left/right based on depth classification.

        Shallow flows go to the left, deep flows go to the right.

        Args:
            original_graph: Original graph data
            original_flows: Original flows data
            depth_classifications: Depth classifications for flows
            unprocessed_flow_ids: IDs of flows that weren't merged

        Returns:
            Tuple of (repositioned_graph, flows)
        """
        new_graph = deepcopy(original_graph)
        new_flows = deepcopy(original_flows)

        # Build classification lookup
        classification_lookup = {c.flow_id: c for c in depth_classifications}

        # Separate flows by position hint
        left_flows: List[str] = []
        center_flows: List[str] = []
        right_flows: List[str] = []

        for flow_id in unprocessed_flow_ids:
            classification = classification_lookup.get(flow_id)
            if classification:
                if classification.position_hint == "left":
                    left_flows.append(flow_id)
                elif classification.position_hint == "right":
                    right_flows.append(flow_id)
                else:
                    center_flows.append(flow_id)
            else:
                center_flows.append(flow_id)

        orionis_log(
            f"Flow positions - Left: {len(left_flows)}, "
            f"Center: {len(center_flows)}, Right: {len(right_flows)}"
        )

        # Get flow lookup for position calculations
        flow_lookup = {f["id"]: f for f in new_flows}

        # Calculate positions for each group
        node_positions: Dict[str, Dict[str, float]] = {}

        # Left flows: position above center (negative Y offset)
        if left_flows:
            node_positions.update(
                self._calculate_flow_group_positions(
                    flow_ids=left_flows,
                    flow_lookup=flow_lookup,
                    start_x=self.center_x,
                    start_y=self.center_y - self.FLOW_SEPARATION,
                )
            )

        # Center flows: position at center
        if center_flows:
            node_positions.update(
                self._calculate_flow_group_positions(
                    flow_ids=center_flows,
                    flow_lookup=flow_lookup,
                    start_x=self.center_x,
                    start_y=self.center_y,
                )
            )

        # Right flows: position below center (positive Y offset)
        if right_flows:
            node_positions.update(
                self._calculate_flow_group_positions(
                    flow_ids=right_flows,
                    flow_lookup=flow_lookup,
                    start_x=self.center_x,
                    start_y=self.center_y + self.FLOW_SEPARATION,
                )
            )

        # Apply new positions to nodes
        for node in new_graph.get("nodes", []):
            node_id = node.get("id")
            if node_id in node_positions:
                node["position"] = node_positions[node_id]

        return new_graph, new_flows

    def _calculate_flow_group_positions(
        self,
        flow_ids: List[str],
        flow_lookup: Dict[str, Dict],
        start_x: float,
        start_y: float,
    ) -> Dict[str, Dict[str, float]]:
        """
        Calculate positions for nodes in a group of flows.

        Flows are arranged vertically, nodes within each flow horizontally.

        Returns:
            Dict mapping node_id to {x, y} position
        """
        positions: Dict[str, Dict[str, float]] = {}
        current_y = start_y

        for flow_id in flow_ids:
            flow = flow_lookup.get(flow_id)
            if not flow:
                continue

            path_node_ids = flow.get("pathNodeIds", [])
            current_x = start_x

            for node_id in path_node_ids:
                if node_id not in positions:  # Don't overwrite if already positioned
                    positions[node_id] = {"x": current_x, "y": current_y}
                current_x += self.HORIZONTAL_SPACING

            current_y += self.VERTICAL_SPACING

        return positions

    def _get_nodes_for_flows(
        self, flow_ids: List[str], flow_lookup: Dict[str, Dict]
    ) -> Set[str]:
        """Get all node IDs belonging to the specified flows."""
        node_ids: Set[str] = set()
        for flow_id in flow_ids:
            flow = flow_lookup.get(flow_id)
            if flow:
                node_ids.update(flow.get("pathNodeIds", []))
        return node_ids

    def _recalculate_positions(self, graph: Dict, flows: List[Dict]) -> Dict:
        """
        Recalculate node positions for a merged graph.

        Uses BFS from flow start nodes to position nodes.
        """
        nodes = graph.get("nodes", [])
        edges = graph.get("edges", [])

        if not nodes:
            return graph

        # Build adjacency list
        adjacency: Dict[str, List[str]] = {}
        for edge in edges:
            source = edge.get("source")
            target = edge.get("target")
            if source:
                if source not in adjacency:
                    adjacency[source] = []
                adjacency[source].append(target)

        # Find all start nodes from flows
        start_nodes = set()
        for flow in flows:
            start_node = flow.get("startNodeId")
            if start_node:
                start_nodes.add(start_node)

        # If no start nodes, use nodes with no incoming edges
        if not start_nodes:
            nodes_with_incoming = set()
            for edge in edges:
                nodes_with_incoming.add(edge.get("target"))
            all_node_ids = {n["id"] for n in nodes}
            start_nodes = all_node_ids - nodes_with_incoming

        # BFS to assign positions
        positioned: Dict[str, Dict[str, float]] = {}
        current_y = self.center_y

        for start_node in start_nodes:
            if start_node in positioned:
                continue

            # BFS from this start node
            queue = [(start_node, self.center_x)]
            while queue:
                node_id, x_pos = queue.pop(0)
                if node_id in positioned:
                    continue

                positioned[node_id] = {"x": x_pos, "y": current_y}

                # Add children
                for child in adjacency.get(node_id, []):
                    if child not in positioned:
                        queue.append((child, x_pos + self.HORIZONTAL_SPACING))

            current_y += self.VERTICAL_SPACING

        # Apply positions
        for node in nodes:
            node_id = node.get("id")
            if node_id in positioned:
                node["position"] = positioned[node_id]

        return graph

    def _parse_node_id(self, node_id: str) -> str:
        """Parse node ID, handling flow_id:node_id format."""
        if ":" in node_id:
            return node_id.split(":", 1)[1]
        return node_id

    def _find_cycle_edges(self, edges: List[Dict]) -> Set[str]:
        """
        Find edges that create cycles in the graph using DFS.
        Returns set of edge IDs that should be removed to make graph acyclic.

        Flow graphs should be DAGs (directed acyclic graphs) - cycles are invalid.
        """
        # Build adjacency list with edge tracking
        adjacency: Dict[str, List[Tuple[str, str]]] = (
            {}
        )  # source -> [(target, edge_id)]
        for edge in edges:
            source = edge.get("source")
            target = edge.get("target")
            edge_id = edge.get("id")
            if source and target and edge_id:
                if source not in adjacency:
                    adjacency[source] = []
                adjacency[source].append((target, edge_id))

        # DFS to find back edges (edges that create cycles)
        WHITE, GRAY, BLACK = 0, 1, 2
        color: Dict[str, int] = {}
        cycle_edges: Set[str] = set()

        def dfs(node: str) -> None:
            color[node] = GRAY
            for neighbor, edge_id in adjacency.get(node, []):
                if neighbor not in color:
                    color[neighbor] = WHITE
                if color[neighbor] == WHITE:
                    dfs(neighbor)
                elif color[neighbor] == GRAY:
                    # Back edge found - this creates a cycle
                    cycle_edges.add(edge_id)
            color[node] = BLACK

        # Get all nodes
        all_nodes: Set[str] = set()
        for edge in edges:
            if edge.get("source"):
                all_nodes.add(edge["source"])
            if edge.get("target"):
                all_nodes.add(edge["target"])

        # Run DFS from each unvisited node
        for node in all_nodes:
            if node not in color:
                color[node] = WHITE
                dfs(node)

        return cycle_edges

    def _emit_graph_changes(
        self,
        product_id: str,
        graph: Dict,
        flows: List[Dict],
    ) -> Dict[str, Any]:
        """
        Emit graph changes to Graph Collaboration Client.

        Args:
            product_id: Product ID for the graph
            graph: Graph data with nodes and edges
            flows: Flows data

        Returns:
            Result from the collaboration client
        """
        client = GraphEventsClient()

        nodes = graph.get("nodes", [])
        edges = graph.get("edges", [])

        result = client.emit_graph_changes_sync(
            product_id=product_id,
            nodes=nodes,
            edges=edges,
            flows=flows,
            is_incremental=False,
        )

        return result

    def _save_to_gcp(
        self,
        graph: Dict,
        flows: List[Dict],
        gcp_bucket_path: str,
    ) -> Dict[str, str]:
        """
        Save graph and flows to GCP bucket.

        Args:
            graph: Graph data to save
            flows: Flows data to save
            gcp_bucket_path: GCP bucket path (e.g., "gs://bucket-name/path/to/folder")

        Returns:
            Dict with graph_uri and flows_uri
        """
        storage = GCPFileStorageWrapper()

        # Parse the bucket path
        if not gcp_bucket_path.startswith("gs://"):
            raise ValueError(
                f"Invalid GCP bucket path: {gcp_bucket_path}. Must start with 'gs://'"
            )

        # Remove gs:// prefix and split into bucket and path
        path_without_prefix = gcp_bucket_path[5:]
        parts = path_without_prefix.split("/", 1)
        bucket_name = parts[0]
        folder_path = parts[1] if len(parts) > 1 else ""

        # Fixed naming scheme for recommendation files
        graph_blob_name = (
            f"{folder_path}/graph-export-recommend.json"
            if folder_path
            else "graph-export-recommend.json"
        )
        flows_blob_name = (
            f"{folder_path}/flows-export-recommend.json"
            if folder_path
            else "flows-export-recommend.json"
        )

        # Save graph file
        graph_json = json.dumps(graph, indent=2, ensure_ascii=False)
        graph_uri = storage.store_file(
            file_contents=graph_json,
            bucket_name=bucket_name,
            blob_name=graph_blob_name,
            content_type="application/json",
        )

        # Save flows file
        flows_json = json.dumps(flows, indent=2, ensure_ascii=False)
        flows_uri = storage.store_file(
            file_contents=flows_json,
            bucket_name=bucket_name,
            blob_name=flows_blob_name,
            content_type="application/json",
        )

        return {
            "graph_uri": graph_uri,
            "flows_uri": flows_uri,
        }


# Convenience function
def construct_and_emit_graph(
    original_graph: Dict,
    original_flows: List[Dict],
    comparison_result: FlowComparisonResult,
    product_id: Optional[str] = None,
    gcp_bucket_path: Optional[str] = None,
) -> Tuple[Dict, List[Dict], Dict[str, Any]]:
    """
    Convenience function to construct graph and emit changes.

    By default emits to Graph Collaboration Client if product_id is provided.
    Optionally saves to GCP bucket if gcp_bucket_path is provided.

    Args:
        original_graph: Original graph data
        original_flows: Original flows data
        comparison_result: Result from flow comparison
        product_id: Product ID for emitting changes (required for emit)
        gcp_bucket_path: Optional GCP bucket path to save files

    Returns:
        Tuple of (new_graph, new_flows, result_info)
    """
    constructor = GraphConstructor()
    return constructor.construct_graph(
        original_graph=original_graph,
        original_flows=original_flows,
        comparison_result=comparison_result,
        product_id=product_id,
        gcp_bucket_path=gcp_bucket_path,
    )
