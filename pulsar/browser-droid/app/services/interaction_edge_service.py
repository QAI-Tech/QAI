import os
import json
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from PIL import Image, ImageDraw
from nanoid import generate

import prompts

logger = logging.getLogger(__name__)


class InteractionEdgeService:
    """
    Service for generating edge descriptions from user interactions.

    Uses screen captures before/after interactions along with tap/swipe coordinates
    to generate meaningful edge descriptions via LLM analysis.

    Edges are added directly to graph.json following the same format as graph_service.py
    """

    BOUNDING_BOX_SIZE = 100  # Size of bounding box around tap coordinates
    BOUNDING_BOX_COLOR = (255, 0, 0)  # Red
    BOUNDING_BOX_WIDTH = 4  # Line width

    def __init__(self, config, llm_wrapper, socketio=None):
        """
        Initialize the InteractionEdgeService.

        Args:
            config: Application configuration
            llm_wrapper: LLM wrapper for Gemini API calls
            socketio: SocketIO instance for real-time edge emission (optional)
        """
        self.config = config
        self.llm_wrapper = llm_wrapper
        self.socketio = socketio

        # Initialize GCP storage client for uploading updated graph
        try:
            from google.cloud import storage

            service_account_path = os.getenv("GCP_SERVICE_ACCOUNT_PATH", "gcp-service-account.json")
            if os.path.exists(service_account_path):
                self.storage_client = storage.Client.from_service_account_json(service_account_path)
                logger.info(f"GCS client initialized with service account: {service_account_path}")
            else:
                self.storage_client = storage.Client()
                logger.info("GCS client initialized with default credentials")
        except Exception as e:
            logger.warning(f"Failed to initialize GCP storage client: {e}")
            self.storage_client = None

    def generate_edges_for_session(
        self,
        session_id: str,
        product_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate edges for all interactions in a session and add them to graph.json.

        Args:
            session_id: The session ID to process
            product_id: Optional product ID for edge ID generation

        Returns:
            Dict containing status and generated edges
        """
        try:
            logger.info(f"Starting interaction edge generation for session: {session_id}")

            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)

            # Load existing graph.json
            graph_file = os.path.join(session_dir, "graph.json")
            if not os.path.exists(graph_file):
                logger.warning(f"graph.json not found for session {session_id}")
                return {
                    "status": "skipped",
                    "reason": "graph.json not found - run graph generation first",
                    "edges": []
                }

            with open(graph_file, "r", encoding="utf-8") as f:
                graph_data = json.load(f)

            existing_nodes = graph_data.get("nodes", [])
            existing_edges = graph_data.get("edges", [])

            if not existing_nodes:
                logger.warning(f"No nodes in graph.json for session {session_id}")
                return {
                    "status": "skipped",
                    "reason": "No nodes in graph.json",
                    "edges": []
                }

            # Load interactions
            interactions = self._load_interactions(session_id)
            if not interactions:
                logger.warning(f"No interactions found for session {session_id}")
                return {
                    "status": "skipped",
                    "reason": "No interactions found",
                    "edges": []
                }

            # Match interactions to node pairs using the nodes from graph.json
            matched_interactions = self._match_interactions_to_nodes(
                interactions, existing_nodes, session_dir
            )

            if not matched_interactions:
                logger.warning(f"No interactions could be matched to nodes")
                return {
                    "status": "skipped",
                    "reason": "No interactions matched to nodes",
                    "edges": []
                }

            # Generate edges for each matched interaction
            new_edges = []
            existing_edge_pairs = set()

            # Track existing edge source-target pairs to avoid duplicates
            for edge in existing_edges:
                pair = (edge.get("source"), edge.get("target"))
                existing_edge_pairs.add(pair)

            for idx, match in enumerate(matched_interactions):
                try:
                    source_node_id = match["source_node"]["id"]
                    target_node_id = match["target_node"]["id"]

                    # Skip if edge already exists between these nodes
                    if (source_node_id, target_node_id) in existing_edge_pairs:
                        logger.info(f"Edge already exists between {source_node_id} and {target_node_id}, skipping")
                        continue

                    edge = self._generate_edge_for_interaction(
                        session_id=session_id,
                        product_id=product_id or "",
                        match=match,
                        edge_index=len(existing_edges) + idx
                    )
                    if edge:
                        new_edges.append(edge)
                        existing_edge_pairs.add((source_node_id, target_node_id))

                        # Emit edge immediately via socket.io for real-time updates
                        if self.socketio:
                            self._emit_edge_created(edge, session_id, product_id)
                except Exception as e:
                    logger.error(f"Failed to generate edge for interaction: {e}")
                    continue

            if new_edges:
                # Add new edges to graph data
                graph_data["edges"].extend(new_edges)

                # Save updated graph.json
                with open(graph_file, "w", encoding="utf-8") as f:
                    json.dump(graph_data, f, indent=2)

                logger.info(f"Added {len(new_edges)} interaction edges to graph.json")

                # Upload updated graph to GCP if product_id is provided
                if product_id and self.storage_client:
                    try:
                        project_id = self._get_gcp_project_id()
                        bucket_name = "graph-editor-prod" if project_id == "qai-tech" else "graph-editor"
                        blob_path = f"qai-upload-temporary/productId_{product_id}/graph-export.json"

                        bucket = self.storage_client.bucket(bucket_name)
                        blob = bucket.blob(blob_path)
                        blob.upload_from_filename(graph_file)

                        logger.info(f"Re-uploaded graph with edges to GCP bucket {bucket_name}: {blob_path}")
                    except Exception as e:
                        logger.error(f"Failed to re-upload graph to GCP: {e}")

            logger.info(f"Interaction edge generation completed: {len(new_edges)} edges generated")

            return {
                "status": "success",
                "edges": new_edges,
                "total_interactions": len(interactions),
                "matched_interactions": len(matched_interactions),
                "edges_generated": len(new_edges)
            }

        except Exception as e:
            logger.error(f"Interaction edge generation failed for session {session_id}: {e}")
            return {
                "status": "error",
                "error": str(e),
                "edges": []
            }

    def _load_interactions(self, session_id: str) -> List[Dict[str, Any]]:
        """Load interactions from interactions.json"""
        session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
        interactions_file = os.path.join(session_dir, "interactions.json")

        if not os.path.exists(interactions_file):
            logger.warning(f"Interactions file not found: {interactions_file}")
            return []

        try:
            with open(interactions_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load interactions: {e}")
            return []

    def _match_interactions_to_nodes(
        self,
        interactions: List[Dict[str, Any]],
        nodes: List[Dict[str, Any]],
        session_dir: str
    ) -> List[Dict[str, Any]]:
        """
        Match interactions to node pairs from graph.json.

        Each interaction occurs between two nodes (before/after screens).
        We match based on screenshot filenames.

        Args:
            interactions: List of interaction data
            nodes: List of nodes from graph.json
            session_dir: Path to session directory

        Returns:
            List of matched interaction data with source/target node info
        """
        matched = []

        # Build a map of screenshot_file -> node
        screenshot_to_node = {}
        for node in nodes:
            screenshot_file = node.get("data", {}).get("screenshot_file")
            if screenshot_file:
                screenshot_to_node[screenshot_file] = node

        # Sort nodes by their screenshot filename (which includes timestamp)
        sorted_nodes = sorted(
            [n for n in nodes if n.get("data", {}).get("screenshot_file")],
            key=lambda x: x.get("data", {}).get("screenshot_file", "")
        )

        # Match interactions sequentially to consecutive node pairs
        # Interaction i connects node i to node i+1
        interaction_idx = 0
        for i in range(len(sorted_nodes) - 1):
            if interaction_idx >= len(interactions):
                break

            source_node = sorted_nodes[i]
            target_node = sorted_nodes[i + 1]
            interaction = interactions[interaction_idx]

            source_screenshot = source_node.get("data", {}).get("screenshot_file", "")
            target_screenshot = target_node.get("data", {}).get("screenshot_file", "")

            matched.append({
                "interaction": interaction,
                "source_node": source_node,
                "target_node": target_node,
                "source_screenshot_path": os.path.join(session_dir, source_screenshot),
                "target_screenshot_path": os.path.join(session_dir, target_screenshot),
                "interaction_screenshot_path": os.path.join(
                    session_dir,
                    "screenshots",
                    interaction.get("pre_screenshot_filename", "")
                )
            })

            interaction_idx += 1

        return matched

    def _generate_edge_for_interaction(
        self,
        session_id: str,
        product_id: str,
        match: Dict[str, Any],
        edge_index: int
    ) -> Optional[Dict[str, Any]]:
        """
        Generate an edge for a single matched interaction.

        Args:
            session_id: The session ID
            product_id: Product ID for edge ID
            match: Matched interaction data with source/target node info
            edge_index: Index for edge ID generation

        Returns:
            Edge data dictionary or None if generation failed
        """
        interaction = match["interaction"]
        source_node = match["source_node"]
        target_node = match["target_node"]
        source_screenshot_path = match["source_screenshot_path"]
        target_screenshot_path = match["target_screenshot_path"]
        interaction_screenshot_path = match.get("interaction_screenshot_path")

        # Get coordinates for bounding box
        coordinates = interaction.get("coordinates", [])
        interaction_type = interaction.get("interaction_type", "tap")

        # Create annotated screenshot with bounding box
        annotated_screenshot_path = None
        if interaction_screenshot_path and os.path.exists(interaction_screenshot_path):
            annotated_screenshot_path = self._create_annotated_screenshot(
                interaction_screenshot_path,
                coordinates,
                interaction_type,
                session_id
            )
        elif source_screenshot_path and os.path.exists(source_screenshot_path):
            # Fall back to using source node screenshot
            annotated_screenshot_path = self._create_annotated_screenshot(
                source_screenshot_path,
                coordinates,
                interaction_type,
                session_id
            )

        source_node_id = source_node["id"]
        target_node_id = target_node["id"]

        # Generate edge ID based on edge count to ensure uniqueness and consistency
        # Format: edge-exec-{edge_index}
        edge_id = f"edge-exec-{edge_index}"

        # Generate edge description via LLM (pass edge_id and product_id for logging)
        edge_description = self._analyze_interaction_with_llm(
            before_screenshot=annotated_screenshot_path or source_screenshot_path,
            after_screenshot=target_screenshot_path,
            interaction_type=interaction_type,
            coordinates=coordinates,
            session_id=session_id,
            product_id=product_id,
            edge_id=edge_id
        )

        if not edge_description:
            logger.warning("Failed to generate edge description from LLM")
            # Fallback to a basic description
            edge_description = {
                "description": f"{interaction_type.capitalize()} interaction",
                "rationale": f"User performed a {interaction_type} action"
            }

        # Create edge in exact same format as graph_service.py
        edge = {
            "id": edge_id,
            "source": source_node_id,
            "target": target_node_id,
            "sourceHandle": "right-source",
            "targetHandle": "left-target",
            "type": "customEdge",
            "data": {
                "description": edge_description.get("description", ""),
                "source": source_node_id,
                "target": target_node_id,
                "isNewEdge": False,
            },
        }

        return edge

    def _create_annotated_screenshot(
        self,
        screenshot_path: str,
        coordinates: List[int],
        interaction_type: str,
        session_id: str
    ) -> Optional[str]:
        """
        Create an annotated screenshot with bounding box at interaction coordinates.

        Args:
            screenshot_path: Path to the original screenshot
            coordinates: [x, y] for tap or [x1, y1, x2, y2] for swipe
            interaction_type: Type of interaction (tap, swipe, etc.)
            session_id: Session ID for saving the annotated screenshot

        Returns:
            Path to the annotated screenshot or None if failed
        """
        if not coordinates:
            logger.warning("No coordinates provided for annotation")
            return None

        if not os.path.exists(screenshot_path):
            logger.warning(f"Screenshot not found: {screenshot_path}")
            return None

        try:
            # Open the image
            img = Image.open(screenshot_path)
            draw = ImageDraw.Draw(img)

            if interaction_type == "tap" and len(coordinates) >= 2:
                # Draw bounding box around tap location
                x, y = coordinates[0], coordinates[1]
                half_size = self.BOUNDING_BOX_SIZE // 2

                # Calculate bounding box corners
                left = max(0, x - half_size)
                top = max(0, y - half_size)
                right = min(img.width, x + half_size)
                bottom = min(img.height, y + half_size)

                # Draw rectangle
                draw.rectangle(
                    [(left, top), (right, bottom)],
                    outline=self.BOUNDING_BOX_COLOR,
                    width=self.BOUNDING_BOX_WIDTH
                )

                # Draw crosshair at exact tap point
                crosshair_size = 20
                draw.line(
                    [(x - crosshair_size, y), (x + crosshair_size, y)],
                    fill=self.BOUNDING_BOX_COLOR,
                    width=2
                )
                draw.line(
                    [(x, y - crosshair_size), (x, y + crosshair_size)],
                    fill=self.BOUNDING_BOX_COLOR,
                    width=2
                )

            elif interaction_type == "swipe" and len(coordinates) >= 4:
                # Draw arrow from start to end of swipe
                x1, y1, x2, y2 = coordinates[0], coordinates[1], coordinates[2], coordinates[3]

                # Draw line
                draw.line(
                    [(x1, y1), (x2, y2)],
                    fill=self.BOUNDING_BOX_COLOR,
                    width=self.BOUNDING_BOX_WIDTH
                )

                # Draw circles at start and end points
                circle_radius = 15
                draw.ellipse(
                    [(x1 - circle_radius, y1 - circle_radius),
                     (x1 + circle_radius, y1 + circle_radius)],
                    outline=self.BOUNDING_BOX_COLOR,
                    width=self.BOUNDING_BOX_WIDTH
                )
                draw.ellipse(
                    [(x2 - circle_radius, y2 - circle_radius),
                     (x2 + circle_radius, y2 + circle_radius)],
                    fill=self.BOUNDING_BOX_COLOR
                )

            # Save annotated screenshot
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            annotated_dir = os.path.join(session_dir, "annotated_screenshots")
            os.makedirs(annotated_dir, exist_ok=True)

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
            annotated_filename = f"annotated_{timestamp}.png"
            annotated_path = os.path.join(annotated_dir, annotated_filename)

            img.save(annotated_path)
            logger.info(f"Created annotated screenshot: {annotated_path}")

            return annotated_path

        except Exception as e:
            logger.error(f"Failed to create annotated screenshot: {e}")
            return None

    def _analyze_interaction_with_llm(
        self,
        before_screenshot: str,
        after_screenshot: str,
        interaction_type: str,
        coordinates: List[int],
        session_id: str,
        product_id: str = None,
        edge_id: str = None
    ) -> Optional[Dict[str, Any]]:
        """
        Analyze interaction using LLM with before/after screenshots.

        Args:
            before_screenshot: Path to annotated before screenshot (with bounding box)
            after_screenshot: Path to after screenshot
            interaction_type: Type of interaction
            coordinates: Interaction coordinates
            session_id: Session ID
            product_id: Product ID for logging
            edge_id: Edge ID for logging

        Returns:
            Dict with description and rationale, or None if failed
        """
        try:
            import google.generativeai as genai

            uploaded_files = []

            # Upload before screenshot (with bounding box)
            if before_screenshot and os.path.exists(before_screenshot):
                logger.info(f"Uploading before screenshot: {before_screenshot}")
                before_file = genai.upload_file(path=before_screenshot)
                uploaded_files.append(("before", before_file))

            # Upload after screenshot
            if after_screenshot and os.path.exists(after_screenshot):
                logger.info(f"Uploading after screenshot: {after_screenshot}")
                after_file = genai.upload_file(path=after_screenshot)
                uploaded_files.append(("after", after_file))

            if not uploaded_files:
                logger.warning("No screenshots available for LLM analysis")
                return None

            # Prepare action context for prompt
            coordinate_str = ""
            if coordinates:
                if len(coordinates) == 2:
                    coordinate_str = f"Tap at coordinates: ({coordinates[0]}, {coordinates[1]})"
                elif len(coordinates) == 4:
                    coordinate_str = f"Swipe from ({coordinates[0]}, {coordinates[1]}) to ({coordinates[2]}, {coordinates[3]})"

            action_context = f"{interaction_type.upper()}: {coordinate_str}" if coordinate_str else interaction_type.upper()

            prompt = prompts.EDGE_DESCRIPTION_PROMPT.format(action_context=action_context)

            # Prepare LLM input
            llm_input = [prompt]
            for label, file in uploaded_files:
                llm_input.append(file)

            logger.info("Generating edge description via LLM...")
            response = self.llm_wrapper.model.generate_content(llm_input)

            # Clean up uploaded files
            for label, file in uploaded_files:
                try:
                    genai.delete_file(file.name)
                except Exception as e:
                    logger.warning(f"Failed to delete uploaded file: {e}")

            # Parse response
            if hasattr(response, "text"):
                response_text = response.text
                cleaned_response = self.llm_wrapper._clean_llm_response_text(response_text)

                try:
                    result = json.loads(cleaned_response)

                    # Log the full response for debugging
                    self._log_edge_response(
                        product_id=product_id,
                        edge_id=edge_id,
                        session_id=session_id,
                        full_response=result
                    )

                    # Extract formatted_description for the edge
                    formatted_description = result.get("formatted_description", "")
                    if not formatted_description:
                        logger.warning(f"Empty formatted_description from LLM: {result.get('meta_logic', 'No reason given')}")

                    return {
                        "description": formatted_description,
                        "rationale": result.get("meta_logic", "")
                    }
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse LLM response as JSON: {e}")
                    # Log the failed response
                    self._log_edge_response(
                        product_id=product_id,
                        edge_id=edge_id,
                        session_id=session_id,
                        full_response={"error": "JSON parse failed", "raw_response": cleaned_response[:500]}
                    )
                    # Try to extract description from raw text
                    return {
                        "description": cleaned_response[:200],
                        "rationale": "Auto-generated from LLM response (JSON parse failed)"
                    }

            return None

        except Exception as e:
            logger.error(f"LLM analysis failed: {e}")
            return None

    def _emit_edge_created(self, edge: Dict[str, Any], session_id: str, product_id: Optional[str] = None):
        """
        Emit edge creation event via socket.io for real-time updates.

        Args:
            edge: The edge data to emit
            session_id: Session ID
            product_id: Product ID (optional)
        """
        try:
            # Load graph.json to get node screenshot filenames for ID mapping
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            graph_file = os.path.join(session_dir, "graph.json")

            source_screenshot = None
            target_screenshot = None

            if os.path.exists(graph_file):
                with open(graph_file, "r", encoding="utf-8") as f:
                    graph_data = json.load(f)

                # Find source and target nodes to get screenshot filenames
                for node in graph_data.get("nodes", []):
                    if node["id"] == edge["source"]:
                        source_screenshot = node.get("data", {}).get("screenshot_file")
                    if node["id"] == edge["target"]:
                        target_screenshot = node.get("data", {}).get("screenshot_file")

            event_data = {
                "edge": edge,
                "source_screenshot": source_screenshot,
                "target_screenshot": target_screenshot,
                "session_id": session_id,
                "product_id": product_id,
                "timestamp": datetime.now().isoformat()
            }

            # Emit to all connected clients
            self.socketio.emit("edge_created", event_data)
            logger.info(f"Emitted edge_created event for edge {edge['id']}")

        except Exception as e:
            logger.error(f"Failed to emit edge_created event: {e}")

    def _log_edge_response(
        self,
        product_id: str,
        edge_id: str,
        session_id: str,
        full_response: Dict[str, Any]
    ):
        """
        Log the full LLM response for debugging purposes.
        Writes to edge_response.log and uploads to GCP bucket.

        Args:
            product_id: Product ID
            edge_id: Edge ID
            session_id: Session ID
            full_response: Complete LLM response with formatted_description and meta_logic
        """
        try:
            # Create log entry
            log_entry = {
                "timestamp": datetime.now().isoformat(),
                "product_id": product_id,
                "edge_id": edge_id,
                "session_id": session_id,
                "response": full_response
            }

            # Determine log file path
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            log_file_path = os.path.join(session_dir, "edge_response.log")

            # Append to local log file
            with open(log_file_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(log_entry) + "\n")

            logger.info(f"Logged edge response for edge {edge_id}")

            # Upload log to GCP bucket (async/non-blocking)
            if product_id and self.storage_client:
                try:
                    gcp_project_id = self._get_gcp_project_id()
                    bucket_name = "graph-editor-prod" if gcp_project_id == "qai-tech" else "graph-editor"
                    bucket = self.storage_client.bucket(bucket_name)
                    gcp_path = f"qai-upload-temporary/productId_{product_id}/edge_response.log"
                    blob = bucket.blob(gcp_path)

                    # Read existing log from GCP if exists and append
                    existing_log = ""
                    if blob.exists():
                        existing_log = blob.download_as_text()

                    # Append new entry and upload
                    updated_log = existing_log + json.dumps(log_entry) + "\n"
                    blob.upload_from_string(updated_log)
                    logger.info(f"Uploaded edge_response.log to GCP: {gcp_path}")
                except Exception as e:
                    logger.warning(f"Failed to upload edge_response.log to GCP: {e}")

        except Exception as e:
            logger.error(f"Failed to log edge response: {e}")

    def _get_gcp_project_id(self) -> str:
        """Read project_id from gcp-service-account.json"""
        try:
            service_account_path = os.getenv("GCP_SERVICE_ACCOUNT_PATH", "gcp-service-account.json")
            if os.path.exists(service_account_path):
                with open(service_account_path, "r") as f:
                    data = json.load(f)
                return data.get("project_id", "")
            return ""
        except Exception as e:
            logger.error(f"Failed to read project_id from gcp-service-account.json: {e}")
            return ""
