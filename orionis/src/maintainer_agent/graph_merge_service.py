"""
Graph Merge Service for Maintainer Agent
Handles downloading existing graphs and merging new execution graphs below existing content
"""

import hashlib
import json
from typing import Dict, List, Optional

from constants import Constants
from utils.util import orionis_log
from common.google_cloud_wrappers import GCPFileStorageWrapper
from common.collaboration_client import collaboration_manager
from services.notify_service.notify import NotificationService
from config import Config, config
from users.user_service import UserService
from users.user_request_validator import UserRequestValidator
from users.user_datastore import UserDatastore


class GraphMergeService:
    """
    Service for merging Maintainer Agent generated graphs with existing product graphs.
    Positions new graphs below existing content to maintain visual separation.
    """

    def __init__(self):
        self.file_storage = GCPFileStorageWrapper()
        self.bucket_name = (
            "graph-editor-prod"
            if config.environment == Config.PRODUCTION
            else "graph-editor"
        )
        self.y_spacing = 500
        self.x_spacing = 600
        self.node_prefix = "node-exec-"
        self.edge_prefix = "edge-exec-"
        self.flow_prefix = "flow-execution-"
        self.notification_service = NotificationService()
        self.user_service = UserService(UserRequestValidator(), UserDatastore())

    def download_latest_generated_graph(self, product_id: str) -> Optional[Dict]:
        """
        Download the latest generated graph from GCS for a given product

        Args:
            product_id: The product identifier

        Returns:
            Dictionary containing nodes and edges, or None if not found
        """
        try:
            graph_path = (
                f"qai-upload-temporary/productId_{product_id}/generated-graph.json"
            )
            uri = f"gs://{self.bucket_name}/{graph_path}"

            orionis_log(f"Downloading latest generated graph from: {uri}")

            local_path = self.file_storage.download_file_locally(
                uri=uri, generation=None, use_constructed_bucket_name=False
            )

            with open(local_path, "r") as f:
                graph_data = json.load(f)

            orionis_log(
                f"Downloaded generated graph - Nodes: {len(graph_data.get('nodes', []))}, "
                f"Edges: {len(graph_data.get('edges', []))}"
            )

            return graph_data

        except Exception as e:
            orionis_log(
                f"Could not download existing generated graph (may be first execution for product): {str(e)}"
            )
            return None

    def calculate_highest_y_coordinate(self, graph: Dict) -> int:
        """
        Calculate the highest Y coordinate (visually lowest/bottom-most position) in the existing graph.
        In canvas coordinate systems, higher Y values = lower on screen.

        Args:
            graph: Graph dictionary with nodes

        Returns:
            Highest Y coordinate found, or 0 if no nodes
        """
        nodes = graph.get("nodes", [])

        if not nodes:
            orionis_log("No existing nodes found, returning Y=0")
            return 0

        highest_y = max(node.get("position", {}).get("y", 0) for node in nodes)
        orionis_log(
            f"Highest Y coordinate (bottom-most) in existing graph: {highest_y}"
        )

        return highest_y

    def calculate_leftmost_x_coordinate(self, graph: Dict) -> int:
        """
        Calculate the leftmost (minimum) X coordinate in the existing graph.

        Args:
            graph: Graph dictionary with nodes

        Returns:
            Leftmost X coordinate found, or 0 if no nodes
        """
        nodes = graph.get("nodes", [])

        if not nodes:
            orionis_log("No existing nodes found, returning X=0")
            return 0

        leftmost_x = min(node.get("position", {}).get("x", 0) for node in nodes)
        orionis_log(f"Leftmost X coordinate in existing graph: {leftmost_x}")

        return leftmost_x

    def reposition_new_graph(
        self,
        new_graph: Dict,
        base_y: int,
        new_y_start: Optional[int] = None,
        new_x_start: Optional[int] = None,
    ) -> Dict:
        """
        Reposition all nodes in the new graph to appear BELOW the existing graph.

        Canvas coordinate system: Lower Y = Top, Higher Y = Bottom
        So to place new graph BELOW existing, we need HIGHER Y values.

        Args:
            new_graph: The new graph to reposition
            base_y: The highest Y coordinate in existing graph (bottom-most position)
            new_y_start: Optional explicit starting Y position. If provided, uses this directly.
                        Otherwise, calculates from base_y + spacing.
            new_x_start: Optional explicit starting X position. If provided, shifts nodes horizontally
                        so the leftmost node aligns to this X. If not provided, X is unchanged.

        Returns:
            Graph with repositioned nodes
        """
        if new_y_start is None:
            new_y_start = base_y + self.y_spacing

        orionis_log(
            f"Repositioning new graph to start at Y={new_y_start} (below existing graph)"
        )

        # Deep copy the graph to avoid modifying the original
        repositioned_graph = json.loads(json.dumps(new_graph))

        # Get nodes to compute offsets
        new_nodes = repositioned_graph.get("nodes", [])
        if not new_nodes:
            return repositioned_graph

        # Find current topmost (minimum Y) and leftmost (minimum X) positions in new graph
        current_top_y = min(node.get("position", {}).get("y", 0) for node in new_nodes)
        current_left_x = min(node.get("position", {}).get("x", 0) for node in new_nodes)

        # Calculate offset needed to move new graph below existing
        y_offset = new_y_start - current_top_y
        x_offset = (new_x_start - current_left_x) if new_x_start is not None else 0

        orionis_log(
            f"Applying offsets to nodes - X: {x_offset}, Y: {y_offset} (nodes: {len(new_nodes)})"
        )

        # Apply offsets to all nodes
        for node in new_nodes:
            if "position" in node:
                if "y" in node["position"]:
                    node["position"]["y"] += y_offset
                if x_offset and "x" in node["position"]:
                    node["position"]["x"] += x_offset

        return repositioned_graph

    def count_existing_exec_nodes_and_edges(self, graph: Dict) -> tuple[int, int]:
        """
        Count existing node-exec-* and edge-exec-* IDs in the graph

        Args:
            graph: Graph dictionary with nodes and edges

        Returns:
            Tuple of (max_node_number, max_edge_number)
        """
        nodes = graph.get("nodes", [])
        edges = graph.get("edges", [])

        max_node_num = -1
        max_edge_num = -1

        # Find the highest node-exec-XXXX number
        for node in nodes:
            node_id = node.get("id", "")
            if node_id.startswith(self.node_prefix):
                try:
                    num = int(node_id.replace(self.node_prefix, ""))
                    max_node_num = max(max_node_num, num)
                except ValueError:
                    continue

        # Find the highest edge-exec-XXXX number
        for edge in edges:
            edge_id = edge.get("id", "")
            if edge_id.startswith(self.edge_prefix):
                try:
                    num = int(edge_id.replace(self.edge_prefix, ""))
                    max_edge_num = max(max_edge_num, num)
                except ValueError:
                    continue

        orionis_log(
            f"Existing graph has max node-exec number: {max_node_num}, "
            f"max edge-exec number: {max_edge_num}"
        )

        return max_node_num, max_edge_num

    def renumber_graph_ids(
        self, graph: Dict, start_node_num: int, start_edge_num: int
    ) -> Dict:
        """
        Renumber all node-exec-* and edge-exec-* IDs in the graph to ensure uniqueness

        Args:
            graph: Graph to renumber
            start_node_num: Starting number for node IDs
            start_edge_num: Starting number for edge IDs

        Returns:
            Graph with renumbered IDs and updated references
        """
        orionis_log(
            f"Renumbering graph IDs - Starting node: {start_node_num}, "
            f"Starting edge: {start_edge_num}"
        )

        # Deep copy to avoid modifying original
        renumbered_graph = json.loads(json.dumps(graph))

        # Create mapping from old node IDs to new node IDs
        node_id_mapping = {}
        nodes = renumbered_graph.get("nodes", [])

        for i, node in enumerate(nodes):
            old_node_id = node.get("id", "")
            if old_node_id.startswith(self.node_prefix):
                new_node_id = f"{self.node_prefix}{start_node_num + i:04d}"
                node_id_mapping[old_node_id] = new_node_id
                node["id"] = new_node_id

        orionis_log(f"Renumbered {len(node_id_mapping)} nodes")

        # Renumber edges and update source/target references
        edges = renumbered_graph.get("edges", [])
        edge_count = 0

        for i, edge in enumerate(edges):
            old_edge_id = edge.get("id", "")

            # Update edge ID
            if old_edge_id.startswith(self.edge_prefix):
                new_edge_id = f"{self.edge_prefix}{start_edge_num + i:04d}"
                edge["id"] = new_edge_id
                edge_count += 1

            # Update source and target references
            if edge.get("source") in node_id_mapping:
                edge["source"] = node_id_mapping[edge["source"]]

            if edge.get("target") in node_id_mapping:
                edge["target"] = node_id_mapping[edge["target"]]

            # Update data.source and data.target if they exist
            if "data" in edge:
                if edge["data"].get("source") in node_id_mapping:
                    edge["data"]["source"] = node_id_mapping[edge["data"]["source"]]

                if edge["data"].get("target") in node_id_mapping:
                    edge["data"]["target"] = node_id_mapping[edge["data"]["target"]]

        orionis_log(f"Renumbered {edge_count} edges and updated all references")

        return renumbered_graph

    def merge_graphs(self, existing_graph: Optional[Dict], new_graph: Dict) -> Dict:
        """
        Merge the new graph BELOW the existing graph.

        Visual layout:
        ┌─────────────────┐
        │ Existing Graph  │  ← Y values around 23000
        └─────────────────┘
              ↓ +500 spacing
        ┌─────────────────┐
        │  New Graph      │  ← Y values around 23500+
        └─────────────────┘

        Args:
            existing_graph: The current graph from GCS (can be None for first graph)
            new_graph: The new graph from Maintainer Agent

        Returns:
            Merged graph with new content positioned below existing
        """
        # If no existing graph, return the new graph as-is
        if not existing_graph:
            orionis_log("No existing graph found, using new graph as initial graph")
            return new_graph

        # Step 1: Calculate where to position the new graph (find bottom of existing graph)
        highest_y = self.calculate_highest_y_coordinate(existing_graph)

        # Step 2: Count existing node-exec and edge-exec IDs
        max_node_num, max_edge_num = self.count_existing_exec_nodes_and_edges(
            existing_graph
        )

        # Step 3: Renumber the new graph IDs to avoid conflicts
        # Start numbering from the next available number
        start_node_num = max_node_num + 1
        start_edge_num = max_edge_num + 1

        renumbered_new_graph = self.renumber_graph_ids(
            new_graph, start_node_num=start_node_num, start_edge_num=start_edge_num
        )

        # Step 4: Reposition the new graph below the existing one
        repositioned_new_graph = self.reposition_new_graph(
            renumbered_new_graph, highest_y
        )

        # Step 5: Merge the graphs
        merged_nodes = existing_graph.get("nodes", []) + repositioned_new_graph.get(
            "nodes", []
        )
        merged_edges = existing_graph.get("edges", []) + repositioned_new_graph.get(
            "edges", []
        )

        merged_graph = {"nodes": merged_nodes, "edges": merged_edges}

        orionis_log(
            f"Merged graph created - Total nodes: {len(merged_nodes)}, "
            f"Total edges: {len(merged_edges)}"
        )

        return merged_graph

    def upload_merged_generated_graph(
        self, product_id: str, merged_graph: Dict
    ) -> bool:
        """
        Upload the merged generated graph back to GCS

        Args:
            product_id: The product identifier
            merged_graph: The merged graph to upload

        Returns:
            True if successful, False otherwise
        """
        try:
            graph_path = (
                f"qai-upload-temporary/productId_{product_id}/generated-graph.json"
            )

            orionis_log(
                f"Uploading merged generated graph to: gs://{self.bucket_name}/{graph_path}"
            )

            self.file_storage.store_file(
                file_contents=json.dumps(merged_graph, indent=2),
                bucket_name=self.bucket_name,
                blob_name=graph_path,
                content_type="application/json",
                use_constructed_bucket_name=False,
            )

            orionis_log(
                f"Successfully uploaded merged generated graph - "
                f"Nodes: {len(merged_graph.get('nodes', []))}, "
                f"Edges: {len(merged_graph.get('edges', []))}"
            )

            return True

        except Exception as e:
            orionis_log(f"Failed to upload merged generated graph: {str(e)}", e)
            return False

    def download_latest_generated_flows(self, product_id: str) -> List[Dict]:
        """
        Download the latest generated flows from GCS for a given product

        Args:
            product_id: The product identifier

        Returns:
            List of flow objects, or empty list if not found
        """
        try:
            flows_path = (
                f"qai-upload-temporary/productId_{product_id}/generated-flow.json"
            )
            uri = f"gs://{self.bucket_name}/{flows_path}"

            orionis_log(f"Downloading latest generated flows from: {uri}")

            local_path = self.file_storage.download_file_locally(
                uri=uri, generation=None, use_constructed_bucket_name=False
            )

            with open(local_path, "r") as f:
                flows_data = json.load(f)

            # Ensure it's a list
            if not isinstance(flows_data, list):
                flows_data = [flows_data] if flows_data else []

            orionis_log(f"Downloaded {len(flows_data)} existing generated flows")

            return flows_data

        except Exception as e:
            orionis_log(
                f"Could not download existing generated flows (may be first execution for product): {str(e)}"
            )
            return []

    def count_existing_exec_flows(self, flows: List[Dict]) -> int:
        """
        Count existing flow-execution-* IDs in the flows list

        Args:
            flows: List of flow objects

        Returns:
            Highest flow number found
        """
        max_flow_num = -1

        for flow in flows:
            flow_id = flow.get("id", "")
            if flow_id.startswith(self.flow_prefix):
                try:
                    num = int(flow_id.replace(self.flow_prefix, ""))
                    max_flow_num = max(max_flow_num, num)
                except ValueError:
                    continue

        orionis_log(f"Existing flows have max flow-execution number: {max_flow_num}")

        return max_flow_num

    def renumber_flow_id(self, flow: Dict, flow_num: int) -> Dict:
        """
        Renumber a single flow's ID and update node references to match renumbered graph

        Args:
            flow: Flow object to renumber
            flow_num: Flow number to use
            node_id_mapping: Mapping from old node IDs to new node IDs

        Returns:
            Flow with renumbered ID and updated node references
        """
        # Deep copy to avoid modifying original
        renumbered_flow = json.loads(json.dumps(flow))

        # Update flow ID
        new_flow_id = f"{self.flow_prefix}{flow_num:04d}"
        renumbered_flow["id"] = new_flow_id

        orionis_log(f"Renumbered flow to: {new_flow_id}")

        return renumbered_flow

    def update_flow_node_references(
        self, flow: Dict, node_id_mapping: Dict[str, str]
    ) -> Dict:
        """
        Update all node ID references in a flow to match renumbered nodes

        Args:
            flow: Flow object
            node_id_mapping: Mapping from old node IDs to new node IDs

        Returns:
            Flow with updated node references
        """
        updated_flow = json.loads(json.dumps(flow))

        # Update startNodeId
        if updated_flow.get("startNodeId") in node_id_mapping:
            updated_flow["startNodeId"] = node_id_mapping[updated_flow["startNodeId"]]

        # Update endNodeId
        if updated_flow.get("endNodeId") in node_id_mapping:
            updated_flow["endNodeId"] = node_id_mapping[updated_flow["endNodeId"]]

        # Update viaNodeIds
        if "viaNodeIds" in updated_flow and isinstance(
            updated_flow["viaNodeIds"], list
        ):
            updated_flow["viaNodeIds"] = [
                node_id_mapping.get(node_id, node_id)
                for node_id in updated_flow["viaNodeIds"]
            ]

        # Update pathNodeIds
        if "pathNodeIds" in updated_flow and isinstance(
            updated_flow["pathNodeIds"], list
        ):
            updated_flow["pathNodeIds"] = [
                node_id_mapping.get(node_id, node_id)
                for node_id in updated_flow["pathNodeIds"]
            ]

        return updated_flow

    def merge_flows(
        self,
        existing_flows: List[Dict],
        new_flow: Dict,
        node_id_mapping: Dict[str, str],
    ) -> List[Dict]:
        """
        Merge new flow into existing flows list with proper ID numbering

        Args:
            existing_flows: Existing flows from GCS
            new_flow: New flow from Maintainer Agent
            node_id_mapping: Mapping from old node IDs to new node IDs

        Returns:
            Merged flows list
        """
        # Count existing flows
        max_flow_num = self.count_existing_exec_flows(existing_flows)

        # Renumber the new flow
        new_flow_num = max_flow_num + 1
        renumbered_flow = self.renumber_flow_id(new_flow, new_flow_num)

        # Update node references in the flow
        updated_flow = self.update_flow_node_references(
            renumbered_flow, node_id_mapping
        )

        # Merge
        merged_flows = existing_flows + [updated_flow]

        orionis_log(f"Merged flows - Total: {len(merged_flows)}")

        return merged_flows

    def upload_merged_generated_flows(
        self, product_id: str, merged_flows: List[Dict]
    ) -> bool:
        """
        Upload the merged generated flows back to GCS

        Args:
            product_id: The product identifier
            merged_flows: The merged flows list to upload

        Returns:
            True if successful, False otherwise
        """
        try:
            flows_path = (
                f"qai-upload-temporary/productId_{product_id}/generated-flow.json"
            )

            orionis_log(
                f"Uploading merged generated flows to: gs://{self.bucket_name}/{flows_path}"
            )

            self.file_storage.store_file(
                file_contents=json.dumps(merged_flows, indent=2),
                bucket_name=self.bucket_name,
                blob_name=flows_path,
                content_type="application/json",
                use_constructed_bucket_name=False,
            )

            orionis_log(f"Successfully uploaded {len(merged_flows)} generated flows")

            return True

        except Exception as e:
            orionis_log(f"Failed to upload merged generated flows: {str(e)}", e)
            return False

    def merge_and_upload_execution_graph(
        self,
        product_id: str,
        request_id: str,
        new_tc_graph: Dict,
        new_flow: Optional[Dict] = None,
    ) -> bool:
        """
        Save execution graph and flow for a specific request

        Args:
            product_id: The product identifier
            request_id: The planning request identifier
            new_tc_graph: The new test case graph from Maintainer Agent
            new_flow: The new flow from Maintainer Agent (optional)

        Returns:
            True if successful, False otherwise
        """
        orionis_log(
            f"Saving generated graph and flow for product: {product_id}, request: {request_id}"
        )

        # Upload graph with new path structure
        graph_success = self.upload_execution_graph(
            product_id, request_id, new_tc_graph
        )

        # Handle flows if provided
        flow_success = True
        if new_flow:
            flow_success = self.upload_execution_flow(product_id, request_id, new_flow)

        if graph_success and flow_success:
            orionis_log("Generated graph and flow saved successfully")
        else:
            orionis_log(
                f"Save workflow partial failure - Graph: {graph_success}, Flow: {flow_success}"
            )

        return graph_success and flow_success

    def upload_execution_graph(
        self, product_id: str, request_id: str, graph: Dict
    ) -> bool:
        """
        Upload execution graph to GCS with product_id/request_id path structure

        Args:
            product_id: The product identifier
            request_id: The planning request identifier
            graph: The graph to upload

        Returns:
            True if successful, False otherwise
        """
        try:
            graph_path = f"qai-upload-temporary/productId_{product_id}/{request_id}/generated-graph.json"

            orionis_log(
                f"Uploading execution graph to: gs://{self.bucket_name}/{graph_path}"
            )

            self.file_storage.store_file(
                file_contents=json.dumps(graph, indent=2),
                bucket_name=self.bucket_name,
                blob_name=graph_path,
                content_type="application/json",
                use_constructed_bucket_name=False,
            )

            orionis_log(
                f"Successfully uploaded execution graph - "
                f"Nodes: {len(graph.get('nodes', []))}, "
                f"Edges: {len(graph.get('edges', []))}"
            )

            return True

        except Exception as e:
            orionis_log(f"Failed to upload execution graph: {str(e)}", e)
            return False

    def upload_execution_flow(
        self, product_id: str, request_id: str, flow: Dict
    ) -> bool:
        """
        Upload execution flow to GCS with product_id/request_id path structure
        Note: Flow is wrapped in an array to match the expected format

        Args:
            product_id: The product identifier
            request_id: The planning request identifier
            flow: The flow to upload

        Returns:
            True if successful, False otherwise
        """
        try:
            flow_path = f"qai-upload-temporary/productId_{product_id}/{request_id}/generated-flow.json"

            orionis_log(
                f"Uploading execution flow to: gs://{self.bucket_name}/{flow_path}"
            )

            # Wrap flow in array to match expected format
            self.file_storage.store_file(
                file_contents=json.dumps([flow], indent=2),
                bucket_name=self.bucket_name,
                blob_name=flow_path,
                content_type="application/json",
                use_constructed_bucket_name=False,
            )

            orionis_log("Successfully uploaded execution flow")

            return True

        except Exception as e:
            orionis_log(f"Failed to upload execution flow: {str(e)}", e)
            return False

    def _extract_node_id_mapping(
        self, existing_graph: Optional[Dict], new_graph: Dict, merged_graph: Dict
    ) -> Dict[str, str]:
        """
        Extract the mapping from old node IDs to new node IDs for flow updates

        Args:
            existing_graph: Original existing graph
            new_graph: Original new graph (before renumbering)
            merged_graph: Final merged graph (after renumbering)

        Returns:
            Dictionary mapping old node IDs to new node IDs
        """
        node_id_mapping = {}

        # Get the original node IDs from new_graph
        original_nodes = new_graph.get("nodes", [])

        # Get the renumbered node IDs from merged_graph
        # The new nodes are at the end of the merged graph
        existing_node_count = (
            len(existing_graph.get("nodes", [])) if existing_graph else 0
        )
        merged_nodes = merged_graph.get("nodes", [])
        new_nodes_in_merged = merged_nodes[existing_node_count:]

        # Create mapping
        for i, original_node in enumerate(original_nodes):
            if i < len(new_nodes_in_merged):
                old_id = original_node.get("id")
                new_id = new_nodes_in_merged[i].get("id")
                if old_id and new_id:
                    node_id_mapping[old_id] = new_id

        orionis_log(f"Created node ID mapping with {len(node_id_mapping)} entries")

        return node_id_mapping

    def download_knowledge_graph(self, product_id: str) -> tuple[Optional[Dict], bool]:
        """Download the original knowledge graph via Collaboration Service."""
        try:
            artifacts = collaboration_manager.get_graph_data(product_id)
            graph_data = artifacts.get("graph")

            # Check for empty graph (equivalent to file not found/empty)
            if not graph_data or (
                not graph_data.get("nodes") and not graph_data.get("edges")
            ):
                return None, True

            return graph_data, False

        except Exception as e:
            orionis_log(f"Failed to download knowledge graph: {str(e)}")
            # If API fails, treat as error, not not-found (unless we parse status code, but simplifying as per request)
            return None, False

    def upload_knowledge_graph(self, product_id: str, merged_graph: Dict) -> bool:
        """
        Upload the merged knowledge graph back to GCS (graph-export.json)

        Args:
            product_id: The product identifier
            merged_graph: The merged graph to upload

        Returns:
            True if successful, False otherwise
        """
        try:
            graph_path = (
                f"qai-upload-temporary/productId_{product_id}/graph-export.json"
            )

            orionis_log(
                f"Uploading merged knowledge graph to: gs://{self.bucket_name}/{graph_path}"
            )

            self.file_storage.store_file(
                file_contents=json.dumps(merged_graph, indent=2),
                bucket_name=self.bucket_name,
                blob_name=graph_path,
                content_type="application/json",
                use_constructed_bucket_name=False,
            )

            orionis_log(
                f"Successfully uploaded merged knowledge graph - "
                f"Nodes: {len(merged_graph.get('nodes', []))}, "
                f"Edges: {len(merged_graph.get('edges', []))}"
            )

            return True

        except Exception as e:
            orionis_log(f"Failed to upload merged knowledge graph: {str(e)}", e)
            return False

    def download_knowledge_flows(self, product_id: str) -> List[Dict]:
        """Download the original knowledge flows via Collaboration Service."""
        try:
            artifacts = collaboration_manager.get_graph_data(product_id)
            flows_data = artifacts.get("flows") or []

            # Ensure it's a list
            if not isinstance(flows_data, list):
                flows_data = [flows_data] if flows_data else []

            return flows_data

        except Exception as e:
            orionis_log(
                f"Could not download knowledge flows (may not exist yet): {str(e)}"
            )
            return []

    def upload_knowledge_flows(self, product_id: str, merged_flows: List[Dict]) -> bool:
        """
        Upload the merged knowledge flows back to GCS (flows-export.json)

        Args:
            product_id: The product identifier
            merged_flows: The merged flows list to upload

        Returns:
            True if successful, False otherwise
        """
        try:
            flows_path = (
                f"qai-upload-temporary/productId_{product_id}/flows-export.json"
            )

            orionis_log(
                f"Uploading merged knowledge flows to: gs://{self.bucket_name}/{flows_path}"
            )

            self.file_storage.store_file(
                file_contents=json.dumps(merged_flows, indent=2),
                bucket_name=self.bucket_name,
                blob_name=flows_path,
                content_type="application/json",
                use_constructed_bucket_name=False,
            )

            orionis_log(f"Successfully uploaded {len(merged_flows)} knowledge flows")

            return True

        except Exception as e:
            orionis_log(f"Failed to upload merged knowledge flows: {str(e)}", e)
            return False

    def generate_flow_id_from_path_nodes(self, path_nodes: List[str]) -> str:
        """
        Generate a flow ID based on the hash of path nodes.

        Args:
            path_nodes: List of node IDs in the flow path

        Returns:
            Flow ID in format: flow-execution-{hash}
        """
        # Create a stable string representation of path nodes
        path_string = "-".join(path_nodes)

        # Generate SHA256 hash and take first 8 characters
        hash_object = hashlib.sha256(path_string.encode())
        hash_hex = hash_object.hexdigest()[:8]

        flow_id = f"{self.flow_prefix}{hash_hex}"
        orionis_log(f"Generated flow ID: {flow_id} from {len(path_nodes)} path nodes")

        return flow_id

    def generate_flow_from_graph(self, graph: Dict, flow_id: str) -> Dict:
        """
        Generate a flow from a graph by analyzing its structure.
        This ensures all nodes in the graph are included in the flow.

        Args:
            graph: Graph dictionary with nodes and edges
            flow_id: The flow ID to assign

        Returns:
            Generated flow dictionary
        """
        nodes = graph.get("nodes", [])
        edges = graph.get("edges", [])

        if not nodes:
            orionis_log("No nodes in graph, returning empty flow")
            return {
                "id": flow_id,
                "name": "Generated Flow",
                "startNodeId": None,
                "endNodeId": None,
                "viaNodeIds": [],
                "pathNodeIds": [],
                "autoPlan": True,
            }

        # Build adjacency list to understand graph structure
        adjacency: Dict[str, List[str]] = {}
        in_degree: Dict[str, int] = {}

        for node in nodes:
            node_id = node.get("id")
            adjacency[node_id] = []
            in_degree[node_id] = 0

        for edge in edges:
            source = edge.get("source")
            target = edge.get("target")
            if source and target:
                adjacency.get(source, []).append(target)
                in_degree[target] = in_degree.get(target, 0) + 1

        # Find start node (node with no incoming edges or first node)
        start_node = None
        for node_id, degree in in_degree.items():
            if degree == 0:
                start_node = node_id
                break

        if not start_node and nodes:
            start_node = nodes[0].get("id")

        # Find end node (node with no outgoing edges or last node)
        end_node = None
        for node_id in adjacency.keys():
            if not adjacency[node_id]:  # No outgoing edges
                end_node = node_id
                break

        if not end_node and nodes:
            end_node = nodes[-1].get("id")

        # Perform DFS/BFS to get all connected nodes in order
        visited = set()
        path_nodes = []

        def dfs(node_id):
            if node_id in visited:
                return
            visited.add(node_id)
            path_nodes.append(node_id)
            for neighbor in adjacency.get(node_id, []):
                dfs(neighbor)

        # Start DFS from start node
        if start_node:
            dfs(start_node)

        # Add any remaining nodes that weren't visited (disconnected nodes)
        for node in nodes:
            node_id = node.get("id")
            if node_id not in visited:
                path_nodes.append(node_id)

        # viaNodeIds are all nodes except start and end
        via_nodes = [n for n in path_nodes if n != start_node and n != end_node]

        flow = {
            "id": flow_id,
            "name": "Generated Flow",
            "startNodeId": start_node,
            "endNodeId": end_node,
            "viaNodeIds": via_nodes,
            "pathNodeIds": path_nodes,
            "autoPlan": True,
        }

        orionis_log(
            f"Generated flow: {flow_id} with {len(path_nodes)} nodes "
            f"(start: {start_node}, end: {end_node}, via: {len(via_nodes)})"
        )

        return flow

    def _notify_merge(
        self,
        product_id: str,
        request_id: str,
        merged_flow_id: str,
        new_graph_segment: Dict,
    ) -> None:
        """
        Send a Slack notification when merge succeeds.
        """
        if not self.notification_service:
            orionis_log("Skipping Slack notification; NotificationService unavailable.")
            return

        nodes_added = (
            len(new_graph_segment.get("nodes", [])) if new_graph_segment else 0
        )
        edges_added = (
            len(new_graph_segment.get("edges", [])) if new_graph_segment else 0
        )
        link_to_flow = (
            f"{Constants.DOMAIN}/{product_id}/editor?flow_id={merged_flow_id}"
        )

        message = (
            "✅ Graph Merge Successful!\n"
            "A new graph and flow have been merged into the knowledge graph.\n\n"
            f"🔹 Product ID: `{product_id}`\n"
            f"🆔 Request ID: `{request_id}`\n"
            f"🧩 Nodes Added: `{nodes_added}`\n"
            f"🔗 Edges Added: `{edges_added}`\n"
            f"📎 Link to the Flow: {link_to_flow}"
        )

        try:
            self.notification_service.notify_slack(
                message, self.notification_service.slack_webhook_url
            )
        except Exception as e:
            orionis_log(
                f"Failed to send Slack notification for merge completion: {str(e)}", e
            )

    def merge_generated_graph(
        self,
        user_id: str,
        product_id: str,
        request_id: str,
        generated_graph_path: Optional[str] = None,
        y_offset: Optional[int] = None,
    ) -> tuple[bool, List[str]]:
        """
        Merge the generated graph and flows from a specific request into the original knowledge graph.
        called when click the "Merge" button in the graph editor.

        Process:
        1. Download the original knowledge graph (graph-export.json)
        2. Download the generated graph (productId/request_id/generated-graph.json or custom path)
        3. Find the lowest Y coordinate in the knowledge graph
        4. Position the generated graph 600 units below
        5. Check for ID conflicts (node-exec-*, edge-exec-*)
        6. Renumber conflicting IDs and update edge references
        7. Merge graphs and save back to graph-export.json
        8. Download original flows (flows-export.json)
        9. Download generated flows (productId/request_id/generated-flow.json)
        10. Renumber flow IDs and update node references
        11. Merge flows and save back to flows-export.json

        Args:
            product_id: The product identifier
            request_id: The planning request identifier
            generated_graph_path: Optional custom path to the generated graph file.
                                If not provided, defaults to qai-upload-temporary/productId_{product_id}/{request_id}/generated-graph.json
            y_offset: Optional Y offset from frontend. If provided, this offset will be added to the highest Y
                    coordinate in the knowledge graph to determine where the new graph should start.
                    For example, if highest_y=23000 and y_offset=600, the new graph will start at Y=23600.
                    The frontend provides just the offset/spacing value, and the backend calculates the highest_y
                    and adds the offset. This allows the frontend to control spacing without needing to know
                    the actual Y coordinates, helping avoid race conditions when merging multiple graphs concurrently.
                    If not provided, the method will use the default spacing (600) automatically.

        Returns:
            Tuple of (success: bool, flow_ids: List[str])
            - success: True if merge successful, False otherwise
            - flow_ids: List of merged flow IDs (hash-based) for frontend to navigate to
        """
        orionis_log(
            f"DEBUG: Starting merge_generated_graph for product: {product_id}, request: {request_id}"
        )
        orionis_log(
            f"Starting merge of generated graph to knowledge graph - "
            f"Product: {product_id}, Request: {request_id}"
        )

        # Step 1: Download the original knowledge graph
        orionis_log(
            f"DEBUG: Step 1 - Downloading knowledge graph for product: {product_id}"
        )
        knowledge_graph, file_not_found = self.download_knowledge_graph(product_id)
        orionis_log(
            f"DEBUG: Knowledge graph download result - found: {knowledge_graph is not None}, file_not_found: {file_not_found}"
        )
        is_first_graph = False

        if not knowledge_graph:
            if file_not_found:
                # File doesn't exist (404) - this is the first graph
                orionis_log(
                    f"DEBUG: First graph scenario - no existing knowledge graph for product: {product_id}"
                )
                orionis_log(
                    "No existing knowledge graph found. Generated graph will become the initial knowledge graph."
                )
                is_first_graph = True
                # Create empty knowledge graph structure
                knowledge_graph = {"nodes": [], "edges": []}
                orionis_log(
                    f"DEBUG: Created empty knowledge graph structure for product: {product_id}"
                )
            else:
                # Download failed due to permissions, network, etc. - abort to prevent data loss
                orionis_log(
                    f"DEBUG: Knowledge graph download failed (not 404) for product: {product_id} - aborting"
                )
                orionis_log(
                    "Failed to download knowledge graph due to an error. "
                    "Aborting merge to prevent potential data loss."
                )
                return False, []

        # Step 2: Download the generated graph for this request
        orionis_log(
            f"DEBUG: Step 2 - Downloading generated graph for product: {product_id}, request: {request_id}"
        )
        try:
            if generated_graph_path is None:
                generated_graph_path = f"qai-upload-temporary/productId_{product_id}/{request_id}/generated-graph.json"
            uri = f"gs://{self.bucket_name}/{generated_graph_path}"
            orionis_log(f"DEBUG: Generated graph URI: {uri}")

            orionis_log(f"Downloading generated graph from: {uri}")

            orionis_log(
                f"DEBUG: About to download file locally for product: {product_id}"
            )
            local_path = self.file_storage.download_file_locally(
                uri=uri, generation=None, use_constructed_bucket_name=False
            )
            orionis_log(f"DEBUG: Generated graph downloaded to: {local_path}")

            orionis_log(
                f"DEBUG: Reading generated graph file for product: {product_id}"
            )
            with open(local_path, "r") as f:
                generated_graph = json.load(f)

            orionis_log(
                f"DEBUG: Generated graph loaded successfully for product: {product_id}"
            )
            orionis_log(
                f"Downloaded generated graph - Nodes: {len(generated_graph.get('nodes', []))}, "
                f"Edges: {len(generated_graph.get('edges', []))}"
            )

        except Exception as e:
            orionis_log(
                f"DEBUG: Exception downloading generated graph for product {product_id}: {e}"
            )
            orionis_log(f"Failed to download generated graph: {str(e)}", e)
            return False, []

        # Step 3: Determine the base Y position for the new graph
        # Temporarily update y_spacing to 600 for this merge operation
        orionis_log(f"DEBUG: Step 3 - Determining Y position for product: {product_id}")
        original_spacing = self.y_spacing
        self.y_spacing = 600
        orionis_log(
            f"DEBUG: Updated y_spacing from {original_spacing} to {self.y_spacing}"
        )

        orionis_log(
            f"DEBUG: Calculating highest Y coordinate for product: {product_id}"
        )
        highest_y = self.calculate_highest_y_coordinate(knowledge_graph)
        orionis_log(
            f"DEBUG: Calculated highest_y: {highest_y} for product: {product_id}"
        )
        orionis_log(
            f"Calculated highest Y coordinate from knowledge graph: {highest_y}"
        )

        if y_offset is not None:
            orionis_log(
                f"Using frontend-provided Y offset: {y_offset} (will be added to highest_y={highest_y})"
            )
            new_y_start = highest_y + y_offset
        else:
            new_y_start = None

        kg_nodes = knowledge_graph.get("nodes", [])
        if kg_nodes:
            leftmost_x = self.calculate_leftmost_x_coordinate(knowledge_graph)
            new_x_start = leftmost_x + self.x_spacing
            orionis_log(
                f"Computed new X start from existing graph: leftmost_x={leftmost_x} + x_merge_offset={self.x_spacing} -> {new_x_start}"
            )
        else:
            default_initial_x = 16000
            new_x_start = default_initial_x + self.x_spacing
            orionis_log(
                f"No existing nodes; using default initial X with merge offset: {default_initial_x} + {self.x_spacing} -> {new_x_start}"
            )

        # Step 4 & 5: Check for ID conflicts and renumber if necessary
        max_node_num, max_edge_num = self.count_existing_exec_nodes_and_edges(
            knowledge_graph
        )

        # Step 6: Renumber the generated graph IDs to avoid conflicts
        start_node_num = max_node_num + 1
        start_edge_num = max_edge_num + 1

        renumbered_generated_graph = self.renumber_graph_ids(
            generated_graph,
            start_node_num=start_node_num,
            start_edge_num=start_edge_num,
        )

        # Step 6b: Create node ID mapping for flow updates (before repositioning)
        # This maps old node IDs from the original generated graph to new node IDs
        node_id_mapping = {}
        original_nodes = generated_graph.get("nodes", [])
        renumbered_nodes = renumbered_generated_graph.get("nodes", [])

        for i, original_node in enumerate(original_nodes):
            if i < len(renumbered_nodes):
                old_id = original_node.get("id")
                new_id = renumbered_nodes[i].get("id")
                if old_id and new_id:
                    node_id_mapping[old_id] = new_id

        orionis_log(
            f"Created node ID mapping with {len(node_id_mapping)} entries for flow updates"
        )

        # Step 7: Reposition the generated graph below the knowledge graph
        repositioned_generated_graph = self.reposition_new_graph(
            renumbered_generated_graph, highest_y, new_y_start, new_x_start
        )

        # Step 8: Merge the graphs
        merged_nodes = knowledge_graph.get(
            "nodes", []
        ) + repositioned_generated_graph.get("nodes", [])
        merged_edges = knowledge_graph.get(
            "edges", []
        ) + repositioned_generated_graph.get("edges", [])

        merged_graph = {"nodes": merged_nodes, "edges": merged_edges}

        orionis_log(
            f"Merged graph created - Total nodes: {len(merged_nodes)}, "
            f"Total edges: {len(merged_edges)}"
            f"Merged graph: {len(merged_graph)}"
        )

        # Step 9: Generate and merge flows BEFORE uploading the graph
        # This ensures flows are updated with correct node references
        flows_success = True
        video_url = None
        merged_flow_ids = []  # Initialize to track merged flow IDs for API response
        try:
            # Download original knowledge flows
            knowledge_flows = self.download_knowledge_flows(product_id)

            # Try to download generated flows, if they don't exist or are incomplete,
            # generate flow from the graph structure
            generated_flows = []
            try:
                generated_flow_path = f"qai-upload-temporary/productId_{product_id}/{request_id}/generated-flow.json"
                uri = f"gs://{self.bucket_name}/{generated_flow_path}"

                orionis_log(f"Attempting to download generated flows from: {uri}")

                local_path = self.file_storage.download_file_locally(
                    uri=uri, generation=None, use_constructed_bucket_name=False
                )

                with open(local_path, "r") as f:
                    generated_flows_data = json.load(f)
                # Ensure it's a list
                if not isinstance(generated_flows_data, list):
                    video_url = (
                        generated_flows_data.get("videoUrl")
                        if generated_flows_data
                        else None
                    )
                    generated_flows = (
                        [generated_flows_data] if generated_flows_data else []
                    )
                else:
                    video_url = (
                        generated_flows_data[0].get("videoUrl")
                        if generated_flows_data
                        else None
                    )
                    generated_flows = generated_flows_data

                orionis_log(f"Downloaded {len(generated_flows)} generated flows")

                # Check if flows are missing nodes - verify all graph nodes are in flow
                graph_node_ids = {
                    node.get("id")
                    for node in renumbered_generated_graph.get("nodes", [])
                }

                for flow in generated_flows:
                    flow_node_ids = set(flow.get("pathNodeIds", []))
                    missing_nodes = graph_node_ids - flow_node_ids

                    if missing_nodes:
                        orionis_log(
                            f"Flow {flow.get('id')} is missing {len(missing_nodes)} nodes from graph. "
                            f"Regenerating flow from graph structure."
                        )
                        # Flow is incomplete, generate it from graph
                        generated_flows = []
                        break

            except Exception as e:
                orionis_log(f"Could not download generated flows: {str(e)}")

            # If no flows were downloaded or they were incomplete, generate from graph
            if not generated_flows:
                orionis_log(
                    "Generating flow from graph structure to ensure all nodes are included"
                )

                # Generate a temporary flow ID (will be renumbered later)
                temp_flow_id = f"{self.flow_prefix}temp"

                # Generate flow from the renumbered graph (before updating node IDs)
                # We use the original generated_graph for flow generation
                generated_flow = self.generate_flow_from_graph(
                    generated_graph, temp_flow_id
                )
                generated_flow["videoUrl"] = video_url
                generated_flows = [generated_flow]

            # Merge each generated flow with updated node references
            merged_flows = knowledge_flows.copy()

            for i, flow in enumerate(generated_flows):
                # First, update node references using the mapping we created earlier
                flow_with_updated_refs = self.update_flow_node_references(
                    flow, node_id_mapping
                )

                # Generate flow ID based on hash of path nodes (after node ID mapping)
                path_nodes = flow_with_updated_refs.get("pathNodeIds", [])
                hash_based_flow_id = self.generate_flow_id_from_path_nodes(path_nodes)
                flow_with_updated_refs["id"] = hash_based_flow_id
                merged_flow_ids.append(hash_based_flow_id)

                # Update the flow name to "Generated Flow {count} - {last edge description}"
                # Count is the position in the final merged list (1-indexed)
                flow_count = len(knowledge_flows) + i + 1

                # Get the last edge description
                last_edge_description = ""
                if flow_with_updated_refs.get("endNodeId"):
                    # Find the edge that leads to the end node
                    end_node_id = flow_with_updated_refs["endNodeId"]
                    for edge in repositioned_generated_graph.get("edges", []):
                        if edge.get("target") == end_node_id:
                            last_edge_description = edge.get("data", {}).get(
                                "description", ""
                            )
                            break

                # Create flow name
                if last_edge_description:
                    flow_with_updated_refs["name"] = (
                        f"Generated Flow {flow_count} - {last_edge_description}"
                    )
                else:
                    flow_with_updated_refs["name"] = f"Generated Flow {flow_count}"

                merged_flows.append(flow_with_updated_refs)

            orionis_log(f"Merged flows - Total: {len(merged_flows)}")

            # Prepare flows for collaboration backend (only new flows)
            new_flows = [
                flow for flow in merged_flows if flow.get("id") in merged_flow_ids
            ]

        except Exception as e:
            orionis_log(f"Error merging flows: {str(e)}", e)
            flows_success = False
            new_flows = []

        # Step 10: Emit graph changes to collaboration backend via REST API
        try:
            # Get only the NEW nodes and edges that were added (not the entire merged graph)
            new_nodes = repositioned_generated_graph.get("nodes", [])
            new_edges = repositioned_generated_graph.get("edges", [])

            orionis_log(
                f"DEBUG: Preparing graph events payload for product: {product_id}"
            )
            orionis_log(
                f"Emitting graph changes to collaboration backend: {len(new_nodes)} nodes, {len(new_edges)} edges, {len(new_flows)} flows"
            )

            # Use collaboration manager to apply graph events via REST
            orionis_log(
                f"DEBUG: Calling collaboration_manager.emit_graph_changes_sync for product: {product_id}"
            )
            response = collaboration_manager.emit_graph_changes_sync(
                product_id=product_id,
                nodes=new_nodes,
                edges=new_edges,
                flows=new_flows if new_flows else None,
            )
            orionis_log(
                f"DEBUG: Graph events API response for product {product_id}: "
                f"success={response.get('success')}, mode={response.get('mode')}, "
                f"events_applied={response.get('events_applied')}, events_failed={len(response.get('events_failed', []))}"
            )

            failed_events = response.get("events_failed") or []
            if failed_events:
                orionis_log(
                    f"Graph events API reported failures for product {product_id}: {failed_events}"
                )

            graph_success = bool(response.get("success", True))
            if graph_success:
                orionis_log(
                    "Successfully applied graph changes via collaboration backend API"
                )
                orionis_log(
                    f"DEBUG: Graph emission successful for product: {product_id}"
                )
            else:
                orionis_log(
                    f"Graph events API completed with success=False for product {product_id}"
                )

        except Exception as e:
            orionis_log(
                f"DEBUG: Exception during graph emission for product {product_id}: {e}"
            )
            orionis_log(
                f"Failed to emit graph changes to collaboration backend: {str(e)}", e
            )
            graph_success = False

        # Restore original spacing
        orionis_log(
            f"DEBUG: Restoring original y_spacing from {self.y_spacing} to {original_spacing}"
        )
        self.y_spacing = original_spacing

        orionis_log(
            f"DEBUG: Final result - graph_success: {graph_success}, flows_success: {flows_success}"
        )
        if graph_success and flows_success:
            if is_first_graph:
                orionis_log(
                    f"DEBUG: First graph scenario completed successfully for product: {product_id}"
                )
                orionis_log(
                    f"Successfully created initial knowledge graph and flows for product {product_id}"
                )
            else:
                orionis_log(
                    f"DEBUG: Graph merge scenario completed successfully for product: {product_id}"
                )
                orionis_log(
                    f"Successfully merged generated graph and flows into knowledge graph for product {product_id}"
                )
            orionis_log(f"Merged flow IDs: {merged_flow_ids}")
            orionis_log(
                f"DEBUG: Returning success=True, flow_ids={merged_flow_ids} for product: {product_id}"
            )
            if config.environment == Config.PRODUCTION:
                is_external_user = self.user_service.is_external_user(user_id)
                if is_external_user and merged_flow_ids:
                    self._notify_merge(
                        product_id, request_id, merged_flow_ids[0], generated_graph
                    )
                else:
                    orionis_log(
                        f"Skipping Slack notification for merge completion in internal user for product: {product_id}"
                    )
            else:
                orionis_log(
                    f"Skipping Slack notification for merge completion in non-production environment for product: {product_id}"
                )
        elif graph_success:
            orionis_log(
                f"DEBUG: Partial success - graph success but flows failure for product: {product_id}"
            )
            orionis_log(
                f"Successfully merged generated graph (flows merge had issues) for product {product_id}"
            )
        else:
            orionis_log(f"DEBUG: Complete failure for product: {product_id}")
            orionis_log(f"Failed to merge generated graph for product {product_id}")

        orionis_log(
            f"DEBUG: merge_generated_graph returning ({graph_success and flows_success}, {merged_flow_ids}) for product: {product_id}"
        )
        return graph_success and flows_success, merged_flow_ids
