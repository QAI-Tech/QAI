import os
import json
import logging
from google.cloud import storage
from ..config import NODE_HEIGHT

logger = logging.getLogger(__name__)


def get_gcp_project_id() -> str:
    """Read project_id from gcp-service-account.json"""
    try:
        service_account_path = os.path.join(
            os.path.dirname(__file__), "../../gcp-service-account.json"
        )
        with open(service_account_path, "r") as f:
            data = json.load(f)
        return data.get("project_id", "")
    except Exception as e:
        logger.error(f"Failed to read project_id from gcp-service-account.json: {e}")
        return ""


def get_bucket_name() -> str:
    """Get the appropriate bucket name based on project ID"""
    project_id = get_gcp_project_id()
    return "graph-editor-prod" if project_id == "qai-tech" else "graph-editor"


def get_storage_client():
    """Get GCP storage client"""
    service_account_path = os.path.join(
        os.path.dirname(__file__), "../../gcp-service-account.json"
    )
    return storage.Client.from_service_account_json(service_account_path)


def upload_to_gcp_bucket(local_path: str, blob_name: str) -> None:
    """Uploads a file to the configured GCP bucket."""
    try:
        bucket_name = get_bucket_name()
        logger.info(
            f"Uploading {local_path} to GCP bucket {bucket_name} as {blob_name}"
        )

        storage_client = get_storage_client()
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(blob_name)
        blob.upload_from_filename(local_path)

        logger.info(f"Uploaded {local_path} to GCP bucket {bucket_name} as {blob_name}")
    except Exception as e:
        logger.error(f"Failed to upload {local_path} to GCP bucket: {e}")


def download_existing_graph_from_gcp(session_dir: str, product_id: str) -> dict:
    """Download an existing graph JSON from GCP bucket for the given product_id. Returns the parsed JSON or None."""
    try:
        logger.info(f"Downloading old graph for productID: {product_id}")
        bucket_name = get_bucket_name()
        storage_client = get_storage_client()
        bucket = storage_client.bucket(bucket_name)

        download_blob_name = (
            f"qai-upload-temporary/productId_{product_id}/graph-export.json"
        )
        download_path = os.path.join(session_dir, "downloaded_sample_graph.json")
        # Ensure parent directory exists before downloading
        os.makedirs(os.path.dirname(download_path), exist_ok=True)
        blob = bucket.blob(download_blob_name)

        if blob.exists():
            blob.download_to_filename(download_path)
            logger.info(
                f"Downloaded {download_blob_name} from GCP bucket {bucket_name} to {download_path}"
            )
            try:
                with open(download_path, "r") as f:
                    existing_graph = json.load(f)
                return existing_graph
            except Exception as e:
                logger.warning(f"Failed to read downloaded sample JSON: {e}")
                return None
        else:
            logger.warning(
                f"Blob {download_blob_name} does not exist in bucket {bucket_name}"
            )
            return None
    except Exception as e:
        logger.error(f"Failed to download sample JSON from GCP bucket: {e}")
        return None


def merge_graphs(base_graph: dict, new_graph: dict) -> dict:
    """Merge two graph dicts (nodes and edges), avoiding duplicate IDs."""
    logger.info(f"Beginning to merge the graphs for productId")
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
        return new_graph  # Nothing to offset

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

    # Calculate base graph bottom edge (max y + node height)
    base_max_y = max(base_ys) + NODE_HEIGHT

    # Calculate new graph top edge (min y)
    new_ys = [
        n["position"]["y"]
        for n in new_nodes
        if "position" in n and "y" in n["position"]
    ]
    new_min_y = min(new_ys) if new_ys else 0

    # Calculate offset to place new graph below base graph
    y_offset = base_max_y + y_pad - new_min_y
    x_offset = 0  # No horizontal offset needed

    logger.info(
        f"Offsetting new nodes by x_offset={x_offset}, y_offset={y_offset} (base_max_y={base_max_y}, new_min_y={new_min_y}, y_pad={y_pad})"
    )

    for n in new_nodes:
        if "position" in n and "x" in n["position"] and "y" in n["position"]:
            old_x, old_y = n["position"]["x"], n["position"]["y"]
            n["position"]["x"] += x_offset
            n["position"]["y"] += y_offset
            logger.debug(
                f"Node {n['id']}: x {old_x} -> {n['position']['x']}, y {old_y} -> {n['position']['y']}"
            )

    logger.info(f"Offset applied to {len(new_nodes)} new nodes.")
    return new_graph


def append_graph(graph_file_path: str, session_dir: str, product_id: str) -> None:
    """
    Append a graph file to an existing graph in GCP bucket, merging them if an existing graph exists.
    Also handles flows.json if it exists in the session directory.

    Args:
        graph_file_path: Local path to the graph file to append
        session_dir: Session directory path
        product_id: Product ID for GCP bucket organization
    """
    if not product_id:
        logger.info(f"No product_id provided, skipping GCP upload")
        return

    try:
        # Read the graph file
        with open(graph_file_path, "r") as f:
            graph_data = json.load(f)

        # Download existing graph from GCP bucket
        existing_graph = download_existing_graph_from_gcp(session_dir, product_id)

        if existing_graph is not None:
            # Offset new graph's node positions so it appears below the old graph
            graph_data = offset_new_graph_positions(existing_graph, graph_data)
            merged_graph_data = merge_graphs(existing_graph, graph_data)
            logger.info(
                f"Successfully merged existing graph for product_id {product_id}"
            )

            # Write merged graph back to file
            with open(graph_file_path, "w") as f:
                json.dump(merged_graph_data, f, indent=2)
        else:
            merged_graph_data = graph_data

        # Upload to GCP bucket
        upload_to_gcp_bucket(
            graph_file_path,
            f"qai-upload-temporary/productId_{product_id}/graph-export.json",
        )

        # Also handle flows.json if it exists
        flows_file_path = os.path.join(session_dir, "flows.json")
        if os.path.exists(flows_file_path):
            append_flows(flows_file_path, session_dir, product_id)

    except Exception as e:
        logger.error(f"Failed to append graph to GCP bucket: {e}")


def download_existing_flows_from_gcp(session_dir: str, product_id: str) -> list:
    """Download existing flows JSON from GCP bucket for the given product_id. Returns the parsed JSON or empty list."""
    try:
        logger.info(f"Downloading old flows for productID: {product_id}")
        bucket_name = get_bucket_name()
        storage_client = get_storage_client()
        bucket = storage_client.bucket(bucket_name)

        download_blob_name = (
            f"qai-upload-temporary/productId_{product_id}/flows-export.json"
        )
        download_path = os.path.join(session_dir, "downloaded_sample_flows.json")
        blob = bucket.blob(download_blob_name)

        if blob.exists():
            blob.download_to_filename(download_path)
            logger.info(
                f"Downloaded {download_blob_name} from GCP bucket {bucket_name} to {download_path}"
            )
            try:
                with open(download_path, "r") as f:
                    existing_flows = json.load(f)
                return existing_flows if isinstance(existing_flows, list) else []
            except Exception as e:
                logger.warning(f"Failed to read downloaded flows JSON: {e}")
                return []
        else:
            logger.warning(
                f"Blob {download_blob_name} does not exist in bucket {bucket_name}"
            )
            return []
    except Exception as e:
        logger.error(f"Failed to download flows JSON from GCP bucket: {e}")
        return []


def merge_flows(base_flows: list, new_flows: list) -> list:
    """Merge two flows lists, avoiding duplicate IDs."""
    logger.info(f"Beginning to merge the flows for productId")
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
    Append a flows file to existing flows in GCP bucket, merging them if existing flows exist.

    Args:
        flows_file_path: Local path to the flows file to append
        session_dir: Session directory path
        product_id: Product ID for GCP bucket organization
    """
    if not product_id:
        logger.info(f"No product_id provided, skipping GCP flows upload")
        return

    try:
        # Read the flows file
        with open(flows_file_path, "r") as f:
            flows_data = json.load(f)

        # Download existing flows from GCP bucket
        existing_flows = download_existing_flows_from_gcp(session_dir, product_id)

        if existing_flows:
            merged_flows_data = merge_flows(existing_flows, flows_data)
            logger.info(
                f"Successfully merged existing flows for product_id {product_id}"
            )

            # Write merged flows back to file
            with open(flows_file_path, "w") as f:
                json.dump(merged_flows_data, f, indent=2)
        else:
            merged_flows_data = flows_data

        # Upload to GCP bucket
        upload_to_gcp_bucket(
            flows_file_path,
            f"qai-upload-temporary/productId_{product_id}/flows-export.json",
        )

    except Exception as e:
        logger.error(f"Failed to append flows to GCP bucket: {e}")
