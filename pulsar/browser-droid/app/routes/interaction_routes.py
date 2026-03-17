from flask import Blueprint, request, jsonify
import logging

logger = logging.getLogger(__name__)


def create_interaction_blueprint(interaction_edge_service):
    """Create interaction blueprint with injected service"""
    interaction_bp = Blueprint("interaction", __name__, url_prefix="/interaction")

    @interaction_bp.route("/session/<session_id>/generate-edges", methods=["POST"])
    def generate_edges(session_id):
        """
        Generate edges for a session based on recorded interactions.

        This endpoint analyzes the interactions (taps, swipes) recorded during a session
        and generates edge descriptions using LLM analysis of before/after screenshots.
        The edges are added directly to graph.json.

        Request body (optional):
            {
                "product_id": "string" - Product ID for edge ID generation
            }

        Returns:
            {
                "status": "success" | "skipped" | "error",
                "edges": [...],
                "total_interactions": int,
                "matched_interactions": int,
                "edges_generated": int
            }
        """
        try:
            data = {}
            if request.is_json:
                data = request.get_json() or {}

            product_id = data.get("product_id", "")

            result = interaction_edge_service.generate_edges_for_session(
                session_id=session_id,
                product_id=product_id
            )

            if result.get("status") == "success":
                return jsonify(result)
            elif result.get("status") == "skipped":
                return jsonify(result), 200
            else:
                return jsonify(result), 400

        except Exception as e:
            logger.error(f"Error generating edges for session {session_id}: {e}")
            return jsonify({"error": str(e)}), 500

    @interaction_bp.route("/session/<session_id>/interactions", methods=["GET"])
    def get_interactions(session_id):
        """
        Get recorded interactions for a session.

        Returns the raw interaction data from interactions.json
        """
        try:
            import os
            import json

            session_dir = os.path.join("uploads", session_id)
            interactions_file = os.path.join(session_dir, "interactions.json")

            if not os.path.exists(interactions_file):
                return jsonify({
                    "error": "No interactions found for this session"
                }), 404

            with open(interactions_file, "r", encoding="utf-8") as f:
                interactions = json.load(f)

            return jsonify({
                "session_id": session_id,
                "total_interactions": len(interactions),
                "interactions": interactions
            })

        except Exception as e:
            logger.error(f"Error getting interactions for session {session_id}: {e}")
            return jsonify({"error": str(e)}), 500

    @interaction_bp.route("/session/<session_id>/edges", methods=["GET"])
    def get_edges(session_id):
        """
        Get generated edges for a session from graph.json.

        Returns edges that were generated for this session.
        """
        try:
            import os
            import json

            session_dir = os.path.join("uploads", session_id)
            graph_file = os.path.join(session_dir, "graph.json")

            if not os.path.exists(graph_file):
                return jsonify({
                    "error": "No graph found for this session"
                }), 404

            with open(graph_file, "r", encoding="utf-8") as f:
                graph_data = json.load(f)

            edges = graph_data.get("edges", [])
            nodes = graph_data.get("nodes", [])

            return jsonify({
                "session_id": session_id,
                "total_edges": len(edges),
                "total_nodes": len(nodes),
                "edges": edges,
                "nodes": nodes
            })

        except Exception as e:
            logger.error(f"Error getting edges for session {session_id}: {e}")
            return jsonify({"error": str(e)}), 500

    return interaction_bp
