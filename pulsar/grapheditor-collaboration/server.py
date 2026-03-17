# backend/server.py

# Standard library imports
import logging
import sys
import os
import time
import queue
import threading
import json

# Third-party imports
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO

# Local imports
import app.config as config
from app.services.collaboration_service import CollaborationService
from app.services.room_service import RoomService
from app.services.persistence_service import PersistenceService
from app.services.graph_service import GraphService
from app.services.features.feature_datastore import FeatureDatastore
from app.services.features.feature_service import FeatureService
from app.services.flows.flow_datastore import FlowDatastore
from app.services.flows.flow_service import FlowService
from app.routes.socket_routes import init_socket_routes
from app.routes.graph_routes import create_graph_routes
from app.routes.graph_events_routes import create_graph_events_routes

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_app():
    """Application factory pattern"""
    app = Flask(__name__, static_folder="static")
    CORS(app)
    socketio = SocketIO(
        app,
        cors_allowed_origins="*",
        async_mode="eventlet",
        max_http_buffer_size=50 * 1024 * 1024,   # 50 MB
        ping_timeout=60,
        ping_interval=25,
    )

    # Ensure directories exist
    config.ensure_directories()

    # Initialize services with dependency injection

    feature_datastore = FeatureDatastore()
    feature_service = FeatureService(feature_datastore)
    
    flow_datastore = FlowDatastore()
    flow_service = FlowService(flow_datastore)
    
    graph_service = GraphService(config, feature_service, flow_service)
    persistence_service = PersistenceService(config, socketio, feature_service, flow_service)
    room_service = RoomService(config, socketio, persistence_service, graph_service, feature_service, flow_service)
    collaboration_service = CollaborationService(config, room_service, socketio, persistence_service)

    # Connect services (circular dependency resolution)
    room_service.set_collaboration_service(collaboration_service)

    # Event queue to serialize socket events
    event_queue = queue.Queue()

    def _dispatch_event(event):
        """Dispatch a queued event to the appropriate service handler.

        Event format: { 'event': <str>, 'session_id': <str>, 'data': <dict> }
        """
        try:
            ev = event

            ev_type = ev.get('event')
            sid = ev.get('session_id')
            data = ev.get('data', {})
            product_id = ev.get('product_id') or ""
            print("Dispatching event:", ev_type, "from session:", sid, "data:", json.dumps(data)[:100])
            # Connection lifecycle
            if ev_type == 'connect':
                collaboration_service.handle_connect(sid)
                return
            if ev_type == 'disconnect':
                collaboration_service.handle_disconnect(sid)
                return
            if ev_type == 'error':
                collaboration_service.handle_error(sid, data)
                return

            # Room join/leave
            if ev_type == 'join_room':
                try:
                    # Some operations (e.g. Flask-SocketIO join_room) require an application context.
                    with app.app_context():
                        collaboration_service.handle_join_room(sid, data)
                except Exception as e:
                    logging.getLogger(__name__).error(f"Error handling join_room inside app context: {e}")
                return
            if ev_type == 'leave_room':
                try:
                    with app.app_context():
                        collaboration_service.handle_leave_room(sid, data)
                except Exception as e:
                    logging.getLogger(__name__).error(f"Error handling leave_room inside app context: {e}")
                return

            # Generic collaboration events (node/edge/feature/flow/comment/credential)
            # Supports both unified operations (nodes_update, edges_update) and granular events (node_move, node_description_change)
            if ev_type in ('collaboration_event', 
                           'nodes_create', 'nodes_delete', 'nodes_update', 'nodes_replace', 'node_create', 'node_delete', 'node_update', 'node_move', 'node_description_change', 'node_image_change',
                           'edges_create', 'edges_delete', 'edges_update', 'edges_replace', 'edge_create', 'edge_delete', 'edge_update', 'edge_description_change', 'edge_anchor_change',
                           'features_create', 'features_update', 'features_delete','reorder_features',
                           'flows_create', 'flows_delete', 'ai_planned_flows', 'flows_update', 'flow_update', 'flows_replace',
                           'comments_create', 'comments_update', 'comments_delete',
                           'credential_add'):
                # If specific events like node_create were enqueued, convert them to collaboration_event shape
                if ev_type == 'collaboration_event':
                    collaboration_service.handle_collaboration_event(sid, data, product_id)
                else:
                    # Wrap into collaboration_event form
                    logger.info("[Begin 2] Handling collaboration_event from session %s abd product_id: %s", sid, product_id)
                    collaboration_service.handle_collaboration_event(sid, {
                        'type': ev_type,
                        'data': data
                    }, product_id)
                return

            # Heartbeat or status queries
            if ev_type == 'heartbeat':
                collaboration_service.handle_heartbeat(sid, data)
                return
            if ev_type == 'get_status':
                status = collaboration_service.get_collaboration_status(sid)
                socketio.emit('status_response', status, room=sid)
                return
            if ev_type == 'get_server_stats':
                stats = collaboration_service.get_server_stats()
                socketio.emit('server_stats_response', stats, room=sid)
                return

            # Room / persistence queries
            if ev_type == 'get_all_rooms':
                rooms_info = room_service.get_all_rooms_info()
                socketio.emit('all_rooms_response', rooms_info, room=sid)
                return
            if ev_type == 'get_room_info':
                room_id = data.get('room_id')
                if room_id:
                    room_info = room_service.get_room_info(room_id)
                    socketio.emit('room_info_response', { 'room_id': room_id, 'room_info': room_info }, room=sid)
                else:
                    socketio.emit('error', { 'message': 'room_id is required', 'event': 'get_room_info' }, room=sid)
                return

            # Persistence-specific
            if ev_type == 'get_room_state':
                room_id = data.get('room_id')
                if room_id:
                    room_state = persistence_service.get_room_state(room_id)
                    socketio.emit('room_state_response', { 'room_id': room_id, 'state': room_state, 'timestamp': time.time() }, room=sid)
                else:
                    socketio.emit('error', { 'message': 'room_id is required', 'event': 'get_room_state' }, room=sid)
                return
            if ev_type == 'get_room_operations_since':
                room_id = data.get('room_id')
                since_timestamp = data.get('since_timestamp', 0)
                if room_id:
                    operations = persistence_service.get_room_operations_since(room_id, since_timestamp)
                    socketio.emit('room_operations_response', { 'room_id': room_id, 'operations': operations, 'since_timestamp': since_timestamp, 'timestamp': time.time() }, room=sid)
                else:
                    socketio.emit('error', { 'message': 'room_id is required', 'event': 'get_room_operations_since' }, room=sid)
                return
            if ev_type == 'request_state_sync':
                room_id = room_service.get_user_room(sid)
                if room_id:
                    persistence_service.sync_user_to_room_state(room_id, sid)
                else:
                    socketio.emit('error', { 'message': 'Not in any room', 'event': 'request_state_sync' }, room=sid)
                return
            if ev_type == 'get_persistence_stats':
                stats = persistence_service.get_persistence_stats()
                socketio.emit('persistence_stats_response', stats, room=sid)
                return
            if ev_type == 'force_save_room':
                room_id = data.get('room_id')
                if room_id:
                    try:
                        persistence_service._save_room_state(room_id)
                        socketio.emit('room_save_response', { 'room_id': room_id, 'success': True, 'message': f'Room {room_id} saved successfully' }, room=sid)
                    except Exception as e:
                        socketio.emit('room_save_response', { 'room_id': room_id, 'success': False, 'message': f'Failed to save room {room_id}: {str(e)}' }, room=sid)
                else:
                    socketio.emit('error', { 'message': 'room_id is required', 'event': 'force_save_room' }, room=sid)
                return

            # Force cleanup
            if ev_type == 'force_cleanup_room':
                room_id = data.get('room_id')
                if room_id:
                    success = room_service.force_cleanup_room(room_id)
                    socketio.emit('room_cleanup_response', { 'room_id': room_id, 'success': success, 'message': f"Room {room_id} {'cleaned up' if success else 'not found or error'}" }, room=sid)
                else:
                    socketio.emit('error', { 'message': 'room_id is required', 'event': 'force_cleanup_room' }, room=sid)
                return

            # Unknown event
            logging.getLogger(__name__).warning(f"Unhandled queued event type: {ev_type}")

        except Exception as e:
            logging.getLogger(__name__).error(f"Error dispatching event from queue: {e}")

    # Per-room dispatching: allow parallelism across rooms while keeping
    # per-room event ordering. Global queue worker routes events to
    # per-room queues; each room queue has a single worker thread.
    per_room_queues = {}
    per_room_workers = {}
    per_room_lock = threading.Lock()

    def _ensure_room_worker(room_id: str):
        """Ensure a per-room queue and worker exist and are running."""
        with per_room_lock:
            # Ensure queue exists
            if room_id not in per_room_queues:
                per_room_queues[room_id] = queue.Queue()

            # Ensure worker exists and is alive
            worker = per_room_workers.get(room_id)
            if worker is not None and worker.is_alive():
                return

            def _room_worker():
                logger.info("Starting room worker for %s", room_id)
                q = per_room_queues[room_id]
                while True:
                    try:
                        ev = q.get()
                        if ev is None:
                            break
                        # Process the event directly
                        try:
                            _dispatch_event(ev)
                        except Exception:
                            logger.exception("Error processing event in room %s", room_id)
                    finally:
                        try:
                            q.task_done()
                        except Exception:
                            pass
                logger.info("Stopping room worker for %s", room_id)

            t = threading.Thread(target=_room_worker, daemon=True)
            t.start()
            per_room_workers[room_id] = t

    # Per-room monitor to restart stalled/dead room workers
    def _per_room_monitor():
        logger.info("Per-room monitor thread started")
        check_interval = getattr(config, 'PER_ROOM_MONITOR_INTERVAL', 5)
        while True:
            try:
                # Snapshot keys to avoid mutation races
                with per_room_lock:
                    room_ids = list(per_room_queues.keys())
                for rid in room_ids:
                    try:
                        q = per_room_queues.get(rid)
                        w = per_room_workers.get(rid)
                        # If no worker or worker died, ensure one is running
                        if q is None:
                            # recreate queue and worker
                            _ensure_room_worker(rid)
                            continue
                        if w is None or not w.is_alive():
                            logger.warning("Per-room worker missing or dead for %s; restarting", rid)
                            _ensure_room_worker(rid)
                            continue
                        # Periodic diagnostics: log queue size if backlog exists
                        try:
                            qsize = q.qsize()
                            if qsize > 0:
                                logger.debug("Room %s queue backlog: %d", rid, qsize)
                        except Exception:
                            pass
                    except Exception:
                        logger.exception("Error monitoring room %s", rid)
                time.sleep(check_interval)
            except Exception:
                logger.exception("Unhandled exception in per-room monitor loop")
                time.sleep(check_interval)

    per_room_monitor_thread = threading.Thread(target=_per_room_monitor, daemon=True)
    per_room_monitor_thread.start()
    try:
        event_queue._per_room_monitor_thread = per_room_monitor_thread
    except Exception:
        logger.exception("Failed to attach per-room monitor thread to event_queue")

    def _queue_worker():
        """Global dispatcher that routes room-scoped events to per-room queues."""
        # Mark worker as recently active immediately so monitor won't treat a freshly-started worker as stalled
        try:
            event_queue._worker_last_active = time.time()
        except Exception:
            pass
        while True:
            try:
                try:
                    event_queue._worker_last_active = time.time()
                except Exception:
                    pass

                ev = event_queue.get()
                try:
                    event_queue._worker_last_active = time.time()
                except Exception:
                    pass

                if ev is None:
                    break

                # Determine if event should be routed to a room worker
                ev_type = ev.get('event')
                sid = ev.get('session_id')
                data = ev.get('data', {})

                room_scoped_events = set([
                    'join_room', 'leave_room', 'collaboration_event',
                    'node_create', 'node_delete', 'node_move', 'node_description_change', 'node_image_change',
                    'edge_create', 'edge_delete', 'edge_description_change', 'edge_anchor_change',
                    'feature_create', 'feature_edit', 'feature_delete', 'reorder_features',
                    'flow_create', 'flow_delete',
                    'comment_add', 'comment_edit', 'comment_delete', 'comment_move',
                    'credential_add',
                    'request_state_sync', 'force_save_room', 'force_cleanup_room'
                ])

                if ev_type in room_scoped_events:
                    # Try to determine room_id from payload or session mapping
                    room_id = None
                    if isinstance(data, dict) and 'room_id' in data and data.get('room_id'):
                        room_id = data.get('room_id')
                    else:
                        # Fallback: look up the user's room mapping
                        try:
                            room_id = room_service.get_user_room(sid)
                        except Exception:
                            room_id = None

                    if room_id:
                        # Ensure room worker exists and enqueue there
                        try:
                            _ensure_room_worker(room_id)
                            per_room_queues[room_id].put(ev)
                        except Exception:
                            logger.exception("Failed to enqueue event to room %s; processing inline", room_id)
                            _dispatch_event(ev)
                    else:
                        # No room context — process inline to avoid dropping.
                        _dispatch_event(ev)
                else:
                    # Non-room event: handle directly
                    _dispatch_event(ev)

            except Exception:
                logging.getLogger(__name__).error("Error in event queue dispatcher", exc_info=True)
            finally:
                try:
                    event_queue.task_done()
                except Exception:
                    pass

    # Run the queue worker as a daemon thread so it won't block process exit if
    # something goes wrong during shutdown. We still attempt a graceful stop via
    # sentinel, join and save_all_rooms in the signal handler, but making the
    # thread a daemon prevents a stuck non-daemon worker from keeping the
    # process alive (helps during development and when the reloader is used).
    worker_thread = threading.Thread(target=_queue_worker, daemon=True)
    worker_thread.start()
    # Expose worker on the queue so monitor can inspect/restart it
    try:
        event_queue._worker_thread = worker_thread
        # Helper synchronization primitives used by monitor to avoid thrash
        event_queue._replacement_lock = threading.Lock()
        event_queue._worker_replacement_suppressed_until = 0.0
    except Exception:
        logger.exception("Failed to attach worker_thread to event_queue")

    # Monitor thread to ensure queue worker stays alive and is restarted if it dies
    def _queue_monitor():
        logger.info("Queue monitor thread started")
        # Monitor loop: ensure worker thread is alive and not stalled.
        stale_threshold = getattr(config, 'QUEUE_WORKER_STALE_SECONDS', 30)
        replacement_cooldown = getattr(config, 'QUEUE_WORKER_REPLACEMENT_COOLDOWN', 10)
        while True:
            try:
                wt = getattr(event_queue, '_worker_thread', None)
                last_active = getattr(event_queue, '_worker_last_active', 0)
                now = time.time()

                # If worker thread missing or dead -> start new (but avoid thrash)
                if wt is None or not wt.is_alive():
                    # prevent concurrent restarts
                    with getattr(event_queue, '_replacement_lock', threading.Lock()):
                        suppressed_until = getattr(event_queue, '_worker_replacement_suppressed_until', 0)
                        if now < suppressed_until:
                            logger.debug("Restart suppressed until %s, skipping start", suppressed_until)
                        else:
                            logger.warning("Event queue worker is not alive; starting a new worker thread")
                            try:
                                new_wt = threading.Thread(target=_queue_worker, daemon=True)
                                new_wt.start()
                                event_queue._worker_thread = new_wt
                                # record replacement time and suppress immediate subsequent restarts
                                event_queue._worker_replacement_suppressed_until = now + max(replacement_cooldown, 5)
                                event_queue._worker_last_active = time.time()
                                logger.info("Started replacement event queue worker")
                            except Exception:
                                logger.exception("Failed to start replacement queue worker")
                else:
                    # Worker is alive; check for stall when queue has items
                    try:
                        queue_has_items = not event_queue.empty()
                    except Exception:
                        queue_has_items = False

                    # If worker hasn't updated last_active recently and queue has items, assume stall
                    last_rep = getattr(event_queue, '_worker_replacement_suppressed_until', 0)
                    if queue_has_items and last_active and (now - last_active) > stale_threshold and (now - last_rep) > replacement_cooldown:
                        # lock to ensure only one replacement attempt proceeds
                        with getattr(event_queue, '_replacement_lock', threading.Lock()):
                            suppressed_until = getattr(event_queue, '_worker_replacement_suppressed_until', 0)
                            if now < suppressed_until:
                                logger.debug("Stall detected but restart suppressed until %s", suppressed_until)
                            else:
                                logger.warning("Detected stalled event queue worker (last_active=%s); starting replacement", last_active)
                                try:
                                    new_wt = threading.Thread(target=_queue_worker, daemon=True)
                                    new_wt.start()
                                    event_queue._worker_thread = new_wt
                                    # extend suppression window to avoid thrash
                                    event_queue._worker_replacement_suppressed_until = now + max(replacement_cooldown * 2, 10)
                                    event_queue._worker_last_active = time.time()
                                    logger.info("Started replacement event queue worker for stalled worker")
                                except Exception:
                                    logger.exception("Failed to start replacement event queue worker for stalled worker")

                time.sleep(5)
            except Exception:
                logger.exception("Unhandled exception in queue monitor loop")
                time.sleep(5)

    monitor_thread = threading.Thread(target=_queue_monitor, daemon=True)
    monitor_thread.start()
    try:
        event_queue._monitor_thread = monitor_thread
    except Exception:
        logger.exception("Failed to attach monitor_thread to event_queue")

    # Prevent new events from being enqueued once shutdown begins. We mark a flag
    # on the queue and wrap its put() method so producers attempting to put after
    # shutdown started will be dropped (and logged). We also keep the original
    # put method so the signal handler can enqueue the sentinel even after the
    # flag is set.
    try:
        event_queue.shutting_down = False
        event_queue._orig_put = event_queue.put

        def _safe_put(item, block=True, timeout=None):
            # Allow sentinel enqueues via the original put when shutting_down is True
            if getattr(event_queue, 'shutting_down', False):
                try:
                    evt_name = item.get('event') if isinstance(item, dict) else str(item)
                except Exception:
                    evt_name = str(item)
                logger.warning("Dropping queued event after shutdown began: %s", evt_name)
                return
            return event_queue._orig_put(item, block, timeout)

        event_queue.put = _safe_put
    except Exception:
        logger.exception("Failed to install safe event_queue.put wrapper")

    # Initialize socket routes
    init_socket_routes(collaboration_service, room_service, socketio, persistence_service, event_queue)
    
    # Register HTTP routes
    graph_routes = create_graph_routes(graph_service)
    app.register_blueprint(graph_routes)

    graph_events_routes = create_graph_events_routes(graph_service, persistence_service, room_service, feature_service, event_queue)
    app.register_blueprint(graph_events_routes)

    # Add route to serve the HTML test client
    @app.route('/')
    def index():
        return app.send_static_file('index.html')

    # Simple health check endpoint
    @app.route('/health-live')
    def health():
        return jsonify({
            'status': 'ok',
            'service': 'grapheditor-collaboration',
            'timestamp': int(time.time())
        }), 200
    
    @app.route('/join-room', methods=['POST'])
    def create_or_join_room():
        try:
            payload = request.get_json(force=True, silent=True) or {}
            print("HTTP /join-room payload:", payload)
            # Expect payload to contain 'session_id' and 'data' (which should include 'room_id' and optional user_data)
            session_id = payload.get('session_id')
    
            if not session_id:
                return jsonify({'success': False, 'message': 'session_id is required'}), 400

            collaboration_service.handle_join_room(session_id, payload)
            return jsonify({'success': True, 'message': 'Joined room'}), 200
        except Exception as e:
            logger.exception('Error handling join_room via HTTP: %s', e)
            return jsonify({'success': False, 'message': str(e)}), 500

        except Exception as e:
            logger.exception('Invalid request to create_or_join_room: %s', e)
            return jsonify({'success': False, 'message': 'Invalid request'}), 400

    # Add route to serve any static files
    @app.route('/<path:filename>')
    def static_files(filename):
        return app.send_static_file(filename)

    return app, socketio, collaboration_service, room_service, persistence_service, graph_service, event_queue, worker_thread


app, socketio, collaboration_service, room_service, persistence_service, graph_service, event_queue, worker_thread = create_app()

if __name__ == "__main__":
    import signal
    
    # try:
    #     app, socketio, collaboration_service, room_service, persistence_service, graph_service, event_queue, worker_thread = create_app()
    # except Exception as e:
    #     logger.exception("Failed to create app: %s", e)
    #     # Do not exit — keep process alive so operator can inspect logs and fix environment
    #     while True:
    #         logger.error("create_app() failed; sleeping before retrying is recommended. Fix error and restart process.")
    #         time.sleep(60)

    # Graceful shutdown handler (uses objects returned by create_app)
    shutdown_in_progress = False
    def signal_handler(sig, frame):
        global shutdown_in_progress
        # Ignore duplicate signals once shutdown started
        if shutdown_in_progress:
            logger.info("Shutdown already in progress; ignoring signal %s", sig)
            # If shutdown already requested, force immediate exit to ensure process terminates
            try:
                os._exit(0)
            except Exception:
                pass
            return
        shutdown_in_progress = True

        logger.info("Received shutdown signal; initiating immediate shutdown (no queue drain)...")

        # Mark queue so producers stop adding new events. Do not block waiting for queue to drain.
        try:
            if 'event_queue' in globals() and event_queue is not None:
                try:
                    event_queue.shutting_down = True
                except Exception:
                    logger.debug("Failed to set event_queue.shutting_down flag")

                # Try to enqueue sentinel if possible but do not wait for it to be processed.
                try:
                    if hasattr(event_queue, '_orig_put'):
                        event_queue._orig_put(None)
                        logger.info("Sentinel enqueued to signal worker to stop (no wait)")
                    else:
                        # If put is wrapped or unavailable, attempt a best-effort put without blocking
                        try:
                            event_queue.put_nowait(None)
                            logger.info("Sentinel enqueued (no wait)")
                        except Exception:
                            logger.debug("Could not enqueue sentinel; proceeding with immediate shutdown")
                except Exception as e:
                    logger.debug("Exception while attempting to enqueue sentinel: %s", e)
        except Exception as e:
            logger.debug("Error while marking event_queue shutting_down: %s", e)

        # Attempt to save room state synchronously (best-effort)
        try:
            if 'persistence_service' in globals() and persistence_service is not None:
                try:
                    persistence_service.save_all_rooms()
                    logger.info("All room states saved successfully")
                except Exception as e:
                    logger.error("Error saving room states during shutdown: %s", e)
        except Exception as e:
            logger.error(f"Unexpected error during shutdown: {e}")

        # Force immediate process exit to avoid hanging due to background threads or server internals
        logger.info("Exiting process now")
        os._exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Run the server with retry loop so runtime errors don't terminate the process
    backoff = 1
    while True:
        try:
            logger.info("Starting Flask server with SocketIO on http://localhost:8001")
            logger.info("Persistence enabled - room states will be automatically saved")
            # Disable the Werkzeug reloader and debug mode here so only one
            # process installs the signal handlers and background workers.
            # This avoids duplicate signal handling and multiple worker
            # processes that prevent clean shutdown. For local development you
            # can enable the reloader manually, but for the server we keep it
            # off to ensure predictable lifecycle.
            socketio.run(app, host="0.0.0.0", port=8001, debug=False, use_reloader=False)
            # If run returns without exception, break the loop
            break
        except Exception as e:
            logger.exception("socketio.run() failed with exception: %s", e)
            logger.warning("Retrying server start in %s seconds", backoff)
            time.sleep(backoff)
            backoff = min(backoff * 2, 60)
