import json
from typing import List, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
from pydantic import ValidationError
from video2flow.models.screen import Screen
from video2flow.models.interaction import Interaction
from video2flow.models.video_segment import VideoSegment
from video2flow.prompts.interaction_detection_prompts import (
    INTERACTION_DETECTION_PROMPT,
)
from utils.util import orionis_log
from llm_model import LLMModelWrapper


class InteractionDetectionError(Exception):
    """Raised when interaction detection fails"""

    pass


class InteractionDetector:
    """
    Detects user interactions that cause screen transitions.

    This component performs Stage 3 of the Video to Flow pipeline:
    analyzing each video segment (screen[i] → screen[i+1]) to identify
    the specific user action that caused the transition.

    Attributes:
        llm_model: LLMModelWrapper instance for video analysis
    """

    def __init__(
        self, llm_model: Optional[LLMModelWrapper] = None, num_workers: int = 4
    ):
        """
        Initialize the InteractionDetector.

        Args:
            llm_model: LLMModelWrapper instance for video analysis.
                       If not provided, creates a new one.
            num_workers: Number of parallel workers for batch detection.
        """
        self.llm_model = llm_model or LLMModelWrapper()
        self.num_workers = num_workers

    def detect_interactions(
        self,
        segments: List[VideoSegment],
        screens: List[Screen],
    ) -> List[Interaction]:
        """
        Analyze all video segments to detect interactions.

        Args:
            segments: List of video segments to analyze
            screens: List of screens (for context in prompts)

        Returns:
            List of Interaction objects in temporal order

        Raises:
            InteractionDetectionError: If interaction detection fails
        """
        if not segments:
            raise InteractionDetectionError("No video segments provided for analysis")

        orionis_log(
            f"Stage 3: Starting interaction detection for {len(segments)} segments"
        )

        interactions = []

        for i, segment in enumerate(segments):
            orionis_log(
                f"Analyzing segment {i + 1}/{len(segments)}: "
                f"{segment.from_screen_id} → {segment.to_screen_id}"
            )

            try:
                interaction = self._detect_single_interaction(
                    segment=segment,
                    screens=screens,
                )
                interactions.append(interaction)

                orionis_log(
                    f"  Detected interaction: {interaction.interaction_description}"
                )

            except Exception as e:
                error_msg = (
                    f"Failed to detect interaction for segment {segment.from_screen_id} → "
                    f"{segment.to_screen_id}: {str(e)}"
                )
                orionis_log(error_msg, e)
                raise InteractionDetectionError(error_msg) from e

        orionis_log(
            f"Interaction detection complete - {len(interactions)} interactions identified"
        )
        self._log_interaction_summary(interactions)

        return interactions

    def detect_interactions_parallel(
        self,
        segments: List[VideoSegment],
        screens: List[Screen],
    ) -> List[Interaction]:
        """
        Analyze all video segments in parallel to detect interactions.

        This is faster than sequential detection because multiple LLM calls
        are made concurrently.

        Args:
            segments: List of video segments to analyze
            screens: List of screens (for context in prompts)

        Returns:
            List of Interaction objects in temporal order

        Raises:
            InteractionDetectionError: If interaction detection fails
        """
        if not segments:
            raise InteractionDetectionError("No video segments provided for analysis")

        orionis_log(
            f"Stage 4: Starting parallel interaction detection for {len(segments)} segments "
            f"({self.num_workers} workers)"
        )

        # Results indexed by segment position to maintain order
        results: dict[int, Tuple[Optional[Interaction], Optional[str]]] = {}

        with ThreadPoolExecutor(max_workers=self.num_workers) as executor:
            # Submit all detection tasks
            futures = {
                executor.submit(
                    self._detect_single_interaction_safe,
                    segment,
                    screens,
                ): i
                for i, segment in enumerate(segments)
            }

            # Collect results as they complete
            for future in as_completed(futures):
                idx = futures[future]
                segment = segments[idx]
                try:
                    interaction, error = future.result()
                    results[idx] = (interaction, error)

                    if interaction:
                        orionis_log(
                            f"  ✓ Segment {idx + 1}/{len(segments)} "
                            f"({segment.from_screen_id} → {segment.to_screen_id}): "
                            f"{interaction.interaction_description}"
                        )
                    else:
                        orionis_log(
                            f"  ✗ Segment {idx + 1}/{len(segments)} failed: {error}"
                        )
                except Exception as e:
                    results[idx] = (None, str(e))
                    orionis_log(f"  ✗ Segment {idx + 1}/{len(segments)} exception: {e}")

        # Collect results in order and check for failures
        interactions = []
        for i in range(len(segments)):
            interaction, error = results.get(i, (None, "No result"))
            if interaction is None:
                raise InteractionDetectionError(
                    f"Failed to detect interaction for segment {i + 1}: {error}"
                )
            interactions.append(interaction)

        orionis_log(
            f"Parallel interaction detection complete - {len(interactions)} interactions identified"
        )
        self._log_interaction_summary(interactions)

        return interactions

    def _detect_single_interaction_safe(
        self,
        segment: VideoSegment,
        screens: List[Screen],
    ) -> Tuple[Optional[Interaction], Optional[str]]:
        """
        Detect interaction for a single video segment with error handling.

        Returns tuple of (interaction, error) - one will be None.

        Args:
            segment: Video segment to analyze
            screens: List of all screens (for finding context)

        Returns:
            Tuple of (Interaction, None) on success or (None, error_message) on failure
        """
        try:
            interaction = self._detect_single_interaction(segment, screens)
            return (interaction, None)
        except Exception as e:
            return (None, str(e))

    def _detect_single_interaction(
        self,
        segment: VideoSegment,
        screens: List[Screen],
    ) -> Interaction:
        """
        Detect interaction for a single video segment.

        Args:
            segment: Video segment to analyze
            screens: List of all screens (for finding context)

        Returns:
            Interaction object

        Raises:
            InteractionDetectionError: If detection fails
        """
        # Find the from and to screens
        from_screen = next((s for s in screens if s.id == segment.from_screen_id), None)
        to_screen = next((s for s in screens if s.id == segment.to_screen_id), None)

        if not from_screen or not to_screen:
            raise InteractionDetectionError(
                f"Could not find screen data for segment: "
                f"{segment.from_screen_id} → {segment.to_screen_id}"
            )

        # Generate prompt with screen context
        prompt = INTERACTION_DETECTION_PROMPT.format(
            from_screen_id=from_screen.id,
            from_screen_title=from_screen.title,
            from_screen_description=from_screen.description,
            from_screen_timestamp=from_screen.appearance_timestamp,
            to_screen_id=to_screen.id,
            to_screen_title=to_screen.title,
            to_screen_description=to_screen.description,
            to_screen_timestamp=to_screen.appearance_timestamp,
        )

        # Define JSON schema for Gemini validation
        interaction_schema = {
            "type": "object",
            "properties": {
                "interaction": {
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
                }
            },
            "required": ["interaction"],
        }

        try:
            # Call Gemini with segment video
            orionis_log(
                f"  Calling Gemini to analyze segment video: {segment.segment_file_path}"
            )
            response_text = self.llm_model.call_llm_v3(
                prompt=prompt,
                video_urls=(
                    [segment.segment_file_path] if segment.segment_file_path else []
                ),
                response_schema=interaction_schema,
            )

            # Parse response
            response_data = json.loads(response_text)
            interaction_data = response_data.get("interaction")

            if not interaction_data:
                raise InteractionDetectionError("LLM returned no interaction data")

            if interaction_data.get("from_screen_id") != segment.from_screen_id:
                orionis_log(
                    f"  WARNING: Gemini returned from_screen_id '{interaction_data.get('from_screen_id')}' "
                    f"but expected '{segment.from_screen_id}'. Correcting..."
                )
                interaction_data["from_screen_id"] = segment.from_screen_id

            if interaction_data.get("to_screen_id") != segment.to_screen_id:
                orionis_log(
                    f"  WARNING: Gemini returned to_screen_id '{interaction_data.get('to_screen_id')}' "
                    f"but expected '{segment.to_screen_id}'. Correcting..."
                )
                interaction_data["to_screen_id"] = segment.to_screen_id

            interaction = Interaction(**interaction_data)

            return interaction

        except json.JSONDecodeError as e:
            orionis_log(f"Failed to parse Gemini response as JSON: {e}", e)
            raise InteractionDetectionError(
                f"Failed to parse Gemini response as JSON: {e}"
            ) from e

        except ValidationError as e:
            orionis_log(f"Interaction validation failed: {e}", e)
            raise InteractionDetectionError(
                f"Interaction validation failed: {e}"
            ) from e

    def _log_interaction_summary(self, interactions: List[Interaction]) -> None:
        """
        Log a summary of detected interactions for debugging.

        Args:
            interactions: List of detected interactions
        """
        orionis_log("Detected interactions summary:")
        for i, interaction in enumerate(interactions):
            orionis_log(
                f"  {i + 1}. {interaction.from_screen_id} → {interaction.to_screen_id}: "
                f"{interaction.interaction_description} ({interaction.timestamp})"
            )
