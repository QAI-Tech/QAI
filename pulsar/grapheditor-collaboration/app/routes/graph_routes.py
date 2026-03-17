from flask import Blueprint, request, jsonify
import logging

logger = logging.getLogger(__name__)

#DEPRECATED
def create_graph_routes(graph_service):
    """Create graph-related HTTP routes"""
    
    graph_bp = Blueprint('graph', __name__, url_prefix='/api/graph')

    @graph_bp.route('/save', methods=['POST'])
    def save_complete_graph():
        """Save complete graph data (nodes, edges, features, flows, comments)"""
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({'error': 'No JSON data provided'}), 400
            
            product_id = data.get('product_id')
            if not product_id:
                return jsonify({'error': 'product_id is required'}), 400
            
            # Validate required data fields
            required_fields = ['graph_data', 'features_data', 'flows_data', 'comments_data']
            for field in required_fields:
                if field not in data:
                    return jsonify({'error': f'{field} is required'}), 400
            
            # Save to GCS
            result = graph_service.save_graph_data(product_id, data)
            
            if result['success']:
                return jsonify(result), 200
            else:
                return jsonify(result), 500
                
        except Exception as e:
            logger.error(f"Error in save_complete_graph: {e}")
            return jsonify({
                'success': False,
                'message': 'Internal server error',
                'error': str(e)
            }), 500

    @graph_bp.route('/load/<product_id>', methods=['GET'])
    def load_complete_graph(product_id):
        """Load complete graph data"""
        try:
            if not product_id:
                return jsonify({'error': 'product_id is required'}), 400
            
            result = graph_service.load_graph_data(product_id)
            
            if result['success']:
                return jsonify(result), 200
            else:
                return jsonify(result), 500
                
        except Exception as e:
            logger.error(f"Error in load_complete_graph: {e}")
            return jsonify({
                'success': False,
                'message': 'Internal server error',
                'error': str(e)
            }), 500

    @graph_bp.route('/save-nodes-edges', methods=['POST'])
    def save_nodes_edges():
        """Save only nodes and edges data"""
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({'error': 'No JSON data provided'}), 400
            
            product_id = data.get('product_id')
            if not product_id:
                return jsonify({'error': 'product_id is required'}), 400
            
            graph_data = {
                'nodes': data.get('nodes', []),
                'edges': data.get('edges', [])
            }
            
            result = graph_service.save_individual_data(product_id, 'graph', graph_data)
            
            if result['success']:
                return jsonify(result), 200
            else:
                return jsonify(result), 500
                
        except Exception as e:
            logger.error(f"Error in save_nodes_edges: {e}")
            return jsonify({
                'success': False,
                'message': 'Internal server error',
                'error': str(e)
            }), 500

    @graph_bp.route('/save-features', methods=['POST'])
    def save_features():
        """Save features data"""
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({'error': 'No JSON data provided'}), 400
            
            product_id = data.get('product_id')
            if not product_id:
                return jsonify({'error': 'product_id is required'}), 400
            
            features_data = {
                'features': data.get('features', []),
                'exportedAt': data.get('exportedAt') or graph_service._get_default_data('features')['exportedAt']
            }
            
            result = graph_service.save_individual_data(product_id, 'features', features_data)
            
            if result['success']:
                return jsonify(result), 200
            else:
                return jsonify(result), 500
                
        except Exception as e:
            logger.error(f"Error in save_features: {e}")
            return jsonify({
                'success': False,
                'message': 'Internal server error',
                'error': str(e)
            }), 500

    @graph_bp.route('/save-flows', methods=['POST'])
    def save_flows():
        """Save flows data"""
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({'error': 'No JSON data provided'}), 400
            
            product_id = data.get('product_id')
            if not product_id:
                return jsonify({'error': 'product_id is required'}), 400
            
            flows_data = {
                'flows': data.get('flows', [])
            }
            
            result = graph_service.save_individual_data(product_id, 'flows', flows_data)
            
            if result['success']:
                return jsonify(result), 200
            else:
                return jsonify(result), 500
                
        except Exception as e:
            logger.error(f"Error in save_flows: {e}")
            return jsonify({
                'success': False,
                'message': 'Internal server error',
                'error': str(e)
            }), 500

    @graph_bp.route('/save-comments', methods=['POST'])
    def save_comments():
        """Save comments data"""
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({'error': 'No JSON data provided'}), 400
            
            product_id = data.get('product_id')
            if not product_id:
                return jsonify({'error': 'product_id is required'}), 400
            
            comments_data = {
                'comments': data.get('comments', []),
                'exportedAt': data.get('exportedAt') or graph_service._get_default_data('comments')['exportedAt']
            }
            
            result = graph_service.save_individual_data(product_id, 'comments', comments_data)
            
            if result['success']:
                return jsonify(result), 200
            else:
                return jsonify(result), 500
                
        except Exception as e:
            logger.error(f"Error in save_comments: {e}")
            return jsonify({
                'success': False,
                'message': 'Internal server error',
                'error': str(e)
            }), 500

    @graph_bp.route('/load-nodes-edges/<product_id>', methods=['GET'])
    def load_nodes_edges(product_id):
        """Load only nodes and edges data"""
        try:
            if not product_id:
                return jsonify({'error': 'product_id is required'}), 400
            
            result = graph_service.load_individual_data(product_id, 'graph')
            
            if result['success']:
                return jsonify(result), 200
            else:
                return jsonify(result), 500
                
        except Exception as e:
            logger.error(f"Error in load_nodes_edges: {e}")
            return jsonify({
                'success': False,
                'message': 'Internal server error',
                'error': str(e)
            }), 500

    @graph_bp.route('/load-features/<product_id>', methods=['GET'])
    def load_features(product_id):
        """Load features data"""
        try:
            if not product_id:
                return jsonify({'error': 'product_id is required'}), 400
            
            result = graph_service.load_individual_data(product_id, 'features')
            
            if result['success']:
                return jsonify(result), 200
            else:
                return jsonify(result), 500
                
        except Exception as e:
            logger.error(f"Error in load_features: {e}")
            return jsonify({
                'success': False,
                'message': 'Internal server error',
                'error': str(e)
            }), 500

    @graph_bp.route('/load-flows/<product_id>', methods=['GET'])
    def load_flows(product_id):
        """Load flows data"""
        try:
            if not product_id:
                return jsonify({'error': 'product_id is required'}), 400
            
            result = graph_service.load_individual_data(product_id, 'flows')
            
            if result['success']:
                return jsonify(result), 200
            else:
                return jsonify(result), 500
                
        except Exception as e:
            logger.error(f"Error in load_flows: {e}")
            return jsonify({
                'success': False,
                'message': 'Internal server error',
                'error': str(e)
            }), 500

    @graph_bp.route('/load-comments/<product_id>', methods=['GET'])
    def load_comments(product_id):
        """Load comments data"""
        try:
            if not product_id:
                return jsonify({'error': 'product_id is required'}), 400
            
            result = graph_service.load_individual_data(product_id, 'comments')
            
            if result['success']:
                return jsonify(result), 200
            else:
                return jsonify(result), 500
                
        except Exception as e:
            logger.error(f"Error in load_comments: {e}")
            return jsonify({
                'success': False,
                'message': 'Internal server error',
                'error': str(e)
            }), 500

    @graph_bp.route('/generate-upload-url', methods=['POST'])
    def generate_upload_url():
        """Generate signed URL for direct upload to GCS"""
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({'error': 'No JSON data provided'}), 400
            
            product_id = data.get('product_id')
            data_type = data.get('data_type')
            expiration_minutes = data.get('expiration_minutes', 15)
            
            if not product_id:
                return jsonify({'error': 'product_id is required'}), 400
            
            if not data_type or data_type not in ['graph', 'features', 'flows', 'comments']:
                return jsonify({'error': 'Invalid data_type. Must be one of: graph, features, flows, comments'}), 400
            
            result = graph_service.generate_signed_url(product_id, data_type, expiration_minutes)
            
            if result['success']:
                return jsonify(result), 200
            else:
                return jsonify(result), 500
                
        except Exception as e:
            logger.error(f"Error in generate_upload_url: {e}")
            return jsonify({
                'success': False,
                'message': 'Internal server error',
                'error': str(e)
            }), 500

    @graph_bp.route('/bucket-info', methods=['GET'])
    def get_bucket_info():
        """Get information about the configured GCS bucket"""
        try:
            result = graph_service.get_bucket_info()
            return jsonify(result), 200
                
        except Exception as e:
            logger.error(f"Error in get_bucket_info: {e}")
            return jsonify({
                'success': False,
                'message': 'Internal server error',
                'error': str(e)
            }), 500

    return graph_bp
