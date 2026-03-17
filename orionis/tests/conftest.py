import os
import sys
import pytest

# Add the src directory to Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../src")))


# Set up environment variables before any tests or imports happen
os.environ["ENVIRONMENT"] = "staging"

os.environ["PATH_TO_GCP_CREDS_STAGING"] = "/fake/path/to/creds.json"
os.environ["GCP_PROJECT_ID_STAGING"] = "fake-project-id"
os.environ["REMOVED"] = "fake-api-key"
os.environ["CLERK_JWKS_URL_STAGING"] = "https://fake.clerk.com/jwks"
os.environ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY_STAGING"] = "fake-pub-key"
os.environ["CLERK_SECRET_KEY_STAGING"] = "fake-secret-key"
os.environ["HMAC_SECRET_KEY_STAGING"] = "fake-hmac-key"

os.environ["PATH_TO_GCP_CREDS_PRODUCTION"] = "/fake/path/to/creds.json"
os.environ["GCP_PROJECT_ID_PRODUCTION"] = "fake-project-id"
os.environ["REMOVED"] = "fake-api-key"
os.environ["CLERK_JWKS_URL_PRODUCTION"] = "https://fake.clerk.com/jwks"
os.environ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY_PRODUCTION"] = "fake-pub-key"
os.environ["CLERK_SECRET_KEY_PRODUCTION"] = "fake-secret-key"
os.environ["HMAC_SECRET_KEY_PRODUCTION"] = "fake-hmac-key"
os.environ["NOTIFICATION_WEBHOOK_URL"] = "https://fake.webhook.url"
os.environ["TEST_RUN_UPDATE_WEBHOOK_URL"] = "https://fake.test.run.webhook.url"
os.environ["CUSTOMER_COMMENTS_WEBHOOK_URL"] = (
    "https://fake.customer.comments.webhook.url"
)
os.environ["SENTRY_DSN_URL"] = "https://fake.sentry.dsn.url"
os.environ["TCS_FROM_FLOW_TIMEOUT_MINS"] = "7"
os.environ["ENABLE_SHARDING_FOR_KG_FLOW_ANALYZER"] = "true"
os.environ["ENABLE_NEW_VIDEO_TO_FLOW"] = "false"
os.environ["JIRA_ENCRYPTION_KEY"] = "fake-jira-encryption-key"
os.environ["STRIPE_SECRET_KEY_STAGING"] = "fake-stripe-secret-key"
os.environ["REMOVED"] = "fake-stripe-webhook-secret"
os.environ["REMOVED"] = "fake-stripe-secret-key"
os.environ["REMOVED"] = "fake-stripe-webhook-secret"


@pytest.fixture(autouse=True)
def cleanup_env():
    """Clean up environment variables after each test."""
    yield
    env_vars = [
        "PATH_TO_GCP_CREDS_STAGING",
        "GCP_PROJECT_ID_STAGING",
        "REMOVED",
        "CLERK_JWKS_URL_STAGING",
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY_STAGING",
        "CLERK_SECRET_KEY_STAGING",
        "HMAC_SECRET_KEY_STAGING",
        "PATH_TO_GCP_CREDS_PRODUCTION",
        "GCP_PROJECT_ID_PRODUCTION",
        "REMOVED",
        "CLERK_JWKS_URL_PRODUCTION",
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY_PRODUCTION",
        "CLERK_SECRET_KEY_PRODUCTION",
        "HMAC_SECRET_KEY_PRODUCTION",
        "NOTIFICATION_WEBHOOK_URL",
        "TEST_RUN_UPDATE_WEBHOOK_URL",
        "CUSTOMER_COMMENTS_WEBHOOK_URL",
        "SENTRY_DSN_URL",
        "TCS_FROM_FLOW_TIMEOUT_MINS",
        "ENABLE_NEW_VIDEO_TO_FLOW",
        "JIRA_ENCRYPTION_KEY",
        "STRIPE_SECRET_KEY_STAGING",
        "REMOVED",
        "REMOVED",
        "REMOVED",
    ]
    for var in env_vars:
        if var in os.environ:
            del os.environ[var]
