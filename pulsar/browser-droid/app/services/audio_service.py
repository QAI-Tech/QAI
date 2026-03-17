import os
import logging
from typing import Dict, Any
from werkzeug.datastructures import FileStorage

logger = logging.getLogger(__name__)


class AudioService:
    """Service for handling audio upload and transcription operations"""

    def __init__(self, config, llm_wrapper):
        self.config = config
        self.llm_wrapper = llm_wrapper

    def upload_audio(self, audio_file: FileStorage, session_id: str) -> Dict[str, Any]:
        """Upload audio recording and start transcription"""
        try:
            if not audio_file:
                return {"error": "No audio file uploaded"}

            if not audio_file.filename.endswith(".wav"):
                return {"error": "File must be a WAV audio file"}

            if not session_id:
                return {"error": "Session ID required"}

            # Create session directory
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            os.makedirs(session_dir, exist_ok=True)

            # Use session ID for filename
            filename = f"audio_{session_id}.wav"
            audio_path = os.path.join(session_dir, filename)
            audio_file.save(audio_path)

            # Note: Audio transcription is now handled by the Session Orchestrator
            # to ensure proper sequencing and avoid race conditions

            logger.info("Audio file saved successfully")

            return {"status": "success", "filename": filename, "path": audio_path}

        except Exception as e:
            logger.error(f"Audio upload error: {e}")
            return {"error": str(e)}

    def generate_audio_transcription(self, session_id: str) -> Dict[str, Any]:
        """Generate audio transcription for a specific session"""
        try:
            # Check if audio file exists
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            audio_path = os.path.join(session_dir, f"audio_{session_id}.wav")

            if not os.path.exists(audio_path):
                return {"error": "Audio file not found"}

            # Use LLM wrapper to generate transcription
            if self.llm_wrapper:
                transcription_text = self.llm_wrapper.generate_audio_transcription(
                    session_id, audio_path, save_to_file=True
                )

                logger.info(f"Audio transcription completed for session {session_id}")
                return {
                    "status": "success",
                    "transcription": transcription_text,
                }
            else:
                return {"error": "LLM wrapper not available"}

        except Exception as e:
            logger.error(f"Audio transcription error for session {session_id}: {e}")
            return {"error": str(e)}
