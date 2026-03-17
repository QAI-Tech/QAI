import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

AUTH_TOKEN = os.getenv("QAI_AUTH_TOKEN_STAGING")
KG_PLANNING_API_URL = os.getenv("KG_PLANNING_API_URL_STAGING")

# Screen resolution defaults
SCREEN_WIDTH = "1080"
SCREEN_HEIGHT = "1920"

# Node dimensions for graph layout (matching graph_builder.py)
NODE_HEIGHT = 400
NODE_WIDTH = 200

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
CAPTURE_SESSION_VIDEO = False

# Session processing workflow mode
WORKFLOW_MODE = "record_n_plan"  # Options: "default", "record_n_plan"

ENABLE_TRANSITION_ANALYSIS = False
ENABLE_VIDEO_SLICING = False


# Ensure required directories exist
def ensure_directories():
    """Create necessary directories if they don't exist"""
    os.makedirs(APK_DIR, exist_ok=True)
    os.makedirs(DOWNLOADS_DIR, exist_ok=True)
