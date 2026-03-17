import re
from typing import List
from pydantic import BaseModel, Field, field_validator


class Interaction(BaseModel):
    """
    Represents a user interaction that causes a screen transition.

    Each interaction describes what happened between two consecutive screens
    in the strictly linear temporal flow.

    Supports both legacy MM:SS format and new precise HH:MM:SS:FF format.

    Attributes:
        from_screen_id: ID of the screen where interaction starts
        to_screen_id: ID of the screen that appears after interaction
        interaction_description: What the user did (e.g., "Tap 'Login' button")
        timestamp: When the interaction occurred (HH:MM:SS:FF or MM:SS format)
        observed_results: List of effects caused by the interaction

    Example:
        {
            "from_screen_id": "screen-001",
            "to_screen_id": "screen-002",
            "interaction_description": "Tap 'Login' button in top right corner",
            "timestamp": "00:00:05:00",
            "observed_results": ["Navigation menu closes", "Login screen is displayed"]
        }
    """

    from_screen_id: str = Field(..., min_length=1, description="Source screen ID")
    to_screen_id: str = Field(..., min_length=1, description="Target screen ID")
    interaction_description: str = Field(
        ..., min_length=1, description="User action description"
    )
    timestamp: str = Field(..., description="Timestamp in HH:MM:SS:FF or MM:SS format")
    observed_results: List[str] = Field(
        default_factory=list, description="Effects of the interaction"
    )

    @field_validator("from_screen_id", "to_screen_id")
    @classmethod
    def validate_screen_ids_different(cls, v: str, info) -> str:
        """
        Validate that from_screen_id and to_screen_id are different.
        This enforces the no-self-loops constraint for linear graphs.
        """
        # Can only validate when both fields are present
        if info.field_name == "to_screen_id" and "from_screen_id" in info.data:
            if v == info.data["from_screen_id"]:
                raise ValueError(
                    f"Self-loops not allowed: from_screen_id and to_screen_id cannot be the same ({v}). "
                    "For linear graphs, each interaction must transition to a different screen."
                )
        return v

    @field_validator("timestamp")
    @classmethod
    def validate_timestamp_values(cls, v: str) -> str:
        """Validate timestamp format (HH:MM:SS:FF or MM:SS)"""
        # Try precise format first: HH:MM:SS:FF
        precise_match = re.match(r"^(\d{2}):(\d{2}):(\d{2}):(\d{2})$", v)
        if precise_match:
            hours, minutes, seconds, frames = map(int, precise_match.groups())
            if not (0 <= hours <= 99 and 0 <= minutes <= 59 and 0 <= seconds <= 59):
                raise ValueError(f"Invalid timestamp values: {v}")
            return v

        # Fall back to legacy format: MM:SS
        legacy_match = re.match(r"^(\d{2}):(\d{2})$", v)
        if legacy_match:
            minutes, seconds = map(int, legacy_match.groups())
            if not (0 <= minutes <= 99 and 0 <= seconds <= 59):
                raise ValueError(f"Invalid timestamp values: {minutes}:{seconds}")
            return v

        raise ValueError(
            f"Invalid timestamp format: {v}. Expected HH:MM:SS:FF or MM:SS"
        )

    @field_validator("observed_results")
    @classmethod
    def validate_observed_results(cls, v: List[str]) -> List[str]:
        """Validate observed results are non-empty strings"""
        if not all(isinstance(r, str) and r.strip() for r in v):
            raise ValueError("All observed results must be non-empty strings")
        return v

    def get_timestamp_seconds(self, video_fps: float = 30.0) -> float:
        """
        Convert timestamp to total seconds.

        Args:
            video_fps: Video FPS for frame-level precision (default 30)

        Returns:
            Total seconds as float
        """
        # Try precise format: HH:MM:SS:FF
        precise_match = re.match(r"^(\d{2}):(\d{2}):(\d{2}):(\d{2})$", self.timestamp)
        if precise_match:
            hours, minutes, seconds, frames = map(int, precise_match.groups())
            return hours * 3600 + minutes * 60 + seconds + (frames / video_fps)

        # Legacy format: MM:SS
        legacy_match = re.match(r"^(\d{2}):(\d{2})$", self.timestamp)
        if legacy_match:
            minutes, seconds = map(int, legacy_match.groups())
            return float(minutes * 60 + seconds)

        return 0.0

    class Config:
        """Pydantic model configuration"""

        json_schema_extra = {
            "example": {
                "from_screen_id": "screen-001",
                "to_screen_id": "screen-002",
                "interaction_description": "Tap 'Login' button in top right corner",
                "timestamp": "00:00:05:00",
                "observed_results": [
                    "Navigation menu closes",
                    "Login screen is displayed",
                ],
            }
        }
