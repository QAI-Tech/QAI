from flask import Blueprint, request, jsonify
import logging

logger = logging.getLogger(__name__)


def create_video_blueprint(video_slice_service):
    """Create video blueprint with injected service"""
    video_bp = Blueprint("video", __name__, url_prefix="/video")

    @video_bp.route("/slice/<session_id>", methods=["POST"])
    def slice_video(session_id):
        """Manually trigger video slicing for a session (for testing)"""
        try:
            if not session_id:
                return jsonify({"error": "Session ID required"}), 400

            result = video_slice_service.slice_video_by_annotations(session_id)
            if result.get("status") in ["success", "skipped"]:
                return jsonify(result)
            else:
                return jsonify(result), 500

        except Exception as e:
            logger.error(f"Error slicing video for session {session_id}: {e}")
            return jsonify({"error": str(e)}), 500

    return video_bp
