"""
FlowGenerator for blind run post-processing.

Produces flow_blind.json from graph_blind.json data.
Flow represents the linear test execution path through the graph.
"""

import json
import logging
import uuid
from typing import Any, Dict, List, Optional

logger = logging.getLogger("nova")


class FlowGenerator:
    """
    Generates flow_blind.json from graph data.

    Flow structure captures the sequential path of a test execution,
    mapping to the nodes visited during the test run.
    """

    def __init__(
        self,
        graph_data: Dict[str, Any],
        flow_name: Optional[str] = None,
        precondition: str = "",
        credentials: Optional[List[Dict[str, str]]] = None,
        video_url: Optional[str] = None,
    ):
        """
        Args:
            graph_data: Graph dict with "nodes" and "edges" from graph_blind.json
            flow_name: Human-readable name for this flow (auto-generated if not provided)
            precondition: Starting precondition/context for the flow
            credentials: List of credential dicts used in the flow
            video_url: URL to the execution video (if available)
        """
        self.graph_data = graph_data
        self._provided_flow_name = flow_name
        self.precondition = precondition
        self.credentials = credentials or []
        self.video_url = video_url
        self._flow_id = f"flow_{uuid.uuid1()}"

    def _generate_flow_name(self) -> str:
        """
        Generate flow name from last edge description.

        Format: 'Generated Flow - "{Last Edge Description}"'
        Falls back to 'Generated Flow' if no edges exist.
        """
        if self._provided_flow_name:
            return self._provided_flow_name

        edges = self.graph_data.get("edges", [])
        if edges:
            # Get the last edge's description
            last_edge = edges[-1]
            last_description = last_edge.get("data", {}).get("description", "")
            if last_description:
                return f'Generated Flow - "{last_description}"'

        return "Generated Flow"

    def generate_flow(self) -> List[Dict[str, Any]]:
        """
        Generate flow_blind.json structure from graph data.

        Returns:
            Dict matching the flow schema:
            {
                "id": string,
                "name": string,
                "startNodeId": string,
                "endNodeId": string,
                "viaNodeIds": [string],
                "pathNodeIds": [string],
                "precondition": string,
                "scenarios": [],
                "credentials": [],
                "videoUrl": string or null,
                "autoPlan": boolean
            }
        """
        nodes = self.graph_data.get("nodes", [])
        edges = self.graph_data.get("edges", [])

        if not nodes:
            logger.warning("No nodes in graph, generating empty flow")
            return self._build_empty_flow()

        # Extract path from graph structure
        # Nodes are ordered by their position.x (each node is index * 500 apart)
        # So we can derive the path by sorting nodes by position
        sorted_nodes = sorted(nodes, key=lambda n: n.get("position", {}).get("x", 0))

        # Get all node IDs in order
        path_node_ids = [node["id"] for node in sorted_nodes]

        # Start and end nodes
        start_node_id = path_node_ids[0] if path_node_ids else ""
        end_node_id = path_node_ids[-1] if path_node_ids else ""

        # Via nodes are all intermediate nodes (excluding start and end)
        via_node_ids = path_node_ids[1:-1] if len(path_node_ids) > 2 else []

        # Build scenarios from edges (action descriptions)
        # scenarios = self._build_scenarios_from_edges(edges, sorted_nodes)

        flow = {
            "id": self._flow_id,
            "name": self._generate_flow_name(),
            "startNodeId": start_node_id,
            "endNodeId": end_node_id,
            "viaNodeIds": via_node_ids,
            "pathNodeIds": path_node_ids,
            "precondition": self.precondition,
            "scenarios": [],
            "credentials": self.credentials,
            "videoUrl": self.video_url,
            "autoPlan": True,  # Blind runs are auto-planned
            "product_id": "",
        }

        logger.info(
            f"Generated flow with {len(path_node_ids)} nodes "
            f"({len(via_node_ids)} via nodes)"
        )

        return [flow]

    def _build_empty_flow(self) -> List[Dict[str, Any]]:
        """Build an empty flow structure when no nodes exist."""
        return [{
            "id": self._flow_id,
            "name": self._generate_flow_name(),
            "startNodeId": "",
            "endNodeId": "",
            "viaNodeIds": [],
            "pathNodeIds": [],
            "precondition": self.precondition,
            "scenarios": [],
            "credentials": self.credentials,
            "videoUrl": self.video_url,
            "autoPlan": True,
        }]

    def _build_scenarios_from_edges(
        self, edges: List[Dict[str, Any]], sorted_nodes: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Build scenarios list from edge data.

        Each scenario represents a step/action in the test flow.
        """
        scenarios = []

        # Create a map of source -> edge for easy lookup
        edge_map = {edge["source"]: edge for edge in edges}

        for i, node in enumerate(sorted_nodes[:-1]):  # Skip last node (no outgoing edge)
            node_id = node["id"]
            edge = edge_map.get(node_id)

            if edge:
                scenario = {
                    "stepNumber": i + 1,
                    "sourceNodeId": node_id,
                    "targetNodeId": edge.get("target", ""),
                    "action": edge.get("data", {}).get("description", ""),
                    "businessLogic": edge.get("data", {}).get("business_logic", ""),
                }
                scenarios.append(scenario)

        return scenarios
