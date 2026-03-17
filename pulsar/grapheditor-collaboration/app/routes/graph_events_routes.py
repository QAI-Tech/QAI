import logging
from uuid import uuid4
from typing import Any, Dict, List
from datetime import datetime, timezone
from app.model.graph_models import Feature as CollaborationFeature
from flask import Blueprint, jsonify, request
from app.services.features.feature_models import Feature as FeatureModel

logger = logging.getLogger(__name__)


def create_graph_events_routes(graph_service, persistence_service, room_service, feature_service=None, event_queue=None):
    """Create REST endpoints that apply graph events to a stored product graph."""
    events_bp = Blueprint('graph_events', __name__, url_prefix='/api/graph-events')

    @events_bp.route('/apply', methods=['POST'])
    def apply_events():
        payload: Dict[str, Any] = request.get_json(silent=True) or {}

        product_id = payload.get('product_id')
        events = payload.get('events', [])

        if not product_id or not isinstance(product_id, str):
            return jsonify({'success': False, 'error': 'product_id is required'}), 400

        if not isinstance(events, list):
            return jsonify({'success': False, 'error': 'events must be a list'}), 400

        room_info = room_service.get_room_info(product_id)
        is_active_room = bool(room_info and room_info.get('user_count', 0) > 0)

        applied_count = 0
        failures: List[Dict[str, Any]] = []
        applied = True
        if is_active_room:
            room_id = product_id
            for index, event in enumerate(events):
                if not isinstance(event, dict):
                    failures.append({'index': index, 'error': 'Event must be an object'})
                    continue
                event_type = event.get('event')
                if not event_type:
                    failures.append({'index': index, 'error': 'Event missing type field'})
                    continue

                try:
                    if event_queue:
                        event_queue.put(event)
                        applied = True
                except Exception as exc:
                    logger.exception("Error applying event %s for product %s", event_type, product_id)
                    failures.append({'index': index, 'error': str(exc) or 'Unhandled exception'})
                    applied = False

                if applied:
                    applied_count += 1
                elif not any(f.get('index') == index for f in failures):
                    failures.append({'index': index, 'error': f'Failed to apply event {event_type}'})

            success = applied_count > 0 or len(events) == 0
            response = {
                'success': success,
                'mode': 'active_room',
                'product_id': product_id,
                'events_received': len(events),
                'events_applied': applied_count,
                'events_failed': failures,
                'message': 'Events appended to active collaboration room; periodic persistence will handle saving.'
            }
            return jsonify(response), 200

        load_result = graph_service.load_graph_data(product_id)
        if not load_result.get('success'):
            message = load_result.get('message') or 'Failed to load graph data'
            logger.error("Failed to load graph for product %s: %s", product_id, message)
            return jsonify({'success': False, 'error': message, 'details': load_result}), 500

        bundle = load_result.get('data', {})
        temp_room_id = f"rest-{product_id}-{uuid4().hex}"

        try:
            persistence_service.hydrate_room_from_graph_bundle(
                temp_room_id,
                graph_data=bundle.get('graph_data'),
                flows_data=bundle.get('flows_data'),
                features_data=bundle.get('features_data'),
                comments_data=bundle.get('comments_data')
            )
            logger.info("Hydrated temporary room %s for product %s", temp_room_id, product_id)
        except Exception as exc:
            logger.exception("Failed to hydrate state for product %s: %s", product_id, exc)
            persistence_service.discard_room_state(temp_room_id)
            return jsonify({'success': False, 'error': 'Unable to hydrate graph state'}), 500

        try:
            for index, event in enumerate(events):
                if not isinstance(event, dict):
                    failures.append({'index': index, 'error': 'Event must be an object'})
                    continue

                event_type = event.get('event')
                if not event_type:
                    failures.append({'index': index, 'error': 'Event missing type field'})
                    continue
                modified_event_data = {
                    "type": event_type,
                    "data": event.get('data', {})
                }
                try:
                    applied = persistence_service.apply_operation(temp_room_id, modified_event_data, session_id='rest-api')
                except Exception as exc:
                    logger.exception("Error applying event %s for product %s", event_type, product_id)
                    applied = False
                    failures.append({'index': index, 'error': str(exc) or 'Unhandled exception'})
                    continue

                if applied:
                    applied_count += 1
                else:
                    failures.append({'index': index, 'error': f'Failed to apply event {event_type}'})

            artifacts = persistence_service.export_room_artifacts(temp_room_id)
            if artifacts is None:
                logger.error("Unable to export artifacts for product %s", product_id)
                return jsonify({'success': False, 'error': 'Unable to export updated graph state'}), 500

            save_result = graph_service.save_graph_data(product_id, artifacts)
            status_code = 200 if save_result.get('success') else 500

            response = {
                'success': bool(save_result.get('success')),
                'mode': 'offline_update',
                'product_id': product_id,
                'events_received': len(events),
                'events_applied': applied_count,
                'events_failed': failures,
                'saved_at': save_result.get('saved_at'),
                'storage_results': save_result.get('results'),
                'message': save_result.get('message')
            }
            return jsonify(response), status_code
        finally:
            persistence_service.discard_room_state(temp_room_id)

    @events_bp.route('/graph', methods=['GET'])
    def return_graph():
        product_id = request.args.get('product_id')
        logger.info("Returning graph for product %s", product_id)
        if not product_id:
            return jsonify({'success': False, 'error': 'product_id is required'}), 400
        room_id = product_id

        # Try to get from active memory first, but always ensure features are synced from Datastore
        logger.info("Trying to get graph from active memory for product %s", product_id)
        
        artifacts = persistence_service.export_room_artifacts(room_id)

        if artifacts:
            logger.info("Graph found in active memory for product %s", product_id)
            return jsonify({
                'success': True,
                'graph': artifacts.get('graph_data'),
                'flows': artifacts.get('flows_data'),
                'features': artifacts.get('features_data'),
                'comments': artifacts.get('comments_data')
            })

        # Fallback to storage
        logger.info("Graph not found in active memory for product %s, trying to get from storage", product_id)
        load_result = graph_service.load_graph_data(product_id)
        if load_result.get('success'):
            bundle = load_result.get('data', {})
            logger.info("Graph found in storage for product %s", product_id)
            return jsonify({
                'success': True,
                'graph': bundle.get('graph_data'),
                'flows': bundle.get('flows_data'),
                'features': bundle.get('features_data'),
                'comments': bundle.get('comments_data')
            })
        
        logger.info("Graph not found in storage for product %s", product_id)
        return jsonify({'success': False, 'error': f'No graph found for room_id {room_id}'}), 404

    @events_bp.route('/features/create', methods=['POST'])
    def create_feature():
        """Create a new feature and return it with the generated ID."""
        payload: Dict[str, Any] = request.get_json(silent=True) or {}
        
        product_id = payload.get('product_id')
        name = payload.get('name', '').strip()
        description = payload.get('description', '').strip()
        nodeIds = payload.get('nodeIds', [])
        kg_feature_id = payload.get('kg_feature_id')
        
        if not product_id:
            return jsonify({'success': False, 'error': 'product_id is required'}), 400
        
        if not name:
            return jsonify({'success': False, 'error': 'name is required'}), 400
        
        if not isinstance(nodeIds, list):
            return jsonify({'success': False, 'error': 'nodeIds must be a list'}), 400
        
        try:

            fs = feature_service or getattr(persistence_service, 'feature_service', None)
            if not fs:
                return jsonify({'success': False, 'error': 'Feature service not available'}), 500
            
            # Create feature object with empty ID (Datastore will generate it)
            feature = FeatureModel(
                id="", 
                product_id=product_id,
                name=name,
                description=description,
                nodeIds=nodeIds,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc)
            )

            created_feature = fs.create_feature(
                product_id=product_id,
                feature=feature,
                description=description,
                kg_feature_id=kg_feature_id
            )

            room_info = room_service.get_room_info(product_id)
            is_active_room = bool(room_info and room_info.get('user_count', 0) > 0)
            
            if is_active_room:
                # Feature is already created in Datastore, just broadcast to other users
                try:
                    collaboration_feature = {
                        'id': created_feature.id,
                        'name': created_feature.name,
                        'nodeIds': created_feature.nodeIds
                    }
                    event_data = {
                        "session_id": "rest-api",
                        "room_id": product_id,
                        "timestamp": datetime.now(timezone.utc).timestamp(),
                        "data": {
                            "type": "features_create",
                            "data": [collaboration_feature]
                        }
                    }
                    room_service.broadcast_to_room(
                        product_id,
                        "features_create",
                        event_data,
                        exclude_session=None
                    )
                except Exception as exc:
                    logger.exception("Error broadcasting feature creation: %s", exc)
            
            return jsonify({
                'success': True,
                'feature': {
                    'id': created_feature.id,
                    'product_id': created_feature.product_id,
                    'name': created_feature.name,
                    'description': created_feature.description,
                    'nodeIds': created_feature.nodeIds,
                    'sort_index': created_feature.sort_index,
                    'kg_feature_id': created_feature.kg_feature_id,
                    'created_at': created_feature.created_at.isoformat(),
                    'updated_at': created_feature.updated_at.isoformat()
                }
            }), 200
            
        except ValueError as e:
            return jsonify({'success': False, 'error': str(e)}), 400
        except Exception as e:
            logger.exception("Error creating feature for product %s: %s", product_id, e)
            return jsonify({'success': False, 'error': f'Failed to create feature: {str(e)}'}), 500

    @events_bp.route('/features/update', methods=['POST'])
    def update_feature():
        """Update an existing feature by ID."""
        payload: Dict[str, Any] = request.get_json(silent=True) or {}
        
        feature_id = payload.get('id')
        product_id = payload.get('product_id')
        name = payload.get('name', '').strip()
        description = payload.get('description', '').strip()
        nodeIds = payload.get('nodeIds', [])
        
        if not feature_id:
            return jsonify({'success': False, 'error': 'id is required'}), 400
        
        if not product_id:
            return jsonify({'success': False, 'error': 'product_id is required'}), 400
        
        if not isinstance(nodeIds, list):
            return jsonify({'success': False, 'error': 'nodeIds must be a list'}), 400
        
        try:

            fs = feature_service or getattr(persistence_service, 'feature_service', None)
            if not fs:
                return jsonify({'success': False, 'error': 'Feature service not available'}), 500
            
            # Update the feature in Datastore
            updated_feature = fs.update_feature(
                product_id=product_id,
                feature_id=feature_id,
                name=name,
                nodeIds=nodeIds if nodeIds else None,
                description=description if description else None
            )
            
            # Broadcast to other users in the room if room is active
            room_info = room_service.get_room_info(product_id)
            is_active_room = bool(room_info and room_info.get('user_count', 0) > 0)
            
            if is_active_room:
                # Feature is already updated in Datastore, just broadcast to other users
                try:
                    # Format matches what _handle_feature_update expects
                    update_event_data = {
                        'id': feature_id,
                        'updates': {
                            'name': updated_feature.name,
                            'nodeIds': updated_feature.nodeIds
                        }
                    }
                    event_data = {
                        "session_id": "rest-api",
                        "room_id": product_id,
                        "timestamp": datetime.now(timezone.utc).timestamp(),
                        "data": {
                            "type": "features_update",
                            "data": [update_event_data]
                        }
                    }
                    room_service.broadcast_to_room(
                        product_id,
                        "features_update",
                        event_data,
                        exclude_session=None
                    )
                except Exception as exc:
                    logger.exception("Error broadcasting feature update: %s", exc)
            
            return jsonify({
                'success': True,
                'feature': {
                    'id': updated_feature.id,
                    'product_id': updated_feature.product_id,
                    'name': updated_feature.name,
                    'description': updated_feature.description,
                    'nodeIds': updated_feature.nodeIds,
                    'sort_index': updated_feature.sort_index,
                    'kg_feature_id': updated_feature.kg_feature_id,
                    'created_at': updated_feature.created_at.isoformat(),
                    'updated_at': updated_feature.updated_at.isoformat()
                }
            }), 200
            
        except ValueError as e:
            return jsonify({'success': False, 'error': str(e)}), 400
        except Exception as e:
            logger.exception("Error updating feature %s: %s", feature_id, e)
            return jsonify({'success': False, 'error': f'Failed to update feature: {str(e)}'}), 500

    @events_bp.route('/features/delete', methods=['DELETE'])
    def delete_feature():
        """Delete a feature by ID."""
        payload: Dict[str, Any] = request.get_json(silent=True) or {}
        
        feature_id = payload.get('id')
        product_id = payload.get('product_id')
        
        if not feature_id:
            return jsonify({'success': False, 'error': 'id is required'}), 400
        
        if not product_id:
            return jsonify({'success': False, 'error': 'product_id is required'}), 400
        
        try:

            fs = feature_service or getattr(persistence_service, 'feature_service', None)
            if not fs:
                return jsonify({'success': False, 'error': 'Feature service not available'}), 500
            
            # Delete the feature from Datastore (will raise error if not found)
            fs.delete_feature(product_id, feature_id)
            
            # Broadcast to other users in the room if room is active
            room_info = room_service.get_room_info(product_id)
            is_active_room = bool(room_info and room_info.get('user_count', 0) > 0)
            
            if is_active_room:
                # Feature is already deleted from Datastore, just broadcast to other users
                try:
                    # Format matches what _handle_feature_delete expects - can be just ID or dict with id
                    delete_event_data = {'id': feature_id}
                    event_data = {
                        "session_id": "rest-api",
                        "room_id": product_id,
                        "timestamp": datetime.now(timezone.utc).timestamp(),
                        "data": {
                            "type": "features_delete",
                            "data": [delete_event_data]
                        }
                    }
                    room_service.broadcast_to_room(
                        product_id,
                        "features_delete",
                        event_data,
                        exclude_session=None
                    )
                except Exception as exc:
                    logger.exception("Error broadcasting feature deletion: %s", exc)
            
            return jsonify({
                'success': True,
                'feature': {
                    'id': feature_id,
                    'message': 'Feature deleted successfully'
                }
            }), 200
            
        except ValueError as e:
            return jsonify({'success': False, 'error': str(e)}), 400
        except Exception as e:
            logger.exception("Error deleting feature %s: %s", feature_id, e)
            return jsonify({'success': False, 'error': f'Failed to delete feature: {str(e)}'}), 500



    return events_bp
