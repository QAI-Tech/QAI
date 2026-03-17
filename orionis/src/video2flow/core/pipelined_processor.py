"""
Pipelined Segment Processor for Video2Flow optimization.

This module implements a pipelined batch processing approach that overlaps
video splicing with interaction detection, reducing total pipeline time.

Key Design Principles:
    1. Segments within each batch are spliced IN PARALLEL for speed
    2. While batch N is analyzed by LLM, batch N+1 is being spliced (pipelining)
    3. Within each batch, upload + LLM calls happen in parallel
    4. Results are always returned in correct temporal order (sorted by index)

Pipeline Flow (batch_size=4, 10 segments):
    t=0:   Splice batch 0 [0,1,2,3] in parallel
    t=Xs:  Start LLM batch 0 + Splice batch 1 [4,5,6,7] in parallel (CONCURRENT)
    t=Ys:  LLM batch 0 done, Start LLM batch 1 + Splice batch 2 [8,9] (CONCURRENT)
    t=Zs:  Done
"""

from typing import List, Tuple, Optional, Callable, Dict
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor, as_completed, Future

from moviepy import VideoFileClip

from video2flow.models.screen import Screen
from video2flow.models.video_segment import VideoSegment
from video2flow.models.interaction import Interaction
from video2flow.core.video_splicer import VideoSplicer
from video2flow.core.interaction_detector import InteractionDetector
from utils.util import orionis_log


class PipelinedProcessingError(Exception):
    """Raised when pipelined processing fails"""

    pass


@dataclass
class SegmentResult:
    """Result of processing a single segment."""

    index: int
    segment: VideoSegment
    interaction: Optional[Interaction]
    error: Optional[str]


class PipelinedSegmentProcessor:
    """
    Processes video segments in ordered batches with pipelined execution.

    While batch N is being analyzed by LLM, batch N+1 is being spliced.
    Segments are ALWAYS spliced in order to maintain consistency.

    Attributes:
        video_splicer: VideoSplicer instance for creating video segments
        interaction_detector: InteractionDetector instance for LLM analysis
        batch_size: Number of segments to process per batch (default: 4)
        num_upload_workers: Number of parallel workers for upload + LLM (default: 4)
    """

    def __init__(
        self,
        video_splicer: VideoSplicer,
        interaction_detector: InteractionDetector,
        batch_size: int = 4,
        num_upload_workers: int = 4,
    ):
        """
        Initialize the PipelinedSegmentProcessor.

        Args:
            video_splicer: VideoSplicer instance for creating video segments
            interaction_detector: InteractionDetector instance for LLM analysis
            batch_size: Number of segments per batch (default: 4)
            num_upload_workers: Number of parallel workers for upload + LLM within batch
        """
        self.video_splicer = video_splicer
        self.interaction_detector = interaction_detector
        self.batch_size = batch_size
        self.num_upload_workers = num_upload_workers

    def process_all_pipelined(
        self,
        video_path: str,
        screens: List[Screen],
        product_id: str,
        request_id: str,
        upload_callback: Callable[[VideoSegment, str, str], Optional[str]],
    ) -> List[SegmentResult]:
        """
        Process all segments with pipelined batching.

        Timeline example (batch_size=4, 10 segments):

        t=0:   Splice batch 0 [0,1,2,3]
        t=30s: Start LLM batch 0, Splice batch 1 [4,5,6,7] (PARALLEL)
        t=60s: LLM batch 0 done, Start LLM batch 1, Splice batch 2 [8,9] (PARALLEL)
        t=90s: LLM batch 1 done, Start LLM batch 2
        t=120s: Done

        Args:
            video_path: Path to the local video file
            screens: List of Screen objects in temporal order
            product_id: Product ID for GCS upload path
            request_id: Request ID for GCS upload path
            upload_callback: Function to upload segment to GCS, returns GCS URL

        Returns:
            List of SegmentResult objects in temporal order

        Raises:
            PipelinedProcessingError: If processing fails
        """
        if len(screens) < 2:
            raise PipelinedProcessingError(
                f"Need at least 2 screens to create segments, got {len(screens)}"
            )

        total_segments = len(screens) - 1
        orionis_log(
            f"Starting pipelined processing: {total_segments} segments, "
            f"batch_size={self.batch_size}, workers={self.num_upload_workers}"
        )

        try:
            # Get video duration
            video = VideoFileClip(video_path)
            video_duration = video.duration
            video.close()

            orionis_log(f"Video duration: {video_duration:.2f}s")

            # Calculate number of batches
            num_batches = (total_segments + self.batch_size - 1) // self.batch_size
            orionis_log(f"Processing in {num_batches} batches")

            # Results storage indexed by segment position
            all_results: Dict[int, SegmentResult] = {}

            # Pipeline: splice batch N+1 (in parallel) while processing batch N
            # Flow:
            # 1. Splice batch 0 (4 segments in parallel)
            # 2. Start LLM for batch 0 + Start splicing batch 1 (in parallel)
            # 3. When batch 0 LLM done and batch 1 splice done:
            #    Start LLM for batch 1 + Start splicing batch 2 (in parallel)
            # ... and so on

            current_batch_segments: List[Tuple[int, VideoSegment]] = []
            next_batch_future: Optional[Future] = None
            splice_executor = ThreadPoolExecutor(
                max_workers=1
            )  # For background batch splicing

            for batch_idx in range(num_batches):
                batch_start = batch_idx * self.batch_size
                batch_end = min(batch_start + self.batch_size, total_segments)

                orionis_log(
                    f"\n--- Batch {batch_idx + 1}/{num_batches} "
                    f"(segments {batch_start + 1}-{batch_end}) ---"
                )

                # Get current batch segments
                if batch_idx == 0:
                    # First batch: splice now (in parallel within batch)
                    orionis_log("Splicing first batch (parallel)...")
                    current_batch_segments = self._splice_batch_parallel(
                        video_path, screens, batch_start, batch_end, video_duration
                    )
                else:
                    # Wait for previous splice future and get results
                    if next_batch_future:
                        current_batch_segments = next_batch_future.result()
                    else:
                        current_batch_segments = []

                # Start splicing next batch in background (if there is one)
                next_batch_start = (batch_idx + 1) * self.batch_size
                if next_batch_start < total_segments:
                    next_batch_end = min(
                        next_batch_start + self.batch_size, total_segments
                    )

                    # Submit next batch splice to background executor
                    next_batch_future = splice_executor.submit(
                        self._splice_batch_parallel,
                        video_path,
                        screens,
                        next_batch_start,
                        next_batch_end,
                        video_duration,
                    )
                    orionis_log(
                        f"Started background splicing for next batch "
                        f"(segments {next_batch_start + 1}-{next_batch_end})"
                    )
                else:
                    next_batch_future = None

                # Process current batch: upload + LLM in parallel
                batch_results = self._process_batch_parallel(
                    current_batch_segments,
                    screens,
                    product_id,
                    request_id,
                    upload_callback,
                )

                # Store results
                for result in batch_results:
                    all_results[result.index] = result
                    if result.interaction:
                        orionis_log(
                            f"  Segment {result.index + 1}: "
                            f"{result.interaction.interaction_description}"
                        )
                    else:
                        orionis_log(
                            f"  Segment {result.index + 1}: FAILED - {result.error}"
                        )

            # Cleanup splice executor
            splice_executor.shutdown(wait=True)

            # Return results in order
            ordered_results = [all_results[i] for i in range(total_segments)]

            successful = sum(1 for r in ordered_results if r.interaction is not None)
            orionis_log(
                f"\nPipelined processing complete: "
                f"{successful}/{total_segments} segments successful"
            )

            return ordered_results

        except Exception as e:
            error_msg = f"Pipelined processing failed: {str(e)}"
            orionis_log(error_msg, e)
            raise PipelinedProcessingError(error_msg) from e

    def _splice_batch_parallel(
        self,
        video_path: str,
        screens: List[Screen],
        batch_start: int,
        batch_end: int,
        video_duration: float,
    ) -> List[Tuple[int, VideoSegment]]:
        """
        Splice a batch of segments in PARALLEL for speed.

        All segments in the batch are spliced concurrently, then results
        are sorted by index to maintain order.

        Args:
            video_path: Path to video file
            screens: List of all screens
            batch_start: Starting index (segment index, not screen index)
            batch_end: Ending index (exclusive)
            video_duration: Total video duration in seconds

        Returns:
            List of (index, VideoSegment) tuples sorted by index
        """
        segments: List[Tuple[int, VideoSegment]] = []

        def splice_single(idx: int) -> Tuple[int, VideoSegment]:
            """Splice a single segment and return (index, segment)."""
            from_screen = screens[idx]
            to_screen = screens[idx + 1]

            try:
                segment = self.video_splicer._create_segment_standalone(
                    video_path=video_path,
                    from_screen=from_screen,
                    to_screen=to_screen,
                    segment_index=idx,
                    video_duration=video_duration,
                )
                orionis_log(
                    f"  Spliced segment {idx + 1}: "
                    f"{from_screen.id} -> {to_screen.id}"
                )
                return (idx, segment)
            except Exception as e:
                orionis_log(f"  Failed to splice segment {idx + 1}: {e}", e)
                # Create a placeholder segment to track the failure
                placeholder = VideoSegment(
                    from_screen_id=from_screen.id,
                    to_screen_id=to_screen.id,
                    start_timestamp=from_screen.appearance_timestamp,
                    end_timestamp=to_screen.appearance_timestamp,
                    segment_file_path=None,
                )
                return (idx, placeholder)

        # Splice all segments in batch in parallel
        with ThreadPoolExecutor(max_workers=self.batch_size) as executor:
            futures = {
                executor.submit(splice_single, i): i
                for i in range(batch_start, batch_end)
            }

            for future in as_completed(futures):
                try:
                    result = future.result()
                    segments.append(result)
                except Exception as e:
                    idx = futures[future]
                    orionis_log(f"  Splice future failed for segment {idx + 1}: {e}", e)
                    from_screen = screens[idx]
                    to_screen = screens[idx + 1]
                    placeholder = VideoSegment(
                        from_screen_id=from_screen.id,
                        to_screen_id=to_screen.id,
                        start_timestamp=from_screen.appearance_timestamp,
                        end_timestamp=to_screen.appearance_timestamp,
                        segment_file_path=None,
                    )
                    segments.append((idx, placeholder))

        # Sort by index to maintain order
        return sorted(segments, key=lambda x: x[0])

    def _process_batch_parallel(
        self,
        batch_segments: List[Tuple[int, VideoSegment]],
        screens: List[Screen],
        product_id: str,
        request_id: str,
        upload_callback: Callable[[VideoSegment, str, str], Optional[str]],
    ) -> List[SegmentResult]:
        """
        Process a batch: upload to GCS and call LLM in parallel.

        Args:
            batch_segments: List of (index, VideoSegment) tuples
            screens: List of all screens for context
            product_id: Product ID for upload
            request_id: Request ID for upload
            upload_callback: Function to upload segment and return GCS URL

        Returns:
            List of SegmentResult objects (may be out of order)
        """
        results: List[SegmentResult] = []

        with ThreadPoolExecutor(max_workers=self.num_upload_workers) as executor:
            futures: Dict[Future, int] = {}

            for idx, segment in batch_segments:
                future = executor.submit(
                    self._upload_and_detect,
                    idx,
                    segment,
                    screens,
                    product_id,
                    request_id,
                    upload_callback,
                )
                futures[future] = idx

            for future in as_completed(futures):
                try:
                    result = future.result()
                    results.append(result)
                except Exception as e:
                    idx = futures[future]
                    segment = next(s for i, s in batch_segments if i == idx)
                    results.append(
                        SegmentResult(
                            index=idx,
                            segment=segment,
                            interaction=None,
                            error=str(e),
                        )
                    )

        # Sort by index to maintain order
        return sorted(results, key=lambda x: x.index)

    def _upload_and_detect(
        self,
        idx: int,
        segment: VideoSegment,
        screens: List[Screen],
        product_id: str,
        request_id: str,
        upload_callback: Callable[[VideoSegment, str, str], Optional[str]],
    ) -> SegmentResult:
        """
        Upload a segment to GCS and detect interaction.

        Args:
            idx: Segment index
            segment: VideoSegment to process
            screens: List of all screens
            product_id: Product ID for upload
            request_id: Request ID for upload
            upload_callback: Function to upload segment

        Returns:
            SegmentResult with interaction or error
        """
        try:
            # Check if segment was spliced successfully
            if not segment.segment_file_path:
                return SegmentResult(
                    index=idx,
                    segment=segment,
                    interaction=None,
                    error="Segment splicing failed - no file path",
                )

            # Upload to GCS
            gcs_url = upload_callback(segment, product_id, request_id)

            if not gcs_url:
                return SegmentResult(
                    index=idx,
                    segment=segment,
                    interaction=None,
                    error="Segment upload to GCS failed",
                )

            # Create segment with GCS URL for LLM
            segment_for_llm = VideoSegment(
                from_screen_id=segment.from_screen_id,
                to_screen_id=segment.to_screen_id,
                start_timestamp=segment.start_timestamp,
                end_timestamp=segment.end_timestamp,
                segment_file_path=gcs_url,
            )

            # Detect interaction
            interactions = self.interaction_detector.detect_interactions(
                segments=[segment_for_llm], screens=screens
            )

            if interactions:
                return SegmentResult(
                    index=idx,
                    segment=segment,
                    interaction=interactions[0],
                    error=None,
                )
            else:
                return SegmentResult(
                    index=idx,
                    segment=segment,
                    interaction=None,
                    error="No interaction detected by LLM",
                )

        except Exception as e:
            return SegmentResult(
                index=idx,
                segment=segment,
                interaction=None,
                error=str(e),
            )
