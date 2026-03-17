import os
import json
import logging
import base64
import io
import time
from typing import Dict, Any, List, Tuple
from nanoid import generate
from PIL import Image
from ..config import NODE_HEIGHT, NODE_WIDTH

logger = logging.getLogger(__name__)


def build_node(
    node_id: str,
    image_path: str,
    description: str,
    session_id: str,
    **kwargs,
) -> Dict[str, Any]:
    """Build a node with the given parameters"""
    # Read and encode screenshot with compression
    base64_image = compress_image(image_path)

    node = {
        "id": node_id,
        "type": "customNode",
        "position": {"x": 0, "y": 0},  # Will be set later
        "data": {
            "image": f"data:image/jpeg;base64,{base64_image}",
            "description": description,
            "session_id": session_id,
        },
    }

    # Add any additional data fields
    for key, value in kwargs.items():
        node["data"][key] = value

    return node


def build_edge(
    edge_id: str, source_id: str, target_id: str, description: str, **kwargs
) -> Dict[str, Any]:
    """Build an edge with the given parameters"""
    edge = {
        "id": edge_id,
        "source": source_id,
        "target": target_id,
        "sourceHandle": "right-source",
        "targetHandle": "left-target",
        "type": "customEdge",
        "data": {
            "description": description,
            "source": source_id,
            "target": target_id,
            "isNewEdge": False,
        },
    }

    # Add any additional data fields
    for key, value in kwargs.items():
        edge["data"][key] = value

    return edge


def normalize_node_id(session_id: str, product_id: str, suffix: str = None) -> str:
    """Generate a normalized node ID"""
    if suffix:
        return f"node-{session_id}-{product_id}-{suffix}-{generate(size=12)}"
    return f"node-{session_id}-{product_id}-{generate(size=12)}"


def normalize_edge_id(
    session_id: str, product_id: str, source_idx: int, target_idx: int = None
) -> str:
    """Generate a normalized edge ID"""
    if target_idx is not None:
        return f"edge-{session_id}-{product_id}-{source_idx}-{target_idx}-{generate(size=12)}"
    return f"edge-{session_id}-{product_id}-{source_idx}-{generate(size=12)}"


def resolve_screenshot_path(session_dir: str, screenshot_path: str) -> str:
    """Resolve screenshot path relative to session directory"""
    if screenshot_path.startswith("uploads/"):
        # Extract the session-specific part of the path
        # From: "uploads/test_session_20250828_20/screenshots/ss_20250828_203423_521.png"
        # To: "screenshots/ss_20250828_203423_521.png"
        path_parts = screenshot_path.split("/")
        if len(path_parts) >= 3:
            # Skip "uploads" and session_id, keep the rest
            relative_path = "/".join(path_parts[2:])
            return os.path.join(session_dir, relative_path)
    return screenshot_path


def serialize_graph(
    nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Serialize graph data to the standard format"""
    return {
        "nodes": nodes,
        "edges": edges,
    }


def position_nodes_in_grid(nodes: List[Dict[str, Any]]) -> None:
    """Position nodes in a grid layout"""
    # Grid configuration
    screenshots_per_row = 100
    screenshot_width = NODE_WIDTH
    screenshot_height = NODE_HEIGHT
    horizontal_spacing = 3 * screenshot_width
    vertical_spacing = int(1.4 * screenshot_height)  # Reduced by 30%

    current_row = 0
    current_col = 0
    last_node_col_prev_row = 0  # Track the last node column from previous row

    for i, node in enumerate(nodes):
        # Check if this is a wildcard node - if so, start a new row and adjust column
        if "wildcard_node" in node.get("id", ""):
            current_row += 1
            current_col = 0
        else:
            # Regular screenshot node
            if current_col >= screenshots_per_row:
                current_row += 1
                current_col = 0

        # Calculate position
        x = current_col * horizontal_spacing
        y = current_row * vertical_spacing

        # Set position
        node["position"] = {"x": x, "y": y}

        # Update counters
        current_col += 1


def compress_image(image_path: str) -> str:
    """
    Compress an image to max height 800 with 80% JPG quality.

    Args:
        image_path: Path to the original image file

    Returns:
        Base64 encoded string of the compressed image
    """
    try:
        # Open the image
        with Image.open(image_path) as img:
            # Convert to RGB if necessary (for PNG with transparency)
            if img.mode in ("RGBA", "LA", "P"):
                # Create a white background
                background = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                background.paste(
                    img, mask=img.split()[-1] if img.mode == "RGBA" else None
                )
                img = background
            elif img.mode != "RGB":
                img = img.convert("RGB")

            # Calculate new dimensions maintaining aspect ratio
            width, height = img.size
            if height > 800:
                # Calculate new width to maintain aspect ratio
                new_height = 800
                new_width = int((width * new_height) / height)
                img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

            # Save compressed image to bytes buffer
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=80, optimize=True)
            buffer.seek(0)

            # Convert to base64
            image_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
            return image_base64

    except Exception as e:
        logger.error(f"Error compressing image {image_path}: {e}")
        # Fallback to original image if compression fails
        try:
            with open(image_path, "rb") as img_file:
                return base64.b64encode(img_file.read()).decode("utf-8")
        except Exception as fallback_error:
            logger.error(
                f"Fallback image reading also failed for {image_path}: {fallback_error}"
            )
            return ""


def build_flow(
    flow_id: str,
    flow_name: str,
    start_node_id: str,
    end_node_id: str,
    via_node_ids: List[str],
    path_node_ids: List[str],
) -> Dict[str, Any]:
    """Build a flow object with the given parameters"""
    flow = {
        "id": flow_id,
        "name": flow_name,
        "startNodeId": start_node_id,
        "endNodeId": end_node_id,
        "viaNodeIds": via_node_ids,
        "pathNodeIds": path_node_ids,
    }
    return flow


def serialize_flows(flows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Serialize flows data to the standard format"""
    return flows
