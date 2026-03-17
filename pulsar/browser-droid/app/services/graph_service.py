import os
import json
import logging
import base64
import io
import tempfile
from typing import Dict, Any, List, Optional
from PIL import Image, ImageDraw
import time
from google.cloud import storage  # GCP Storage client
from nanoid import generate

logger = logging.getLogger(__name__)


class GraphService:
    """Service for handling graph creation operations"""

    def __init__(self, config, annotation_service, llm_wrapper=None):
        self.config = config
        self.annotation_service = annotation_service
        self.llm_wrapper = llm_wrapper
        # Cache for wildcard template image - will be loaded on first use
        self._wildcard_template_image = None

    def _get_wildcard_template_image(self) -> str:
        """Get the wildcard template image, loading it on first access"""
        if self._wildcard_template_image is None:
            self._wildcard_template_image = self._load_wildcard_template_image()
        return self._wildcard_template_image

    def _decode_image_data(self, data_url: str) -> bytes:
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
            w = bounding_box.get("width", 0)
            h = bounding_box.get("height", 0)
            rect = [(x, y), (x + w, y + h)]
            draw.rectangle(rect, outline=(255, 0, 0, 255), width=8)
            draw.rectangle(rect, fill=(255, 0, 0, 40))

        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
        image.save(temp_file, format="PNG")
        temp_file.close()
        return temp_file.name

    def describe_transition_action(
        self,
        before_image_data: str,
        after_image_data: str,
        bounding_box: Dict[str, Any],
        action_context: Dict[str, Any],
        is_web: bool = False,
    ) -> Dict[str, Any]:
        if not self.llm_wrapper:
            return {"error": "LLM wrapper not configured"}

        temp_files = []
        try:
            before_path = self._save_temp_image(before_image_data, bounding_box)
            after_path = self._save_temp_image(after_image_data)
            temp_files.extend([before_path, after_path])

            description = self.llm_wrapper.describe_transition_action(
                before_path,
                after_path,
                {
                    "action": action_context,
                    "bounding_box": bounding_box,
                },
                is_web,
            )

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
                with open(screenshot_path, "rb") as f:
                    image_data = f.read()
                    base64_image = base64.b64encode(image_data).decode("utf-8")

                node = {
                    "id": f"node-{session_id}-{product_id}-{generate(size=12)}",
                    "type": "customNode",
                    "position": {"x": 0, "y": 0},  # Will be set later
                    "data": {
                        "image": f"data:image/jpeg;base64,{base64_image}",
                        "description": f"Screenshot {i + 1} from session {session_id}",
                        "session_id": session_id,
                        "screenshot_file": screenshot_file,
                    },
                }
                nodes.append(node)

            # Load transitions and create edges + wildcard nodes in one go
            nodes, edges = self._create_nodes_and_edges_with_wildcards(
                session_id, nodes, product_id
            )

            # Position nodes in grid
            self._position_nodes_in_grid(nodes)

            # Create graph JSON
            graph_data = {
                "nodes": nodes,
                "edges": edges,
            }

            # Save graph JSON
            graph_file_path_new = os.path.join(session_dir, "graph_new.json")
            with open(graph_file_path_new, "w") as f:
                json.dump(graph_data, f, indent=2)
            graph_file_path = os.path.join(session_dir, "graph.json")
            with open(graph_file_path, "w") as f:
                json.dump(graph_data, f, indent=2)

            # Only upload to GCP if product_id is provided and not empty
            if product_id:
                # Download a hardcoded JSON file from the bucket before uploading
                existing_graph = self._download_existing_graph_from_gcp(session_dir, product_id)
                merged_graph_data = graph_data
                if existing_graph is not None:
                    # Offset new graph's node positions so it appears to the right of the old graph
                    graph_data = self._offset_new_graph_positions(existing_graph, graph_data)
                    merged_graph_data = self._merge_graphs(existing_graph, graph_data)
                    logger.info(f"Successfully merged existing graph for product_id {product_id}")
                    with open(graph_file_path, "w") as f:
                        json.dump(merged_graph_data, f, indent=2)
                self._upload_to_gcp_bucket(
                    graph_file_path,
                    f"qai-upload-temporary/productId_{product_id}/graph-export.json",
                )
            else:
                logger.info(
                    f"No product_id provided, skipping GCP upload for session {session_id}"
                )

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
            skipped_transitions = {}  # Store skipped transitions for wildcard node creation

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
                        edge = {
                            "id": f"edge-{session_id}-{product_id}-{source_node_index}-{generate(size=12)}",
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
                    wildcard_node_id = (
                        f"wildcard_node_{session_id}_{product_id}_{timestamp}_{wildcard_counter}"
                    )

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

    def _position_nodes_in_grid(self, nodes: List[Dict[str, Any]]) -> None:
        """Position nodes in a grid layout"""
        # Grid configuration
        screenshots_per_row = 10
        screenshot_width = 200
        screenshot_height = 400
        horizontal_spacing = 2 * screenshot_width
        vertical_spacing = int(1.4 * screenshot_height)  # Reduced by 30%

        current_row = 0
        current_col = 0
        last_node_col_prev_row = 0  # Track the last node column from previous row

        for i, node in enumerate(nodes):
            # Check if this is a wildcard node - if so, start a new row and adjust column
            if "wildcard_node" in node.get("id", ""):
                current_row += 1

                # Get back navigation count from node data
                back_nav_count = node.get("data", {}).get("back_nav_count", 0)

                # Calculate the column position: last node of previous row - back_nav_count
                adjusted_col = max(0, last_node_col_prev_row - back_nav_count)
                current_col = adjusted_col

            # Position current node
            new_x = current_col * (screenshot_width + horizontal_spacing)
            new_y = current_row * (screenshot_height + vertical_spacing)

            node["position"] = {"x": new_x, "y": new_y}

            # Move to next column for all nodes (including wildcard nodes)
            current_col += 1

            # Track the last node column for the current row
            last_node_col_prev_row = current_col - 1

            if current_col >= screenshots_per_row:
                current_col = 0
                current_row += 1
                last_node_col_prev_row = (
                    screenshots_per_row - 1
                )  # Reset to last column when row wraps

    def _compress_image(self, image_path: str) -> str:
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

    def _upload_to_gcp_bucket(self, local_path: str, blob_name: str) -> None:
        """Uploads a file to the configured GCP bucket. Optionally includes product_id in blob path."""
        try:
            project_id = self._get_gcp_project_id()

            bucket_name = "graph-editor-prod" if project_id == "qai-tech" else "graph-editor"
            logger.info(f"Uploading {local_path} to GCP bucket {bucket_name} as {blob_name}")
            storage_client = storage.Client.from_service_account_json(
                os.path.join(
                    os.path.dirname(__file__), "../../gcp-service-account.json"
                )
            )
            bucket = storage_client.bucket(bucket_name)
            # If product_id is provided, ensure blob_name includes it (for safety)
            blob = bucket.blob(blob_name)
            blob.upload_from_filename(local_path)
            logger.info(
                f"Uploaded {local_path} to GCP bucket {bucket_name} as {blob_name}"
            )
        except Exception as e:
            logger.error(f"Failed to upload {local_path} to GCP bucket: {e}")

    def _get_gcp_project_id(self) -> str:
        """Read project_id from gcp-service-account.json"""
        try:
            service_account_path = os.path.join(os.path.dirname(__file__), "../../gcp-service-account.json")
            with open(service_account_path, "r") as f:
                data = json.load(f)
            return data.get("project_id", "")
        except Exception as e:
            logger.error(f"Failed to read project_id from gcp-service-account.json: {e}")
            return ""

    def _download_existing_graph_from_gcp(self, session_dir: str, product_id: str) -> dict:
        """Download an existing graph JSON from GCP bucket for the given product_id. Returns the parsed JSON or None."""
        try:
            logger.info(f"SDownloading old graph for productID: {product_id}")
            project_id = self._get_gcp_project_id()
            bucket_name = "graph-editor-prod" if project_id == "qai-tech" else "graph-editor"
            storage_client = storage.Client.from_service_account_json(
                os.path.join(os.path.dirname(__file__), "../../gcp-service-account.json")
            )
            bucket = storage_client.bucket(bucket_name)
            download_blob_name = f"qai-upload-temporary/productId_{product_id}/graph-export.json"
            download_path = os.path.join(session_dir, "downloaded_sample_graph.json")
            blob = bucket.blob(download_blob_name)
            if blob.exists():
                blob.download_to_filename(download_path)
                logger.info(f"Downloaded {download_blob_name} from GCP bucket {bucket_name} to {download_path}")
                try:
                    with open(download_path, "r") as f:
                        existing_graph = json.load(f)
                    return existing_graph
                except Exception as e:
                    logger.warning(f"Failed to read downloaded sample JSON: {e}")
                    return None
            else:
                logger.warning(f"Blob {download_blob_name} does not exist in bucket {bucket_name}")
                return None
        except Exception as e:
            logger.error(f"Failed to download sample JSON from GCP bucket: {e}")
            return None

    def _merge_graphs(self, base_graph: dict, new_graph: dict) -> dict:
        """Merge two graph dicts (nodes and edges), avoiding duplicate IDs."""
        logger.info(f"Beginning to merge the graphs for productId")
        merged = {"nodes": [], "edges": []}
        base_node_ids = set(node["id"] for node in base_graph.get("nodes", []))
        base_edge_ids = set(edge["id"] for edge in base_graph.get("edges", []))
        logger.info(f"Base graph has {len(base_graph.get('nodes', []))} nodes and {len(base_graph.get('edges', []))} edges.")
        logger.info(f"New graph has {len(new_graph.get('nodes', []))} nodes and {len(new_graph.get('edges', []))} edges.")
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
        logger.info(f"Merged graph now has {len(merged['nodes'])} nodes and {len(merged['edges'])} edges.")
        return merged

    def _offset_new_graph_positions(self, base_graph: dict, new_graph: dict, x_pad: int = 1000) -> dict:
        """Offset new graph's node positions so it appears to the right of the base graph."""
        logger.info("Offsetting new graph node positions relative to base graph.")
        base_nodes = base_graph.get("nodes", [])
        new_nodes = new_graph.get("nodes", [])
        if not base_nodes or not new_nodes:
            logger.info("No base or new nodes to offset. Returning new_graph unchanged.")
            return new_graph  # Nothing to offset
        base_xs = [n["position"]["x"] for n in base_nodes if "position" in n and "x" in n["position"]]
        base_ys = [n["position"]["y"] for n in base_nodes if "position" in n and "y" in n["position"]]
        if not base_xs or not base_ys:
            logger.info("Base graph nodes missing position data. Returning new_graph unchanged.")
            return new_graph
        max_x = max(base_xs)
        min_y = min(base_ys)
        new_ys = [n["position"]["y"] for n in new_nodes if "position" in n and "y" in n["position"]]
        min_new_y = min(new_ys) if new_ys else 0
        x_offset = max_x + x_pad
        y_offset = min_y - min_new_y
        logger.info(f"Offsetting new nodes by x_offset={x_offset}, y_offset={y_offset} (max_x={max_x}, min_y={min_y}, min_new_y={min_new_y})")
        for n in new_nodes:
            if "position" in n and "x" in n["position"] and "y" in n["position"]:
                old_x, old_y = n["position"]["x"], n["position"]["y"]
                n["position"]["x"] += x_offset
                n["position"]["y"] += y_offset
                logger.debug(f"Node {n['id']}: x {old_x} -> {n['position']['x']}, y {old_y} -> {n['position']['y']}")
        logger.info(f"Offset applied to {len(new_nodes)} new nodes.")
        return new_graph
