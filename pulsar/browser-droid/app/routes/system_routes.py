from flask import Blueprint, request, jsonify, send_file
import os
import logging

logger = logging.getLogger(__name__)


def create_system_blueprint(adb_service, recording_service, streaming_service, config):
    """Create system blueprint with injected services"""
    system_bp = Blueprint("system", __name__)

    @system_bp.route("/")
    def index():
        """Serve the main HTML page"""
        return send_file("index.html")

    @system_bp.route("/status")
    def get_status():
        """Get system status"""
        try:
            screen_width, screen_height = adb_service.get_screen_resolution_info()
            recording_status = recording_service.get_recording_status()
            return jsonify(
                {
                    "adb_connected": adb_service.check_adb_connection(),
                    "streaming_active": streaming_service.get_streaming_status(),
                    "screen_resolution": {
                        "width": int(screen_width),
                        "height": int(screen_height),
                    },
                    "current_recording_session_id": recording_status[
                        "current_recording_session_id"
                    ],
                    "current_recording_start_time": recording_status[
                        "current_recording_start_time"
                    ],
                }
            )
        except Exception as e:
            logger.error(f"Status endpoint error: {e}")
            return jsonify({"error": "Status check failed"}), 500

    return system_bp
