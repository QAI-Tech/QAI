import os
import json
import logging
import threading
import time
import queue
from datetime import datetime
from typing import Dict, Any, List, Optional, Callable
from enum import Enum

logger = logging.getLogger(__name__)


class ProcessingPhase(Enum):
    """Enumeration of processing phases"""

    INITIALIZED = "initialized"
    VIDEO_PROCESSING = "video_processing"
    AUDIO_PROCESSING = "audio_processing"
    INTERVAL_ANALYSIS = "interval_analysis"
    GRAPH_GENERATION = "graph_generation"
    CLEANUP = "cleanup"
    COMPLETED = "completed"
    FAILED = "failed"


class SessionContext:
    """Encapsulates session-specific state and processing logic"""

    def __init__(
        self, session_id: str, reset_cache: bool = False, product_id: str = ""
    ):
        self.session_id = session_id
        self.reset_cache = reset_cache
        self.product_id = product_id

        # Session state
        self.current_phase = ProcessingPhase.INITIALIZED
        self.progress = 0.0  # 0.0 to 1.0
        self.status_message = ""
        self.error_message = ""
        self.start_time: Optional[datetime] = None
        self.end_time: Optional[datetime] = None

        # Processing results
        self.results = {
            "video_slices": [],
            "audio_transcription": None,
            "intervals": [],
            "graph_created": False,
            "graph": None,
            "errors": [],
        }

        # Threading
        self.processing_thread: Optional[threading.Thread] = None
        self.is_processing = False

    def get_status(self) -> Dict[str, Any]:
        """Get current processing status for this session"""
        return {
            "session_id": self.session_id,
            "is_processing": self.is_processing,
            "current_phase": self.current_phase.value,
            "progress": self.progress,
            "status_message": self.status_message,
            "error_message": self.error_message,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "results": self.results,
        }


class SessionOrchestrator:
    """Orchestrator for coordinating post-session processing with queue support"""

    def __init__(
        self,
        config,
        recording_service,
        video_slice_service,
        audio_service,
        interval_service,
        graph_service,
        llm_wrapper,
        session_processor,
        max_concurrent_sessions: int = 1,
    ):
        """
        Initialize the session orchestrator

        Args:
            config: Application configuration
            recording_service: Recording service instance
            video_slice_service: Video slice service instance
            audio_service: Audio service instance
            interval_service: Interval service instance
            graph_service: Graph service instance
            llm_wrapper: LLM wrapper instance
            session_processor: Session interactions processor instance
            max_concurrent_sessions: Maximum number of sessions to process simultaneously
        """
        self.config = config
        self.recording_service = recording_service
        self.video_slice_service = video_slice_service
        self.audio_service = audio_service
        self.interval_service = interval_service
        self.graph_service = graph_service
        self.llm_wrapper = llm_wrapper
        self.session_processor = session_processor
        # Queue management
        self.max_concurrent_sessions = max_concurrent_sessions
        self.session_queue = queue.Queue()
        self.active_sessions: Dict[str, SessionContext] = {}
        self.completed_sessions: Dict[str, SessionContext] = {}

        # Workflow mode from config ("default" or "graph_only")
        self.workflow_mode = getattr(self.config, "WORKFLOW_MODE", "default").lower()

        # Threading
        self.queue_processor_thread: Optional[threading.Thread] = None
        self.is_queue_processor_running = False
        self._stop_queue_processor = threading.Event()

        # Callbacks for progress updates
        self.progress_callbacks: List[Callable] = []

        # Start queue processor
        self._start_queue_processor()

    def _start_queue_processor(self):
        """Start the background thread that processes the session queue"""
        if not self.is_queue_processor_running:
            self.queue_processor_thread = threading.Thread(
                target=self._process_queue, daemon=True
            )
            self.queue_processor_thread.start()
            self.is_queue_processor_running = True
            logger.info("Session queue processor started")

    def _process_queue(self):
        """Background thread that processes sessions from the queue"""
        while not self._stop_queue_processor.is_set():
            try:
                # Check if we can start a new session
                if len(self.active_sessions) < self.max_concurrent_sessions:
                    try:
                        # Get next session from queue (non-blocking)
                        session_context = self.session_queue.get_nowait()
                        self._start_session_processing(session_context)
                    except queue.Empty:
                        # No sessions in queue, sleep briefly
                        time.sleep(0.1)
                else:
                    # At capacity, sleep briefly
                    time.sleep(0.1)

            except Exception as e:
                logger.error(f"Error in queue processor: {e}")
                time.sleep(1)  # Wait before retrying

    def _start_session_processing(self, session_context: SessionContext):
        """Start processing for a specific session"""
        try:
            session_context.is_processing = True
            session_context.start_time = datetime.now()
            session_context.current_phase = ProcessingPhase.INITIALIZED
            session_context.progress = 0.0
            session_context.status_message = "Initializing session processing..."
            session_context.error_message = ""

            # Add to active sessions
            self.active_sessions[session_context.session_id] = session_context

            # Start processing in background thread
            session_context.processing_thread = threading.Thread(
                target=self._process_session_workflow,
                args=(session_context,),
                daemon=True,
            )
            session_context.processing_thread.start()

            logger.info(f"Started session processing for {session_context.session_id}")

        except Exception as e:
            logger.error(
                f"Failed to start session processing for {session_context.session_id}: {e}"
            )
            session_context.current_phase = ProcessingPhase.FAILED
            session_context.error_message = str(e)
            session_context.is_processing = False

    def start_session_processing(
        self, session_id: str, reset_cache: bool = False, product_id: str = ""
    ) -> Dict[str, Any]:
        """
        Request session processing (adds to queue if needed)

        Args:
            session_id: The session ID to process
            reset_cache: If True, each processing phase will clear its cache and reprocess
            product_id: Product ID for the session

        Returns:
            Dict containing status
        """
        try:
            # Check if session is already being processed
            if session_id in self.active_sessions:
                return {
                    "status": "already_processing",
                    "session_id": session_id,
                    "message": f"Session {session_id} is already being processed",
                }

            # Check if session was already completed
            if session_id in self.completed_sessions:
                return {
                    "status": "already_completed",
                    "session_id": session_id,
                    "message": f"Session {session_id} was already processed",
                }

            # Create session context
            session_context = SessionContext(session_id, reset_cache, product_id)

            # Check if we can start processing immediately
            if len(self.active_sessions) < self.max_concurrent_sessions:
                # Start processing immediately
                self._start_session_processing(session_context)
                return {
                    "status": "started",
                    "session_id": session_id,
                    "reset_cache": reset_cache,
                    "message": f"Session processing started with reset_cache={reset_cache}",
                }
            else:
                # Add to queue
                self.session_queue.put(session_context)
                queue_position = self.session_queue.qsize()
                return {
                    "status": "queued",
                    "session_id": session_id,
                    "reset_cache": reset_cache,
                    "queue_position": queue_position,
                    "message": f"Session queued for processing (position: {queue_position})",
                }

        except Exception as e:
            logger.error(f"Failed to request session processing: {e}")
            return {"status": "error", "error": str(e)}

    def get_status(self) -> Dict[str, Any]:
        """Get current processing status for all sessions"""
        active_statuses = {
            session_id: context.get_status()
            for session_id, context in self.active_sessions.items()
        }

        completed_statuses = {
            session_id: context.get_status()
            for session_id, context in self.completed_sessions.items()
        }

        return {
            "queue_size": self.session_queue.qsize(),
            "active_sessions": active_statuses,
            "completed_sessions": completed_statuses,
            "max_concurrent_sessions": self.max_concurrent_sessions,
            "current_active_count": len(self.active_sessions),
        }

    def get_session_status(self, session_id: str) -> Dict[str, Any]:
        """Get status for a specific session"""
        # Check active sessions
        if session_id in self.active_sessions:
            return self.active_sessions[session_id].get_status()

        # Check completed sessions
        if session_id in self.completed_sessions:
            return self.completed_sessions[session_id].get_status()

        # Check if in queue
        queue_items = list(self.session_queue.queue)
        for item in queue_items:
            if item.session_id == session_id:
                return {
                    "session_id": session_id,
                    "status": "queued",
                    "queue_position": queue_items.index(item) + 1,
                    "message": f"Session is queued for processing",
                }

        return {"error": f"Session {session_id} not found"}

    def _process_session_workflow(self, session_context: SessionContext):
        """Main processing workflow for a specific session - runs in background thread"""
        try:
            logger.info(
                f"Starting session workflow for {session_context.session_id} (mode={self.workflow_mode})"
            )
            if self.workflow_mode == "record_n_plan":
                # Record and plan workflow: Process interactions with screenshots
                self._process_record_n_plan_workflow(session_context)
                self._process_cleanup_phase(session_context)
            else:
                # Default full workflow
                self._process_video_phase(session_context)

                self._process_audio_phase(session_context)
                self._process_interval_analysis_phase(session_context)
                self._process_graph_generation_phase(session_context)
                self._process_cleanup_phase(session_context)

            # Mark as completed
            session_context.current_phase = ProcessingPhase.COMPLETED
            session_context.progress = 1.0
            session_context.status_message = "Session processing completed successfully"
            session_context.end_time = datetime.now()
            logger.info(
                f"Session processing completed for {session_context.session_id}"
            )

        except Exception as e:
            logger.error(
                f"Session processing failed for {session_context.session_id}: {e}"
            )
            session_context.current_phase = ProcessingPhase.FAILED
            session_context.error_message = str(e)
            session_context.results["errors"].append(str(e))
            session_context.end_time = datetime.now()

        finally:
            # Move from active to completed
            if session_context.session_id in self.active_sessions:
                del self.active_sessions[session_context.session_id]
                self.completed_sessions[session_context.session_id] = session_context

            session_context.is_processing = False

    def _process_graph_only_workflow(self, session_context: SessionContext):
        """Process graph generation and cleanup for a specific session"""
        try:
            pass
        except Exception as e:
            logger.error(f"Graph only workflow failed: {e}")

    def _process_record_n_plan_workflow(self, session_context: SessionContext):
        """Process interactions with screenshots for a specific session"""
        try:
            session_context.current_phase = ProcessingPhase.INTERVAL_ANALYSIS
            session_context.progress = 0.5
            session_context.status_message = "Processing interactions..."
            self._notify_progress(session_context)

            logger.info(
                f"Processing interactions for session {session_context.session_id}"
            )
            result = self.session_processor.process_interactions_with_screenshots(
                session_id=session_context.session_id,
                product_id=session_context.product_id,
            )
            session_context.results["interactions_processed"] = True
            session_context.results["interactions_result"] = result
            session_context.status_message = "Interactions processing completed"
            session_context.progress = 0.8
            self._notify_progress(session_context)
            logger.info(
                f"Interactions processing completed for session {session_context.session_id}"
            )

        except Exception as e:
            logger.error(f"Record and plan workflow failed: {e}")
            session_context.results["errors"].append(
                f"Record and plan workflow: {str(e)}"
            )
            raise

    def _process_video_phase(self, session_context: SessionContext):
        """Process video slicing and transition analysis for a specific session"""
        try:
            session_context.current_phase = ProcessingPhase.VIDEO_PROCESSING
            session_context.progress = 0.1

            # Check if video slicing is enabled
            if not self.config.ENABLE_VIDEO_SLICING:
                logger.info(
                    f"Video slicing is disabled, skipping video processing for session {session_context.session_id}"
                )
                session_context.status_message = (
                    "Video slicing is disabled, skipping video processing"
                )
                session_context.progress = 0.3
                self._notify_progress(session_context)
                return

            session_context.status_message = "Processing video slices..."
            self._notify_progress(session_context)

            # Check if video file exists
            session_dir = os.path.join(
                self.config.UPLOADS_DIR, session_context.session_id
            )
            video_path = os.path.join(
                session_dir, f"recording_{session_context.session_id}.mp4"
            )

            if not os.path.exists(video_path):
                logger.warning(f"Video file not found: {video_path}")
                session_context.status_message = (
                    "Video file not found, skipping video processing"
                )
                session_context.progress = 0.3
                self._notify_progress(session_context)
                return

            # Check if video slices already exist and handle cache reset
            video_slices_dir = os.path.join(session_dir, "video_slices")
            if os.path.exists(video_slices_dir) and not session_context.reset_cache:
                logger.info("Video slices already exist, skipping video processing")
                session_context.status_message = (
                    "Video slices already exist, skipping video processing"
                )
                session_context.progress = 0.3
                self._notify_progress(session_context)
                return

            # Clear video cache if reset_cache is True
            if session_context.reset_cache:
                self._clear_video_cache(session_context.session_id)

            # Process video slices
            slice_result = self.video_slice_service.slice_video_by_annotations(
                session_context.session_id
            )

            if slice_result.get("status") == "success":
                session_context.results["video_slices"] = slice_result.get("slices", [])
                logger.info(
                    f"Video processing completed: {len(session_context.results['video_slices'])} slices"
                )
            elif slice_result.get("status") == "skipped":
                session_context.results["video_slices"] = []
                logger.info(
                    f"Video processing skipped: {slice_result.get('reason', 'Unknown reason')}"
                )
            else:
                logger.warning(
                    f"Video processing failed: {slice_result.get('error', 'Unknown error')}"
                )
                session_context.results["errors"].append(
                    f"Video processing: {slice_result.get('error', 'Unknown error')}"
                )

            session_context.progress = 0.3
            session_context.status_message = "Video processing completed"
            self._notify_progress(session_context)

        except Exception as e:
            logger.error(f"Video processing phase failed: {e}")
            session_context.results["errors"].append(f"Video processing: {str(e)}")
            raise

    def _process_audio_phase(self, session_context: SessionContext):
        """Process audio transcription for a specific session"""
        import time

        try:
            session_context.current_phase = ProcessingPhase.AUDIO_PROCESSING
            session_context.progress = 0.35
            session_context.status_message = "Processing audio transcription..."
            self._notify_progress(session_context)

            # Check if audio file exists, with retry for race condition
            session_dir = os.path.join(
                self.config.UPLOADS_DIR, session_context.session_id
            )
            audio_path = os.path.join(
                session_dir, f"audio_{session_context.session_id}.wav"
            )

            max_wait = 5  # seconds
            wait_time = 0.5  # seconds
            waited = 0
            while not os.path.exists(audio_path) and waited < max_wait:
                logger.warning(
                    f"Audio file not found: {audio_path}, waiting {wait_time}s..."
                )
                time.sleep(wait_time)
                waited += wait_time

            if not os.path.exists(audio_path):
                logger.warning(f"Audio file not found after waiting: {audio_path}")
                session_context.status_message = (
                    "Audio file not found, skipping audio processing"
                )
                session_context.progress = 0.5
                self._notify_progress(session_context)
                return

            # Check if transcription already exists and handle cache reset
            transcription_file = os.path.join(
                session_dir, f"audio_{session_context.session_id}_transcription.json"
            )
            if os.path.exists(transcription_file) and not session_context.reset_cache:
                logger.info(
                    "Audio transcription already exists, skipping audio processing"
                )
                session_context.status_message = (
                    "Audio transcription already exists, skipping audio processing"
                )
                session_context.progress = 0.5
                self._notify_progress(session_context)
                return

            # Clear audio cache if reset_cache is True
            if session_context.reset_cache:
                self._clear_audio_cache(session_context.session_id)

            # Process audio transcription
            transcription_result = self.audio_service.generate_audio_transcription(
                session_context.session_id
            )

            if transcription_result.get("status") == "success":
                session_context.results["audio_transcription"] = (
                    transcription_result.get("transcription")
                )
                logger.info("Audio transcription completed successfully")
            else:
                logger.warning(
                    f"Audio transcription failed: {transcription_result.get('error', 'Unknown error')}"
                )
                session_context.results["errors"].append(
                    f"Audio transcription: {transcription_result.get('error', 'Unknown error')}"
                )

            session_context.progress = 0.5
            session_context.status_message = "Audio processing completed"
            self._notify_progress(session_context)

        except Exception as e:
            logger.error(f"Audio processing phase failed: {e}")
            session_context.results["errors"].append(f"Audio processing: {str(e)}")
            raise

    def _process_interval_analysis_phase(self, session_context: SessionContext):
        """Process interval analysis for a specific session"""
        try:
            session_context.current_phase = ProcessingPhase.INTERVAL_ANALYSIS
            session_context.progress = 0.55
            session_context.status_message = "Processing interval analysis..."
            self._notify_progress(session_context)

            # Check if interval analysis already exists and handle cache reset
            session_dir = os.path.join(
                self.config.UPLOADS_DIR, session_context.session_id
            )
            intervals_file = os.path.join(session_dir, "transcripted_intervals.json")
            transitions_file = os.path.join(session_dir, "transitions.json")

            if (
                os.path.exists(intervals_file)
                and os.path.exists(transitions_file)
                and not session_context.reset_cache
            ):
                logger.info(
                    "Interval analysis already exists, skipping interval analysis"
                )
                session_context.status_message = (
                    "Interval analysis already exists, skipping interval analysis"
                )
                session_context.progress = 0.7
                self._notify_progress(session_context)
                return

            # Clear interval cache if reset_cache is True
            if session_context.reset_cache:
                self._clear_interval_cache(session_context.session_id)

            # Process interval analysis
            interval_result = (
                self.interval_service.detect_transcription_annotation_intervals(
                    session_context.session_id
                )
            )

            if interval_result.get("status") == "success":
                session_context.results["intervals"] = interval_result.get(
                    "intervals", []
                )
                logger.info(
                    f"Interval analysis completed: {len(session_context.results['intervals'])} intervals"
                )
            else:
                logger.warning(
                    f"Interval analysis failed: {interval_result.get('error', 'Unknown error')}"
                )
                session_context.results["errors"].append(
                    f"Interval analysis: {interval_result.get('error', 'Unknown error')}"
                )

            session_context.progress = 0.7
            session_context.status_message = "Interval analysis completed"
            self._notify_progress(session_context)

        except Exception as e:
            logger.error(f"Interval analysis phase failed: {e}")
            session_context.results["errors"].append(f"Interval analysis: {str(e)}")
            raise

    def _process_graph_generation_phase(self, session_context: SessionContext):
        """Process graph generation for a specific session"""
        try:
            session_context.current_phase = ProcessingPhase.GRAPH_GENERATION
            session_context.progress = 0.75
            session_context.status_message = "Generating session graph..."
            self._notify_progress(session_context)

            # Check if graph already exists and handle cache reset
            session_dir = os.path.join(
                self.config.UPLOADS_DIR, session_context.session_id
            )
            graph_file = os.path.join(session_dir, "graph.json")

            if os.path.exists(graph_file) and not session_context.reset_cache:
                logger.info("Graph already exists, skipping graph generation")
                session_context.status_message = (
                    "Graph already exists, skipping graph generation"
                )
                session_context.progress = 0.9
                self._notify_progress(session_context)
                return

            # Clear graph cache if reset_cache is True
            if session_context.reset_cache:
                self._clear_graph_cache(session_context.session_id)

            # Generate graph
            graph_result = self.graph_service.create_graph_json(
                session_context.session_id, session_context.product_id
            )

            if graph_result.get("status") == "success":
                session_context.results["graph_created"] = True
                session_context.results["graph"] = graph_result
                logger.info(
                    f"Graph generation completed: {graph_result.get('total_screenshots', 0)} screenshots, {graph_result.get('total_edges', 0)} edges"
                )
            else:
                logger.warning(
                    f"Graph generation failed: {graph_result.get('error', 'Unknown error')}"
                )
                session_context.results["errors"].append(
                    f"Graph generation: {graph_result.get('error', 'Unknown error')}"
                )

            session_context.progress = 0.9
            session_context.status_message = "Graph generation completed"
            self._notify_progress(session_context)

        except Exception as e:
            logger.error(f"Graph generation phase failed: {e}")
            session_context.results["errors"].append(f"Graph generation: {str(e)}")
            raise

    def _process_cleanup_phase(self, session_context: SessionContext):
        """Final cleanup and organization for a specific session"""
        try:
            session_context.current_phase = ProcessingPhase.CLEANUP
            session_context.progress = 0.95
            session_context.status_message = "Finalizing session processing..."
            self._notify_progress(session_context)

            # Check if processing results already exist and handle cache reset
            session_dir = os.path.join(
                self.config.UPLOADS_DIR, session_context.session_id
            )
            results_file = os.path.join(session_dir, "processing_results.json")

            if os.path.exists(results_file) and not session_context.reset_cache:
                logger.info("Processing results already exist, skipping cleanup phase")
                session_context.status_message = (
                    "Processing results already exist, skipping cleanup phase"
                )
                session_context.progress = 1.0
                self._notify_progress(session_context)
                return

            # Clear processing results cache if reset_cache is True
            if session_context.reset_cache:
                self._clear_processing_results_cache(session_context.session_id)

            # Save processing results
            processing_summary = {
                "session_id": session_context.session_id,
                "processing_start": (
                    session_context.start_time.isoformat()
                    if session_context.start_time
                    else None
                ),
                "processing_end": (
                    session_context.end_time.isoformat()
                    if session_context.end_time
                    else None
                ),
                "status": session_context.current_phase.value,
                "progress": session_context.progress,
                "results": session_context.results,
                "errors": session_context.results["errors"],
            }

            with open(results_file, "w") as f:
                json.dump(processing_summary, f, indent=2)

            logger.info(f"Processing results saved to {results_file}")

            session_context.progress = 1.0
            session_context.status_message = "Session processing finalized"
            self._notify_progress(session_context)

        except Exception as e:
            logger.error(f"Cleanup phase failed: {e}")
            session_context.results["errors"].append(f"Cleanup phase: {str(e)}")
            raise

    def _clear_video_cache(self, session_id: str):
        """Clear video processing cache (video_slices directory)"""
        try:
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            video_slices_dir = os.path.join(session_dir, "video_slices")

            if os.path.exists(video_slices_dir):
                import shutil

                shutil.rmtree(video_slices_dir)
                logger.info(f"Cleared video_slices directory: {video_slices_dir}")
                return True
            return False
        except Exception as e:
            logger.error(f"Error clearing video cache: {e}")
            return False

    def _clear_audio_cache(self, session_id: str):
        """Clear audio processing cache (transcription files)"""
        try:
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            cleared_files = []

            for filename in os.listdir(session_dir):
                if filename.endswith("_transcription.json"):
                    file_path = os.path.join(session_dir, filename)
                    os.remove(file_path)
                    cleared_files.append(filename)
                    logger.info(f"Cleared transcription file: {filename}")

            return len(cleared_files) > 0
        except Exception as e:
            logger.error(f"Error clearing audio cache: {e}")
            return False

    def _clear_interval_cache(self, session_id: str):
        """Clear interval processing cache (transcripted_intervals.json, transitions.json)"""
        try:
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            cleared_files = []

            # Clear transcripted_intervals.json
            intervals_file = os.path.join(session_dir, "transcripted_intervals.json")
            if os.path.exists(intervals_file):
                os.remove(intervals_file)
                cleared_files.append("transcripted_intervals.json")
                logger.info(f"Cleared transcripted_intervals.json")

            # Clear transitions.json
            transitions_file = os.path.join(session_dir, "transitions.json")
            if os.path.exists(transitions_file):
                os.remove(transitions_file)
                cleared_files.append("transitions.json")
                logger.info(f"Cleared transitions.json")

            return len(cleared_files) > 0
        except Exception as e:
            logger.error(f"Error clearing interval cache: {e}")
            return False

    def _clear_graph_cache(self, session_id: str):
        """Clear graph processing cache (graph.json)"""
        try:
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            graph_file = os.path.join(session_dir, "graph.json")

            if os.path.exists(graph_file):
                os.remove(graph_file)
                logger.info(f"Cleared graph.json")
                return True
            return False
        except Exception as e:
            logger.error(f"Error clearing graph cache: {e}")
            return False

    def _clear_processing_results_cache(self, session_id: str):
        """Clear processing results cache (processing_results.json)"""
        try:
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            results_file = os.path.join(session_dir, "processing_results.json")

            if os.path.exists(results_file):
                os.remove(results_file)
                logger.info(f"Cleared processing_results.json")
                return True
            return False
        except Exception as e:
            logger.error(f"Error clearing processing results cache: {e}")
            return False

    def add_progress_callback(self, callback: Callable):
        """Add a callback for progress updates"""
        self.progress_callbacks.append(callback)

    def _notify_progress(self, session_context: SessionContext):
        """Notify all progress callbacks with session-specific status"""
        status = session_context.get_status()
        for callback in self.progress_callbacks:
            try:
                callback(status)
            except Exception as e:
                logger.error(f"Progress callback error: {e}")
