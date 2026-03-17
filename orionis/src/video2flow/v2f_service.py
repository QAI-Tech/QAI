import os
import hashlib
from typing import Dict, List, Optional

from utils.util import orionis_log
from video2flow.core.screen_detector import ScreenDetector
from video2flow.core.video_splicer import VideoSplicer
from video2flow.core.interaction_detector import InteractionDetector
from video2flow.core.frame_extractor import FrameExtractor
from video2flow.core.graph_builder import GraphBuilder
from video2flow.core.pipelined_processor import PipelinedSegmentProcessor
from video2flow.models.graph import TCGraph, GraphEdge, EdgeData
from video2flow.models.video_segment import VideoSegment
from video2flow.models.interaction import Interaction
from common.collaboration_client import collaboration_manager
from common.google_cloud_wrappers import GCPFileStorageWrapper
from maintainer_agent.graph_merge_service import GraphMergeService
from llm_model import LLMModelWrapper
from constants import Constants
from services.notify_service.notify import NotificationService
from users.user_service import UserService
from users.user_request_validator import UserRequestValidator
from users.user_datastore import UserDatastore
from config import Config, config
from mixpanel_integration.mixpanel_service import mixpanel
from video2flow.models.screen import Screen
from products.product_datastore import ProductDatastore

# HOTFIX: Disabled flow_recommendations integration
# import time
# import tempfile
# import json
# from flow_recommendations.flow_recommendation_controller import (
#     trigger_flow_recommendations,
# )


class VideoToFlowError(Exception):
    """Raised when Video to Flow pipeline fails"""

    pass


class VideoToFlowService:
    """
    Main service orchestrator for Video to Flow pipeline.

    Coordinates all 5 stages to transform execution videos into
    structured TC graphs with strictly linear flow.

    Pipeline Stages:
        1. Screen Detection: Identify all screens in temporal order
        2. Video Splicing: Split video into screen-to-screen segments
        3. Interaction Detection: Analyze segments to extract user actions
        4. Frame Extraction: Capture screenshots at screen timestamps
        5. Graph Construction: Build validated linear TC graph

    Attributes:
        screen_detector: Component for detecting screens
        video_splicer: Component for splitting video
        interaction_detector: Component for detecting interactions
        frame_extractor: Component for extracting frames
        graph_builder: Component for building graphs
        gemini_client: Gemini client for AI analysis
    """

    def __init__(
        self,
        llm_model: LLMModelWrapper,
        temp_dir: Optional[str] = None,
        num_workers: Optional[int] = None,
    ):
        """
        Initialize the VideoToFlowService

        Args:
            llm_model: LLMModelWrapper instance for video analysis
            temp_dir: Optional temporary directory for video segments
            num_workers: Number of worker threads for parallel processing.
                        Defaults to 4. Set to 1 for sequential processing.
        """
        # Initialize Gemini client
        self.llm_model = llm_model
        self.num_workers = num_workers if num_workers is not None else 4

        # Initialize all pipeline components
        self.screen_detector = ScreenDetector()
        self.video_splicer = VideoSplicer(
            temp_dir=temp_dir, num_workers=self.num_workers
        )
        self.interaction_detector = InteractionDetector()
        self.frame_extractor = FrameExtractor(
            jpeg_quality=85, num_workers=self.num_workers
        )
        self.graph_builder = GraphBuilder(
            initial_x=16000, initial_y=23000, horizontal_spacing=500
        )
        self.storage_client = GCPFileStorageWrapper()
        self.bucket_name = Constants.GRAPH_EDITOR_BUCKET_NAME
        self.merge_service = GraphMergeService()

        # Initialize pipelined processor for optimized Stage 3+4
        self.pipelined_processor = PipelinedSegmentProcessor(
            video_splicer=self.video_splicer,
            interaction_detector=self.interaction_detector,
            batch_size=4,
            num_upload_workers=self.num_workers,
        )
        self.notification_service = NotificationService()
        self.user_service = UserService(UserRequestValidator(), UserDatastore())
        self.product_datastore = ProductDatastore()

    def _emit_nodes(self, product_id: str, nodes: List[Dict]) -> None:
        """Emit nodes to collaboration backend."""
        if not product_id or not nodes:
            return
        try:
            orionis_log(f"Emitting {len(nodes)} nodes to collaboration backend")
            collaboration_manager.emit_graph_changes_sync(
                product_id=product_id,
                nodes=nodes,
                edges=[],
                flows=None,
            )
            orionis_log(f"✓ Successfully emitted {len(nodes)} nodes")
        except Exception as e:
            orionis_log(f"Failed to emit nodes: {str(e)}", e)

    def _emit_edge(self, product_id: str, edge: Dict) -> None:
        """Emit a single edge to collaboration backend."""
        if not product_id or not edge:
            return
        try:
            orionis_log(f"Emitting edge {edge.get('id')} to collaboration backend")
            collaboration_manager.emit_graph_changes_sync(
                product_id=product_id,
                nodes=[],
                edges=[edge],
                flows=None,
            )
            orionis_log(f"✓ Successfully emitted edge {edge.get('id')}")
        except Exception as e:
            orionis_log(f"Failed to emit edge: {str(e)}", e)

    def _emit_flow(self, product_id: str, flow: Dict) -> None:
        """Emit a flow to collaboration backend."""
        if not product_id or not flow:
            return
        try:
            orionis_log(f"Emitting flow {flow.get('id')} to collaboration backend")
            collaboration_manager.emit_graph_changes_sync(
                product_id=product_id,
                nodes=[],
                edges=[],
                flows=[flow],
            )
            orionis_log(f"✓ Successfully emitted flow {flow.get('id')}")
        except Exception as e:
            orionis_log(f"Failed to emit flow: {str(e)}", e)

    def _create_and_emit_edge(
        self,
        source_node_id: str,
        target_node_id: str,
        description: str,
        edge_id: str,
        product_id: Optional[str],
    ) -> GraphEdge:
        """Create an edge and emit it to the collaboration backend."""
        edge_data = EdgeData(
            description=description,
            business_logic="",
            curvature=0,
            source_anchor="right-source",
            target_anchor="left-target",
        )
        edge = GraphEdge(
            id=edge_id,
            source=source_node_id,
            target=target_node_id,
            sourceHandle="right-source",
            targetHandle="left-target",
            type="customEdge",
            data=edge_data,
        )

        if product_id:
            self._emit_edge(product_id, edge.model_dump())

        return edge

    def _generate_flow_from_graph(
        self,
        tc_graph: TCGraph,
        product_id: str,
        video_url: Optional[str] = None,
        flow_description: str = "",
        feature_id: Optional[str] = None,
        flow_name: Optional[str] = None,
    ) -> Dict:
        """
        Generate a flow from a TC graph.

        Args:
            tc_graph: The TC graph to generate flow from
            video_url: Optional video URL to attach to the flow
            flow_description: Optional description for the flow
            feature_id: Optional feature ID to assign to the flow
            flow_name: Optional flow name to use for the generated flow

        Returns:
            Flow dictionary
        """

        nodes = tc_graph.nodes
        edges = tc_graph.edges

        if not nodes:
            flow_dict: Dict = {
                "id": "flow-execution-0000",
                "name": flow_name or "Generated Flow",
                "startNodeId": None,
                "endNodeId": None,
                "viaNodeIds": [],
                "pathNodeIds": [],
                "autoPlan": True,
                "videoUrl": video_url or "",
                "description": flow_description,
                "product_id": product_id,
            }
            if feature_id:
                flow_dict["feature_id"] = feature_id
            return flow_dict

        node_ids = [node.id for node in nodes]
        start_node_id = node_ids[0] if node_ids else None
        end_node_id = node_ids[-1] if node_ids else None
        via_node_ids = node_ids[1:-1] if len(node_ids) > 2 else []

        path_string = "-".join(node_ids)
        hash_hex = hashlib.sha256(path_string.encode()).hexdigest()[:8]
        flow_id = f"flow-execution-{hash_hex}"

        if not flow_name:
            last_edge_description = ""
            if edges and end_node_id:
                for edge in edges:
                    if edge.target == end_node_id:
                        last_edge_description = (
                            edge.data.description if edge.data else ""
                        )
                        break

            if last_edge_description:
                flow_name = f"Generated Flow - {last_edge_description}"
            else:
                flow_name = "Generated Flow"

        flow = {
            "id": flow_id,
            "name": flow_name,
            "startNodeId": start_node_id,
            "endNodeId": end_node_id,
            "viaNodeIds": via_node_ids,
            "pathNodeIds": node_ids,
            "autoPlan": True,
            "videoUrl": video_url or "",
            "description": flow_description,
            "product_id": product_id,
        }
        if feature_id:
            flow["feature_id"] = feature_id

        orionis_log(
            f"Generated flow: {flow_id} with {len(node_ids)} nodes "
            f"(start: {start_node_id}, end: {end_node_id})"
        )

        return flow

    def _audit_linear_graph(self, screens: List, interactions: List) -> None:
        """
        Audit the graph for linear structure violations (logging only, no deletions).
        """
        orionis_log("Auditing graph for linear structure violations...")

        incoming: Dict[str, List[str]] = {}
        outgoing: Dict[str, List[str]] = {}

        for interaction in interactions:
            from_id = interaction.from_screen_id
            to_id = interaction.to_screen_id

            if from_id and to_id:
                outgoing.setdefault(from_id, []).append(to_id)
                incoming.setdefault(to_id, []).append(from_id)

        issues_found = []

        all_nodes = set(outgoing.keys()) | set(incoming.keys())
        start_nodes = [node for node in all_nodes if node not in incoming]
        if len(start_nodes) > 1:
            issues_found.append(f"Multiple start nodes detected: {start_nodes}")

        for screen_id, targets in outgoing.items():
            if len(targets) > 1:
                issues_found.append(
                    f"Branching detected: {screen_id} has {len(targets)} outgoing edges → {targets}"
                )

        for screen_id, sources in incoming.items():
            if len(sources) > 1:
                issues_found.append(
                    f"Merging detected: {screen_id} has {len(sources)} incoming edges ← {sources}"
                )

        screen_ids = {s.id for s in screens}
        orphan_screens = screen_ids - all_nodes
        if orphan_screens:
            issues_found.append(f"Orphan screens detected: {list(orphan_screens)}")

        # Log results
        if issues_found:
            orionis_log(f"⚠ Linear graph audit found {len(issues_found)} issue(s):")
            for issue in issues_found:
                orionis_log(f"  - {issue}")
        else:
            orionis_log("✓ Linear graph audit passed - no issues found")

    def _calculate_graph_offsets(self, product_id: str) -> tuple[int, int, int, int]:
        """
        Calculate X and Y offsets and starting node/edge numbers based on existing knowledge graph.

        Args:
            product_id: Product ID to check for existing graph

        Returns:
            Tuple of (x_offset, y_offset, start_node_num, start_edge_num)
        """

        existing_graph, file_not_found = self.merge_service.download_knowledge_graph(
            product_id
        )

        if not existing_graph or file_not_found:

            orionis_log("No existing graph found, using default positions")
            return 16000, 23000, 0, 0

        highest_y = self.merge_service.calculate_highest_y_coordinate(existing_graph)
        leftmost_x = self.merge_service.calculate_leftmost_x_coordinate(existing_graph)

        max_node_num, max_edge_num = (
            self.merge_service.count_existing_exec_nodes_and_edges(existing_graph)
        )
        start_node_num = max_node_num + 1 if max_node_num >= 0 else 0
        start_edge_num = max_edge_num + 1 if max_edge_num >= 0 else 0

        y_offset = highest_y + 600
        x_offset = leftmost_x + 600

        orionis_log(
            f"Calculated offsets from existing graph - X: {x_offset}, Y: {y_offset}, "
            f"start_node_num: {start_node_num}, start_edge_num: {start_edge_num}"
        )

        return x_offset, y_offset, start_node_num, start_edge_num

    def _upload_segment_to_gcs(
        self, segment: VideoSegment, product_id: str, request_id: str
    ) -> Optional[str]:
        """Upload a video segment to GCS and return the URL. If the segment file path is not provided, return None."""
        if not segment.segment_file_path:
            orionis_log("Segment file path is required for upload - skipping")
            return None

        try:
            filename = os.path.basename(segment.segment_file_path)
            blob_name = f"qai-upload-temporary/productId_{product_id}/{request_id}/segments/{filename}"

            with open(segment.segment_file_path, "rb") as f:
                file_contents = f.read()

            self.storage_client.store_bytes(
                bytes=file_contents,
                bucket_name=self.bucket_name,
                blob_name=blob_name,
                content_type="video/mp4",
                use_constructed_bucket_name=False,
            )

            gcs_url = f"https://storage.cloud.google.com/{self.bucket_name}/{blob_name}"
            orionis_log(f"Uploaded segment to GCS: {gcs_url}")
            return gcs_url

        except Exception as e:
            orionis_log(f"Failed to upload segment to GCS: {str(e)}", e)
            return None

    def _notify_generation(
        self,
        product_id: str,
        request_id: str,
        flow_id: Optional[str],
        tc_graph: Optional[TCGraph],
        feature_id: Optional[str] = None,
    ) -> None:
        """Send a Slack notification when graph generation succeeds."""
        if not self.notification_service:
            orionis_log("Skipping Slack notification; NotificationService unavailable.")
            return

        try:
            product = self.product_datastore.get_product_from_id(product_id)
            product_name = product.product_name
        except Exception as e:
            orionis_log(f"Failed to fetch product name for notification: {str(e)}", e)
            product_name = "Unknown Product"

        nodes_count = len(tc_graph.nodes) if tc_graph else 0
        edges_count = len(tc_graph.edges) if tc_graph else 0
        link_to_flow = (
            f"{Constants.DOMAIN}/{product_id}?showFlows=true&featureId={feature_id}&flow_id={flow_id}"
            if flow_id
            else f"{Constants.DOMAIN}/{product_id}?showFlows=true&featureId={feature_id}"
        )

        message = (
            "✅ Graph Generation Successful!\n"
            "A new graph and flow have been generated from the execution video.\n\n"
            f"🔹 Product Name: `{product_name}`\n"
            f"🆔 Request ID: `{request_id}`\n"
            f"🧩 Nodes Generated: `{nodes_count}`\n"
            f"🔗 Edges Generated: `{edges_count}`\n"
            f"📎 Link to the Flow: {link_to_flow}"
        )

        try:
            self.notification_service.notify_slack(
                message, self.notification_service.slack_webhook_url
            )
        except Exception as e:
            orionis_log(
                f"Failed to send Slack notification for graph generation: {str(e)}", e
            )

    def execute_pipeline(
        self,
        video_path: str,
        product_id: str,
        request_id: str,
        video_url: Optional[str] = None,
        user_id: Optional[str] = None,
        feature_id: Optional[str] = None,
        flow_name: Optional[str] = None,
    ) -> Dict:
        """
        Execute the complete Video to Flow pipeline.

        Args:
            video_path: Local path to execution video file (for frame extraction)
            product_id: Product ID for emitting graph changes to collaboration backend
            video_url: GCS URL of the video (for LLM calls). If not provided, uses video_path.
            user_id: Optional user ID for notifications
            feature_id: Optional feature ID to assign to the generated flow
            flow_name: Optional flow name to use for the generated flow

        Returns:
            Dictionary containing:
                - tc_graph: TCGraph object (can be serialized with .dict())
                - screens_count: Number of screens detected
                - interactions_count: Number of interactions detected
                - errors: List of errors encountered during pipeline (pipeline continues on errors)
        """

        llm_video_path = video_url if video_url else video_path
        errors: List[str] = []
        screens: List[Screen] = []
        screen_images = {}
        nodes = []
        segments: List[VideoSegment] = []
        interactions = []
        edges: List[GraphEdge] = []
        tc_graph = None
        flow = {}
        x_offset, y_offset, start_node_num, start_edge_num = 16000, 23000, 0, 0

        orionis_log("=" * 80)
        orionis_log("Starting Video to Flow Pipeline")
        orionis_log(f"Input video (local): {video_path}")
        orionis_log(f"Input video (LLM): {llm_video_path}")
        if product_id and request_id:
            orionis_log(
                f"Product ID: {product_id}, Request ID: {request_id} (will emit graph changes)"
            )
        orionis_log("=" * 80)

        # Stage 0: Calculate Graph Offsets
        orionis_log("\n" + "=" * 80)
        orionis_log("STAGE 0: Calculating Graph Offsets")
        orionis_log("=" * 80)
        try:
            x_offset, y_offset, start_node_num, start_edge_num = (
                self._calculate_graph_offsets(product_id)
            )
            self.graph_builder.initial_x = x_offset
            self.graph_builder.initial_y = y_offset
            orionis_log(
                f"✓ Graph will start at position ({x_offset}, {y_offset}), "
                f"node IDs from {start_node_num}, edge IDs from {start_edge_num}"
            )
        except Exception as e:
            error_msg = f"Stage 0 failed: {str(e)}"
            orionis_log(error_msg, e)
            errors.append(error_msg)

        # Stage 1: Screen Detection (uses GCS URL for LLM)
        orionis_log("\n" + "=" * 80)
        orionis_log("STAGE 1: Screen Detection")
        orionis_log("=" * 80)
        video_fps: float = 30.0  # Default FPS
        try:
            screens, flow_description, detected_fps = (
                self.screen_detector.detect_screens(video_path=llm_video_path)
            )
            if detected_fps:
                video_fps = detected_fps
            orionis_log(
                f"✓ Stage 1 complete - {len(screens)} screens detected (FPS: {video_fps})"
            )
        except Exception as e:
            error_msg = f"Stage 1 (Screen Detection) failed: {str(e)}"
            orionis_log(error_msg, e)
            errors.append(error_msg)

        # Stage 2: Frame Extraction (immediately after screen detection for early node emission)
        orionis_log("\n" + "=" * 80)
        orionis_log("STAGE 2: Frame Extraction")
        orionis_log("=" * 80)
        try:
            if screens:
                screen_images = self.frame_extractor.extract_frames(
                    video_path=video_path, screens=screens, video_fps=video_fps
                )
                successful_extractions = len(
                    [img for img in screen_images.values() if img]
                )
                orionis_log(
                    f"✓ Stage 2 complete - {successful_extractions}/{len(screens)} "
                    f"frames extracted"
                )
            else:
                orionis_log("⚠ Stage 2 skipped - no screens detected")
        except Exception as e:
            error_msg = f"Stage 2 (Frame Extraction) failed: {str(e)}"
            orionis_log(error_msg, e)
            errors.append(error_msg)

        # Stage 2b: Building and Emitting Nodes
        orionis_log("\n" + "=" * 80)
        orionis_log("STAGE 2b: Building and Emitting Nodes")
        orionis_log("=" * 80)
        try:
            if screens:
                nodes = self.graph_builder._build_nodes(
                    screens, screen_images, start_node_num
                )
                orionis_log(
                    f"Built {len(nodes)} nodes at offset ({x_offset}, {y_offset})"
                )

                if product_id:
                    nodes_as_dicts = [node.model_dump() for node in nodes]
                    self._emit_nodes(product_id, nodes_as_dicts)
            else:
                orionis_log("⚠ Stage 2b skipped - no screens detected")
        except Exception as e:
            error_msg = f"Stage 2b (Building Nodes) failed: {str(e)}"
            orionis_log(error_msg, e)
            errors.append(error_msg)

        # Stage 3+4: Pipelined Segment Processing (Video Splicing + Interaction Detection)
        # This combines Stage 3 and Stage 4 with pipelined batch processing:
        # - Segments are spliced IN ORDER within batches
        # - While batch N is analyzed by LLM, batch N+1 is being spliced
        # - Upload + LLM calls happen in parallel within each batch
        orionis_log("\n" + "=" * 80)
        orionis_log(
            f"STAGE 3+4: Pipelined Segment Processing "
            f"(batch_size=4, workers={self.num_workers})"
        )
        orionis_log("=" * 80)

        screen_to_node = {
            screen.id: f"node-exec-{start_node_num + i:04d}"
            for i, screen in enumerate(screens)
        }

        try:
            if screens and len(screens) >= 2:
                # Use pipelined processor for optimized splicing + interaction detection
                pipelined_results = self.pipelined_processor.process_all_pipelined(
                    video_path=video_path,
                    screens=screens,
                    product_id=product_id,
                    request_id=request_id,
                    upload_callback=self._upload_segment_to_gcs,
                )

                # Process results in order to build edges
                for result in pipelined_results:
                    segments.append(result.segment)
                    source_node_id = screen_to_node.get(result.segment.from_screen_id)
                    target_node_id = screen_to_node.get(result.segment.to_screen_id)

                    if result.interaction and source_node_id and target_node_id:
                        edge_id = f"edge-exec-{start_edge_num + len(edges):04d}"
                        edge = self._create_and_emit_edge(
                            source_node_id,
                            target_node_id,
                            result.interaction.interaction_description,
                            edge_id,
                            product_id,
                        )
                        edges.append(edge)
                        interactions.append(result.interaction)
                    elif source_node_id and target_node_id:
                        # Create MISSING INTERACTION edge on failure
                        error_msg = f"Segment {result.index + 1} failed: {result.error}"
                        orionis_log(error_msg)
                        errors.append(error_msg)

                        edge_id = f"edge-exec-{start_edge_num + len(edges):04d}"
                        edge = self._create_and_emit_edge(
                            source_node_id,
                            target_node_id,
                            "MISSING INTERACTION",
                            edge_id,
                            product_id,
                        )
                        edges.append(edge)

                        # Create fallback Interaction object to keep graph connected
                        fallback_interaction = Interaction(
                            from_screen_id=result.segment.from_screen_id,
                            to_screen_id=result.segment.to_screen_id,
                            interaction_description="MISSING INTERACTION",
                            timestamp=result.segment.start_timestamp,
                            observed_results=[
                                f"Interaction detection failed: {result.error}"
                            ],
                        )
                        interactions.append(fallback_interaction)

                orionis_log(
                    f"✓ Stage 3+4 complete - {len(segments)} segments processed, "
                    f"{len(interactions)} interactions detected"
                )
            else:
                orionis_log("⚠ Stage 3+4 skipped - need at least 2 screens")
        except Exception as e:
            error_msg = f"Stage 3+4 (Pipelined Processing) failed: {str(e)}"
            orionis_log(error_msg, e)
            errors.append(error_msg)

        # Stage 5: Create TC graph from already built nodes and edges
        orionis_log("\n" + "=" * 80)
        orionis_log("STAGE 5: Finalizing Graph")
        orionis_log("=" * 80)
        try:
            tc_graph = TCGraph(nodes=nodes, edges=edges)
            tc_graph.validate_no_orphan_nodes()
            orionis_log(
                f"✓ Stage 5 complete - Graph built with {len(tc_graph.nodes)} nodes, "
                f"{len(tc_graph.edges)} edges"
            )
        except Exception as e:
            error_msg = f"Stage 5 (Finalizing Graph) failed: {str(e)}"
            orionis_log(error_msg, e)
            errors.append(error_msg)
            tc_graph = TCGraph(nodes=nodes, edges=edges)

        # Stage 5b: Linear Graph Validation (Audit Only)
        orionis_log("\n" + "=" * 80)
        orionis_log("STAGE 5b: Linear Graph Validation (Audit Only)")
        orionis_log("=" * 80)
        try:
            self._audit_linear_graph(screens, interactions)
            orionis_log("✓ Stage 5b complete - Linear graph audit finished")
        except Exception as e:
            error_msg = f"Stage 5b (Linear Graph Validation) failed: {str(e)}"
            orionis_log(error_msg, e)
            errors.append(error_msg)

        # Stage 6: Generate and emit flow
        orionis_log("\n" + "=" * 80)
        orionis_log("STAGE 6: Flow Generation and Emission")
        orionis_log("=" * 80)
        try:
            flow = self._generate_flow_from_graph(
                tc_graph,
                video_url=video_url,
                flow_description=flow_description,
                feature_id=feature_id,
                flow_name=flow_name,
                product_id=product_id,
            )
            if product_id:
                self._emit_flow(product_id, flow)
            orionis_log("✓ Stage 6 complete - Flow generated and emitted")
        except Exception as e:
            error_msg = f"Stage 6 (Flow Generation) failed: {str(e)}"
            orionis_log(error_msg, e)
            errors.append(error_msg)

        # Stage 7: Merge Graph Intelligently
        # HOTFIX: Disabled flow_recommendations integration
        orionis_log("\n" + "=" * 80)
        orionis_log("STAGE 7: Graph Merge (DISABLED - hotfix)")
        orionis_log("=" * 80)
        orionis_log("⚠ Flow recommendations disabled - skipping Stage 7")
        # time.sleep(15)
        # try:
        #     if flow and flow.get("id"):
        #         # 1. Fetch existing graph/flows
        #         # 1. Fetch existing graph/flows
        #         existing_graph_path = f"gs://{self.merge_service.bucket_name}/qai-upload-temporary/productId_{product_id}/graph-export.json"
        #         existing_flows_path = f"gs://{self.merge_service.bucket_name}/qai-upload-temporary/productId_{product_id}/flows-export.json"
        #         existing_flows = self.merge_service.download_knowledge_flows(product_id)
        #
        #         if not isinstance(existing_flows, list):
        #             existing_flows = []
        #
        #         existing_flow_ids = [f["id"] for f in existing_flows if f.get("id")]
        #         new_flow_id = flow["id"]
        #
        #         combined_flows = existing_flows + [flow]
        #
        #         # 3. Save to temp files
        #         with tempfile.NamedTemporaryFile(
        #             mode="w", suffix=".json", delete=False
        #         ) as tf_flows:
        #             json.dump(combined_flows, tf_flows)
        #             temp_flows_path = tf_flows.name
        #
        #         orionis_log(f"Created temp combined files: {temp_flows_path}")
        #
        #         # 4. Trigger Recommendation
        #         trigger_flow_recommendations(
        #             graph_file_path=existing_graph_path,
        #             flow_file_path=existing_flows_path,
        #             old_flow_ids=existing_flow_ids,
        #             new_flow_ids=[new_flow_id],
        #             product_id=product_id,
        #         )
        #
        #         # Cleanup temp files
        #         os.remove(temp_flows_path)
        #
        #     orionis_log("✓ Stage 7 complete - Graph merged intelligently")
        # except Exception as e:
        #     error_msg = f"Stage 7 (Graph Merge) failed: {str(e)}"
        #     orionis_log(error_msg, e)
        #     errors.append(error_msg)

        # Cleanup: Remove temporary video segments
        orionis_log("\n" + "Cleaning up temporary files...")
        try:
            if segments:
                self.video_splicer.cleanup_segments(segments)
        except Exception as e:
            orionis_log(f"Cleanup failed: {str(e)}", e)

        # Pipeline complete
        orionis_log("\n" + "=" * 80)
        if errors:
            orionis_log(f"VIDEO TO FLOW PIPELINE COMPLETE WITH {len(errors)} ERROR(S)")
        else:
            orionis_log("VIDEO TO FLOW PIPELINE COMPLETE ✓")
        orionis_log("=" * 80)
        orionis_log("Final Results:")
        orionis_log(f"  - Screens: {len(screens)}")
        orionis_log(f"  - Interactions: {len(interactions)}")
        orionis_log(f"  - Graph Nodes: {len(tc_graph.nodes) if tc_graph else 0}")
        orionis_log(f"  - Graph Edges: {len(tc_graph.edges) if tc_graph else 0}")
        orionis_log(f"  - Flow ID: {flow.get('id', 'N/A')}")
        if errors:
            orionis_log(f"  - Errors: {len(errors)}")
            for err in errors:
                orionis_log(f"    ⚠ {err}")
        orionis_log("=" * 80)

        if config.environment == Config.PRODUCTION and user_id:
            is_external_user = self.user_service.is_external_user(user_id)
            flow_id = flow.get("id") if flow else None
            if is_external_user and flow_id and tc_graph:
                self._notify_generation(
                    product_id, request_id, flow_id, tc_graph, feature_id
                )
            else:
                orionis_log(
                    f"Skipping Slack notification for graph generation - "
                    f"internal user or missing data for product: {product_id}"
                )
        else:
            orionis_log(
                f"Skipping Slack notification for graph generation in "
                f"non-production environment or missing user_id for product: {product_id}"
            )
        try:
            orionis_log("[MIXPANEL] Tracking video-to-flow generation")

            # Only track if the graph and flow were created successfully
            if tc_graph and flow:
                properties = {
                    "product_id": product_id,
                    "request_id": request_id,
                    "screens_count": len(screens),
                    "nodes_count": len(tc_graph.nodes) if tc_graph else 0,
                    "interactions_count": len(interactions),
                    "edges_count": len(tc_graph.edges) if tc_graph else 0,
                    "flow_id": flow.get("id", "N/A"),
                    "errors_count": len(errors),
                    "success": len(errors) == 0,
                }

                # Track the event
                tracking_result = mixpanel.track(
                    user_id, "Video to Flow Generated", properties
                )

                if tracking_result:
                    orionis_log(
                        "[MIXPANEL] Successfully tracked video-to-flow generation"
                    )
                else:
                    orionis_log("[MIXPANEL] Failed to track video-to-flow generation")

        except Exception as tracking_error:
            orionis_log(
                f"[MIXPANEL] Error tracking video-to-flow generation: {str(tracking_error)}"
            )

        return {
            "tc_graph": tc_graph,
            "flow": flow,
            "screens_count": len(screens),
            "interactions_count": len(interactions),
            "errors": errors,
        }

    def execute_pipeline_and_export(
        self,
        video_path: str,
        output_path: str,
        product_id: str,
        request_id: str,
        video_url: Optional[str] = None,
    ) -> str:
        """
        Execute pipeline and export graph to JSON file.

        Args:
            video_path: Local path to execution video
            output_path: Path where to save the graph JSON
            product_id: Product ID for emitting graph changes
            video_url: Optional GCS URL for LLM calls

        Returns:
            Path to the saved graph file

        Raises:
            VideoToFlowError: If pipeline or export fails
        """
        import json

        # Execute pipeline
        result = self.execute_pipeline(
            video_path=video_path,
            product_id=product_id,
            request_id=request_id,
            video_url=video_url,
        )
        tc_graph: TCGraph = result["tc_graph"]

        # Export to JSON
        orionis_log(f"\nExporting graph to: {output_path}")

        try:
            graph_dict = tc_graph.model_dump()

            with open(output_path, "w") as f:
                json.dump(graph_dict, f, indent=2)

            orionis_log(f"✓ Graph exported successfully to {output_path}")

            return output_path

        except Exception as e:
            error_msg = f"Graph export failed: {str(e)}"
            orionis_log(error_msg, e)
            raise VideoToFlowError(error_msg) from e
