from flask import Blueprint, request, jsonify
import logging

logger = logging.getLogger(__name__)


def create_orchestrator_blueprint(session_orchestrator):
    """Create orchestrator blueprint with injected service"""
    orchestrator_bp = Blueprint("orchestrator", __name__, url_prefix="/orchestrator")

    @orchestrator_bp.route("/session/<session_id>/process", methods=["POST"])
    def process_session(session_id):
        """Process session on demand with optional cache busting and product ID"""
        try:
            # Handle JSON data gracefully - don't require Content-Type for empty requests
            data = {}
            if request.is_json:
                data = request.get_json() or {}
            elif request.content_type and "application/json" in request.content_type:
                try:
                    data = request.get_json() or {}
                except:
                    data = {}

            reset_cache = data.get("reset_cache", False)
            product_id = data.get("product_id", "")

            # Handle string values from query parameters
            if isinstance(reset_cache, str):
                reset_cache = reset_cache.lower() in ("true", "1", "yes", "on")

            result = session_orchestrator.start_session_processing(
                session_id=session_id, reset_cache=reset_cache, product_id=product_id
            )

            if result.get("status") in ["started", "queued"]:
                return jsonify(
                    {
                        **result,
                        "reset_cache": reset_cache,
                        "message": f"Session processing {result.get('status')} with reset_cache={reset_cache}",
                    }
                )
            else:
                return jsonify(result), 400

        except Exception as e:
            logger.error(f"Error processing session {session_id}: {e}")
            return jsonify({"error": str(e)}), 500

    @orchestrator_bp.route("/session/status", methods=["GET"])
    def get_session_status():
        """Get current session processing status for all sessions"""
        try:
            status = session_orchestrator.get_status()
            return jsonify(status)

        except Exception as e:
            logger.error(f"Error getting session status: {e}")
            return jsonify({"error": str(e)}), 500

    @orchestrator_bp.route("/session/<session_id>/status", methods=["GET"])
    def get_specific_session_status(session_id):
        """Get status for a specific session"""
        try:
            status = session_orchestrator.get_session_status(session_id)
            return jsonify(status)

        except Exception as e:
            logger.error(f"Error getting session status for {session_id}: {e}")
            return jsonify({"error": str(e)}), 500

    @orchestrator_bp.route("/session/<session_id>/results", methods=["GET"])
    def get_session_results(session_id):
        """Get processing results for a specific session"""
        try:
            import os
            import json

            # Load processing results from file
            session_dir = os.path.join("uploads", session_id)
            results_file = os.path.join(session_dir, "processing_results.json")

            if not os.path.exists(results_file):
                return (
                    jsonify({"error": "No processing results found for this session"}),
                    404,
                )

            with open(results_file, "r") as f:
                results = json.load(f)

            return jsonify(results)

        except Exception as e:
            logger.error(f"Error getting session results for {session_id}: {e}")
            return jsonify({"error": str(e)}), 500

    return orchestrator_bp
