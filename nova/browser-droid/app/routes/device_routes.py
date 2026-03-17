from flask import Blueprint, request, jsonify, Response
import logging
import os
import time
from app.services.interactions_handler import InteractionsHandler
from app.services.replay_service import ReplayService
from datetime import datetime
from ..processors.graph_builder import (
     build_node,
     position_nodes_in_grid
)
from ..processors.graph_uploader import (
    append_graph
)
logger = logging.getLogger(__name__)

# Global variables for swipe deduplication
last_swipe_time = 0
last_swipe_coordinates = None
swipe_cooldown_ms = 500  # 500ms cooldown between swipe requests


def create_device_blueprint(adb_service, recording_service, config=None):
    """Create device blueprint with injected service"""
    device_bp = Blueprint("device", __name__, url_prefix="/device")
    handler = InteractionsHandler(
        config=config,
        adb_service=adb_service,
        recording_service=recording_service,
    )
    replay_service = ReplayService(adb_service, config)

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
            # If session active, process interaction (xml + screenshot), else just ADB
            if recording_service.is_recording_active(session_id):
                result = handler.handle_tap(session_id, x, y)
            else:
                success = adb_service.tap(x, y)
                result = (
                    {"status": "success", "coordinates": [x, y]}
                    if success
                    else {"status": "error", "error": "Tap failed"}
                )
            status = result.get("status")
            http_code = 200 if status == "success" else 500
            return jsonify(result), http_code
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

            # If session active, process interaction; else just ADB
            if recording_service.is_recording_active(session_id):
                result = handler.handle_swipe(session_id, x1, y1, x2, y2, duration)
            else:
                success = adb_service.swipe(x1, y1, x2, y2, duration)
                result = (
                    {"status": "success", "swipe": [x1, y1, x2, y2, duration]}
                    if success
                    else {"status": "error", "error": "Swipe failed"}
                )
            status = result.get("status")
            http_code = 200 if status == "success" else 500
            return jsonify(result), http_code
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

            # If session active, process interaction; else just ADB
            if recording_service.is_recording_active(session_id):
                result = handler.handle_key(session_id, keycode)
            else:
                success = adb_service.key_event(keycode)
                result = (
                    {"status": "success", "keycode": keycode}
                    if success
                    else {"status": "error", "error": "Key event failed"}
                )
            status = result.get("status")
            http_code = 200 if status == "success" else 500
            return jsonify(result), http_code
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

            # If session active, process interaction; else just ADB
            if recording_service.is_recording_active(session_id):
                result = handler.handle_input(session_id, text)
            else:
                success = adb_service.input_text(text)
                result = (
                    {"status": "success"}
                    if success
                    else {"status": "error", "error": "Failed to send text input"}
                )
            status = result.get("status")
            http_code = 200 if status == "success" else 500
            return jsonify(result), http_code
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

    @device_bp.route("/replay", methods=["POST"])
    def replay_session():
        try:
            session_id = request.args.get("session_id")

            if not session_id:
                return jsonify({"error": "Session ID required"}), 400

            # Check if session directory exists
            session_dir = os.path.join(
                config.UPLOADS_DIR if config else "uploads", session_id
            )
            if not os.path.exists(session_dir):
                return jsonify({"error": f"Session {session_id} not found"}), 404

            # Execute replay
            result = replay_service.replay_session(session_id)

            if result.get("status") == "completed":
                return jsonify(result), 200
            else:
                return jsonify(result), 500

        except Exception as e:
            logger.error(f"Session replay error: {e}")
            return jsonify({"error": str(e)}), 500

    @device_bp.route("/screenshot/generate-nodes", methods=["POST"])
    def screenshot_generate_nodes():
        """Generate nodes from all screenshots for the session (for screenshot mode)"""
        session_id = request.args.get("session_id")
        product_id = request.args.get("product_id")
        if not session_id:
            return jsonify({"error": "Missing session_id"}), 400
        try:
            # Take one last screenshot before generating nodes
            screenshot_data = adb_service.take_screenshot()
            if screenshot_data is not None:
                recording_service.save_screenshot(session_id, screenshot_data, custom_filename=None)
                logger.info(f"Final screenshot taken before node generation for session {session_id}")
            # Find all screenshots for the session
            session_dir = os.path.join(recording_service.config.UPLOADS_DIR, session_id)
            screenshots_dir = os.path.join(session_dir, "screenshots")
            if not os.path.exists(screenshots_dir):
                return jsonify({"error": "No screenshots found"}), 404
            screenshots = [os.path.join(screenshots_dir, f) for f in os.listdir(screenshots_dir) if f.endswith('.png')]
            # Generate nodes (using graph_service if available)
            nodes = []
            for idx, ss_path in enumerate(sorted(screenshots)):
                logger.info(f"Processing screenshot for node generation: {ss_path}")
                node_id = f"node-{session_id}-{idx}"
                description = f"Screenshot {idx+1}"
                node = build_node(
                    node_id=node_id,
                    image_path=ss_path,
                    description=description,
                    session_id=session_id,
                )
                nodes.append(node)
            
            position_nodes_in_grid(nodes=nodes)
            # Save nodes to graph.json
            graph_path = os.path.join(session_dir, "recordnplay_graph.json")
            with open(graph_path, "w") as f:
                import json
                json.dump({"nodes": nodes, "edges": []}, f, indent=2)
            logger.info(f"Graph nodes generated for session {session_id}: {len(nodes)} nodes")
            append_graph(graph_path, session_id, product_id)
            return jsonify({"status": "success", "count": len(nodes), "graph": graph_path})
        except Exception as e:
            logger.error(f"Node generation error: {e}")
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
