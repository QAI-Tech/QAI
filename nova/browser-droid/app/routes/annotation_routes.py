from flask import Blueprint, request, jsonify
import logging

logger = logging.getLogger(__name__)


def create_annotation_blueprint(annotation_service):
    """Create annotation blueprint with injected service"""
    annotation_bp = Blueprint("annotation", __name__, url_prefix="/annotations")

    @annotation_bp.route("/add", methods=["POST"])
    def add_annotation():
        """Add an annotation to a session"""
        try:
            data = request.get_json()
            session_id = data.get("session_id")

            if not session_id:
                return jsonify({"error": "Session ID required"}), 400

            result = annotation_service.add_annotation(session_id)
            if result.get("status") == "success":
                return jsonify(result)
            else:
                return jsonify(result), 400

        except Exception as e:
            logger.error(f"Error adding annotation: {e}")
            return jsonify({"error": str(e)}), 500

    @annotation_bp.route("/<session_id>")
    def get_annotations(session_id):
        """Get all annotations for a specific session"""
        try:
            result = annotation_service.get_annotations(session_id)
            if "error" in result:
                return jsonify(result), 500
            return jsonify(result)

        except Exception as e:
            logger.error(f"Error getting annotations for session {session_id}: {e}")
            return jsonify({"error": str(e)}), 500

    @annotation_bp.route("/<session_id>/intervals")
    def get_transcription_intervals(session_id):
        """Get transcription-annotation interval mapping for a session and save to file"""
        try:
            result = annotation_service.get_transcription_intervals(session_id)
            if "error" in result:
                return jsonify(result), 500
            return jsonify(result)

        except Exception as e:
            logger.error(
                f"Error getting transcription intervals for session {session_id}: {e}"
            )
            return jsonify({"error": str(e)}), 500

    return annotation_bp
