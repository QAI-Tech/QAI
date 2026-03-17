def init_socket_routes(streaming_service, socketio):
    """Initialize WebSocket routes with service dependency"""

    @socketio.on("connect")
    def handle_connect():
        streaming_service.handle_connect()

    @socketio.on("disconnect")
    def handle_disconnect():
        streaming_service.handle_disconnect()

    @socketio.on("error")
    def handle_error(error):
        streaming_service.handle_error(error)

    @socketio.on("start_stream")
    def handle_start_stream():
        streaming_service.handle_start_stream()

    @socketio.on("stop_stream")
    def handle_stop_stream():
        streaming_service.handle_stop_stream()
