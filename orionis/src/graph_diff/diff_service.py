import hashlib
import json
from typing import Dict, Any, List
from graph_diff.graph_diff_models import (
    Graph,
    GraphDiff,
    Flow,
    AffectedFlow,
    FlowDiff,
    DiffCheckResult,
    Additions,
    Deletions,
    Changes,
    NodeAddition,
    EdgeAddition,
    NodeDeletion,
    EdgeDeletion,
    NodeChange,
    EdgeChange,
)
from gateway.gateway_models import ApiRequestEntity, ApiResponseEntity
from utils.util import orionis_log
from common.google_cloud_wrappers import GCPFileStorageWrapper
from common.collaboration_client import collaboration_manager
from constants import Constants


class DiffService:
    def _hash_image(self, image_data: str) -> str:
        return hashlib.sha256(image_data.encode()).hexdigest()

    def _get_node_diffs(self, old_nodes: Dict[str, Any], new_nodes: Dict[str, Any]):
        try:
            added_nodes = []
            for node_id, node in new_nodes.items():
                if node_id not in old_nodes:
                    properties = node.data.model_dump()
                    if properties.get("image"):
                        properties["image"] = f"{node_id} image present"
                    added_nodes.append(NodeAddition(id=node_id, properties=properties))

            deleted_nodes = [
                NodeDeletion(id=node_id)
                for node_id in old_nodes
                if node_id not in new_nodes
            ]

            changed_nodes = []
            for node_id, old_node in old_nodes.items():
                if node_id in new_nodes:
                    new_node = new_nodes[node_id]
                    old_props_comparison = old_node.data.model_dump()
                    new_props_comparison = new_node.data.model_dump()

                    if old_props_comparison.get("image") and new_props_comparison.get(
                        "image"
                    ):
                        old_props_comparison["image"] = self._hash_image(
                            old_props_comparison["image"]
                        )
                        new_props_comparison["image"] = self._hash_image(
                            new_props_comparison["image"]
                        )

                    changed_fields = [
                        key
                        for key in old_props_comparison
                        if old_props_comparison[key] != new_props_comparison.get(key)
                    ]

                    if changed_fields:
                        output_old_props = old_node.data.model_dump()
                        output_new_props = new_node.data.model_dump()

                        if "image" in changed_fields:
                            placeholder = f"{node_id} image changed"
                            output_old_props["image"] = placeholder
                            output_new_props["image"] = placeholder

                        changed_nodes.append(
                            NodeChange(
                                id=node_id,
                                old_properties=output_old_props,
                                new_properties=output_new_props,
                                changed_fields=changed_fields,
                            )
                        )

            return added_nodes, deleted_nodes, changed_nodes
        except Exception as e:
            orionis_log(f"Error in _get_node_diffs: {e}", e)
            raise

    def _get_edge_diffs(self, old_edges: Dict[str, Any], new_edges: Dict[str, Any]):
        try:
            added_edges = [
                EdgeAddition(
                    id=edge.id,
                    source=edge.source,
                    target=edge.target,
                    properties=edge.data.model_dump(),
                )
                for edge_id, edge in new_edges.items()
                if edge_id not in old_edges
            ]
            deleted_edges = [
                EdgeDeletion(id=edge_id)
                for edge_id in old_edges
                if edge_id not in new_edges
            ]

            changed_edges = []
            for edge_id, old_edge in old_edges.items():
                if edge_id in new_edges:
                    new_edge = new_edges[edge_id]

                    if (
                        old_edge.source != new_edge.source
                        or old_edge.target != new_edge.target
                    ):
                        raise ValueError(
                            f"Edge with ID '{edge_id}' has changed its source or target, which is an invalid operation."
                        )

                    old_props = old_edge.data.model_dump()
                    new_props = new_edge.data.model_dump()
                    changed_fields = [
                        key for key in old_props if old_props[key] != new_props.get(key)
                    ]
                    if changed_fields:
                        changed_edges.append(
                            EdgeChange(
                                id=edge_id,
                                source=new_edge.source,
                                target=new_edge.target,
                                old_properties=old_props,
                                new_properties=new_props,
                                changed_fields=changed_fields,
                            )
                        )

            return added_edges, deleted_edges, changed_edges
        except Exception as e:
            orionis_log(f"Error in _get_edge_diffs: {e}", e)
            raise

    def compare_graphs(self, old_graph: Graph, new_graph: Graph) -> GraphDiff:
        try:
            old_nodes = {node.id: node for node in old_graph.nodes}
            new_nodes = {node.id: node for node in new_graph.nodes}
            old_edges = {edge.id: edge for edge in old_graph.edges}
            new_edges = {edge.id: edge for edge in new_graph.edges}

            added_nodes, deleted_nodes, changed_nodes = self._get_node_diffs(
                old_nodes, new_nodes
            )
            added_edges, deleted_edges, changed_edges = self._get_edge_diffs(
                old_edges, new_edges
            )

            return GraphDiff(
                additions=Additions(nodes=added_nodes, edges=added_edges),
                deletions=Deletions(nodes=deleted_nodes, edges=deleted_edges),
                changes=Changes(nodes=changed_nodes, edges=changed_edges),
            )
        except Exception as e:
            orionis_log(f"Error in compare_graphs: {e}", e)
            raise

    def compare_flows(
        self,
        old_flows: List[Flow],
        new_flows: List[Flow],
        graph_diff: GraphDiff,
        old_graph: Graph,
    ) -> FlowDiff:
        try:
            old_flows_map = {flow.id: flow for flow in old_flows}
            new_flows_map = {flow.id: flow for flow in new_flows}

            added_flows = [
                flow
                for flow_id, flow in new_flows_map.items()
                if flow_id not in old_flows_map
            ]
            deleted_flows = [
                flow
                for flow_id, flow in old_flows_map.items()
                if flow_id not in new_flows_map
            ]

            # --- NEW: remove ID-only differences (structural equality) ---
            unmatched_added = []
            for new_flow in added_flows:
                match = next(
                    (
                        old_flow
                        for old_flow in deleted_flows
                        if old_flow.startNodeId == new_flow.startNodeId
                        and old_flow.endNodeId == new_flow.endNodeId
                        and old_flow.pathNodeIds == new_flow.pathNodeIds
                    ),
                    None,
                )
                if match:
                    # structurally same → drop both
                    deleted_flows.remove(match)
                else:
                    unmatched_added.append(new_flow)

            added_flows = unmatched_added

            # --- Affected flows logic ---
            affected_flows = []
            deleted_node_ids = {node.id for node in graph_diff.deletions.nodes}
            changed_node_ids = {node.id for node in graph_diff.changes.nodes}
            changed_edge_ids = {edge.id for edge in graph_diff.changes.edges}

            for flow in new_flows:
                flow_node_ids = set(flow.pathNodeIds)

                # Case 1: Affected by deleted node
                affected_by_deleted_node = flow_node_ids.intersection(deleted_node_ids)
                if affected_by_deleted_node:
                    cause_node_id = affected_by_deleted_node.pop()
                    affected_flows.append(
                        AffectedFlow(
                            id=flow.id,
                            name=flow.name,
                            startNodeId=flow.startNodeId,
                            endNodeId=flow.endNodeId,
                            cause=f"Node {cause_node_id} was deleted.",
                        )
                    )
                    continue

                # Case 2: Affected by changed node
                affected_by_changed_node = flow_node_ids.intersection(changed_node_ids)
                if affected_by_changed_node:
                    cause_node_id = affected_by_changed_node.pop()
                    changed_node = next(
                        (
                            node
                            for node in graph_diff.changes.nodes
                            if node.id == cause_node_id
                        ),
                        None,
                    )
                    changed_fields_str = (
                        f"{{{', '.join(changed_node.changed_fields)}}}"
                        if changed_node
                        else ""
                    )
                    cause = f"Node {cause_node_id} {changed_fields_str} was changed."

                    affected_flows.append(
                        AffectedFlow(
                            id=flow.id,
                            name=flow.name,
                            startNodeId=flow.startNodeId,
                            endNodeId=flow.endNodeId,
                            cause=cause,
                        )
                    )
                    continue

                # Case 3: Affected by changed edge
                flow_edge_ids = set()
                for i in range(len(flow.pathNodeIds) - 1):
                    source_id = flow.pathNodeIds[i]
                    target_id = flow.pathNodeIds[i + 1]
                    for edge in old_graph.edges:
                        if edge.source == source_id and edge.target == target_id:
                            flow_edge_ids.add(edge.id)

                affected_by_changed_edge = flow_edge_ids.intersection(changed_edge_ids)
                if affected_by_changed_edge:
                    cause_edge_id = affected_by_changed_edge.pop()
                    changed_edge = next(
                        (
                            edge
                            for edge in graph_diff.changes.edges
                            if edge.id == cause_edge_id
                        ),
                        None,
                    )
                    changed_fields_str = (
                        f"{{{', '.join(changed_edge.changed_fields)}}}"
                        if changed_edge
                        else ""
                    )
                    cause = f"Edge {cause_edge_id} {changed_fields_str} was changed."

                    affected_flows.append(
                        AffectedFlow(
                            id=flow.id,
                            name=flow.name,
                            startNodeId=flow.startNodeId,
                            endNodeId=flow.endNodeId,
                            cause=cause,
                        )
                    )
                    continue

                # --- 🆕 Case 4: affected by precondition change ---
                old_flow = old_flows_map.get(flow.id)
                if old_flow and old_flow.precondition != flow.precondition:
                    affected_flows.append(
                        AffectedFlow(
                            id=flow.id,
                            name=flow.name,
                            startNodeId=flow.startNodeId,
                            endNodeId=flow.endNodeId,
                            cause="Flow precondition changed.",
                        )
                    )
                    continue

                # --- 🆕 Case 5: affected by scenario change ---
                def scenarios_equal(scenarios1, scenarios2):
                    # Null/empty checks
                    if not scenarios1 and not scenarios2:
                        return True
                    if not scenarios1 or not scenarios2:
                        return False

                    def scenario_dict_without_id(s):
                        d = s.model_dump()
                        d.pop("id", None)
                        return d

                    # Sort scenario dicts for order-insensitive comparison
                    def sorted_scenarios(scenarios):
                        return sorted(
                            [scenario_dict_without_id(s) for s in scenarios],
                            key=lambda x: json.dumps(x, sort_keys=True),
                        )

                    return sorted_scenarios(scenarios1) == sorted_scenarios(scenarios2)

                if old_flow and not scenarios_equal(old_flow.scenarios, flow.scenarios):
                    affected_flows.append(
                        AffectedFlow(
                            id=flow.id,
                            name=flow.name,
                            startNodeId=flow.startNodeId,
                            endNodeId=flow.endNodeId,
                            cause="Flow scenarios changed.",
                        )
                    )
                    continue

                # --- 🆕 Case 6: affected by credentials change ---
                def credentials_equal(creds1, creds2):
                    if not creds1 and not creds2:
                        return True
                    if not creds1 or not creds2:
                        return False
                    return (
                        creds1 == creds2
                    )  # order-sensitive, but [a,b] == [a,b] is True

                if old_flow and not credentials_equal(
                    old_flow.credentials, flow.credentials
                ):
                    affected_flows.append(
                        AffectedFlow(
                            id=flow.id,
                            name=flow.name,
                            startNodeId=flow.startNodeId,
                            endNodeId=flow.endNodeId,
                            cause="Flow credentials changed.",
                        )
                    )
                    continue

            return FlowDiff(
                additions=added_flows,
                deletions=deleted_flows,
                affected_flows=affected_flows,
            )

        except Exception as e:
            orionis_log(f"Error in compare_flows: {e}", e)
            raise

    def run_diff_check(
        self,
        old_graph: Graph,
        new_graph: Graph,
        old_flows: List[Flow],
        new_flows: List[Flow],
    ) -> DiffCheckResult:
        try:
            graph_diff = self.compare_graphs(old_graph, new_graph)
            flow_diff = self.compare_flows(old_flows, new_flows, graph_diff, old_graph)
            return DiffCheckResult(graph_diff=graph_diff, flow_diff=flow_diff)
        except Exception as e:
            orionis_log(f"Error in run_diff_check: {e}", e)
            raise

    def diff_check_start(
        self,
        old_graph_data: dict,
        new_graph_data: dict,
        old_flows_data: List[dict],
        new_flows_data: List[dict],
    ) -> DiffCheckResult:
        try:
            old_graph = Graph(**old_graph_data)
            new_graph = Graph(**new_graph_data)
            old_flows = [Flow(**flow_data) for flow_data in old_flows_data]
            new_flows = [Flow(**flow_data) for flow_data in new_flows_data]

            return self.run_diff_check(old_graph, new_graph, old_flows, new_flows)
        except Exception as e:
            orionis_log(f"Error in diff_check_start: {e}", e)
            raise

    def get_data(
        self, old_kg_path: str, new_kg_path: str, old_flow_path: str, new_flow_path: str
    ) -> dict:
        try:
            with open(old_kg_path, "r") as f:
                old_graph_data = json.load(f)
            with open(new_kg_path, "r") as f:
                new_graph_data = json.load(f)
            with open(old_flow_path, "r") as f:
                old_flows_data = json.load(f)
            with open(new_flow_path, "r") as f:
                new_flows_data = json.load(f)

            result = self.diff_check_start(
                old_graph_data, new_graph_data, old_flows_data, new_flows_data
            )

            replanning_payload = self.get_replanning_payload(result)

            return replanning_payload
        except FileNotFoundError as e:
            orionis_log(f"Error reading file: {e}", e)
            raise
        except json.JSONDecodeError as e:
            orionis_log(f"Error reading file: {e}", e)
            raise
        except Exception as e:
            orionis_log(f"Error in get_data: {e}", e)
            raise

    def get_replanning_payload(self, result: DiffCheckResult) -> dict:
        try:
            added_flow_ids = [flow.id for flow in result.flow_diff.additions]
            affected_flow_ids = [flow.id for flow in result.flow_diff.affected_flows]
            deleted_flow_ids = [flow.id for flow in result.flow_diff.deletions]
            return {
                "added_flow_ids": added_flow_ids,
                "affected_flow_ids": affected_flow_ids,
                "deleted_flow_ids": deleted_flow_ids,
            }
        except Exception as e:
            orionis_log(f"Error in get_replanning_payload: {e}", e)
            raise

    def merge_graphs(self, current_graph: Graph, new_graph: Graph) -> Graph:
        """
        Merge two Graph objects by node and edge IDs.

        - For nodes and edges present in both graphs (matched by id), the structure from new_graph is kept.
        - For nodes and edges unique to either graph, both are included in the merged result.
        - The merged graph contains all nodes and edges from both graphs, with new_graph taking precedence for common ids.

        Args:
            current_graph (Graph): The original graph.
            new_graph (Graph): The updated graph.

        Returns:
            Graph: The merged graph containing all unique and common nodes/edges.
        """
        # Merge nodes
        current_nodes_map = {node.id: node for node in current_graph.nodes}
        new_nodes_map = {node.id: node for node in new_graph.nodes}
        merged_nodes = []
        all_node_ids = set(current_nodes_map.keys()) | set(new_nodes_map.keys())
        for node_id in all_node_ids:
            if node_id in new_nodes_map:
                merged_nodes.append(new_nodes_map[node_id])
            else:
                merged_nodes.append(current_nodes_map[node_id])
        # Merge edges
        current_edges_map = {edge.id: edge for edge in current_graph.edges}
        new_edges_map = {edge.id: edge for edge in new_graph.edges}
        merged_edges = []
        all_edge_ids = set(current_edges_map.keys()) | set(new_edges_map.keys())
        for edge_id in all_edge_ids:
            if edge_id in new_edges_map:
                merged_edges.append(new_edges_map[edge_id])
            else:
                merged_edges.append(current_edges_map[edge_id])
        # Build merged graph
        merged_graph = Graph(
            nodes=merged_nodes,
            edges=merged_edges,
            # ...copy other fields from new_graph if needed...
        )
        return merged_graph

    def save_graph_to_bucket(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )
        product_id = None  # Initialize for error handling
        try:
            orionis_log(f"Received request data to save graph: {request.data}")
            user_id = request.data.get("user_id")
            product_id = request.data.get("product_id")
            if not user_id or not product_id:
                return ApiResponseEntity(
                    response={"error": "user_id and product_id are required"},
                    status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
                )
            bucket_name = Constants.GRAPH_EDITOR_BUCKET_NAME
            current_graph_path = (
                f"qai-upload-temporary/productId_{product_id}/graph-export.json"
            )
            new_graph_path = f"qai-upload-temporary/productId_{product_id}/userId_{user_id}/graph-export.json"

            # Download graphs from GCS
            orionis_log(
                f"Downloading current graph from: gs://{bucket_name}/{current_graph_path}"
            )
            file_storage = GCPFileStorageWrapper()
            current_graph_local_path = file_storage.download_file_locally(
                uri=f"gs://{bucket_name}/{current_graph_path}",
                generation=None,
                use_constructed_bucket_name=False,
            )
            orionis_log(
                f"Downloading new graph from: gs://{bucket_name}/{new_graph_path}"
            )
            new_graph_local_path = file_storage.download_file_locally(
                uri=f"gs://{bucket_name}/{new_graph_path}",
                generation=None,
                use_constructed_bucket_name=False,
            )
            # Convert downloaded files to Graph model
            with open(current_graph_local_path, "r") as f:
                current_graph_data = json.load(f)
            orionis_log(
                f"Loaded current graph JSON, node count: {len(current_graph_data.get('nodes', []))}, "
                f"edge count: {len(current_graph_data.get('edges', []))}"
            )
            with open(new_graph_local_path, "r") as f:
                new_graph_data = json.load(f)
            orionis_log(
                f"Loaded new graph JSON, node count: {len(new_graph_data.get('nodes', []))}, "
                f"edge count: {len(new_graph_data.get('edges', []))}"
            )
            current_graph = Graph(**current_graph_data)
            new_graph = Graph(**new_graph_data)
            orionis_log("Instantiated Graph models. Merging graphs...")
            merged_graph = self.merge_graphs(current_graph, new_graph)

            # Emit merged graph to collaboration backend instead of uploading to GCS
            orionis_log(
                f"Emitting merged graph to collaboration backend for product: {product_id}"
            )

            # Convert Graph model to dict format for collaboration client
            merged_graph_dict = merged_graph.model_dump()
            nodes = merged_graph_dict.get("nodes", [])
            edges = merged_graph_dict.get("edges", [])

            # Use collaboration manager to emit changes
            collaboration_manager.emit_graph_changes_sync(
                product_id=product_id, nodes=nodes, edges=edges, flows=None
            )

            orionis_log(
                f"Merged graph emitted to collaboration backend "
                f"(nodes: {len(merged_graph.nodes)}, edges: {len(merged_graph.edges)})"
            )
            return ApiResponseEntity(
                response={"message": "Graph merged and saved successfully"},
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )
        except Exception as e:
            orionis_log(f"Error merging graph for productId: {product_id}, {e}", e)
            return ApiResponseEntity(
                response={"error": f"Internal server error: {e}"},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )
