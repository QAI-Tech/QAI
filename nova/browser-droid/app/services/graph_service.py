import os
import io
import json
import logging
import base64
import tempfile
from typing import Dict, Any, List, Optional
import time
from datetime import datetime
from PIL import Image, ImageDraw
from app.services.streaming_service import StreamingService
from ..processors.graph_builder import (
    build_node,
    build_edge,
    normalize_node_id,
    normalize_edge_id,
    resolve_screenshot_path,
    serialize_graph,
    position_nodes_in_grid,
    build_flow,
    serialize_flows,
)
from nanoid import generate
from ..processors.graph_uploader import (
    append_graph,
)

logger = logging.getLogger(__name__)

import requests


class GraphService:
    """Service for handling graph creation operations"""

    def __init__(self, config, streaming_service: StreamingService, llm_wrapper=None):
        self.config = config
        self.streaming_service = streaming_service
        self.llm_wrapper = llm_wrapper
        # Cache for wildcard template image - will be loaded on first use
        self._wildcard_template_image = None

    def _get_wildcard_template_image(self) -> str:
        """Get the wildcard template image, loading it on first access"""
        if self._wildcard_template_image is None:
            self._wildcard_template_image = self._load_wildcard_template_image()
        return self._wildcard_template_image

    def create_graph_json(self, session_id: str, product_id: str) -> Dict[str, Any]:
        """Create graph JSON synchronously and return the result"""
        try:
            logger.info(f"Starting graph creation for session {session_id}")

            if not session_id:
                return {"error": "Session ID required for graph creation"}

            # Get session directory
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            if not os.path.exists(session_dir):
                return {"error": f"Session directory not found: {session_dir}"}

            # Get screenshot files
            screenshot_files = []
            for file in os.listdir(session_dir):
                if file.startswith("ss_") and file.endswith(".png"):
                    screenshot_files.append(file)

            if not screenshot_files:
                return {"error": "No screenshot files found in session directory"}

            # Sort screenshot files by timestamp
            screenshot_files.sort()

            # Create nodes
            nodes = []
            for i, screenshot_file in enumerate(screenshot_files):
                # Read and encode screenshot
                screenshot_path = os.path.join(session_dir, screenshot_file)
                node_id = normalize_node_id(session_id, product_id, f"screenshot_{i}")

                node = build_node(
                    node_id=node_id,
                    image_path=screenshot_path,
                    description=f"Screenshot {i + 1} from session {session_id}",
                    session_id=session_id,
                    screenshot_file=screenshot_file,
                )
                nodes.append(node)

            # Load transitions and create edges + wildcard nodes in one go
            nodes, edges = self._create_nodes_and_edges_with_wildcards(
                session_id, nodes, product_id
            )

            # Position nodes in grid
            position_nodes_in_grid(nodes)

            # Create graph JSON
            graph_data = serialize_graph(nodes, edges)

            # Save graph JSON
            graph_file_path_new = os.path.join(session_dir, "graph_new.json")
            with open(graph_file_path_new, "w") as f:
                json.dump(graph_data, f, indent=2)
            graph_file_path = os.path.join(session_dir, "graph.json")
            with open(graph_file_path, "w") as f:
                json.dump(graph_data, f, indent=2)

            # Append graph to GCP bucket if product_id is provided
            append_graph(graph_file_path, session_dir, product_id)

            logger.info(
                f"Graph created successfully for session {session_id}: "
                f"{len(nodes)} nodes, {len(edges)} edges"
            )

            return {
                "status": "success",
                "nodes": nodes,
                "edges": edges,
                "total_nodes": len(nodes),
                "total_edges": len(edges),
            }

        except Exception as e:
            logger.error(f"Error creating graph for session {session_id}: {e}")
            return {"error": f"Failed to create graph: {str(e)}"}

    def create_graph_json_from_session(
        self, session_id: str, product_id: str
    ) -> Dict[str, Any]:
        """Create graph JSON from session interaction analysis"""
        try:
            logger.info(
                f"Starting session-based graph creation for session {session_id}"
            )

            if not session_id:
                return {"error": "Session ID required for graph creation"}

            # Get session directory
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            if not os.path.exists(session_dir):
                return {"error": f"Session directory not found: {session_dir}"}

            # Load interaction analysis
            interaction_analysis_path = os.path.join(
                session_dir, "interaction_analysis.json"
            )
            if not os.path.exists(interaction_analysis_path):
                return {
                    "error": f"Interaction analysis file not found: {interaction_analysis_path}"
                }

            with open(interaction_analysis_path, "r") as f:
                interaction_data = json.load(f)

            interactions = interaction_data.get("interactions", [])
            if not interactions:
                return {"error": "No interactions found in interaction analysis"}

            # Create nodes and edges
            nodes = []
            edges = []
            node_id_map = {}  # Map screenshot path to node ID

            # Process interactions to create nodes and edges
            for i, interaction in enumerate(interactions):
                before_screenshot_path = interaction.get("before_screenshot_path")
                after_screenshot_path = interaction.get("after_screenshot_path")
                llm_analysis = interaction.get("llm_analysis", {})

                # Skip interactions without after_screenshot_path (typically the last interaction)
                if not after_screenshot_path:
                    logger.info(f"Skipping interaction {i} - no after_screenshot_path")
                    continue

                # Create node for before screenshot if not already created
                if before_screenshot_path not in node_id_map:
                    resolved_before_path = resolve_screenshot_path(
                        session_dir, before_screenshot_path
                    )
                    if os.path.exists(resolved_before_path):
                        before_node_id = normalize_node_id(
                            session_id, product_id, f"before_{i}"
                        )
                        before_screen_name = llm_analysis.get(
                            "before_screen_name", f"Screen {i+1}"
                        )

                        before_node = build_node(
                            node_id=before_node_id,
                            image_path=resolved_before_path,
                            description=before_screen_name,
                            session_id=session_id,
                        )
                        nodes.append(before_node)
                        node_id_map[before_screenshot_path] = before_node_id

                # Create node for after screenshot if not already created
                if after_screenshot_path not in node_id_map:
                    resolved_after_path = resolve_screenshot_path(
                        session_dir, after_screenshot_path
                    )
                    if os.path.exists(resolved_after_path):
                        after_node_id = normalize_node_id(
                            session_id, product_id, f"after_{i}"
                        )
                        after_screen_name = llm_analysis.get(
                            "after_screen_name", f"Screen {i+1}"
                        )

                        after_node = build_node(
                            node_id=after_node_id,
                            image_path=resolved_after_path,
                            description=after_screen_name,
                            session_id=session_id,
                        )
                        nodes.append(after_node)
                        node_id_map[after_screenshot_path] = after_node_id

                # Create edge from before to after
                if (
                    before_screenshot_path in node_id_map
                    and after_screenshot_path in node_id_map
                ):
                    source_id = node_id_map[before_screenshot_path]
                    target_id = node_id_map[after_screenshot_path]

                    interaction_summary = llm_analysis.get(
                        "interaction_summary", f"Interaction {i+1}"
                    )

                    edge_id = normalize_edge_id(session_id, product_id, i)
                    edge = build_edge(
                        edge_id=edge_id,
                        source_id=source_id,
                        target_id=target_id,
                        description=f"{interaction_summary}",
                        interaction_index=i,
                        interaction_type=interaction.get("interaction_type"),
                        coordinates=interaction.get("coordinates"),
                        ui_element=interaction.get("ui_element", {}),
                    )
                    edges.append(edge)

            # Position nodes in grid
            position_nodes_in_grid(nodes)

            # Create graph JSON
            graph_data = serialize_graph(nodes, edges)

            # Save graph JSON
            graph_file_path = os.path.join(session_dir, "graph.json")
            with open(graph_file_path, "w") as f:
                json.dump(graph_data, f, indent=2)

            # Generate and save flows.json
            flows = self._generate_flows_json(session_id, product_id, nodes, edges)
            flows_file_path = self._save_flows_json(session_id, flows)

            # Append graph to GCP bucket if product_id is provided
            append_graph(graph_file_path, session_dir, product_id)

            # Call post-creation API
            self._request_kg_planning(product_id)

            return {
                "status": "success",
                "nodes": nodes,
                "edges": edges,
                "total_nodes": len(nodes),
                "total_edges": len(edges),
                "graph_file_path": graph_file_path,
            }

        except Exception as e:
            logger.error(
                f"Error creating session-based graph for session {session_id}: {e}"
            )
            return {"error": f"Failed to create session-based graph: {str(e)}"}

    def _load_transitions_and_create_edges(
        self, session_id: str, nodes: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Load transitions.json and create edges between nodes"""
        edges = []

        # Create mapping from node index to node ID
        node_index_to_id_map = {}
        for i, node in enumerate(nodes):
            node_index_to_id_map[i] = node["id"]

        # Load transitions.json
        session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
        transitions_file_path = os.path.join(session_dir, "transitions.json")

        if not os.path.exists(transitions_file_path):
            logger.info(
                f"Transitions file not found for session {session_id}, creating graph without edges"
            )
            return edges

        try:
            with open(transitions_file_path, "r") as f:
                transitions_data = json.load(f)

            intervals = transitions_data.get("intervals", [])

            for i, interval in enumerate(intervals):
                before_screenshot = interval.get("before_screenshot")
                after_screenshot = interval.get("after_screenshot")
                transition_analysis = interval.get("transition_analysis", {})
                transition_summary = transition_analysis.get("transition_summary", "")

                # Check for backnav count and skip transitions with backnav > 1
                back_nav_count = transition_analysis.get("back_nav_count_prediction", 0)
                if back_nav_count > 0:
                    logger.info(
                        f"Skipping transition for interval {i} in session {session_id}: "
                        f"backnav count {back_nav_count} > 0"
                    )
                    continue

                # Find corresponding node indices from screenshot paths
                source_node_index = None
                target_node_index = None

                # Extract screenshot filenames and find their indices
                if before_screenshot:
                    before_filename = os.path.basename(before_screenshot)
                    # Find the node index that corresponds to this screenshot
                    for node_idx, node in enumerate(nodes):
                        node_data = node.get("data", {})
                        if (
                            "screenshot_file" in node_data
                            and node_data["screenshot_file"] == before_filename
                        ):
                            source_node_index = node_idx
                            break

                if after_screenshot:
                    after_filename = os.path.basename(after_screenshot)
                    # Find the node index that corresponds to this screenshot
                    for node_idx, node in enumerate(nodes):
                        node_data = node.get("data", {})
                        if (
                            "screenshot_file" in node_data
                            and node_data["screenshot_file"] == after_filename
                        ):
                            target_node_index = node_idx
                            break

                # Get node IDs from indices
                source_node_id = (
                    node_index_to_id_map.get(source_node_index)
                    if source_node_index is not None
                    else None
                )
                target_node_id = (
                    node_index_to_id_map.get(target_node_index)
                    if target_node_index is not None
                    else None
                )

                # Log errors for missing mappings
                if source_node_index is None and before_screenshot is not None:
                    logger.error(
                        f"Before screenshot {os.path.basename(before_screenshot)} not found in nodes for session {session_id}"
                    )

                if target_node_index is None and after_screenshot is not None:
                    logger.error(
                        f"After screenshot {os.path.basename(after_screenshot)} not found in nodes for session {session_id}"
                    )

                # Create edge if both source and target nodes exist
                if source_node_id and target_node_id:
                    edge = {
                        "id": f"edge-{session_id}-{i}",
                        "source": source_node_id,
                        "target": target_node_id,
                        "sourceHandle": "right-source",
                        "targetHandle": "left-target",
                        "type": "customEdge",
                        "data": {
                            "description": transition_summary,
                            "source": source_node_id,
                            "target": target_node_id,
                            "isNewEdge": False,
                        },
                    }
                    edges.append(edge)
                elif source_node_id is None and before_screenshot is None:
                    # Skip edges where before_screenshot is null (first interval)
                    logger.info(
                        f"Skipping edge for interval {i} in session {session_id}: before_screenshot is null"
                    )
                elif target_node_id is None and after_screenshot is None:
                    # Skip edges where after_screenshot is null (last interval)
                    logger.info(
                        f"Skipping edge for interval {i} in session {session_id}: after_screenshot is null"
                    )
                else:
                    logger.error(
                        f"Could not create edge for interval {i} in session {session_id}: missing source or target node"
                    )

            logger.info(
                f"Created {len(edges)} edges from transitions for session {session_id}"
            )

        except Exception as e:
            logger.error(f"Error loading transitions for session {session_id}: {e}")

        return edges

    def _create_nodes_and_edges_with_wildcards(
        self, session_id: str, nodes: List[Dict[str, Any]], product_id: str
    ) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Create nodes and edges in one go, including wildcard nodes for missing edges"""
        edges = []
        wildcard_nodes = []
        wildcard_counter = 0

        # Load transitions.json
        session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
        transitions_file_path = os.path.join(session_dir, "transitions.json")

        if not os.path.exists(transitions_file_path):
            logger.info(
                f"Transitions file not found for session {session_id}, creating graph without edges"
            )
            return nodes, edges

        try:
            with open(transitions_file_path, "r") as f:
                transitions_data = json.load(f)

            intervals = transitions_data.get("intervals", [])

            # Create a set of valid edges (transitions that were not skipped)
            valid_edges = set()
            skipped_transitions = (
                {}
            )  # Store skipped transitions for wildcard node creation

            # First pass: identify valid edges and skipped transitions
            for i, interval in enumerate(intervals):
                before_screenshot = interval.get("before_screenshot")
                after_screenshot = interval.get("after_screenshot")
                transition_analysis = interval.get("transition_analysis", {})
                transition_summary = transition_analysis.get("transition_summary", "")
                back_nav_count = transition_analysis.get("back_nav_count_prediction", 0)

                # Find corresponding node indices from screenshot paths
                source_node_index = None
                target_node_index = None

                # Extract screenshot filenames and find their indices
                if before_screenshot:
                    before_filename = os.path.basename(before_screenshot)
                    for node_idx, node in enumerate(nodes):
                        node_data = node.get("data", {})
                        if node_data.get("screenshot_file") == before_filename:
                            source_node_index = node_idx
                            break

                if after_screenshot:
                    after_filename = os.path.basename(after_screenshot)
                    for node_idx, node in enumerate(nodes):
                        node_data = node.get("data", {})
                        if node_data.get("screenshot_file") == after_filename:
                            target_node_index = node_idx
                            break

                # If we found both nodes
                if source_node_index is not None and target_node_index is not None:
                    source_node_id = nodes[source_node_index]["id"]
                    target_node_id = nodes[target_node_index]["id"]

                    if back_nav_count > 0:
                        # Store skipped transition for later wildcard node creation
                        skipped_transitions[target_node_id] = {
                            "source_node_id": source_node_id,
                            "transition_summary": transition_summary,
                            "back_nav_count": back_nav_count,
                        }
                    else:
                        # Create normal edge
                        valid_edges.add((source_node_id, target_node_id))
                        edge_id = normalize_edge_id(
                            session_id, product_id, source_node_index
                        )
                        edge = build_edge(
                            edge_id=edge_id,
                            source_id=source_node_id,
                            target_id=target_node_id,
                            description=transition_summary,
                        )
                        edges.append(edge)

            # Second pass: check for missing edges between consecutive nodes and create wildcard nodes
            # We need to iterate backwards to avoid index issues when inserting nodes
            for i in range(len(nodes) - 1, 0, -1):
                current_node_id = nodes[i - 1]["id"]
                next_node_id = nodes[i]["id"]

                # Check if there's a missing edge between consecutive nodes
                if (current_node_id, next_node_id) not in valid_edges:
                    # Create wildcard node for the missing edge
                    wildcard_counter += 1
                    timestamp = int(time.time())
                    wildcard_node_id = f"wildcard_node_{session_id}_{product_id}_{timestamp}_{wildcard_counter}"

                    # Get transition summary and back nav count from skipped transition if available
                    transition_summary = "Missing connection"
                    back_nav_count = 0
                    if next_node_id in skipped_transitions:
                        transition_summary = skipped_transitions[next_node_id][
                            "transition_summary"
                        ]
                        back_nav_count = skipped_transitions[next_node_id].get(
                            "back_nav_count", 0
                        )

                    # Create wildcard node
                    wildcard_node = {
                        "id": wildcard_node_id,
                        "type": "customNode",
                        "position": {"x": 0, "y": 0},  # Will be positioned later
                        "data": {
                            "image": self._get_wildcard_template_image(),
                            "description": "Missing connection",
                            "session_id": session_id,
                            "screenshot_file": None,
                            "back_nav_count": back_nav_count,
                        },
                    }

                    # Insert wildcard node between the broken edge
                    nodes.insert(i, wildcard_node)

                    # Create edge from wildcard node to next node (no incoming edge)
                    wildcard_out_edge = {
                        "id": f"edge-{session_id}-wildcard-out-{wildcard_counter}",
                        "source": wildcard_node_id,
                        "target": next_node_id,
                        "sourceHandle": "right-source",
                        "targetHandle": "left-target",
                        "type": "customEdge",
                        "data": {
                            "description": transition_summary,
                            "source": wildcard_node_id,
                            "target": next_node_id,
                            "isNewEdge": False,
                        },
                    }
                    edges.append(wildcard_out_edge)

                    logger.info(
                        f"Created wildcard node {wildcard_node_id} for missing edge from {current_node_id} to {next_node_id}"
                    )

        except Exception as e:
            logger.error(
                f"Error creating nodes and edges for session {session_id}: {e}"
            )

        logger.info(f"Created {wildcard_counter} wildcard nodes and {len(edges)} edges")
        return nodes, edges

    def _get_back_nav_count(
        self, session_id: str, source_filename: str, target_filename: str
    ) -> int:
        """Get the back_nav_count_prediction for a transition between two nodes"""
        try:
            # Load transitions.json
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            transitions_file_path = os.path.join(session_dir, "transitions.json")

            if not os.path.exists(transitions_file_path):
                return 0

            with open(transitions_file_path, "r") as f:
                transitions_data = json.load(f)

            intervals = transitions_data.get("intervals", [])

            for interval in intervals:
                before_screenshot = interval.get("before_screenshot")
                after_screenshot = interval.get("after_screenshot")

                if before_screenshot and after_screenshot:
                    before_filename = os.path.basename(before_screenshot)
                    after_filename = os.path.basename(after_screenshot)

                    if (
                        before_filename == source_filename
                        and after_filename == target_filename
                    ):
                        transition_analysis = interval.get("transition_analysis", {})
                        return transition_analysis.get("back_nav_count_prediction", 0)

            return 0

        except Exception as e:
            logger.error(f"Error getting back_nav_count for session {session_id}: {e}")
            return 0

    def _find_path_between_nodes(
        self, start_node_id: str, end_node_id: str, edges: List[Dict[str, Any]]
    ) -> List[str]:
        """Find a path between two nodes using BFS"""
        if start_node_id == end_node_id:
            return [start_node_id]

        # Create adjacency list
        adjacency = {}
        for edge in edges:
            source = edge["source"]
            target = edge["target"]
            if source not in adjacency:
                adjacency[source] = []
            adjacency[source].append(target)

        # BFS to find path
        queue = [(start_node_id, [start_node_id])]
        visited = {start_node_id}

        while queue:
            current_node, path = queue.pop(0)

            if current_node not in adjacency:
                continue

            for neighbor in adjacency[current_node]:
                if neighbor == end_node_id:
                    return path + [neighbor]

                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append((neighbor, path + [neighbor]))

        return []

    def _load_wildcard_template_image(self) -> str:
        """Load and base64 encode the wildcard template image"""
        try:
            # Construct path to wildcard template image
            # The image is in browser-droid/static/assets/wildcard_node_template.png
            # We need to go up from app/services to browser-droid, then into static/assets
            current_dir = os.path.dirname(os.path.abspath(__file__))  # app/services
            project_root = os.path.dirname(
                os.path.dirname(current_dir)
            )  # browser-droid
            wildcard_image_path = os.path.join(
                project_root, "static", "assets", "wildcard_node_template.png"
            )

            if not os.path.exists(wildcard_image_path):
                logger.error(
                    f"Wildcard template image not found at: {wildcard_image_path}"
                )
                return ""

            # Read and encode the image
            with open(wildcard_image_path, "rb") as f:
                image_data = f.read()
                base64_image = base64.b64encode(image_data).decode("utf-8")

            logger.info("Wildcard template image loaded successfully")
            return f"data:image/png;base64,{base64_image}"

        except Exception as e:
            logger.error(f"Error loading wildcard template image: {e}")
            return ""

    def _generate_flows_json(
        self,
        session_id: str,
        product_id: str,
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Generate flows.json from nodes and edges"""
        try:
            flows = []

            # Find all nodes that have no incoming edges (start nodes)
            target_nodes = set(edge["target"] for edge in edges)
            start_nodes = [node for node in nodes if node["id"] not in target_nodes]

            # Find all nodes that have no outgoing edges (end nodes)
            source_nodes = set(edge["source"] for edge in edges)
            end_nodes = [node for node in nodes if node["id"] not in source_nodes]

            # Create a flow for each start node to each reachable end node
            for start_node in start_nodes:
                for end_node in end_nodes:
                    # Find path from start to end using BFS
                    path = self._find_path_between_nodes(
                        start_node["id"], end_node["id"], edges
                    )

                    if (
                        path and len(path) > 1
                    ):  # Only create flows with at least 2 nodes
                        # Extract via nodes (all nodes except start and end)
                        via_node_ids = path[1:-1] if len(path) > 2 else []

                        flow_id = f"flow-{product_id}-{session_id}-{generate(size=12)}"

                        # Create flow name with human-readable timestamp
                        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        flow_name = f"Flow {timestamp}"

                        # Build the flow object using the helper
                        flow = build_flow(
                            flow_id=flow_id,
                            flow_name=flow_name,
                            start_node_id=start_node["id"],
                            end_node_id=end_node["id"],
                            via_node_ids=via_node_ids,
                            path_node_ids=path,
                        )

                        flows.append(flow)

            # If no flows were found, create a simple flow with all nodes in order
            if not flows and nodes:
                flow_id = f"flow-{product_id}-{session_id}-{generate(size=12)}"
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                flow_name = f"Flow {timestamp}"

                all_node_ids = [node["id"] for node in nodes]
                via_node_ids = all_node_ids[1:-1] if len(all_node_ids) > 2 else []

                flow = build_flow(
                    flow_id=flow_id,
                    flow_name=flow_name,
                    start_node_id=all_node_ids[0],
                    end_node_id=all_node_ids[-1],
                    via_node_ids=via_node_ids,
                    path_node_ids=all_node_ids,
                )

                flows.append(flow)

            logger.info(f"Generated {len(flows)} flows for session {session_id}")
            return flows

        except Exception as e:
            logger.error(f"Error generating flows for session {session_id}: {e}")
            return []

    def _save_flows_json(self, session_id: str, flows: List[Dict[str, Any]]) -> str:
        """Save flows.json to session directory"""
        try:
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            flows_file_path = os.path.join(session_dir, "flows.json")

            # Use the serialize_flows helper
            flows_data = serialize_flows(flows)

            with open(flows_file_path, "w") as f:
                json.dump(flows_data, f, indent=2)

            logger.info(f"Saved flows.json to {flows_file_path}")
            return flows_file_path

        except Exception as e:
            logger.error(f"Error saving flows.json for session {session_id}: {e}")
            return ""

    def _request_kg_planning(self, product_id: str) -> None:
        """Call API after graph and flow creation is complete"""
        try:
            api_url = self.config.KG_PLANNING_API_URL
            headers = {
                "Content-Type": "application/json",
                "Authorization": self.config.AUTH_TOKEN,
            }

            payload = {"product_id": product_id}

            response = requests.post(api_url, json=payload, headers=headers)
            data = response.json()
            request_id = data['request_id']
            self.streaming_service.handle_request_id_stream(request_id=request_id)
            if response.status_code == 200:
                logger.info(
                    f"Successfully requested KG planning for product_id: {product_id}"
                )
            else:
                logger.warning(
                    f"KG planning request failed with status {response.status_code} for product_id: {product_id}"
                )

        except Exception as e:
            logger.error(
                f"Error requesting KG planning for product_id {product_id}: {e}"
            )

    def _decode_image_data(self, data_url: str) -> bytes:
        """Decode base64 image data from data URL"""
        if not data_url:
            raise ValueError("Image data is required")
        if "," in data_url:
            data_url = data_url.split(",", 1)[1]
        return base64.b64decode(data_url)

    def _save_temp_image(
        self,
        data_url: str,
        bounding_box: Optional[Dict[str, int]] = None,
    ) -> str:
        image_bytes = self._decode_image_data(data_url)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        if bounding_box:
            draw = ImageDraw.Draw(image, "RGBA")
            x = bounding_box.get("x", 0)
            y = bounding_box.get("y", 0)
            width = bounding_box.get("width", 100)
            height = bounding_box.get("height", 100)

            # Draw red bounding box with semi-transparent fill
            draw.rectangle(
                [(x, y), (x + width, y + height)],
                outline=(255, 0, 0, 255),
                width=4,
            )
            # Add semi-transparent red overlay
            overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
            overlay_draw = ImageDraw.Draw(overlay)
            overlay_draw.rectangle(
                [(x, y), (x + width, y + height)],
                fill=(255, 0, 0, 40),
            )
            image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")

        # Save to temp file
        temp_file = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        image.save(temp_file.name, "PNG")
        return temp_file.name

    def describe_transition_action(
        self,
        before_image: str,
        after_image: str,
        bounding_box: Dict[str, int],
        action: Dict[str, Any],
        is_web: bool = False,
    ) -> Dict[str, Any]:
        """
        Generate edge description for a transition between two screens.

        Args:
            before_image: Base64 encoded before screenshot
            after_image: Base64 encoded after screenshot
            bounding_box: Dict with x, y, width, height for the interaction area
            action: Action context dict with summary, type, details
            is_web: Whether this is a web recorder capture (True) or BrowserDroid (False)

        Returns:
            Dict with status and description
        """
        temp_files = []
        try:
            if not self.llm_wrapper:
                return {"error": "LLM wrapper not configured"}

            # Save before image with bounding box annotation
            before_path = self._save_temp_image(before_image, bounding_box)
            temp_files.append(before_path)

            # Save after image without annotation
            after_path = self._save_temp_image(after_image)
            temp_files.append(after_path)

            # Call LLM to describe transition
            result = self.llm_wrapper.describe_transition_action(
                before_image_path=before_path,
                after_image_path=after_path,
                action=action,
                is_web=is_web,
            )

            description = result.get("formatted_description", "")
            return {"status": "success", "description": description}
        except Exception as e:
            logger.error(f"Failed to describe transition: {e}")
            return {"error": str(e)}
        finally:
            for path in temp_files:
                try:
                    os.remove(path)
                except OSError as e:
                    logger.warning(f"Failed to remove temp file {path}: {e}")
