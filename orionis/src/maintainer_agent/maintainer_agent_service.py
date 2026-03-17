#!/usr/bin/env python3
"""
Maintainer Agent Service
End-to-end automated generation of test case graphs from mobile execution videos
"""

from typing import Dict, Optional
import os
from config import config
from utils.util import orionis_log, url_to_uri
from maintainer_agent.core.video_analyzer import VideoAnalyzer
from maintainer_agent.core.tc_graph_generator import TCGraphGenerator
from maintainer_agent.core.frame_extractor import FrameExtractor
from maintainer_agent.graph_merge_service import GraphMergeService
from common.google_cloud_wrappers import GCPFileStorageWrapper
from video2flow.v2f_service import VideoToFlowService
from llm_model import LLMModelWrapper


class MaintainerAgentService:
    """
    Service class for running the Maintainer Agent pipeline.
    Processes execution videos and generates test case graphs and flows.
    """

    def __init__(self):
        """Initialize the Maintainer Agent Service"""
        self.video_analyzer = VideoAnalyzer()
        self.frame_extractor = FrameExtractor()
        self.graph_builder = TCGraphGenerator()
        self.merge_service = GraphMergeService()
        self.storage_client = GCPFileStorageWrapper()
        self.v2f_service = VideoToFlowService(llm_model=LLMModelWrapper())

    def _validate_inputs(self, video_url: str, product_id: str) -> None:
        """
        Validate input parameters

        Args:
            video_url: GCS URL to execution video
            product_id: Product ID to merge graph into

        Raises:
            ValueError: If inputs are invalid
        """
        if not video_url or not product_id:
            raise ValueError("video_url and product_id are required")

    def _analyze_video(self, video_url: str) -> Dict:
        """
        Stage 1: AI-powered video analysis

        Args:
            video_url: GCS URL to execution video

        Returns:
            Extracted data containing screens and interactions

        Raises:
            RuntimeError: If video analysis fails
        """
        orionis_log("Stage 1: Starting AI-powered video processing")
        extracted_data = self.video_analyzer.analyze_video(video_url)

        if not extracted_data:
            raise RuntimeError("Failed to analyze video - no data extracted")

        orionis_log(
            f"Video analysis complete - "
            f"Screens: {len(extracted_data.get('screens', []))}, "
            f"Interactions: {len(extracted_data.get('interactions', []))}"
        )

        return extracted_data

    def _extract_frames(self, video_path: str, screens: list) -> Dict[str, str]:
        """
        Stage 2: Frame extraction from video

        Args:
            video_path: Path to execution video
            screens: List of screen dictionaries with timestamps

        Returns:
            Dictionary mapping screen_id to base64 encoded image
        """
        orionis_log("Stage 2: Starting frame extraction")
        screen_images = self.frame_extractor.extract_frames_for_screens(
            video_path=video_path, screens=screens
        )
        orionis_log(f"Extracted {len(screen_images)} screen frames")
        return screen_images

    def _generate_test_case_graph(
        self, screens: list, interactions: list, screen_images: Dict[str, str]
    ) -> Dict:
        """
        Stage 3: Generate test case graph structure

        Args:
            screens: List of screen dictionaries
            interactions: List of interaction dictionaries
            screen_images: Dictionary of screen images

        Returns:
            Test case graph dictionary

        Raises:
            RuntimeError: If graph generation fails
        """
        orionis_log("Stage 3: Starting graph structure construction")
        test_case_graph = self.graph_builder.generate_tc_graph(
            screens=screens, interactions=interactions, screen_images=screen_images
        )

        if not test_case_graph:
            raise RuntimeError("Failed to generate test case graph")

        orionis_log(
            f"Graph generated - "
            f"Nodes: {len(test_case_graph.get('nodes', []))}, "
            f"Edges: {len(test_case_graph.get('edges', []))}"
        )

        return test_case_graph

    def _generate_flow_metadata(self, test_case_graph: Dict, video_url: str) -> Dict:
        """
        Stage 4: Generate flow metadata from test case graph

        Args:
            test_case_graph: Generated test case graph

        Returns:
            Flow metadata dictionary

        Raises:
            RuntimeError: If flow generation fails
        """
        orionis_log("Stage 4: Starting flow metadata extraction")
        flow_metadata = self.graph_builder.generate_flow_json(
            tc_graph=test_case_graph, video_url=video_url
        )

        if not flow_metadata:
            raise RuntimeError("Failed to generate flow metadata")

        orionis_log("Flow metadata generated successfully")
        return flow_metadata

    def _save_to_gcs(
        self,
        product_id: str,
        request_id: str,
        test_case_graph: Dict,
        flow_metadata: Dict,
    ) -> None:
        """
        Stage 5: Save graph and flow to GCS

        Args:
            product_id: Product ID
            request_id: Planning request ID
            test_case_graph: Generated test case graph
            flow_metadata: Generated flow metadata

        Raises:
            RuntimeError: If save fails
        """
        orionis_log("Stage 5: Saving graph and flow to GCS")
        save_success = self.merge_service.merge_and_upload_execution_graph(
            product_id=product_id,
            request_id=request_id,
            new_tc_graph=test_case_graph,
            new_flow=flow_metadata,
        )

        if not save_success:
            raise RuntimeError("Failed to save graph/flows to GCS")

        orionis_log("Successfully saved graph and flow to GCS")

    def execute_pipeline(
        self,
        video_url: str,
        product_id: str,
        request_id: str,
        user_id: Optional[str] = None,
        feature_id: Optional[str] = None,
        flow_name: Optional[str] = None,
    ) -> Dict:
        """
        Execute the complete Maintainer Agent pipeline

        Args:
            video_url: GCS URL to execution video file
            product_id: Product ID
            request_id: Planning request ID
            user_id: Optional user ID for notifications
            feature_id: Optional feature ID to assign to the generated flow
            flow_name: Optional flow name to use for the generated flow

        Returns:
            Dictionary containing flow_json and tc_graph_json

        Raises:
            ValueError: If inputs are invalid
            RuntimeError: If any pipeline stage fails
        """
        orionis_log(
            f"Starting Maintainer Agent pipeline - "
            f"video: {video_url}, product: {product_id}, request: {request_id}"
        )

        # Validate inputs (will raise exception if invalid)
        self._validate_inputs(video_url, product_id)

        if config.enable_new_video_to_flow:
            orionis_log(
                "Screen timestamp flow enabled – using VideoToFlowService pipeline."
            )
            # Download video locally for V2F pipeline (needed for frame extraction & video splicing)
            video_uri = url_to_uri(video_url)
            video_local_path = self.storage_client.download_file_locally(
                uri=video_uri,
                generation=None,
                use_constructed_bucket_name=False,
            )
            orionis_log(f"Video downloaded to: {video_local_path}")

            try:
                # Execute V2F pipeline with product_id for real-time emission
                v2f_result = self.v2f_service.execute_pipeline(
                    video_path=video_local_path,
                    product_id=product_id,
                    request_id=request_id,
                    video_url=video_url,
                    user_id=user_id,
                    feature_id=feature_id,
                    flow_name=flow_name,
                )
                tc_graph = v2f_result["tc_graph"]
                flow = v2f_result.get("flow", {})

                orionis_log(
                    f"V2F pipeline complete - "
                    f"Screens: {v2f_result['screens_count']}, "
                    f"Interactions: {v2f_result['interactions_count']}, "
                    f"Flow: {flow.get('id', 'N/A')}"
                )

                return {
                    "flow_json": flow,
                    "tc_graph_json": tc_graph.model_dump(),
                }
            except Exception as e:
                orionis_log(f"Failed to execute V2F pipeline: {e}", e)
                raise e
            finally:
                if video_local_path and os.path.exists(video_local_path):
                    try:
                        os.remove(video_local_path)
                        orionis_log(f"Cleaned up local video file: {video_local_path}")
                    except Exception as cleanup_err:
                        orionis_log(
                            f"Failed to cleanup local video: {cleanup_err}", cleanup_err
                        )

        # Stage 1: AI Video Processing (uses video URL directly with Vertex AI)
        extracted_data = self._analyze_video(video_url)

        # Download video locally for frame extraction (FrameExtractor needs local file)
        orionis_log("Downloading video locally for frame extraction...")
        video_uri = url_to_uri(video_url)
        video_local_path = self.storage_client.download_file_locally(
            uri=video_uri,
            generation=None,
            use_constructed_bucket_name=False,
        )
        orionis_log(f"Video downloaded to: {video_local_path}")

        # Stage 2: Frame Extraction
        screen_images = self._extract_frames(
            video_path=video_local_path, screens=extracted_data.get("screens", [])
        )

        # Stage 3: Graph Construction
        test_case_graph = self._generate_test_case_graph(
            screens=extracted_data.get("screens", []),
            interactions=extracted_data.get("interactions", []),
            screen_images=screen_images,
        )

        # Stage 4: Flow Metadata Extraction
        flow_metadata = self._generate_flow_metadata(test_case_graph, video_url)

        # Stage 5: Save to GCS
        self._save_to_gcs(product_id, request_id, test_case_graph, flow_metadata)

        # Stage 6: Combined Artifact Generation
        orionis_log("Stage 6: Generating combined artifacts")
        unified_output = {
            "flow_json": flow_metadata,
            "tc_graph_json": test_case_graph,
        }

        # Log execution statistics
        orionis_log(
            f"Pipeline execution completed - "
            f"Screens: {len(extracted_data.get('screens', []))}, "
            f"Interactions: {len(extracted_data.get('interactions', []))}, "
            f"Nodes: {len(test_case_graph.get('nodes', []))}, "
            f"Edges: {len(test_case_graph.get('edges', []))}"
        )

        return unified_output
