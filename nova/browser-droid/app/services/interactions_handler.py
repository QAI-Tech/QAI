import logging
import os
import time
import threading
import json
import queue
from datetime import datetime
from typing import Any, Dict, Optional, List
from dataclasses import dataclass
import xml.dom.minidom

from app.types import InteractionType

logger = logging.getLogger(__name__)


@dataclass
class InteractionTask:
    """Task for processing an interaction asynchronously"""

    session_id: str
    interaction_type: InteractionType
    pre_screenshot_data: bytes
    xml_data: str
    coordinates: Optional[List[int]]
    additional_data: Optional[Dict[str, Any]]
    timestamp: datetime


class InteractionsHandler:

    def __init__(self, config, adb_service, recording_service):
        self.config = config
        self.adb_service = adb_service
        self.recording_service = recording_service
        # XML capture throttling
        self.last_dump_time = {}  # session_id -> timestamp for throttling
        self.dump_throttle_ms = 500  # Max 2 dumps per second per session
        # Track last XML for input interactions
        self.last_input_xml = {}  # session_id -> (xml_data, xml_filename)
        # Thread safety
        self._lock = threading.RLock()
        # Lock for serializing ADB input execution to maintain order
        self._adb_input_lock = threading.Lock()

        # Queue-based interaction processing
        self.interaction_queue = queue.Queue()
        self._shutdown_event = threading.Event()
        self._worker_thread = threading.Thread(
            target=self._process_interaction_queue, daemon=True
        )
        self._worker_thread.start()

    def __del__(self):
        """Cleanup on destruction"""
        self.shutdown()

    def shutdown(self):
        """Gracefully shutdown the interaction queue worker"""
        if hasattr(self, "_shutdown_event"):
            self._shutdown_event.set()
            if hasattr(self, "_worker_thread") and self._worker_thread.is_alive():
                self._worker_thread.join(timeout=2.0)
                logger.info("Interaction queue worker shutdown complete")

    def wait_for_pending_interactions(self, timeout: float = 5.0) -> bool:
        """Wait for all pending interactions to be processed"""
        try:
            # Wait for queue to be empty
            return self.interaction_queue.join(timeout=timeout)
        except Exception as e:
            logger.warning(f"Error waiting for pending interactions: {e}")
            return False

    def _process_interaction_queue(self):
        """Background worker that processes interaction tasks in order"""
        while not self._shutdown_event.is_set():
            try:
                # Wait for task with timeout to allow checking shutdown event
                task = self.interaction_queue.get(timeout=1.0)
                if task is None:  # Sentinel value for shutdown
                    break

                self._process_single_interaction(task)
                self.interaction_queue.task_done()

            except queue.Empty:
                continue  # Continue loop to check shutdown event
            except Exception as e:
                logger.error(f"Error processing interaction task: {e}")
                # Mark task as done even if it failed to prevent queue blocking
                if "task" in locals():
                    self.interaction_queue.task_done()

    def _process_single_interaction(self, task: InteractionTask):
        """Process a single interaction task: save screenshot, XML, and append to interactions"""
        try:
            logger.debug(
                f"Processing interaction task: {task.interaction_type.value} for session {task.session_id}"
            )

            # 1. Save screenshot
            screenshot_filename = self._save_screenshot_sync(
                task.session_id, task.pre_screenshot_data
            )

            # 2. Save XML (with caching for input interactions)
            xml_filename = self._save_xml_sync_with_cache(
                task.session_id,
                task.xml_data,
                task.interaction_type == InteractionType.INPUT,
            )

            # 3. Store interaction (this was the original store_interaction logic)
            self._store_interaction_sync(
                task.session_id,
                task.interaction_type,
                screenshot_filename,
                task.coordinates,
                xml_filename,
                task.additional_data,
                task.timestamp,
            )

            logger.debug(
                f"Successfully processed interaction: {screenshot_filename}, {xml_filename}"
            )

        except Exception as e:
            logger.error(f"Failed to process interaction task: {e}")

    def _save_screenshot_sync(
        self, session_id: str, screenshot_data: bytes
    ) -> Optional[str]:
        """Synchronous screenshot saving (for queue processing)"""
        if not screenshot_data:
            return None

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
        filename = f"ss_{timestamp}.png"

        try:
            self.recording_service.save_screenshot(
                session_id, screenshot_data, filename
            )
            return filename
        except Exception as e:
            logger.error(f"Failed to save screenshot: {e}")
            return None

    def _save_xml_sync_with_cache(
        self, session_id: str, xml_data: str, should_cache: bool = False
    ) -> Optional[str]:
        """Synchronous XML saving with caching support (for queue processing)"""
        if not xml_data:
            return None

        with self._lock:
            # Check if we can reuse existing filename for input interactions
            if should_cache and session_id in self.last_input_xml:
                existing_data, existing_filename = self.last_input_xml[session_id]
                if existing_data == xml_data:
                    # Same XML data, reuse filename without saving
                    logger.debug(f"Reusing existing XML file: {existing_filename}")
                    return existing_filename

        # Generate new filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
        filename = f"ui_hierarchy_{timestamp}.xml"

        try:
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            xml_dir = os.path.join(session_dir, "xml_hierarchies")
            os.makedirs(xml_dir, exist_ok=True)

            filepath = os.path.join(xml_dir, filename)

            # Format the XML data with proper indentation
            try:
                dom = xml.dom.minidom.parseString(xml_data)
                formatted_xml = dom.toprettyxml(indent="  ")
            except Exception as format_error:
                logger.warning(f"Failed to format XML, saving as-is: {format_error}")
                formatted_xml = xml_data

            with open(filepath, "w", encoding="utf-8") as f:
                f.write(formatted_xml)

            # Track this XML for input interactions (thread-safe)
            if should_cache:
                with self._lock:
                    self.last_input_xml[session_id] = (xml_data, filename)

            return filename
        except Exception as e:
            logger.error(f"Failed to save XML: {e}")
            return None

    def _store_interaction_sync(
        self,
        session_id: str,
        interaction_type: InteractionType,
        pre_screenshot_filename: str,
        coordinates: Optional[List[int]] = None,
        xml_hierarchy_filename: Optional[str] = None,
        additional_data: Optional[Dict[str, Any]] = None,
        timestamp: Optional[datetime] = None,
    ):
        """Synchronous interaction storage (for queue processing) - this is the original store_interaction logic"""
        try:
            if timestamp is None:
                timestamp = datetime.now()

            logger.info(
                f"store_interaction called - Session: {session_id}, Type: {interaction_type.value}"
            )
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            interactions_file = os.path.join(session_dir, "interactions.json")

            # Ensure session directory exists
            os.makedirs(session_dir, exist_ok=True)
            logger.debug(
                f"Storing interaction for session {session_id} in {interactions_file}"
            )

            # Load existing interactions or create new list
            interactions = []
            if os.path.exists(interactions_file):
                try:
                    with open(interactions_file, "r", encoding="utf-8") as f:
                        interactions = json.load(f)
                except Exception as e:
                    logger.warning(f"Failed to load existing interactions: {e}")
                    interactions = []

            interaction_data = {
                "timestamp": timestamp.isoformat(),
                "interaction_type": interaction_type.value,
                "pre_screenshot_path": os.path.join(
                    "screenshots", pre_screenshot_filename
                ),
            }

            # Add coordinates if provided
            if coordinates:
                if len(coordinates) == 2:
                    # Tap coordinates: [x, y]
                    interaction_data["coordinates"] = coordinates
                elif len(coordinates) == 4:
                    # Swipe coordinates: [x1, y1, x2, y2]
                    interaction_data["coordinates"] = coordinates

            if xml_hierarchy_filename:
                interaction_data["xml_hierarchy_path"] = os.path.join(
                    "xml_hierarchies", xml_hierarchy_filename
                )

            # Add additional data if provided
            if additional_data:
                interaction_data.update(additional_data)

            # Add to interactions list
            interactions.append(interaction_data)

            # Save updated interactions file
            with open(interactions_file, "w", encoding="utf-8") as f:
                json.dump(interactions, f, indent=2, ensure_ascii=False)

            logger.info(
                f"Interaction added to interactions.json (total: {len(interactions)})"
            )

        except Exception as e:
            logger.error(f"Failed to store interaction data: {e}")
            logger.error(
                f"Session ID: {session_id}, Interaction type: {interaction_type.value}"
            )
            logger.error(
                f"Session dir: {session_dir}, Interactions file: {interactions_file}"
            )

    # ---------------- Public APIs for routes ----------------

    def handle_tap(self, session_id: str, x: int, y: int) -> Dict[str, Any]:
        # Serialize the entire tap process to maintain order and consistency
        with self._adb_input_lock:
            # Clear cached input XML since tap changes UI
            self._clear_input_xml_cache(session_id)

            xml_data = self._capture_xml(session_id, x, y)
            screenshot_data = self.adb_service.take_screenshot()

            success = self.adb_service.tap(x, y)
            if not success:
                return {"status": "error", "error": "Tap failed"}

            # Queue the interaction task inside the lock for complete atomicity
            task = InteractionTask(
                session_id=session_id,
                interaction_type=InteractionType.TAP,
                pre_screenshot_data=screenshot_data,
                xml_data=xml_data,
                coordinates=[x, y],
                additional_data=None,
                timestamp=datetime.now(),
            )
            self.interaction_queue.put(task)

        return {"status": "success", "coordinates": [x, y]}

    def handle_swipe(
        self, session_id: str, x1: int, y1: int, x2: int, y2: int, duration: int
    ) -> Dict[str, Any]:
        # Serialize the entire swipe process to maintain order and consistency
        with self._adb_input_lock:
            # Clear cached input XML since swipe changes UI
            self._clear_input_xml_cache(session_id)

            xml_data = self._capture_xml(session_id, x1, y1)
            screenshot_data = self.adb_service.take_screenshot()

            success = self.adb_service.swipe(x1, y1, x2, y2, duration)
            if not success:
                return {"status": "error", "error": "Swipe failed"}

            # Queue the interaction task inside the lock for complete atomicity
            task = InteractionTask(
                session_id=session_id,
                interaction_type=InteractionType.SWIPE,
                pre_screenshot_data=screenshot_data,
                xml_data=xml_data,
                coordinates=[x1, y1, x2, y2],
                additional_data={"duration": duration},
                timestamp=datetime.now(),
            )
            self.interaction_queue.put(task)

        return {"status": "success", "swipe": [x1, y1, x2, y2, duration]}

    def handle_key(self, session_id: str, keycode: int) -> Dict[str, Any]:
        system_map = {
            4: InteractionType.BACK,
            3: InteractionType.HOME,
            24: InteractionType.VOLUME_UP,
            25: InteractionType.VOLUME_DOWN,
        }
        interaction_type = system_map.get(keycode)

        # Serialize the entire key process to maintain order and consistency
        with self._adb_input_lock:
            if interaction_type:
                # Clear cached input XML since system key changes UI
                self._clear_input_xml_cache(session_id)

                xml_data = self._capture_xml(session_id)
                screenshot_data = self.adb_service.take_screenshot()

                if not self.adb_service.key_event(keycode):
                    return {"status": "error", "error": "Key event failed"}

                # Queue the interaction task inside the lock for complete atomicity
                task = InteractionTask(
                    session_id=session_id,
                    interaction_type=interaction_type,
                    pre_screenshot_data=screenshot_data,
                    xml_data=xml_data,
                    coordinates=None,
                    additional_data=None,
                    timestamp=datetime.now(),
                )
                self.interaction_queue.put(task)

                return {"status": "success", "keycode": keycode}

            # Non-system keys: each keystroke is its own INPUT interaction
            xml_data = self._capture_xml(session_id, use_cached=True)
            screenshot_data = self.adb_service.take_screenshot()
            if not self.adb_service.key_event(keycode):
                return {"status": "error", "error": "Key event failed"}

            # Queue the interaction task inside the lock for complete atomicity
            task = InteractionTask(
                session_id=session_id,
                interaction_type=InteractionType.INPUT,
                pre_screenshot_data=screenshot_data,
                xml_data=xml_data,
                coordinates=None,
                additional_data={"keycode": keycode},
                timestamp=datetime.now(),
            )
            self.interaction_queue.put(task)

        return {"status": "success", "keycode": keycode}

    def handle_input(self, session_id: str, text: str) -> Dict[str, Any]:
        # Serialize the entire input process to maintain order and consistency
        with self._adb_input_lock:
            xml_data = self._capture_xml(session_id, use_cached=True)
            screenshot_data = self.adb_service.take_screenshot()

            if not self.adb_service.input_text(text):
                return {"status": "error", "error": "Failed to send text input"}

            # Queue the interaction task inside the lock for complete atomicity
            task = InteractionTask(
                session_id=session_id,
                interaction_type=InteractionType.INPUT,
                pre_screenshot_data=screenshot_data,
                xml_data=xml_data,
                coordinates=None,
                additional_data={"text": text},
                timestamp=datetime.now(),
            )
            self.interaction_queue.put(task)

        return {"status": "success"}

    def _capture_xml(
        self,
        session_id: str,
        x: Optional[int] = None,
        y: Optional[int] = None,
        use_cached: bool = False,
    ) -> Optional[str]:
        with self._lock:
            # For input interactions, try to reuse previous XML data
            if use_cached and session_id in self.last_input_xml:
                xml_data, _ = self.last_input_xml[session_id]
                logger.debug(f"Reusing previous XML data for input interaction")
                return xml_data

            # Check throttling
            if self._should_skip_capture(session_id):
                return None

        try:
            if x is None or y is None:
                # Convert screen dimensions to integers before division
                screen_width = int(self.adb_service.screen_width)
                screen_height = int(self.adb_service.screen_height)
                x = screen_width // 2
                y = screen_height // 2

            # Capture XML hierarchy directly
            xml_data = self.adb_service.dump_ui_hierarchy()
            if xml_data:
                return xml_data
            else:
                logger.warning(
                    f"XML capture returned None - UI dump may have timed out"
                )
        except Exception as e:
            logger.warning(f"XML capture failed at ({x}, {y}): {e}")
        return None

    def _should_skip_capture(self, session_id: str) -> bool:
        """Check if we should skip capture due to throttling"""
        current_time = time.time() * 1000
        if session_id in self.last_dump_time:
            if current_time - self.last_dump_time[session_id] < self.dump_throttle_ms:
                return True

        self.last_dump_time[session_id] = current_time
        return False

    def _clear_input_xml_cache(self, session_id: str):
        """Clear cached XML for input interactions when UI changes"""
        with self._lock:
            if session_id in self.last_input_xml:
                del self.last_input_xml[session_id]
                logger.debug(f"Cleared input XML cache for session {session_id}")

    def clear_session_cache(self, session_id: str):
        """Clear all cached data for a session (call when session ends)"""
        with self._lock:
            if session_id in self.last_input_xml:
                del self.last_input_xml[session_id]
            if session_id in self.last_dump_time:
                del self.last_dump_time[session_id]
            logger.debug(f"Cleared all cache for session {session_id}")
