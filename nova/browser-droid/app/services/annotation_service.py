import os
import json
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)


class AnnotationService:
    """Service for handling annotation operations"""

    def __init__(
        self,
        config,
        recording_service,
        adb_service,
        interval_service=None,
    ):
        self.config = config
        self.recording_service = recording_service
        self.adb_service = adb_service
        self.interval_service = interval_service

    def set_interval_service(self, interval_service):
        """Set the interval service after creation to handle circular dependency"""
        self.interval_service = interval_service

    def add_annotation(self, session_id: str) -> Dict[str, Any]:
        """Add an annotation to a session"""
        try:
            if not session_id:
                return {"error": "Session ID required"}

            # Check if this is the currently active recording session
            if not self.recording_service.is_recording_active(session_id):
                error_msg = "No active recording session found. Cannot add annotations."
                logger.warning(f"Annotation rejected: {error_msg}")
                return {"error": error_msg}

            # Create session directory
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            os.makedirs(session_dir, exist_ok=True)

            # Load existing annotations or create new list
            annotations_file = os.path.join(session_dir, "annotations.json")
            annotations = self._load_annotations(session_id)

            # Calculate recording timestamp (relative to actual recording start)
            recording_timestamp = self.recording_service.get_recording_timestamp()
            if recording_timestamp is None:
                return {"error": "No active recording found"}

            # Take screenshot
            screenshot_data = self.adb_service.take_screenshot()
            screenshot_filename = None

            if screenshot_data:
                # Generate timestamp for filename
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                screenshot_filename = f"ss_{timestamp}.png"
                screenshot_path = os.path.join(session_dir, screenshot_filename)

                # Save screenshot
                with open(screenshot_path, "wb") as f:
                    f.write(screenshot_data)
                logger.info(f"Screenshot saved: {screenshot_filename}")
            else:
                logger.warning("Failed to take screenshot for annotation")

            # Add new screen annotation
            new_annotation = {
                "session_id": session_id,
                "recording_timestamp": recording_timestamp,
                "type": "screen_annotation",
                "screenshot_file": screenshot_filename,
            }

            annotations.append(new_annotation)

            # Save updated annotations
            self._save_annotations(session_id, annotations)

            logger.info(
                f"Screen annotation added to session {session_id} at {recording_timestamp}"
            )

            return {
                "status": "success",
                "annotation": new_annotation,
                "total_annotations": len(annotations),
            }

        except Exception as e:
            logger.error(f"Error adding annotation: {e}")
            return {"error": str(e)}

    def get_annotations(self, session_id: str) -> Dict[str, Any]:
        """Get all annotations for a specific session"""
        try:
            annotations = self._load_annotations(session_id)
            return {"annotations": annotations, "total": len(annotations)}
        except Exception as e:
            logger.error(f"Error getting annotations for session {session_id}: {e}")
            return {"error": str(e)}

    def get_transcription_intervals(self, session_id: str) -> Dict[str, Any]:
        """Get transcription-annotation interval mapping for a session"""
        try:
            if not session_id:
                return {"error": "Session ID required"}

            if not self.interval_service:
                return {"error": "Interval service not available"}

            result = self.interval_service.detect_transcription_annotation_intervals(
                session_id
            )

            return result

        except Exception as e:
            logger.error(
                f"Error getting transcription intervals for session {session_id}: {e}"
            )
            return {"error": str(e)}

    def _load_annotations(self, session_id: str) -> List[Dict[str, Any]]:
        """Load annotations from file for a session"""
        session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
        annotations_file = os.path.join(session_dir, "annotations.json")

        if not os.path.exists(annotations_file):
            return []

        try:
            with open(annotations_file, "r") as f:
                return json.load(f)
        except json.JSONDecodeError:
            logger.warning(
                f"Corrupted annotations file for session {session_id}, starting fresh"
            )
            return []

    def _save_annotations(
        self, session_id: str, annotations: List[Dict[str, Any]]
    ) -> None:
        """Save annotations to file for a session"""
        session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
        annotations_file = os.path.join(session_dir, "annotations.json")

        with open(annotations_file, "w") as f:
            json.dump(annotations, f, indent=2)
