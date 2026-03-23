import json
import logging
import os
import sys
from pathlib import Path

from ..config import NODE_HEIGHT

_NOVA_ROOT = Path(__file__).resolve().parents[3]
if str(_NOVA_ROOT) not in sys.path:
    sys.path.insert(0, str(_NOVA_ROOT))

from utils.collaboration_client import collaboration_manager  # noqa: E402

logger = logging.getLogger(__name__)


def _fetch_existing_graph_data(product_id: str) -> tuple[dict | None, list]:
    try:
        logger.info(f"Fetching existing graph data for productID: {product_id}")
        response = collaboration_manager.get_graph_data(product_id)
        existing_graph = response.get("graph") or None
        existing_flows = response.get("flows") or []
        return existing_graph, existing_flows
    except Exception as e:
        logger.error(f"Failed to fetch graph data from collaboration backend: {e}")
        return None, []


def _replace_graph(product_id: str, graph_data: dict) -> None:
    collaboration_manager.emit_graph_changes_sync(
        product_id=product_id,
        nodes=graph_data.get("nodes", []),
        edges=graph_data.get("edges", []),
        flows=None,
        is_incremental=False,
    )


def _replace_flows(product_id: str, flows_data: list) -> None:
    collaboration_manager.emit_graph_changes_sync(
        product_id=product_id,
        nodes=[],
        edges=[],
        flows=flows_data,
        is_incremental=False,
    )


def merge_graphs(base_graph: dict, new_graph: dict) -> dict:
    """Merge two graph dicts (nodes and edges), avoiding duplicate IDs."""
    logger.info("Beginning to merge graphs")
    merged = {"nodes": [], "edges": []}
    base_node_ids = set(node["id"] for node in base_graph.get("nodes", []))
    base_edge_ids = set(edge["id"] for edge in base_graph.get("edges", []))

    logger.info(
        f"Base graph has {len(base_graph.get('nodes', []))} nodes and {len(base_graph.get('edges', []))} edges."
    )
    logger.info(
        f"New graph has {len(new_graph.get('nodes', []))} nodes and {len(new_graph.get('edges', []))} edges."
    )

    merged["nodes"].extend(base_graph.get("nodes", []))
    added_nodes = 0
    for node in new_graph.get("nodes", []):
        if node["id"] not in base_node_ids:
            merged["nodes"].append(node)
            added_nodes += 1
    logger.info(f"Added {added_nodes} new nodes from new graph.")

    merged["edges"].extend(base_graph.get("edges", []))
    added_edges = 0
    for edge in new_graph.get("edges", []):
        if edge["id"] not in base_edge_ids:
            merged["edges"].append(edge)
            added_edges += 1
    logger.info(f"Added {added_edges} new edges from new graph.")

    logger.info(
        f"Merged graph now has {len(merged['nodes'])} nodes and {len(merged['edges'])} edges."
    )
    return merged


def offset_new_graph_positions(
    base_graph: dict, new_graph: dict, y_pad: int = 300
) -> dict:
    """Offset new graph's node positions so it appears below the base graph."""
    logger.info("Offsetting new graph node positions relative to base graph.")
    base_nodes = base_graph.get("nodes", [])
    new_nodes = new_graph.get("nodes", [])

    if not base_nodes or not new_nodes:
        logger.info("No base or new nodes to offset. Returning new_graph unchanged.")
        return new_graph

    base_ys = [
        n["position"]["y"]
        for n in base_nodes
        if "position" in n and "y" in n["position"]
    ]

    if not base_ys:
        logger.info(
            "Base graph nodes missing position data. Returning new_graph unchanged."
        )
        return new_graph

    base_max_y = max(base_ys) + NODE_HEIGHT
    new_ys = [
        n["position"]["y"]
        for n in new_nodes
        if "position" in n and "y" in n["position"]
    ]
    new_min_y = min(new_ys) if new_ys else 0
    y_offset = base_max_y + y_pad - new_min_y
    x_offset = 0

    logger.info(
        f"Offsetting new nodes by x_offset={x_offset}, y_offset={y_offset} (base_max_y={base_max_y}, new_min_y={new_min_y}, y_pad={y_pad})"
    )

    for node in new_nodes:
        if "position" in node and "x" in node["position"] and "y" in node["position"]:
            node["position"]["x"] += x_offset
            node["position"]["y"] += y_offset

    logger.info(f"Offset applied to {len(new_nodes)} new nodes.")
    return new_graph


def append_graph(graph_file_path: str, session_dir: str, product_id: str) -> None:
    """
    Append a graph file to an existing graph in the collaboration backend, merging them if an existing graph exists.
    Also handles flows.json if it exists in the session directory.
    """
    del session_dir

    if not product_id:
        logger.info("No product_id provided, skipping graph upload")
        return

    try:
        with open(graph_file_path, "r", encoding="utf-8") as f:
            graph_data = json.load(f)

        existing_graph, _ = _fetch_existing_graph_data(product_id)

        if existing_graph is not None:
            graph_data = offset_new_graph_positions(existing_graph, graph_data)
            merged_graph_data = merge_graphs(existing_graph, graph_data)
            logger.info(
                f"Successfully merged existing graph for product_id {product_id}"
            )
            with open(graph_file_path, "w", encoding="utf-8") as f:
                json.dump(merged_graph_data, f, indent=2)
        else:
            merged_graph_data = graph_data

        _replace_graph(product_id, merged_graph_data)
        logger.info(
            f"Uploaded merged graph for product_id {product_id} to collaboration backend"
        )

        flows_file_path = os.path.join(os.path.dirname(graph_file_path), "flows.json")
        if os.path.exists(flows_file_path):
            append_flows(flows_file_path, os.path.dirname(graph_file_path), product_id)

    except Exception as e:
        logger.error(f"Failed to append graph to collaboration backend: {e}")


def merge_flows(base_flows: list, new_flows: list) -> list:
    """Merge two flows lists, avoiding duplicate IDs."""
    logger.info("Beginning to merge flows")
    merged = []
    base_flow_ids = set(flow["id"] for flow in base_flows)

    logger.info(f"Base flows has {len(base_flows)} flows.")
    logger.info(f"New flows has {len(new_flows)} flows.")

    merged.extend(base_flows)
    added_flows = 0
    for flow in new_flows:
        if flow["id"] not in base_flow_ids:
            merged.append(flow)
            added_flows += 1
    logger.info(f"Added {added_flows} new flows from new flows list.")
    logger.info(f"Merged flows now has {len(merged)} flows.")
    return merged


def append_flows(flows_file_path: str, session_dir: str, product_id: str) -> None:
    """
    Append a flows file to existing flows in the collaboration backend, merging them if existing flows exist.
    """
    del session_dir

    if not product_id:
        logger.info("No product_id provided, skipping flows upload")
        return

    try:
        with open(flows_file_path, "r", encoding="utf-8") as f:
            flows_data = json.load(f)

        _, existing_flows = _fetch_existing_graph_data(product_id)

        if existing_flows:
            merged_flows_data = merge_flows(existing_flows, flows_data)
            logger.info(
                f"Successfully merged existing flows for product_id {product_id}"
            )
            with open(flows_file_path, "w", encoding="utf-8") as f:
                json.dump(merged_flows_data, f, indent=2)
        else:
            merged_flows_data = flows_data

        _replace_flows(product_id, merged_flows_data)
        logger.info(
            f"Uploaded merged flows for product_id {product_id} to collaboration backend"
        )

    except Exception as e:
        logger.error(f"Failed to append flows to collaboration backend: {e}")
