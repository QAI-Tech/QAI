"""
Graph Builder Module
Transforms AI-extracted UI states and interactions into structured test case graphs
Generates node-edge representations for flow visualization
"""

import json
from typing import Dict, List, Optional

from utils.util import orionis_log
from maintainer_agent.prompts.video_analysis_prompts import VALIDATE_GRAPH_FLOW_PROMPT
from llm_model import LLMModelWrapper


class TCGraphGenerator:
    """
    Constructs hierarchical graph structures from video analysis data.
    Maps UI screens to nodes and user interactions to directional edges.
    """

    def __init__(self, llm_model: Optional[LLMModelWrapper] = None):
        # Canvas positioning configuration
        self.initial_x_coordinate = 16000
        self.initial_y_coordinate = 23000
        self.horizontal_spacing = 500

        # Initialize LLM model for graph validation
        self.llm_model = llm_model or LLMModelWrapper()

    def _filter_orphan_screens(
        self, screens: List[Dict], interactions: List[Dict]
    ) -> List[Dict]:
        """
        Intelligently filter out orphan screens that don't participate in any interaction.
        Only keep screens that are part of the actual flow.

        Args:
            screens: List of screen objects
            interactions: List of interaction objects

        Returns:
            Filtered list of screens that are actually used in interactions
        """
        # Collect all screen IDs that appear in interactions
        screen_ids_in_use = set()
        for interaction in interactions:
            screen_ids_in_use.add(interaction.get("from_screen_id"))
            screen_ids_in_use.add(interaction.get("to_screen_id"))

        # Filter screens to only include those in interactions
        filtered_screens = [s for s in screens if s["id"] in screen_ids_in_use]

        orphan_count = len(screens) - len(filtered_screens)
        if orphan_count > 0:
            orionis_log(
                f"Graph validation: Removed {orphan_count} orphan screen(s) not part of interaction flow"
            )
            for screen in screens:
                if screen["id"] not in screen_ids_in_use:
                    orionis_log(
                        f"Excluded: {screen['id']} '{screen['title']}' (not referenced in any interaction)"
                    )

        return filtered_screens

    def _calculate_chain_length(
        self,
        from_screen_id: str,
        interactions: List[Dict],
        visited: Optional[set] = None,
        cache: Optional[Dict[str, int]] = None,
    ) -> int:
        """
        Calculate the length of the longest chain starting from a given screen.
        Uses depth-first search with memoization to traverse all possible paths efficiently.

        Args:
            from_screen_id: Starting screen ID
            interactions: List of all interactions
            visited: Set of already visited screens (to prevent infinite loops)
            cache: Dictionary to cache computed chain lengths for performance

        Returns:
            Maximum chain length from this screen
        """
        if visited is None:
            visited = set()

        if cache is None:
            cache = {}

        if from_screen_id in visited:
            return 0  # Prevent infinite loops

        # Check cache for already computed results
        if from_screen_id in cache:
            return cache[from_screen_id]

        visited = visited.copy()
        visited.add(from_screen_id)

        # Find all interactions starting from this screen
        outgoing_interactions = [
            i for i in interactions if i.get("from_screen_id") == from_screen_id
        ]

        if not outgoing_interactions:
            result = 1  # Leaf node (end of chain)
            cache[from_screen_id] = result
            return result

        # Calculate maximum chain length from all possible paths
        max_chain = 0
        for interaction in outgoing_interactions:
            next_screen = interaction.get("to_screen_id")
            if next_screen:
                chain_length = 1 + self._calculate_chain_length(
                    next_screen, interactions, visited, cache
                )
                max_chain = max(max_chain, chain_length)

        cache[from_screen_id] = max_chain
        return max_chain

    def _detect_and_remove_branching(
        self, screens: List[Dict], interactions: List[Dict]
    ) -> tuple[List[Dict], List[Dict]]:
        """
        Detect and remove branching in the interaction flow to ensure linear path.
        When multiple interactions originate from the same screen, keeps only the
        interaction that leads to the longest chain.

        Branching occurs when a screen has multiple outgoing edges (A → B and A → C).
        This function keeps only the branch with the longest downstream chain.

        Args:
            screens: List of screen objects
            interactions: List of interaction objects

        Returns:
            Tuple of (filtered_screens, filtered_interactions) with branching removed
        """
        orionis_log("Checking for branching in interaction flow")

        # Build a mapping of from_screen_id → list of interactions
        from_screen_map: Dict[str, List[Dict]] = {}
        for interaction in interactions:
            from_screen = interaction.get("from_screen_id")
            if from_screen:
                if from_screen not in from_screen_map:
                    from_screen_map[from_screen] = []
                from_screen_map[from_screen].append(interaction)

        # Detect branching: screens with multiple outgoing interactions
        branching_detected = False
        filtered_interactions = []
        removed_branches = []

        # Create cache for chain length calculations to improve performance
        chain_length_cache: Dict[str, int] = {}

        for from_screen, interaction_list in from_screen_map.items():
            if len(interaction_list) > 1:
                branching_detected = True

                # Calculate chain length for each branch
                branch_scores: List[Dict] = []
                for interaction in interaction_list:
                    to_screen = interaction.get("to_screen_id")
                    if to_screen:
                        chain_length = self._calculate_chain_length(
                            to_screen, interactions, cache=chain_length_cache
                        )
                    else:
                        chain_length = 0
                    branch_scores.append(
                        {
                            "interaction": interaction,
                            "chain_length": chain_length,
                            "to_screen": to_screen,
                        }
                    )

                # Sort by chain length (descending), then by timestamp (ascending) as tiebreaker
                branch_scores.sort(
                    key=lambda x: (
                        -int(x["chain_length"]),  # type: ignore
                        x["interaction"].get("timestamp", "99:99"),  # type: ignore
                    )
                )

                # Keep the branch with longest chain
                primary_branch_info = branch_scores[0]
                primary_interaction: Dict = primary_branch_info["interaction"]  # type: ignore
                filtered_interactions.append(primary_interaction)

                # Track removed branches for logging
                for branch_info in branch_scores[1:]:
                    branch_interaction: Dict = branch_info["interaction"]  # type: ignore
                    removed_branches.append(
                        {
                            "from": from_screen,
                            "to": branch_info["to_screen"],
                            "description": branch_interaction.get(
                                "interaction_description"
                            ),
                            "timestamp": branch_interaction.get("timestamp"),
                            "chain_length": branch_info["chain_length"],
                        }
                    )

                orionis_log(
                    f"Branching detected from screen '{from_screen}': "
                    f"{len(interaction_list)} outgoing edges found. "
                    f"Keeping branch to '{primary_branch_info['to_screen']}' "
                    f"(chain length: {primary_branch_info['chain_length']}) "
                    f"at {primary_interaction.get('timestamp')}"
                )
            else:
                # No branching, keep the single interaction
                filtered_interactions.append(interaction_list[0])

        # Log summary of removed branches
        if branching_detected:
            orionis_log(
                f"Removed {len(removed_branches)} branch(es) to ensure linear flow:"
            )
            for branch in removed_branches:
                orionis_log(
                    f"  ✗ {branch['from']} → {branch['to']} "
                    f"({branch['description']}) at {branch['timestamp']} "
                    f"[chain length: {branch['chain_length']}]"
                )
        else:
            orionis_log("No branching detected - flow is linear ✓")

        # Now check if any screens became unreachable after removing branches
        # Build set of screens still in use
        screen_ids_in_use = set()
        for interaction in filtered_interactions:
            screen_ids_in_use.add(interaction.get("from_screen_id"))
            screen_ids_in_use.add(interaction.get("to_screen_id"))

        # Filter screens to only include those still in the flow
        filtered_screens = [s for s in screens if s["id"] in screen_ids_in_use]

        orphaned_screens = len(screens) - len(filtered_screens)
        if orphaned_screens > 0:
            orionis_log(
                f"After branch removal, {orphaned_screens} screen(s) became orphaned and were removed"
            )
            for screen in screens:
                if screen["id"] not in screen_ids_in_use:
                    orionis_log(
                        f"  Orphaned: {screen['id']} '{screen.get('title', 'N/A')}'"
                    )

        return filtered_screens, filtered_interactions

    def _ensure_linear_graph(
        self, screens: List[Dict], interactions: List[Dict]
    ) -> tuple[List[Dict], List[Dict]]:
        """
        Final enforcement to ensure the graph is strictly linear.

        Valid graph definition:
        - Nodes connected linearly (like a line)
        - No branching (no node has multiple outgoing edges)
        - No merging (no node has multiple incoming edges)
        - No orphan nodes
        - No cycles

        This runs AFTER all other processing to guarantee a valid final graph.
        """
        orionis_log("Final enforcement: Ensuring strictly linear graph")

        # Build adjacency information
        incoming: Dict[str, List[str]] = {}
        outgoing: Dict[str, List[str]] = {}

        for interaction in interactions:
            from_id = interaction.get("from_screen_id")
            to_id = interaction.get("to_screen_id")

            if from_id and to_id:
                outgoing.setdefault(from_id, []).append(to_id)
                incoming.setdefault(to_id, []).append(from_id)

        # Find the starting node (node with no incoming edges)
        all_nodes = set(outgoing.keys()) | set(incoming.keys())
        start_nodes = [node for node in all_nodes if node not in incoming]

        if not start_nodes:
            # If no clear start node (cycle), use first node from interactions
            start_node = interactions[0].get("from_screen_id") if interactions else None
        elif len(start_nodes) == 1:
            start_node = start_nodes[0]
        else:
            # Multiple start nodes - choose the one that leads to the longest linear flow
            start_node = start_nodes[0]
            max_flow_length = 0

            for candidate_start in start_nodes:
                # Calculate flow length from this start node using BFS
                flow_length = 0
                visited_temp = set()
                queue_temp = [candidate_start]

                while queue_temp:
                    current_temp = queue_temp.pop(0)
                    if current_temp in visited_temp:
                        continue
                    visited_temp.add(current_temp)
                    flow_length += 1

                    # Add next nodes
                    if current_temp in outgoing:
                        for next_node in outgoing[current_temp]:
                            if next_node not in visited_temp:
                                queue_temp.append(next_node)

                if flow_length > max_flow_length:
                    max_flow_length = flow_length
                    start_node = candidate_start

            orionis_log(
                f"Multiple start nodes found ({len(start_nodes)}), "
                f"selected {start_node} with longest flow ({max_flow_length} nodes)"
            )

        # Order interactions by following the graph from start node (BFS)
        ordered_interactions = []
        visited = set()
        queue = [start_node] if start_node else []

        while queue:
            current = queue.pop(0)
            if current in visited:
                continue
            visited.add(current)

            # Get all interactions from current node
            for interaction in interactions:
                if interaction.get("from_screen_id") == current:
                    ordered_interactions.append(interaction)
                    next_screen = interaction.get("to_screen_id")
                    if next_screen and next_screen not in visited:
                        queue.append(next_screen)

        # Add any remaining interactions not reachable from start
        for interaction in interactions:
            if interaction not in ordered_interactions:
                ordered_interactions.append(interaction)

        # Check and fix: No node should have multiple incoming edges (merging)
        filtered_interactions: List[Dict] = []
        removed_merges: List[Dict] = []

        for interaction in ordered_interactions:
            to_id = interaction.get("to_screen_id")

            # If this target already has an incoming edge, skip this interaction
            if to_id in incoming and len(incoming[to_id]) > 1:
                # Keep only the first incoming edge (in graph flow order from start node)
                existing_sources = [
                    i for i in filtered_interactions if i.get("to_screen_id") == to_id
                ]

                if existing_sources:
                    # Already have an incoming edge, skip this one
                    removed_merges.append(
                        {
                            "from": interaction.get("from_screen_id"),
                            "to": to_id,
                            "description": interaction.get("interaction_description"),
                            "timestamp": interaction.get("timestamp"),
                        }
                    )
                    continue

            filtered_interactions.append(interaction)

        if removed_merges:
            orionis_log(
                f"Removed {len(removed_merges)} merging edge(s) to ensure linear flow:"
            )
            for merge in removed_merges:
                orionis_log(
                    f"  ✗ {merge['from']} → {merge['to']} "
                    f"({merge['description']}) at {merge['timestamp']}"
                )

        # Rebuild adjacency after removing merges
        incoming = {}
        outgoing = {}
        for interaction in filtered_interactions:
            from_id = interaction.get("from_screen_id")
            to_id = interaction.get("to_screen_id")

            if from_id and to_id:
                outgoing.setdefault(from_id, []).append(to_id)
                incoming.setdefault(to_id, []).append(from_id)

        # Fix: Remove any remaining branching (multiple outgoing edges)
        # This is a safety net in case LLM validation introduced new branches
        violations = []
        for screen_id, targets in outgoing.items():
            if len(targets) > 1:
                violations.append((screen_id, len(targets)))

        if violations:
            orionis_log(
                f"WARNING: {len(violations)} screen(s) still have multiple outgoing edges after LLM validation"
            )

            # Remove extra outgoing edges, keeping only the first one in graph flow order
            fixed_interactions = []
            seen_sources = set()

            for interaction in filtered_interactions:
                from_id = interaction.get("from_screen_id")

                # If this source already has an outgoing edge, skip subsequent ones
                if from_id in outgoing and len(outgoing[from_id]) > 1:
                    if from_id in seen_sources:
                        # Already have an outgoing edge from this source, skip
                        orionis_log(
                            f"  ✗ Removed extra branch: {from_id} → {interaction.get('to_screen_id')} "
                            f"({interaction.get('interaction_description')})"
                        )
                        continue
                    else:
                        # First edge from this source, keep it
                        seen_sources.add(from_id)

                fixed_interactions.append(interaction)

            filtered_interactions = fixed_interactions
            orionis_log(
                "Fixed branching violations - kept first edges in graph flow order"
            )

        # Remove interactions that are part of unreachable subgraphs
        # After removing branches, some nodes may become unreachable from start
        reachable_from_start = set()
        if start_node:
            queue_reachable = [start_node]
            while queue_reachable:
                current_reachable = queue_reachable.pop(0)
                if current_reachable in reachable_from_start:
                    continue
                reachable_from_start.add(current_reachable)

                # Add next nodes from filtered_interactions
                for interaction in filtered_interactions:
                    if interaction.get("from_screen_id") == current_reachable:
                        next_screen = interaction.get("to_screen_id")
                        if next_screen and next_screen not in reachable_from_start:
                            queue_reachable.append(next_screen)

        # Keep only interactions where from_screen is reachable
        reachable_interactions = []
        removed_unreachable = []
        for interaction in filtered_interactions:
            from_id = interaction.get("from_screen_id")
            if from_id in reachable_from_start:
                reachable_interactions.append(interaction)
            else:
                removed_unreachable.append(
                    {
                        "from": from_id,
                        "to": interaction.get("to_screen_id"),
                        "description": interaction.get("interaction_description"),
                    }
                )

        if removed_unreachable:
            orionis_log(
                f"Removed {len(removed_unreachable)} unreachable interaction(s) "
                f"(orphaned after branching removal):"
            )
            for unreach in removed_unreachable:
                orionis_log(
                    f"  ✗ {unreach['from']} → {unreach['to']} ({unreach['description']})"
                )

        filtered_interactions = reachable_interactions

        # Clean up orphaned screens
        screen_ids_in_use = set()
        for interaction in filtered_interactions:
            from_id = interaction.get("from_screen_id")
            to_id = interaction.get("to_screen_id")
            if from_id:
                screen_ids_in_use.add(from_id)
            if to_id:
                screen_ids_in_use.add(to_id)

        filtered_screens = [s for s in screens if s["id"] in screen_ids_in_use]

        orphaned = len(screens) - len(filtered_screens)
        if orphaned > 0:
            orionis_log(f"Final cleanup: Removed {orphaned} orphaned screen(s)")

        orionis_log(
            f"Linear graph enforced - Screens: {len(filtered_screens)}, "
            f"Interactions: {len(filtered_interactions)}"
        )

        return filtered_screens, filtered_interactions

    def _llm_final_validation(
        self, screens: List[Dict], interactions: List[Dict]
    ) -> List[Dict]:
        """
        Use LLM to perform final validation of the graph for discontinuities and logical flow.
        The LLM will intelligently suggest missing connections if needed.

        Args:
            screens: List of screen objects
            interactions: List of interaction objects

        Returns:
            Updated interactions list with any necessary fixes
        """
        orionis_log("Starting final graph validation with LLM")

        validation_prompt = VALIDATE_GRAPH_FLOW_PROMPT.format(
            screens=json.dumps(screens, indent=2),
            interactions=json.dumps(interactions, indent=2),
        )

        # Define response schema matching VALIDATE_GRAPH_FLOW_PROMPT output format exactly
        validation_response_schema = {
            "type": "object",
            "properties": {
                "is_complete": {"type": "boolean"},
                "issues_found": {"type": "array", "items": {"type": "string"}},
                "suggested_interactions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "from_screen_id": {"type": "string"},
                            "to_screen_id": {"type": "string"},
                            "interaction_description": {"type": "string"},
                            "timestamp": {"type": "string"},
                            "observed_results": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                            "rationale": {"type": "string"},
                        },
                    },
                },
            },
        }

        try:
            orionis_log("Analyzing graph with LLM...")
            response_text = self.llm_model.call_llm_v3(
                prompt=validation_prompt, response_schema=validation_response_schema
            )

            validation_result = json.loads(response_text)

            if validation_result.get("is_complete", True):
                orionis_log("Graph validation passed - flow is complete and logical")
                return interactions

            issues = validation_result.get("issues_found", [])
            if issues:
                orionis_log(f"Found {len(issues)} issue(s): {', '.join(issues)}")

            suggested = validation_result.get("suggested_interactions", [])
            if suggested:
                orionis_log(
                    f"AI suggested {len(suggested)} connection(s) to fix discontinuities"
                )
                updated_interactions = interactions.copy()

                for suggestion in suggested:
                    orionis_log(
                        f"Adding: {suggestion['from_screen_id']} → {suggestion['to_screen_id']} - {suggestion.get('rationale', 'N/A')}"
                    )

                    # Insert chronologically based on timestamp
                    inserted = False
                    for idx, inter in enumerate(updated_interactions):
                        if inter.get("timestamp", "99:99") > suggestion.get(
                            "timestamp", "00:00"
                        ):
                            updated_interactions.insert(idx, suggestion)
                            inserted = True
                            break

                    if not inserted:
                        updated_interactions.append(suggestion)

                orionis_log("Graph has been repaired and is now complete")
                return updated_interactions

            return interactions

        except Exception as e:
            orionis_log(f"LLM validation failed: {str(e)}", e)
            orionis_log("Proceeding with original interactions")
            return interactions

    def generate_tc_graph(
        self,
        screens: List[Dict],
        interactions: List[Dict],
        screen_images: Optional[Dict[str, str]] = None,
    ) -> Dict:
        """
        Build test case graph structure from analyzed video data

        Args:
            screens: Unique UI states identified by the video analyzer
            interactions: User action sequences connecting screens
            screen_images: Optional mapping of screen IDs to base64 image data URIs

        Returns:
            Graph dictionary with nodes (UI states) and edges (transitions)
        """
        orionis_log("Starting test case graph construction")

        # Step 1: Filter out orphan screens that aren't part of the flow
        screens = self._filter_orphan_screens(screens, interactions)

        # Step 2: Detect and remove branching to ensure linear flow
        screens, interactions = self._detect_and_remove_branching(screens, interactions)

        # Step 3: LLM-based final validation to check for discontinuities
        interactions = self._llm_final_validation(screens, interactions)

        # Step 4: FINAL ENFORCEMENT - Ensure strictly linear graph
        screens, interactions = self._ensure_linear_graph(screens, interactions)

        screen_images = screen_images or {}

        # Transform screen data into visual node representations
        graph_nodes = []
        screen_to_node_mapping = {}

        for node_index, screen_data in enumerate(screens):
            generated_node_id = f"node-exec-{node_index:04d}"
            original_screen_id = screen_data["id"]

            # Map original screen ID to new graph node ID
            screen_to_node_mapping[original_screen_id] = generated_node_id

            # Retrieve associated screenshot if available
            image_data_uri = screen_images.get(original_screen_id, "")

            node_structure = {
                "id": generated_node_id,
                "type": "customNode",
                "position": {
                    "x": self.initial_x_coordinate
                    + (node_index * self.horizontal_spacing),
                    "y": self.initial_y_coordinate,
                },
                "data": {
                    "image": image_data_uri,
                    "description": screen_data["title"],
                    "flowStyle": {"showExclamationIcon": False},
                },
            }
            graph_nodes.append(node_structure)

        orionis_log(f"Constructed {len(graph_nodes)} graph nodes from screens")

        # Build edge collection from user interactions
        graph_edges = []
        existing_edges = (
            set()
        )  # Track edges to prevent duplicates and bidirectional connections

        for interaction_idx, user_action in enumerate(interactions):
            origin_screen = user_action.get("from_screen_id")
            destination_screen = user_action.get("to_screen_id")

            # Map screen IDs to their corresponding node identifiers
            origin_node = screen_to_node_mapping.get(origin_screen)
            destination_node = screen_to_node_mapping.get(destination_screen)

            if not origin_node or not destination_node:
                orionis_log(
                    f"Skipping interaction #{interaction_idx} - unresolved screen reference"
                )
                continue

            # Filter out circular references (self-loops)
            if origin_node == destination_node:
                continue

            # Filter out bidirectional edges (prevent A→B and B→A)
            edge_pair = (origin_node, destination_node)
            reverse_edge_pair = (destination_node, origin_node)

            if reverse_edge_pair in existing_edges:
                orionis_log(
                    f"Skipping interaction #{interaction_idx} - creates bidirectional connection: {origin_node} ↔ {destination_node}"
                )
                continue

            existing_edges.add(edge_pair)

            edge_identifier = f"edge-exec-{interaction_idx:04d}"
            edge_structure = {
                "id": edge_identifier,
                "source": origin_node,
                "target": destination_node,
                "sourceHandle": "right-source",
                "targetHandle": "left-target",
                "type": "customEdge",
                "data": {
                    "description": user_action["interaction_description"],
                    "source": origin_node,
                    "target": destination_node,
                    "isNewEdge": False,
                },
            }
            graph_edges.append(edge_structure)

        orionis_log(f"Created {len(graph_edges)} directional edges from interactions")

        complete_graph = {"nodes": graph_nodes, "edges": graph_edges}

        orionis_log(
            f"Graph construction complete - Nodes: {len(graph_nodes)}, Edges: {len(graph_edges)}"
        )

        return complete_graph

    def generate_flow_json(self, tc_graph: Dict, video_url: str) -> Dict:
        """
        Extract flow metadata from constructed graph

        Args:
            tc_graph: Complete graph with nodes and edges

        Returns:
            Flow metadata including entry/exit points and traversal path
        """
        orionis_log("Extracting flow metadata from graph")
        vertex_collection = tc_graph.get("nodes", [])
        edges = tc_graph.get("edges", [])

        if not vertex_collection:
            orionis_log("Warning: Empty graph detected - no nodes to process")
            return {
                "id": "flow-execution",
                "name": "Generated Flow 1",
                "startNodeId": None,
                "endNodeId": None,
                "viaNodeIds": [],
                "pathNodeIds": [],
                "videoUrl": video_url,
            }

        # Build ordered sequence of node identifiers
        ordered_node_ids = [vertex["id"] for vertex in vertex_collection]

        # Generate flow name: "Generated Flow 1 - {last edge description}"
        end_node_id = ordered_node_ids[-1] if ordered_node_ids else None
        last_edge_description = ""

        if end_node_id:
            # Find the edge that leads to the end node
            for edge in edges:
                if edge.get("target") == end_node_id:
                    last_edge_description = edge.get("data", {}).get("description", "")
                    break

        # Create the flow name
        if last_edge_description:
            generated_flow_name = f"Generated Flow 1 - {last_edge_description}"
        else:
            generated_flow_name = "Generated Flow 1"

        flow_metadata = {
            "id": "flow-execution",
            "name": generated_flow_name,
            "startNodeId": ordered_node_ids[0] if ordered_node_ids else None,
            "endNodeId": ordered_node_ids[-1] if ordered_node_ids else None,
            "viaNodeIds": ordered_node_ids[1:-1] if len(ordered_node_ids) > 2 else [],
            "pathNodeIds": ordered_node_ids,
            "autoPlan": False,
            "videoUrl": video_url,
        }

        orionis_log(
            f"Flow metadata extracted - Name: {generated_flow_name}, Path nodes: {len(ordered_node_ids)}"
        )

        return flow_metadata
