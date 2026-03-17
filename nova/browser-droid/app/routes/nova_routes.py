from flask import Blueprint, request, jsonify
import logging
import json
import subprocess
from app.services.streaming_service import StreamingService
import threading

logger = logging.getLogger(__name__)


def create_nova_routes(streaming_service: StreamingService):
    """Create nova blueprint with injected service"""
    nova_bp = Blueprint("nova", __name__, url_prefix="/nova")

    @nova_bp.route("/trigger", methods=["POST"])
    def trigger_nova():
        """Upload audio recording from frontend (fire and forget)"""
        try:
            data = request.get_json()
            nova_params_str = data.get("nova_params")
            if not nova_params_str:
                return jsonify({"error": "Missing nova_params in request body"}), 400
            try:
                nova_params = json.loads(nova_params_str)
                if nova_params:
                    cmd = [
                        "python3",
                        "../main.py",
                        "--testing_request",
                        json.dumps(nova_params),
                    ]
                    print(f"\nExecuting command: {' '.join(cmd)} (fire and forget)")
                    streaming_service.pause_play_video_controls(pause=True)
                    proc = subprocess.Popen(cmd)
                    def resume_controls_when_done(proc, streaming_service):
                        proc.wait()
                        streaming_service.pause_play_video_controls(pause=False)
                    threading.Thread(target=resume_controls_when_done, args=(proc, streaming_service), daemon=True).start()
            except Exception as e:
                return jsonify({"error": f"Invalid JSON in nova_params: {e}"}), 400
            # Immediately return success, do not wait for process
            return jsonify({"status": "started", "parsed_nova_params": nova_params})
        except Exception as e:
            logger.error(f"nova_params error: {e}")
            return jsonify({"error": str(e)}), 500

    return nova_bp
