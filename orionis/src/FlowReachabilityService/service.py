from typing import List, Dict, Set, Tuple
from utils.util import orionis_log
from .data_models import FlowChain, AllReachableFlows
from graph_diff.graph_diff_models import Node, Edge, Flow
from common.collaboration_client import collaboration_manager


class CheckReachability:
    """
    A service to analyze flow reachability based on a knowledge graph and a list of flows.
    """

    def __init__(self, nodes: List[Node], edges: List[Edge], flows: List[Flow]):
        self._nodes = nodes
        self._edges = edges
        self._flows = flows
        self._nodes_map: Dict[str, Node] = {node.id: node for node in self._nodes}
        self._all_flows_map: Dict[str, Flow] = {flow.id: flow for flow in self._flows}
        self._entry_point_ids: Set[str] = set()
        self._flows_ending_at_node: Dict[str, List[Flow]] = {}

        self._calculate_entry_points()
        self._precompute_flow_lookups()

    @classmethod
    def from_gcs(cls, product_id: str):
        """
        Factory method to create a CheckReachability instance by loading data
        from the Graph Collaboration API.
        """
        orionis_log(
            f"Fetching graph data from collaboration API for product: {product_id}"
        )

        try:
            artifacts = collaboration_manager.get_graph_data(product_id)
            graph_data = artifacts.get("graph") or {}
            flows_data = artifacts.get("flows") or []

            if not isinstance(flows_data, list):
                flows_data = [flows_data] if flows_data else []

        except Exception as e:
            orionis_log(f"Error loading graph data from collaboration API: {e}", e)
            raise RuntimeError(
                f"An unexpected error occurred while loading data from collaboration API: {e}"
            )

        nodes_data = graph_data.get("nodes", [])
        edges_data = graph_data.get("edges", [])

        nodes = [Node(**n) for n in nodes_data]
        edges = [Edge(**e) for e in edges_data]
        flows = [Flow(**f) for f in flows_data]

        return cls(nodes, edges, flows)

    def _calculate_entry_points(self):
        """Calculates entry point nodes based on the graph topology."""
        if not self._nodes or not self._edges:
            self._entry_point_ids = set()
            return

        all_target_nodes = {edge.target for edge in self._edges}
        all_source_nodes = {edge.source for edge in self._edges}
        self._entry_point_ids = {
            node.id
            for node in self._nodes
            if node.id in all_source_nodes and node.id not in all_target_nodes
        }

    def _precompute_flow_lookups(self):
        """
        Creates a lookup dictionary to quickly find flows that end at a specific node.
        """
        for flow in self._flows:
            if flow.pathNodeIds:
                end_node_id = flow.pathNodeIds[-1]
                if end_node_id not in self._flows_ending_at_node:
                    self._flows_ending_at_node[end_node_id] = []
                self._flows_ending_at_node[end_node_id].append(flow)

    def get_flow_chain(self, target_flow_id: str) -> FlowChain:
        """
        Finds all reachability chains for a single, specific flow, and returns the top-ranked one.
        Args:
            target_flow_id: The ID of the flow to check.
        Returns:
            A FlowChain object representing the top-ranked valid chain found, or an empty list if no path is found.
        """
        target_flow = self._all_flows_map.get(target_flow_id)
        if not target_flow:
            orionis_log(f"Flow with ID '{target_flow_id}' not found.")
            return FlowChain(chain=[])

        is_reachable, chains_of_flows = self._get_all_flow_chains_from_entry_points(
            target_flow
        )

        if not is_reachable:
            return FlowChain(chain=[])

        # --- Rank the chains ---
        # 1. Find the maximum x-coordinate of the target flow's nodes
        max_x = 0.0
        for node_id in target_flow.pathNodeIds:
            node = self._nodes_map.get(node_id)
            if node and node.position["x"] > max_x:
                max_x = node.position["x"]

        # 2. Define the sorting key function
        def sort_key(chain):
            is_right_side = False
            for flow in chain:
                for node_id in flow.pathNodeIds:
                    node = self._nodes_map.get(node_id)
                    if node and node.position["x"] > max_x:
                        is_right_side = True
                        break
                if is_right_side:
                    break
            return (is_right_side, len(chain))

        # 3. Sort the chains
        ranked_chains = sorted(chains_of_flows, key=sort_key)

        if not ranked_chains:
            return FlowChain(chain=[])

        # Return the first chain from the ranked list
        first_chain = ranked_chains[0]
        return FlowChain(chain=[flow.id for flow in first_chain])

    def get_all_reachable_flows(self) -> AllReachableFlows:
        """
        Returns a list of all flow IDs that are reachable from an entry point.
        """
        reachable_nodes = self._get_all_reachable_nodes()

        reachable_flow_ids = [
            flow.id for flow in self._flows if flow.startNodeId in reachable_nodes
        ]
        return AllReachableFlows(reachable_flows=reachable_flow_ids)

    def _get_all_reachable_nodes(self) -> Set[str]:
        """
        Performs a Breadth-First Search (BFS) from all entry points to find every
        reachable node in the graph.
        """
        if not self._entry_point_ids:
            return set()

        # Build an adjacency list for efficient traversal
        adj_list: Dict[str, List[str]] = {node.id: [] for node in self._nodes}
        for edge in self._edges:
            adj_list[edge.source].append(edge.target)

        queue = list(self._entry_point_ids)
        reachable_nodes = set(self._entry_point_ids)

        while queue:
            current_node = queue.pop(0)
            for neighbor in adj_list.get(current_node, []):
                if neighbor not in reachable_nodes:
                    reachable_nodes.add(neighbor)
                    queue.append(neighbor)

        return reachable_nodes

    def _get_all_flow_chains_from_entry_points(
        self, target_flow: Flow
    ) -> Tuple[bool, List[List[Flow]]]:
        """
        Recursively finds all chains of flows from entry points to the target_flow.
        """
        if not target_flow.pathNodeIds:
            return False, []
        start_node_id = target_flow.pathNodeIds[0]
        all_chains: List[List[Flow]] = []
        if start_node_id in self._entry_point_ids:
            all_chains.append([target_flow])

        def find_all_chains_recursive(
            flow_to_check: Flow, current_chain: List[Flow], visited_flow_ids: Set[str]
        ) -> List[List[Flow]]:
            if flow_to_check.id in visited_flow_ids:
                return []
            if not flow_to_check.pathNodeIds:
                return []

            flow_start_node_id = flow_to_check.pathNodeIds[0]
            new_visited = visited_flow_ids | {flow_to_check.id}

            if flow_start_node_id in self._entry_point_ids:
                return [[flow_to_check, *current_chain]]

            # Use the pre-computed lookup for a significant performance boost
            connecting_flows = self._flows_ending_at_node.get(flow_start_node_id, [])

            found_chains: List[List[Flow]] = []
            for connecting_flow in connecting_flows:
                chains = find_all_chains_recursive(
                    connecting_flow, [flow_to_check, *current_chain], new_visited
                )
                found_chains.extend(chains)
                all_chains.extend(chains)
            return found_chains

        if start_node_id not in self._entry_point_ids:
            find_all_chains_recursive(target_flow, [], set())

        # --- Remove Duplicates ---
        unique_chains = []
        seen_chains = set()
        for chain in all_chains:
            # Create a tuple of flow IDs to represent the chain, as lists are not hashable
            chain_tuple = tuple(flow.id for flow in chain)
            if chain_tuple not in seen_chains:
                unique_chains.append(chain)
                seen_chains.add(chain_tuple)

        return len(unique_chains) > 0, unique_chains
