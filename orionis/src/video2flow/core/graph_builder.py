from typing import List, Dict
from utils.util import orionis_log
from video2flow.models.screen import Screen
from video2flow.models.interaction import Interaction
from video2flow.models.graph import TCGraph, GraphNode, GraphEdge, NodeData, EdgeData


class GraphBuildError(Exception):
    """Raised when graph construction fails"""

    pass


class GraphBuilder:
    """
    Constructs strictly linear TC graphs from screens and interactions.

    This component performs Stage 5 of the Video to Flow pipeline:
    transforming the detected screens and interactions into a fully
    structured graph with proper node/edge formatting and validation.

    The graph maintains strict linearity:
    - Each node has at most 1 outgoing edge
    - Each node has at most 1 incoming edge
    - No orphan nodes
    - No cycles

    Attributes:
        initial_x: Starting X coordinate on canvas
        initial_y: Starting Y coordinate on canvas
        horizontal_spacing: Space between nodes horizontally
    """

    def __init__(
        self,
        initial_x: float = 16000,
        initial_y: float = 23000,
        horizontal_spacing: float = 500,
    ):
        """
        Initialize the GraphBuilder

        Args:
            initial_x: Starting X coordinate for first node
            initial_y: Starting Y coordinate for nodes (all on same line)
            horizontal_spacing: Horizontal spacing between consecutive nodes
        """
        self.initial_x = initial_x
        self.initial_y = initial_y
        self.horizontal_spacing = horizontal_spacing

    def build_graph(
        self,
        screens: List[Screen],
        interactions: List[Interaction],
        screen_images: Dict[str, str],
    ) -> TCGraph:
        """
        Build TC graph from screens and interactions.

        Args:
            screens: List of Screen objects in temporal order
            interactions: List of Interaction objects in temporal order
            screen_images: Dictionary mapping screen_id to base64 image data URI

        Returns:
            TCGraph object with validated linear structure

        Raises:
            GraphBuildError: If graph construction fails
        """
        orionis_log(
            f"Stage 5: Building TC graph - {len(screens)} nodes, {len(interactions)} edges"
        )

        try:
            # Validate inputs
            self._validate_inputs(screens, interactions)

            # Build nodes from screens
            nodes = self._build_nodes(screens, screen_images)
            orionis_log(f"  Created {len(nodes)} graph nodes")

            # Build edges from interactions
            edges = self._build_edges(interactions, screens)
            orionis_log(f"  Created {len(edges)} graph edges")

            # Create TC graph with validation
            tc_graph = TCGraph(nodes=nodes, edges=edges)

            # Validate no orphan nodes
            tc_graph.validate_no_orphan_nodes()

            orionis_log("Graph construction complete - Linear structure validated ✓")
            self._log_graph_summary(tc_graph)

            return tc_graph

        except Exception as e:
            error_msg = f"Graph construction failed: {str(e)}"
            orionis_log(error_msg, e)
            raise GraphBuildError(error_msg) from e

    def _validate_inputs(
        self, screens: List[Screen], interactions: List[Interaction]
    ) -> None:
        """
        Validate input data for graph construction.

        Args:
            screens: List of screens
            interactions: List of interactions

        Raises:
            GraphBuildError: If validation fails
        """
        if not screens:
            raise GraphBuildError("Cannot build graph with no screens")

        if len(screens) < 2 and interactions:
            raise GraphBuildError(
                f"Need at least 2 screens for interactions, got {len(screens)}"
            )

        # For N screens, we should have exactly N-1 interactions (linear chain)
        expected_interactions = len(screens) - 1
        if len(interactions) != expected_interactions:
            orionis_log(
                f"WARNING: Expected {expected_interactions} interactions for "
                f"{len(screens)} screens, got {len(interactions)}. "
                f"Graph may not be fully connected."
            )

    def _build_nodes(
        self,
        screens: List[Screen],
        screen_images: Dict[str, str],
        start_node_num: int = 0,
    ) -> List[GraphNode]:
        """
        Build graph nodes from screens.

        Creates nodes in a horizontal line with sequential positioning.

        Args:
            screens: List of Screen objects
            screen_images: Dictionary of screen_id to base64 images
            start_node_num: Starting number for node IDs (default 0)

        Returns:
            List of GraphNode objects
        """
        nodes = []

        for i, screen in enumerate(screens):
            # Generate node ID
            node_id = f"node-exec-{start_node_num + i:04d}"

            # Get image data (empty string if not available)
            image_data = screen_images.get(screen.id, "")

            # Calculate position (horizontal layout)
            x_position = self.initial_x + (i * self.horizontal_spacing)
            y_position = self.initial_y

            # Create node data
            node_data = NodeData(
                image=image_data,
                description=screen.title,
                detailed_description=screen.description,
            )

            # Create node
            node = GraphNode(
                id=node_id,
                type="customNode",
                position={"x": x_position, "y": y_position},
                data=node_data,
            )

            nodes.append(node)

            orionis_log(
                f"    Node {node_id}: '{screen.title}' at ({x_position}, {y_position})"
            )

        return nodes

    def _build_edges(
        self, interactions: List[Interaction], screens: List[Screen]
    ) -> List[GraphEdge]:
        """
        Build graph edges from interactions.

        Args:
            interactions: List of Interaction objects
            screens: List of Screen objects (for mapping screen IDs to node IDs)

        Returns:
            List of GraphEdge objects

        Raises:
            GraphBuildError: If interaction references invalid screens
        """
        # Create mapping from screen_id to node_id
        screen_to_node = {
            screen.id: f"node-exec-{i:04d}" for i, screen in enumerate(screens)
        }

        edges = []

        for i, interaction in enumerate(interactions):
            # Get source and target node IDs
            source_node_id = screen_to_node.get(interaction.from_screen_id)
            target_node_id = screen_to_node.get(interaction.to_screen_id)

            if not source_node_id:
                raise GraphBuildError(
                    f"Interaction {i} references unknown from_screen_id: "
                    f"{interaction.from_screen_id}"
                )

            if not target_node_id:
                raise GraphBuildError(
                    f"Interaction {i} references unknown to_screen_id: "
                    f"{interaction.to_screen_id}"
                )

            # Generate edge ID
            edge_id = f"edge-exec-{i:04d}"

            # Create edge data
            edge_data = EdgeData(
                description=interaction.interaction_description,
                business_logic="",
                curvature=0,
                source_anchor="right-source",
                target_anchor="left-target",
            )

            # Create edge
            edge = GraphEdge(
                id=edge_id,
                source=source_node_id,
                target=target_node_id,
                sourceHandle="right-source",
                targetHandle="left-target",
                type="customEdge",
                data=edge_data,
            )

            edges.append(edge)

            orionis_log(
                f"    Edge {edge_id}: {source_node_id} → {target_node_id} "
                f"({interaction.interaction_description[:50]}...)"
            )

        return edges

    def _log_graph_summary(self, graph: TCGraph) -> None:
        """
        Log a summary of the constructed graph.

        Args:
            graph: The constructed TC graph
        """
        orionis_log("Graph structure summary:")
        orionis_log(f"  Total nodes: {len(graph.nodes)}")
        orionis_log(f"  Total edges: {len(graph.edges)}")

        # Analyze graph structure
        incoming_edges = {node.id: 0 for node in graph.nodes}
        outgoing_edges = {node.id: 0 for node in graph.nodes}

        for edge in graph.edges:
            outgoing_edges[edge.source] += 1
            incoming_edges[edge.target] += 1

        # Find start node (no incoming edges)
        start_nodes = [
            node_id for node_id, count in incoming_edges.items() if count == 0
        ]

        # Find end node (no outgoing edges)
        end_nodes = [node_id for node_id, count in outgoing_edges.items() if count == 0]

        orionis_log(f"  Start node(s): {start_nodes}")
        orionis_log(f"  End node(s): {end_nodes}")

        # Validate linear structure
        if len(start_nodes) == 1 and len(end_nodes) == 1:
            orionis_log("  Structure: Linear chain ✓")
        else:
            orionis_log(
                f"  WARNING: Graph may not be a simple linear chain "
                f"({len(start_nodes)} starts, {len(end_nodes)} ends)"
            )
