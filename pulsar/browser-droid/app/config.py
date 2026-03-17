import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Screen resolution defaults
SCREEN_WIDTH = "1080"
SCREEN_HEIGHT = "1920"

# Device paths
ON_DEVICE_VIDEO_PATH = "/sdcard/demo.mp4"
LOCAL_VIDEO_PATH = "downloads/demo.mp4"
STREAM_PIPE = "/tmp/scrcpy_stream.pipe"

# Directory paths
APK_DIR = "uploads/apk"
UPLOADS_DIR = "uploads"
DOWNLOADS_DIR = "downloads"

# Recording settings
RECORDING_TIME_LIMIT = "3600"  # 60 minutes in seconds

ENABLE_TRANSITION_ANALYSIS = False
ENABLE_VIDEO_SLICING = False


# Ensure required directories exist
def ensure_directories():
    """Create necessary directories if they don't exist"""
    os.makedirs(APK_DIR, exist_ok=True)
    os.makedirs(DOWNLOADS_DIR, exist_ok=True)
