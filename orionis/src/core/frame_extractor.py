from moviepy import VideoFileClip
from PIL import Image
import io
from utils.util import orionis_log


class FrameExtractor:

    def extract_frame_at_timestamp(
        self, video_path: str, timestamp_milliseconds: int
    ) -> bytes:
        try:
            # Open video with VideoFileClip
            with VideoFileClip(video_path) as video:
                # Get video information
                duration = video.duration

                if (
                    timestamp_milliseconds < 0
                    or timestamp_milliseconds > duration * 1000
                ):
                    raise ValueError(
                        f"Timestamp {timestamp_milliseconds}ms is out of range. Video duration: {duration * 1000:.0f}ms"
                    )

                # Convert timestamp to seconds
                timestamp_seconds = timestamp_milliseconds / 1000.0

                # Get frame at timestamp
                frame = video.get_frame(timestamp_seconds)

                if frame is None:
                    raise ValueError(
                        "Failed to get frame from video at timestamp {timestamp_milliseconds}ms"
                    )

                # Convert to PNG bytes using PIL
                image = Image.fromarray(frame)
                img_byte_arr = io.BytesIO()
                image.save(img_byte_arr, format="PNG")
                return img_byte_arr.getvalue()

        except Exception as e:
            orionis_log(f"Error extracting frame: {str(e)}", e)
            raise ValueError(f"Error extracting frame: {str(e)}")
