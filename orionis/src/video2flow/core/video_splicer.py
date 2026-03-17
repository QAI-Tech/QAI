import os
import tempfile
import subprocess
import shutil
from typing import List, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
from moviepy import VideoFileClip

from video2flow.models.screen import Screen
from video2flow.models.video_segment import VideoSegment
from utils.util import orionis_log


def _check_ffmpeg_available() -> bool:
    """Check if ffmpeg is available on the system."""
    return shutil.which("ffmpeg") is not None


class VideoSplicingError(Exception):
    """Raised when video splicing fails"""

    pass


class VideoSplicer:
    """
    Splits execution video into consecutive screen-to-screen segments.

    This component performs Stage 2 of the Video to Flow pipeline:
    taking the full video and the detected screens, it creates individual
    video clips for each screen transition (screen[i] → screen[i+1]).

    Each segment will be analyzed separately by the InteractionDetector
    to identify the user interaction that caused the transition.

    Attributes:
        temp_dir: Temporary directory for storing video segments
    """

    def __init__(
        self,
        temp_dir: Optional[str] = None,
        num_workers: Optional[int] = None,
        use_ffmpeg: bool = True,
    ):
        """
        Initialize the VideoSplicer

        Args:
            temp_dir: Optional temporary directory for segments.
                     If None, uses system temp directory.
            num_workers: Number of worker threads for parallel splicing.
                        If None, uses number of CPU cores. Set to 1 for sequential processing.
            use_ffmpeg: If True, use FFmpeg with stream copy for faster splicing.
                       Falls back to moviepy if FFmpeg is not available.
        """
        self.temp_dir = temp_dir or tempfile.gettempdir()
        os.makedirs(self.temp_dir, exist_ok=True)
        self.num_workers = (
            num_workers if num_workers is not None else os.cpu_count() or 1
        )

        # Check if FFmpeg is available
        self.use_ffmpeg = use_ffmpeg and _check_ffmpeg_available()
        if use_ffmpeg and not self.use_ffmpeg:
            orionis_log(
                "FFmpeg not found, falling back to moviepy for video splicing. "
                "Install FFmpeg for faster performance."
            )

    def splice_video(
        self, video_path: str, screens: List[Screen]
    ) -> List[VideoSegment]:
        """
        Split video into segments for each screen transition using parallel processing.

        Creates N-1 segments for N screens, where each segment captures
        the transition from screen[i] to screen[i+1].

        Args:
            video_path: Path to the local video file
            screens: List of Screen objects in temporal order

        Returns:
            List of VideoSegment objects with paths to spliced video files

        Raises:
            VideoSplicingError: If splicing fails
            ValidationError: If segment validation fails
        """
        if len(screens) < 2:
            raise VideoSplicingError(
                f"Need at least 2 screens to create segments, got {len(screens)}"
            )

        splicing_method = (
            "FFmpeg (stream copy)" if self.use_ffmpeg else "moviepy (re-encoding)"
        )
        orionis_log(
            f"Stage 3: Starting video splicing - {len(screens)} screens, "
            f"{len(screens) - 1} segments to create ({self.num_workers} workers, {splicing_method})"
        )

        try:
            # Get video duration first
            video = VideoFileClip(video_path)
            video_duration = video.duration
            video.close()

            orionis_log(f"Video duration: {video_duration:.2f}s")

            # Prepare segment tasks: (index, from_screen, to_screen)
            segment_tasks: List[Tuple[int, Screen, Screen]] = []
            for i in range(len(screens) - 1):
                segment_tasks.append((i, screens[i], screens[i + 1]))

            # Results indexed by segment position
            segment_results: dict[int, Optional[VideoSegment]] = {}

            # Process segments in parallel
            with ThreadPoolExecutor(max_workers=self.num_workers) as executor:
                futures = {
                    executor.submit(
                        self._create_segment_standalone,
                        video_path,
                        from_screen,
                        to_screen,
                        idx,
                        video_duration,
                    ): idx
                    for idx, from_screen, to_screen in segment_tasks
                }

                for future in as_completed(futures):
                    idx = futures[future]
                    try:
                        segment = future.result()
                        segment_results[idx] = segment
                        orionis_log(
                            f"  ✓ Segment {idx + 1}/{len(segment_tasks)} created: "
                            f"{segment.from_screen_id} → {segment.to_screen_id}"
                        )
                    except Exception as e:
                        segment_results[idx] = None
                        orionis_log(
                            f"  ✗ Segment {idx + 1}/{len(segment_tasks)} failed: {e}"
                        )

            # Collect results in order
            segments: List[VideoSegment] = []
            for i in range(len(segment_tasks)):
                segment_result = segment_results.get(i)
                if segment_result is None:
                    raise VideoSplicingError(f"Segment {i + 1} failed to create")
                segments.append(segment_result)

            orionis_log(f"Video splicing complete - {len(segments)} segments created")
            self._log_segment_summary(segments)

            return segments

        except Exception as e:
            error_msg = f"Video splicing failed: {str(e)}"
            orionis_log(error_msg, e)
            raise VideoSplicingError(error_msg) from e

    def _create_segment_standalone(
        self,
        video_path: str,
        from_screen: Screen,
        to_screen: Screen,
        segment_index: int,
        video_duration: float,
    ) -> VideoSegment:
        """
        Create a single video segment for a screen transition.

        Each call opens its own video file to enable thread-safe parallel processing.

        Args:
            video_path: Path to the video file
            from_screen: Starting screen
            to_screen: Ending screen
            segment_index: Index of this segment (for file naming)
            video_duration: Total video duration in seconds

        Returns:
            VideoSegment object with path to spliced video file
        """
        # Use FFmpeg if available, otherwise fall back to moviepy
        if self.use_ffmpeg:
            return self._create_segment_ffmpeg(
                video_path, from_screen, to_screen, segment_index, video_duration
            )
        else:
            return self._create_segment_moviepy(
                video_path, from_screen, to_screen, segment_index, video_duration
            )

    def _create_segment_ffmpeg(
        self,
        video_path: str,
        from_screen: Screen,
        to_screen: Screen,
        segment_index: int,
        video_duration: float,
    ) -> VideoSegment:
        """
        Create a video segment using FFmpeg with stream copy (no re-encoding).

        This is MUCH faster than moviepy because it doesn't re-encode the video,
        just copies the streams directly. May have slight timestamp imprecision
        at keyframe boundaries, but this is acceptable for our use case.

        Args:
            video_path: Path to the video file
            from_screen: Starting screen
            to_screen: Ending screen
            segment_index: Index of this segment (for file naming)
            video_duration: Total video duration in seconds

        Returns:
            VideoSegment object with path to spliced video file
        """
        # Get timestamps in seconds
        start_time = from_screen.get_timestamp_seconds()
        end_time = to_screen.get_timestamp_seconds()

        # Validate times are within video duration
        if start_time >= video_duration:
            start_time = max(0, video_duration - 1)
        if end_time > video_duration:
            end_time = video_duration

        duration = end_time - start_time

        # Generate output path
        segment_filename = (
            f"segment_{from_screen.id}_to_{to_screen.id}_{segment_index:04d}.mp4"
        )
        segment_path = os.path.join(self.temp_dir, segment_filename)

        # Build FFmpeg command with stream copy (no re-encoding)
        cmd = [
            "ffmpeg",
            "-y",  # Overwrite output file
            "-ss",
            str(start_time),  # Seek position (before input for fast seek)
            "-i",
            video_path,  # Input file
            "-t",
            str(duration),  # Duration to copy
            "-c",
            "copy",  # Stream copy - no re-encoding!
            "-avoid_negative_ts",
            "1",  # Handle negative timestamps
            segment_path,
        ]

        try:
            subprocess.run(
                cmd,
                check=True,
                capture_output=True,
                text=True,
            )
        except subprocess.CalledProcessError as e:
            orionis_log(f"FFmpeg failed for segment {segment_index}: {e.stderr}", e)
            # Fall back to moviepy
            return self._create_segment_moviepy(
                video_path, from_screen, to_screen, segment_index, video_duration
            )

        # Verify segment was created
        if not os.path.exists(segment_path):
            raise VideoSplicingError(f"Segment file was not created: {segment_path}")

        # Create VideoSegment object
        return VideoSegment(
            from_screen_id=from_screen.id,
            to_screen_id=to_screen.id,
            start_timestamp=from_screen.appearance_timestamp,
            end_timestamp=to_screen.appearance_timestamp,
            segment_file_path=segment_path,
        )

    def _create_segment_moviepy(
        self,
        video_path: str,
        from_screen: Screen,
        to_screen: Screen,
        segment_index: int,
        video_duration: float,
    ) -> VideoSegment:
        """
        Create a video segment using moviepy with re-encoding.

        This is slower but more reliable for edge cases.

        Args:
            video_path: Path to the video file
            from_screen: Starting screen
            to_screen: Ending screen
            segment_index: Index of this segment (for file naming)
            video_duration: Total video duration in seconds

        Returns:
            VideoSegment object with path to spliced video file
        """
        video = None
        try:
            video = VideoFileClip(video_path)

            # Get timestamps in seconds
            start_time = from_screen.get_timestamp_seconds()
            end_time = to_screen.get_timestamp_seconds()

            # Validate times are within video duration
            if start_time >= video_duration:
                start_time = max(0, video_duration - 1)

            if end_time > video_duration:
                end_time = video_duration

            # Extract segment
            segment_clip = video.subclipped(start_time, end_time)

            # Generate output path
            segment_filename = (
                f"segment_{from_screen.id}_to_{to_screen.id}_{segment_index:04d}.mp4"
            )
            segment_path = os.path.join(self.temp_dir, segment_filename)

            # Write segment to file
            segment_clip.write_videofile(
                segment_path,
                codec="libx264",
                audio_codec="aac",
                logger=None,
            )

            # Verify segment was created
            if not os.path.exists(segment_path):
                raise VideoSplicingError(
                    f"Segment file was not created: {segment_path}"
                )

            # Create VideoSegment object
            return VideoSegment(
                from_screen_id=from_screen.id,
                to_screen_id=to_screen.id,
                start_timestamp=from_screen.appearance_timestamp,
                end_timestamp=to_screen.appearance_timestamp,
                segment_file_path=segment_path,
            )

        finally:
            if video is not None:
                video.close()

    def _create_segment(
        self,
        video: VideoFileClip,
        from_screen: Screen,
        to_screen: Screen,
        segment_index: int,
        video_duration: float,
    ) -> VideoSegment:
        """
        Create a single video segment for a screen transition.

        Args:
            video: Loaded video file clip
            from_screen: Starting screen
            to_screen: Ending screen
            segment_index: Index of this segment (for file naming)
            video_duration: Total video duration in seconds

        Returns:
            VideoSegment object with path to spliced video file

        Raises:
            ValidationError: If segment parameters are invalid
        """
        # Get timestamps in seconds
        start_time = from_screen.get_timestamp_seconds()
        end_time = to_screen.get_timestamp_seconds()

        # Validate times are within video duration
        if start_time >= video_duration:
            orionis_log(
                f"WARNING: Start time {start_time}s exceeds video duration {video_duration}s. "
                f"Adjusting to video duration."
            )
            start_time = max(0, video_duration - 1)

        if end_time > video_duration:
            orionis_log(
                f"WARNING: End time {end_time}s exceeds video duration {video_duration}s. "
                f"Adjusting to video duration."
            )
            end_time = video_duration

        # Extract segment
        segment_clip = video.subclipped(start_time, end_time)

        # Generate output path
        segment_filename = (
            f"segment_{from_screen.id}_to_{to_screen.id}_{segment_index:04d}.mp4"
        )
        segment_path = os.path.join(self.temp_dir, segment_filename)

        # Write segment to file
        orionis_log(
            f"  Writing segment to: {segment_path} "
            f"(duration: {end_time - start_time:.2f}s)"
        )

        try:
            segment_clip.write_videofile(
                segment_path,
                codec="libx264",
                audio_codec="aac",
                logger=None,  # Suppress moviepy logs
            )
        except Exception as e:
            orionis_log(
                f"Failed to write segment {from_screen.id} → {to_screen.id}: {str(e)}",
                e,
            )
            raise VideoSplicingError(
                f"Failed to write segment {from_screen.id} → {to_screen.id}: {str(e)}"
            ) from e

        # Verify segment was created
        if not os.path.exists(segment_path):
            raise VideoSplicingError(f"Segment file was not created: {segment_path}")

        # Create VideoSegment object
        segment = VideoSegment(
            from_screen_id=from_screen.id,
            to_screen_id=to_screen.id,
            start_timestamp=from_screen.appearance_timestamp,
            end_timestamp=to_screen.appearance_timestamp,
            segment_file_path=segment_path,
        )

        orionis_log(
            f"  Segment created: {from_screen.id} → {to_screen.id} "
            f"({from_screen.appearance_timestamp} to {to_screen.appearance_timestamp})"
        )

        return segment

    def _log_segment_summary(self, segments: List[VideoSegment]) -> None:
        """
        Log a summary of created segments for debugging.

        Args:
            segments: List of created video segments
        """
        orionis_log("Video segments summary:")
        for i, segment in enumerate(segments):
            duration = segment.get_duration_seconds()
            orionis_log(
                f"  Segment {i + 1}: {segment.from_screen_id} → {segment.to_screen_id} "
                f"({segment.start_timestamp} to {segment.end_timestamp}, {duration:.2f}s)"
            )

    def cleanup_segments(self, segments: List[VideoSegment]) -> None:
        """
        Clean up temporary video segment files.

        Args:
            segments: List of video segments to clean up
        """
        orionis_log(f"Cleaning up {len(segments)} temporary video segments")

        for segment in segments:
            if segment.segment_file_path and os.path.exists(segment.segment_file_path):
                try:
                    os.remove(segment.segment_file_path)
                    orionis_log(f"  Removed: {segment.segment_file_path}")
                except Exception as e:
                    orionis_log(
                        f"  Failed to remove {segment.segment_file_path}: {e}", e
                    )

        orionis_log("Segment cleanup complete")
