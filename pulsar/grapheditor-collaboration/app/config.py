import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Server configuration
DEFAULT_PORT = 8001
DEFAULT_HOST = "0.0.0.0"

# Room configuration
ROOM_CLEANUP_DELAY = 60  # 1 minute in seconds
MAX_USERS_PER_ROOM = 100  # Maximum users per collaboration room

# Directory paths
LOGS_DIR = "logs"
TEMP_DIR = "temp"
PERSISTENCE_DIR = "persistence"

# Persistence configuration
AUTO_SAVE_INTERVAL = 30  # seconds
MAX_OPERATIONS_BEFORE_SAVE = 50  # operations before forced save
STATE_HISTORY_LIMIT = 100  # max operations to keep in memory
CLEANUP_AFTER_HOURS = 24  # hours after which to clean up old room files

# Enable debug mode
DEBUG_MODE = True

# Google Cloud Storage configuration
GCS_BUCKET_DEV = "graph-editor"
GCS_BUCKET_PROD = "graph-editor-prod"
GCS_PROJECT_ID = os.getenv("GCP_PROJECT_ID")
GCS_SERVICE_ACCOUNT_PATH = os.getenv("GCP_SERVICE_ACCOUNT_PATH", "gcp-service-account.json")

# Environment configuration
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")  # development or production


# Ensure required directories exist
def ensure_directories():
    """Create necessary directories if they don't exist"""
    os.makedirs(LOGS_DIR, exist_ok=True)
    os.makedirs(TEMP_DIR, exist_ok=True)
    os.makedirs(PERSISTENCE_DIR, exist_ok=True)
