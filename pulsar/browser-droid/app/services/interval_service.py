import os
import json
import logging
import subprocess
from typing import Dict, Any, List

logger = logging.getLogger(__name__)


class IntervalService:
    """Service for handling interval detection and analysis"""

    def __init__(self, config, llm_wrapper=None, graph_service=None):
        self.config = config
        self.llm_wrapper = llm_wrapper  # Can be None to bypass LLM calls
        self.graph_service = graph_service

    def detect_transcription_annotation_intervals(
        self,
        session_id: str,
        transcription_file: str = None,
        annotations_file: str = None,
    ) -> Dict[str, Any]:
        """
        Detect which parts of audio transcriptions fall between annotation intervals.
        A transcription is considered to belong to an interval if its start timestamp
        falls within that interval.

        Args:
            session_id (str): Session ID to load data for
            transcription_file (str, optional): Custom path to transcription file
            annotations_file (str, optional): Custom path to annotations file

        Returns:
            Dict[str, Any]: Status of the operation and file path where result was saved
        """
        try:
            # Determine file paths
            session_dir = os.path.join("uploads", session_id)

            if transcription_file is None:
                # Find transcription file in session directory
                transcription_files = [
                    f
                    for f in os.listdir(session_dir)
                    if "_transcription" in f and f.endswith(".json")
                ]
                if not transcription_files:
                    raise FileNotFoundError(
                        f"No transcription file found in session {session_id}"
                    )
                transcription_file = os.path.join(session_dir, transcription_files[0])

            if annotations_file is None:
                annotations_file = os.path.join(session_dir, "annotations.json")

            # Load transcription data
            if not os.path.exists(transcription_file):
                raise FileNotFoundError(
                    f"Transcription file not found: {transcription_file}"
                )

            with open(transcription_file, "r", encoding="utf-8") as f:
                transcriptions = json.load(f)

            # Load annotation data
            if not os.path.exists(annotations_file):
                raise FileNotFoundError(
                    f"Annotations file not found: {annotations_file}"
                )

            with open(annotations_file, "r", encoding="utf-8") as f:
                annotations = json.load(f)

            # Sort annotations by timestamp
            annotations.sort(
                key=lambda x: self._timestamp_to_seconds(x["recording_timestamp"])
            )

            # Create intervals from annotations
            intervals = self._create_intervals(annotations, session_dir, session_id)

            # Match transcriptions to intervals
            unmatched_transcriptions = self._match_transcriptions_to_intervals(
                transcriptions, intervals
            )

            # Prepare result
            result = {
                "session_id": session_id,
                "intervals": intervals,
                "unmatched_transcriptions": unmatched_transcriptions,
                "total_intervals": len(intervals),
                "total_transcriptions": len(transcriptions),
                "matched_transcriptions": len(transcriptions)
                - len(unmatched_transcriptions),
            }

            # Save result to file
            output_file = os.path.join(session_dir, "transcripted_intervals.json")
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(result, f, indent=2, ensure_ascii=False)

            logger.info(
                f"Interval detection completed for session {session_id}: "
                f"{result['matched_transcriptions']}/{result['total_transcriptions']} "
                f"transcriptions matched to {result['total_intervals']} intervals"
            )
            logger.info(f"Results saved to: {output_file}")

            # Process intervals with LLM for transition analysis
            try:
                logger.info(
                    "Starting transition detection from transcripted intervals..."
                )
                self._process_intervals_with_llm(session_id, intervals)
                logger.info("Transition detection completed successfully")
            except Exception as e:
                logger.warning(f"Transition detection failed: {e}")
                # Don't fail the entire process if transition detection fails
                # The error will be logged but the interval detection will still succeed

            return {
                "status": "success",
                "message": f"Interval detection completed and saved to {output_file}",
                "file_path": output_file,
                "total_intervals": result["total_intervals"],
                "total_transcriptions": result["total_transcriptions"],
                "matched_transcriptions": result["matched_transcriptions"],
            }

        except Exception as e:
            logger.error(f"Error detecting transcription-annotation intervals: {e}")
            raise Exception(f"Error in interval detection: {e}")

    def _create_intervals(
        self, annotations: List[Dict[str, Any]], session_dir: str, session_id: str
    ) -> List[Dict[str, Any]]:
        """Create intervals from annotations"""
        intervals = []

        # Add initial interval from 00:00 to first annotation (if annotations exist)
        if annotations:
            first_annotation = annotations[0]
            initial_interval = {
                "annotation_start": "00:00:00:000",
                "annotation_end": first_annotation["recording_timestamp"],
                "start_seconds": 0.0,
                "end_seconds": self._timestamp_to_seconds(
                    first_annotation["recording_timestamp"]
                ),
                "screenshot_before": None,  # No screenshot before the first annotation
                "screenshot_after": first_annotation["screenshot_file"],
                "transcriptions": [],
            }
            intervals.append(initial_interval)

        # Add intervals between consecutive annotations
        for i in range(len(annotations) - 1):
            interval = {
                "annotation_start": annotations[i]["recording_timestamp"],
                "annotation_end": annotations[i + 1]["recording_timestamp"],
                "start_seconds": self._timestamp_to_seconds(
                    annotations[i]["recording_timestamp"]
                ),
                "end_seconds": self._timestamp_to_seconds(
                    annotations[i + 1]["recording_timestamp"]
                ),
                "screenshot_before": annotations[i]["screenshot_file"],
                "screenshot_after": annotations[i + 1]["screenshot_file"],
                "transcriptions": [],
            }
            intervals.append(interval)

        # Add final interval from last annotation to end of recording
        if annotations:
            last_annotation = annotations[-1]
            end_seconds = self._get_video_duration(session_dir, session_id)

            final_interval = {
                "annotation_start": last_annotation["recording_timestamp"],
                "annotation_end": "end_of_recording",
                "start_seconds": self._timestamp_to_seconds(
                    last_annotation["recording_timestamp"]
                ),
                "end_seconds": end_seconds,
                "screenshot_before": last_annotation["screenshot_file"],
                "screenshot_after": None,  # No screenshot after the last annotation
                "transcriptions": [],
            }
            intervals.append(final_interval)
        else:
            # No annotations - create single interval from 00:00 to end
            end_seconds = self._get_video_duration(session_dir, session_id)

            single_interval = {
                "annotation_start": "00:00:00:000",
                "annotation_end": "end_of_recording",
                "start_seconds": 0.0,
                "end_seconds": end_seconds,
                "screenshot_before": None,
                "screenshot_after": None,
                "transcriptions": [],
            }
            intervals.append(single_interval)

        return intervals

    def _match_transcriptions_to_intervals(
        self, transcriptions: List[Dict[str, Any]], intervals: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Match transcriptions to intervals based on start or end timestamp"""
        unmatched_transcriptions = []

        for transcription in transcriptions:
            transcription_start_seconds = self._transcription_timestamp_to_seconds(
                transcription["start_timestamp"]
            )
            transcription_end_seconds = self._transcription_timestamp_to_seconds(
                transcription["end_timestamp"]
            )

            # Find which intervals this transcription belongs to
            matched = False
            for interval in intervals:
                # Check if transcription starts OR ends within this interval
                starts_in_interval = (
                    interval["start_seconds"]
                    <= transcription_start_seconds
                    < interval["end_seconds"]
                )
                ends_in_interval = (
                    interval["start_seconds"]
                    <= transcription_end_seconds
                    < interval["end_seconds"]
                )

                if starts_in_interval or ends_in_interval:
                    interval["transcriptions"].append(transcription)
                    matched = True
                    # Don't break here - allow transcription to be added to multiple intervals

            if not matched:
                unmatched_transcriptions.append(transcription)

        return unmatched_transcriptions

    def _get_video_duration(self, session_dir: str, session_id: str) -> float:
        """Get video duration from the recording file"""
        video_path = os.path.join(session_dir, f"recording_{session_id}.mp4")
        end_seconds = 600.0  # Default 10 minutes

        if os.path.exists(video_path):
            try:
                # Get video duration using ffprobe
                result = subprocess.run(
                    [
                        "ffprobe",
                        "-v",
                        "quiet",
                        "-show_entries",
                        "format=duration",
                        "-of",
                        "csv=p=0",
                        video_path,
                    ],
                    capture_output=True,
                    text=True,
                )
                if result.returncode == 0:
                    end_seconds = float(result.stdout.strip())
                    logger.info(f"Video duration detected: {end_seconds} seconds")
            except Exception as e:
                logger.warning(f"Could not get video duration: {e}, using default")

        return end_seconds

    def _process_intervals_with_llm(
        self, session_id: str, intervals: List[Dict[str, Any]]
    ) -> None:
        """Process intervals with LLM for transition analysis"""
        if not self.llm_wrapper:
            logger.warning("LLM wrapper not available, skipping transition analysis")
            return

        # Prepare intervals data for LLM processing
        intervals_data = []
        session_dir = os.path.join("uploads", session_id)

        for interval in intervals:
            # Extract transcript lines from transcriptions
            transcript_lines = []
            for transcription in interval.get("transcriptions", []):
                transcript_lines.append(transcription.get("transcription", ""))

            # Get screenshot paths
            before_screenshot = None
            after_screenshot = None

            if interval.get("screenshot_before"):
                before_screenshot = os.path.join(
                    session_dir, interval["screenshot_before"]
                )

            if interval.get("screenshot_after"):
                after_screenshot = os.path.join(
                    session_dir, interval["screenshot_after"]
                )

            # Only process intervals that have transcriptions
            if transcript_lines:
                intervals_data.append(
                    {
                        "transcript_lines": transcript_lines,
                        "before_screenshot": before_screenshot,
                        "after_screenshot": after_screenshot,
                    }
                )

        if intervals_data:
            logger.info(f"Processing {len(intervals_data)} intervals with LLM")
            self.llm_wrapper.detect_transitions_from_transcripted_intervals(
                session_id=session_id, intervals_data=intervals_data
            )
        else:
            logger.info("No intervals with transcriptions found, skipping LLM analysis")

    def _timestamp_to_seconds(self, timestamp: str) -> float:
        """Convert HH:MM:SS:mmm timestamp to seconds"""
        try:
            # Parse HH:MM:SS:mmm format
            parts = timestamp.split(":")
            if len(parts) != 4:
                logger.warning(f"Invalid timestamp format: {timestamp}")
                return 0.0

            hours = int(parts[0])
            minutes = int(parts[1])
            seconds = int(parts[2])
            milliseconds = int(parts[3])

            total_seconds = (
                hours * 3600 + minutes * 60 + seconds + milliseconds / 1000.0
            )
            return total_seconds
        except Exception as e:
            logger.error(f"Error converting timestamp {timestamp}: {e}")
            return 0.0

    def _transcription_timestamp_to_seconds(self, timestamp: str) -> float:
        """Convert MM:SS:mmm timestamp to seconds"""
        try:
            # Parse MM:SS:mmm format
            parts = timestamp.split(":")
            if len(parts) != 3:
                logger.warning(f"Invalid transcription timestamp format: {timestamp}")
                return 0.0

            minutes = int(parts[0])
            seconds = int(parts[1])
            milliseconds = int(parts[2])

            total_seconds = minutes * 60 + seconds + milliseconds / 1000.0
            return total_seconds
        except Exception as e:
            logger.error(f"Error converting transcription timestamp {timestamp}: {e}")
            return 0.0
