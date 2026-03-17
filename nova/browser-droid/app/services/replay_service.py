import json
import logging
import os
import time
from typing import Dict, List, Any, Optional
from datetime import datetime
import dateutil.parser

logger = logging.getLogger(__name__)


class ReplayService:
    """Service for replaying recorded interactions via ADB commands"""

    def __init__(self, adb_service, config):
        self.adb_service = adb_service
        self.config = config
        self.default_delay = 3.0  # Default delay between interactions in seconds

    def replay_session(self, session_id: str) -> Dict[str, Any]:
        """
        Replay all interactions from a session

        Args:
            session_id: The session ID to replay

        Returns:
            Dict with replay results
        """
        try:
            # Load interactions file
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            interactions_file = os.path.join(session_dir, "interactions.json")

            if not os.path.exists(interactions_file):
                return {
                    "status": "error",
                    "error": f"Interactions file not found: {interactions_file}",
                }

            # Load interactions
            with open(interactions_file, "r", encoding="utf-8") as f:
                interactions = json.load(f)

            if not interactions:
                return {
                    "status": "error",
                    "message": "No interactions found in session",
                }
            # Kill all apps and go to home before starting recording
            self.adb_service.kill_all_apps_and_go_home()
            # Wait a bit to ensure the emulator is at home (optional, but safer)
            time.sleep(4)
            logger.info(
                f"Starting replay of {len(interactions)} interactions for session {session_id}"
            )

            # Check device connection
            if not self.adb_service.check_adb_connection():
                return {"status": "error", "message": "No ADB device connected"}

            # Execute each interaction
            successful_interactions = 0
            failed_interactions = 0
            errors = []

            for i, interaction in enumerate(interactions):
                try:
                    logger.info(
                        f"Executing interaction {i+1}/{len(interactions)}: {interaction.get('interaction_type')}"
                    )

                    success = self._execute_interaction(interaction)

                    if success:
                        successful_interactions += 1
                        logger.info(f"Interaction {i+1} executed successfully")
                    else:
                        failed_interactions += 1
                        error_msg = f"Failed to execute interaction {i+1}: {interaction.get('interaction_type')}"
                        errors.append(error_msg)
                        logger.error(error_msg)

                    # Dynamic delay between interactions based on timestamp difference
                    if i < len(interactions) - 1:
                        ts1 = interaction.get("timestamp")
                        ts2 = interactions[i+1].get("timestamp")
                        try:
                            if ts1 and ts2:
                                # Try parsing with dateutil, fallback to datetime.fromisoformat
                                try:
                                    t1 = dateutil.parser.parse(ts1)
                                    t2 = dateutil.parser.parse(ts2)
                                except Exception:
                                    t1 = datetime.fromisoformat(ts1)
                                    t2 = datetime.fromisoformat(ts2)
                                delay = (t2 - t1).total_seconds()
                                if delay > 0:
                                    time.sleep(delay)
                                else:
                                    time.sleep(0.1)
                            else:
                                time.sleep(self.default_delay)
                        except Exception as e:
                            logger.warning(f"Failed to parse timestamps for delay: {e}")
                            time.sleep(self.default_delay)

                except Exception as e:
                    failed_interactions += 1
                    error_msg = f"Error executing interaction {i+1}: {str(e)}"
                    errors.append(error_msg)
                    logger.error(error_msg)

            # Prepare results
            result = {
                "status": "completed",
                "session_id": session_id,
                "total_interactions": len(interactions),
                "successful_interactions": successful_interactions,
                "failed_interactions": failed_interactions,
                "errors": errors,
                "message": f"Replay completed: {successful_interactions}/{len(interactions)} interactions successful",
            }

            logger.info(
                f"Replay completed for session {session_id}: {result['message']}"
            )
            return result

        except Exception as e:
            error_msg = f"Replay failed: {str(e)}"
            logger.error(error_msg)
            return {"status": "error", "error": error_msg}

    def _execute_interaction(self, interaction: Dict[str, Any]) -> bool:
        """
        Execute a single interaction via ADB

        Args:
            interaction: Interaction data from interactions.json

        Returns:
            True if successful, False otherwise
        """
        try:
            interaction_type = interaction.get("interaction_type")

            if interaction_type == "tap":
                coordinates = interaction.get("coordinates", [])
                if len(coordinates) == 2:
                    x, y = coordinates
                    return self.adb_service.tap(x, y)
                else:
                    logger.error(f"Invalid tap coordinates: {coordinates}")
                    return False

            elif interaction_type == "swipe":
                coordinates = interaction.get("coordinates", [])
                duration = interaction.get("duration", 1000)  # Default 1 second
                if len(coordinates) == 4:
                    x1, y1, x2, y2 = coordinates
                    return self.adb_service.swipe(x1, y1, x2, y2, duration)
                else:
                    logger.error(f"Invalid swipe coordinates: {coordinates}")
                    return False

            elif interaction_type == "input":
                text = interaction.get("text", "")
                if text:
                    return self.adb_service.input_text(text)
                else:
                    logger.error("No text found for input interaction")
                    return False

            elif interaction_type == "back":
                return self.adb_service.key_event(4)  # KEYCODE_BACK

            elif interaction_type == "home":
                return self.adb_service.key_event(3)  # KEYCODE_HOME

            elif interaction_type == "volume_up":
                return self.adb_service.key_event(24)  # KEYCODE_VOLUME_UP

            elif interaction_type == "volume_down":
                return self.adb_service.key_event(25)  # KEYCODE_VOLUME_DOWN

            else:
                logger.error(f"Unknown interaction type: {interaction_type}")
                return False

        except Exception as e:
            logger.error(f"Error executing interaction {interaction}: {str(e)}")
            return False
