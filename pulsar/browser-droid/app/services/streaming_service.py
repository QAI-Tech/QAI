import base64
import logging
import time
from threading import Thread
from typing import Optional

logger = logging.getLogger(__name__)


class StreamingService:
    """Service for handling WebSocket streaming operations"""

    def __init__(self, config, adb_service, socketio):
        self.config = config
        self.adb_service = adb_service
        self.socketio = socketio
        self.streaming_active = False
        self.scrcpy_process = None
        self.last_screenshot_error_time = 0
        self.screenshot_error_count = 0

    def handle_connect(self):
        """Handle WebSocket client connection"""
        logger.info("WebSocket client connected")
        self.socketio.emit("status", {"message": "Connected to video stream"})

    def handle_disconnect(self):
        """Handle WebSocket client disconnection"""
        logger.info("WebSocket client disconnected")

    def handle_error(self, error):
        """Handle WebSocket error"""
        logger.error(f"WebSocket error: {error}")

    def handle_start_stream(self):
        """Handle start stream request"""
        logger.info("Starting WebSocket video stream")
        if not self.streaming_active:
            Thread(target=self._stream_screenshots, daemon=True).start()
        self.socketio.emit("stream_status", {"active": True})

    def handle_stop_stream(self):
        """Handle stop stream request"""
        logger.info("Stopping WebSocket video stream")
        self.streaming_active = False
        self.socketio.emit("stream_status", {"active": False})

    def _stream_screenshots(self):
        """Stream screenshots via WebSocket"""
        self.streaming_active = True
        logger.info("Starting WebSocket screenshot stream")

        try:
            frame_count = 0
            while self.streaming_active:
                try:
                    # Take screenshot
                    screenshot_data = self.adb_service.take_screenshot()
                    if screenshot_data is not None:
                        # Convert to base64
                        img_data = base64.b64encode(screenshot_data).decode("utf-8")
                        # Send via WebSocket
                        self.socketio.emit("screenshot", {"image": img_data})
                        frame_count += 1
                        if frame_count % 1000 == 0:  # Log every 1000 frames
                            logger.info(f"Sent {frame_count} frames")

                        # Reset error count on success
                        if self.screenshot_error_count > 0:
                            logger.info(
                                f"Streaming recovered after {self.screenshot_error_count} screenshot failures"
                            )
                            self.screenshot_error_count = 0
                    else:
                        self.screenshot_error_count += 1
                        current_time = time.time()

                        # Only log error every 10 seconds to prevent spam
                        if current_time - self.last_screenshot_error_time > 10:
                            logger.error(
                                f"Screenshot failed (failed {self.screenshot_error_count} times)"
                            )
                            self.last_screenshot_error_time = current_time

                    time.sleep(0.1)  # 10 FPS
                except Exception as e:
                    self.screenshot_error_count += 1
                    current_time = time.time()

                    # Only log error every 10 seconds to prevent spam
                    if current_time - self.last_screenshot_error_time > 10:
                        logger.error(
                            f"Screenshot error: {e} (failed {self.screenshot_error_count} times)"
                        )
                        self.last_screenshot_error_time = current_time

                    time.sleep(1)
        except Exception as e:
            logger.error(f"WebSocket streaming error: {e}")
        finally:
            self.streaming_active = False
            logger.info("WebSocket screenshot stream stopped")

    def initialize_scrcpy_stream(self) -> bool:
        """Initialize scrcpy streaming"""
        if not self.adb_service.check_adb_connection():
            logger.error("No ADB device connected")
            return False

        if not self.adb_service.get_screen_resolution():
            logger.warning("Could not get screen resolution, using defaults")

        logger.info("Scrcpy streaming initialized")
        return True

    def get_streaming_status(self) -> bool:
        """Get current streaming status"""
        return self.streaming_active
