import os
import subprocess
import time
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)


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
            test_session_id = "test_session_" + datetime.now().strftime("%Y%m%d_%H")
            logger.debug(f"No active session, using test session ID: {test_session_id}")
            return test_session_id

    def start_recording(self) -> Dict[str, Any]:
        """Start screen recording and wait for the emulator to go home before responding"""
        try:
            logger.info("Recording start request received")

            # Kill all apps and go to home before starting recording
            self.adb_service.kill_all_apps_and_go_home()
            # Wait a bit to ensure the emulator is at home (optional, but safer)
            time.sleep(4)

            # Kill any existing recording
            self.adb_service.run_adb_command(
                ["shell", "pkill", "-l", "2", "screenrecord"]
            )      
            time.sleep(1)

            # Generate timestamp for this session
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            self.current_recording_session_id = timestamp
            logger.info(f"Generated session ID: {timestamp}")

            # Conditionally start recording based on config
            if getattr(self.config, "CAPTURE_SESSION_VIDEO", False):
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
                logger.info("Video capture enabled: started adb screenrecord")
            else:
                logger.info(
                    "Video capture disabled by config; starting session without video capture"
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
            if not session_id:
                return {"error": "Session ID required"}

            # Create session directory
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            os.makedirs(session_dir, exist_ok=True)

            # Take final screenshot before stopping recording
            final_screenshot_filename = self.take_final_screenshot(session_id)

            # Get the video file if video capture was enabled
            if getattr(self.config, "CAPTURE_SESSION_VIDEO", False):
                self.adb_service.run_adb_command(
                    ["shell", "pkill", "-l", "2", "screenrecord"]
                )
                time.sleep(2)  # Wait for file to be written

                filename = f"recording_{session_id}.mp4"
                local_video_path = os.path.join(session_dir, filename)

                self.adb_service.run_adb_command(
                    ["pull", self.config.ON_DEVICE_VIDEO_PATH, local_video_path]
                )

            result = self.session_orchestrator.start_session_processing(
                session_id=session_id,
                reset_cache=False,
                product_id=product_id,
            )
            logger.info(f"Session processing queued: {result}")

            # Clear current recording tracking
            logger.info(f"Recording stopped - Session ID: {session_id}")
            self.current_recording_start_time = None
            self.current_recording_session_id = None

            return {
                "session_id": session_id,
                "status": "success",
            }

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

    def save_screenshot(
        self, session_id: str, screenshot_data: bytes, custom_filename: str = None
    ) -> Optional[str]:
        """Save screenshot and return filename"""
        try:
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            screenshots_dir = os.path.join(session_dir, "screenshots")
            os.makedirs(screenshots_dir, exist_ok=True)

            if custom_filename:
                filename = custom_filename
            else:
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

    def take_final_screenshot(self, session_id: str) -> Optional[str]:
        """Take a final screenshot before stopping recording with naming format {session_id}_last.png"""
        try:
            logger.info(f"Taking final screenshot for session {session_id}")

            # Take screenshot using ADB service
            screenshot_data = self.adb_service.take_screenshot()
            if screenshot_data is None:
                logger.warning(
                    f"Failed to capture final screenshot for session {session_id}"
                )
                return None

            # Use the enhanced save_screenshot method with custom filename
            filename = f"{session_id}_last.png"
            saved_filename = self.save_screenshot(
                session_id, screenshot_data, custom_filename=filename
            )

            if saved_filename:
                logger.info(f"Final screenshot saved: {saved_filename}")

            return saved_filename

        except Exception as e:
            logger.error(
                f"Failed to take final screenshot for session {session_id}: {e}"
            )
            return None
