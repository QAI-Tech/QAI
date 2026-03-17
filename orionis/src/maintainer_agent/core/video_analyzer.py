"""
Video Analyzer Module
Processes execution videos using Gemini AI to identify UI screens and user interactions
Leverages advanced video understanding capabilities for comprehensive test case extraction
"""

import json
from typing import Dict, Optional
from utils.util import orionis_log
from llm_model import LLMModelWrapper


class VideoAnalyzer:
    """
    Intelligent video processing engine for mobile app execution analysis.
    Extracts UI states and interaction patterns using Gemini's vision capabilities.
    """

    def __init__(self, llm_model: Optional[LLMModelWrapper] = None):
        """Initialize the analyzer with LLM model"""
        self.llm_model = llm_model or LLMModelWrapper()

    def analyze_video(self, video_url: str) -> Dict:
        """
        Process execution video to extract UI components and user interaction sequences

        Args:
            video_url: GCS URL to the mobile app execution recording (e.g., https://storage.googleapis.com/...)

        Returns:
            Dictionary containing:
                - screens: List of identified UI states with metadata
                - interactions: Chronological sequence of user actions

        Raises:
            RuntimeError: If video analysis or parsing fails
        """
        orionis_log(f"Initiating video analysis for video URL: {video_url}")

        # Load AI analysis instructions
        from maintainer_agent.prompts.video_analysis_prompts import (
            TRANSCRIBE_SCREENS_AND_INTERACTIONS_PROMPT,
        )

        # Define response schema matching the prompt's expected format
        video_analysis_schema = {
            "type": "object",
            "properties": {
                "screens": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "title": {"type": "string"},
                            "description": {"type": "string"},
                            "first_appearance_timestamp": {"type": "string"},
                            "all_appearances": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                        },
                        "required": [
                            "id",
                            "title",
                            "description",
                            "first_appearance_timestamp",
                            "all_appearances",
                        ],
                    },
                },
                "interactions": {
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
                        },
                        "required": [
                            "from_screen_id",
                            "to_screen_id",
                            "interaction_description",
                            "timestamp",
                            "observed_results",
                        ],
                    },
                },
            },
            "required": ["screens", "interactions"],
        }

        orionis_log("Analyzing video content with Gemini AI via LLMModelWrapper...")

        try:
            response_text = self.llm_model.call_llm_v3(
                prompt=TRANSCRIBE_SCREENS_AND_INTERACTIONS_PROMPT,
                video_urls=[video_url],
                response_schema=video_analysis_schema,
            )

            analysis_data = json.loads(response_text)

            # Validate response contains required fields
            if not analysis_data.get("screens") and not analysis_data.get(
                "interactions"
            ):
                raise RuntimeError("Video analysis returned no screens or interactions")

            screen_count = len(analysis_data.get("screens", []))
            interaction_count = len(analysis_data.get("interactions", []))

            orionis_log(
                f"Video analysis complete - Screens: {screen_count}, Interactions: {interaction_count}"
            )

            return analysis_data

        except json.JSONDecodeError as e:
            raise RuntimeError(f"Failed to parse Gemini API response as JSON: {e}")
        except Exception as e:
            raise RuntimeError(f"Video analysis failed: {str(e)}")
