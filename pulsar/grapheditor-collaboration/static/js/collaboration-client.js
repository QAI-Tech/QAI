/**
 * GraphEditor Collaboration Client Library
 * 
 * A client library for connecting to the GraphEditor collaboration server
 * Following the same patterns as browser-droid
 */

class CollaborationClient {
    constructor(serverUrl = 'http://localhost:8001', options = {}) {
        this.serverUrl = serverUrl;
        this.socket = null;
        this.connected = false;
        this.currentRoom = null;
        this.sessionId = null;
        this.options = {
            autoReconnect: true,
            heartbeatInterval: 30000, // 30 seconds
            ...options
        };
        
        // Event handlers
        this.eventHandlers = {
            connect: [],
            disconnect: [],
            room_joined: [],
            room_left: [],
            user_joined: [],
            user_left: [],
            collaboration_event: [],
            cursor_movement: [],
            error: []
        };
        
        this.heartbeatTimer = null;
    }

    /**
     * Connect to the collaboration server
     */
    connect() {
        if (this.socket) {
            this.disconnect();
        }

        return new Promise((resolve, reject) => {
            try {
                this.socket = io(this.serverUrl);
                
                this.socket.on('connect', () => {
                    this.connected = true;
                    this.sessionId = this.socket.id;
                    this._startHeartbeat();
                    this._emit('connect', { sessionId: this.sessionId });
                    resolve(this.sessionId);
                });

                this.socket.on('disconnect', () => {
                    this.connected = false;
                    this.currentRoom = null;
                    this._stopHeartbeat();
                    this._emit('disconnect');
                });

                this.socket.on('connection_status', (data) => {
                    console.log('Connection status:', data);
                });

                this.socket.on('room_joined', (data) => {
                    this.currentRoom = data.room_id;
                    this._emit('room_joined', data);
                });

                this.socket.on('room_left', (data) => {
                    this.currentRoom = null;
                    this._emit('room_left', data);
                });

                this.socket.on('user_joined', (data) => {
                    this._emit('user_joined', data);
                });

                this.socket.on('user_left', (data) => {
                    this._emit('user_left', data);
                });

                this.socket.on('collaboration_event', (data) => {
                    this._emit('collaboration_event', data);
                });

                this.socket.on('cursor_movement', (data) => {
                    this._emit('cursor_movement', data);
                });

                this.socket.on('heartbeat_response', (data) => {
                    // Heartbeat acknowledged
                });

                this.socket.on('error', (error) => {
                    this._emit('error', error);
                    reject(error);
                });

                // Handle various error events
                ['join_room_error', 'leave_room_error', 'collaboration_error'].forEach(event => {
                    this.socket.on(event, (data) => {
                        this._emit('error', { type: event, data });
                    });
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Disconnect from the server
     */
    disconnect() {
        this._stopHeartbeat();
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.connected = false;
        this.currentRoom = null;
    }

    /**
     * Join a collaboration room
     */
    joinRoom(roomId, userData = {}) {
        if (!this.connected) {
            throw new Error('Not connected to server');
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Join room timeout'));
            }, 10000);

            const onJoined = (data) => {
                clearTimeout(timeout);
                this.off('room_joined', onJoined);
                this.off('error', onError);
                resolve(data);
            };

            const onError = (error) => {
                clearTimeout(timeout);
                this.off('room_joined', onJoined);
                this.off('error', onError);
                reject(error);
            };

            this.on('room_joined', onJoined);
            this.on('error', onError);

            this.socket.emit('join_room', {
                room_id: roomId,
                user_data: userData
            });
        });
    }

    /**
     * Leave the current room
     */
    leaveRoom() {
        if (!this.connected) {
            throw new Error('Not connected to server');
        }

        this.socket.emit('leave_room', {});
    }

    /**
     * Send a collaboration event
     */
    sendCollaborationEvent(eventType, eventData) {
        if (!this.connected || !this.currentRoom) {
            throw new Error('Not connected or not in a room');
        }

        this.socket.emit('collaboration_event', {
            type: eventType,
            data: eventData
        });
    }

    /**
     * Get current status
     */
    getStatus() {
        if (!this.connected) {
            throw new Error('Not connected to server');
        }

        return new Promise((resolve) => {
            const onResponse = (data) => {
                this.socket.off('status_response', onResponse);
                resolve(data);
            };

            this.socket.on('status_response', onResponse);
            this.socket.emit('get_status');
        });
    }

    /**
     * Add event listener
     */
    on(event, handler) {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(handler);
    }

    /**
     * Remove event listener
     */
    off(event, handler) {
        if (!this.eventHandlers[event]) {
            return;
        }
        const index = this.eventHandlers[event].indexOf(handler);
        if (index > -1) {
            this.eventHandlers[event].splice(index, 1);
        }
    }

    /**
     * Get current connection state
     */
    isConnected() {
        return this.connected;
    }

    /**
     * Get current room
     */
    getCurrentRoom() {
        return this.currentRoom;
    }

    /**
     * Get session ID
     */
    getSessionId() {
        return this.sessionId;
    }

    // Private methods

    _emit(event, data) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in event handler for ${event}:`, error);
                }
            });
        }
    }

    _startHeartbeat() {
        if (this.options.heartbeatInterval > 0) {
            this.heartbeatTimer = setInterval(() => {
                if (this.connected && this.socket) {
                    this.socket.emit('heartbeat', {});
                }
            }, this.options.heartbeatInterval);
        }
    }

    _stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
}

// Export for use in both browser and Node.js environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CollaborationClient;
} else if (typeof window !== 'undefined') {
    window.CollaborationClient = CollaborationClient;
}
