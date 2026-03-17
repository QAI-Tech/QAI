import logging
import time
from threading import Timer
from typing import Dict, Set, Optional, Union
from app.model.graph_models import Graph, Flow
from app.model.graph_models import Feature as CollaborationFeature
logger = logging.getLogger(__name__)


class RoomService:
    """Service for handling collaboration room management"""

    def __init__(self, config, socketio, persistence_service=None, graph_service=None, feature_service=None, flow_service=None):
        self.config = config
        self.socketio = socketio
        self.collaboration_service = None  # Will be set after initialization
        self.persistence_service = persistence_service
        self.graph_service = graph_service
        self.feature_service = feature_service  # FeatureService for Datastore operations
        self.flow_service = flow_service
        self.active_rooms: Dict[str, Dict] = {}  # room_id -> room_data
        self.user_rooms: Dict[str, str] = {}  # session_id -> room_id
        self.room_timers: Dict[str, Timer] = {}  # room_id -> cleanup_timer

    def set_collaboration_service(self, collaboration_service):
        """Set the collaboration service reference"""
        self.collaboration_service = collaboration_service

    def create_or_join_room(self, room_id: str, session_id: str, user_data: Optional[Dict] = None) -> bool:
        """Create a new room or join an existing one"""
        try:
            # Cancel cleanup timer if room exists
            print("Creating or joining room:", room_id)
            if room_id in self.room_timers:
                print("Cancelling existing cleanup timer for room:", room_id)
                self.room_timers[room_id].cancel()
                del self.room_timers[room_id]
                logger.info(f"Cancelled cleanup timer for room {room_id}")

                # Best-effort: if a cleanup was cancelled because a user rejoined,
                # ensure the per-room GCS periodic backup is running again so we
                # don't miss artifacts while the room is active.
                try:
                    if self.persistence_service and self.graph_service:
                        gcs_interval = getattr(self.config, 'GCS_BACKUP_INTERVAL', 15)
                        # product_id is room-scoped and for now we use room_id as product_id
                        self.persistence_service.start_gcs_periodic_backup(room_id, self.graph_service, room_id, interval_seconds=gcs_interval)
                        logger.debug("Ensured GCS periodic backup running for room %s after cancelling cleanup", room_id)
                except Exception:
                    logger.exception("Failed to ensure GCS backup resumed for room %s after cancelling cleanup", room_id)

            # Create room if it doesn't exist
            print("Checking if room exists:", room_id)
            if room_id not in self.active_rooms:
                print("Room does not exist, creating new room:", room_id)
                self.active_rooms[room_id] = {
                    "created_at": time.time(),
                    "users": {},
                    "user_count": 0,
                    "last_activity": time.time()
                }
                logger.info(f"Created new collaboration room: {room_id}")

                # Initialize persistence state for the room (if available)
                print("Initializing persistence for room:", room_id)
                if self.persistence_service:
                    try:
                        self.persistence_service.initialize_room_state(room_id)
                    except Exception as e:
                        logger.warning(f"Failed to initialize persistence for room {room_id}: {e}")

                # If user_data contains a product_id and GraphService is available,
                # attempt to load an existing graph from GCS and seed the room state.
                try:
                    product_id = room_id
                    print("Loading graph for product_id:", product_id)
                    print("check for graph service and persistence service")
                    print("graph_service: " + str(self.graph_service))
                    print("persistence_service: " + str(self.persistence_service))
                    if product_id and self.graph_service and self.persistence_service:
                        print("check for graph service and persistence service confirmed")
                        result = self.graph_service.load_graph_data(product_id)
                        print("Loaded graph data result")
                        if result.get("success"):
                            print("Assigning loaded graph data")
                            bundle = result.get("data", {})

                            self.persistence_service.hydrate_room_from_graph_bundle(
                                room_id,
                                graph_data=bundle.get("graph_data", {"nodes": [], "edges": []}),
                                flows_data=bundle.get("flows_data", []),
                                features_data=bundle.get("features_data", {}),  
                                comments_data=bundle.get("comments_data", {})
                            )
                            logger.info(f"Initialized room {room_id} from GCS/Datastore for product_id={product_id} (features loaded fresh from Datastore)")
                        else:
                            logger.info(f"No graph found in GCS for product_id={product_id}, continuing with empty state")
                        # Start periodic GCS backups for this room (so artifacts get uploaded regularly)
                        try:
                            gcs_interval = getattr(self.config, 'GCS_BACKUP_INTERVAL', 15)
                            self.persistence_service.start_gcs_periodic_backup(room_id, self.graph_service, product_id, interval_seconds=gcs_interval)
                        except Exception:
                            logger.exception("Failed to start GCS periodic backup for room %s", room_id)
                except Exception as exc:
                    logger.warning(f"Failed to initialize room {room_id} from GCS: {exc}")

            # Check room capacity
            if self.active_rooms[room_id]["user_count"] >= self.config.MAX_USERS_PER_ROOM:
                logger.warning(f"Room {room_id} is at capacity ({self.config.MAX_USERS_PER_ROOM} users)")
                return False

            # Add user to room
            # Don't double-count if the session is already present (e.g., reconnects)
            if session_id in self.active_rooms[room_id]["users"]:
                # Update user info / last_seen
                self.active_rooms[room_id]["users"][session_id].update({
                    "user_data": user_data or self.active_rooms[room_id]["users"][session_id].get("user_data", {}),
                    "last_seen": time.time()
                })
            else:
                self.active_rooms[room_id]["users"][session_id] = {
                    "joined_at": time.time(),
                    "user_data": user_data or {},
                    "last_seen": time.time()
                }
                self.active_rooms[room_id]["user_count"] += 1
            self.active_rooms[room_id]["last_activity"] = time.time()
            self.user_rooms[session_id] = room_id

            logger.info(f"User {session_id} joined room {room_id}. Room now has {self.active_rooms[room_id]['user_count']} users")
            return True

        except Exception as e:
            logger.error(f"Error creating/joining room {room_id}: {e}")
            return False

    def leave_room(self, session_id: str) -> Optional[str]:
        """Remove user from their current room"""
        try:
            # Prefer removing via the direct mapping if available
            room_id = None
            if session_id in self.user_rooms:
                room_id = self.user_rooms[session_id]
            else:
                # Fallback: search active_rooms for the session in case mappings are stale
                for rid, rdata in self.active_rooms.items():
                    if session_id in rdata.get("users", {}):
                        room_id = rid
                        break

            if room_id is None:
                return None

            # Remove user from room if present
            if room_id in self.active_rooms and session_id in self.active_rooms[room_id]["users"]:
                try:
                    del self.active_rooms[room_id]["users"][session_id]
                except KeyError:
                    pass
                # Safeguard user_count not going negative
                try:
                    self.active_rooms[room_id]["user_count"] = max(0, self.active_rooms[room_id]["user_count"] - 1)
                except Exception:
                    # If user_count missing or invalid, recompute
                    try:
                        self.active_rooms[room_id]["user_count"] = len(self.active_rooms[room_id].get("users", {}))
                    except Exception:
                        self.active_rooms[room_id]["user_count"] = 0

                self.active_rooms[room_id]["last_activity"] = time.time()

                logger.info(f"User {session_id} left room {room_id}. Room now has {self.active_rooms[room_id]['user_count']} users")

                # Schedule room cleanup if empty
                if self.active_rooms[room_id]["user_count"] == 0:
                    self._schedule_room_cleanup(room_id)

            # Remove user from user_rooms mapping if present
            if session_id in self.user_rooms:
                try:
                    del self.user_rooms[session_id]
                except KeyError:
                    pass
            return room_id

        except Exception as e:
            logger.error(f"Error removing user {session_id} from room: {e}")
            return None

    def get_room_users(self, room_id: str) -> Set[str]:
        """Get list of users in a room"""
        if room_id in self.active_rooms:
            return set(self.active_rooms[room_id]["users"].keys())
        return set()

    def get_user_room(self, session_id: str) -> Optional[str]:
        """Get the room ID for a user"""
        return self.user_rooms.get(session_id)

    def broadcast_to_room(self, room_id: str, event: str, data: Dict, exclude_session: Optional[str] = None):
        """Broadcast message to all users in a room except the sender"""
        try:
            if room_id not in self.active_rooms:
                return

            users_in_room = self.get_room_users(room_id)
            
            for user_session_id in users_in_room:
                if exclude_session and user_session_id == exclude_session:
                    continue
                
                # Update last activity
                if user_session_id in self.active_rooms[room_id]["users"]:
                    self.active_rooms[room_id]["users"][user_session_id]["last_seen"] = time.time()
                
                # Send to specific session
                self.socketio.emit(event, data, room=user_session_id)

            self.active_rooms[room_id]["last_activity"] = time.time()
            logger.debug(f"Broadcasted {event} to {len(users_in_room)} users in room {room_id}")

        except Exception as e:
            logger.error(f"Error broadcasting to room {room_id}: {e}")

    def update_user_activity(self, session_id: str):
        """Update user's last activity timestamp"""
        if session_id in self.user_rooms:
            room_id = self.user_rooms[session_id]
            if room_id in self.active_rooms and session_id in self.active_rooms[room_id]["users"]:
                self.active_rooms[room_id]["users"][session_id]["last_seen"] = time.time()
                self.active_rooms[room_id]["last_activity"] = time.time()

    def get_room_info(self, room_id: str) -> Optional[Dict]:
        """Get information about a room"""
        if room_id in self.active_rooms:
            room_data = self.active_rooms[room_id].copy()
            # Don't expose internal user data
            room_data["users"] = list(room_data["users"].keys())
            return room_data
        return None

    def get_all_rooms_info(self) -> Dict[str, Dict]:
        """Get information about all active rooms"""
        rooms_info = {}
        for room_id, room_data in self.active_rooms.items():
            rooms_info[room_id] = {
                "user_count": room_data["user_count"],
                "created_at": room_data["created_at"],
                "last_activity": room_data["last_activity"]
            }
        return rooms_info

    def _schedule_room_cleanup(self, room_id: str):
        """Schedule room cleanup after delay"""
        def cleanup_room():
            try:
                if room_id in self.active_rooms and self.active_rooms[room_id]["user_count"] == 0:
                    # Clean up persistence data
                    if self.persistence_service:
                        # Stop any GCS periodic backups for the room before cleanup
                        try:
                            self.persistence_service.stop_gcs_periodic_backup(room_id)
                        except Exception:
                            logger.exception("Error stopping GCS backup for room %s during scheduled cleanup", room_id)
                        self.persistence_service.cleanup_room(room_id)
                    
                    del self.active_rooms[room_id]
                    logger.info(f"Cleaned up empty room: {room_id}")
                
                if room_id in self.room_timers:
                    del self.room_timers[room_id]
                    
            except Exception as e:
                logger.error(f"Error cleaning up room {room_id}: {e}", e)

        # Cancel existing timer if any
        if room_id in self.room_timers:
            self.room_timers[room_id].cancel()

        # Schedule new cleanup
        timer = Timer(self.config.ROOM_CLEANUP_DELAY, cleanup_room)
        timer.start()
        self.room_timers[room_id] = timer
        
        logger.info(f"Scheduled cleanup for room {room_id} in {self.config.ROOM_CLEANUP_DELAY} seconds")

    def force_cleanup_room(self, room_id: str) -> bool:
        """Force immediate cleanup of a room"""
        try:
            if room_id in self.room_timers:
                self.room_timers[room_id].cancel()
                del self.room_timers[room_id]

            if room_id in self.active_rooms:
                # Clean up persistence data
                if self.persistence_service:
                    # Stop any running GCS periodic backup for this room first
                    try:
                        self.persistence_service.stop_gcs_periodic_backup(room_id)
                    except Exception:
                        logger.exception("Error stopping GCS backup for room %s during force cleanup", room_id)
                    self.persistence_service.cleanup_room(room_id)
                
                # Remove all users from the room
                for session_id in list(self.active_rooms[room_id]["users"].keys()):
                    if session_id in self.user_rooms:
                        del self.user_rooms[session_id]
                
                del self.active_rooms[room_id]
                logger.info(f"Force cleaned up room: {room_id}")
                return True

            return False

        except Exception as e:
            logger.error(f"Error force cleaning up room {room_id}: {e}")
            return False
