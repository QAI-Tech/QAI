import cv2
import base64
import numpy as np
import os
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor, as_completed

from video2flow.models.screen import Screen
from utils.util import orionis_log


@dataclass
class StabilityConfig:
    """Configuration for frame stability detection thresholds."""

    # SSIM threshold (0-1, higher = more similar required)
    ssim_threshold: float = 0.95

    # Pixel difference threshold (0-1, lower = less difference allowed)
    pixel_diff_threshold: float = 0.01

    # Edge stability threshold (0-1, higher = more similar edges required)
    edge_threshold: float = 0.95

    # Number of consecutive stable frames required
    window_size: int = 3

    # Sampling interval in seconds
    sample_interval: float = 0.1

    # Maximum lookahead time in seconds after timestamp
    max_lookahead: float = 1.5


class FrameExtractionError(Exception):
    """Raised when frame extraction fails"""

    pass


class FrameExtractor:
    """
    Extracts video frames at screen appearance timestamps.

    This component performs Stage 4 of the Video to Flow pipeline:
    capturing screenshots from the video at the exact moments when
    screens appear, encoding them as base64 data URIs for graph nodes.

    Attributes:
        jpeg_quality: JPEG encoding quality (0-100, default 85)
    """

    def __init__(
        self,
        jpeg_quality: int = 85,
        stability_config: Optional[StabilityConfig] = None,
        use_stability_detection: bool = False,
        num_workers: Optional[int] = None,
        stability_offset_seconds: float = 0.5,
    ):
        """
        Initialize the FrameExtractor

        Args:
            jpeg_quality: JPEG encoding quality (0-100), default 85
            stability_config: Configuration for stability detection thresholds
            use_stability_detection: Whether to use hybrid stability detection (default False).
                                    With precise timestamps from LLM, stability detection is
                                    no longer needed and disabled by default for consistency.
            num_workers: Number of worker processes for parallel extraction.
                        If None, uses number of CPU cores. Set to 1 for sequential processing.
            stability_offset_seconds: Offset in seconds to add after timestamp to capture
                                     stable frame (default 0.5s). The LLM reports when a
                                     transition starts, but we want to capture the frame
                                     after the screen is fully loaded and stable.
        """
        if not 0 <= jpeg_quality <= 100:
            raise ValueError(f"JPEG quality must be 0-100, got {jpeg_quality}")

        self.jpeg_quality = jpeg_quality
        self.stability_config = stability_config or StabilityConfig()
        self.use_stability_detection = use_stability_detection
        self.num_workers = (
            num_workers if num_workers is not None else os.cpu_count() or 1
        )
        self.stability_offset_seconds = stability_offset_seconds

    def extract_frames(
        self, video_path: str, screens: List[Screen], video_fps: Optional[float] = None
    ) -> Dict[str, str]:
        """
        Extract frames for all screens from video using parallel processing.

        Args:
            video_path: Path to the local video file
            screens: List of Screen objects with timestamps
            video_fps: Video FPS as reported by LLM for precise frame extraction.
                      If None, uses the actual video FPS from file metadata.

        Returns:
            Dictionary mapping screen_id to base64 data URI

        Raises:
            FrameExtractionError: If extraction fails
        """
        orionis_log(
            f"Stage 2: Starting frame extraction for {len(screens)} screens "
            f"using {self.num_workers} workers"
        )

        try:
            # Validate video file exists and get properties
            video = cv2.VideoCapture(video_path)
            if not video.isOpened():
                raise FrameExtractionError(f"Failed to open video file: {video_path}")

            actual_fps = video.get(cv2.CAP_PROP_FPS)
            total_frames = int(video.get(cv2.CAP_PROP_FRAME_COUNT))
            duration = total_frames / actual_fps if actual_fps > 0 else 0
            video.release()

            # IMPORTANT: Always use actual video FPS for frame extraction, not LLM-reported FPS.
            # The LLM (Gemini) doesn't actually analyze video at the FPS it reports - it samples
            # at a much lower rate internally. Using LLM-reported FPS causes frame mismatch
            # where we extract different frames than what the LLM actually saw.
            fps = actual_fps

            orionis_log(
                f"Video properties: actual={actual_fps:.2f} FPS, "
                f"LLM reported={video_fps or 'N/A'} FPS (ignored), "
                f"{total_frames} frames, {duration:.2f}s duration"
            )

            screen_images: Dict[str, str] = {}

            # Use ThreadPoolExecutor for parallel frame extraction
            with ThreadPoolExecutor(max_workers=self.num_workers) as executor:
                # Submit all extraction tasks
                future_to_screen = {
                    executor.submit(
                        self._extract_single_screen_frame,
                        video_path,
                        screen,
                        fps,
                        duration,
                    ): screen
                    for screen in screens
                }

                # Collect results as they complete
                successful_count = 0
                for future in as_completed(future_to_screen):
                    screen = future_to_screen[future]
                    try:
                        frame_data_uri = future.result()
                        if frame_data_uri:
                            screen_images[screen.id] = frame_data_uri
                            successful_count += 1
                            orionis_log(
                                f"  ✓ Frame extracted for {screen.id} "
                                f"at {screen.appearance_timestamp}"
                            )
                        else:
                            screen_images[screen.id] = ""
                            orionis_log(f"  ✗ Frame extraction failed for {screen.id}")
                    except Exception as e:
                        screen_images[screen.id] = ""
                        orionis_log(
                            f"  ✗ Frame extraction error for {screen.id}: {str(e)}"
                        )

            orionis_log(
                f"Frame extraction complete - {successful_count}/{len(screens)} "
                f"frames extracted successfully"
            )

            return screen_images

        except Exception as e:
            error_msg = f"Frame extraction failed: {str(e)}"
            orionis_log(error_msg, e)
            raise FrameExtractionError(error_msg)

    def _extract_single_screen_frame(
        self,
        video_path: str,
        screen: Screen,
        fps: float,
        video_duration: float,
    ) -> str:
        """
        Extract a single frame for one screen.

        Each call opens its own video capture to enable thread-safe parallel extraction.

        Uses precise frame number from Screen when available (HH:MM:SS:FF format),
        otherwise falls back to timestamp-based calculation.

        Args:
            video_path: Path to the video file
            screen: Screen object with timestamp
            fps: Video frames per second (from LLM or video metadata)
            video_duration: Total video duration in seconds

        Returns:
            Base64 data URI of the frame, or empty string on failure
        """
        video = None
        try:
            video = cv2.VideoCapture(video_path)
            if not video.isOpened():
                return ""

            if self.use_stability_detection:
                frame_data_uri = self._extract_stable_frame(
                    video=video,
                    timestamp=screen.appearance_timestamp,
                    fps=fps,
                    screen_id=screen.id,
                    video_duration=video_duration,
                )
            else:
                # Calculate frame number from timestamp seconds (ignoring LLM's frame number)
                # The LLM's frame numbers are unreliable because Gemini samples at a different
                # rate than the video's actual FPS. Instead, we:
                # 1. Use only HH:MM:SS from the timestamp (ignore FF frame component)
                # 2. Add a small offset to capture stable frame after transition
                base_seconds = screen.get_timestamp_seconds()  # Ignores frame component
                target_seconds = min(
                    base_seconds + self.stability_offset_seconds, video_duration - 0.1
                )
                frame_number = int(target_seconds * fps)

                orionis_log(
                    f"    {screen.id}: timestamp={screen.appearance_timestamp}, "
                    f"base={base_seconds:.2f}s + offset={self.stability_offset_seconds}s = "
                    f"target={target_seconds:.2f}s (frame {frame_number})"
                )

                frame_data_uri = self._extract_frame_by_number(
                    video=video,
                    frame_number=frame_number,
                    screen_id=screen.id,
                )

            return frame_data_uri if frame_data_uri else ""

        except Exception:
            return ""
        finally:
            if video is not None:
                video.release()

    def _extract_frame_by_number(
        self, video: cv2.VideoCapture, frame_number: int, screen_id: str
    ) -> str:
        """
        Extract a single frame by its exact frame number.

        This is the preferred method when using precise timestamps from LLM,
        as it directly seeks to the exact frame without any conversion.

        Args:
            video: Opened video capture object
            frame_number: Exact frame number to extract
            screen_id: Screen ID (for logging)

        Returns:
            Base64 data URI string, or empty string if extraction fails
        """
        try:
            # Seek to exact frame
            video.set(cv2.CAP_PROP_POS_FRAMES, frame_number)

            # Read frame
            success, frame = video.read()

            if not success or frame is None:
                orionis_log(f"    Failed to read frame {frame_number} for {screen_id}")
                return ""

            # Encode frame as JPEG
            encode_success, buffer = cv2.imencode(
                ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, self.jpeg_quality]
            )

            if not encode_success:
                orionis_log(f"    Failed to encode frame for {screen_id}")
                return ""

            # Convert to base64 data URI
            base64_data = base64.b64encode(buffer.tobytes()).decode("utf-8")
            data_uri = f"data:image/jpeg;base64,{base64_data}"

            orionis_log(f"    Extracted frame {frame_number} for {screen_id}")
            return data_uri

        except Exception as e:
            orionis_log(
                f"    Error extracting frame {frame_number} for {screen_id}: {e}", e
            )
            return ""

    def _extract_frame_at_timestamp(
        self, video: cv2.VideoCapture, timestamp: str, fps: float, screen_id: str
    ) -> str:
        """
        Extract a single frame at the given timestamp (legacy method).

        This method is kept for backwards compatibility with old MM:SS format timestamps
        and for use within stability detection.

        Args:
            video: Opened video capture object
            timestamp: Timestamp in MM:SS format
            fps: Video frames per second
            screen_id: Screen ID (for logging)

        Returns:
            Base64 data URI string, or empty string if extraction fails
        """
        try:
            # Convert timestamp to seconds
            total_seconds = self._timestamp_to_seconds(timestamp)

            if total_seconds is None:
                orionis_log(
                    f"    Invalid timestamp format for {screen_id}: {timestamp}"
                )
                return ""

            # Calculate frame number
            frame_number = int(total_seconds * fps)

            # Seek to frame
            video.set(cv2.CAP_PROP_POS_FRAMES, frame_number)

            # Read frame
            success, frame = video.read()

            if not success or frame is None:
                orionis_log(f"    Failed to read frame {frame_number} for {screen_id}")
                return ""

            # Encode frame as JPEG
            encode_success, buffer = cv2.imencode(
                ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, self.jpeg_quality]
            )

            if not encode_success:
                orionis_log(f"    Failed to encode frame for {screen_id}")
                return ""

            # Convert to base64 data URI
            base64_data = base64.b64encode(buffer.tobytes()).decode("utf-8")
            data_uri = f"data:image/jpeg;base64,{base64_data}"

            return data_uri

        except Exception as e:
            orionis_log(
                f"    Error extracting frame at {timestamp} for {screen_id}: {e}", e
            )
            return ""

    @staticmethod
    def _timestamp_to_seconds(timestamp: str) -> Optional[float]:
        """
        Convert MM:SS timestamp to total seconds.

        Args:
            timestamp: Timestamp in MM:SS format

        Returns:
            Total seconds as float, or None if invalid format
        """
        try:
            parts = timestamp.split(":")
            if len(parts) != 2:
                return None

            minutes, seconds = map(int, parts)
            return float(minutes * 60 + seconds)

        except (ValueError, AttributeError):
            return None

    # ==================== HYBRID STABILITY DETECTION METHODS ====================

    def _extract_stable_frame(
        self,
        video: cv2.VideoCapture,
        timestamp: str,
        fps: float,
        screen_id: str,
        video_duration: float,
    ) -> str:
        """
        Extract the most stable frame around the given timestamp using hybrid detection.

        This method samples multiple frames after the timestamp and finds a "stable window"
        where consecutive frames are similar across all three metrics (SSIM, pixel diff, edge).

        Args:
            video: Opened video capture object
            timestamp: Timestamp in MM:SS format
            fps: Video frames per second
            screen_id: Screen ID (for logging)
            video_duration: Total video duration in seconds

        Returns:
            Base64 data URI string, or empty string if extraction fails
        """
        try:
            base_seconds = self._timestamp_to_seconds(timestamp)
            if base_seconds is None:
                orionis_log(
                    f"    Invalid timestamp format for {screen_id}: {timestamp}"
                )
                return ""

            config = self.stability_config

            # Step 1: Sample frames from timestamp to timestamp + max_lookahead
            frames: List[Tuple[float, np.ndarray]] = []
            current_offset = 0.0

            while current_offset <= config.max_lookahead:
                sample_time = base_seconds + current_offset

                # Don't exceed video duration
                if sample_time >= video_duration:
                    break

                frame = self._get_frame_at_time(video, sample_time, fps)
                if frame is not None:
                    frames.append((current_offset, frame))

                current_offset += config.sample_interval

            if len(frames) < config.window_size:
                orionis_log(
                    f"    Not enough frames sampled for {screen_id}, "
                    f"falling back to direct extraction"
                )
                return self._extract_frame_at_timestamp(
                    video, timestamp, fps, screen_id
                )

            # Step 2: Find stable window using hybrid detection
            stable_frame = self._find_stable_window(frames, screen_id)

            if stable_frame is not None:
                return self._encode_frame_to_data_uri(stable_frame)

            # Step 3: Fallback - return the frame with highest average stability score
            orionis_log(
                f"    No stable window found for {screen_id}, "
                f"using best available frame"
            )
            best_frame = self._find_best_frame(frames, screen_id)
            if best_frame is not None:
                return self._encode_frame_to_data_uri(best_frame)

            # Final fallback - return last frame (most likely to be stable)
            orionis_log(f"    Using last sampled frame for {screen_id}")
            return self._encode_frame_to_data_uri(frames[-1][1])

        except Exception as e:
            orionis_log(f"    Error in stable frame extraction for {screen_id}: {e}", e)
            # Fallback to simple extraction
            return self._extract_frame_at_timestamp(video, timestamp, fps, screen_id)

    def _get_frame_at_time(
        self, video: cv2.VideoCapture, time_seconds: float, fps: float
    ) -> Optional[np.ndarray]:
        """
        Get a single frame at the specified time.

        Args:
            video: Opened video capture object
            time_seconds: Time in seconds
            fps: Video frames per second

        Returns:
            Frame as numpy array, or None if extraction fails
        """
        try:
            frame_number = int(time_seconds * fps)
            video.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
            success, frame = video.read()
            return frame if success and frame is not None else None
        except Exception:
            return None

    def _find_stable_window(
        self, frames: List[Tuple[float, np.ndarray]], screen_id: str
    ) -> Optional[np.ndarray]:
        """
        Find a stable window where consecutive frames pass all stability checks.

        Args:
            frames: List of (offset, frame) tuples
            screen_id: Screen ID (for logging)

        Returns:
            Middle frame of stable window, or None if no stable window found
        """
        config = self.stability_config

        # Need at least window_size frames
        if len(frames) < config.window_size:
            return None

        # Calculate stability scores for each consecutive pair
        pair_scores: List[Dict[str, float]] = []
        for i in range(len(frames) - 1):
            frame1 = frames[i][1]
            frame2 = frames[i + 1][1]

            scores = {
                "ssim": self._calculate_ssim(frame1, frame2),
                "pixel_diff": self._calculate_pixel_diff(frame1, frame2),
                "edge": self._calculate_edge_stability(frame1, frame2),
            }
            pair_scores.append(scores)

        # Find first stable window
        for i in range(len(pair_scores) - config.window_size + 2):
            start_idx = i
            end_idx = i + config.window_size - 1
            window_scores = pair_scores[start_idx:end_idx]

            is_stable = True
            for scores in window_scores:
                if scores["ssim"] < config.ssim_threshold:
                    is_stable = False
                    break
                if scores["pixel_diff"] > config.pixel_diff_threshold:
                    is_stable = False
                    break
                if scores["edge"] < config.edge_threshold:
                    is_stable = False
                    break

            if is_stable:
                # Return middle frame of stable window
                middle_index = i + (config.window_size // 2)
                offset = frames[middle_index][0]
                orionis_log(
                    f"    Stable window found at offset +{offset:.1f}s for {screen_id}"
                )
                return frames[middle_index][1]

        return None

    def _find_best_frame(
        self, frames: List[Tuple[float, np.ndarray]], screen_id: str
    ) -> Optional[np.ndarray]:
        """
        Find the frame with the highest average stability score compared to its neighbors.

        Args:
            frames: List of (offset, frame) tuples
            screen_id: Screen ID (for logging)

        Returns:
            Best frame, or None if not enough frames
        """
        if len(frames) < 2:
            return None

        best_score = -1.0
        best_index = len(frames) - 1  # Default to last frame

        for i in range(len(frames) - 1):
            frame1 = frames[i][1]
            frame2 = frames[i + 1][1]

            # Calculate combined score (higher is more stable)
            ssim = self._calculate_ssim(frame1, frame2)
            pixel_diff = self._calculate_pixel_diff(frame1, frame2)
            edge = self._calculate_edge_stability(frame1, frame2)

            # Combined score: normalize pixel_diff (invert since lower is better)
            combined_score = (ssim + (1.0 - pixel_diff) + edge) / 3.0

            if combined_score > best_score:
                best_score = combined_score
                best_index = i + 1  # Use the second frame of the stable pair

        offset = frames[best_index][0]
        orionis_log(
            f"    Best frame at offset +{offset:.1f}s (score: {best_score:.3f}) for {screen_id}"
        )
        return frames[best_index][1]

    def _encode_frame_to_data_uri(self, frame: np.ndarray) -> str:
        """
        Encode a frame to base64 data URI.

        Args:
            frame: Frame as numpy array

        Returns:
            Base64 data URI string, or empty string if encoding fails
        """
        try:
            encode_success, buffer = cv2.imencode(
                ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, self.jpeg_quality]
            )
            if not encode_success:
                return ""

            base64_data = base64.b64encode(buffer.tobytes()).decode("utf-8")
            return f"data:image/jpeg;base64,{base64_data}"
        except Exception:
            return ""

    # ==================== STABILITY CALCULATION METHODS ====================

    def _calculate_ssim(self, frame1: np.ndarray, frame2: np.ndarray) -> float:
        """
        Calculate Structural Similarity Index (SSIM) between two frames.

        SSIM measures perceptual similarity considering luminance, contrast, and structure.
        This is a simplified implementation that doesn't require scikit-image.

        Args:
            frame1: First frame as numpy array
            frame2: Second frame as numpy array

        Returns:
            SSIM score (0-1, where 1 = identical)
        """
        try:
            # Convert to grayscale
            gray1 = cv2.cvtColor(frame1, cv2.COLOR_BGR2GRAY).astype(np.float64)
            gray2 = cv2.cvtColor(frame2, cv2.COLOR_BGR2GRAY).astype(np.float64)

            # Constants for SSIM calculation
            C1 = (0.01 * 255) ** 2
            C2 = (0.03 * 255) ** 2

            # Mean
            mu1 = cv2.GaussianBlur(gray1, (11, 11), 1.5)
            mu2 = cv2.GaussianBlur(gray2, (11, 11), 1.5)

            mu1_sq = mu1**2
            mu2_sq = mu2**2
            mu1_mu2 = mu1 * mu2

            # Variance and covariance
            sigma1_sq = cv2.GaussianBlur(gray1**2, (11, 11), 1.5) - mu1_sq
            sigma2_sq = cv2.GaussianBlur(gray2**2, (11, 11), 1.5) - mu2_sq
            sigma12 = cv2.GaussianBlur(gray1 * gray2, (11, 11), 1.5) - mu1_mu2

            # SSIM formula
            numerator = (2 * mu1_mu2 + C1) * (2 * sigma12 + C2)
            denominator = (mu1_sq + mu2_sq + C1) * (sigma1_sq + sigma2_sq + C2)

            ssim_map = numerator / denominator
            return float(np.mean(np.asarray(ssim_map)))

        except Exception:
            return 0.0

    def _calculate_pixel_diff(self, frame1: np.ndarray, frame2: np.ndarray) -> float:
        """
        Calculate normalized pixel difference between two frames.

        Args:
            frame1: First frame as numpy array
            frame2: Second frame as numpy array

        Returns:
            Pixel difference (0-1, where 0 = identical, 1 = completely different)
        """
        try:
            # Convert to grayscale for faster comparison
            gray1 = cv2.cvtColor(frame1, cv2.COLOR_BGR2GRAY)
            gray2 = cv2.cvtColor(frame2, cv2.COLOR_BGR2GRAY)

            # Calculate absolute difference
            diff = cv2.absdiff(gray1, gray2)

            # Normalize to 0-1 range
            return float(np.mean(np.asarray(diff)) / 255.0)

        except Exception:
            return 1.0  # Return max difference on error

    def _calculate_edge_stability(
        self, frame1: np.ndarray, frame2: np.ndarray
    ) -> float:
        """
        Calculate edge stability between two frames using Canny edge detection.

        This is particularly useful for UI screens where buttons, text, and borders
        have distinct edges.

        Args:
            frame1: First frame as numpy array
            frame2: Second frame as numpy array

        Returns:
            Edge stability score (0-1, where 1 = identical edges)
        """
        try:
            # Convert to grayscale
            gray1 = cv2.cvtColor(frame1, cv2.COLOR_BGR2GRAY)
            gray2 = cv2.cvtColor(frame2, cv2.COLOR_BGR2GRAY)

            # Apply Gaussian blur to reduce noise
            blurred1 = cv2.GaussianBlur(gray1, (5, 5), 0)
            blurred2 = cv2.GaussianBlur(gray2, (5, 5), 0)

            # Detect edges using Canny
            edges1 = cv2.Canny(blurred1, 50, 150)
            edges2 = cv2.Canny(blurred2, 50, 150)

            # Calculate edge difference
            diff = cv2.absdiff(edges1, edges2)

            # Calculate stability (1 - normalized difference)
            max_diff = diff.shape[0] * diff.shape[1] * 255
            stability = 1.0 - (float(np.sum(diff)) / max_diff)

            return stability

        except Exception:
            return 0.0  # Return min stability on error
