import re
from typing import Optional, Tuple
from pydantic import BaseModel, Field, field_validator


class Screen(BaseModel):
    """
    Represents a single screen appearance in the execution video.

    Each screen appearance is unique in the temporal sequence, even if
    the same UI appears multiple times (e.g., reopening an app).

    Attributes:
        id: Unique identifier (e.g., "screen-001")
        title: Short descriptive title (max 7 words)
        description: What the user can do on this screen
        appearance_timestamp: When the screen appears
            - New format: HH:MM:SS:FF (with frame number)
            - Legacy format: MM:SS (backwards compatible)
        base64_image: Optional base64 encoded screenshot data URI

    Example (new format):
        {
            "id": "screen-001",
            "title": "Home Screen",
            "description": "Main landing page with navigation options",
            "appearance_timestamp": "00:00:02:15"
        }

    Example (legacy format):
        {
            "id": "screen-001",
            "title": "Home Screen",
            "description": "Main landing page with navigation options",
            "appearance_timestamp": "00:02"
        }
    """

    id: str = Field(..., min_length=1, description="Unique screen identifier")
    title: str = Field(
        ..., min_length=1, max_length=100, description="Screen title (max 7 words)"
    )
    description: str = Field(
        ..., min_length=1, description="Screen functionality description"
    )
    appearance_timestamp: str = Field(
        ...,
        description="Timestamp in HH:MM:SS:FF (precise) or MM:SS (legacy) format",
    )
    base64_image: Optional[str] = Field(None, description="Base64 encoded screenshot")

    # Pattern for precise format: HH:MM:SS:FF
    _PRECISE_PATTERN = re.compile(r"^(\d{2}):(\d{2}):(\d{2}):(\d{2})$")
    # Pattern for legacy format: MM:SS
    _LEGACY_PATTERN = re.compile(r"^(\d{2}):(\d{2})$")

    @field_validator("title")
    @classmethod
    def validate_title_word_count(cls, v: str) -> str:
        """Validate title has maximum 7 words"""
        word_count = len(v.split())
        if word_count > 7:
            raise ValueError(f"Title must be max 7 words, got {word_count}")
        return v

    @field_validator("appearance_timestamp")
    @classmethod
    def validate_timestamp_values(cls, v: str) -> str:
        """Validate timestamp format and values (supports both precise and legacy formats)"""
        # Try precise format first: HH:MM:SS:FF
        precise_match = re.match(r"^(\d{2}):(\d{2}):(\d{2}):(\d{2})$", v)
        if precise_match:
            hours, minutes, seconds, frame = map(int, precise_match.groups())
            if not (0 <= hours <= 99):
                raise ValueError(f"Invalid hours value: {hours}")
            if not (0 <= minutes <= 59):
                raise ValueError(f"Invalid minutes value: {minutes}")
            if not (0 <= seconds <= 59):
                raise ValueError(f"Invalid seconds value: {seconds}")
            # Frame validation happens later when FPS is known (0 to FPS-1)
            # For now, just ensure it's a reasonable value (0-99)
            if not (0 <= frame <= 99):
                raise ValueError(f"Invalid frame value: {frame}")
            return v

        # Try legacy format: MM:SS
        legacy_match = re.match(r"^(\d{2}):(\d{2})$", v)
        if legacy_match:
            minutes, seconds = map(int, legacy_match.groups())
            if not (0 <= minutes <= 99 and 0 <= seconds <= 59):
                raise ValueError(f"Invalid timestamp values: {minutes}:{seconds}")
            return v

        raise ValueError(
            f"Invalid timestamp format: {v}. "
            f"Expected HH:MM:SS:FF (precise) or MM:SS (legacy)"
        )

    def is_precise_timestamp(self) -> bool:
        """Check if this screen uses precise timestamp format (HH:MM:SS:FF)"""
        return bool(self._PRECISE_PATTERN.match(self.appearance_timestamp))

    def parse_precise_timestamp(self) -> Optional[Tuple[int, int, int, int]]:
        """
        Parse precise timestamp into components.

        Returns:
            Tuple of (hours, minutes, seconds, frame) if precise format,
            None if legacy format
        """
        match = self._PRECISE_PATTERN.match(self.appearance_timestamp)
        if match:
            return tuple(map(int, match.groups()))  # type: ignore
        return None

    def get_timestamp_seconds(self) -> float:
        """
        Convert timestamp to total seconds (legacy method, ignores frame).

        For precise timestamps, this returns seconds without frame precision.
        Use get_precise_timestamp_seconds() for frame-accurate timing.
        """
        # Try precise format first
        precise = self.parse_precise_timestamp()
        if precise:
            hours, minutes, seconds, _ = precise
            return float(hours * 3600 + minutes * 60 + seconds)

        # Legacy format: MM:SS
        parts = self.appearance_timestamp.split(":")
        minutes, seconds = map(int, parts)
        return float(minutes * 60 + seconds)

    def get_precise_timestamp_seconds(self, video_fps: float = 30.0) -> float:
        """
        Convert timestamp to precise seconds including frame offset.

        Args:
            video_fps: Video frames per second (default 30)

        Returns:
            Precise time in seconds (e.g., 83.5 for 1:23 and 15 frames at 30fps)
        """
        precise = self.parse_precise_timestamp()
        if precise:
            hours, minutes, seconds, frame = precise
            base_seconds = hours * 3600 + minutes * 60 + seconds
            frame_offset = frame / video_fps
            return float(base_seconds + frame_offset)

        # Legacy format - no frame precision
        return self.get_timestamp_seconds()

    def get_frame_number(self, video_fps: float = 30.0) -> int:
        """
        Calculate the exact frame number to extract from the video.

        Args:
            video_fps: Video frames per second

        Returns:
            Frame number (0-indexed) in the video
        """
        precise_seconds = self.get_precise_timestamp_seconds(video_fps)
        return int(precise_seconds * video_fps)

    class Config:
        """Pydantic model configuration"""

        json_schema_extra = {
            "example": {
                "id": "screen-001",
                "title": "Home Screen",
                "description": "Main landing page with navigation options",
                "appearance_timestamp": "00:00:02:15",
            }
        }
