import logging
import json
import time
from typing import Dict, Optional, Union

logger = logging.getLogger(__name__)


class CollaborationService:
    """Service for handling real-time collaboration operations"""

    def __init__(self, config, room_service, socketio, persistence_service=None):
        self.config = config
        self.room_service = room_service
        self.socketio = socketio
        self.persistence_service = persistence_service
        self.connected_clients: Dict[str, Dict] = {}  # session_id -> client_info

    def handle_connect(self, session_id: str, client_info: Optional[Dict] = None):
        """Handle WebSocket client connection"""
        try:
            self.connected_clients[session_id] = {
                "connected_at": time.time(),
                "client_info": client_info or {},
                "last_activity": time.time()
            }
            
            logger.info(f"Collaboration client connected: {session_id}")
            self.socketio.emit("connection_status", {
                "status": "connected",
                "session_id": session_id,
                "message": "Connected to collaboration server"
            }, room=session_id)

        except Exception as e:
            logger.error(f"Error handling client connection {session_id}: {e}")

    def handle_disconnect(self, session_id: str):
        """Handle WebSocket client disconnection"""
        try:
            # Remove client from any room they're in
            room_id = self.room_service.leave_room(session_id)
            
            if room_id:
                # Notify other users in the room
                self.room_service.broadcast_to_room(
                    room_id,
                    "user_left",
                    {
                        "session_id": session_id,
                        "room_id": room_id,
                        "timestamp": time.time()
                    },
                    exclude_session=session_id
                )

            # Remove from connected clients
            if session_id in self.connected_clients:
                del self.connected_clients[session_id]

            logger.info(f"Collaboration client disconnected: {session_id}")

        except Exception as e:
            logger.error(f"Error handling client disconnection {session_id}: {e}")

    def handle_error(self, session_id: str, error):
        """Handle WebSocket error"""
        logger.error(f"WebSocket error for {session_id}: {error}")
        self.socketio.emit("error", {
            "message": "WebSocket error occurred",
            "error": str(error),
            "timestamp": time.time()
        }, room=session_id)

    def handle_join_room(self, session_id: str, data: Dict):
        """Handle join room request"""
        try:
            room_id = data.get("room_id")
            user_data = data.get("user_data", {})
            print("Join room data received:", data)
            if not room_id:
                self.socketio.emit("join_room_error", {
                    "error": "room_id is required",
                    "timestamp": time.time()
                }, room=session_id)
                return

            # Warn if session_id is not a known connected socket
            if session_id not in self.connected_clients:
                logger.warning("join_room called with unknown session_id %s; it may be an app-session id rather than a socket sid", session_id)

            # Leave current room if in one
            print("Checking current room for session:", session_id)
            current_room = self.room_service.get_user_room(session_id)
            print("Current room for session", session_id, "is", current_room)
            if current_room:
                self.handle_leave_room(session_id, {"room_id": current_room})

            # Join the new room
            print("Attempting to join room:", room_id, "for session:", session_id)
            success = self.room_service.create_or_join_room(room_id, session_id, user_data)
            print("Join room success status:", success)
            if success:
                print("Join room success", room_id)

                # Get room info
                print("Getting room info for room:", room_id)
                room_info = self.room_service.get_room_info(room_id)
                logger.debug("Emitting room_joined to session %s", session_id)

                # Notify the user they joined successfully
                try:
                    self.socketio.emit("room_joined", {
                        "room_id": room_id,
                        "session_id": session_id,
                        "room_info": room_info,
                        "timestamp": time.time()
                    }, room=session_id)
                except Exception:
                    logger.exception("Failed to emit room_joined to %s", session_id)

                # By design we do NOT automatically sync room state to the joining user here.
                # If needed, clients may request state sync explicitly via the `request_state_sync` event.
                logger.debug(f"Skipping automatic state sync for user {session_id} in room {room_id}")

                logger.info(f"User {session_id} successfully joined room {room_id}")
            else:
                self.socketio.emit("join_room_error", {
                    "error": "Failed to join room (may be at capacity)",
                    "room_id": room_id,
                    "timestamp": time.time()
                }, room=session_id)

        except Exception as e:
            logger.exception(f"Error handling join room for {session_id}: {e}")
            try:
                self.socketio.emit("join_room_error", {
                    "error": "Internal server error",
                    "timestamp": time.time()
                }, room=session_id)
            except Exception:
                logger.exception("Additionally failed to emit join_room_error to %s", session_id)

    def handle_leave_room(self, session_id: str, data: Dict):
        """Handle leave room request"""
        try:
            room_id = self.room_service.leave_room(session_id)
            
            if room_id:
                # Leave socket room (using SocketIO instance to avoid request context)
                try:
                    if hasattr(self.socketio, 'leave_room'):
                        self.socketio.leave_room(session_id, room_id)
                    elif hasattr(self.socketio, 'server') and hasattr(self.socketio.server, 'leave_room'):
                        self.socketio.server.leave_room(session_id, room_id)
                    else:
                        logger.warning("Unable to remove session from room via SocketIO API; room membership may be inconsistent")
                except Exception as e:
                    logger.error(f"Error removing session {session_id} from room {room_id}: {e}")
                
                # Notify the user they left
                self.socketio.emit("room_left", {
                    "room_id": room_id,
                    "session_id": session_id,
                    "timestamp": time.time()
                }, room=session_id)

                # Notify other users in the room
                self.room_service.broadcast_to_room(
                    room_id,
                    "user_left",
                    {
                        "session_id": session_id,
                        "room_id": room_id,
                        "timestamp": time.time()
                    },
                    exclude_session=session_id
                )

                logger.info(f"User {session_id} left room {room_id}")
            else:
                self.socketio.emit("leave_room_error", {
                    "error": "Not in any room",
                    "timestamp": time.time()
                }, room=session_id)

        except Exception as e:
            logger.error(f"Error handling leave room for {session_id}: {e}")

    def handle_collaboration_event(self, session_id: str, data: Dict, product_id: str = ""):
        """Handle collaboration events (changes, cursor movements, etc.)"""
        logger.debug("Handle collaboration event triggered with data: %s", data)
        try:
            if session_id and session_id == "add_flow":
                room_id = product_id
            else:
                room_id = self.room_service.get_user_room(session_id)
            
            logger.info("Collaboration event from session %s in room %s", session_id, room_id)

            if not room_id:
                logger.debug("Not in any room for session: %s", session_id)
                self.socketio.emit("collaboration_error", {
                    "error": "Not in any room",
                    "timestamp": time.time()
                }, room=session_id)
                return

            # Update user activity only when it is a socket connection
            if session_id and session_id != "add_flow":
                logger.debug("Updating user activity for session: %s", session_id)
                self.room_service.update_user_activity(session_id)

            # Add metadata to the event
            event_data = {
                "session_id": session_id,
                "room_id": room_id,
                "timestamp": time.time(),
                "data": data
            }

            # Apply to persistence if available
            logger.info("Attempting to apply operation to persistence for room %s", room_id)
            if not self.persistence_service:
                logger.warning("No persistence_service configured; skipping persistence for room %s", room_id)
            else:
                try:
                    # Log minimal identifying info about the operation
                    op_type = None
                    if isinstance(data, dict):
                        op_type = data.get("type") or data.get("op")
                    logger.info("Applying operation (type=%s) to persistence for room %s", op_type, room_id)

                    result = self.persistence_service.apply_operation(room_id, data, session_id)
                    logger.debug("persistence_service.apply_operation returned: %s", result)
                except Exception:
                    logger.exception("Exception while applying operation to persistence for room %s", room_id)

            event_type = "collaboration_event"
            if isinstance(data, dict):
                extracted_type = data.get("type")
                if extracted_type:
                    event_type = extracted_type

            # Broadcast to all other users in the room
            self.room_service.broadcast_to_room(
                room_id,
                event_type,
                event_data,
                exclude_session=session_id
            )

            logger.debug(f"Broadcasted collaboration event from {session_id} in room {room_id}")

        except Exception as e:
            logger.error(f"Error handling collaboration event for {session_id}: {e}")

    def handle_heartbeat(self, session_id: str, data: Dict):
        """Handle heartbeat to keep connection alive"""
        try:
            # Update user activity
            self.room_service.update_user_activity(session_id)
            
            if session_id in self.connected_clients:
                self.connected_clients[session_id]["last_activity"] = time.time()

            # Send heartbeat response
            self.socketio.emit("heartbeat_response", {
                "timestamp": time.time()
            }, room=session_id)

        except Exception as e:
            logger.error(f"Error handling heartbeat for {session_id}: {e}")

    def get_collaboration_status(self, session_id: str) -> Dict:
        """Get collaboration status for a user"""
        try:
            room_id = self.room_service.get_user_room(session_id)
            room_info = None
            
            if room_id:
                room_info = self.room_service.get_room_info(room_id)

            return {
                "session_id": session_id,
                "room_id": room_id,
                "room_info": room_info,
                "connected": session_id in self.connected_clients,
                "timestamp": time.time()
            }

        except Exception as e:
            logger.error(f"Error getting collaboration status for {session_id}: {e}")
            return {
                "error": "Failed to get status",
                "timestamp": time.time()
            }

    def get_server_stats(self) -> Dict:
        """Get server statistics"""
        try:
            return {
                "total_connected_clients": len(self.connected_clients),
                "total_active_rooms": len(self.room_service.active_rooms),
                "rooms_info": self.room_service.get_all_rooms_info(),
                "timestamp": time.time()
            }

        except Exception as e:
            logger.error(f"Error getting server stats: {e}")
            return {
                "error": "Failed to get stats",
                "timestamp": time.time()
            }
