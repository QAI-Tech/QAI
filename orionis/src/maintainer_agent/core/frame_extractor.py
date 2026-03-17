"""
Frame Extraction Module
Extracts specific frames from video recordings based on LLM-provided timestamps
Converts frames to base64 format for tc_graph image fields
"""

import cv2
import base64
from typing import Dict, List, Optional

from utils.util import orionis_log


class FrameExtractor:
    """
    Extracts frames from video at LLM-identified timestamps and encodes as base64
    """

    def __init__(self):
        pass

    def timestamp_to_seconds(self, timestamp_str: str) -> Optional[float]:
        """
        Convert MM:SS timestamp string to total seconds

        Args:
            timestamp_str: Time in MM:SS format (e.g., "01:23")

        Returns:
            Total seconds as float, or None if invalid format
        """
        try:
            time_parts = timestamp_str.split(":")
            if len(time_parts) == 2:
                minutes, seconds = map(int, time_parts)
                return float((minutes * 60) + seconds)
            return None
        except (ValueError, AttributeError):
            return None

    def extract_frame_at_timestamp(
        self, video_path: str, timestamp_str: str
    ) -> Optional[str]:
        """
        Extract frame at timestamp and return as base64 data URI

        Args:
            video_path: Path to video file
            timestamp_str: Timestamp in MM:SS format from LLM analysis

        Returns:
            Base64 encoded JPEG as data URI (data:image/jpeg;base64,...) or empty string
        """
        try:
            # Convert timestamp to seconds
            total_seconds = self.timestamp_to_seconds(timestamp_str)
            if total_seconds is None:
                return ""

            # Open video
            video_capture = cv2.VideoCapture(video_path)
            if not video_capture.isOpened():
                orionis_log(
                    f"Failed to open video for frame extraction at timestamp {timestamp_str}"
                )
                return ""

            # Get FPS and calculate frame number
            fps = video_capture.get(cv2.CAP_PROP_FPS)
            frame_number = int(total_seconds * fps)

            # Seek to frame
            video_capture.set(cv2.CAP_PROP_POS_FRAMES, frame_number)

            # Read frame
            success, frame = video_capture.read()
            video_capture.release()

            if not success:
                return ""

            # Encode as JPEG
            encode_success, buffer = cv2.imencode(
                ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85]
            )
            if not encode_success:
                return ""

            # Convert to base64 data URI
            base64_data = base64.b64encode(buffer.tobytes()).decode("utf-8")
            data_uri = f"data:image/jpeg;base64,{base64_data}"

            return data_uri

        except Exception as e:
            orionis_log(
                f"Error extracting frame at timestamp {timestamp_str}: {str(e)}", e
            )
            return ""

    def extract_frames_for_screens(
        self, video_path: str, screens: List[Dict]
    ) -> Dict[str, str]:
        """
        Extract frames for all screens using LLM-provided timestamps

        Args:
            video_path: Path to execution video
            screens: List of screen dicts with 'id' and 'first_appearance_timestamp'

        Returns:
            Dictionary mapping screen_id -> base64 data URI
        """
        screen_images = {}
        orionis_log(f"Starting frame extraction from video for {len(screens)} screens")

        for screen in screens:
            screen_id = screen.get("id")
            if not screen_id:
                continue

            timestamp = screen.get("first_appearance_timestamp")

            if not timestamp:
                screen_images[screen_id] = ""
                continue

            orionis_log(f"Extracting frame for {screen_id} at {timestamp}")
            frame_data = self.extract_frame_at_timestamp(video_path, timestamp)

            if frame_data:
                screen_images[screen_id] = frame_data
            else:
                screen_images[screen_id] = ""

        successful = len([v for v in screen_images.values() if v])
        orionis_log(
            f"Frame extraction complete - {successful}/{len(screens)} frames extracted successfully"
        )

        return screen_images
