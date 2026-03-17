
import os

class Constants:
    # Media Types
    MEDIA_TYPE_VIDEO = "VIDEO"
    MEDIA_TYPE_SCREENSHOTS = "SCREENSHOTS"

    # Entity Kinds
    ENTITY_KIND_USER = "User"
    ENTITY_KIND_PRODUCT = "Product"
    ENTITY_KIND_USER_FEEDBACK = "UserFeedback"
    ENTITY_TEST_CASE = "TestCase"
    ENTITY_RAW_TEST_CASE = "RawTestCase"
    ENTITY_KIND_TEST_RUN = "TestRun"
    ENTITY_TEST_CASE_REQUEST = "request_entity"
    ENTITY_KIND_TEST_CASE_GENERATION_REQUEST = "TestCaseGenerationRequest"

    # Field Names
    FIELD_PRODUCT_NAME = "product_name"
    FIELD_USER_ID = "user_id"
    FIELD_ORGANISATION_ID = "organisation_id"
    FIELD_FIRST_NAME = "first_name"
    FIELD_LAST_NAME = "last_name"
    FIELD_EMAIL = "email"
    FIELD_AUTH_PROVIDER = "auth_provider"
    FIELD_ROLES = "roles"
    FIELD_EMAIL_ADDRESSES = "email_addresses"
    FIELD_EMAIL_ADDRESS = "email_address"
    FIELD_USAGE_TOKEN_BALANCE = "usage_token_balance"
    FIELD_TEST_CASE_ID = "test_case_id"
    FIELD_PRODUCT_ID = "product_id"
    FIELD_STATUS = "status"
    FIELD_FEEDBACK_ID = "feedback_id"
    FIELD_DESCRIPTION = "description"
    FIELD_SUBMITTED_TIMESTAMP = "submitted_timestamp"
    FIELD_TEST_RUN_ID = "test_run_id"
    FIELD_CREATED_BY_USER_ID = "created_by_user_id"
    FIELD_UPDATED_AT = "updated_at"
    FIELD_CREATED_AT = "created_at"
    FIELD_TEST_CASES = "test_cases"
    FIELD_VIDEO_URI = "video_uri"
    FIELD_URI = "uri"
    FIELD_STATUS_CODE = "status_code"
    FIELD_AUTH_PROVIDER_USER_ID = "auth_provider_user_id"
    FIELD_TEST_CASE_TYPE = "test_case_type"
    FIELD_SCREENSHOT_URL = "screenshot_url"
    FIELD_PRECONDITIONS = "preconditions"
    FIELD_SCREENSHOT_INDEX = "screenshot_index"
    FIELD_TEST_CASE_DETAILS = "test_case_details"
    FIELD_TEST_CASE_STATUS = "status"
    FIELD_TEST_CASE_PRECONDITIONS = "preconditions"
    FIELD_TEST_STEP_EXP_RESULTS = "expected_results"
    FIELD_TEST_CASE_DESCRIPTION = "test_case_description"
    FIELD_TEST_STEP_ID = "test_step_id"
    FIELD_TEST_STEP_DESCRIPTION = "step_description"
    FIELD_EXPECTED_STEP_RESULTS = "expected_step_results"
    FIELD_RELATED_TAGS = "related_tags"
    FIELD_TEST_CASE_STEPS = "test_case_steps"
    FIELD_TEST_CASE_STEP_NUMBER = "step_number"
    FIELD_RUN_ID = "run-id"
    FIELD_STRUCTURED_TEST_CASES = "structured-test-cases"
    FIELD_JWKS_KEYS = "keys"
    FIELD_KID = "kid"
    FIELD_UI_ELEMENTS = "UI_elements"
    FIELD_REQUEST_ID = "request_id"
    FIELD_COMPLETED_AT = "completed_at"
    FIELD_RESULT = "result"
    FIELD_WEB_URL = "web_url"
    FIELD_GOOGLE_PLAY_STORE_URL = "google_play_store_url"
    FIELD_APPLE_APP_STORE_URL = "apple_app_store_url"
    FIELD_RELATED_PRODUCTS = "related_products"
    FIELD_FEATURE_ID = "feature_id"
    FIELD_UNKNOWN = "Unknown"
    FIELD_SHOULD_CALL_VERTEXAI = "SHOULD_CALL_VERTEXAI"
    FIELD_FUNCTIONALITY_ID = "functionality_id"
    FIELD_DEVICE_ID = "device_id"
    FIELD_ASSIGNEE_USER_ID = "assignee_user_id"
    FIELD_EXECUTION_VIDEO_URL = "execution_video_url"
    FIELD_NOTES = "notes"
    FIELD_EXECUTION_STARTED_AT = "execution_started_at"
    FIELD_EXECUTION_COMPLETED_AT = "execution_completed_at"
    FIELD_FUNCTIONALITY_ID = "functionality_id"
    FIELD_RATIONALE = "rationale"
    FIELD_TEST_CASE_CREATED_AT = "test_case_created_at"
    FIELD_ORGANISATION_IDS = "organisation_ids"
    FIELD_TEST_RUN_NAME = "test_run_name"
    FIELD_EXECUTABLE_URL = "executable_url"
    FIELD_ORGANISATION = "organisation"
    FIELD_PRODUCT = "product"
    FIELD_TEST_RUN = "test_run"

    # URL
    GOOGLE_CLOUD_STORAGE_URL_PREFIX = "https://storage.cloud.google.com/"
    GOOGLE_CLOUD_STORAGE_URI_PREFIX = "gs://"
    DOMAIN_TEST_RUN_LINK = "https://app.qaitech.ai/test-runs/"

    # Organisation ID
    QAI_ORG_ID = "5128736865255424"

    # Default Auth Provider
    DEFAULT_AUTH_PROVIDER = "GMAIL"

    # Usage Token
    DEFAULT_USAGE_TOKEN = 10

    # Server URLs
    DEVELOPMENT_SERVER_URL = "http://localhost:3000"
    PRODUCTION_SERVER_URL = ""

    # Bucket Name
    PRODUCT_EXECUTION_VIDEO_STORE = "product_video_store_demo_v1"
    EXCEL_BUCKET_NAME = "test_cases_excel"

    # Gemini Model Configuration
    GEMINI_MODEL_NAME_V2 = "gemini-2.0-flash-001"
    TEMPERATURE = 0
    TOP_P = 1.0
    TOP_K = 40
    MAX_OUTPUT_TOKENS = 8192
    RESPONSE_MIME_TYPE = "application/json"

    # Clerk API Details
    CLERK_API_BASE_URL = "https://api.clerk.com"
    FIELD_USER_ID_CLAIM = "sub"

    # Token Details
    FIELD_TOKEN = "session_token"
    TOKEN_EXP_TIME_SECONDS = 2592000

    # Figma API Details
    FIGMA_API_BASE_URL = "https://api.figma.com/v1/"
    FIGMA_API_TOKEN = os.environ.get("FIGMA_API_TOKEN", "")
    FIGMA_FILE_ID = "C6cO5JKbDlsKA7k3Uv53ZI"
    FIGMA_ASPECT_MIN_RATIO = 0.20
    FIGMA_ASPECT_MAX_RATIO = 0.79
    FIGMA_FIELD_TYPE = "type"
    FIGMA_FIELD_FRAME = "FRAME"
    FIGMA_FIELD_ABSOLUTE_BOUNDING_BOX = "absoluteBoundingBox"
    FIGMA_FIELD_WIDTH = "0"
    FIGMA_FIELD_HEIGHT = "0"
    FIGMA_FIELD_CHILDREN = "children"
    FIGMA_FIELD_DOCUMENT = "document"
    FIGMA_FIELD_ID = "id"

    # Request status
    REQUEST_QUEUED = "QUEUED"
    REQUEST_PROCESSING = "PROCESSING"
    REQUEST_COMPLETED = "COMPLETED"
    REQUEST_FAILED = "FAILED"

    # Cloud tasks
    FUNCTION_NAME = "ProcessTestCaseGeneration"
    GCP_REGION = "europe-west3"
    TASK_QUEUE_NAME = "test-case-generation-queue"
    SMOKE_TESTS_TASK_QUEUE_NAME = "smoke-test-planning-queue"

    # Status Codes
    HTTP_STATUS_OK = 200
    HTTP_STATUS_BAD_REQUEST = 400
    HTTP_STATUS_UNAUTHORIZED = 401
    HTTP_STATUS_NOT_FOUND = 404
    HTTP_STATUS_METHOD_NOT_ALLOWED = 405
    HTTP_STATUS_INTERNAL_SERVER_ERROR = 500

