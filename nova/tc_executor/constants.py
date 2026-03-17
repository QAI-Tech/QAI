from time import gmtime, strftime
from tc_executor.logger_config import logger as system_logger
import os
#from tc_executor.algos.vision.emulator_cropper.emulatorCropper import locateEmulator

""" !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    For now keeping the following parameter in constants.py file
    in future, handle it differently
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! """
IS_LOCAL=False
DYNAMICALLY_LOCATE_EMULATOR = False
CLIENT = "Faircado"

DATE_NOW = strftime("%Y%m%d", gmtime())
TIME_NOW = strftime("%H%M%S", gmtime())
EMAIL_ID = f'qai_agent_{CLIENT}_{DATE_NOW}_{TIME_NOW}@yopmain.com'
PASSWORD = f'Ag@{TIME_NOW}'
USERNAME = f'Ag{DATE_NOW[3:]}{TIME_NOW[:4]}'
system_logger.info(f'TIME NOW - {TIME_NOW}')
system_logger.info(f'DATE NOW - {DATE_NOW}')
system_logger.info(f'EMAIL ID - {EMAIL_ID}')
system_logger.info(f'PASSWORD - {PASSWORD}')
system_logger.info(f'USERNAME - {USERNAME}')

# BACKTRACKER
BACKTRACKER_IMAGE_MATCHING_THRESHOLD = 0.98

# EXECUTOR - x, y, w, h
EXECUTOR_WEAK_BOUNDARY_COORDINATES = 200, 200, 900, 1600
EXECUTOR_HARD_BOUNDRY_COORDINATES = 36, 100, 650, 1400
if DYNAMICALLY_LOCATE_EMULATOR == False:
    EXECUTOR_REMOTE_DESKTOP_EMULATOR_COORDINATES = 100, 101, 348, 654
else:
    EXECUTOR_REMOTE_DESKTOP_EMULATOR_COORDINATES = locateEmulator()

# ANTHROPIC
ANTHROPIC_API_KAY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = "claude-3-7-sonnet-20250219"

# GOOGLE
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "236141506463")
#GEMINI_MODEL_NAME = "gemini-1.5-pro"
GEMINI_MODEL_NAME = "gemini-2.5-flash"
SENTRY_DSN = "https://74d302a3edaf61d0f9ac6276e5dacd36@o4509196591366144.ingest.de.sentry.io/4509525635629136"

# PRE-EXECUTED STEPS
SM_REMEMBERED_SCREEN_MATCHING_THRESHOLD = 0.98
BUCKET_NAME = "nova_assets"
PROD_BUCKET_PREFIX = "-prod"
PRODUCTION_ENVIRONMENT = "production"
