from flask import request
import time
import logging

logger = logging.getLogger(__name__)


def init_socket_routes(collaboration_service, room_service, socketio, persistence_service=None, event_queue=None):
    """Initialize WebSocket routes with service dependency

    If an event_queue is provided, socket events will be enqueued as dicts:
      { 'event': <str>, 'session_id': <str>, 'data': <dict> }
    Otherwise handlers call services directly (legacy behavior).
    """

    def _log_event(event_name: str, session_id: str = None, data=None):
        try:
            logger.info("socket event=%s session_id=%s", event_name, session_id)
        except Exception:
            logger.exception("Failed to log socket event %s for session %s", event_name, session_id)

    @socketio.on("connect")
    def handle_connect():
        session_id = request.sid
        _log_event("connect", session_id, {})
        ev = { 'event': 'connect', 'session_id': session_id, 'data': {} }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_connect(session_id)

    @socketio.on("disconnect")
    def handle_disconnect():
        session_id = request.sid
        _log_event("disconnect", session_id, {})
        ev = { 'event': 'disconnect', 'session_id': session_id, 'data': {} }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_disconnect(session_id)

    @socketio.on("error")
    def handle_error(error):
        session_id = request.sid
        _log_event("error", session_id, error)
        ev = { 'event': 'error', 'session_id': session_id, 'data': error }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_error(session_id, error)

    @socketio.on("join_room")
    def handle_join_room(data):
        session_id = request.sid
        _log_event("join_room", session_id, data)
        ev = { 'event': 'join_room', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_join_room(session_id, data)

    @socketio.on("leave_room")
    def handle_leave_room(data):
        session_id = request.sid
        _log_event("leave_room", session_id, data)
        ev = { 'event': 'leave_room', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_leave_room(session_id, data)

    @socketio.on("collaboration_event")
    def handle_collaboration_event(data):
        session_id = request.sid
        _log_event("collaboration_event", session_id, data)
        ev = { 'event': 'collaboration_event', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, data)

    @socketio.on("heartbeat")
    def handle_heartbeat(data):
        session_id = request.sid
        _log_event("heartbeat", session_id, data)
        ev = { 'event': 'heartbeat', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_heartbeat(session_id, data)

    @socketio.on("get_status")
    def handle_get_status():
        session_id = request.sid
        _log_event("get_status", session_id, {})
        ev = { 'event': 'get_status', 'session_id': session_id, 'data': {} }
        if event_queue:
            event_queue.put(ev)
        else:
            status = collaboration_service.get_collaboration_status(session_id)
            socketio.emit("status_response", status, room=session_id)

    @socketio.on("get_server_stats")
    def handle_get_server_stats():
        session_id = request.sid
        _log_event("get_server_stats", session_id, {})
        ev = { 'event': 'get_server_stats', 'session_id': session_id, 'data': {} }
        if event_queue:
            event_queue.put(ev)
        else:
            stats = collaboration_service.get_server_stats()
            socketio.emit("server_stats_response", stats, room=session_id)

    @socketio.on("get_all_rooms")
    def handle_get_all_rooms():
        session_id = request.sid
        _log_event("get_all_rooms", session_id, {})
        ev = { 'event': 'get_all_rooms', 'session_id': session_id, 'data': {} }
        if event_queue:
            event_queue.put(ev)
        else:
            rooms_info = room_service.get_all_rooms_info()
            socketio.emit("all_rooms_response", rooms_info, room=session_id)

    @socketio.on("get_room_info")
    def handle_get_room_info(data):
        session_id = request.sid
        _log_event("get_room_info", session_id, data)
        room_id = data.get("room_id")
        ev = { 'event': 'get_room_info', 'session_id': session_id, 'data': { 'room_id': room_id } }
        if event_queue:
            event_queue.put(ev)
        else:
            if room_id:
                room_info = room_service.get_room_info(room_id)
                socketio.emit("room_info_response", {
                    "room_id": room_id,
                    "room_info": room_info
                }, room=session_id)
            else:
                socketio.emit("error", {
                    "message": "room_id is required",
                    "event": "get_room_info"
                }, room=session_id)

    # Graph Editor Specific Events
    
    # Node events
    @socketio.on("nodes_create")
    def handle_nodes_create(data):
        session_id = request.sid
        _log_event("nodes_create", session_id, data)
        ev = { 'event': 'nodes_create', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "nodes_create",
                "data": data
            })

    @socketio.on("nodes_delete")
    def handle_nodes_delete(data):
        session_id = request.sid
        _log_event("nodes_delete", session_id, data)
        ev = { 'event': 'nodes_delete', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "nodes_delete",
                "data": data
            })

    @socketio.on("nodes_replace")
    def handle_nodes_replace(data):
        session_id = request.sid
        _log_event("nodes_replace", session_id, data)
        ev = { 'event': 'nodes_replace', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "nodes_replace",
                "data": data
            })

    @socketio.on("node_description_change")
    def handle_node_description_change(data):
        session_id = request.sid
        _log_event("node_description_change", session_id, data)
        ev = { 'event': 'node_description_change', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "node_description_change",
                "data": data
            })

    @socketio.on("node_image_change")
    def handle_node_image_change(data):
        session_id = request.sid
        _log_event("node_image_change", session_id, data)
        ev = { 'event': 'node_image_change', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "node_image_change",
                "data": data
            })

    @socketio.on("node_move")
    def handle_node_move(data):
        session_id = request.sid
        _log_event("node_move", session_id, data)
        ev = { 'event': 'node_move', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "node_move",
                "data": data
            })

    @socketio.on("nodes_update")
    def handle_nodes_update(data):
        session_id = request.sid
        _log_event("nodes_update", session_id, data)
        ev = { 'event': 'nodes_update', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "nodes_update",
                "data": data
            })

    # Edge events
    @socketio.on("edges_create")
    def handle_edges_create(data):
        session_id = request.sid
        _log_event("edges_create", session_id, data)
        ev = { 'event': 'edges_create', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "edges_create",
                "data": data
            })

    @socketio.on("edges_delete")
    def handle_edges_delete(data):
        session_id = request.sid
        _log_event("edges_delete", session_id, data)
        ev = { 'event': 'edges_delete', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "edges_delete",
                "data": data
            })
    
    @socketio.on("edges_replace")
    def handle_edges_replace(data):
        session_id = request.sid
        _log_event("edges_replace", session_id, data)
        ev = { 'event': 'edges_replace', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "edges_replace",
                "data": data
            })

    @socketio.on("edge_description_change")
    def handle_edge_description_change(data):
        session_id = request.sid
        _log_event("edge_description_change", session_id, data)
        ev = { 'event': 'edge_description_change', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "edge_description_change",
                "data": data
            })

    @socketio.on("edge_anchor_change")
    def handle_edge_anchor_change(data):
        session_id = request.sid
        _log_event("edge_anchor_change", session_id, data)
        ev = { 'event': 'edge_anchor_change', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "edge_anchor_change",
                "data": data
            })

    @socketio.on("edges_update")
    def handle_edges_update(data):
        session_id = request.sid
        _log_event("edges_update", session_id, data)
        ev = { 'event': 'edges_update', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "edges_update",
                "data": data
            })

    # Feature events
    @socketio.on("features_create")
    def handle_feature_create(data):
        session_id = request.sid
        _log_event("features_create", session_id, data)
        ev = { 'event': 'features_create', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "features_create",
                "data": data
            })

    @socketio.on("features_edit")
    def handle_feature_edit(data):
        session_id = request.sid
        _log_event("feature_edit", session_id, data)
        ev = { 'event': 'feature_edit', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "feature_edit",
                "data": data
            })

    @socketio.on("features_delete")
    def handle_feature_delete(data):
        session_id = request.sid
        _log_event("features_delete", session_id, data)
        ev = { 'event': 'features_delete', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "features_delete",
                "data": data
            })

    @socketio.on("features_update")
    def handle_feature_update(data):
        session_id = request.sid
        _log_event("features_update", session_id, data)
        ev = { 'event': 'features_update', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "features_update",
                "data": data
            })

    @socketio.on("reorder_features")
    def handle_feature_update(data):
        session_id = request.sid
        _log_event("reorder_features", session_id, data)
        ev = { 'event': 'reorder_features', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "reorder_features",
                "data": data
            })

    # New plural feature events
    @socketio.on("features_create")
    def handle_features_create(data):
        session_id = request.sid
        _log_event("features_create", session_id, data)
        ev = { 'event': 'features_create', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "features_create",
                "data": data
            })

    @socketio.on("features_update")
    def handle_features_update(data):
        session_id = request.sid
        _log_event("features_update", session_id, data)
        ev = { 'event': 'features_update', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "features_update",
                "data": data
            })

    @socketio.on("features_delete")
    def handle_features_delete(data):
        session_id = request.sid
        _log_event("features_delete", session_id, data)
        ev = { 'event': 'features_delete', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "features_delete",
                "data": data
            })

    # Flow events
    @socketio.on("flows_create")
    def handle_flow_create(data):
        session_id = request.sid
        _log_event("flows_create", session_id, data)
        ev = { 'event': 'flows_create', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "flows_create",
                "data": data
            })

    @socketio.on("ai_planned_flows")
    def handle_flow_delete(data):
        session_id = request.sid
        _log_event("ai_planned_flows", session_id, data)
        ev = { 'event': 'ai_planned_flows', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "ai_planned_flows",
                "data": data
            })

    @socketio.on("flow_update")
    def handle_flow_update(data):
        session_id = request.sid
        _log_event("flow_update", session_id, data)
        ev = { 'event': 'flow_update', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "flow_update",
                "data": data
            })
    
    @socketio.on("flows_replace")
    def handle_flow_replace(data):
        session_id = request.sid
        _log_event("flows_replace", session_id, data)
        ev = { 'event': 'flows_replace', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "flows_replace",
                "data": data
            })
    
    @socketio.on("flows_update")
    def handle_flow_delete(data):
        session_id = request.sid
        _log_event("flows_update", session_id, data)
        ev = { 'event': 'flows_update', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "flows_update",
                "data": data
            })

    @socketio.on("flows_delete")
    def handle_flow_delete(data):
        session_id = request.sid
        _log_event("flows_delete", session_id, data)
        ev = { 'event': 'flows_delete', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "flows_delete",
                "data": data
            })

    # New plural flow events
    @socketio.on("flows_create")
    def handle_flows_create(data):
        session_id = request.sid
        _log_event("flows_create", session_id, data)
        ev = { 'event': 'flows_create', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "flows_create",
                "data": data
            })

    @socketio.on("flows_delete")
    def handle_flows_delete(data):
        session_id = request.sid
        _log_event("flows_delete", session_id, data)
        ev = { 'event': 'flows_delete', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "flows_delete",
                "data": data
            })

    # Comment events
    @socketio.on("comment_add")
    def handle_comment_add(data):
        session_id = request.sid
        _log_event("comment_add", session_id, data)
        ev = { 'event': 'comment_add', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "comment_add",
                "data": data
            })

    @socketio.on("comment_edit")
    def handle_comment_edit(data):
        session_id = request.sid
        _log_event("comment_edit", session_id, data)
        ev = { 'event': 'comment_edit', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "comment_edit",
                "data": data
            })

    @socketio.on("comment_delete")
    def handle_comment_delete(data):
        session_id = request.sid
        _log_event("comment_delete", session_id, data)
        ev = { 'event': 'comment_delete', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "comment_delete",
                "data": data
            })

    @socketio.on("comment_move")
    def handle_comment_move(data):
        session_id = request.sid
        _log_event("comment_move", session_id, data)
        ev = { 'event': 'comment_move', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "comment_move",
                "data": data
            })

    @socketio.on("comment_update")
    def handle_comment_update(data):
        session_id = request.sid
        _log_event("comment_update", session_id, data)
        ev = { 'event': 'comment_update', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "comment_update",
                "data": data
            })

    # New plural comment events
    @socketio.on("comments_create")
    def handle_comments_create(data):
        session_id = request.sid
        _log_event("comments_create", session_id, data)
        ev = { 'event': 'comments_create', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "comments_create",
                "data": data
            })

    @socketio.on("comments_update")
    def handle_comments_update(data):
        session_id = request.sid
        _log_event("comments_update", session_id, data)
        ev = { 'event': 'comments_update', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "comments_update",
                "data": data
            })

    @socketio.on("comments_delete")
    def handle_comments_delete(data):
        session_id = request.sid
        _log_event("comments_delete", session_id, data)
        ev = { 'event': 'comments_delete', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "comments_delete",
                "data": data
            })

    @socketio.on("credential_add")
    def handle_credential_add(data):
        session_id = request.sid
        _log_event("credential_add", session_id, data)
        ev = { 'event': 'credential_add', 'session_id': session_id, 'data': data }
        if event_queue:
            event_queue.put(ev)
        else:
            collaboration_service.handle_collaboration_event(session_id, {
                "type": "credential_add",
                "data": data
            })

    @socketio.on("force_cleanup_room")
    def handle_force_cleanup_room(data):
        session_id = request.sid
        _log_event("force_cleanup_room", session_id, data)
        room_id = data.get("room_id")
        ev = { 'event': 'force_cleanup_room', 'session_id': session_id, 'data': { 'room_id': room_id } }
        if event_queue:
            event_queue.put(ev)
        else:
            if room_id:
                success = room_service.force_cleanup_room(room_id)
                socketio.emit("room_cleanup_response", {
                    "room_id": room_id,
                    "success": success,
                    "message": f"Room {room_id} {'cleaned up' if success else 'not found or error'}"
                }, room=session_id)
            else:
                socketio.emit("error", {
                    "message": "room_id is required",
                    "event": "force_cleanup_room"
                }, room=session_id)

    # Persistence-related events
    if persistence_service:
        @socketio.on("get_room_state")
        def handle_get_room_state(data):
            session_id = request.sid
            _log_event("get_room_state", session_id, data)
            room_id = data.get("room_id")
            ev = { 'event': 'get_room_state', 'session_id': session_id, 'data': { 'room_id': room_id } }
            if event_queue:
                event_queue.put(ev)
            else:
                if room_id:
                    room_state = persistence_service.get_room_state(room_id)
                    socketio.emit("room_state_response", {
                        "room_id": room_id,
                        "state": room_state,
                        "timestamp": time.time()
                    }, room=session_id)
                else:
                    socketio.emit("error", {
                        "message": "room_id is required",
                        "event": "get_room_state"
                    }, room=session_id)

        @socketio.on("get_room_operations_since")
        def handle_get_room_operations_since(data):
            session_id = request.sid
            _log_event("get_room_operations_since", session_id, data)
            room_id = data.get("room_id")
            since_timestamp = data.get("since_timestamp", 0)
            ev = { 'event': 'get_room_operations_since', 'session_id': session_id, 'data': { 'room_id': room_id, 'since_timestamp': since_timestamp } }
            if event_queue:
                event_queue.put(ev)
            else:
                if room_id:
                    operations = persistence_service.get_room_operations_since(room_id, since_timestamp)
                    socketio.emit("room_operations_response", {
                        "room_id": room_id,
                        "operations": operations,
                        "since_timestamp": since_timestamp,
                        "timestamp": time.time()
                    }, room=session_id)
                else:
                    socketio.emit("error", {
                        "message": "room_id is required",
                        "event": "get_room_operations_since"
                    }, room=session_id)

        @socketio.on("request_state_sync")
        def handle_request_state_sync(data):
            session_id = request.sid
            _log_event("request_state_sync", session_id, data)
            ev = { 'event': 'request_state_sync', 'session_id': session_id, 'data': {} }
            if event_queue:
                event_queue.put(ev)
            else:
                room_id = room_service.get_user_room(session_id)
                if room_id:
                    persistence_service.sync_user_to_room_state(room_id, session_id)
                else:
                    socketio.emit("error", {
                        "message": "Not in any room",
                        "event": "request_state_sync"
                    }, room=session_id)

        @socketio.on("get_persistence_stats")
        def handle_get_persistence_stats():
            session_id = request.sid
            _log_event("get_persistence_stats", session_id, {})
            ev = { 'event': 'get_persistence_stats', 'session_id': session_id, 'data': {} }
            if event_queue:
                event_queue.put(ev)
            else:
                stats = persistence_service.get_persistence_stats()
                socketio.emit("persistence_stats_response", stats, room=session_id)

        @socketio.on("force_save_room")
        def handle_force_save_room(data):
            session_id = request.sid
            _log_event("force_save_room", session_id, data)
            room_id = data.get("room_id")
            ev = { 'event': 'force_save_room', 'session_id': session_id, 'data': { 'room_id': room_id } }
            if event_queue:
                event_queue.put(ev)
            else:
                if room_id:
                    try:
                        persistence_service._save_room_state(room_id)
                        socketio.emit("room_save_response", {
                            "room_id": room_id,
                            "success": True,
                            "message": f"Room {room_id} saved successfully"
                        }, room=session_id)
                    except Exception as e:
                        socketio.emit("room_save_response", {
                            "room_id": room_id,
                            "success": False,
                            "message": f"Failed to save room {room_id}: {str(e)}"
                        }, room=session_id)
                else:
                    socketio.emit("error", {
                        "message": "room_id is required",
                        "event": "force_save_room"
                    }, room=session_id)
