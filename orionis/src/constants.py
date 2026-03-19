from config import Config, config
from enum import Enum
import os


class ModeType(str, Enum):
    FORMAT_BUSINESS_LOGIC = "FORMAT_BUSINESS_LOGIC"


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

    # Field Names
    FIELD_NOVA = "NOVA"
    FIELD_PRODUCT_NAME = "product_name"
    FIELD_USER_ID = "user_id"
    FIELD_ORGANISATION_ID = "organisation_id"
    FIELD_FIRST_NAME = "first_name"
    FIELD_LAST_NAME = "last_name"
    FIELD_EMAIL = "email"
    FIELD_AUTH_PROVIDER = "auth_provider"
    FIELD_PROVIDER = "provider"
    FIELD_EXTERNAL_ACCOUNTS = "external_accounts"
    FIELD_OAUTH_GOOGLE = "oauth_google"
    FIELD_ROLES = "roles"
    FIELD_ADMIN_ROLE = "Admin"
    FIELD_EMAIL_ADDRESSES = "email_addresses"
    FIELD_EMAIL_ADDRESS = "email_address"
    FIELD_USAGE_TOKEN_BALANCE = "usage_token_balance"
    FIELD_TEST_CASE_ID = "test_case_id"
    FIELD_TEST_CASE_IDS = "test_case_ids"
    FIELD_TEST_CASE_UNDER_EXECUTION_IDS = "test_case_under_execution_ids"
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
    FIELD_SCENARIOS = "scenarios"
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
    FIELD_ORGANISATION_NAME = "organisation_name"
    FIELD_USER = "user"
    FIELD_PRODUCT = "product"
    FIELD_TEST_RUN = "test_run"
    FIELD_GMAIL = "GMAIL"
    FIELD_PLATFORM_TYPE = "platform"
    AUTH_PROVIDER_EMAIL = "EMAIL"
    FIELD_USERS = "users"
    FIELD_PARAMETERS = "parameters"
    FIELD_CREDENTIALS = "credentials"
    FIELD_COMMENTS = "comments"
    FIELD_CRITICALITY = "criticality"
    FIELD_DEFAULT_CREDENTIALS = "default_credentials"
    FIELD_CREDENTIALS_ID = "credentials_id"
    FIELD_DEFAULT_CREDENTIALS_ID = "default_credentials_id"
    FIELD_BUILD_NUMBER = "build_number"
    FIELD_OWNER_ROLE = "Owner"
    FIELD_TESTER_ROLE = "Tester"
    FIELD_FEATURES = "features"
    FIELD_ID = "id"
    FIELD_SORT_INDEX = "sort_index"
    FIELD_TEST_CASE_STATUS_FAILED = "FAILED"
    FIELD_TEST_CASE_STATUS_PASSED = "PASSED"
    FIELD_TEST_CASE_STATUS_UNTESTED = "UNTESTED"
    FIELD_TEST_RUN_RECEIVING_EMAIL = "qa-team@qaitech.ai"
    FIELD_TITLE = "title"
    FIELD_METADATA = "metadata"
    FIELD_FLOW_ID = "flow_id"
    TRANSLATION_TCUE_STEP_DESCRIPTION = (
        "Verify the correctness of translations on all screens."
    )
    TRANSLATION_TCUE_STEP_EXPECTED_RESULTS = [
        "All text elements on all screens have correct translations in the target language."
    ]
    TRANSLATION_TCUE_DESCRIPTION = (
        "Verify that all CTAs, interactive elements, labels, and descriptions have correct "
        "translations in the target language with respect to grammar, punctuation, "
        "contextual correctness."
    )

    if config.environment == Config.STAGING:
        SUPER_USER_ORG_IDS = ["5629659324612608"]
        QA_SANDBOX_ORG_IDS = [
            "5685332821409792",
            "5760531424083968",
            "5678198209642496",
            "5717630740594688",
            "5766487469981696",
            "5654589445505024",
            "5712408328798208",
            "6222023378337792",
            "5189973137424384",
        ]
    else:
        SUPER_USER_ORG_IDS = ["5650266825162752"]
        QA_SANDBOX_ORG_IDS = ["5669669566414848"]

    # URL
    GOOGLE_CLOUD_STORAGE_URL_PREFIX = "https://storage.cloud.google.com/"
    GOOGLE_CLOUD_STORAGE_URI_PREFIX = "gs://"
    DOMAIN_TEST_RUN_LINK = "https://app.qaitech.ai/test-runs/"
    DOMAIN = (
        "https://app.qaitech.ai"
        if config.environment == Config.PRODUCTION
        else "https://nebula-236141506463.europe-west3.run.app"
    )

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
    GEMINI_MODEL_NAME_V3 = "gemini-2.5-flash"
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

    GRAPH_EDITOR_BUCKET_NAME = (
        "graph-editor-prod"
        if config.environment == Config.PRODUCTION
        else "graph-editor"
    )

    GRAPH_COLLAB_API_URL = (
        "https://graphcollab-prod.qaitech.ai"
        if config.environment == Config.PRODUCTION
        else "http://127.0.0.1:8001"
    )

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
    USER_GOAL_TASK_QUEUE_NAME = "user-goal-task-queue"
    FLOW_PROCESSING_TASK_QUEUE_NAME = "flow-processing-task-queue"
    NOVA_EXECUTION_REQUEST_TOPIC_NAME = "nova-execution"
    NOVA_WEB_EXECUTION_REQUEST_TOPIC_NAME = "nova-web-execution-queue"
    SUPPORTED_GOAL_PLANNING_PLATFORMS = frozenset(["WEB", "ANDROID"])

    # Status Codes
    HTTP_STATUS_OK = 200
    HTTP_STATUS_BAD_REQUEST = 400
    HTTP_STATUS_UNAUTHORIZED = 401
    HTTP_STATUS_FORBIDDEN = 403
    HTTP_STATUS_NOT_FOUND = 404
    HTTP_STATUS_METHOD_NOT_ALLOWED = 405
    HTTP_STATUS_INTERNAL_SERVER_ERROR = 500

    # Nova Execution Mode
    MONKEY_RUN = "MONKEY_RUN"
    GOAL_FORMULATION_AND_EXECUTION = "GOAL_FORMULATION_AND_EXECUTION"
    EXECUTION = "EXECUTION"

    # Month Names
    MONTH_NAMES = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ]

    # TCUE Billable Statuses - Only these statuses are billed to customers
    TCUE_BILLABLE_STATUSES = ["PASSED", "FAILED"]

    # Gmail Configuration
    if config.environment == Config.STAGING:
        INVITE_LINK = "https://nebula-236141506463.europe-west3.run.app/sign-up?invite={encoded_string}"
        GMAIL_SUBJECT_TEMPLATE = "Hey {name}, You're Invited to QAI Staging!"
    else:
        INVITE_LINK = "https://app.qaitech.ai/sign-up?invite={encoded_string}"
        GMAIL_SUBJECT_TEMPLATE = "Hey {name}, You're Invited!"
    GMAIL_DELEGATED_USER = "no-reply@qaitech.co"
    GMAIL_SCOPE_SEND = "https://www.googleapis.com/auth/gmail.send"
    GMAIL_BODY_TEMPLATE = """Hi {name},

{user_name} has invited you to join their organisation on QAI. Click the link below to sign up:
{invite_link}

Best Regards,
Team QAI
"""
