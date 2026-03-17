import os
import subprocess
import logging
from typing import Dict, Any, List, Optional

from wrappers.llm_wrapper import LLMWrapper


logger = logging.getLogger(__name__)


class VideoSliceService:
    """Service for slicing video recordings based on screen annotations"""

    def __init__(self, config, annotation_service, llm_wrapper: LLMWrapper):
        self.config = config
        self.annotation_service = annotation_service
        self.llm_wrapper = llm_wrapper

    def slice_video_by_annotations(self, session_id: str) -> Dict[str, Any]:
        """Slice video based on screen annotation timestamps"""
        try:
            # Check if video slicing is enabled
            if not self.config.ENABLE_VIDEO_SLICING:
                logger.info(
                    f"Video slicing is disabled, skipping for session {session_id}"
                )
                return {"status": "skipped", "reason": "Video slicing is disabled"}

            logger.info(f"Starting video slicing for session {session_id}")

            # Get session directory
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            video_path = os.path.join(session_dir, f"recording_{session_id}.mp4")

            # Check if video exists
            if not os.path.exists(video_path):
                logger.error(f"Video file not found: {video_path}")
                return {"error": "Video file not found"}

            # Get video duration
            duration = self._get_video_duration(video_path)
            if duration is None:
                logger.error(f"Could not determine video duration for {video_path}")
                return {"error": "Could not determine video duration"}

            logger.info(f"Video duration: {duration} seconds")

            # Get annotations for this session
            annotations_result = self.annotation_service.get_annotations(session_id)
            if "error" in annotations_result:
                logger.error(
                    f"Could not get annotations: {annotations_result['error']}"
                )
                return {"error": "Could not get annotations"}

            annotations = annotations_result.get("annotations", [])
            if not annotations:
                logger.info(
                    f"No annotations found for session {session_id}, skipping video slicing"
                )
                return {"status": "skipped", "reason": "No annotations found"}

            # Filter and sort screen annotations by timestamp
            screen_annotations = [
                ann
                for ann in annotations
                if ann.get("type") == "screen_annotation"
                and ann.get("recording_timestamp")
            ]

            if not screen_annotations:
                logger.info(
                    f"No screen annotations with timestamps found for session {session_id}"
                )
                return {
                    "status": "skipped",
                    "reason": "No screen annotations with timestamps",
                }

            # Sort by timestamp
            screen_annotations.sort(key=lambda x: x["recording_timestamp"])

            # Convert timestamps to seconds and filter within video bounds
            timestamps_seconds = []
            for ann in screen_annotations:
                timestamp_seconds = self._timestamp_to_seconds(
                    ann["recording_timestamp"]
                )
                if timestamp_seconds is not None and timestamp_seconds < duration:
                    timestamps_seconds.append(timestamp_seconds)
                    logger.info(
                        f"Annotation at {ann['recording_timestamp']} -> {timestamp_seconds}s"
                    )

            if not timestamps_seconds:
                logger.info(
                    f"No valid timestamps within video bounds for session {session_id}"
                )
                return {
                    "status": "skipped",
                    "reason": "No valid timestamps within video bounds",
                }

            # Create video_slices directory
            slices_dir = os.path.join(session_dir, "video_slices")
            os.makedirs(slices_dir, exist_ok=True)

            # Generate slice segments
            segments = self._generate_slice_segments(timestamps_seconds, duration)
            logger.info(f"Generated {len(segments)} video segments")

            # Slice the video and generate transition analysis
            slice_results = []
            for i, (start_time, end_time) in enumerate(segments, 1):
                # Skip segments that are too short (less than 0.5 seconds)
                segment_duration = end_time - start_time
                if segment_duration < 0.5:
                    logger.warning(
                        f"Skipping slice {i}: too short ({segment_duration}s)"
                    )
                    continue

                slice_filename = f"{session_id}_slice_{i}.mp4"
                slice_path = os.path.join(slices_dir, slice_filename)

                success = self._slice_video_segment(
                    video_path, slice_path, start_time, end_time
                )

                if success:
                    slice_results.append(
                        {
                            "slice_number": i,
                            "filename": slice_filename,
                            "start_time": start_time,
                            "end_time": end_time,
                            "duration": segment_duration,
                        }
                    )
                    logger.info(
                        f"Created slice {i}: {slice_filename} ({start_time}s - {end_time}s, {segment_duration:.2f}s)"
                    )

                    # Generate transition analysis for middle slices only (skip first and last)
                    if i > 1 and i < len(segments):
                        self._generate_transition_analysis_for_slice(
                            session_id, slice_path, i, segments, screen_annotations
                        )
                    else:
                        logger.info(
                            f"Skipping transition analysis for slice {i} (first or last slice)"
                        )
                else:
                    logger.error(f"Failed to create slice {i}: {slice_filename}")

            logger.info(
                f"Video slicing completed for session {session_id}. Created {len(slice_results)} slices"
            )

            return {
                "status": "success",
                "session_id": session_id,
                "total_slices": len(slice_results),
                "slices": slice_results,
                "video_duration": duration,
            }

        except Exception as e:
            logger.error(f"Error slicing video for session {session_id}: {e}")
            return {"error": str(e)}

    def _get_video_duration(self, video_path: str) -> Optional[float]:
        """Get video duration in seconds using FFmpeg"""
        try:
            cmd = [
                "ffprobe",
                "-v",
                "quiet",
                "-show_entries",
                "format=duration",
                "-of",
                "csv=p=0",
                video_path,
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode == 0:
                duration = float(result.stdout.strip())
                return duration
            else:
                logger.error(f"FFprobe failed: {result.stderr}")
                return None
        except Exception as e:
            logger.error(f"Error getting video duration: {e}")
            return None

    def _timestamp_to_seconds(self, timestamp: str) -> Optional[float]:
        """Convert HH:MM:ss:mmm timestamp to seconds"""
        try:
            # Parse HH:MM:ss:mmm format
            parts = timestamp.split(":")
            if len(parts) != 4:
                logger.warning(f"Invalid timestamp format: {timestamp}")
                return None

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
            return None

    def _generate_slice_segments(
        self, timestamps: List[float], video_duration: float
    ) -> List[tuple]:
        """Generate video segments based on timestamps"""
        segments = []

        # First segment: beginning to first timestamp
        if timestamps:
            segments.append((0.0, timestamps[0]))

        # Middle segments: between timestamps
        for i in range(len(timestamps) - 1):
            segments.append((timestamps[i], timestamps[i + 1]))

        # Last segment: last timestamp to end of video
        if timestamps:
            segments.append((timestamps[-1], video_duration))

        return segments

    def _slice_video_segment(
        self, input_path: str, output_path: str, start_time: float, end_time: float
    ) -> bool:
        """Slice a video segment using FFmpeg"""
        try:
            duration = end_time - start_time

            # Try multiple FFmpeg approaches for better compatibility
            approaches = [
                # Approach 1: Re-encode with H.264 (most compatible)
                [
                    "ffmpeg",
                    "-i",
                    input_path,
                    "-ss",
                    str(start_time),
                    "-t",
                    str(duration),
                    "-c:v",
                    "libx264",
                    "-c:a",
                    "aac",
                    "-preset",
                    "fast",
                    "-crf",
                    "23",
                    "-avoid_negative_ts",
                    "make_zero",
                    "-y",
                    output_path,
                ],
                # Approach 2: Stream copy (faster but may not work with all videos)
                [
                    "ffmpeg",
                    "-i",
                    input_path,
                    "-ss",
                    str(start_time),
                    "-t",
                    str(duration),
                    "-c",
                    "copy",
                    "-avoid_negative_ts",
                    "make_zero",
                    "-y",
                    output_path,
                ],
                # Approach 3: More conservative re-encoding
                [
                    "ffmpeg",
                    "-i",
                    input_path,
                    "-ss",
                    str(start_time),
                    "-t",
                    str(duration),
                    "-c:v",
                    "libx264",
                    "-c:a",
                    "aac",
                    "-preset",
                    "ultrafast",
                    "-crf",
                    "28",
                    "-avoid_negative_ts",
                    "make_zero",
                    "-y",
                    output_path,
                ],
            ]

            for i, cmd in enumerate(approaches, 1):
                logger.info(f"Trying FFmpeg approach {i}: {' '.join(cmd)}")
                result = subprocess.run(
                    cmd, capture_output=True, text=True, timeout=120
                )

                if result.returncode == 0:
                    # Verify the output file is playable
                    if self._verify_video_file(output_path):
                        logger.info(f"Successfully created slice using approach {i}")
                        return True
                    else:
                        logger.warning(
                            f"Approach {i} created unplayable file, trying next approach"
                        )
                        continue
                else:
                    logger.warning(f"FFmpeg approach {i} failed: {result.stderr}")
                    continue

            # If all approaches failed
            logger.error(
                f"All FFmpeg approaches failed for segment {start_time}-{end_time}"
            )
            return False

        except subprocess.TimeoutExpired:
            logger.error(
                f"FFmpeg slicing timed out for segment {start_time}-{end_time}"
            )
            return False
        except Exception as e:
            logger.error(f"Error slicing video segment {start_time}-{end_time}: {e}")
            return False

    def _verify_video_file(self, video_path: str) -> bool:
        """Verify that a video file is playable by checking its metadata"""
        try:
            cmd = [
                "ffprobe",
                "-v",
                "quiet",
                "-show_entries",
                "format=duration",
                "-of",
                "csv=p=0",
                video_path,
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

            if result.returncode == 0:
                duration = float(result.stdout.strip())
                # Check if duration is reasonable (not 0 or negative)
                if duration > 0:
                    logger.info(
                        f"Video file verified: {video_path} (duration: {duration}s)"
                    )
                    return True
                else:
                    logger.error(f"Video file has invalid duration: {duration}")
                    return False
            else:
                logger.error(f"Failed to verify video file: {result.stderr}")
                return False

        except Exception as e:
            logger.error(f"Error verifying video file {video_path}: {e}")
            return False

    def _generate_transition_analysis_for_slice(
        self,
        session_id: str,
        slice_path: str,
        slice_number: int,
        segments: List[tuple],
        screen_annotations: List[Dict[str, Any]],
    ):
        if not self.config.ENABLE_TRANSITION_ANALYSIS:
            logger.info(
                f"Transition analysis is disabled, skipping for slice {slice_number}"
            )
            return

        """Generate transition analysis for middle slices only"""
        try:
            session_dir = os.path.join(self.config.UPLOADS_DIR, session_id)
            image_paths = []

            # Middle slices: use both start and end annotation frames
            # For slice i, it goes from timestamp[i-2] to timestamp[i-1] (0-indexed)
            # So we use annotation[i-2] as start frame and annotation[i-1] as end frame
            start_annotation_idx = slice_number - 2
            end_annotation_idx = slice_number - 1

            if start_annotation_idx < len(
                screen_annotations
            ) and end_annotation_idx < len(screen_annotations):
                start_annotation = screen_annotations[start_annotation_idx]
                end_annotation = screen_annotations[end_annotation_idx]

                # Check each annotation independently
                start_image_path = None
                end_image_path = None

                if start_annotation.get("screenshot_file"):
                    start_image_path = os.path.join(
                        session_dir, start_annotation["screenshot_file"]
                    )
                    if not os.path.exists(start_image_path):
                        start_image_path = None

                if end_annotation.get("screenshot_file"):
                    end_image_path = os.path.join(
                        session_dir, end_annotation["screenshot_file"]
                    )
                    if not os.path.exists(end_image_path):
                        end_image_path = None

                # Use available screenshots
                image_paths = []
                if start_image_path:
                    image_paths.append(start_image_path)
                if end_image_path:
                    image_paths.append(end_image_path)

                logger.info(
                    f"Using {len(image_paths)} reference frames for slice {slice_number}: {image_paths})"
                )

            # Generate transition analysis
            if image_paths:
                logger.info(
                    f"Generating transition analysis for slice {slice_number} with {len(image_paths)} reference frames"
                )
                try:
                    result = self.llm_wrapper.generate_transition_analysis(
                        session_id=session_id,
                        video_path=slice_path,
                    )
                    logger.info(
                        f"Transition analysis completed for slice {slice_number}"
                    )
                except Exception as e:
                    logger.error(
                        f"Failed to generate transition analysis for slice {slice_number}: {e}"
                    )
            else:
                logger.warning(
                    f"No reference frames available for slice {slice_number}"
                )

        except Exception as e:
            logger.error(
                f"Error generating transition analysis for slice {slice_number}: {e}"
            )
