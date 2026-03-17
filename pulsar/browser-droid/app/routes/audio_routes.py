from flask import Blueprint, request, jsonify
import logging

logger = logging.getLogger(__name__)


def create_audio_blueprint(audio_service):
    """Create audio blueprint with injected service"""
    audio_bp = Blueprint("audio", __name__, url_prefix="/audio")

    @audio_bp.route("/upload", methods=["POST"])
    def upload_audio():
        """Upload audio recording from frontend"""
        try:
            if "audio" not in request.files:
                return jsonify({"error": "No audio file uploaded"}), 400

            audio_file = request.files["audio"]
            session_id = request.args.get("session_id")

            result = audio_service.upload_audio(audio_file, session_id)
            if result.get("status") == "success":
                return jsonify(result)
            else:
                return jsonify(result), 400

        except Exception as e:
            logger.error(f"Audio upload error: {e}")
            return jsonify({"error": str(e)}), 500

    return audio_bp
