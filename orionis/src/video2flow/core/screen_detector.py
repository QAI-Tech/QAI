import json
from typing import List, Tuple, Optional
from pydantic import ValidationError

from video2flow.models.screen import Screen
from video2flow.prompts.screen_detection_prompts import SCREEN_DETECTION_PROMPT
from utils.util import orionis_log
from llm_model import LLMModelWrapper

# Default FPS if not provided by LLM
DEFAULT_VIDEO_FPS = 30.0


class ScreenDetectionError(Exception):
    """Raised when screen detection fails"""

    pass


class ScreenDetectionResult:
    """Result of screen detection including screens, flow description, and video FPS."""

    def __init__(
        self,
        screens: List[Screen],
        flow_description: str,
        video_fps: float = DEFAULT_VIDEO_FPS,
    ):
        self.screens = screens
        self.flow_description = flow_description
        self.video_fps = video_fps


class ScreenDetector:
    """
    Detects all unique screen appearances in an execution video.

    This component performs Stage 1 of the Video to Flow pipeline:
    analyzing the full video with LLM to identify every screen that appears,
    treating each appearance as unique even if the UI looks identical.

    Key Principle:
        Each screen appearance is UNIQUE in the temporal flow.
        Example: App Open → Settings → Home → Settings (again)
        Creates 4 screens, NOT 3 with a cycle back to Settings.

    Attributes:
        llm_model: LLMModelWrapper instance for video analysis
    """

    def __init__(self, llm_model: Optional[LLMModelWrapper] = None):
        """
        Initialize the ScreenDetector

        Args:
            llm_model: LLMModelWrapper instance for video analysis.
                       If not provided, creates a new one.
        """
        self.llm_model = llm_model or LLMModelWrapper()

    def detect_screens(
        self, video_path: str
    ) -> Tuple[List[Screen], str, Optional[float]]:
        """
        Analyze video and detect all screen appearances in temporal order.

        Args:
            video_path: Local path to the execution video

        Returns:
            Tuple of (screens, flow_description, video_fps)
            - screens: List of Screen objects in temporal order
            - flow_description: High-level description of the flow
            - video_fps: FPS used for timestamp frame numbers (None if not provided)

        Raises:
            ScreenDetectionError: If detection fails or returns invalid data
            ValidationError: If LLM response doesn't match expected schema
        """
        orionis_log(f"Stage 1: Starting screen detection for video: {video_path}")

        # Define JSON schema for Gemini response validation
        # Now includes video_fps for precise timestamp handling
        screen_detection_schema = {
            "type": "object",
            "properties": {
                "video_fps": {
                    "type": "number",
                    "description": "Frames per second used for analyzing the video",
                },
                "screens": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "title": {"type": "string"},
                            "description": {"type": "string"},
                            "appearance_timestamp": {"type": "string"},
                        },
                        "required": [
                            "id",
                            "title",
                            "description",
                            "appearance_timestamp",
                        ],
                    },
                },
                "flow_description": {
                    "type": "string",
                    "description": (
                        "A high-level textual description of the overall user flow, "
                        "explaining how the user transitions between screens and the "
                        "purpose of the flow."
                    ),
                },
            },
            "required": ["screens", "flow_description"],
        }

        try:
            # Call Gemini with video for analysis
            orionis_log("Calling Gemini to analyze video and detect screens...")
            response_text = self.llm_model.call_llm_v3(
                prompt=SCREEN_DETECTION_PROMPT,
                video_urls=[video_path],
                response_schema=screen_detection_schema,
            )

            # Parse JSON response
            response_data = json.loads(response_text)
            screens_data = response_data.get("screens", [])
            flow_description = response_data.get("flow_description", "")
            video_fps = response_data.get("video_fps")

            if video_fps:
                orionis_log(f"LLM reported video FPS: {video_fps}")
            else:
                orionis_log(
                    f"LLM did not provide video FPS, will use default: {DEFAULT_VIDEO_FPS}"
                )

            if not screens_data:
                raise ScreenDetectionError("LLM returned no screens in the video")

            orionis_log(f"Gemini detected {len(screens_data)} screens in the video")

            # Convert to Screen objects with validation
            screens = self._parse_and_validate_screens(screens_data)

            # Validate temporal ordering (using video_fps for precise comparison)
            self._validate_temporal_ordering(screens, video_fps)

            # Validate no duplicate IDs
            self._validate_no_duplicate_ids(screens)

            orionis_log(
                f"Screen detection complete - {len(screens)} unique screens identified"
            )
            self._log_screen_summary(screens, flow_description, video_fps)

            return screens, flow_description, video_fps

        except json.JSONDecodeError as e:
            error_msg = f"Failed to parse Gemini response as JSON: {e}"
            orionis_log(error_msg, e)
            raise ScreenDetectionError(error_msg) from e

        except ValidationError as e:
            error_msg = f"Screen data validation failed: {e}"
            orionis_log(error_msg, e)
            raise ScreenDetectionError(error_msg) from e

        except Exception as e:
            error_msg = f"Screen detection failed: {str(e)}"
            orionis_log(error_msg, e)
            raise ScreenDetectionError(error_msg) from e

    def _parse_and_validate_screens(self, screens_data: List[dict]) -> List[Screen]:
        """
        Parse screen data from LLM and validate using Pydantic models.

        Args:
            screens_data: List of screen dictionaries from LLM

        Returns:
            List of validated Screen objects

        Raises:
            ValidationError: If any screen fails validation
        """
        screens = []
        for i, screen_dict in enumerate(screens_data):
            try:
                screen = Screen(**screen_dict)
                screens.append(screen)
            except ValidationError as e:
                orionis_log(f"Validation failed for screen {i + 1}: {screen_dict}", e)
                raise ValidationError(f"Screen {i + 1} validation failed") from e

        return screens

    def _validate_temporal_ordering(
        self, screens: List[Screen], video_fps: Optional[float] = None
    ) -> None:
        """
        Validate that screens are in strictly ascending temporal order.

        Args:
            screens: List of Screen objects
            video_fps: Video FPS for precise timestamp comparison

        Raises:
            ScreenDetectionError: If timestamps are not in ascending order
        """
        fps = video_fps or DEFAULT_VIDEO_FPS

        for i in range(len(screens) - 1):
            # Use precise timestamps if available
            current_time = screens[i].get_precise_timestamp_seconds(fps)
            next_time = screens[i + 1].get_precise_timestamp_seconds(fps)

            if next_time <= current_time:
                raise ScreenDetectionError(
                    f"Temporal ordering violation: Screen {screens[i].id} "
                    f"({screens[i].appearance_timestamp}) appears at or after "
                    f"screen {screens[i + 1].id} ({screens[i + 1].appearance_timestamp}). "
                    f"Screens must be in strictly ascending temporal order."
                )

    def _validate_no_duplicate_ids(self, screens: List[Screen]) -> None:
        """
        Validate that all screen IDs are unique.

        Args:
            screens: List of Screen objects

        Raises:
            ScreenDetectionError: If duplicate IDs are found
        """
        screen_ids = [screen.id for screen in screens]
        unique_ids = set(screen_ids)

        if len(screen_ids) != len(unique_ids):
            duplicates = [id for id in screen_ids if screen_ids.count(id) > 1]
            raise ScreenDetectionError(
                f"Duplicate screen IDs detected: {set(duplicates)}. "
                f"Each screen appearance must have a unique ID."
            )

    def _log_screen_summary(
        self,
        screens: List[Screen],
        flow_description: str,
        video_fps: Optional[float] = None,
    ) -> None:
        """
        Log a summary of detected screens for debugging.

        Args:
            screens: List of detected screens
            flow_description: High-level flow description
            video_fps: Video FPS for timestamp display
        """
        fps = video_fps or DEFAULT_VIDEO_FPS
        orionis_log(f"Detected screens summary (FPS: {fps}):")
        for screen in screens:
            precise_time = screen.get_precise_timestamp_seconds(fps)
            frame_num = screen.get_frame_number(fps)
            orionis_log(
                f"  - {screen.id}: '{screen.title}' at {screen.appearance_timestamp} "
                f"({precise_time:.3f}s, frame {frame_num})"
            )

        orionis_log(f"Flow description: {flow_description}")
