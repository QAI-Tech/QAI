import re
from typing import Optional, Tuple
from pydantic import BaseModel, Field, field_validator


class VideoSegment(BaseModel):
    """
    Represents a video segment between two consecutive screens.

    Each segment contains the video content from the appearance of one screen
    to the appearance of the next screen, capturing the transition interaction.

    Supports both legacy MM:SS format and new precise HH:MM:SS:FF format.

    Attributes:
        from_screen_id: ID of the starting screen
        to_screen_id: ID of the ending screen
        start_timestamp: Start time (MM:SS or HH:MM:SS:FF format)
        end_timestamp: End time (MM:SS or HH:MM:SS:FF format)
        segment_file_path: Path to the spliced video segment file

    Example:
        {
            "from_screen_id": "screen-001",
            "to_screen_id": "screen-002",
            "start_timestamp": "00:02",
            "end_timestamp": "00:08",
            "segment_file_path": "/tmp/segment_001_002.mp4"
        }
    """

    from_screen_id: str = Field(..., min_length=1, description="Source screen ID")
    to_screen_id: str = Field(..., min_length=1, description="Target screen ID")
    start_timestamp: str = Field(
        ..., description="Start timestamp (MM:SS or HH:MM:SS:FF)"
    )
    end_timestamp: str = Field(..., description="End timestamp (MM:SS or HH:MM:SS:FF)")
    segment_file_path: Optional[str] = Field(
        None, description="Path to spliced video file"
    )

    @field_validator("start_timestamp", "end_timestamp")
    @classmethod
    def validate_timestamp_values(cls, v: str) -> str:
        """Validate timestamp format (MM:SS or HH:MM:SS:FF)"""
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
            f"Invalid timestamp format: {v}. Expected MM:SS or HH:MM:SS:FF"
        )

    @field_validator("end_timestamp")
    @classmethod
    def validate_end_after_start(cls, v: str, info) -> str:
        """Validate end_timestamp is after start_timestamp"""
        if "start_timestamp" not in info.data:
            return v

        start = info.data["start_timestamp"]
        start_seconds = cls._timestamp_to_seconds(start)
        end_seconds = cls._timestamp_to_seconds(v)

        if end_seconds <= start_seconds:
            raise ValueError(
                f"end_timestamp ({v}) must be after start_timestamp ({start})"
            )

        return v

    @staticmethod
    def _parse_timestamp(timestamp: str) -> Tuple[float, bool]:
        """
        Parse timestamp and return (seconds, is_precise).

        Returns:
            Tuple of (total_seconds, is_precise_format)
        """
        # Try precise format: HH:MM:SS:FF
        precise_match = re.match(r"^(\d{2}):(\d{2}):(\d{2}):(\d{2})$", timestamp)
        if precise_match:
            hours, minutes, seconds, frames = map(int, precise_match.groups())
            # Note: frame precision requires video_fps, so we approximate
            # by treating frames as 1/30th of a second (common fps)
            total = hours * 3600 + minutes * 60 + seconds + (frames / 30.0)
            return (total, True)

        # Legacy format: MM:SS
        legacy_match = re.match(r"^(\d{2}):(\d{2})$", timestamp)
        if legacy_match:
            minutes, seconds = map(int, legacy_match.groups())
            return (float(minutes * 60 + seconds), False)

        return (0.0, False)

    @staticmethod
    def _timestamp_to_seconds(timestamp: str) -> float:
        """Convert timestamp to total seconds (approximate for frame precision)"""
        seconds, _ = VideoSegment._parse_timestamp(timestamp)
        return seconds

    def get_start_seconds(self) -> float:
        """Get start timestamp in seconds"""
        return self._timestamp_to_seconds(self.start_timestamp)

    def get_end_seconds(self) -> float:
        """Get end timestamp in seconds"""
        return self._timestamp_to_seconds(self.end_timestamp)

    def get_duration_seconds(self) -> float:
        """Get segment duration in seconds"""
        return self.get_end_seconds() - self.get_start_seconds()

    class Config:
        """Pydantic model configuration"""

        json_schema_extra = {
            "example": {
                "from_screen_id": "screen-001",
                "to_screen_id": "screen-002",
                "start_timestamp": "00:02",
                "end_timestamp": "00:08",
                "segment_file_path": "/tmp/segment_001_002.mp4",
            }
        }
