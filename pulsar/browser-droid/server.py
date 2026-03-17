# backend/server.py

# Standard library imports
import logging
import sys
import os

# Third-party imports
from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO

# Local imports
import app.config as config
from app.services.adb_service import ADBService
from app.services.recording_service import RecordingService
from app.services.annotation_service import AnnotationService
from app.services.graph_service import GraphService
from app.services.video_slice_service import VideoSliceService
from app.services.streaming_service import StreamingService
from app.services.audio_service import AudioService
from app.services.interval_service import IntervalService
from app.services.session_orchestrator import SessionOrchestrator
from app.services.element_detection_service import ElementDetectionService
from app.routes.device_routes import create_device_blueprint
from app.routes.audio_routes import create_audio_blueprint
from app.routes.annotation_routes import create_annotation_blueprint
from app.routes.video_routes import create_video_blueprint
from app.routes.system_routes import create_system_blueprint
from app.routes.orchestrator_routes import create_orchestrator_blueprint
from app.routes.graph_routes import create_graph_blueprint
from app.routes.socket_routes import init_socket_routes

# Load environment variables from .env file
load_dotenv()

# Add parent directory to path to import llm_wrapper
sys.path.append("..")
from wrappers.llm_wrapper import LLMWrapper

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Set environment variables to suppress gRPC warnings globally
os.environ.update(
    {"GRPC_VERBOSITY": "ERROR", "GRPC_TRACE": "all", "GRPC_LOGGER": "off"}
)


def create_app():
    """Application factory pattern"""
    app = Flask(__name__, static_folder="static")
    CORS(app)
    socketio = SocketIO(app, cors_allowed_origins="*")

    # Ensure directories exist
    config.ensure_directories()

    llm_wrapper = LLMWrapper()

    # Initialize services
    adb_service = ADBService(config)
    recording_service = RecordingService(config, adb_service)
    graph_service = GraphService(
        config, annotation_service=None, llm_wrapper=llm_wrapper
    )  # Will be set after annotation_service creation
    annotation_service = AnnotationService(
        config, recording_service, adb_service, interval_service=None
    )
    interval_service = IntervalService(config, llm_wrapper, graph_service)
    # Set the annotation service in graph service and interval service in annotation service
    graph_service.annotation_service = annotation_service
    annotation_service.set_interval_service(interval_service)
    video_slice_service = VideoSliceService(config, annotation_service, llm_wrapper)

    # Connect services
    recording_service.set_video_slice_service(video_slice_service)

    streaming_service = StreamingService(config, adb_service, socketio)
    audio_service = AudioService(config, llm_wrapper)

    # Create session orchestrator with queue support
    session_orchestrator = SessionOrchestrator(
        config=config,
        recording_service=recording_service,
        video_slice_service=video_slice_service,
        audio_service=audio_service,
        interval_service=interval_service,
        graph_service=graph_service,
        llm_wrapper=llm_wrapper,
        max_concurrent_sessions=3,  # Allow 3 sessions to process simultaneously
    )

    # Connect orchestrator to recording service
    recording_service.set_session_orchestrator(session_orchestrator)

    # Initialize element detection service
    element_detection_service = ElementDetectionService(
        config, adb_service, recording_service
    )

    # Register blueprints
    app.register_blueprint(
        create_device_blueprint(
            adb_service, recording_service, config, element_detection_service
        )
    )
    app.register_blueprint(create_audio_blueprint(audio_service))
    app.register_blueprint(create_annotation_blueprint(annotation_service))
    app.register_blueprint(create_video_blueprint(video_slice_service))
    app.register_blueprint(
        create_system_blueprint(
            adb_service, recording_service, streaming_service, config
        )
    )
    app.register_blueprint(create_graph_blueprint(graph_service))
    app.register_blueprint(create_orchestrator_blueprint(session_orchestrator))

    # Initialize socket routes
    init_socket_routes(streaming_service, socketio)

    return app, socketio, streaming_service


def start_scrcpy_stream(streaming_service):
    """Initialize scrcpy streaming"""
    return streaming_service.initialize_scrcpy_stream()


if __name__ == "__main__":
    app, socketio, streaming_service = create_app()

    # Try to initialize scrcpy streaming, but don't fail if no device is connected
    if start_scrcpy_stream(streaming_service):
        logger.info("Scrcpy streaming initialized successfully")
    else:
        logger.warning(
            "No ADB device connected. Server will start and automatically connect when device becomes available."
        )

    logger.info("Starting Flask server with SocketIO on http://localhost:8000")
    socketio.run(app, host="0.0.0.0", port=8000, debug=True)
