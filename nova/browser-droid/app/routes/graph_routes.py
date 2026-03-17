from flask import Blueprint, request, jsonify
import logging

logger = logging.getLogger(__name__)


def create_graph_blueprint(graph_service):
    graph_bp = Blueprint("graph", __name__, url_prefix="/graph")

    @graph_bp.route("/describe-transition", methods=["POST"])
    def describe_transition():
        try:
            data = request.get_json() or {}
            before_image = data.get("before_image")
            after_image = data.get("after_image")
            bounding_box = data.get("bounding_box")
            action = data.get("action")
            is_web = data.get("is_web", False)

            if not before_image or not after_image or not bounding_box or not action:
                return (
                    jsonify(
                        {
                            "error": "before_image, after_image, bounding_box and action are required"
                        }
                    ),
                    400,
                )

            result = graph_service.describe_transition_action(
                before_image, after_image, bounding_box, action, is_web
            )

            status_code = 200 if result.get("status") == "success" else 500
            return jsonify(result), status_code

        except Exception as e:
            logger.error(f"Error describing transition: {e}")
            return jsonify({"error": str(e)}), 500

    return graph_bp
