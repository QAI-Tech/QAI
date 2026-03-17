from flask import Blueprint, request, jsonify, Response
import logging
import os
import threading
import time
from datetime import datetime
from app.services.recording_service import InteractionType

logger = logging.getLogger(__name__)

# Global variables for swipe deduplication
last_swipe_time = 0
last_swipe_coordinates = None
swipe_cooldown_ms = 500  # 500ms cooldown between swipe requests


def create_device_blueprint(
    adb_service, recording_service, config=None, element_detection_service=None
):
    """Create device blueprint with injected service"""
    device_bp = Blueprint("device", __name__, url_prefix="/device")

    @device_bp.route("/screenshot")
    def screenshot():
        """Take a screenshot of the device"""
        try:
            screenshot_data = adb_service.take_screenshot()
            if screenshot_data is not None:
                return Response(screenshot_data, mimetype="image/png")
            else:
                return jsonify({"error": "Screenshot failed"}), 500
        except Exception as e:
            logger.error(f"Screenshot error: {e}")
            return jsonify({"error": str(e)}), 500

    @device_bp.route("/tap", methods=["POST"])
    def tap():
        """Handle tap input"""
        x = request.args.get("x")
        y = request.args.get("y")
        if not x or not y:
            return jsonify({"error": "Missing x or y coordinates"}), 400

        try:
            x, y = int(x), int(y)

            session_id = recording_service.get_current_session_id()

            screenshot_data = None
            screenshot_data = adb_service.take_screenshot()

            # Execute tap on device
            if adb_service.tap(x, y):
                # Process captured data asynchronously
                if screenshot_data:

                    def process_async():
                        try:
                            # 1. Save screenshot
                            screenshot_filename = recording_service.save_screenshot(
                                session_id, screenshot_data
                            )

                            # 2. Store interaction data
                            recording_service.store_interaction(
                                session_id,
                                InteractionType.TAP,
                                screenshot_filename,
                                coordinates=[x, y],
                            )
                        except Exception as e:
                            logger.error(f"Async processing failed: {e}")

                    # Start background thread
                    thread = threading.Thread(target=process_async, daemon=True)
                    thread.start()

                return jsonify(
                    {
                        "status": "success",
                        "coordinates": [x, y],
                        "screenshot_capture": (
                            "completed" if screenshot_data else "skipped"
                        ),
                    }
                )
            else:
                return jsonify({"status": "error", "error": "Tap failed"}), 500
        except ValueError:
            return jsonify({"error": "Invalid coordinates"}), 400

    @device_bp.route("/swipe", methods=["POST"])
    def swipe():
        """Handle swipe input with deduplication"""
        global last_swipe_time, last_swipe_coordinates

        data = request.get_json()
        if not data or not all(k in data for k in ["x1", "y1", "x2", "y2", "duration"]):
            return jsonify({"error": "Missing swipe parameters"}), 400

        try:
            x1, y1 = int(data["x1"]), int(data["y1"])
            x2, y2 = int(data["x2"]), int(data["y2"])
            duration = int(data["duration"])

            current_time = time.time() * 1000  # Convert to milliseconds
            current_coordinates = (x1, y1, x2, y2)

            # Check if this is a duplicate or too recent swipe
            if (
                current_time - last_swipe_time < swipe_cooldown_ms
                or current_coordinates == last_swipe_coordinates
            ):
                logger.info(
                    f"Swipe request ignored - too recent or duplicate: {current_coordinates}"
                )
                return (
                    jsonify(
                        {
                            "status": "ignored",
                            "message": "Swipe request ignored due to cooldown or duplication",
                            "swipe": [x1, y1, x2, y2, duration],
                        }
                    ),
                    200,
                )

            # Update tracking variables
            last_swipe_time = current_time
            last_swipe_coordinates = current_coordinates

            # Get current session ID (with fallback to test session)
            session_id = recording_service.get_current_session_id()

            # Capture screenshot before action
            screenshot_data = adb_service.take_screenshot()

            if adb_service.swipe(x1, y1, x2, y2, duration):
                # Process captured data asynchronously
                if screenshot_data:

                    def process_async():
                        try:
                            # 1. Save screenshot
                            screenshot_filename = recording_service.save_screenshot(
                                session_id, screenshot_data
                            )
                            # 2. Store interaction data
                            recording_service.store_interaction(
                                session_id,
                                InteractionType.SWIPE,
                                screenshot_filename,
                                coordinates=[x1, y1, x2, y2],
                                additional_data={"duration": duration},
                            )
                        except Exception as e:
                            logger.error(f"Async processing failed: {e}")

                    # Start background thread
                    thread = threading.Thread(target=process_async, daemon=True)
                    thread.start()

                logger.info(f"Swipe executed successfully: {current_coordinates}")
                return jsonify(
                    {"status": "success", "swipe": [x1, y1, x2, y2, duration]}
                )
            else:
                return jsonify({"status": "error", "error": "Swipe failed"}), 500
        except ValueError:
            return jsonify({"error": "Invalid swipe parameters"}), 400

    @device_bp.route("/key", methods=["POST"])
    def key_event():
        """Handle key events"""
        data = request.get_json()
        if not data or "keycode" not in data:
            return jsonify({"error": "Missing keycode"}), 400

        try:
            keycode = int(data["keycode"])

            session_id = recording_service.get_current_session_id()

            # Determine interaction type based on keycode
            interaction_type = None
            if keycode == 4:  # KEYCODE_BACK
                interaction_type = InteractionType.BACK
            elif keycode == 3:  # KEYCODE_HOME
                interaction_type = InteractionType.HOME
            elif keycode == 24:  # KEYCODE_VOLUME_UP
                interaction_type = InteractionType.VOLUME_UP
            elif keycode == 25:  # KEYCODE_VOLUME_DOWN
                interaction_type = InteractionType.VOLUME_DOWN

            if interaction_type:
                # Capture screenshot before action
                screenshot_data = adb_service.take_screenshot()

            # Execute key event
            if adb_service.key_event(keycode):
                # Process captured data asynchronously only for tracked interactions
                if interaction_type and screenshot_data:

                    def process_async():
                        try:
                            # 1. Save screenshot
                            screenshot_filename = recording_service.save_screenshot(
                                session_id, screenshot_data
                            )
                            # 2. Store interaction data
                            recording_service.store_interaction(
                                session_id,
                                interaction_type,
                                screenshot_filename,
                            )
                        except Exception as e:
                            logger.error(f"Async processing failed: {e}")

                    # Start background thread
                    thread = threading.Thread(target=process_async, daemon=True)
                    thread.start()

                return jsonify({"status": "success", "keycode": keycode})
            else:
                return jsonify({"status": "error", "error": "Key event failed"}), 500
        except ValueError:
            return jsonify({"error": "Invalid keycode"}), 400

    @device_bp.route("/input", methods=["POST"])
    def input_text():
        """Send text input to device"""
        try:
            data = request.get_json()
            text = data.get("text")
            if text is None:
                return jsonify({"status": "error", "error": "Text is required"}), 400

            session_id = recording_service.get_current_session_id()

            # Capture screenshot before action
            screenshot_data = adb_service.take_screenshot()

            if adb_service.input_text(text):
                # Process captured data asynchronously
                if screenshot_data:

                    def process_async():
                        try:
                            # 1. Save screenshot
                            screenshot_filename = recording_service.save_screenshot(
                                session_id, screenshot_data
                            )
                            # 2. Store interaction data
                            recording_service.store_interaction(
                                session_id,
                                InteractionType.INPUT,
                                screenshot_filename,
                                additional_data={"text": text},
                            )
                        except Exception as e:
                            logger.error(f"Async processing failed: {e}")

                    # Start background thread
                    thread = threading.Thread(target=process_async, daemon=True)
                    thread.start()

                return jsonify({"status": "success"})
            else:
                return (
                    jsonify({"status": "error", "error": "Failed to send text input"}),
                    500,
                )
        except Exception as e:
            logger.error(f"Text input error: {e}")
            return jsonify({"status": "error", "error": str(e)}), 500

    @device_bp.route("/cut", methods=["POST"])
    def cut_text():
        """Cut selected text on device"""
        try:
            if adb_service.cut_text():
                return jsonify({"status": "success"})
            else:
                return jsonify({"status": "error", "error": "Failed to cut text"}), 500
        except Exception as e:
            logger.error(f"Cut error: {e}")
            return jsonify({"status": "error", "error": str(e)}), 500

    @device_bp.route("/copy", methods=["POST"])
    def copy_text():
        """Copy selected text on device"""
        try:
            if adb_service.copy_text():
                return jsonify({"status": "success"})
            else:
                return jsonify({"status": "error", "error": "Failed to copy text"}), 500
        except Exception as e:
            logger.error(f"Copy error: {e}")
            return jsonify({"status": "error", "error": str(e)}), 500

    @device_bp.route("/paste", methods=["POST"])
    def paste_text():
        """Paste text on device"""
        try:
            if adb_service.paste_text():
                return jsonify({"status": "success"})
            else:
                return (
                    jsonify({"status": "error", "error": "Failed to paste text"}),
                    500,
                )
        except Exception as e:
            logger.error(f"Paste error: {e}")
            return jsonify({"status": "error", "error": str(e)}), 500

    # Recording endpoints
    @device_bp.route("/record/start", methods=["POST"])
    def start_recording():
        """Start screen recording"""
        try:
            result = recording_service.start_recording()
            if result.get("status") == "recording started":
                return jsonify(result)
            else:
                return jsonify(result), 500
        except Exception as e:
            logger.error(f"Recording start error: {e}")
            return jsonify({"status": "error", "error": str(e)}), 500

    @device_bp.route("/record/stop", methods=["POST"])
    def stop_recording():
        """Stop recording and save the video with timestamp"""
        try:
            session_id = request.args.get("session_id")
            product_id = request.args.get("product_id")
            if not session_id:
                return jsonify({"error": "Session ID required"}), 400

            result = recording_service.stop_recording(session_id, product_id)
            if result.get("status") == "success":
                return jsonify(result)
            else:
                return jsonify(result), 500
        except Exception as e:
            logger.error(f"Recording stop error: {e}")
            return jsonify({"error": str(e)}), 500

    # Device management endpoints
    if config:

        @device_bp.route("/install", methods=["POST"])
        def install_apk():
            """Install APK on device"""
            if "file" not in request.files:
                return jsonify({"error": "No file uploaded"}), 400

            file = request.files["file"]
            if not file.filename.endswith(".apk"):
                return jsonify({"error": "File must be an APK"}), 400

            apk_path = os.path.join(config.APK_DIR, file.filename)
            file.save(apk_path)

            output = adb_service.install_apk(apk_path)
            if output is not None:
                return jsonify({"status": "success", "output": output})
            else:
                return jsonify({"status": "error", "error": "Installation failed"}), 500

        @device_bp.route("/refresh-resolution", methods=["POST"])
        def refresh_resolution():
            """Manually refresh the screen resolution"""
            if adb_service.get_screen_resolution():
                screen_width, screen_height = adb_service.get_screen_resolution_info()
                return jsonify(
                    {
                        "status": "success",
                        "resolution": {
                            "width": int(screen_width),
                            "height": int(screen_height),
                        },
                    }
                )
            else:
                return (
                    jsonify(
                        {"status": "error", "error": "Failed to get screen resolution"}
                    ),
                    500,
                )

    return device_bp
