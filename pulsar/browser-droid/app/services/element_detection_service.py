import os
import logging
import threading
import time
from datetime import datetime
from typing import Optional, Dict, Any, List
import xml.etree.ElementTree as ET

logger = logging.getLogger(__name__)


class ElementDetectionService:
    """Service for detecting UI elements during active sessions"""

    def __init__(self, config, adb_service, recording_service):
        self.config = config
        self.adb_service = adb_service
        self.recording_service = recording_service
        self.last_dump_time = {}  # session_id -> timestamp for throttling
        self.dump_throttle_ms = 1000  # Max 1 dump per second per session

    def capture_ui_state_sync(
        self, session_id: str, click_x: int, click_y: int
    ) -> Optional[Dict[str, Any]]:
        """Capture UI state synchronously before tap"""
        # Temporarily bypass session check for testing
        # if not self._is_session_active(session_id):
        #     return None

        # Check throttling
        if self._should_skip_capture(session_id):
            return None

        try:
            # Capture both XML hierarchy and screenshot
            xml_data = self.adb_service.dump_ui_hierarchy()
            screenshot_data = self.adb_service.take_screenshot()

            if xml_data and screenshot_data:
                return {
                    "timestamp": datetime.now().isoformat(),
                    "session_id": session_id,
                    "click_coordinates": {"x": click_x, "y": click_y},
                    "xml_hierarchy": xml_data,
                    "screenshot_data": screenshot_data,
                    "screen_resolution": {
                        "width": self.adb_service.screen_width,
                        "height": self.adb_service.screen_height,
                    },
                }
            else:
                logger.warning("Failed to capture complete UI state")
                return None

        except Exception as e:
            logger.error(f"UI state capture failed: {e}")
            return None

    def save_xml_hierarchy(self, session_id: str, xml_data: str) -> Optional[str]:
        """Save XML hierarchy and return filename"""
        try:
            session_dir = self._get_session_directory(session_id)
            xml_dir = os.path.join(session_dir, "xml_hierarchies")
            os.makedirs(xml_dir, exist_ok=True)

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[
                :-3
            ]  # Include milliseconds
            filename = f"ui_hierarchy_{timestamp}.xml"
            filepath = os.path.join(xml_dir, filename)

            with open(filepath, "w", encoding="utf-8") as f:
                f.write(xml_data)

            return filename

        except Exception as e:
            logger.error(f"Failed to save XML hierarchy: {e}")
            return None

    def _is_session_active(self, session_id: str) -> bool:
        """Check if session is currently active"""
        return self.recording_service.is_recording_active(session_id)

    def _should_skip_capture(self, session_id: str) -> bool:
        """Check if we should skip capture due to throttling"""
        current_time = time.time() * 1000
        if session_id in self.last_dump_time:
            if current_time - self.last_dump_time[session_id] < self.dump_throttle_ms:
                return True

        self.last_dump_time[session_id] = current_time
        return False

    def _get_session_directory(self, session_id: str) -> str:
        """Get session directory for storing element data"""
        session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
        os.makedirs(session_dir, exist_ok=True)
        return session_dir

    def _parse_ui_hierarchy(self, xml_data: str) -> List[Dict[str, Any]]:
        """Parse XML hierarchy and extract elements"""
        try:
            logger.info(f"Parsing UI hierarchy XML (length: {len(xml_data)} chars)")
            root = ET.fromstring(xml_data)
            elements = []

            def extract_elements(node, parent_bounds=None):
                # Extract element attributes
                element = {
                    "bounds": self._parse_bounds(node.get("bounds", "")),
                    "clickable": node.get("clickable", "false").lower() == "true",
                    "visible": node.get("visible", "false").lower() == "true",
                    "enabled": node.get("enabled", "false").lower() == "true",
                    "resource_id": node.get("resource-id", ""),
                    "class_name": node.get("class", ""),
                    "content_desc": node.get("content-desc", ""),
                    "text": node.get("text", ""),
                    "drawing_order": int(node.get("drawing-order", "0")),
                }

                # Determine element type based on class name
                element["element_type"] = self._determine_element_type(
                    element["class_name"]
                )

                # Generate element ID
                element["element_id"] = self._generate_element_id(element)

                elements.append(element)

                # Process children
                for child in node:
                    extract_elements(child, element["bounds"])

            extract_elements(root)
            logger.info(f"Successfully parsed {len(elements)} elements from XML")
            return elements

        except Exception as e:
            logger.error(f"Failed to parse UI hierarchy: {e}")
            return []

    def _parse_bounds(self, bounds_str: str) -> Dict[str, int]:
        """Parse bounds string '[x1,y1][x2,y2]' to dict"""
        try:
            if not bounds_str or bounds_str == "[]":
                return {"x": 0, "y": 0, "width": 0, "height": 0}

            # Handle bounds format: [x1,y1][x2,y2]
            import re

            # Use regex to extract the two coordinate pairs
            pattern = r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]"
            match = re.match(pattern, bounds_str)

            if match:
                x1, y1, x2, y2 = map(int, match.groups())

                result = {
                    "x": min(x1, x2),
                    "y": min(y1, y2),
                    "width": abs(x2 - x1),
                    "height": abs(y2 - y1),
                }

                # Debug logging for bounds parsing
                if result["width"] > 0 and result["height"] > 0:
                    logger.info(f"Parsed bounds '{bounds_str}' -> {result}")

                return result
            else:
                logger.warning(f"Could not parse bounds format: '{bounds_str}'")
                return {"x": 0, "y": 0, "width": 0, "height": 0}

        except Exception as e:
            logger.error(f"Failed to parse bounds '{bounds_str}': {e}")
            return {"x": 0, "y": 0, "width": 0, "height": 0}

    def _determine_element_type(self, class_name: str) -> str:
        """Determine element type based on class name"""
        if "Button" in class_name:
            return "button"
        elif "EditText" in class_name:
            return "text_field"
        elif "TextView" in class_name:
            return "text"
        elif "ImageView" in class_name:
            return "image"
        elif "RecyclerView" in class_name or "ListView" in class_name:
            return "list"
        elif (
            "LinearLayout" in class_name
            or "RelativeLayout" in class_name
            or "FrameLayout" in class_name
        ):
            return "container"
        else:
            return "unknown"

    def _generate_element_id(self, element: Dict[str, Any]) -> str:
        """Generate a unique element ID"""
        if element["resource_id"]:
            return element["resource_id"]
        elif element["content_desc"]:
            return f"desc_{element['content_desc'][:20]}"
        elif element["text"]:
            return f"text_{element['text'][:20]}"
        else:
            return f"{element['element_type']}_{element['bounds']['x']}_{element['bounds']['y']}"

    def _find_element_at_coordinates(
        self, elements: List[Dict[str, Any]], click_x: int, click_y: int
    ) -> Optional[Dict[str, Any]]:
        """Find element at the given coordinates"""
        # Find the element with the lowest drawing order (frontmost) that contains the click coordinates
        best_element = None
        lowest_drawing_order = float("inf")
        matching_elements = []

        for element in elements:
            bounds = element["bounds"]
            if (
                bounds["x"] <= click_x <= bounds["x"] + bounds["width"]
                and bounds["y"] <= click_y <= bounds["y"] + bounds["height"]
            ):
                drawing_order = element.get("drawing_order", 0)
                matching_elements.append((element, drawing_order))

                if drawing_order < lowest_drawing_order:
                    lowest_drawing_order = drawing_order
                    best_element = element

        # Debug logging
        if matching_elements:
            logger.info(
                f"Found {len(matching_elements)} elements at ({click_x}, {click_y})"
            )
            for element, drawing_order in matching_elements[:5]:  # Show first 5
                logger.info(
                    f"  - {element.get('element_id', 'unknown')} (drawing_order: {drawing_order}, clickable: {element.get('clickable', False)})"
                )

        # Find the best clickable element with lowest drawing order (highest z-index)
        best_clickable_element = None
        best_clickable_drawing_order = float("inf")

        for element, drawing_order in matching_elements:
            if element.get("clickable", False):
                if drawing_order < best_clickable_drawing_order:
                    best_clickable_drawing_order = drawing_order
                    best_clickable_element = element

        # Prefer clickable elements over non-clickable ones
        if best_clickable_element:
            logger.info(
                f"Selected clickable: {best_clickable_element.get('element_id', 'unknown')} (drawing_order: {best_clickable_drawing_order})"
            )
            return best_clickable_element
        else:
            # Fall back to the lowest drawing order element if no clickable elements found
            if best_element:
                logger.info(
                    f"Selected non-clickable: {best_element.get('element_id', 'unknown')} (drawing_order: {lowest_drawing_order})"
                )
            return best_element

    def _save_xml_hierarchy(self, session_id: str, xml_data: str) -> Optional[str]:
        """Save XML hierarchy and return filename"""
        try:
            session_dir = self._get_session_directory(session_id)
            xml_dir = os.path.join(session_dir, "xml_hierarchies")
            os.makedirs(xml_dir, exist_ok=True)

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[
                :-3
            ]  # Include milliseconds
            filename = f"ui_hierarchy_{timestamp}.xml"
            filepath = os.path.join(xml_dir, filename)

            with open(filepath, "w", encoding="utf-8") as f:
                f.write(xml_data)

            return filename

        except Exception as e:
            logger.error(f"Failed to save XML hierarchy: {e}")
            return None
