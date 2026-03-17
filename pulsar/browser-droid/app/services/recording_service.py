import os
import subprocess
import time
import logging
from datetime import datetime
from typing import Optional, Dict, Any
from enum import Enum

logger = logging.getLogger(__name__)


class InteractionType(Enum):
    """Enum for different types of user interactions"""

    TAP = "tap"
    SWIPE = "swipe"
    INPUT = "input"
    BACK = "back"
    HOME = "home"
    VOLUME_UP = "volume_up"
    VOLUME_DOWN = "volume_down"


class RecordingService:
    """Service for handling screen recording operations"""

    def __init__(self, config, adb_service):
        self.config = config
        self.adb_service = adb_service
        self.current_recording_start_time: Optional[datetime] = None
        self.current_recording_session_id: Optional[str] = None
        self.video_slice_service = None  # Will be set by the main app
        self.session_orchestrator = None  # Will be set by the main app

    def set_video_slice_service(self, video_slice_service):
        """Set the video slice service reference"""
        self.video_slice_service = video_slice_service

    def set_session_orchestrator(self, session_orchestrator):
        """Set the session orchestrator reference"""
        self.session_orchestrator = session_orchestrator

    def get_current_session_id(self) -> str:
        """Get current session ID or create a test session ID if none exists"""
        if self.current_recording_session_id:
            return self.current_recording_session_id
        else:
            # Create a test session ID for testing when no active session
            return "test_session_" + datetime.now().strftime("%Y%m%d_%H")

    def start_recording(self) -> Dict[str, Any]:
        """Start screen recording"""
        try:
            logger.info("Recording start request received")

            # Kill any existing recording
            self.adb_service.run_adb_command(
                ["shell", "pkill", "-l", "2", "screenrecord"]
            )
            time.sleep(1)

            # Generate timestamp for this session
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            self.current_recording_session_id = timestamp
            logger.info(f"Generated session ID: {timestamp}")

            # Start new recording with time limit from config
            subprocess.Popen(
                [
                    "adb",
                    "shell",
                    "screenrecord",
                    "--time-limit",
                    self.config.RECORDING_TIME_LIMIT,
                    self.config.ON_DEVICE_VIDEO_PATH,
                ]
            )
            self.current_recording_start_time = datetime.now()

            logger.info(
                f"Recording started - Session ID: {timestamp}, Start time: {self.current_recording_start_time}"
            )
            logger.info(
                f"Recording service state - current_recording_session_id: {self.current_recording_session_id}, current_recording_start_time: {self.current_recording_start_time}"
            )

            return {"status": "recording started", "session_id": timestamp}
        except Exception as e:
            logger.error(f"Recording start error: {e}")
            return {"status": "error", "error": str(e)}

    def stop_recording(self, session_id: str, product_id: str) -> Dict[str, Any]:
        """Stop recording and save the video with timestamp"""
        try:
            # Stop recording
            self.adb_service.run_adb_command(
                ["shell", "pkill", "-l", "2", "screenrecord"]
            )
            time.sleep(2)  # Wait for file to be written

            if not session_id:
                return {"error": "Session ID required"}

            # Create session directory
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            os.makedirs(session_dir, exist_ok=True)

            filename = f"recording_{session_id}.mp4"
            local_video_path = os.path.join(session_dir, filename)

            # Pull the video file with timestamped name
            self.adb_service.run_adb_command(
                ["pull", self.config.ON_DEVICE_VIDEO_PATH, local_video_path]
            )

            # Start session processing with orchestrator (if available)
            if self.session_orchestrator:
                logger.info(
                    f"Starting session processing with orchestrator for {session_id}"
                )
                orchestrator_result = (
                    self.session_orchestrator.start_session_processing(
                        session_id=session_id, product_id=product_id
                    )
                )
                if orchestrator_result.get("status") == "started":
                    logger.info("Session processing started successfully")
                else:
                    logger.warning(
                        f"Failed to start session processing: {orchestrator_result.get('error')}"
                    )
            else:
                # Fallback to legacy video slicing (synchronous)
                if self.video_slice_service:
                    logger.info(
                        "Using legacy video slicing (orchestrator not available)"
                    )
                    slice_result = self.video_slice_service.slice_video_by_annotations(
                        session_id
                    )
                    if slice_result.get("status") == "success":
                        logger.info("Legacy video slicing completed successfully")
                    else:
                        logger.warning(
                            f"Legacy video slicing failed: {slice_result.get('error', 'Unknown error')}"
                        )

            # Clear current recording tracking
            logger.info(f"Recording stopped - Session ID: {session_id}")
            self.current_recording_start_time = None
            self.current_recording_session_id = None

            if os.path.exists(local_video_path):
                result = {
                    "status": "success",
                    "filename": filename,
                    "path": local_video_path,
                }

                return result
            else:
                return {"error": "Recording file not found"}
        except Exception as e:
            logger.error(f"Recording stop error: {e}")
            return {"error": str(e)}

    def get_recording_status(self) -> Dict[str, Any]:
        """Get current recording status"""
        return {
            "current_recording_session_id": self.current_recording_session_id,
            "current_recording_start_time": (
                str(self.current_recording_start_time)
                if self.current_recording_start_time
                else None
            ),
        }

    def is_recording_active(self, session_id: str) -> bool:
        """Check if recording is active for the given session"""
        return (
            session_id == self.current_recording_session_id
            and self.current_recording_start_time is not None
        )

    def get_recording_timestamp(self) -> Optional[str]:
        """Get current recording timestamp in HH:MM:ss:mmm format"""
        if self.current_recording_start_time is None:
            return None

        current_time = datetime.now()
        time_diff = current_time - self.current_recording_start_time

        # Format as HH:MM:ss:mmm
        total_seconds = int(time_diff.total_seconds())
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        seconds = total_seconds % 60
        milliseconds = int(time_diff.microseconds / 1000)

        return f"{hours:02d}:{minutes:02d}:{seconds:02d}:{milliseconds:03d}"

    def save_screenshot(self, session_id: str, screenshot_data: bytes) -> Optional[str]:
        """Save screenshot and return filename"""
        try:
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            screenshots_dir = os.path.join(session_dir, "screenshots")
            os.makedirs(screenshots_dir, exist_ok=True)

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[
                :-3
            ]  # Include milliseconds
            filename = f"ss_{timestamp}.png"
            filepath = os.path.join(screenshots_dir, filename)

            with open(filepath, "wb") as f:
                f.write(screenshot_data)

            return filename

        except Exception as e:
            logger.error(f"Failed to save screenshot: {e}")
            return None

    def store_interaction(
        self,
        session_id: str,
        interaction_type: InteractionType,
        pre_screenshot_filename: str,
        coordinates: Optional[list[int]] = None,
        additional_data: Optional[Dict[str, Any]] = None,
    ):
        """Store interaction data"""
        try:
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            interactions_file = os.path.join(session_dir, "interactions.json")

            # Load existing interactions or create new list
            interactions = []
            if os.path.exists(interactions_file):
                try:
                    import json

                    with open(interactions_file, "r", encoding="utf-8") as f:
                        interactions = json.load(f)
                except Exception as e:
                    logger.warning(f"Failed to load existing interactions: {e}")
                    interactions = []

            # Create new interaction data
            interaction_data = {
                "timestamp": datetime.now().isoformat(),
                "interaction_type": interaction_type.value,
                "pre_screenshot_filename": pre_screenshot_filename,
            }

            # Add coordinates if provided
            if coordinates:
                if len(coordinates) == 2:
                    # Tap coordinates: [x, y]
                    interaction_data["coordinates"] = coordinates
                elif len(coordinates) == 4:
                    # Swipe coordinates: [x1, y1, x2, y2]
                    interaction_data["coordinates"] = coordinates

            # Add additional data if provided
            if additional_data:
                interaction_data.update(additional_data)

            # Add to interactions list
            interactions.append(interaction_data)

            # Save updated interactions file
            import json

            with open(interactions_file, "w", encoding="utf-8") as f:
                json.dump(interactions, f, indent=2, ensure_ascii=False)

            logger.info(
                f"Interaction added to interactions.json (total: {len(interactions)})"
            )

        except Exception as e:
            logger.error(f"Failed to store interaction data: {e}")
